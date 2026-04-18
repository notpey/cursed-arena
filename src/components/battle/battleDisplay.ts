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

export type ActivePipTone = 'default' | 'burn' | 'stun' | 'heal' | 'buff' | 'debuff' | 'void'

export type ActiveEffectPip = {
  key: string
  iconSrc?: string
  label: string
  detail: string
  turnsLeft: number | null  // null = permanent/untilRemoved
  tone: ActivePipTone
}

function pipDuration(duration: { kind: string; remaining?: number } | undefined): number | null {
  if (!duration) return null
  if (duration.kind === 'rounds') return duration.remaining ?? 0
  return null
}

export function getActivePips(fighter: BattleFighterState): ActiveEffectPip[] {
  const pips: ActiveEffectPip[] = []

  // ── Statuses ─────────────────────────────────────────────────────────────
  for (const status of fighter.statuses) {
    if (status.kind === 'stun') {
      pips.push({
        key: 'status-stun',
        label: 'Stunned',
        detail: `Cannot use abilities for ${status.duration} more turn${status.duration !== 1 ? 's' : ''}.`,
        turnsLeft: status.duration,
        tone: 'stun',
      })
    } else if (status.kind === 'invincible') {
      pips.push({
        key: 'status-invincible',
        label: 'Invincible',
        detail: `Cannot be targeted by enemy skills for ${status.duration} more turn${status.duration !== 1 ? 's' : ''}.`,
        turnsLeft: status.duration,
        tone: 'void',
      })
    } else if (status.kind === 'burn') {
      pips.push({
        key: 'status-burn',
        label: `Burn ${status.damage}`,
        detail: `Takes ${status.damage} affliction damage per turn. ${status.duration} turn${status.duration !== 1 ? 's' : ''} remaining.`,
        turnsLeft: status.duration,
        tone: 'burn',
      })
    } else if (status.kind === 'mark') {
      pips.push({
        key: 'status-mark',
        label: `Marked +${status.bonus}`,
        detail: `Next hit deals +${status.bonus} bonus damage. ${status.duration} turn${status.duration !== 1 ? 's' : ''} remaining.`,
        turnsLeft: status.duration,
        tone: 'debuff',
      })
    } else if (status.kind === 'attackUp') {
      pips.push({
        key: 'status-attackUp',
        label: `DMG +${status.amount}`,
        detail: `Attack increased by ${status.amount}. ${status.duration} turn${status.duration !== 1 ? 's' : ''} remaining.`,
        turnsLeft: status.duration,
        tone: 'buff',
      })
    }
  }

  // ── Visible modifiers ─────────────────────────────────────────────────────
  for (const mod of fighter.modifiers) {
    if (!mod.visible) continue
    const dur = pipDuration(mod.duration as { kind: string; remaining?: number })
    const durText = dur !== null ? ` ${dur} turn${dur !== 1 ? 's' : ''} remaining.` : ''

    let detail = mod.label
    let tone: ActivePipTone = 'default'

    if (mod.stat === 'damageTaken' && typeof mod.value === 'number') {
      if (mod.mode === 'flat') {
        detail = mod.value < 0
          ? `Damage taken reduced by ${Math.abs(mod.value)}.${durText}`
          : `Damage taken increased by ${mod.value}.${durText}`
        tone = mod.value < 0 ? 'buff' : 'debuff'
      } else if (mod.mode === 'percentAdd') {
        detail = `Damage taken ${mod.value > 0 ? '+' : ''}${mod.value}%.${durText}`
        tone = mod.value < 0 ? 'buff' : 'debuff'
      }
    } else if (mod.stat === 'damageDealt' && typeof mod.value === 'number') {
      detail = `Damage dealt ${mod.value > 0 ? '+' : ''}${mod.value}.${durText}`
      tone = mod.value > 0 ? 'buff' : 'debuff'
    } else if (mod.stat === 'isInvulnerable') {
      detail = `Invulnerable to enemy skills.${durText}`
      tone = 'void'
    } else if (mod.stat === 'canAct' && mod.value === false) {
      detail = `Cannot use abilities.${durText}`
      tone = 'stun'
    } else if (mod.stat === 'healDone' || mod.stat === 'healTaken') {
      detail = `${mod.label}.${durText}`
      tone = 'heal'
    } else {
      detail = `${mod.label}.${durText}`
    }

    pips.push({
      key: `mod-${mod.id}`,
      iconSrc: undefined,
      label: mod.label,
      detail,
      turnsLeft: dur,
      tone,
    })
  }

  // ── Ability state changes (locked/replaced skills) ────────────────────────
  for (const delta of fighter.abilityState) {
    if (delta.mode === 'lock') {
      pips.push({
        key: `abilitystate-lock-${delta.slotAbilityId}`,
        label: 'Ability Locked',
        detail: `A skill is locked for ${delta.duration} more turn${delta.duration !== 1 ? 's' : ''}.`,
        turnsLeft: delta.duration,
        tone: 'stun',
      })
    } else if (delta.mode === 'replace') {
      const replaced = delta.replacement
      pips.push({
        key: `abilitystate-replace-${delta.slotAbilityId}`,
        iconSrc: replaced.icon.src,
        label: replaced.name,
        detail: `${replaced.name} is active for ${delta.duration} more turn${delta.duration !== 1 ? 's' : ''}.`,
        turnsLeft: delta.duration,
        tone: 'default',
      })
    } else if (delta.mode === 'grant') {
      const granted = delta.grantedAbility
      pips.push({
        key: `abilitystate-grant-${granted.id}`,
        iconSrc: granted.icon.src,
        label: granted.name,
        detail: `${granted.name} granted for ${delta.duration} more turn${delta.duration !== 1 ? 's' : ''}.`,
        turnsLeft: delta.duration,
        tone: 'buff',
      })
    }
  }

  return pips
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
