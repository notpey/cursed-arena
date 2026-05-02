import {
  cloneAbilityTemplate,
  clonePassiveEffect,
  cloneScheduledEffect,
} from '@/features/battle/reactions.ts'
import { cloneModifiers } from '@/features/battle/modifiers.ts'
import { cloneStatuses } from '@/features/battle/statuses.ts'
import type {
  BattleAbilityStateDelta,
  BattleCostModifierState,
  BattleEffectImmunityState,
  BattleFighterState,
  BattleShieldState,
  BattleState,
  SkillEffect,
} from '@/features/battle/types.ts'

export function cloneAbilityStateDelta(delta: BattleAbilityStateDelta): BattleAbilityStateDelta {
  switch (delta.mode) {
    case 'replace':
      return { ...delta, replacement: cloneAbilityTemplate(delta.replacement) }
    case 'grant':
      return { ...delta, grantedAbility: cloneAbilityTemplate(delta.grantedAbility) }
    case 'lock':
      return { ...delta }
  }
}

export function cloneCostModifier(modifier: BattleCostModifierState): BattleCostModifierState {
  return {
    ...modifier,
    cost: modifier.cost ? { ...modifier.cost } : undefined,
  }
}

export function cloneEffectImmunity(immunity: BattleEffectImmunityState): BattleEffectImmunityState {
  return {
    ...immunity,
    blocks: [...immunity.blocks],
  }
}

export function cloneShield(shield: BattleShieldState | null): BattleShieldState | null {
  return shield ? { ...shield, tags: [...shield.tags] } : null
}

export function cloneEffect(effect: SkillEffect): SkillEffect {
  switch (effect.type) {
    case 'schedule':
      return { ...effect, effects: effect.effects.map(cloneEffect) }
    case 'conditional':
      return {
        ...effect,
        conditions: effect.conditions.map((condition) => ({ ...condition })),
        effects: effect.effects.map(cloneEffect),
        elseEffects: effect.elseEffects?.map(cloneEffect),
      }
    case 'reaction':
      return { ...effect, abilityClasses: effect.abilityClasses ? [...effect.abilityClasses] : undefined, effects: effect.effects.map(cloneEffect) }
    case 'replaceAbility':
      return { ...effect, ability: cloneAbilityTemplate(effect.ability) }
    case 'replaceAbilities':
      return { ...effect, replacements: effect.replacements.map((replacement) => ({ ...replacement, ability: cloneAbilityTemplate(replacement.ability) })) }
    case 'modifyAbilityState':
      return { ...effect, delta: cloneAbilityStateDelta(effect.delta) }
    default:
      return { ...effect }
  }
}

export function cloneFighter(fighter: BattleFighterState): BattleFighterState {
  return {
    ...fighter,
    passiveEffects: fighter.passiveEffects?.map(clonePassiveEffect),
    abilities: fighter.abilities.map(cloneAbilityTemplate),
    ultimate: cloneAbilityTemplate(fighter.ultimate),
    cooldowns: { ...fighter.cooldowns },
    statuses: cloneStatuses(fighter.statuses),
    modifiers: cloneModifiers(fighter.modifiers),
    abilityState: fighter.abilityState.map(cloneAbilityStateDelta),
    shield: cloneShield(fighter.shield),
    costModifiers: fighter.costModifiers.map(cloneCostModifier),
    effectImmunities: fighter.effectImmunities.map(cloneEffectImmunity),
    stateFlags: { ...fighter.stateFlags },
    stateCounters: { ...fighter.stateCounters },
    stateModes: { ...fighter.stateModes },
    stateModeDurations: Object.fromEntries(
      Object.entries(fighter.stateModeDurations ?? {}).map(([key, duration]) => [key, { ...duration }]),
    ),
    lastUsedAbilityId: fighter.lastUsedAbilityId,
    previousUsedAbilityId: fighter.previousUsedAbilityId,
    abilityHistory: fighter.abilityHistory.map((entry) => ({ ...entry })),
    classStuns: fighter.classStuns.map((cs) => ({
      ...cs,
      blockedClasses: [...cs.blockedClasses],
      exemptClasses: cs.exemptClasses ? [...cs.exemptClasses] : undefined,
    })),
    reactionGuards: fighter.reactionGuards.map((guard) => ({
      ...guard,
      abilityClasses: guard.abilityClasses ? [...guard.abilityClasses] : undefined,
      triggeredRounds: guard.triggeredRounds ? [...guard.triggeredRounds] : undefined,
      effects: guard.effects ? guard.effects.map(cloneEffect) : undefined,
    })),
    lastAttackerId: fighter.lastAttackerId,
  }
}

export function cloneState(state: BattleState): BattleState {
  return {
    ...state,
    battlefield: { ...state.battlefield },
    playerEnergy: { ...state.playerEnergy },
    enemyEnergy: { ...state.enemyEnergy },
    playerTeam: state.playerTeam.map(cloneFighter),
    enemyTeam: state.enemyTeam.map(cloneFighter),
    playerTeamModifiers: cloneModifiers(state.playerTeamModifiers),
    enemyTeamModifiers: cloneModifiers(state.enemyTeamModifiers),
    battlefieldModifiers: cloneModifiers(state.battlefieldModifiers),
    scheduledEffects: state.scheduledEffects.map(cloneScheduledEffect),
  }
}
