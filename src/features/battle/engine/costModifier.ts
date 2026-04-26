import {
  battleEnergyOrder,
  getAbilityEnergyCost,
  type BattleEnergyCost,
} from '@/features/battle/energy.ts'
import type {
  BattleAbilityTemplate,
  BattleCostModifierState,
  BattleCostModifierTemplate,
  BattleFighterState,
} from '@/features/battle/types.ts'

export function createCostModifierState(
  actor: BattleFighterState,
  abilityId: string | undefined,
  template: BattleCostModifierTemplate,
): BattleCostModifierState {
  return {
    ...template,
    id: `cost-${actor.instanceId}-${abilityId ?? 'passive'}-${actor.costModifiers.length}`,
    cost: template.cost ? { ...template.cost } : undefined,
    remainingRounds: template.duration,
    remainingUses: template.uses == null ? null : Math.max(0, template.uses),
    sourceActorId: actor.instanceId,
    sourceAbilityId: abilityId,
  }
}

export function matchesCostModifier(modifier: BattleCostModifierState, ability: BattleAbilityTemplate) {
  if (modifier.abilityId && modifier.abilityId !== ability.id) return false
  if (modifier.abilityClass && !ability.classes.includes(modifier.abilityClass)) return false
  return true
}

export function applyCostModifier(cost: BattleEnergyCost, modifier: BattleCostModifierState): BattleEnergyCost {
  if (modifier.mode === 'set') {
    return { ...(modifier.cost ?? {}) }
  }

  if (modifier.mode === 'reduceRandom') {
    return {
      ...cost,
      random: Math.max(0, (cost.random ?? 0) - Math.max(0, modifier.amount ?? 0)),
    }
  }

  if (modifier.mode === 'increaseRandom') {
    return {
      ...cost,
      random: (cost.random ?? 0) + Math.max(0, modifier.amount ?? 0),
    }
  }

  if (modifier.mode === 'increaseTyped') {
    const next = { ...cost }
    battleEnergyOrder.forEach((type) => {
      if ((next[type] ?? 0) > 0) {
        next[type] = (next[type] ?? 0) + Math.max(0, modifier.amount ?? 0)
      }
    })
    return next
  }

  const next = { ...cost }
  battleEnergyOrder.forEach((type) => {
    next[type] = Math.max(0, (next[type] ?? 0) - Math.max(0, modifier.amount ?? 0))
  })
  return next
}

export function getResolvedAbilityEnergyCost(
  fighter: BattleFighterState,
  ability: BattleAbilityTemplate,
) {
  const base = { ...getAbilityEnergyCost(ability) }
  const applied = fighter.costModifiers.filter((modifier) => matchesCostModifier(modifier, ability))
  const cost = applied.reduce((current, modifier) => applyCostModifier(current, modifier), base)
  return { cost, applied }
}

export function consumeCostModifiers(fighter: BattleFighterState, ability: BattleAbilityTemplate) {
  fighter.costModifiers = fighter.costModifiers
    .map((modifier) => {
      if (!matchesCostModifier(modifier, ability) || modifier.remainingUses == null) return modifier
      return { ...modifier, remainingUses: Math.max(0, modifier.remainingUses - 1) }
    })
    .filter((modifier) => modifier.remainingRounds > 0 && (modifier.remainingUses == null || modifier.remainingUses > 0))
}
