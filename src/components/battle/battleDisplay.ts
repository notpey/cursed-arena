import { PASS_ABILITY_ID } from '@/features/battle/data'
import { getAttackUpAmount, getBurnDamage, getMarkBonus, hasStatus } from '@/features/battle/statuses'
import { getAbilityById, getFighterById } from '@/features/battle/engine'
import type {
  BattleAbilityIcon,
  BattleAbilityTemplate,
  BattleBoardAccent,
  BattleFighterState,
  BattleModifierInstance,
  BattleState,
  QueuedBattleAction,
} from '@/features/battle/types'

export type ActivePipTone = 'default' | 'burn' | 'stun' | 'heal' | 'buff' | 'debuff' | 'void'

export type ActiveEffectPip = {
  key: string
  iconSrc?: string
  iconLabel: string
  iconTone: BattleBoardAccent
  label: string
  lines: string[]       // bullet lines shown in tooltip
  turnsLeft: number | null
  stackCount: number | null  // shown as center overlay when > 0
  tone: ActivePipTone
}

// ── Duration helpers ──────────────────────────────────────────────────────────

function modDuration(mod: BattleModifierInstance): number | null {
  if (mod.duration.kind === 'rounds') return mod.duration.remaining
  return null
}

function durSuffix(mod: BattleModifierInstance): string {
  const turns = modDuration(mod)
  if (turns === null) return mod.duration.kind === 'permanent' ? ' (permanent).' : '.'
  return ` [${turns} turn${turns !== 1 ? 's' : ''} left].`
}

// ── Per-modifier effect line ──────────────────────────────────────────────────

function modEffectLine(mod: BattleModifierInstance): { line: string; tone: ActivePipTone } {
  const dur = durSuffix(mod)
  if (mod.statusKind === 'stun') return { line: `Cannot use abilities${dur}`, tone: 'stun' }
  if (mod.statusKind === 'invincible') return { line: `Invulnerable to all enemy skills${dur}`, tone: 'void' }
  if (mod.statusKind === 'burn' && typeof mod.value === 'number') return { line: `Taking ${mod.value} affliction damage each turn${dur}`, tone: 'burn' }
  if (mod.statusKind === 'mark' && typeof mod.value === 'number') return { line: `Marked — next hit deals +${mod.value} bonus damage${dur}`, tone: 'debuff' }
  if (mod.statusKind === 'attackUp' && typeof mod.value === 'number') return { line: `All damage increased by ${mod.value}${dur}`, tone: 'buff' }

  if (mod.stat === 'damageTaken' && typeof mod.value === 'number') {
    if (mod.mode === 'flat') {
      const line = mod.value < 0
        ? `Damage taken reduced by ${Math.abs(mod.value)}${dur}`
        : `Damage taken increased by ${mod.value}${dur}`
      return { line, tone: mod.value < 0 ? 'buff' : 'debuff' }
    }
    if (mod.mode === 'percentAdd') {
      return { line: `Damage taken ${mod.value > 0 ? '+' : ''}${mod.value}%${dur}`, tone: mod.value < 0 ? 'buff' : 'debuff' }
    }
  }
  if (mod.stat === 'damageDealt' && typeof mod.value === 'number') {
    const dir = mod.value > 0 ? `increased by ${mod.value}` : `reduced by ${Math.abs(mod.value)}`
    return { line: `Damage dealt ${dir}${dur}`, tone: mod.value > 0 ? 'buff' : 'debuff' }
  }
  if (mod.stat === 'canReduceDamageTaken' && mod.value === false) return { line: `Cannot reduce damage taken${dur}`, tone: 'debuff' }
  if (mod.stat === 'canGainInvulnerable' && mod.value === false) return { line: `Cannot become invulnerable${dur}`, tone: 'debuff' }
  if (mod.stat === 'isInvulnerable') return { line: `Invulnerable to all enemy skills${dur}`, tone: 'void' }
  if (mod.stat === 'canAct' && mod.value === false) return { line: `Cannot use abilities${dur}`, tone: 'stun' }
  if (mod.stat === 'canAct' && mod.value === true) return { line: `Immune to stun effects${dur}`, tone: 'buff' }
  if (mod.stat === 'healDone' || mod.stat === 'healTaken') return { line: `${mod.label}${dur}`, tone: 'heal' }
  return { line: `${mod.label}${dur}`, tone: 'default' }
}

// ── Icon resolution ───────────────────────────────────────────────────────────

function resolveSourceIcon(fighter: BattleFighterState, sourceAbilityId: string): BattleAbilityIcon | null {
  const allAbilities = [...fighter.abilities, fighter.ultimate]
  const ability = allAbilities.find((a) => a.id === sourceAbilityId)
  if (ability) return ability.icon

  for (const delta of fighter.abilityState) {
    if (delta.mode === 'replace' && delta.replacement.id === sourceAbilityId) return delta.replacement.icon
    if (delta.mode === 'grant' && delta.grantedAbility.id === sourceAbilityId) return delta.grantedAbility.icon
  }

  const passive = fighter.passiveEffects?.find((p) => p.id === sourceAbilityId)
  if (passive?.icon) return passive.icon

  return null
}

function resolveSourceName(fighter: BattleFighterState, sourceAbilityId: string): string {
  const allAbilities = [...fighter.abilities, fighter.ultimate]
  const ability = allAbilities.find((a) => a.id === sourceAbilityId)
  if (ability) return ability.name

  for (const delta of fighter.abilityState) {
    if (delta.mode === 'replace' && delta.replacement.id === sourceAbilityId) return delta.replacement.name
    if (delta.mode === 'grant' && delta.grantedAbility.id === sourceAbilityId) return delta.grantedAbility.name
  }

  const passive = fighter.passiveEffects?.find((p) => p.id === sourceAbilityId)
  if (passive) return passive.label

  return sourceAbilityId
}

// ── Main export ───────────────────────────────────────────────────────────────

export function getActivePips(fighter: BattleFighterState): ActiveEffectPip[] {
  // Groups: sourceAbilityId → { lines, minTurns, tone, icon, stackCount }
  type Group = {
    key: string
    label: string
    lines: string[]
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

  // ── Visible modifiers grouped by sourceAbilityId ─────────────────────────
  for (const mod of fighter.modifiers) {
    if (!mod.visible) continue
    const sourceId = mod.sourceAbilityId ?? '__engine__'
    const group = ensureGroup(sourceId)
    const { line, tone } = modEffectLine(mod)
    group.lines.push(line)
    mergeTurns(group, modDuration(mod))
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
      group.lines.push(`Active for ${delta.duration} more turn${delta.duration !== 1 ? 's' : ''}.`)
      mergeTurns(group, delta.duration)
    } else if (delta.mode === 'grant') {
      const sourceId = `grant-${delta.grantedAbility.id}`
      const group = ensureGroup(sourceId)
      group.iconSrc = delta.grantedAbility.icon.src
      group.iconLabel = delta.grantedAbility.icon.label
      group.iconTone = delta.grantedAbility.icon.tone
      group.label = delta.grantedAbility.name
      group.lines.push(`Granted for ${delta.duration} more turn${delta.duration !== 1 ? 's' : ''}.`)
      mergeTurns(group, delta.duration)
      mergeTone(group, 'buff')
    } else if (delta.mode === 'lock') {
      const sourceId = `lock-${delta.slotAbilityId}`
      const group = ensureGroup(sourceId)
      group.label = 'Ability Locked'
      group.lines.push(`Locked for ${delta.duration} more turn${delta.duration !== 1 ? 's' : ''}.`)
      mergeTurns(group, delta.duration)
      mergeTone(group, 'stun')
    }
  }

  // ── Shield ────────────────────────────────────────────────────────────────
  if (fighter.shield && fighter.shield.amount > 0) {
    const sourceId = fighter.shield.sourceAbilityId ?? '__shield__'
    const group = ensureGroup(sourceId)
    group.lines.push(`${fighter.shield.label}: ${fighter.shield.amount} shield remaining.`)
    mergeTone(group, 'buff')
  }

  // ── Effect immunities ─────────────────────────────────────────────────────
  for (const immunity of fighter.effectImmunities) {
    const sourceId = immunity.sourceAbilityId ?? '__immunity__'
    const group = ensureGroup(sourceId)
    group.lines.push(`${immunity.label} (${immunity.remainingRounds} turn${immunity.remainingRounds !== 1 ? 's' : ''} remaining).`)
    mergeTurns(group, immunity.remainingRounds)
    mergeTone(group, 'void')
  }

  // ── Class stuns ───────────────────────────────────────────────────────────
  for (const cs of fighter.classStuns) {
    const sourceId = cs.sourceAbilityId ?? '__classstun__'
    const group = ensureGroup(sourceId)
    group.lines.push(`${cs.blockedClasses.join('/')} techniques sealed for ${cs.remainingRounds} turn${cs.remainingRounds !== 1 ? 's' : ''}.`)
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
      group.lines.push(
        `If this character uses ${triggerScope} ${classScope} on this fighter, they are countered for ${guard.counterDamage ?? 0} damage.`,
      )
      mergeTone(group, 'stun')
    } else {
      group.lines.push(`If this character uses ${triggerScope} ${classScope} on this fighter, its harmful effects are reflected.`)
      mergeTone(group, 'buff')
    }
    mergeTurns(group, guard.remainingRounds)
  }

  // ── Counters: attach to their source ability group if one exists ──────────
  for (const [key, value] of Object.entries(fighter.stateCounters)) {
    if (value <= 0) continue
    // Find which ability/passive "owns" this counter by convention: counter key starts with abilityId
    const ownerGroup = [...groups.values()].find((g) => g.key.includes(key.split('-')[0] ?? ''))
    if (ownerGroup) {
      ownerGroup.stackCount = value
    }
  }

  return [...groups.values()].map((g) => ({
    key: g.key,
    iconSrc: g.iconSrc,
    iconLabel: g.iconLabel,
    iconTone: g.iconTone,
    label: g.label,
    lines: g.lines,
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
  if (!command) return 'Ready'
  const actor = getFighterById(state, command.actorId)
  if (!actor) return 'Ready'
  const ability = getAbilityById(actor, command.abilityId)
  const target = command.targetId ? getFighterById(state, command.targetId) : null
  if (!ability) return 'Ready'
  if (ability.id === PASS_ABILITY_ID) return 'Auto-pass'
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
