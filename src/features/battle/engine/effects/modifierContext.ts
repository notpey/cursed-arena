import { getAbilityById, isAlive } from '@/features/battle/engine/selectors.ts'
import {
  createModifierInstance,
  getFighterModifierPool,
  getNumericModifierMultiplier,
  getNumericModifierMultiplierForClass,
  hasModifierStatus,
  hasBooleanModifierForStat,
  hasBooleanModifierValue,
  sumNumericModifierValues,
  sumNumericModifierValuesForClass,
} from '@/features/battle/modifiers.ts'
import {
  getEffectivePassiveTrigger,
  getPassiveConditions,
} from '@/features/battle/reactions.ts'
import type {
  BattleAbilityTemplate,
  BattleFighterState,
  BattleModifierInstance,
  BattleModifierStat,
  BattleReactionCondition,
  BattleSkillClass,
  BattleSkillDamageType,
  BattleState,
  BattleStatusKind,
  PassiveEffect,
  PassiveTrigger,
  SkillEffect,
} from '@/features/battle/types.ts'

export type ReactionContext = {
  target: BattleFighterState | null
  ability?: BattleAbilityTemplate
  effect?: SkillEffect
  amount?: number
  isUltimate?: boolean
  brokenShieldTags?: string[]
  round?: number
}

export function matchesReactionCondition(
  actor: BattleFighterState,
  condition: BattleReactionCondition,
  context: ReactionContext,
) {
  switch (condition.type) {
    case 'selfHpBelow':
      return actor.maxHp > 0 && actor.hp / actor.maxHp <= condition.threshold
    case 'targetHpBelow':
      return Boolean(context.target && context.target.maxHp > 0 && context.target.hp / context.target.maxHp <= condition.threshold)
    case 'actorHasStatus':
      return hasModifierStatus(actor.modifiers, condition.status)
    case 'targetHasStatus':
      return Boolean(context.target && hasModifierStatus(context.target.modifiers, condition.status))
    case 'actorHasModifierTag':
      return actor.modifiers.some((modifier) => modifier.tags.includes(condition.tag))
    case 'targetHasModifierTag':
      return Boolean(context.target && context.target.modifiers.some((modifier) => modifier.tags.includes(condition.tag)))
    case 'abilityId':
      return context.ability?.id === condition.abilityId
    case 'abilityClass':
      return Boolean(context.ability?.classes.includes(condition.class))
    case 'fighterFlag':
      return (actor.stateFlags[condition.key] ?? false) === condition.value
    case 'actorModeIs':
      return actor.stateModes[condition.key] === condition.value
    case 'targetModeIs':
      return context.target?.stateModes[condition.key] === condition.value
    case 'counterAtLeast':
      return (actor.stateCounters[condition.key] ?? 0) >= condition.value
    case 'targetCounterAtLeast':
      return Boolean(context.target && (context.target.stateCounters[condition.key] ?? 0) >= condition.value)
    case 'usedAbilityLastTurn':
      return actor.lastUsedAbilityId === condition.abilityId
    case 'usedDifferentAbilityLastTurn':
      return actor.lastUsedAbilityId !== null && actor.lastUsedAbilityId !== condition.abilityId
    case 'usedAbilityWithinRounds':
      return actor.lastUsedAbilityId === condition.abilityId
        || actor.previousUsedAbilityId === condition.abilityId
        || actor.abilityHistory.some((entry) => entry.abilityId === condition.abilityId && entry.round >= Math.max(1, context.round ?? 0) - condition.rounds)
    case 'usedAbilityOnTarget':
      return Boolean(context.target && actor.abilityHistory.some((entry) => entry.abilityId === condition.abilityId && entry.targetId === context.target?.instanceId))
    case 'firstAbilityOnTarget':
      return Boolean(context.target && !actor.abilityHistory.some((entry) =>
        entry.targetId === context.target?.instanceId && (!condition.abilityId || entry.abilityId === condition.abilityId),
      ))
    case 'shieldActive':
      return Boolean(actor.shield && (!condition.tag || actor.shield.tags.includes(condition.tag)))
    case 'brokenShieldTag':
      return Boolean(context.brokenShieldTags?.includes(condition.tag))
    case 'isUltimate':
      return context.isUltimate ?? Boolean(context.ability?.classes.includes('Ultimate'))
  }
}

export function getTriggeredPassiveEffects(
  actor: BattleFighterState,
  trigger: Exclude<PassiveTrigger, 'onTargetBelow'>,
  context: ReactionContext,
) {
  if (trigger === 'whileAlive' && !isAlive(actor)) return [] as Array<{ passive: PassiveEffect; effects: SkillEffect[] }>

  return (actor.passiveEffects ?? [])
    .filter((passive) => getEffectivePassiveTrigger(passive) === trigger)
    .filter((passive) => getPassiveConditions(passive).every((condition) => matchesReactionCondition(actor, condition, context)))
    .map((passive) => ({ passive, effects: passive.effects }))
}

function createPassiveModifier(
  actor: BattleFighterState,
  passiveId: string,
  effect: Extract<SkillEffect, { type: 'damageBoost' | 'cooldownReduction' }>,
): BattleModifierInstance {
  return createModifierInstance(
    effect.type === 'damageBoost'
      ? {
          label: 'Passive Damage Boost',
          stat: 'damageDealt',
          mode: 'percentAdd',
          value: effect.amount,
          duration: { kind: 'untilRemoved' },
          tags: ['passive', 'damageBoost'],
          visible: false,
          stacking: 'stack',
        }
      : {
          label: 'Passive Cooldown Reduction',
          stat: 'cooldownTick',
          mode: 'flat',
          value: effect.amount,
          duration: { kind: 'untilRemoved' },
          tags: ['passive', 'cooldownReduction'],
          visible: false,
          stacking: 'stack',
        },
    {
      scope: 'fighter',
      targetId: actor.instanceId,
      sourceActorId: actor.instanceId,
      sourceAbilityId: passiveId,
    },
  )
}

export function getPassiveModifiers(actor: BattleFighterState, context: ReactionContext) {
  return getTriggeredPassiveEffects(actor, 'whileAlive', context)
    .flatMap((entry) => entry.effects.map((effect) => ({ passive: entry.passive, effect })))
    .flatMap(({ passive, effect }) => {
      if (effect.type === 'damageBoost' || effect.type === 'cooldownReduction') {
        const passiveId = passive.id ?? passive.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        return [createPassiveModifier(actor, passiveId, effect)]
      }
      return []
    })
}

export function getModifierPool(state: BattleState, fighter: BattleFighterState, context: ReactionContext) {
  return getFighterModifierPool(state, fighter).concat(getPassiveModifiers(fighter, context))
}

export function getNumericModifierTotal(
  state: BattleState,
  fighter: BattleFighterState,
  stat: BattleModifierStat,
  mode: 'flat' | 'percentAdd',
  context: ReactionContext,
  filter: { tags?: string[]; statusKind?: BattleStatusKind } = {},
) {
  return sumNumericModifierValues(getModifierPool(state, fighter, context), stat, mode, filter)
}

export function getModifierMultiplier(
  state: BattleState,
  fighter: BattleFighterState,
  stat: BattleModifierStat,
  context: ReactionContext,
  filter: { tags?: string[]; statusKind?: BattleStatusKind } = {},
) {
  return getNumericModifierMultiplier(getModifierPool(state, fighter, context), stat, filter)
}

export function hasModifierBoolean(
  state: BattleState,
  fighter: BattleFighterState,
  stat: BattleModifierStat,
  expected: boolean,
  filter: { statusKind?: BattleStatusKind } = {},
) {
  return hasBooleanModifierValue(getModifierPool(state, fighter, { target: null }), stat, expected, filter)
}

export function calculateDamage(
  state: BattleState,
  actor: BattleFighterState,
  target: BattleFighterState,
  basePower: number,
  isUltimate: boolean,
  isPiercing = false,
  abilityId?: string,
  abilityClasses?: BattleSkillClass[],
) {
  let amount = basePower
  const ability = abilityId ? getAbilityById(actor, abilityId) ?? undefined : undefined
  const actorContext: ReactionContext = { target, ability, isUltimate }
  const targetContext: ReactionContext = { target: actor, ability, isUltimate }
  const damageClass = (abilityClasses ?? ability?.classes ?? []).find(
    (cls): cls is BattleSkillDamageType => ['Physical', 'Piercing', 'Energy', 'Affliction', 'Mental'].includes(cls),
  )

  const actorModifierPool = getModifierPool(state, actor, actorContext)
  amount += sumNumericModifierValuesForClass(actorModifierPool, 'damageDealt', 'flat', damageClass)
  amount = Math.round(amount * (1 + sumNumericModifierValuesForClass(actorModifierPool, 'damageDealt', 'percentAdd', damageClass)))
  amount = Math.round(amount * getNumericModifierMultiplierForClass(actorModifierPool, 'damageDealt', damageClass))

  if (isUltimate) {
    amount = Math.round(amount * (1 + state.battlefield.ultimateDamageBoost))
  }

  const targetModifierPool = getModifierPool(state, target, targetContext)
  const canReduceDamage = !hasBooleanModifierForStat(targetModifierPool, 'canReduceDamageTaken', false)
  const effectiveTargetPool = canReduceDamage
    ? targetModifierPool
    : targetModifierPool.filter((m) => {
        if (m.stat !== 'damageTaken') return true
        if (m.mode === 'flat' && typeof m.value === 'number' && m.value < 0) return false
        if (m.mode === 'percentAdd' && typeof m.value === 'number' && m.value < 0) return false
        if (m.mode === 'multiplier' && typeof m.value === 'number' && m.value < 1) return false
        return true
      })
  const piercingAdjustedTargetPool = isPiercing
    ? effectiveTargetPool.filter((m) => {
        if (m.stat !== 'damageTaken') return true
        if (m.tags.includes('unpierceable')) return true
        if (m.mode === 'flat' && typeof m.value === 'number' && m.value < 0) return false
        if (m.mode === 'percentAdd' && typeof m.value === 'number' && m.value < 0) return false
        if (m.mode === 'multiplier' && typeof m.value === 'number' && m.value < 1) return false
        return true
      })
    : effectiveTargetPool
  amount += sumNumericModifierValuesForClass(piercingAdjustedTargetPool, 'damageTaken', 'flat', damageClass)
  amount = Math.round(amount * (1 + sumNumericModifierValuesForClass(piercingAdjustedTargetPool, 'damageTaken', 'percentAdd', damageClass)))
  amount = Math.round(amount * getNumericModifierMultiplierForClass(piercingAdjustedTargetPool, 'damageTaken', damageClass))

  return Math.max(0, amount)
}

export function calculateHealing(
  state: BattleState,
  actor: BattleFighterState,
  target: BattleFighterState,
  basePower: number,
  abilityId?: string,
) {
  let amount = basePower
  const ability = abilityId ? getAbilityById(actor, abilityId) ?? undefined : undefined
  const actorContext: ReactionContext = { target, ability, isUltimate: ability?.classes.includes('Ultimate') ?? false }
  const targetContext: ReactionContext = { target: actor, ability, isUltimate: ability?.classes.includes('Ultimate') ?? false }

  amount += getNumericModifierTotal(state, actor, 'healDone', 'flat', actorContext)
  amount = Math.round(amount * (1 + getNumericModifierTotal(state, actor, 'healDone', 'percentAdd', actorContext)))
  amount = Math.round(amount * getModifierMultiplier(state, actor, 'healDone', actorContext))

  amount += getNumericModifierTotal(state, target, 'healTaken', 'flat', targetContext)
  amount = Math.round(amount * (1 + getNumericModifierTotal(state, target, 'healTaken', 'percentAdd', targetContext)))
  amount = Math.round(amount * getModifierMultiplier(state, target, 'healTaken', targetContext))

  return Math.max(0, amount)
}
