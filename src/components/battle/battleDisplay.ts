import { PASS_ABILITY_ID } from '@/features/battle/data'
import { getAttackUpAmount, getBurnDamage, getMarkBonus, hasStatus } from '@/features/battle/statuses'
import { getAbilityById, getFighterById } from '@/features/battle/engine'
import { describeReactionCondition } from '@/features/battle/reactions'
import type {
  BattleAbilityIcon,
  BattleAbilityTemplate,
  BattleBoardAccent,
  BattleEffectImmunityBlock,
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
  permanent?: boolean  // true = "INFINITE", false/undefined = uses turnsLeft
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

function modDuration(mod: BattleModifierInstance): { turnsLeft: number | null; permanent: boolean } {
  if (mod.duration.kind === 'rounds') return { turnsLeft: mod.duration.remaining, permanent: false }
  if (mod.duration.kind === 'permanent' || mod.duration.kind === 'untilRemoved') return { turnsLeft: null, permanent: true }
  return { turnsLeft: null, permanent: false }
}

// ── Per-modifier effect line ──────────────────────────────────────────────────

function modEffectLine(mod: BattleModifierInstance): { line: string; tone: ActivePipTone; turnsLeft: number | null; permanent: boolean } {
  const { turnsLeft, permanent } = modDuration(mod)
  if (mod.statusKind === 'stun') return { line: 'Cannot use abilities', tone: 'stun', turnsLeft, permanent }
  if (mod.statusKind === 'invincible') return { line: 'Invulnerable to all enemy skills', tone: 'void', turnsLeft, permanent }
  if (mod.statusKind === 'burn' && typeof mod.value === 'number') return { line: `This character will take ${mod.value} affliction damage`, tone: 'burn', turnsLeft, permanent }
  if (mod.statusKind === 'mark' && typeof mod.value === 'number') return { line: `This character will take ${mod.value} additional damage`, tone: 'debuff', turnsLeft, permanent }
  if (mod.statusKind === 'attackUp' && typeof mod.value === 'number') return { line: `This character deals ${mod.value} additional damage`, tone: 'buff', turnsLeft, permanent }

  if (mod.stat === 'damageTaken' && typeof mod.value === 'number') {
    if (mod.mode === 'flat') {
      const line = mod.value < 0
        ? `This character takes ${Math.abs(mod.value)} less damage`
        : `This character takes ${mod.value} additional damage`
      return { line, tone: mod.value < 0 ? 'buff' : 'debuff', turnsLeft, permanent }
    }
    if (mod.mode === 'percentAdd') {
      return { line: `Damage taken ${mod.value > 0 ? '+' : ''}${mod.value}%`, tone: mod.value < 0 ? 'buff' : 'debuff', turnsLeft, permanent }
    }
  }
  if (mod.stat === 'damageDealt' && typeof mod.value === 'number') {
    const dir = mod.value > 0 ? `deals ${mod.value} additional damage` : `deals ${Math.abs(mod.value)} less damage`
    return { line: `This character ${dir}`, tone: mod.value > 0 ? 'buff' : 'debuff', turnsLeft, permanent }
  }
  if (mod.stat === 'canReduceDamageTaken' && mod.value === false) return { line: 'This character cannot reduce damage taken', tone: 'debuff', turnsLeft, permanent }
  if (mod.stat === 'canGainInvulnerable' && mod.value === false) return { line: 'This character cannot become invulnerable', tone: 'debuff', turnsLeft, permanent }
  if (mod.stat === 'isInvulnerable') return { line: 'This character is invulnerable to all enemy skills', tone: 'void', turnsLeft, permanent }
  if (mod.stat === 'isUndying') return { line: 'This character cannot be reduced below 1 HP', tone: 'buff', turnsLeft, permanent }
  if (mod.stat === 'canAct' && mod.value === false) return { line: 'This character cannot use abilities', tone: 'stun', turnsLeft, permanent }
  if (mod.stat === 'canAct' && mod.value === true) return { line: 'This character is immune to stun effects', tone: 'buff', turnsLeft, permanent }
  if ((mod.stat === 'healDone' || mod.stat === 'healTaken') && typeof mod.value === 'number') {
    const target = mod.stat === 'healDone' ? 'healing done by' : 'healing received by'
    if (mod.mode === 'flat') {
      const line = mod.value < 0
        ? `The ${target} this character is reduced by ${Math.abs(mod.value)}`
        : `The ${target} this character is increased by ${mod.value}`
      return { line, tone: mod.value < 0 ? 'debuff' : 'heal', turnsLeft, permanent }
    }
    if (mod.mode === 'percentAdd') {
      const line = `Healing ${mod.stat === 'healDone' ? 'done' : 'received'} ${mod.value > 0 ? '+' : ''}${mod.value}%`
      return { line, tone: mod.value < 0 ? 'debuff' : 'heal', turnsLeft, permanent }
    }
  }
  if (mod.stat === 'healDone' || mod.stat === 'healTaken') return { line: 'Healing altered', tone: 'heal', turnsLeft, permanent }
  return { line: mod.label, tone: 'default', turnsLeft, permanent }
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
  const t = (n: number) => `${n} turn${n === 1 ? '' : 's'}`
  switch (effect.type) {
    case 'damage':
      return `take ${effect.power} damage`
    case 'damageFiltered':
      return `take ${effect.power} damage`
    case 'damageScaledByCounter':
      return `take damage for each stack`
    case 'damageEqualToActorShield':
      return `take damage equal to the attacker's shield`
    case 'shieldDamage':
      return `lose ${effect.amount} shield`
    case 'energyGain':
      return `gain cursed energy`
    case 'energyDrain':
      return `lose cursed energy`
    case 'energySteal':
      return `have cursed energy stolen`
    case 'cooldownAdjust':
      return effect.amount < 0
        ? `have cooldowns reduced by ${Math.abs(effect.amount)}`
        : `have cooldowns increased by ${effect.amount}`
    case 'heal':
      return `restore ${effect.power} HP`
    case 'setHpFromCounter':
      return `have HP set to a fixed value`
    case 'stun':
      return `be stunned for ${t(effect.duration)}`
    case 'invulnerable':
      return `become invulnerable for ${t(effect.duration)}`
    case 'attackUp':
      return `deal ${effect.amount} additional damage for ${t(effect.duration)}`
    case 'mark':
      return `take ${effect.bonus} additional damage for ${t(effect.duration)}`
    case 'burn':
      return `take ${effect.damage} affliction damage each turn for ${t(effect.duration)}`
    case 'cooldownReduction':
      return `have cooldowns reduced by ${effect.amount} extra each round`
    case 'damageBoost':
      return `deal ${Math.round(effect.amount * 100)}% bonus damage`
    case 'classStun':
      return `have ${effect.blockedClasses.join('/')} techniques sealed for ${t(effect.duration)}`
    case 'classStunScaledByCounter':
      return `have ${effect.blockedClasses.join('/')} techniques sealed`
    case 'counter':
      return `counter enemies for ${effect.counterDamage} damage for ${t(effect.duration)}`
    case 'reflect':
      return `reflect harmful effects for ${t(effect.duration)}`
    case 'adjustCounter':
      return effect.amount > 0 ? `gain ${effect.amount} stack` : `lose ${Math.abs(effect.amount)} stack`
    case 'adjustCounterByTriggerAmount':
      return `gain stacks equal to the trigger amount`
    case 'resetCounter':
      return `have stacks reset`
    case 'setFlag':
      return effect.value ? `have an ability enabled` : `have an ability disabled`
    case 'modifyAbilityCost':
      return `have an ability cost modified`
    case 'replaceAbility':
      return `have an ability replaced with ${effect.ability.name} for ${t(effect.duration)}`
    case 'replaceAbilities':
      return `have abilities replaced`
    case 'modifyAbilityState':
      return `have an ability state change applied`
    case 'addModifier':
      return `have ${effect.modifier.label.toLowerCase()} applied`
    case 'removeModifier':
      return `have a modifier removed`
    case 'shield':
      return `gain ${effect.amount} shield`
    case 'breakShield':
      return `have their shield broken`
    case 'effectImmunity':
      return `gain immunity to ${effect.label.toLowerCase()}`
    case 'removeEffectImmunity':
      return `lose an effect immunity`
    case 'schedule':
      return `have ${effect.effects.length} delayed effect${effect.effects.length === 1 ? '' : 's'} applied later`
    case 'randomEnemyDamageOverTime':
      return `take ${effect.power} damage each turn for ${t(effect.duration)}`
    case 'randomEnemyDamageTick':
      return `take ${effect.power} damage`
    case 'overhealToShield':
      return `convert overhealing into shield`
    default:
      return 'be affected'
  }
}

// ── Passive display helpers ──────────────────────────────────────────────────

function passiveTriggerPhrase(passive: PassiveEffect): string {
  switch (passive.trigger) {
    case 'whileAlive':
      return 'While this character is alive'
    case 'onRoundStart':
      return 'At the start of each round'
    case 'onRoundEnd':
      return 'At the end of each round'
    case 'onAbilityUse':
      return 'Each time this character uses a skill'
    case 'onAbilityResolve':
      return 'Each time this character\'s skill resolves'
    case 'onDealDamage':
      return 'Each time this character deals damage'
    case 'onTakeDamage':
      return 'Each time this character takes damage'
    case 'onShieldBroken':
      return 'When this character\'s shield is broken'
    case 'onHeal':
      return 'Each time this character is healed'
    case 'onShieldGain':
      return 'Each time this character gains a shield'
    case 'onDefeat':
      return 'When this character is defeated'
    case 'onDefeatEnemy':
      return 'When this character defeats an enemy'
    case 'onBeingTargeted':
      return 'When this character is targeted'
    case 'onTargetBelow':
      return passive.threshold != null
        ? `When the target is below ${Math.round(passive.threshold * 100)}% HP`
        : 'When the target is near defeat'
  }
}

function describePassiveGeneratedLines(passive: PassiveEffect): ActiveEffectLine[] {
  const prefix = passiveTriggerPhrase(passive)
  const conditionText =
    passive.conditions && passive.conditions.length > 0
      ? `, if ${passive.conditions.map(describeReactionCondition).join(', ')}`
      : ''
  if (passive.effects.length > 0) {
    return passive.effects.map((effect) => ({
      text: `${prefix}${conditionText}, this character will ${describeSkillEffectForUi(effect)}`,
      turnsLeft: getSkillEffectDuration(effect),
    }))
  }
  return [{ text: `${prefix}${conditionText}`, turnsLeft: null }]
}

export function describePassiveForUi(passive: PassiveEffect): string {
  const description = passive.description?.trim()
  if (description) return description

  const generated = describePassiveGeneratedLines(passive)
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join('; ')

  return generated || passive.label
}

function describePassiveLines(passive: PassiveEffect): ActiveEffectLine[] {
  const description = passive.description?.trim()
  if (description) return [{ text: description, turnsLeft: null }]
  return describePassiveGeneratedLines(passive)
}

// ── Effect immunity description ───────────────────────────────────────────────

function describeImmunityBlocks(blocks: BattleEffectImmunityBlock[]): string {
  if (blocks.includes('nonDamage') && blocks.includes('damage')) return 'This character is immune to all effects and damage'
  if (blocks.includes('nonDamage')) return 'This character is immune to all non-damage effects'
  const labels: string[] = []
  if (blocks.includes('damage') || blocks.includes('damageScaledByCounter')) labels.push('damage')
  if (blocks.includes('stun')) labels.push('stun')
  if (blocks.includes('classStun')) labels.push('technique seals')
  if (blocks.includes('mark')) labels.push('mark')
  if (blocks.includes('burn')) labels.push('affliction damage')
  if (blocks.includes('shieldDamage')) labels.push('shield damage')
  if (blocks.includes('breakShield')) labels.push('shield break')
  if (blocks.includes('energyDrain') || blocks.includes('energySteal')) labels.push('energy drain')
  if (blocks.includes('heal')) labels.push('healing')
  if (blocks.includes('invulnerable')) labels.push('invulnerability effects')
  if (blocks.includes('attackUp')) labels.push('attack buffs')
  if (blocks.includes('cooldownAdjust') || blocks.includes('cooldownReduction')) labels.push('cooldown effects')
  if (labels.length === 0) return 'This character is immune to certain effects'
  if (labels.length === 1) return `This character is immune to ${labels[0]}`
  return `This character is immune to ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

// ── Reaction trigger → plain English phrase ───────────────────────────────────

function reactionTriggerPhrase(trigger: string | undefined, firstOrAny: string): string {
  switch (trigger) {
    case 'onAbilityUse':
      return `${firstOrAny.charAt(0).toUpperCase()}${firstOrAny.slice(1)} this character uses a skill`
    case 'onBeingTargeted':
      return `${firstOrAny.charAt(0).toUpperCase()}${firstOrAny.slice(1)} this character is targeted by a skill`
    case 'onDamageApplied':
      return `${firstOrAny.charAt(0).toUpperCase()}${firstOrAny.slice(1)} this character takes damage`
    case 'onDamageBlocked':
      return `${firstOrAny.charAt(0).toUpperCase()}${firstOrAny.slice(1)} this character blocks damage`
    case 'onShieldBroken':
      return `${firstOrAny.charAt(0).toUpperCase()}${firstOrAny.slice(1)} this character's shield is broken`
    case 'onDefeat':
      return 'When this character is defeated'
    case 'onDefeatEnemy':
      return 'When this character defeats an enemy'
    default:
      return 'On the next triggering event'
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

// Priority buckets (lower = higher priority, shown first and kept when limiting)
// 0: stun / cannot act
// 1: invulnerable / shield / undying
// 2: counter / reflect / reaction guards
// 3: damage over time / punishment effects (burn, mark)
// 4: marks / vulnerability
// 5: setup / transformation / ability state changes / scheduled effects
// 6: minor buffs / debuffs / immunities / cost modifiers
// 7: passive counters
const MAX_PIPS = 5

function pipPriorityFromTone(tone: ActivePipTone): number {
  switch (tone) {
    case 'stun':   return 0
    case 'void':   return 1
    case 'burn':   return 3
    case 'debuff': return 4
    case 'buff':   return 5
    case 'heal':   return 6
    default:       return 6
  }
}

export function getActivePips(fighter: BattleFighterState): ActiveEffectPip[] {
  // Groups: sourceAbilityId → { lines, minTurns, tone, icon, stackCount, priority }
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
    priority: number
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
      priority: 6,
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

  function mergePriority(group: Group, priority: number) {
    if (priority < group.priority) group.priority = priority
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

function describeCounterLine(key: string, value: number, fighter: BattleFighterState): string | null {
  if (key === 'sukuna_bonus_hp') {
    return `Transformation bonus: +${value} HP. If Sukuna manifests now, Yuji returns at ${Math.min(fighter.maxHp, 10 + value)} HP`
  }
  if (key === 'shikigami') {
    return value >= 3
      ? `${value} Shikigami gathered. Enhanced techniques are ready`
      : `${value} Shikigami gathered`
  }
  if (key === 'straw_doll_damage_taken') {
    return `Straw Doll damage vulnerability: +${value * 5}`
  }
  if (key === 'cursed_bullet') {
    return `${value} Cursed Bullet use${value === 1 ? '' : 's'} remaining`
  }
  if (key === 'scorched') {
    return `${value} Scorched stack${value === 1 ? '' : 's'}`
  }
  if (key === 'limitless_blue') {
    return 'Lapse: Blue has been used recently'
  }
  if (key === 'limitless_red') {
    return 'Reversal: Red has been used recently'
  }
  if (key === 'vocal_strain_bonus') {
    return `Cursed speech bonus: +${value} damage`
  }
  return null
}

  // ── Visible modifiers grouped by sourceAbilityId ─────────────────────────
  for (const mod of fighter.modifiers) {
    if (!mod.visible) continue
    const sourceId = mod.sourceAbilityId ?? '__engine__'
    const group = ensureGroup(sourceId)
    const { line, tone, turnsLeft, permanent } = modEffectLine(mod)
    group.lines.push({ text: line, turnsLeft, permanent })
    mergeTurns(group, turnsLeft)
    mergeTone(group, tone)
    // Stun/cannot-act and invulnerable/undying get highest priority
    if (mod.statusKind === 'stun' || (mod.stat === 'canAct' && mod.value === false)) {
      mergePriority(group, 0)
    } else if (mod.statusKind === 'invincible' || mod.stat === 'isInvulnerable' || mod.stat === 'isUndying') {
      mergePriority(group, 1)
    } else if (mod.statusKind === 'burn') {
      mergePriority(group, 3)
    } else if (mod.statusKind === 'mark') {
      mergePriority(group, 4)
    } else {
      mergePriority(group, pipPriorityFromTone(tone))
    }
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
      group.lines.push({ text: `This character's ability has been replaced with ${delta.replacement.name}`, turnsLeft: delta.duration })
      mergeTurns(group, delta.duration)
      mergePriority(group, 5)
    } else if (delta.mode === 'grant') {
      const sourceId = `grant-${delta.grantedAbility.id}`
      const group = ensureGroup(sourceId)
      group.iconSrc = delta.grantedAbility.icon.src
      group.iconLabel = delta.grantedAbility.icon.label
      group.iconTone = delta.grantedAbility.icon.tone
      group.label = delta.grantedAbility.name
      group.lines.push({ text: `This character has been granted ${delta.grantedAbility.name}`, turnsLeft: delta.duration })
      mergeTurns(group, delta.duration)
      mergeTone(group, 'buff')
      mergePriority(group, 5)
    } else if (delta.mode === 'lock') {
      const sourceId = `lock-${delta.slotAbilityId}`
      const group = ensureGroup(sourceId)
      group.label = 'Ability Locked'
      group.lines.push({ text: 'This character cannot use one of their abilities', turnsLeft: delta.duration })
      mergeTurns(group, delta.duration)
      mergeTone(group, 'stun')
      mergePriority(group, 0)
    }
  }

  // ── Shield ────────────────────────────────────────────────────────────────
  if (fighter.shield && fighter.shield.amount > 0) {
    const sourceId = fighter.shield.sourceAbilityId ?? '__shield__'
    const group = ensureGroup(sourceId)
    group.lines.push({ text: `This character has ${fighter.shield.amount} shield remaining`, turnsLeft: null })
    mergeTone(group, 'buff')
    mergePriority(group, 1)
  }

  for (const [key, value] of Object.entries(fighter.stateModes)) {
    if (!value) continue
    const group = ensureGroup(`mode-${key}`)
    group.label = value
    group.iconLabel = value.slice(0, 2).toUpperCase()
    group.iconTone = 'gold'
    const modeDuration = fighter.stateModeDurations?.[key]?.remainingRounds ?? null
    group.lines.push({ text: `This character is in ${value} state`, turnsLeft: modeDuration })
    mergeTurns(group, modeDuration)
    mergeTone(group, 'buff')
    mergePriority(group, 5)
  }

  // ── Effect immunities ─────────────────────────────────────────────────────
  for (const immunity of fighter.effectImmunities) {
    const sourceId = immunity.sourceAbilityId ?? '__immunity__'
    const group = ensureGroup(sourceId)
    group.lines.push({ text: describeImmunityBlocks(immunity.blocks), turnsLeft: immunity.remainingRounds })
    mergeTurns(group, immunity.remainingRounds)
    mergeTone(group, 'void')
    mergePriority(group, 6)
  }

  // ── Class stuns ───────────────────────────────────────────────────────────
  for (const cs of fighter.classStuns) {
    const sourceId = cs.sourceAbilityId ?? '__classstun__'
    const group = ensureGroup(sourceId)
    group.lines.push({ text: `This character cannot use ${cs.blockedClasses.join('/')} techniques`, turnsLeft: cs.remainingRounds })
    mergeTurns(group, cs.remainingRounds)
    mergeTone(group, 'stun')
    mergePriority(group, 0)
  }

  for (const guard of fighter.reactionGuards) {
    const sourceId = guard.sourceAbilityId ?? `__reaction-${guard.kind}__`
    const group = ensureGroup(sourceId)
    const classScope = guard.abilityClasses && guard.abilityClasses.length > 0
      ? `${guard.abilityClasses.join('/')} skill`
      : 'skill'
    const firstOrAny = guard.consumeOnTrigger ? 'the next time' : 'each time'
    if (guard.kind === 'counter') {
      const harmfulClause = guard.harmfulOnly !== false ? 'harmful ' : ''
      group.lines.push({
        text: `If an enemy uses a ${harmfulClause}${classScope} on this character, they will take ${guard.counterDamage ?? 0} damage`,
        turnsLeft: guard.remainingRounds,
      })
      mergeTone(group, 'stun')
    } else if (guard.kind === 'reflect') {
      const harmfulClause = guard.harmfulOnly !== false ? 'harmful ' : ''
      group.lines.push({
        text: `If an enemy uses a ${harmfulClause}${classScope} on this character, its harmful effects are reflected back at them`,
        turnsLeft: guard.remainingRounds,
      })
      mergeTone(group, 'buff')
    } else {
      // 'effect' kind — translate trigger + effects into plain English
      const triggerPhrase = reactionTriggerPhrase(guard.trigger, firstOrAny)
      if (guard.effects && guard.effects.length > 0) {
        // Lower-case and join sub-effect descriptions naturally
        const parts = guard.effects.map((e) => {
          const raw = describeSkillEffectForUi(e)
          return raw.charAt(0).toLowerCase() + raw.slice(1)
        })
        const effectSummary = parts.length === 1
          ? parts[0]
          : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1]
        group.lines.push({
          text: `${triggerPhrase}, they will ${effectSummary}`,
          turnsLeft: guard.remainingRounds,
        })
      } else {
        group.lines.push({ text: triggerPhrase, turnsLeft: guard.remainingRounds })
      }
      mergeTone(group, 'debuff')
    }
    mergeTurns(group, guard.remainingRounds)
    mergePriority(group, 2)
  }

  // Active passive trackers. Passive ownership alone does not create a pip;
  // only a live counter/state that the player needs to track does.
  const counterKeyToGroupId = new Map<string, string>()
  for (const passive of fighter.passiveEffects ?? []) {
    if (passive.hidden || !passive.counterKey || (fighter.stateCounters[passive.counterKey] ?? 0) <= 0) continue
    const root = passive.label.split(':')[0].trim()
    const sourceId = `passive-${passive.id ?? root}`
    if (groups.has(sourceId)) continue
    counterKeyToGroupId.set(passive.counterKey, sourceId)
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
      priority: 7,
    })
  }
  // ── Scheduled effects targeting this fighter ─────────────────────────────
  if (activeBattleState) {
    const currentRound = activeBattleState.round
    for (const scheduled of activeBattleState.scheduledEffects) {
      if (!scheduled.targetIds.includes(fighter.instanceId)) continue
      const turnsLeft = Math.max(0, scheduled.dueRound - currentRound)
      // Use a unique key per scheduled entry so they don't collapse into the
      // source ability's regular pip (which may be on the caster, not target).
      const groupKey = `__scheduled-${scheduled.id}__`
      const group = ensureGroup(groupKey)
      // Prefer the ability icon/name if available
      if (scheduled.abilityId) {
        const ability = findAbilityAnywhere(scheduled.abilityId)
        if (ability) {
          group.iconSrc = ability.icon.src
          group.iconLabel = ability.icon.label
          group.iconTone = ability.icon.tone
          group.label = ability.name
        }
      }
      const parts = scheduled.effects.map((e) => {
        const raw = describeSkillEffectForUi(e)
        return raw.charAt(0).toLowerCase() + raw.slice(1)
      })
      const effectSummary = parts.length === 1
        ? parts[0]
        : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1]
      group.lines.push({ text: `This character will ${effectSummary}`, turnsLeft })
      mergeTurns(group, turnsLeft)
      mergeTone(group, 'debuff')
      mergePriority(group, 5)
    }
  }

  // ── Counters: attach to their owning passive (or best-match source group) ──
  for (const [key, value] of Object.entries(fighter.stateCounters)) {
    if (value <= 0) continue

    const explicitGroupId = counterKeyToGroupId.get(key)
    if (explicitGroupId) {
      const owner = groups.get(explicitGroupId)
      if (owner) {
        owner.stackCount = value
        const counterLine = describeCounterLine(key, value, fighter)
        if (counterLine) owner.lines.unshift({ text: counterLine, turnsLeft: null })
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

    if (ownerGroup) {
      ownerGroup.stackCount = value
      const counterLine = describeCounterLine(key, value, fighter)
      if (counterLine) ownerGroup.lines.unshift({ text: counterLine, turnsLeft: null })
    }
  }

  const sorted = [...groups.values()].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    // Within same priority: shorter duration first (more urgent)
    if (a.turnsLeft === null && b.turnsLeft === null) return 0
    if (a.turnsLeft === null) return 1
    if (b.turnsLeft === null) return -1
    return a.turnsLeft - b.turnsLeft
  })

  return sorted.slice(0, MAX_PIPS).map((g) => ({
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
