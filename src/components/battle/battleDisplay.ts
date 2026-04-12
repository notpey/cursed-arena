import { PASS_ABILITY_ID } from '@/features/battle/data'
import { getAttackUpAmount, getBurnDamage, getMarkBonus, hasStatus } from '@/features/battle/statuses'
import { getAbilityById, getFighterById } from '@/features/battle/engine'
import type {
  BattleAbilityTemplate,
  BattleBoardAccent,
  BattleFighterState,
  BattleState,
  QueuedBattleAction,
} from '@/features/battle/types'

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
  if (ability.tags.includes('HEAL')) return 'text-ca-teal'
  if (ability.tags.includes('ULT')) return 'text-amber-300'
  if (ability.tags.includes('DEBUFF')) return 'text-ca-red'
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
