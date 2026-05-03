import { PASS_ABILITY_ID } from '@/features/battle/data.ts'
import type {
  BattleAbilityIntent,
  BattleAbilityTemplate,
  BattleFighterState,
  BattleReactionGuardState,
  SkillEffect,
} from '@/features/battle/types.ts'

export const damageEffectTypes = new Set([
  'damage',
  'damageScaledByCounter',
  'damageFiltered',
  'damageEqualToActorShield',
])

export function isEffectBlocked(target: BattleFighterState, effect: SkillEffect) {
  return target.effectImmunities.some(
    (immunity) =>
      (immunity.blocks as string[]).includes(effect.type)
      || (!damageEffectTypes.has(effect.type) && immunity.blocks.includes('nonDamage')),
  )
}

function mergeIntent(left: BattleAbilityIntent, right: BattleAbilityIntent): BattleAbilityIntent {
  if (left === right) return left
  if (left === 'neutral') return right
  if (right === 'neutral') return left
  return 'mixed'
}

function getEffectIntent(effect: SkillEffect): BattleAbilityIntent {
  switch (effect.type) {
    case 'damage':
    case 'damageScaledByCounter':
    case 'damageFiltered':
    case 'damageEqualToActorShield':
    case 'randomEnemyDamageOverTime':
    case 'randomEnemyDamageTick':
    case 'shieldDamage':
    case 'energyDrain':
    case 'energySteal':
    case 'stun':
    case 'intentStun':
    case 'classStun':
    case 'classStunScaledByCounter':
    case 'mark':
    case 'burn':
    case 'breakShield':
    case 'counter':
    case 'reflect':
      return 'harmful'
    case 'heal':
    case 'setHpFromCounter':
    case 'invulnerable':
    case 'attackUp':
    case 'cooldownReduction':
    case 'damageBoost':
    case 'shield':
    case 'effectImmunity':
    case 'overhealToShield':
      return 'helpful'
    case 'cooldownAdjust':
      return effect.amount > 0 ? 'harmful' : 'helpful'
    case 'energyGain':
      return 'helpful'
    case 'modifyAbilityCost':
      return effect.modifier.mode === 'increaseRandom' || effect.modifier.mode === 'increaseTyped'
        ? 'harmful'
        : 'helpful'
    case 'reaction':
      return effect.effects.reduce<BattleAbilityIntent>(
        (intent, nested) => mergeIntent(intent, getEffectIntent(nested)),
        effect.harmfulOnly ? 'harmful' : 'neutral',
      )
    case 'schedule':
      return effect.effects.reduce<BattleAbilityIntent>((intent, nested) => mergeIntent(intent, getEffectIntent(nested)), 'neutral')
    case 'conditional': {
      const thenIntent = effect.effects.reduce<BattleAbilityIntent>((intent, nested) => mergeIntent(intent, getEffectIntent(nested)), 'neutral')
      const elseIntent = (effect.elseEffects ?? []).reduce<BattleAbilityIntent>((intent, nested) => mergeIntent(intent, getEffectIntent(nested)), 'neutral')
      return mergeIntent(thenIntent, elseIntent)
    }
    default:
      return 'neutral'
  }
}

export function getAbilityIntent(ability: BattleAbilityTemplate): BattleAbilityIntent {
  if (ability.intent) return ability.intent
  if (ability.id === PASS_ABILITY_ID || ability.kind === 'pass') return 'neutral'
  if (ability.kind === 'heal' || ability.kind === 'defend' || ability.kind === 'buff') return 'helpful'
  if (ability.kind === 'attack' || ability.kind === 'debuff') return 'harmful'

  return (ability.effects ?? []).reduce<BattleAbilityIntent>(
    (intent, effect) => mergeIntent(intent, getEffectIntent(effect)),
    'neutral',
  )
}

export function isHarmfulAbility(ability: BattleAbilityTemplate) {
  const intent = getAbilityIntent(ability)
  return intent === 'harmful' || intent === 'mixed'
}

export function isHelpfulAbility(ability: BattleAbilityTemplate) {
  const intent = getAbilityIntent(ability)
  return intent === 'helpful' || intent === 'mixed'
}

export function isEffectReflectable(effect: SkillEffect) {
  switch (effect.type) {
    case 'damage':
    case 'damageScaledByCounter':
    case 'stun':
    case 'classStun':
    case 'mark':
    case 'burn':
    case 'breakShield':
    case 'shieldDamage':
    case 'energyDrain':
    case 'energySteal':
      return true
    case 'cooldownAdjust':
      return effect.amount > 0
    default:
      return false
  }
}

export function canEffectBeReflected(ability: BattleAbilityTemplate, effect: SkillEffect) {
  if (ability.cannotBeReflected) return false
  if (!isEffectReflectable(effect)) return false
  if (
    (effect.type === 'damage' || effect.type === 'damageScaledByCounter')
    && effect.cannotBeReflected
  )
    return false
  return true
}

export function abilityCanBeCountered(ability: BattleAbilityTemplate) {
  if (ability.cannotBeCountered) return false
  const damageEffects = (ability.effects ?? []).filter(
    (effect): effect is Extract<SkillEffect, { type: 'damage' | 'damageScaledByCounter' }> =>
      effect.type === 'damage' || effect.type === 'damageScaledByCounter',
  )
  if (damageEffects.length === 0) return true
  return damageEffects.some((effect) => !effect.cannotBeCountered)
}

export function abilityCanBeReflected(ability: BattleAbilityTemplate) {
  return (ability.effects ?? []).some((effect) => canEffectBeReflected(ability, effect))
}

export function guardMatchesAbility(
  guard: BattleReactionGuardState,
  ability: BattleAbilityTemplate,
) {
  if (!guard.abilityClasses || guard.abilityClasses.length === 0) return true
  return ability.classes.some((cls) => guard.abilityClasses?.includes(cls))
}

export function consumeReactionGuard(target: BattleFighterState, guardId: string) {
  const index = target.reactionGuards.findIndex((guard) => guard.id === guardId)
  if (index === -1) return null
  const [removed] = target.reactionGuards.splice(index, 1)
  return removed ?? null
}
