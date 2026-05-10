import { describePassiveForUi, describeSkillEffectForUi } from '@/components/battle/battleDisplay'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import { PASS_ABILITY_ID } from '@/features/battle/data'
import { getAbilityById, getFighterById, isAlive } from '@/features/battle/engine'
import type { BattleAbilityIcon, BattleState, BattleTeamId, QueuedBattleAction } from '@/features/battle/types'

// ── Type definitions ──────────────────────────────────────────────────────────

export type ActiveEffectKind =
  | 'command'     // selected skill being executed this turn
  | 'scheduled'   // BattleScheduledEffect due this phase
  | 'passive'     // onRoundStart / onRoundEnd passive trigger
  | 'reaction'    // counter / reflect / trap that fires reactively
  | 'expiration'  // status/modifier reaching end of duration, if player-visible
  | 'dot'         // source-attributed damage-over-time tick

export type ActiveEffectTiming =
  | 'preTurn'    // fires before the main action window (roundStart phase)
  | 'onAction'   // fires as part of an actor's command this turn
  | 'onReaction' // fires in response to a specific trigger event
  | 'postTurn'   // fires after all commands resolve (roundEnd phase)

export type ActiveEffectTriggerType =
  | 'guaranteed'  // fires unconditionally
  | 'conditional' // fires only if a runtime check passes
  | 'reactive'    // fires only if a specific prior event occurs

export type ActiveEffectInstance = {
  // Identity
  id: string
  kind: ActiveEffectKind

  // Ownership — sourceActorId is required; no orphaned entries
  ownerTeam: BattleTeamId
  sourceActorId: string
  sourceAbilityId?: string
  sourcePassiveId?: string

  // Display
  sourceIcon: { src?: string; label: string; tone: BattleAbilityIcon['tone'] }
  label: string
  targetIds: string[]
  summary: string

  // Timing and resolution
  timing: ActiveEffectTiming
  triggerType: ActiveEffectTriggerType

  // Queue interaction
  draggable: boolean
  locked: boolean
  lockReason?: string

  // Resolution payload — one of these is populated depending on kind
  scheduledEffectId?: string  // kind === 'scheduled'
  commandActorId?: string     // kind === 'command'
  resolveInline?: boolean     // kind === 'passive' | 'reaction'
}

// ── Resolution order type ─────────────────────────────────────────────────────

/**
 * A single slot in the player-chosen resolution order.
 * Only 'command' and eligible 'scheduled' entries are interleavable.
 * Passive and reaction entries never appear here.
 *
 * NOTE: Not included in multiplayer commit payload until the server supports
 * interleaved resolution. See BattlePage.resolveQueuedRound.
 */
export type QueueOrderEntry =
  | { kind: 'command';   actorId: string }
  | { kind: 'scheduled'; scheduledEffectId: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when every condition uses an unsatisfiable __never_* key (display-only passive). */
function isDisplayOnlyPassive(passive: { conditions?: Array<{ type: string; key?: string }> }): boolean {
  if (!passive.conditions || passive.conditions.length === 0) return false
  return passive.conditions.every(
    (c) => c.type === 'counterAtLeast' && typeof c.key === 'string' && c.key.startsWith('__never_'),
  )
}

function describeReactionTrigger(guard: { kind: string; trigger?: string; counterDamage?: number }): string {
  if (guard.kind === 'counter') return `Counters attacker for ${guard.counterDamage ?? 0} damage`
  if (guard.kind === 'reflect') return 'Reflects skill back to attacker'
  switch (guard.trigger) {
    case 'onBeingTargeted': return 'Triggers when targeted'
    case 'onAbilityUse': return 'Triggers when target uses a skill'
    case 'onDamageApplied': return 'Triggers when damage is applied'
    case 'onDamageBlocked': return 'Triggers when damage is blocked'
    case 'onShieldBroken': return 'Triggers when shield breaks'
    case 'onDefeat': return 'Triggers on defeat'
    case 'onDefeatEnemy': return 'Triggers on defeating an enemy'
    default: return 'Triggers reactively'
  }
}

function buildEffectSummary(effects: Parameters<typeof describeSkillEffectForUi>[0][]): string {
  const parts = effects.map((e) => {
    const raw = describeSkillEffectForUi(e)
    return raw.charAt(0).toLowerCase() + raw.slice(1)
  })
  if (parts.length === 0) return 'resolves'
  if (parts.length === 1) return parts[0]
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
}

function resolveAbilityIcon(
  state: BattleState,
  abilityId: string | undefined,
): { src?: string; label: string; tone: BattleAbilityIcon['tone'] } {
  if (!abilityId) return { label: 'FX', tone: 'teal' }
  const allFighters = state.playerTeam.concat(state.enemyTeam)
  for (const fighter of allFighters) {
    const ability = getAbilityById(fighter, abilityId)
    if (ability) {
      return {
        src: normalizeBattleAssetSrc(ability.icon.src) ?? undefined,
        label: ability.icon.label,
        tone: ability.icon.tone,
      }
    }
  }
  return { label: 'FX', tone: 'teal' }
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds the canonical queue preview for the current turn window.
 *
 * Supported kinds:
 *   - 'scheduled' — due roundStart BattleScheduledEffects (preTurn, draggable)
 *   - 'passive'   — onRoundStart passive effects (preTurn, locked)
 *   - 'reaction'  — active counter/reflect/reaction guards (onReaction, locked)
 *   - 'command'   — selected queued player skills (onAction, draggable)
 *
 * Every entry returned has a non-empty sourceActorId.
 */
export function buildQueuePreview(
  state: BattleState,
  queuedActions: Record<string, QueuedBattleAction>,
): ActiveEffectInstance[] {
  const entries: ActiveEffectInstance[] = []
  const allFighters = state.playerTeam.concat(state.enemyTeam)

  // ── 1. Due roundStart scheduled effects ─────────────────────────────────────
  for (const scheduled of state.scheduledEffects) {
    if (scheduled.dueRound !== state.round || scheduled.phase !== 'roundStart') continue

    const actor = getFighterById(state, scheduled.actorId)
    if (!actor) continue  // no actor → cannot be source-owned; skip

    let label = 'Scheduled Effect'
    if (scheduled.abilityId) {
      for (const fighter of allFighters) {
        const ability = getAbilityById(fighter, scheduled.abilityId)
        if (ability) { label = ability.name; break }
      }
    }

    entries.push({
      id: `scheduled-${scheduled.id}`,
      kind: 'scheduled',
      ownerTeam: actor.team,
      sourceActorId: actor.instanceId,
      sourceAbilityId: scheduled.abilityId,
      sourceIcon: resolveAbilityIcon(state, scheduled.abilityId),
      label,
      targetIds: scheduled.targetIds,
      summary: buildEffectSummary(scheduled.effects),
      timing: 'preTurn',
      triggerType: 'guaranteed',
      draggable: true,
      locked: false,
      scheduledEffectId: scheduled.id,
    })

  }

  // ── 2. onRoundStart passive entries ─────────────────────────────────────────
  for (const fighter of allFighters) {
    if (!isAlive(fighter)) continue
    for (const passive of fighter.passiveEffects ?? []) {
      if (passive.trigger !== 'onRoundStart') continue
      if (passive.hidden) continue
      if (isDisplayOnlyPassive(passive)) continue

      const icon = passive.icon
      entries.push({
        id: `passive-${fighter.instanceId}-${passive.id ?? passive.label}`,
        kind: 'passive',
        ownerTeam: fighter.team,
        sourceActorId: fighter.instanceId,
        sourcePassiveId: passive.id,
        sourceIcon: {
          src: normalizeBattleAssetSrc(icon?.src) ?? undefined,
          label: icon?.label ?? passive.label.slice(0, 2).toUpperCase(),
          tone: icon?.tone ?? 'teal',
        },
        label: passive.label,
        targetIds: [],
        summary: describePassiveForUi(passive),
        timing: 'preTurn',
        triggerType: 'guaranteed',
        draggable: false,
        locked: true,
      })
    }
  }

  // ── 3. Active reaction guards ────────────────────────────────────────────────
  for (const fighter of allFighters) {
    for (const guard of fighter.reactionGuards) {
      if (guard.remainingRounds <= 0) continue
      if (!guard.sourceActorId) continue  // no source → cannot be source-owned; skip
      if (guard.kind === 'effect' && guard.visible === false) continue

      entries.push({
        id: `reaction-${guard.id}`,
        kind: 'reaction',
        ownerTeam: fighter.team,
        sourceActorId: guard.sourceActorId,
        sourceAbilityId: guard.sourceAbilityId,
        sourceIcon: resolveAbilityIcon(state, guard.sourceAbilityId),
        label: guard.label,
        targetIds: [],
        summary: describeReactionTrigger(guard),
        timing: 'onReaction',
        triggerType: 'reactive',
        draggable: false,
        locked: true,
        lockReason: 'Triggers reactively',
      })
    }
  }

  // ── 4. Queued commands ───────────────────────────────────────────────────────
  for (const command of Object.values(queuedActions)) {
    if (command.team !== 'player') continue
    if (command.abilityId === PASS_ABILITY_ID) continue

    const actor = getFighterById(state, command.actorId)
    if (!actor) continue

    const ability = getAbilityById(actor, command.abilityId)
    if (!ability) continue

    const targetIds: string[] = command.targetId ? [command.targetId] : []

    entries.push({
      id: `command-${command.actorId}`,
      kind: 'command',
      ownerTeam: actor.team,
      sourceActorId: actor.instanceId,
      sourceAbilityId: ability.id,
      sourceIcon: {
        src: normalizeBattleAssetSrc(ability.icon.src) ?? undefined,
        label: ability.icon.label,
        tone: ability.icon.tone,
      },
      label: ability.name,
      targetIds,
      summary: buildEffectSummary(ability.effects ?? []),
      timing: 'onAction',
      triggerType: 'guaranteed',
      draggable: true,
      locked: false,
      commandActorId: actor.instanceId,
    })
  }

  return entries
}
