import { PASS_ABILITY_ID } from '@/features/battle/data.ts'
import type {
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

export function isHarmfulAbility(ability: BattleAbilityTemplate) {
  if (ability.id === PASS_ABILITY_ID) return false
  const targetsEnemy = ability.targetRule === 'enemy-single' || ability.targetRule === 'enemy-all'
  if (!targetsEnemy) return false
  return (
    ability.kind !== 'heal'
    && ability.kind !== 'defend'
    && ability.kind !== 'buff'
    && ability.kind !== 'pass'
  )
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
