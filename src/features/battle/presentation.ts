/**
 * Battle presentation queue builder.
 *
 * Pure function — no React, no timers, no DOM, no state mutation.
 * Converts a resolved BattleTimelineStep[] into an ordered list of
 * BattlePresentationItem frames that the playback hook steps through.
 *
 * Each timeline step produces:
 *   1. An action-start frame (ability name + actor/target IDs) if the step
 *      has an actor and ability.
 *   2. One frame per significant runtime event (damage, heal, status, defeat,
 *      round transitions, victory).
 *   3. A state-commit frame that carries the step's resolved BattleState.
 *
 * The final frame of the entire queue is always a state-commit referencing
 * the last step's state, so the caller can rely on it as the source of truth.
 */

import type { BattleFighterState, BattleState, BattleTimelineStep } from '@/features/battle/types'

// ── Presentation item kinds ───────────────────────────────────────────────────

export type BattlePresentationKind =
  | 'action-start'
  | 'ability'
  | 'target-highlight'
  | 'damage'
  | 'heal'
  | 'status'
  | 'resource'
  | 'defeat'
  | 'round-start'
  | 'round-end'
  | 'victory'
  | 'state-commit'
  | 'pause'

// ── Presentation item ─────────────────────────────────────────────────────────

export type BattlePresentationItem = {
  id: string
  kind: BattlePresentationKind
  /** Actor instanceId for board highlight. */
  actorId?: string
  /** Primary target instanceId for board highlight. */
  targetId?: string
  /** Ability id for strip highlight. */
  abilityId?: string
  /** 'player' | 'enemy' */
  team?: string
  /** Numeric payload (damage dealt, HP healed, etc.). */
  amount?: number
  /** Human-readable label for the banner. */
  message: string
  /** Banner colour tone, mirrors BattleTimelineFocus. */
  tone: 'red' | 'teal' | 'gold' | 'frost'
  /**
   * Resolved BattleState — only set on state-commit items.
   * The playback hook commits this to React state when it processes
   * a state-commit item, keeping state changes synchronised with
   * their matching visual frame.
   */
  commitState?: BattleState
}

// ── Queue type ────────────────────────────────────────────────────────────────

export type BattlePresentationQueue = BattlePresentationItem[]

// ── Internal counter for unique IDs ──────────────────────────────────────────

let _seq = 0
function nextId(kind: BattlePresentationKind): string {
  return `pres-${kind}-${++_seq}`
}

// ── Name resolution ───────────────────────────────────────────────────────────

/** Find a fighter by instanceId across both teams in the given state. */
function findFighter(state: BattleState, instanceId: string): BattleFighterState | undefined {
  return (
    state.playerTeam.find((f) => f.instanceId === instanceId) ??
    state.enemyTeam.find((f) => f.instanceId === instanceId)
  )
}

/**
 * Resolve a human-readable ability name for an action-start frame.
 *
 * Resolution order:
 *   1. Look up actor in step.state, then find the ability by id in
 *      actor.abilities (regular skills) or actor.ultimate.
 *   2. Fall back to the message of the first BattleEvent in the step that
 *      belongs to this actor (these are already human-readable).
 *   3. Fall back to the raw abilityId string.
 */
export function resolveAbilityName(step: BattleTimelineStep): string {
  const { actorId, abilityId, state, events } = step
  if (!actorId || !abilityId) return abilityId ?? ''

  const actor = findFighter(state, actorId)
  if (actor) {
    const regular = actor.abilities.find((a) => a.id === abilityId)
    if (regular) return regular.name
    if (actor.ultimate.id === abilityId) return actor.ultimate.name
  }

  // Fall back to the first event message for this actor.
  const actorEvent = events.find((e) => e.actorId === actorId)
  if (actorEvent?.message) return actorEvent.message

  return abilityId
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Convert a resolved BattleTimelineStep[] into a BattlePresentationQueue.
 * Returns an empty array for empty input.
 */
export function buildPresentationQueue(
  timelineSteps: BattleTimelineStep[],
): BattlePresentationQueue {
  if (timelineSteps.length === 0) return []

  const queue: BattlePresentationQueue = []

  for (const step of timelineSteps) {
    const stepItems: BattlePresentationItem[] = []

    // ── 1. Round-start frame ────────────────────────────────────────────────
    if (step.kind === 'roundStart') {
      stepItems.push({
        id: nextId('round-start'),
        kind: 'round-start',
        message: `ROUND ${step.state.round}`,
        tone: 'frost',
      })
    }

    // ── 2. Action-start frame ───────────────────────────────────────────────
    //    Emit before the state commit so the actor is highlighted while HP
    //    still shows its pre-action value.
    if (step.kind === 'action' && step.actorId && step.abilityId) {
      const abilityName = resolveAbilityName(step)

      stepItems.push({
        id: nextId('action-start'),
        kind: 'action-start',
        actorId: step.actorId,
        targetId: step.targetId,
        abilityId: step.abilityId,
        team: step.team,
        message: abilityName.toUpperCase(),
        tone: step.team === 'enemy' ? 'red' : 'teal',
      })
    }

    // ── 3. Per-runtime-event frames ─────────────────────────────────────────
    for (const ev of step.runtimeEvents) {
      switch (ev.type) {
        case 'damage_applied': {
          const dmg =
            ev.amount ??
            (ev.packet?.kind === 'damage' ? ev.packet.amount : undefined)
          if (dmg != null && dmg > 0) {
            stepItems.push({
              id: nextId('damage'),
              kind: 'damage',
              actorId: ev.actorId ?? (ev.packet?.kind === 'damage' ? ev.packet.sourceActorId : undefined),
              targetId: ev.targetId,
              abilityId: ev.abilityId,
              team: ev.team,
              amount: dmg,
              message: `${dmg} DAMAGE`,
              tone: 'red',
            })
          }
          break
        }

        case 'heal_applied': {
          const hp =
            ev.amount ??
            (ev.packet?.kind === 'heal' ? ev.packet.amount : undefined)
          if (hp != null && hp > 0) {
            stepItems.push({
              id: nextId('heal'),
              kind: 'heal',
              actorId: ev.actorId ?? (ev.packet?.kind === 'heal' ? ev.packet.sourceActorId : undefined),
              targetId: ev.targetId,
              abilityId: ev.abilityId,
              team: ev.team,
              amount: hp,
              message: `${hp} HEAL`,
              tone: 'teal',
            })
          }
          break
        }

        case 'status_applied': {
          const statusLabel =
            ev.meta?.status != null
              ? String(ev.meta.status).replace(/_/g, ' ').toUpperCase()
              : 'STATUS APPLIED'
          const isBad =
            Boolean(ev.tags?.includes('burn')) || Boolean(ev.tags?.includes('mark'))
          stepItems.push({
            id: nextId('status'),
            kind: 'status',
            actorId: ev.actorId,
            targetId: ev.targetId,
            team: ev.team,
            message: statusLabel,
            tone: isBad ? 'red' : 'gold',
          })
          break
        }

        case 'modifier_applied': {
          const modLabel =
            ev.meta?.status != null
              ? String(ev.meta.status).replace(/_/g, ' ').toUpperCase()
              : 'MODIFIER APPLIED'
          const isBad =
            Boolean(ev.tags?.includes('burn')) || Boolean(ev.tags?.includes('mark'))
          stepItems.push({
            id: nextId('status'),
            kind: 'status',
            actorId: ev.actorId,
            targetId: ev.targetId,
            team: ev.team,
            message: modLabel,
            tone: isBad ? 'red' : 'gold',
          })
          break
        }

        case 'resource_changed': {
          const mode = ev.packet?.kind === 'resource' ? ev.packet.mode : null
          stepItems.push({
            id: nextId('resource'),
            kind: 'resource',
            actorId: ev.actorId,
            targetId: ev.targetId,
            team: ev.team,
            message: mode === 'spend' ? 'ENERGY SPENT' : 'ENERGY SHIFT',
            tone: 'gold',
          })
          break
        }

        case 'fighter_defeated': {
          stepItems.push({
            id: nextId('defeat'),
            kind: 'defeat',
            actorId: ev.actorId,
            targetId: ev.targetId,
            team: ev.team,
            message: 'FIGHTER DEFEATED',
            tone: 'red',
          })
          break
        }

        case 'round_ended': {
          stepItems.push({
            id: nextId('round-end'),
            kind: 'round-end',
            message: `ROUND ${ev.round} END`,
            tone: 'frost',
          })
          break
        }

        default:
          break
      }
    }

    // ── 4. Victory frame (from BattleEvent log) ─────────────────────────────
    const victoryEvent = step.events.find((e) => e.kind === 'victory')
    if (victoryEvent) {
      stepItems.push({
        id: nextId('victory'),
        kind: 'victory',
        message: victoryEvent.message.toUpperCase(),
        tone: 'gold',
      })
    }

    // ── 5. State-commit frame — always last for each step ───────────────────
    stepItems.push({
      id: nextId('state-commit'),
      kind: 'state-commit',
      actorId: step.actorId,
      targetId: step.targetId,
      commitState: step.state,
      message: '',
      tone: 'frost',
    })

    queue.push(...stepItems)
  }

  return queue
}
