import { countEnergyCost, getAbilityEnergyCost } from '@/features/battle/energy'
import { passiveTriggerOrder } from '@/features/battle/reactions'
import type {
  BattleAbilityTemplate,
  BattleFighterTemplate,
  BattleModifierMode,
  BattleModifierScope,
  BattleModifierStat,
  BattleReactionCondition,
  PassiveEffect,
  SkillEffect,
} from '@/features/battle/types'

export type BattleContentSetup = {
  playerTeamIds: string[]
  enemyTeamIds: string[]
}

export type BattleContentValidationReport = {
  errors: string[]
}

type EffectValidationContext =
  | { source: 'ability' }
  | { source: 'passive'; trigger: PassiveEffect['trigger'] }

const supportedPassiveTriggers: PassiveEffect['trigger'][] = [...passiveTriggerOrder]
const supportedStatuses = ['stun', 'invincible', 'mark', 'burn', 'attackUp']
const supportedModifierStats: BattleModifierStat[] = ['damageDealt', 'damageTaken', 'healDone', 'healTaken', 'cooldownTick', 'dotDamage', 'canAct', 'isInvulnerable']
const supportedModifierModes: BattleModifierMode[] = ['flat', 'percentAdd', 'multiplier', 'set']
const supportedModifierScopes: BattleModifierScope[] = ['fighter', 'team', 'battlefield']

function pushIssue(issues: string[], scope: string, message: string) {
  issues.push(`${scope}: ${message}`)
}

function isUnique(values: string[]) {
  return new Set(values).size === values.length
}

function validateCondition(scope: string, condition: BattleReactionCondition, issues: string[]) {
  switch (condition.type) {
    case 'selfHpBelow':
    case 'targetHpBelow':
      if (condition.threshold <= 0 || condition.threshold >= 1) {
        pushIssue(issues, scope, 'threshold must be between 0 and 1')
      }
      return
    case 'actorHasStatus':
    case 'targetHasStatus':
      if (!supportedStatuses.includes(condition.status)) {
        pushIssue(issues, scope, `unsupported status "${condition.status}"`)
      }
      return
    case 'abilityId':
      if (!condition.abilityId.trim()) pushIssue(issues, scope, 'abilityId is required')
      return
    case 'abilityTag':
    case 'isUltimate':
      return
  }
}

function validateEmbeddedAbility(scope: string, ability: BattleAbilityTemplate, issues: string[]) {
  if (!ability.id.trim()) pushIssue(issues, scope, 'replacement ability id is required')
  if (!ability.name.trim()) pushIssue(issues, scope, 'replacement ability name is required')
  if (!ability.description.trim()) pushIssue(issues, scope, 'replacement ability description is required')
  if (ability.cooldown < 0) pushIssue(issues, scope, 'replacement ability cooldown cannot be negative')
  if (ability.tags.length === 0) pushIssue(issues, scope, 'replacement ability requires at least one tag')
  if ((ability.effects?.length ?? 0) === 0 && ability.kind !== 'pass') {
    pushIssue(issues, scope, 'replacement ability requires at least one effect')
  }

  ;(ability.effects ?? []).forEach((effect, index) =>
    validateSkillEffect(`${scope} effect ${index + 1}`, effect, issues, { source: 'ability' }),
  )
}

function validateSkillEffect(
  scope: string,
  effect: SkillEffect,
  issues: string[],
  context: EffectValidationContext,
) {
  switch (effect.type) {
    case 'damage':
    case 'heal':
      if (effect.power <= 0) pushIssue(issues, scope, `${effect.type} power must be positive`)
      return
    case 'invulnerable':
    case 'stun':
      if (effect.duration <= 0) pushIssue(issues, scope, 'duration must be positive')
      return
    case 'attackUp':
      if (effect.amount <= 0) pushIssue(issues, scope, 'damage bonus amount must be positive')
      if (effect.duration <= 0) pushIssue(issues, scope, 'damage bonus duration must be positive')
      return
    case 'mark':
      if (effect.bonus <= 0) pushIssue(issues, scope, 'mark bonus must be positive')
      if (effect.duration <= 0) pushIssue(issues, scope, 'mark duration must be positive')
      return
    case 'burn':
      if (effect.damage <= 0) pushIssue(issues, scope, 'burn damage must be positive')
      if (effect.duration <= 0) pushIssue(issues, scope, 'burn duration must be positive')
      return
    case 'cooldownReduction':
      if (effect.amount <= 0) pushIssue(issues, scope, 'cooldownReduction amount must be positive')
      if (context.source !== 'passive' || context.trigger !== 'whileAlive' || effect.target !== 'self') {
        pushIssue(issues, scope, 'cooldownReduction is only supported on self-targeted whileAlive passives')
      }
      return
    case 'damageBoost':
      if (effect.amount <= 0) pushIssue(issues, scope, 'damageBoost amount must be positive')
      if (context.source !== 'passive' || !['whileAlive', 'onTargetBelow'].includes(context.trigger) || effect.target !== 'self') {
        pushIssue(issues, scope, 'damageBoost is only supported on self-targeted whileAlive or onTargetBelow passives')
      }
      return
    case 'addModifier':
      if (!effect.modifier.label.trim()) pushIssue(issues, scope, 'addModifier label is required')
      if (!supportedModifierStats.includes(effect.modifier.stat)) pushIssue(issues, scope, `unsupported modifier stat "${effect.modifier.stat}"`)
      if (!supportedModifierModes.includes(effect.modifier.mode)) pushIssue(issues, scope, `unsupported modifier mode "${effect.modifier.mode}"`)
      if (effect.modifier.scope && !supportedModifierScopes.includes(effect.modifier.scope)) pushIssue(issues, scope, `unsupported modifier scope "${effect.modifier.scope}"`)
      if (effect.modifier.duration.kind === 'rounds' && effect.modifier.duration.rounds <= 0) pushIssue(issues, scope, 'addModifier round duration must be positive')
      if ((effect.modifier.mode === 'flat' || effect.modifier.mode === 'percentAdd' || effect.modifier.mode === 'multiplier') && typeof effect.modifier.value !== 'number') {
        pushIssue(issues, scope, 'numeric modifier modes require a numeric value')
      }
      if (effect.modifier.mode === 'set' && typeof effect.modifier.value !== 'boolean' && typeof effect.modifier.value !== 'string' && typeof effect.modifier.value !== 'number') {
        pushIssue(issues, scope, 'set modifiers require a serializable value')
      }
      return
    case 'removeModifier':
      if (!effect.filter.label && !effect.filter.stat && !effect.filter.statusKind && (effect.filter.tags?.length ?? 0) === 0 && !effect.filter.scope) {
        pushIssue(issues, scope, 'removeModifier requires at least one filter field')
      }
      if (effect.filter.stat && !supportedModifierStats.includes(effect.filter.stat)) pushIssue(issues, scope, `unsupported removeModifier stat "${effect.filter.stat}"`)
      if (effect.filter.scope && !supportedModifierScopes.includes(effect.filter.scope)) pushIssue(issues, scope, `unsupported removeModifier scope "${effect.filter.scope}"`)
      return
    case 'schedule':
      if (effect.delay <= 0) pushIssue(issues, scope, 'schedule delay must be positive')
      if (effect.effects.length === 0) pushIssue(issues, scope, 'schedule must include nested effects')
      effect.effects.forEach((nestedEffect, index) =>
        validateSkillEffect(`${scope} nested effect ${index + 1}`, nestedEffect, issues, context),
      )
      return
    case 'replaceAbility':
      if (effect.duration <= 0) pushIssue(issues, scope, 'replaceAbility duration must be positive')
      if (!effect.slotAbilityId.trim()) pushIssue(issues, scope, 'replaceAbility slotAbilityId is required')
      validateEmbeddedAbility(`${scope} replacement`, effect.ability, issues)
      return
  }
}

function validatePassive(scope: string, passive: PassiveEffect, issues: string[]) {
  if (!passive.label.trim()) pushIssue(issues, scope, 'passive label is required')
  if (passive.effects.length === 0) pushIssue(issues, scope, 'passive must include at least one effect')
  if (!supportedPassiveTriggers.includes(passive.trigger)) {
    pushIssue(issues, scope, `unsupported passive trigger "${passive.trigger}"`)
  }
  if (passive.trigger === 'onTargetBelow') {
    if (typeof passive.threshold === 'number' && (passive.threshold <= 0 || passive.threshold >= 1)) {
      pushIssue(issues, scope, 'onTargetBelow threshold must be between 0 and 1')
    }
    const hasTargetThreshold = (passive.conditions ?? []).some((condition) => condition.type === 'targetHpBelow')
    if (passive.threshold == null && !hasTargetThreshold) {
      pushIssue(issues, scope, 'onTargetBelow requires a legacy threshold or targetHpBelow condition')
    }
  }

  passive.conditions?.forEach((condition, index) => {
    validateCondition(`${scope} condition ${index + 1}`, condition, issues)
  })

  passive.effects.forEach((effect, index) =>
    validateSkillEffect(`${scope} effect ${index + 1}`, effect, issues, {
      source: 'passive',
      trigger: passive.trigger,
    }),
  )
}

function validateAbility(fighter: BattleFighterTemplate, ability: BattleAbilityTemplate, issues: string[], seenIds: Set<string>) {
  const scope = `${fighter.id}.${ability.id}`
  const effects = ability.effects ?? []
  if (!ability.id.startsWith(`${fighter.id}-`) && ability.id !== 'pass') {
    pushIssue(issues, scope, 'ability id should be prefixed with the fighter id')
  }
  if (!ability.name.trim()) pushIssue(issues, scope, 'ability name is required')
  if (!ability.description.trim()) pushIssue(issues, scope, 'ability description is required')
  if (ability.cooldown < 0) pushIssue(issues, scope, 'cooldown cannot be negative')
  if (ability.tags.length === 0) pushIssue(issues, scope, 'ability requires at least one tag')
  if (ability.targetRule === 'none' && ability.kind !== 'pass') {
    pushIssue(issues, scope, 'only pass abilities should use targetRule "none"')
  }
  if (ability.kind === 'pass' && ability.id !== 'pass') {
    pushIssue(issues, scope, 'fighter kits should not define custom pass abilities')
  }

  if (seenIds.has(ability.id)) {
    pushIssue(issues, scope, 'ability id must be globally unique')
  }
  seenIds.add(ability.id)

  const hasManualCostOverride = Boolean(ability.energyCost && Object.keys(ability.energyCost).length > 0)

  if (ability.energyCost) {
    Object.entries(ability.energyCost).forEach(([type, value]) => {
      if (!Number.isFinite(value) || value < 0) pushIssue(issues, scope, `manual ${type} cost must be zero or higher`)
      if (!Number.isInteger(value)) pushIssue(issues, scope, `manual ${type} cost must be a whole number`)
    })
  }

  if (!hasManualCostOverride) {
    const cost = countEnergyCost(getAbilityEnergyCost(ability))
    if (cost > 3) pushIssue(issues, scope, 'energy cost exceeds a single-round reserve budget')
  }

  if (ability.tags.includes('ULT') !== (fighter.ultimate.id === ability.id)) {
    pushIssue(issues, scope, 'ULT tag must appear only on the fighter ultimate')
  }

  if (ability.kind === 'attack' && !effects.some((effect) => effect.type === 'damage')) {
    pushIssue(issues, scope, 'attack abilities require at least one damage effect')
  }
  if (ability.kind === 'heal' && !effects.some((effect) => effect.type === 'heal')) {
    pushIssue(issues, scope, 'heal abilities require at least one heal effect')
  }
  if (ability.kind !== 'pass' && effects.length === 0) {
    pushIssue(issues, scope, 'ability requires at least one effect')
  }

  effects.forEach((effect, index) =>
    validateSkillEffect(`${scope} effect ${index + 1}`, effect, issues, { source: 'ability' }),
  )
}

function validateTeamIds(label: 'player' | 'enemy', ids: string[], rosterIds: Set<string>, issues: string[]) {
  if (ids.length !== 3) pushIssue(issues, `${label}Team`, 'default setup must contain exactly 3 fighters')
  if (!isUnique(ids)) pushIssue(issues, `${label}Team`, 'default setup contains duplicate fighter ids')
  ids.forEach((id) => {
    if (!rosterIds.has(id)) pushIssue(issues, `${label}Team`, `unknown fighter id "${id}"`)
  })
}

export function validateBattleContent(
  roster: BattleFighterTemplate[],
  setup?: BattleContentSetup,
): BattleContentValidationReport {
  const errors: string[] = []
  const fighterIds = roster.map((fighter) => fighter.id)
  const rosterIdSet = new Set(fighterIds)
  const seenAbilityIds = new Set<string>()

  if (roster.length === 0) pushIssue(errors, 'roster', 'battle roster cannot be empty')
  if (!isUnique(fighterIds)) pushIssue(errors, 'roster', 'fighter ids must be unique')

  roster.forEach((fighter) => {
    const scope = `fighter.${fighter.id}`
    if (!fighter.id.trim()) pushIssue(errors, scope, 'fighter id is required')
    if (!fighter.name.trim()) pushIssue(errors, scope, 'fighter name is required')
    if (!fighter.shortName.trim()) pushIssue(errors, scope, 'fighter shortName is required')
    if (fighter.maxHp <= 0) pushIssue(errors, scope, 'maxHp must be positive')
    if (fighter.abilities.length !== 3) pushIssue(errors, scope, 'fighters must define exactly 3 standard abilities')

    const localAbilityIds = fighter.abilities.map((ability) => ability.id)
    if (!isUnique(localAbilityIds)) pushIssue(errors, scope, 'fighter has duplicate standard ability ids')
    if (localAbilityIds.includes(fighter.ultimate.id)) pushIssue(errors, scope, 'ultimate id must not duplicate a standard ability id')

    fighter.passiveEffects?.forEach((passive, index) => {
      validatePassive(`${scope}.passive.${index + 1}`, passive, errors)
    })

    fighter.abilities.forEach((ability) => validateAbility(fighter, ability, errors, seenAbilityIds))
    validateAbility(fighter, fighter.ultimate, errors, seenAbilityIds)
  })

  if (setup) {
    validateTeamIds('player', setup.playerTeamIds, rosterIdSet, errors)
    validateTeamIds('enemy', setup.enemyTeamIds, rosterIdSet, errors)
  }

  return { errors }
}

export function assertValidBattleContent(roster: BattleFighterTemplate[], setup?: BattleContentSetup) {
  const report = validateBattleContent(roster, setup)
  if (report.errors.length > 0) {
    throw new Error(`Battle content validation failed:\n${report.errors.join('\n')}`)
  }
}




