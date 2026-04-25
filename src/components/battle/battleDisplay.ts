import { PASS_ABILITY_ID } from '@/features/battle/data'
import { getAttackUpAmount, getBurnDamage, getMarkBonus, hasStatus } from '@/features/battle/statuses'
import { getAbilityById, getFighterById } from '@/features/battle/engine'
import { describeReactionCondition } from '@/features/battle/reactions'
import type {
  BattleAbilityIcon,
  BattleAbilityTemplate,
  BattleBoardAccent,
  BattleFighterState,
  BattleModifierInstance,
  BattleState,
  QueuedBattleAction,
  PassiveEffect,
  SkillEffect,
} from '@/features/battle/types'

// Optional battle state for cross-team icon resolution. When provided,
// pips sourced from an opposing fighter's ability can still show the
// correct skill art (e.g. Nue's icon on a stunned enemy portrait).
let activeBattleState: BattleState | null = null
export function setActiveBattleStateForPips(state: BattleState | null) {
  activeBattleState = state
}

export type ActivePipTone = 'default' | 'burn' | 'stun' | 'heal' | 'buff' | 'debuff' | 'void'

export type ActiveEffectLine = {
  text: string
  turnsLeft: number | null
}

export type ActiveEffectPip = {
  key: string
  iconSrc?: string
  iconLabel: string
  iconTone: BattleBoardAccent
  label: string
  lines: ActiveEffectLine[]
  turnsLeft: number | null
  stackCount: number | null  // shown as center overlay when > 0
  tone: ActivePipTone
}

// ── Duration helpers ──────────────────────────────────────────────────────────

function modDuration(mod: BattleModifierInstance): number | null {
  if (mod.duration.kind === 'rounds') return mod.duration.remaining
  return null
}

// ── Per-modifier effect line ──────────────────────────────────────────────────

function modEffectLine(mod: BattleModifierInstance): { line: string; tone: ActivePipTone; turnsLeft: number | null } {
  const turnsLeft = modDuration(mod)
  if (mod.statusKind === 'stun') return { line: 'Cannot use abilities', tone: 'stun', turnsLeft }
  if (mod.statusKind === 'invincible') return { line: 'Invulnerable to all enemy skills', tone: 'void', turnsLeft }
  if (mod.statusKind === 'burn' && typeof mod.value === 'number') return { line: `Taking ${mod.value} affliction damage each turn`, tone: 'burn', turnsLeft }
  if (mod.statusKind === 'mark' && typeof mod.value === 'number') return { line: `Marked — next hit deals +${mod.value} bonus damage`, tone: 'debuff', turnsLeft }
  if (mod.statusKind === 'attackUp' && typeof mod.value === 'number') return { line: `All damage increased by ${mod.value}`, tone: 'buff', turnsLeft }

  if (mod.stat === 'damageTaken' && typeof mod.value === 'number') {
    if (mod.mode === 'flat') {
      const line = mod.value < 0
        ? `Damage taken reduced by ${Math.abs(mod.value)}`
        : `Damage taken increased by ${mod.value}`
      return { line, tone: mod.value < 0 ? 'buff' : 'debuff', turnsLeft }
    }
    if (mod.mode === 'percentAdd') {
      return { line: `Damage taken ${mod.value > 0 ? '+' : ''}${mod.value}%`, tone: mod.value < 0 ? 'buff' : 'debuff', turnsLeft }
    }
  }
  if (mod.stat === 'damageDealt' && typeof mod.value === 'number') {
    const dir = mod.value > 0 ? `increased by ${mod.value}` : `reduced by ${Math.abs(mod.value)}`
    return { line: `Damage dealt ${dir}`, tone: mod.value > 0 ? 'buff' : 'debuff', turnsLeft }
  }
  if (mod.stat === 'canReduceDamageTaken' && mod.value === false) return { line: 'Cannot reduce damage taken', tone: 'debuff', turnsLeft }
  if (mod.stat === 'canGainInvulnerable' && mod.value === false) return { line: 'Cannot become invulnerable', tone: 'debuff', turnsLeft }
  if (mod.stat === 'isInvulnerable') return { line: 'Invulnerable to all enemy skills', tone: 'void', turnsLeft }
  if (mod.stat === 'canAct' && mod.value === false) return { line: 'Cannot use abilities', tone: 'stun', turnsLeft }
  if (mod.stat === 'canAct' && mod.value === true) return { line: 'Immune to stun effects', tone: 'buff', turnsLeft }
  if (mod.stat === 'healDone' || mod.stat === 'healTaken') return { line: mod.label, tone: 'heal', turnsLeft }
  return { line: mod.label, tone: 'default', turnsLeft }
}

// ── Icon resolution ───────────────────────────────────────────────────────────

function findAbilityOnFighter(fighter: BattleFighterState, abilityId: string): BattleAbilityTemplate | null {
  const allAbilities = [...fighter.abilities, fighter.ultimate]
  const ability = allAbilities.find((a) => a.id === abilityId)
  if (ability) return ability
  for (const delta of fighter.abilityState) {
    if (delta.mode === 'replace' && delta.replacement.id === abilityId) return delta.replacement
    if (delta.mode === 'grant' && delta.grantedAbility.id === abilityId) return delta.grantedAbility
  }
  return null
}

function findAbilityAnywhere(abilityId: string): BattleAbilityTemplate | null {
  if (!activeBattleState) return null
  for (const team of [activeBattleState.playerTeam, activeBattleState.enemyTeam]) {
    for (const fighter of team) {
      const ability = findAbilityOnFighter(fighter, abilityId)
      if (ability) return ability
    }
  }
  return null
}

function findPassiveAnywhere(passiveId: string): PassiveEffect | null {
  if (!activeBattleState) return null
  for (const team of [activeBattleState.playerTeam, activeBattleState.enemyTeam]) {
    for (const fighter of team) {
      const passive = fighter.passiveEffects?.find((p) => p.id === passiveId)
      if (passive) return passive
    }
  }
  return null
}

function resolveSourceIcon(fighter: BattleFighterState, sourceAbilityId: string): BattleAbilityIcon | null {
  const local = findAbilityOnFighter(fighter, sourceAbilityId)
  if (local) return local.icon

  const passiveLocal = fighter.passiveEffects?.find((p) => p.id === sourceAbilityId)
  if (passiveLocal) {
    if (passiveLocal.icon?.src) return passiveLocal.icon
    if (passiveLocal.iconFromAbilityId) {
      const ref = findAbilityOnFighter(fighter, passiveLocal.iconFromAbilityId) ?? findAbilityAnywhere(passiveLocal.iconFromAbilityId)
      if (ref) return ref.icon
    }
    if (passiveLocal.icon) return passiveLocal.icon
  }

  // Fall back to cross-team lookup — statuses inflicted by an opposing
  // fighter should still render with the correct skill/passive art.
  const remoteAbility = findAbilityAnywhere(sourceAbilityId)
  if (remoteAbility) return remoteAbility.icon

  const remotePassive = findPassiveAnywhere(sourceAbilityId)
  if (remotePassive) {
    if (remotePassive.icon?.src) return remotePassive.icon
    if (remotePassive.iconFromAbilityId) {
      const ref = findAbilityAnywhere(remotePassive.iconFromAbilityId)
      if (ref) return ref.icon
    }
    if (remotePassive.icon) return remotePassive.icon
  }

  return null
}

function resolveSourceName(fighter: BattleFighterState, sourceAbilityId: string): string {
  const local = findAbilityOnFighter(fighter, sourceAbilityId)
  if (local) return local.name

  const passiveLocal = fighter.passiveEffects?.find((p) => p.id === sourceAbilityId)
  if (passiveLocal) return passiveLocal.label

  const remoteAbility = findAbilityAnywhere(sourceAbilityId)
  if (remoteAbility) return remoteAbility.name

  const remotePassive = findPassiveAnywhere(sourceAbilityId)
  if (remotePassive) return remotePassive.label

  return sourceAbilityId
}

export function getSkillEffectDuration(effect: SkillEffect): number | null {
  switch (effect.type) {
    case 'stun':
    case 'invulnerable':
    case 'attackUp':
    case 'mark':
    case 'burn':
    case 'classStun':
    case 'counter':
    case 'reflect':
    case 'replaceAbility':
    case 'effectImmunity':
      return effect.duration
    case 'classStunScaledByCounter':
      return effect.baseDuration
    default:
      return null
  }
}

export function describeSkillEffectForUi(effect: SkillEffect): string {
  switch (effect.type) {
    case 'damage':
      return `Deal ${effect.power} damage`
    case 'damageFiltered':
      return `Deal ${effect.power} damage to ${effect.requiresTag} targets`
    case 'damageScaledByCounter':
      return `Deal ${effect.powerPerStack} damage per ${effect.counterKey} stack`
    case 'damageEqualToActorShield':
      return 'Deal damage equal to actor shield'
    case 'shieldDamage':
      return `Damage shield for ${effect.amount}`
    case 'energyGain':
      return 'Gain cursed energy'
    case 'energyDrain':
      return 'Drain enemy energy'
    case 'energySteal':
      return 'Steal enemy energy'
    case 'cooldownAdjust':
      return `${effect.amount < 0 ? 'Reduce' : 'Increase'} cooldowns by ${Math.abs(effect.amount)}`
    case 'heal':
      return `Restore ${effect.power} HP`
    case 'stun':
      return `Stun for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'invulnerable':
      return `Gain invulnerability for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'attackUp':
      return `Gain +${effect.amount} damage for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'mark':
      return `Apply mark (+${effect.bonus} damage) for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'burn':
      return `Apply burn (${effect.damage}/turn) for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'cooldownReduction':
      return `Reduce cooldowns by ${effect.amount} extra each round`
    case 'damageBoost':
      return `Gain ${Math.round(effect.amount * 100)}% bonus damage`
    case 'classStun':
      return `Seal ${effect.blockedClasses.join('/')} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'classStunScaledByCounter':
      return `Seal ${effect.blockedClasses.join('/')} scaled by ${effect.counterKey}`
    case 'counter':
      return `Counter for ${effect.counterDamage} damage (${effect.duration} turn${effect.duration === 1 ? '' : 's'})`
    case 'reflect':
      return `Reflect harmful effects for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'adjustCounter':
      return `Adjust ${effect.key} by ${effect.amount}`
    case 'adjustCounterByTriggerAmount':
      return `Adjust ${effect.key} by trigger amount`
    case 'resetCounter':
      return `Reset ${effect.key}`
    case 'setFlag':
      return `Set ${effect.key} to ${effect.value ? 'true' : 'false'}`
    case 'modifyAbilityCost':
      return `Modify ability cost (${effect.modifier.label})`
    case 'replaceAbility':
      return `Replace ${effect.slotAbilityId} with ${effect.ability.name} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'replaceAbilities':
      return `Replace ${effect.replacements.length} abilities`
    case 'modifyAbilityState':
      return `Apply ${effect.delta.mode} ability state`
    case 'addModifier':
      return `Apply modifier: ${effect.modifier.label}`
    case 'removeModifier':
      return 'Remove matching modifier'
    case 'shield':
      return `Gain ${effect.amount} shield`
    case 'breakShield':
      return 'Break shield'
    case 'effectImmunity':
      return `Gain immunity: ${effect.label}`
    case 'removeEffectImmunity':
      return 'Remove matching immunity'
    case 'schedule':
      return `Schedule ${effect.effects.length} delayed effect${effect.effects.length === 1 ? '' : 's'}`
    case 'overhealToShield':
      return `Convert overheal to shield (${effect.power})`
    default:
      return 'Unknown effect'
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function getActivePips(fighter: BattleFighterState): ActiveEffectPip[] {
  // Groups: sourceAbilityId → { lines, minTurns, tone, icon, stackCount }
  type Group = {
    key: string
    label: string
    lines: ActiveEffectLine[]
    turnsLeft: number | null
    tone: ActivePipTone
    iconSrc?: string
    iconLabel: string
    iconTone: BattleBoardAccent
    stackCount: number | null
  }

  const groups = new Map<string, Group>()

  function ensureGroup(sourceId: string): Group {
    if (groups.has(sourceId)) return groups.get(sourceId)!
    const icon = resolveSourceIcon(fighter, sourceId)
    const name = resolveSourceName(fighter, sourceId)
    const group: Group = {
      key: `pip-${sourceId}`,
      label: name,
      lines: [],
      turnsLeft: null,
      tone: 'default',
      iconSrc: icon?.src,
      iconLabel: icon?.label ?? name.slice(0, 2).toUpperCase(),
      iconTone: icon?.tone ?? 'teal',
      stackCount: null,
    }
    groups.set(sourceId, group)
    return group
  }

  function mergeTurns(group: Group, turns: number | null) {
    if (turns === null) return
    if (group.turnsLeft === null) group.turnsLeft = turns
    else group.turnsLeft = Math.max(group.turnsLeft, turns)
  }

function mergeTone(group: Group, tone: ActivePipTone) {
  if (group.tone === 'default') group.tone = tone
}

function passiveTriggerLabel(passive: PassiveEffect): string {
  switch (passive.trigger) {
    case 'whileAlive':
      return 'While alive'
    case 'onRoundStart':
      return 'Round start'
    case 'onRoundEnd':
      return 'Round end'
    case 'onAbilityUse':
      return 'On ability use'
    case 'onAbilityResolve':
      return 'On ability resolve'
    case 'onDealDamage':
      return 'On dealing damage'
    case 'onTakeDamage':
      return 'On taking damage'
    case 'onShieldBroken':
      return 'On shield break'
    case 'onHeal':
      return 'On heal'
    case 'onShieldGain':
      return 'On shield gain'
    case 'onDefeat':
      return 'On defeat'
    case 'onDefeatEnemy':
      return 'On defeating an enemy'
    case 'onBeingTargeted':
      return 'When targeted'
    case 'onTargetBelow':
      return passive.threshold != null ? `Target below ${Math.round(passive.threshold * 100)}% HP` : 'Execute window'
  }
}

function describePassiveLines(passive: PassiveEffect): ActiveEffectLine[] {
  const prefix = passiveTriggerLabel(passive)
  const conditionText =
    passive.conditions && passive.conditions.length > 0
      ? `, if ${passive.conditions.map(describeReactionCondition).join(', ')}`
      : ''
  if (passive.effects.length > 0) {
    return passive.effects.map((effect) => ({
      text: `${prefix}${conditionText}: ${describeSkillEffectForUi(effect)}`,
      turnsLeft: getSkillEffectDuration(effect),
    }))
  }
  if (passive.description?.trim()) {
    return [{ text: `${prefix}${conditionText}: ${passive.description.trim()}`, turnsLeft: null }]
  }
  return [{ text: `${prefix}${conditionText}: no passive effects configured`, turnsLeft: null }]
}

function isBaselinePassiveVisible(passive: PassiveEffect): boolean {
  // Hidden passives (conditional sub-effects already described in skill copy) are
  // engine-only. Everything else — the signature passive identity — is shown.
  if (passive.hidden) return false
  return true
}

function normalizeCounterKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function counterKeyVariants(counterKey: string): string[] {
  const variants = new Set<string>([counterKey])
  variants.add(counterKey.replace(/-(stacks?|count|counter|charges?)$/i, ''))
  variants.add(counterKey.replace(/_(stacks?|count|counter|charges?)$/i, ''))
  return [...variants].filter(Boolean)
}

  // ── Visible modifiers grouped by sourceAbilityId ─────────────────────────
  for (const mod of fighter.modifiers) {
    if (!mod.visible) continue
    const sourceId = mod.sourceAbilityId ?? '__engine__'
    const group = ensureGroup(sourceId)
    const { line, tone, turnsLeft } = modEffectLine(mod)
    group.lines.push({ text: line, turnsLeft })
    mergeTurns(group, turnsLeft)
    mergeTone(group, tone)
  }

  // ── abilityState: replace / grant / lock ──────────────────────────────────
  for (const delta of fighter.abilityState) {
    if (delta.mode === 'replace') {
      const sourceId = `replace-${delta.slotAbilityId}`
      const group = ensureGroup(sourceId)
      // Override icon/label with the replacement ability itself
      group.iconSrc = delta.replacement.icon.src
      group.iconLabel = delta.replacement.icon.label
      group.iconTone = delta.replacement.icon.tone
      group.label = delta.replacement.name
      group.lines.push({ text: 'Active replacement', turnsLeft: delta.duration })
      mergeTurns(group, delta.duration)
    } else if (delta.mode === 'grant') {
      const sourceId = `grant-${delta.grantedAbility.id}`
      const group = ensureGroup(sourceId)
      group.iconSrc = delta.grantedAbility.icon.src
      group.iconLabel = delta.grantedAbility.icon.label
      group.iconTone = delta.grantedAbility.icon.tone
      group.label = delta.grantedAbility.name
      group.lines.push({ text: 'Granted ability', turnsLeft: delta.duration })
      mergeTurns(group, delta.duration)
      mergeTone(group, 'buff')
    } else if (delta.mode === 'lock') {
      const sourceId = `lock-${delta.slotAbilityId}`
      const group = ensureGroup(sourceId)
      group.label = 'Ability Locked'
      group.lines.push({ text: 'Locked ability slot', turnsLeft: delta.duration })
      mergeTurns(group, delta.duration)
      mergeTone(group, 'stun')
    }
  }

  // ── Shield ────────────────────────────────────────────────────────────────
  if (fighter.shield && fighter.shield.amount > 0) {
    const sourceId = fighter.shield.sourceAbilityId ?? '__shield__'
    const group = ensureGroup(sourceId)
    group.lines.push({ text: `${fighter.shield.label}: ${fighter.shield.amount} shield remaining`, turnsLeft: null })
    mergeTone(group, 'buff')
  }

  // ── Effect immunities ─────────────────────────────────────────────────────
  for (const immunity of fighter.effectImmunities) {
    const sourceId = immunity.sourceAbilityId ?? '__immunity__'
    const group = ensureGroup(sourceId)
    group.lines.push({ text: immunity.label, turnsLeft: immunity.remainingRounds })
    mergeTurns(group, immunity.remainingRounds)
    mergeTone(group, 'void')
  }

  // ── Class stuns ───────────────────────────────────────────────────────────
  for (const cs of fighter.classStuns) {
    const sourceId = cs.sourceAbilityId ?? '__classstun__'
    const group = ensureGroup(sourceId)
    group.lines.push({ text: `${cs.blockedClasses.join('/')} techniques sealed`, turnsLeft: cs.remainingRounds })
    mergeTurns(group, cs.remainingRounds)
    mergeTone(group, 'stun')
  }

  for (const guard of fighter.reactionGuards) {
    const sourceId = guard.sourceAbilityId ?? `__reaction-${guard.kind}__`
    const group = ensureGroup(sourceId)
    const classScope = guard.abilityClasses && guard.abilityClasses.length > 0
      ? `${guard.abilityClasses.join('/')} harmful skill`
      : 'harmful skill'
    const triggerScope = guard.consumeOnTrigger ? 'the first' : 'any'
    if (guard.kind === 'counter') {
      group.lines.push({
        text: `If this character uses ${triggerScope} ${classScope} on this fighter, they are countered for ${guard.counterDamage ?? 0} damage`,
        turnsLeft: guard.remainingRounds,
      })
      mergeTone(group, 'stun')
    } else {
      group.lines.push({
        text: `If this character uses ${triggerScope} ${classScope} on this fighter, its harmful effects are reflected`,
        turnsLeft: guard.remainingRounds,
      })
      mergeTone(group, 'buff')
    }
    mergeTurns(group, guard.remainingRounds)
  }

  // ── Passive abilities ─────────────────────────────────────────────────────
  // Built before counters so the counter pass can attach to passive pips.
  const seenPassiveRoots = new Set<string>()
  const counterKeyToGroupId = new Map<string, string>()
  for (const passive of fighter.passiveEffects ?? []) {
    if (!isBaselinePassiveVisible(passive)) continue
    const root = passive.label.split(':')[0].trim()
    if (seenPassiveRoots.has(root)) continue
    seenPassiveRoots.add(root)
    const sourceId = `passive-${passive.id ?? root}`
    if (groups.has(sourceId)) continue
    if (passive.counterKey) counterKeyToGroupId.set(passive.counterKey, sourceId)
    groups.set(sourceId, {
      key: sourceId,
      label: passive.label,
      lines: describePassiveLines(passive),
      turnsLeft: null,
      tone: 'buff',
      iconSrc: passive.icon?.src,
      iconLabel: passive.icon?.label ?? root.slice(0, 2).toUpperCase(),
      iconTone: passive.icon?.tone ?? 'teal',
      stackCount: null,
    })
  }

  // ── Counters: attach to their owning passive (or best-match source group) ──
  for (const [key, value] of Object.entries(fighter.stateCounters)) {
    if (value <= 0) continue

    const explicitGroupId = counterKeyToGroupId.get(key)
    if (explicitGroupId) {
      const owner = groups.get(explicitGroupId)
      if (owner) {
        owner.stackCount = value
        continue
      }
    }

    const variants = counterKeyVariants(key)
    let ownerGroup: Group | null = null
    let ownerScore = 0

    for (const group of groups.values()) {
      const groupCandidates = [group.key, group.key.replace(/^pip-/, ''), group.label]
      let score = 0

      for (const variant of variants) {
        const normalizedVariant = normalizeCounterKey(variant)
        if (!normalizedVariant) continue

        for (const candidate of groupCandidates) {
          const normalizedCandidate = normalizeCounterKey(candidate)
          if (!normalizedCandidate) continue

          if (normalizedCandidate === normalizedVariant) {
            score = Math.max(score, 4)
          } else if (normalizedVariant.includes(normalizedCandidate) && normalizedCandidate.length >= 5) {
            score = Math.max(score, 3)
          } else if (normalizedCandidate.includes(normalizedVariant) && normalizedVariant.length >= 5) {
            score = Math.max(score, 2)
          }
        }
      }

      if (score > ownerScore) {
        ownerScore = score
        ownerGroup = group
      }
    }

    if (ownerGroup) ownerGroup.stackCount = value
  }

  return [...groups.values()].map((g) => ({
    key: g.key,
    iconSrc: g.iconSrc,
    iconLabel: g.iconLabel,
    iconTone: g.iconTone,
    label: g.label,
    lines: [...g.lines].sort((left, right) => {
      if (left.turnsLeft === null && right.turnsLeft === null) return 0
      if (left.turnsLeft === null) return 1
      if (right.turnsLeft === null) return -1
      return left.turnsLeft - right.turnsLeft
    }),
    turnsLeft: g.turnsLeft,
    stackCount: g.stackCount,
    tone: g.tone,
  }))
}

export function cn(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(' ')
}

export type DisplayAccent = BattleBoardAccent | 'amber'

export type BattleStatusPill = {
  label: string
  tone: 'red' | 'teal' | 'gold'
}

export function getAccentStyles(accent: DisplayAccent) {
  if (accent === 'teal') {
    return {
      border: 'border-ca-teal/38',
      wash: 'bg-ca-teal-wash',
      text: 'text-ca-teal',
      glow: 'shadow-[0_0_24px_rgba(5,216,189,0.16)]',
      panel: 'bg-[linear-gradient(180deg,rgba(5,216,189,0.12),rgba(7,10,12,0.95))]',
      lane: 'bg-[linear-gradient(180deg,rgba(5,216,189,0.06),rgba(8,8,12,0.94))]',
    }
  }

  if (accent === 'red') {
    return {
      border: 'border-ca-red/38',
      wash: 'bg-ca-red-wash',
      text: 'text-ca-red',
      glow: 'shadow-[0_0_24px_rgba(255,54,95,0.16)]',
      panel: 'bg-[linear-gradient(180deg,rgba(255,54,95,0.12),rgba(10,7,12,0.95))]',
      lane: 'bg-[linear-gradient(180deg,rgba(255,54,95,0.06),rgba(8,8,12,0.94))]',
    }
  }

  if (accent === 'frost') {
    return {
      border: 'border-white/18',
      wash: 'bg-white/8',
      text: 'text-ca-text',
      glow: 'shadow-[0_0_20px_rgba(228,230,239,0.12)]',
      panel: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(8,8,12,0.95))]',
      lane: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(8,8,12,0.94))]',
    }
  }

  return {
    border: 'border-amber-300/40',
    wash: 'bg-amber-300/10',
    text: 'text-amber-300',
    glow: 'shadow-[0_0_20px_rgba(252,211,77,0.14)]',
    panel: 'bg-[linear-gradient(180deg,rgba(252,211,77,0.12),rgba(8,8,12,0.95))]',
    lane: 'bg-[linear-gradient(180deg,rgba(252,211,77,0.06),rgba(8,8,12,0.94))]',
  }
}

export function getStatusPills(fighter: BattleFighterState) {
  const pills: BattleStatusPill[] = []
  if (hasStatus(fighter.statuses, 'stun')) pills.push({ label: 'STUN', tone: 'gold' })
  if (hasStatus(fighter.statuses, 'invincible')) pills.push({ label: 'VOID', tone: 'teal' })
  if (hasStatus(fighter.statuses, 'mark')) pills.push({ label: `MARK +${getMarkBonus(fighter.statuses)}`, tone: 'red' })
  if (hasStatus(fighter.statuses, 'burn')) pills.push({ label: `BURN ${getBurnDamage(fighter.statuses)}`, tone: 'red' })
  if (hasStatus(fighter.statuses, 'attackUp')) pills.push({ label: `DMG +${getAttackUpAmount(fighter.statuses)}`, tone: 'teal' })
  return pills
}

export function getCommandSummary(state: BattleState, command?: QueuedBattleAction) {
  if (!command) return 'Pass'
  const actor = getFighterById(state, command.actorId)
  if (!actor) return 'Pass'
  const ability = getAbilityById(actor, command.abilityId)
  const target = command.targetId ? getFighterById(state, command.targetId) : null
  if (!ability) return 'Pass'
  if (ability.id === PASS_ABILITY_ID) return 'Pass'
  if (target) return `${ability.name} -> ${target.shortName}`
  return ability.name
}

export function toneClasses(tone: BattleStatusPill['tone']) {
  if (tone === 'red') return 'border-ca-red/28 bg-ca-red-wash text-ca-red'
  if (tone === 'teal') return 'border-ca-teal/28 bg-ca-teal-wash text-ca-teal'
  return 'border-amber-400/30 bg-amber-400/10 text-amber-300'
}

export function rarityClass(rarity: BattleFighterState['rarity']) {
  if (rarity === 'UR') return 'text-ca-red'
  if (rarity === 'SSR') return 'text-amber-300'
  if (rarity === 'SR') return 'text-orange-300'
  return 'text-ca-text-3'
}

export function abilityAccent(ability: BattleAbilityTemplate) {
  if (ability.classes.includes('Ultimate')) return 'text-amber-300'
  if (ability.kind === 'heal' || ability.kind === 'buff' || ability.kind === 'defend' || ability.kind === 'utility') return 'text-ca-teal'
  if (ability.kind === 'debuff') return 'text-ca-red'
  return 'text-ca-text-2'
}

export function getTargetLabel(ability: BattleAbilityTemplate) {
  switch (ability.targetRule) {
    case 'enemy-single':
      return 'ENEMY'
    case 'enemy-all':
      return 'ENEMY ALL'
    case 'ally-single':
      return 'ALLY'
    case 'ally-all':
      return 'ALLY ALL'
    case 'self':
      return 'SELF'
    default:
      return 'FIELD'
  }
}
