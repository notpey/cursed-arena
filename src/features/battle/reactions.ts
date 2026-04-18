import type {
  BattleAbilityStateDelta,
  BattleAbilityTemplate,
  BattleReactionCondition,
  BattleScheduledEffect,
  PassiveEffect,
  PassiveTrigger,
  SkillEffect,
} from '@/features/battle/types.ts'

export const passiveTriggerOrder: PassiveTrigger[] = [
  'whileAlive',
  'onRoundStart',
  'onRoundEnd',
  'onAbilityUse',
  'onAbilityResolve',
  'onDealDamage',
  'onTakeDamage',
  'onShieldBroken',
  'onDefeat',
  'onDefeatEnemy',
  'onTargetBelow',
]

export function cloneAbilityTemplate(ability: BattleAbilityTemplate): BattleAbilityTemplate {
  return {
    ...ability,
    icon: { ...ability.icon },
    energyCost: ability.energyCost ? { ...ability.energyCost } : undefined,
    effects: ability.effects?.map(cloneSkillEffect),
  }
}

function cloneAbilityStateDelta(delta: BattleAbilityStateDelta): BattleAbilityStateDelta {
  switch (delta.mode) {
    case 'replace':
      return { ...delta, replacement: cloneAbilityTemplate(delta.replacement) }
    case 'grant':
      return { ...delta, grantedAbility: cloneAbilityTemplate(delta.grantedAbility) }
    case 'lock':
      return { ...delta }
  }
}

export function cloneSkillEffect(effect: SkillEffect): SkillEffect {
  switch (effect.type) {
    case 'schedule':
      return {
        ...effect,
        effects: effect.effects.map(cloneSkillEffect),
      }
    case 'replaceAbility':
      return {
        ...effect,
        ability: cloneAbilityTemplate(effect.ability),
      }
    case 'modifyAbilityState':
      return {
        ...effect,
        delta: cloneAbilityStateDelta(effect.delta),
      }
    default:
      return { ...effect }
  }
}

export function clonePassiveEffect(passive: PassiveEffect): PassiveEffect {
  return {
    ...passive,
    conditions: passive.conditions?.map(cloneReactionCondition),
    effects: passive.effects.map(cloneSkillEffect),
  }
}

export function cloneScheduledEffect(effect: BattleScheduledEffect): BattleScheduledEffect {
  return {
    ...effect,
    targetIds: [...effect.targetIds],
    effects: effect.effects.map(cloneSkillEffect),
  }
}

export function cloneReactionCondition(condition: BattleReactionCondition): BattleReactionCondition {
  return { ...condition }
}

export function getEffectivePassiveTrigger(passive: PassiveEffect): Exclude<PassiveTrigger, 'onTargetBelow'> {
  return passive.trigger === 'onTargetBelow' ? 'whileAlive' : passive.trigger
}

export function getPassiveConditions(passive: PassiveEffect): BattleReactionCondition[] {
  const conditions = passive.conditions?.map(cloneReactionCondition) ?? []

  if (passive.trigger === 'onTargetBelow' && typeof passive.threshold === 'number') {
    conditions.push({ type: 'targetHpBelow', threshold: passive.threshold })
  }

  return conditions
}

export function describeReactionCondition(condition: BattleReactionCondition) {
  switch (condition.type) {
    case 'selfHpBelow':
      return `self below ${Math.round(condition.threshold * 100)}% HP`
    case 'targetHpBelow':
      return `target below ${Math.round(condition.threshold * 100)}% HP`
    case 'actorHasStatus':
      return `self has ${condition.status}`
    case 'targetHasStatus':
      return `target has ${condition.status}`
    case 'abilityId':
      return `using ${condition.abilityId}`
    case 'abilityClass':
      return `using a ${condition.class} technique`
    case 'fighterFlag':
      return `${condition.key} is ${condition.value ? 'true' : 'false'}`
    case 'counterAtLeast':
      return `${condition.key} at least ${condition.value}`
    case 'usedAbilityLastTurn':
      return `last used ${condition.abilityId}`
    case 'shieldActive':
      return condition.tag ? `shield ${condition.tag} active` : 'any shield active'
    case 'brokenShieldTag':
      return `broken shield had ${condition.tag}`
    case 'isUltimate':
      return 'using an ultimate'
  }
}

