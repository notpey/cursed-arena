import {
  PASS_ABILITY_ID,
  battleRosterById,
  defaultBattleSetup,
} from '@/features/battle/data.ts'
import {
  getCooldown,
  getFighterById,
  getOpposingTeam,
  getTeam,
  getVisibleAbilities,
  isAlive,
  getAbilityById,
} from '@/features/battle/engine/selectors.ts'
import {
  cloneEffect,
  cloneState,
} from '@/features/battle/engine/clone.ts'
import {
  tickAbilityState,
  tickClassStuns,
  tickCostModifiers,
  tickEffectImmunities,
  tickReactionGuards,
} from '@/features/battle/engine/tick.ts'
import {
  emitCounterChange,
  emitFlagChange,
  emitModifierApplied,
  emitModifierRemoved,
  emitResourceChange,
  emitRemovedStatusEvents,
  emitShieldEvent,
  makeEvent,
  makeRuntimeEvent,
} from '@/features/battle/engine/events.ts'
import {
  consumeCostModifiers,
  createCostModifierState,
  getResolvedAbilityEnergyCost,
} from '@/features/battle/engine/costModifier.ts'
import { buildEnemyCommands } from '@/features/battle/engine/ai.ts'
import {
  getWinner,
  getVictoryTone,
  getVictoryMessage,
} from '@/features/battle/engine/victory.ts'
import {
  battleEnergyOrder,
  canPayEnergy,
  countEnergyCost,
  createEnergyAmounts,
  createRoundEnergyPool,
  getRefreshGain,
  getSpentEnergyAmounts,
  refreshRoundEnergy,
  spendEnergy,
  sumEnergyCosts,
  type BattleEnergyCost,
  type BattleEnergyType,
} from '@/features/battle/energy.ts'
import { createSeededRandom } from '@/features/battle/random.ts'
import {
  cloneAbilityTemplate,
  clonePassiveEffect,
  getEffectivePassiveTrigger,
  getPassiveConditions,
} from '@/features/battle/reactions.ts'
import {
  createModifierInstance,
  createModifiers,
  getFighterModifierPool,
  getNumericModifierMultiplier,
  getNumericModifierMultiplierForClass,
  getTeamModifierBucket,
  hasBooleanModifierValue,
  hasBooleanModifierForStat,
  hasModifierStatus,
  removeModifiers,
  setTeamModifierBucket,
  sumNumericModifierValues,
  sumNumericModifierValuesForClass,
  syncFighterStatusesFromModifiers,
  tickModifiers,
  upsertModifier,
} from '@/features/battle/modifiers.ts'
import { createStatuses } from '@/features/battle/statuses.ts'
import { BATTLE_STATE_SCHEMA_VERSION } from '@/features/battle/types.ts'
import type {
  BattleAbilityStateDelta,
  BattleAbilityTemplate,
  BattleClassStunState,
  BattleDamagePacket,
  BattleEffectImmunityState,
  BattleFighterState,
  BattleHealPacket,
  BattleModifierFilter,
  BattleModifierInstance,
  BattleModifierStat,
  BattleModifierTemplate,
  BattleReactionCondition,
  BattleReactionGuardState,
  BattleReactionTrigger,
  BattleResolutionResult,
  BattleResourceKey,
  BattleScheduledPhase,
  BattleSkillClass,
  BattleSkillDamageType,
  BattleState,
  BattleStatusKind,
  BattleTeamId,
  BattleTimelineResult,
  BattleTimelineStep,
  BattleTimelineStepKind,
  PassiveEffect,
  PassiveTrigger,
  QueuedBattleAction,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'
type ReactionContext = {
  target: BattleFighterState | null
  ability?: BattleAbilityTemplate
  effect?: SkillEffect
  amount?: number
  isUltimate?: boolean
  brokenShieldTags?: string[]
  round?: number
}

type PreDamageReactionResult = {
  cancelAction: boolean
  reflectedTargetIds: Set<string>
}

function buildOrderedActionIds(
  aliveFighters: BattleFighterState[],
  actionOrder?: string[],
) {
  if (actionOrder && actionOrder.length > 0) {
    const remaining = aliveFighters
      .filter((fighter) => !actionOrder.includes(fighter.instanceId))
      .sort((a, b) => a.slot - b.slot)
      .map((fighter) => fighter.instanceId)

    return [...actionOrder, ...remaining]
  }

  return aliveFighters
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((fighter) => fighter.instanceId)
}

function createTimelineStep(
  kind: BattleTimelineStepKind,
  state: BattleState,
  ctx: ResolutionContext,
  previousEventCount: number,
  previousRuntimeCount: number,
  payload: Omit<BattleTimelineStep, 'id' | 'kind' | 'round' | 'state' | 'events' | 'runtimeEvents'> = {},
): BattleTimelineStep | null {
  const events = ctx.events.slice(previousEventCount)
  const runtimeEvents = ctx.runtimeEvents.slice(previousRuntimeCount)

  if (events.length === 0 && runtimeEvents.length === 0) {
    return null
  }

  return {
    id: `timeline-${kind}-${state.round}-${previousRuntimeCount}-${previousEventCount}`,
    kind,
    round: state.round,
    state: cloneState(state),
    events,
    runtimeEvents,
    ...payload,
  }
}

function instantiateTeam(team: BattleTeamId, templateIds: string[]) {
  return templateIds
    .map((templateId, slot) => {
      const template = battleRosterById[templateId]
      if (!template) return null

      return {
        instanceId: `${team}-${template.id}-${slot}`,
        templateId: template.id,
        team,
        slot,
        name: template.name,
        shortName: template.shortName,
        rarity: template.rarity,
        role: template.role,
        affiliationLabel: template.affiliationLabel,
        battleTitle: template.battleTitle,
        bio: template.bio,
        boardPortraitSrc: template.boardPortraitSrc,
        portraitFrame: template.portraitFrame,
        boardPortraitFrame: template.boardPortraitFrame,
        maxHp: template.maxHp,
        hp: template.maxHp,
        passiveEffects: template.passiveEffects?.map(clonePassiveEffect),
        abilities: template.abilities.map(cloneAbilityTemplate),
        ultimate: cloneAbilityTemplate(template.ultimate),
        cooldowns: Object.fromEntries(
          template.abilities.concat(template.ultimate).map((ability) => [ability.id, 0]),
        ),
        statuses: createStatuses(),
        modifiers: createModifiers(),
        abilityState: [],
        shield: null,
        costModifiers: [],
        effectImmunities: [],
        stateFlags: {},
        stateCounters: { ...(template.initialStateCounters ?? {}) },
        stateModes: { ...(template.initialStateModes ?? {}) },
        stateModeDurations: {},
        lastUsedAbilityId: null,
        previousUsedAbilityId: null,
        abilityHistory: [],
        classStuns: [],
        reactionGuards: [],
        lastAttackerId: null,
      }
    })
    .filter(Boolean) as BattleFighterState[]
}

function hasBaseAbility(fighter: BattleFighterState, slotAbilityId: string) {
  return fighter.abilities.some((ability) => ability.id === slotAbilityId) || fighter.ultimate.id === slotAbilityId
}

function ensureCooldownEntry(fighter: BattleFighterState, abilityId: string) {
  if (!(abilityId in fighter.cooldowns)) {
    fighter.cooldowns[abilityId] = 0
  }
}

function addAbilityStateDelta(fighter: BattleFighterState, delta: BattleAbilityStateDelta) {
  switch (delta.mode) {
    case 'replace':
      fighter.abilityState = fighter.abilityState.filter(
        (current) => !(current.mode === 'replace' && current.slotAbilityId === delta.slotAbilityId),
      )
      fighter.abilityState.push({ ...delta, replacement: cloneAbilityTemplate(delta.replacement) })
      ensureCooldownEntry(fighter, delta.replacement.id)
      return
    case 'grant':
      fighter.abilityState = fighter.abilityState.filter(
        (current) => !(current.mode === 'grant' && current.grantedAbility.id === delta.grantedAbility.id),
      )
      fighter.abilityState.push({ ...delta, grantedAbility: cloneAbilityTemplate(delta.grantedAbility) })
      ensureCooldownEntry(fighter, delta.grantedAbility.id)
      return
    case 'lock':
      fighter.abilityState = fighter.abilityState.filter(
        (current) => !(current.mode === 'lock' && current.slotAbilityId === delta.slotAbilityId),
      )
      fighter.abilityState.push({ ...delta })
      return
  }
}

function createClassStunState(
  actor: BattleFighterState,
  abilityId: string | undefined,
  effect: Extract<SkillEffect, { type: 'classStun' }>,
  round: number,
): BattleClassStunState {
  return {
    id: `classstun-${actor.instanceId}-${abilityId ?? 'passive'}-${Date.now()}`,
    label: `Class Stun (${effect.blockedClasses.join(', ')})`,
    blockedClasses: [...effect.blockedClasses],
    remainingRounds: effect.duration,
    appliedInRound: round,
    sourceActorId: actor.instanceId,
    sourceAbilityId: abilityId,
  }
}

function createReactionGuardState(
  actor: BattleFighterState,
  abilityId: string | undefined,
  effect: Extract<SkillEffect, { type: 'counter' | 'reflect' | 'reaction' }>,
  round: number,
): BattleReactionGuardState {
  return {
    id: `reaction-${effect.type}-${actor.instanceId}-${abilityId ?? 'passive'}-${Date.now()}`,
    kind: effect.type === 'reaction' ? 'effect' : effect.type,
    label: effect.type === 'counter' ? 'Counter' : effect.type === 'reflect' ? 'Reflect' : effect.label,
    remainingRounds: effect.duration,
    appliedInRound: round,
    counterDamage: effect.type === 'counter' ? effect.counterDamage : undefined,
    abilityClasses: effect.abilityClasses ? [...effect.abilityClasses] : undefined,
    consumeOnTrigger: effect.consumeOnTrigger ?? true,
    trigger: effect.type === 'reaction' ? effect.trigger : undefined,
    harmfulOnly: effect.type === 'reaction' ? effect.harmfulOnly : undefined,
    oncePerRound: effect.type === 'reaction' ? effect.oncePerRound : undefined,
    triggeredRounds: effect.type === 'reaction' ? [] : undefined,
    effects: effect.type === 'reaction' ? effect.effects.map(cloneEffect) : undefined,
    sourceActorId: actor.instanceId,
    sourceAbilityId: abilityId,
  }
}

function isAbilityClassStunned(fighter: BattleFighterState, ability: BattleAbilityTemplate): boolean {
  return fighter.classStuns.some((cs) =>
    cs.remainingRounds > 0 && ability.classes.some((cls) => cs.blockedClasses.includes(cls)),
  )
}

function createEffectImmunityState(
  actor: BattleFighterState,
  abilityId: string | undefined,
  effect: Extract<SkillEffect, { type: 'effectImmunity' }>,
): BattleEffectImmunityState {
  return {
    id: `immunity-${actor.instanceId}-${abilityId ?? 'passive'}-${actor.effectImmunities.length}`,
    label: effect.label,
    blocks: [...effect.blocks],
    remainingRounds: effect.duration,
    tags: effect.tags ? [...effect.tags] : undefined,
    sourceActorId: actor.instanceId,
    sourceAbilityId: abilityId,
  }
}

const damageEffectTypes = new Set(['damage', 'damageScaledByCounter', 'damageFiltered', 'damageEqualToActorShield'])

function isEffectBlocked(target: BattleFighterState, effect: SkillEffect) {
  return target.effectImmunities.some((immunity) =>
    (immunity.blocks as string[]).includes(effect.type)
    || (!damageEffectTypes.has(effect.type) && immunity.blocks.includes('nonDamage')),
  )
}

function setFighterFlag(fighter: BattleFighterState, key: string, value: boolean) {
  fighter.stateFlags[key] = value
}

function adjustFighterCounter(fighter: BattleFighterState, key: string, amount: number) {
  fighter.stateCounters[key] = (fighter.stateCounters[key] ?? 0) + amount
}


function isHarmfulAbility(ability: BattleAbilityTemplate) {
  if (ability.id === PASS_ABILITY_ID) return false
  const targetsEnemy = ability.targetRule === 'enemy-single' || ability.targetRule === 'enemy-all'
  if (!targetsEnemy) return false
  return ability.kind !== 'heal' && ability.kind !== 'defend' && ability.kind !== 'buff' && ability.kind !== 'pass'
}

function getModifierSourceFighter(state: BattleState, modifier: { sourceActorId?: string }) {
  return modifier.sourceActorId ? getFighterById(state, modifier.sourceActorId) : null
}

function targetHasRequiredTags(state: BattleState, target: BattleFighterState, ability: BattleAbilityTemplate) {
  const requiredTags = ability.requiredTargetTags ?? []
  if (requiredTags.length === 0) return true
  return requiredTags.every((tag) => getFighterModifierPool(state, target).some((modifier) => modifier.tags.includes(tag)))
}

function isEffectReflectable(effect: SkillEffect) {
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

function canEffectBeReflected(ability: BattleAbilityTemplate, effect: SkillEffect) {
  if (ability.cannotBeReflected) return false
  if (!isEffectReflectable(effect)) return false
  if ((effect.type === 'damage' || effect.type === 'damageScaledByCounter') && effect.cannotBeReflected) return false
  return true
}

function abilityCanBeCountered(ability: BattleAbilityTemplate) {
  if (ability.cannotBeCountered) return false
  const damageEffects = (ability.effects ?? []).filter(
    (effect): effect is Extract<SkillEffect, { type: 'damage' | 'damageScaledByCounter' }> =>
      effect.type === 'damage' || effect.type === 'damageScaledByCounter',
  )
  if (damageEffects.length === 0) return true
  return damageEffects.some((effect) => !effect.cannotBeCountered)
}

function abilityCanBeReflected(ability: BattleAbilityTemplate) {
  return (ability.effects ?? []).some((effect) => canEffectBeReflected(ability, effect))
}

function guardMatchesAbility(guard: BattleReactionGuardState, ability: BattleAbilityTemplate) {
  if (!guard.abilityClasses || guard.abilityClasses.length === 0) return true
  return ability.classes.some((cls) => guard.abilityClasses?.includes(cls))
}

function consumeReactionGuard(target: BattleFighterState, guardId: string) {
  const index = target.reactionGuards.findIndex((guard) => guard.id === guardId)
  if (index === -1) return null
  const [removed] = target.reactionGuards.splice(index, 1)
  return removed ?? null
}

function runPreDamageReactionWindow(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  ability: BattleAbilityTemplate,
  targets: BattleFighterState[],
): PreDamageReactionResult {
  const result: PreDamageReactionResult = {
    cancelAction: false,
    reflectedTargetIds: new Set<string>(),
  }

  if (!isHarmfulAbility(ability)) return result

  for (const target of targets) {
    if (!isAlive(target)) continue

    if (abilityCanBeCountered(ability)) {
      const counter = target.reactionGuards.find(
        (guard) => guard.kind === 'counter' && guard.remainingRounds > 0 && guardMatchesAbility(guard, ability),
      )
      if (counter) {
        if (counter.consumeOnTrigger) {
          consumeReactionGuard(target, counter.id)
        }
        const counterDamage = Math.max(0, counter.counterDamage ?? 0)
        if (counterDamage > 0) {
          const packet: BattleDamagePacket = {
            kind: 'damage',
            sourceActorId: target.instanceId,
            targetId: actor.instanceId,
            abilityId: counter.sourceAbilityId,
            baseAmount: counterDamage,
            amount: counterDamage,
            damageType: 'normal',
            tags: ['counter'],
            flags: { cannotBeCountered: true, cannotBeReflected: true },
          }
          applyDamagePacket(state, ctx, target, actor, packet)
        }
        makeEvent(
          ctx,
          state.round,
          'system',
          'gold',
          `${target.shortName} countered ${actor.shortName}.`,
          target.instanceId,
          actor.instanceId,
          counterDamage || undefined,
          counter.sourceAbilityId ?? ability.id,
        )
        result.cancelAction = true
        return result
      }
    }

    if (abilityCanBeReflected(ability)) {
      const reflect = target.reactionGuards.find(
        (guard) => guard.kind === 'reflect' && guard.remainingRounds > 0 && guardMatchesAbility(guard, ability),
      )
      if (reflect) {
        if (reflect.consumeOnTrigger) {
          consumeReactionGuard(target, reflect.id)
        }
        result.reflectedTargetIds.add(target.instanceId)
        makeEvent(
          ctx,
          state.round,
          'system',
          'teal',
          `${target.shortName} reflected ${actor.shortName}'s skill.`,
          target.instanceId,
          actor.instanceId,
          undefined,
          reflect.sourceAbilityId ?? ability.id,
        )
      }
    }
  }

  return result
}


function runEffectReactionGuards(
  state: BattleState,
  ctx: ResolutionContext,
  observed: BattleFighterState,
  trigger: BattleReactionTrigger,
  source: BattleFighterState | null,
  ability?: BattleAbilityTemplate,
) {
  const guards = [...observed.reactionGuards].filter((guard) => guard.kind === 'effect' && guard.trigger === trigger && guard.remainingRounds > 0)
  if (guards.length === 0) return

  if (source) {
    observed.lastAttackerId = source.instanceId
  }

  for (const guard of guards) {
    if (!observed.reactionGuards.some((active) => active.id === guard.id)) continue
    if (guard.harmfulOnly && (!ability || !isHarmfulAbility(ability))) continue
    if (ability && !guardMatchesAbility(guard, ability)) continue
    if (guard.oncePerRound && guard.triggeredRounds?.includes(state.round)) continue

    const reactionActor = guard.sourceActorId ? getFighterById(state, guard.sourceActorId) : null
    const effectActor = reactionActor && isAlive(reactionActor) ? reactionActor : observed
    const effects = guard.effects?.map(cloneEffect) ?? []
    if (effects.length === 0) continue
    if (source) {
      effectActor.lastAttackerId = source.instanceId
    }

    if (guard.oncePerRound) {
      const liveGuard = observed.reactionGuards.find((active) => active.id === guard.id)
      if (liveGuard) {
        liveGuard.triggeredRounds = [...(liveGuard.triggeredRounds ?? []), state.round]
      }
    }

    if (guard.consumeOnTrigger) {
      consumeReactionGuard(observed, guard.id)
    }

    resolveEffects(
      state,
      ctx,
      effectActor,
      observed,
      effects,
      guard.sourceAbilityId ?? ability?.id,
      ability?.classes,
    )

    makeEvent(
      ctx,
      state.round,
      'status',
      'teal',
      `${observed.shortName} triggered ${guard.label}.`,
      effectActor.instanceId,
      observed.instanceId,
      undefined,
      guard.sourceAbilityId ?? ability?.id,
    )
  }
}
export { getCooldown, getFighterById, getOpposingTeam, getTeam, isAlive, getAbilityById } from '@/features/battle/engine/selectors.ts'
export { getResolvedAbilityEnergyCost } from '@/features/battle/engine/costModifier.ts'
export { buildEnemyCommands } from '@/features/battle/engine/ai.ts'

export function coinFlip(seed = 'default-battle-seed'): BattleTeamId {
  return createSeededRandom(seed)() < 0.5 ? 'player' : 'enemy'
}

function getSecondPlayer(first: BattleTeamId): BattleTeamId {
  return first === 'player' ? 'enemy' : 'player'
}

type BattleStateSetup = Partial<typeof defaultBattleSetup> & {
  battleSeed?: string
}

export function createInitialBattleState(setupOverrides?: BattleStateSetup): BattleState {
  const setup = {
    battlefield: { ...defaultBattleSetup.battlefield, ...(setupOverrides?.battlefield ?? {}) },
    playerTeamIds: setupOverrides?.playerTeamIds ?? defaultBattleSetup.playerTeamIds,
    enemyTeamIds: setupOverrides?.enemyTeamIds ?? defaultBattleSetup.enemyTeamIds,
    battleSeed: setupOverrides?.battleSeed ?? 'default-battle-seed',
  }
  const playerTeam = instantiateTeam('player', setup.playerTeamIds)
  const enemyTeam = instantiateTeam('enemy', setup.enemyTeamIds)
  const first = coinFlip(`${setup.battleSeed}:initiative`)

  return {
    stateSchemaVersion: BATTLE_STATE_SCHEMA_VERSION,
    battleSeed: setup.battleSeed,
    round: 1,
    phase: 'firstPlayerCommand',
    firstPlayer: first,
    activePlayer: first,
    battlefield: setup.battlefield,
    playerEnergy: createRoundEnergyPool(first === 'player' ? 1 : playerTeam.filter(isAlive).length, `${setup.battleSeed}:initial:player`),
    enemyEnergy: createRoundEnergyPool(first === 'enemy' ? 1 : enemyTeam.filter(isAlive).length, `${setup.battleSeed}:initial:enemy`),
    playerTeam,
    enemyTeam,
    playerTeamModifiers: createModifiers(),
    enemyTeamModifiers: createModifiers(),
    battlefieldModifiers: createModifiers(),
    scheduledEffects: [],
    winner: null,
    randomTickCount: 0,
  }
}

function getEnergyPool(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.playerEnergy : state.enemyEnergy
}

function setEnergyPool(state: BattleState, team: BattleTeamId, pool: BattleState['playerEnergy']) {
  if (team === 'player') {
    state.playerEnergy = pool
  } else {
    state.enemyEnergy = pool
  }
}

function formatEnergyAmounts(amounts: Partial<Record<BattleEnergyType, number>>) {
  const tokens = battleEnergyOrder
    .map((type) => {
      const amount = amounts[type] ?? 0
      if (amount <= 0) return null
      return `${type.toUpperCase()} +${amount}`
    })
    .filter((token): token is string => Boolean(token))

  return tokens.length > 0 ? tokens.join(', ') : 'no gain'
}

function normalizeEnergyAmount(value: number | undefined) {
  return Math.max(0, Math.floor(value ?? 0))
}

function normalizeEnergyCost(cost: BattleEnergyCost) {
  const next: BattleEnergyCost = {}
  battleEnergyOrder.forEach((type) => {
    const value = normalizeEnergyAmount(cost[type])
    if (value > 0) next[type] = value
  })
  const random = normalizeEnergyAmount(cost.random)
  if (random > 0) next.random = random
  return next
}

function getCommandResolvedCost(cost: BattleEnergyCost, command: QueuedBattleAction) {
  const normalized = normalizeEnergyCost(cost)
  const randomRequired = normalizeEnergyAmount(normalized.random)
  if (randomRequired <= 0 || !command.randomCostAllocation) {
    return normalized
  }

  const resolved: BattleEnergyCost = {}
  battleEnergyOrder.forEach((type) => {
    const typed = normalizeEnergyAmount(normalized[type])
    if (typed > 0) {
      resolved[type] = typed
    }
  })

  let randomAllocated = 0
  battleEnergyOrder.forEach((type) => {
    if (randomAllocated >= randomRequired) return
    const requested = normalizeEnergyAmount(command.randomCostAllocation?.[type])
    if (requested <= 0) return

    const applied = Math.min(requested, randomRequired - randomAllocated)
    if (applied <= 0) return
    resolved[type] = normalizeEnergyAmount(resolved[type]) + applied
    randomAllocated += applied
  })

  if (randomAllocated !== randomRequired) {
    return normalized
  }

  return resolved
}

function countEnergyAmounts(amounts: Partial<Record<BattleEnergyType, number>>) {
  return battleEnergyOrder.reduce((total, type) => total + normalizeEnergyAmount(amounts[type]), 0)
}

function getEnergyResourceDelta(amounts: Partial<Record<BattleEnergyType, number>>, sign: 1 | -1) {
  const entries = battleEnergyOrder
    .map((type) => {
      const value = normalizeEnergyAmount(amounts[type]) * sign
      return [type, value] as const
    })
    .filter((entry) => entry[1] !== 0)

  return {
    reserve: countEnergyAmounts(amounts) * sign,
    ...Object.fromEntries(entries),
  } as Partial<Record<BattleResourceKey, number>>
}

function gainEnergyPool(
  pool: BattleState['playerEnergy'],
  amount: BattleEnergyCost,
  seed: string,
) {
  const normalized = normalizeEnergyCost(amount)
  const gained = createEnergyAmounts()
  const nextAmounts = createEnergyAmounts(pool.amounts)

  battleEnergyOrder.forEach((type) => {
    const typed = normalizeEnergyAmount(normalized[type])
    if (typed <= 0) return
    gained[type] += typed
    nextAmounts[type] += typed
  })

  const random = normalizeEnergyAmount(normalized.random)
  if (random > 0) {
    const randomizer = createSeededRandom(seed)
    for (let index = 0; index < random; index += 1) {
      const rolled = Math.floor(randomizer() * battleEnergyOrder.length) % battleEnergyOrder.length
      const type = battleEnergyOrder[rolled]
      gained[type] += 1
      nextAmounts[type] += 1
    }
  }

  return {
    pool: {
      amounts: nextAmounts,
    },
    gained,
  }
}

function drainEnergyPool(
  pool: BattleState['playerEnergy'],
  amount: BattleEnergyCost,
) {
  const normalized = normalizeEnergyCost(amount)
  const drained = createEnergyAmounts()
  const nextAmounts = createEnergyAmounts(pool.amounts)

  battleEnergyOrder.forEach((type) => {
    const requested = normalizeEnergyAmount(normalized[type])
    if (requested <= 0) return
    const taken = Math.min(nextAmounts[type], requested)
    nextAmounts[type] -= taken
    drained[type] += taken
  })

  let randomRemaining = normalizeEnergyAmount(normalized.random)
  while (randomRemaining > 0) {
    const sourceType = battleEnergyOrder
      .filter((type) => nextAmounts[type] > 0)
      .sort((left, right) => nextAmounts[right] - nextAmounts[left] || battleEnergyOrder.indexOf(left) - battleEnergyOrder.indexOf(right))[0]
    if (!sourceType) break
    nextAmounts[sourceType] -= 1
    drained[sourceType] += 1
    randomRemaining -= 1
  }

  return {
    pool: {
      amounts: nextAmounts,
    },
    drained,
  }
}

function getCooldownAdjustAbilityIds(
  fighter: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'cooldownAdjust' }>,
) {
  if (effect.abilityId) return [effect.abilityId]
  if (effect.includeReady) {
    return getVisibleAbilities(fighter)
      .map((ability) => ability.id)
      .filter((abilityId) => abilityId !== PASS_ABILITY_ID)
  }
  return Object.keys(fighter.cooldowns)
}

function applyCooldownAdjust(
  fighter: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'cooldownAdjust' }>,
) {
  const abilityIds = getCooldownAdjustAbilityIds(fighter, effect)
  const changedAbilityIds: string[] = []
  let netDelta = 0

  for (const abilityId of abilityIds) {
    if (abilityId === PASS_ABILITY_ID) continue
    if (!getAbilityById(fighter, abilityId)) continue

    const current = fighter.cooldowns[abilityId] ?? 0
    if (!effect.includeReady && current <= 0) continue

    const next = Math.max(0, current + effect.amount)
    if (next === current) continue

    fighter.cooldowns[abilityId] = next
    changedAbilityIds.push(abilityId)
    netDelta += next - current
  }

  return { changedAbilityIds, netDelta }
}

function getCommandEnergyCost(state: BattleState, command: QueuedBattleAction) {
  const actor = getFighterById(state, command.actorId)
  if (!actor) return {}

  const ability = getAbilityById(actor, command.abilityId)
  if (!ability) return {}
  const { cost } = getResolvedAbilityEnergyCost(actor, ability)
  return getCommandResolvedCost(cost, command)
}

export function getProjectedTeamEnergy(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
  team: BattleTeamId,
  ignoreActorId?: string,
) {
  const totalQueuedCost = sumEnergyCosts(
    Object.values(queued)
      .filter((command) => command.team === team)
      .filter((command) => !ignoreActorId || command.actorId !== ignoreActorId)
      .map((command) => getCommandEnergyCost(state, command)),
  )

  return spendEnergy(getEnergyPool(state, team), totalQueuedCost)
}

export function canUseAbility(state: BattleState, fighter: BattleFighterState, abilityId: string) {
  const ability = getAbilityById(fighter, abilityId)
  if (!ability) return false
  if (!isAlive(fighter)) return false
  if (abilityId === PASS_ABILITY_ID) return true
  if (!canPayEnergy(getEnergyPool(state, fighter.team), getResolvedAbilityEnergyCost(fighter, ability).cost)) return false
  return getCooldown(fighter, abilityId) <= 0
}

export function canQueueAbility(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
  fighter: BattleFighterState,
  abilityId: string,
) {
  return getQueueAbilityBlockReason(state, queued, fighter, abilityId) === null
}

export function getQueueAbilityBlockReason(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
  fighter: BattleFighterState,
  abilityId: string,
): string | null {
  const ability = getAbilityById(fighter, abilityId)
  if (!ability) return 'Technique unavailable'
  if (!isAlive(fighter)) return 'Fighter is KO'
  if (abilityId === PASS_ABILITY_ID) return null
  if (hasModifierStatus(fighter.modifiers, 'stun')) return 'Stunned this turn'
  if (isAbilityClassStunned(fighter, ability)) return 'Technique class sealed'

  const cooldown = getCooldown(fighter, abilityId)
  if (cooldown > 0) return `Cooldown ${cooldown} turn${cooldown === 1 ? '' : 's'}`

  if ((ability.targetRule === 'enemy-single' || ability.targetRule === 'ally-single') && getValidTargetIds(state, fighter.instanceId, abilityId).length === 0) {
    return 'No valid targets'
  }

  const projectedPool = getProjectedTeamEnergy(state, queued, fighter.team, fighter.instanceId)
  if (!canPayEnergy(projectedPool, getResolvedAbilityEnergyCost(fighter, ability).cost)) {
    return 'Insufficient cursed energy'
  }

  return null
}

export function getValidTargetIds(state: BattleState, actorId: string, abilityId: string) {
  const actor = getFighterById(state, actorId)
  if (!actor) return []
  const ability = getAbilityById(actor, abilityId)
  if (!ability) return []

  const allies = getTeam(state, actor.team).filter(isAlive)
  const enemies = getOpposingTeam(state, actor.team).filter(isAlive)

  switch (ability.targetRule) {
    case 'self':
      return [actor.instanceId]
    case 'enemy-single':
      return enemies.filter((fighter) => targetHasRequiredTags(state, fighter, ability)).map((fighter) => fighter.instanceId)
    case 'ally-single':
      return allies.filter((fighter) => targetHasRequiredTags(state, fighter, ability)).map((fighter) => fighter.instanceId)
    default:
      return []
  }
}

export function getCommandablePlayerUnits(state: BattleState) {
  return state.playerTeam.filter(isAlive)
}

export function createAutoCommands(state: BattleState) {
  return Object.fromEntries(
    getCommandablePlayerUnits(state)
      .filter((fighter) => hasModifierStatus(fighter.modifiers, 'stun'))
      .map((fighter) => [
        fighter.instanceId,
        {
          actorId: fighter.instanceId,
          team: 'player',
          abilityId: PASS_ABILITY_ID,
          targetId: null,
        } satisfies QueuedBattleAction,
      ]),
  )
}

export function isPlayerCommandPhase(state: BattleState): boolean {
  if (state.phase === 'firstPlayerCommand' && state.firstPlayer === 'player') return true
  if (state.phase === 'secondPlayerCommand' && state.firstPlayer === 'enemy') return true
  return false
}

export function isEnemyCommandPhase(state: BattleState): boolean {
  if (state.phase === 'firstPlayerCommand' && state.firstPlayer === 'enemy') return true
  if (state.phase === 'secondPlayerCommand' && state.firstPlayer === 'player') return true
  return false
}

function matchesReactionCondition(
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
      return actor.lastUsedAbilityId === condition.abilityId ||
        actor.previousUsedAbilityId === condition.abilityId ||
        actor.abilityHistory.some((entry) => entry.abilityId === condition.abilityId && entry.round >= Math.max(1, context.round ?? 0) - condition.rounds)
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

function getTriggeredPassiveEffects(
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

function firePassives(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState | null,
  trigger: Exclude<PassiveTrigger, 'onTargetBelow'>,
  ability?: BattleAbilityTemplate,
  effect?: SkillEffect,
  amount?: number,
  extraContext: Partial<ReactionContext> = {},
) {
  const context: ReactionContext = {
    target,
    ability,
    effect,
    amount,
    isUltimate: ability?.classes.includes('Ultimate') ?? false,
    round: state.round,
    ...extraContext,
  }

  getTriggeredPassiveEffects(actor, trigger, context).forEach(({ passive, effects }) => {
    resolveEffects(state, ctx, actor, target, effects, passive.id, ability?.classes, undefined, amount)
  })
}

function createPassiveModifier(actor: BattleFighterState, passiveId: string, effect: Extract<SkillEffect, { type: 'damageBoost' | 'cooldownReduction' }>): BattleModifierInstance {
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

function getPassiveModifiers(actor: BattleFighterState, context: ReactionContext) {
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

function getModifierPool(state: BattleState, fighter: BattleFighterState, context: ReactionContext) {
  return getFighterModifierPool(state, fighter).concat(getPassiveModifiers(fighter, context))
}

function getNumericModifierTotal(
  state: BattleState,
  fighter: BattleFighterState,
  stat: BattleModifierStat,
  mode: 'flat' | 'percentAdd',
  context: ReactionContext,
  filter: { tags?: string[]; statusKind?: BattleStatusKind } = {},
) {
  return sumNumericModifierValues(getModifierPool(state, fighter, context), stat, mode, filter)
}

function getModifierMultiplier(
  state: BattleState,
  fighter: BattleFighterState,
  stat: BattleModifierStat,
  context: ReactionContext,
  filter: { tags?: string[]; statusKind?: BattleStatusKind } = {},
) {
  return getNumericModifierMultiplier(getModifierPool(state, fighter, context), stat, filter)
}

function hasModifierBoolean(
  state: BattleState,
  fighter: BattleFighterState,
  stat: BattleModifierStat,
  expected: boolean,
  filter: { statusKind?: BattleStatusKind } = {},
) {
  return hasBooleanModifierValue(getModifierPool(state, fighter, { target: null }), stat, expected, filter)
}

function resolveEffectTargets(
  targetMode: SkillEffect['target'],
  actor: BattleFighterState,
  selectedTarget: BattleFighterState | null,
  allies: BattleFighterState[],
  enemies: BattleFighterState[],
  state?: BattleState,
): BattleFighterState[] {
  switch (targetMode) {
    case 'self':
      return [actor]
    case 'inherit':
      return selectedTarget ? [selectedTarget] : []
    case 'all-allies':
      return allies
    case 'all-enemies':
      return enemies
    case 'other-enemies':
      return enemies.filter((enemy) => enemy.instanceId !== selectedTarget?.instanceId)
    case 'attacker': {
      if (!state) return []
      const attackerId = actor.lastAttackerId
      if (!attackerId) return []
      const attacker = getFighterById(state, attackerId)
      return attacker && isAlive(attacker) ? [attacker] : []
    }
    case 'random-enemy': {
      const alive = enemies.filter(isAlive)
      if (alive.length === 0) return []
      const seed = state ? `${state.battleSeed}:random-enemy:${state.round}` : String(Math.random())
      const rng = createSeededRandom(seed)
      const index = Math.floor(rng() * alive.length)
      return [alive[index]]
    }
    default:
      return selectedTarget ? [selectedTarget] : []
  }
}

function resolveRandomEnemyDamageTick(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'randomEnemyDamageTick' }>,
  abilityId?: string,
  abilityClasses?: BattleAbilityTemplate['classes'],
) {
  const aliveEnemies = getOpposingTeam(state, actor.team).filter(isAlive)
  if (aliveEnemies.length === 0) return

  const unhitEnemies = aliveEnemies.filter((enemy) => (actor.stateCounters[`${effect.historyKey}:${enemy.templateId}`] ?? 0) <= 0)
  const candidates = unhitEnemies.length > 0 ? unhitEnemies : aliveEnemies
  state.randomTickCount = (state.randomTickCount ?? 0) + 1
  const rng = createSeededRandom(`${state.battleSeed}:${effect.historyKey}:${state.round}:${state.randomTickCount}`)
  const target = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]
  if (!target) return

  const wasRepeat = (actor.stateCounters[`${effect.historyKey}:${target.templateId}`] ?? 0) > 0
  actor.stateCounters[`${effect.historyKey}:${target.templateId}`] = (actor.stateCounters[`${effect.historyKey}:${target.templateId}`] ?? 0) + 1
  emitCounterChange(ctx, state.round, actor, `${effect.historyKey}:${target.templateId}`, actor.stateCounters[`${effect.historyKey}:${target.templateId}`] ?? 0, actor.instanceId, abilityId)

  if (wasRepeat && effect.repeatCounterKey && effect.repeatCounterAmount) {
    adjustFighterCounter(actor, effect.repeatCounterKey, effect.repeatCounterAmount)
    emitCounterChange(ctx, state.round, actor, effect.repeatCounterKey, actor.stateCounters[effect.repeatCounterKey] ?? 0, actor.instanceId, abilityId)
  }

  if (!wasRepeat && effect.newTargetCounterKey && effect.newTargetCounterAmount) {
    adjustFighterCounter(actor, effect.newTargetCounterKey, effect.newTargetCounterAmount)
    emitCounterChange(ctx, state.round, actor, effect.newTargetCounterKey, actor.stateCounters[effect.newTargetCounterKey] ?? 0, actor.instanceId, abilityId)
  }

  const effectivePower = wasRepeat && effect.repeatPowerBonus ? effect.power + effect.repeatPowerBonus : effect.power
  const amount = calculateDamage(state, actor, target, effectivePower, abilityClasses?.includes('Ultimate') ?? false, false, abilityId, abilityClasses)
  applyDamagePacket(state, ctx, actor, target, {
    kind: 'damage',
    sourceActorId: actor.instanceId,
    targetId: target.instanceId,
    abilityId,
    baseAmount: effectivePower,
    amount,
    damageType: 'normal',
    tags: abilityClasses ?? [],
    flags: {},
  }, effect)
}

function applyModifierToFighter(
  state: BattleState,
  ctx: ResolutionContext,
  target: BattleFighterState,
  template: BattleModifierTemplate,
  actorId?: string,
  abilityId?: string,
) {
  const beforeKinds = target.statuses.map((status) => status.kind)
  const next = createModifierInstance(template, {
    sourceActorId: actorId,
    sourceAbilityId: abilityId,
    scope: 'fighter',
    targetId: target.instanceId,
    nextIndex: target.modifiers.length,
  })
  next.appliedInRound = state.round
  target.modifiers = upsertModifier(target.modifiers, next)
  syncFighterStatusesFromModifiers(target)
  emitModifierApplied(ctx, state.round, target, next, actorId, abilityId)
  emitRemovedStatusEvents(ctx, state.round, target, beforeKinds, actorId, abilityId)
  return next
}

function applyModifierToTeam(
  state: BattleState,
  ctx: ResolutionContext,
  team: BattleTeamId,
  template: BattleModifierTemplate,
  actorId?: string,
  abilityId?: string,
) {
  const bucket = getTeamModifierBucket(state, team)
  const next = createModifierInstance(template, {
    sourceActorId: actorId,
    sourceAbilityId: abilityId,
    scope: 'team',
    nextIndex: bucket.length,
  })
  setTeamModifierBucket(state, team, upsertModifier(bucket, next))
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId,
    team,
    abilityId,
    amount: typeof next.value === 'number' ? next.value : undefined,
    tags: next.tags,
    meta: {
      label: next.label,
      stat: next.stat,
      mode: next.mode,
      scope: next.scope,
      status: next.statusKind ?? null,
    },
  })
  return next
}

function applyModifierToBattlefield(
  state: BattleState,
  ctx: ResolutionContext,
  template: BattleModifierTemplate,
  actorId?: string,
  abilityId?: string,
) {
  const next = createModifierInstance(template, {
    sourceActorId: actorId,
    sourceAbilityId: abilityId,
    scope: 'battlefield',
    nextIndex: state.battlefieldModifiers.length,
  })
  state.battlefieldModifiers = upsertModifier(state.battlefieldModifiers, next)
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId,
    abilityId,
    amount: typeof next.value === 'number' ? next.value : undefined,
    tags: next.tags,
    meta: {
      label: next.label,
      stat: next.stat,
      mode: next.mode,
      scope: next.scope,
      status: next.statusKind ?? null,
    },
  })
  return next
}

function removeModifiersFromFighter(
  state: BattleState,
  ctx: ResolutionContext,
  target: BattleFighterState,
  filter: BattleModifierFilter,
  actorId?: string,
  abilityId?: string,
) {
  const beforeKinds = target.statuses.map((status) => status.kind)
  const result = removeModifiers(target.modifiers, filter)
  if (result.removed.length === 0) return result.removed

  target.modifiers = result.modifiers
  syncFighterStatusesFromModifiers(target)
  result.removed.forEach((modifier) => {
    emitModifierRemoved(ctx, state.round, modifier, {
      actorId,
      targetId: target.instanceId,
      team: target.team,
      abilityId,
    })
  })
  emitRemovedStatusEvents(ctx, state.round, target, beforeKinds, actorId, abilityId)
  return result.removed
}

function removeModifiersFromTeam(
  state: BattleState,
  ctx: ResolutionContext,
  team: BattleTeamId,
  filter: BattleModifierFilter,
  actorId?: string,
  abilityId?: string,
) {
  const bucket = getTeamModifierBucket(state, team)
  const result = removeModifiers(bucket, filter)
  if (result.removed.length === 0) return result.removed

  setTeamModifierBucket(state, team, result.modifiers)
  result.removed.forEach((modifier) => {
    emitModifierRemoved(ctx, state.round, modifier, { actorId, team, abilityId })
  })
  return result.removed
}

function removeModifiersFromBattlefield(
  state: BattleState,
  ctx: ResolutionContext,
  filter: BattleModifierFilter,
  actorId?: string,
  abilityId?: string,
) {
  const result = removeModifiers(state.battlefieldModifiers, filter)
  if (result.removed.length === 0) return result.removed

  state.battlefieldModifiers = result.modifiers
  result.removed.forEach((modifier) => {
    emitModifierRemoved(ctx, state.round, modifier, { actorId, abilityId })
  })
  return result.removed
}

function applyModifierToScope(
  state: BattleState,
  ctx: ResolutionContext,
  target: BattleFighterState,
  template: BattleModifierTemplate,
  actorId?: string,
  abilityId?: string,
) {
  const scope = template.scope ?? 'fighter'
  if (scope === 'team') return applyModifierToTeam(state, ctx, target.team, template, actorId, abilityId)
  if (scope === 'battlefield') return applyModifierToBattlefield(state, ctx, template, actorId, abilityId)
  return applyModifierToFighter(state, ctx, target, template, actorId, abilityId)
}

function removeModifiersFromScope(
  state: BattleState,
  ctx: ResolutionContext,
  target: BattleFighterState,
  filter: BattleModifierFilter,
  actorId?: string,
  abilityId?: string,
) {
  const scope = filter.scope ?? 'fighter'
  if (scope === 'team') return removeModifiersFromTeam(state, ctx, target.team, filter, actorId, abilityId)
  if (scope === 'battlefield') return removeModifiersFromBattlefield(state, ctx, filter, actorId, abilityId)
  return removeModifiersFromFighter(state, ctx, target, filter, actorId, abilityId)
}

function applyAbilityStateDeltaToFighter(
  state: BattleState,
  ctx: ResolutionContext,
  target: BattleFighterState,
  delta: BattleAbilityStateDelta,
  actorId?: string,
  abilityId?: string,
) {
  addAbilityStateDelta(target, delta)
  makeRuntimeEvent(ctx, state.round, 'ability_resolved', {
    actorId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: {
      abilityStateMode: delta.mode,
      slotAbilityId: delta.mode === 'grant' ? null : delta.slotAbilityId,
      grantedAbilityId: delta.mode === 'grant' ? delta.grantedAbility.id : null,
      replacementAbilityId: delta.mode === 'replace' ? delta.replacement.id : null,
      duration: delta.duration,
    },
  })
}

function applyShieldToFighter(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'shield' }>,
  abilityId?: string,
) {
  const label = effect.label?.trim() || 'Barrier'
  const tags = effect.tags ?? []
  const previous = target.shield
  target.shield = previous
    ? {
        ...previous,
        amount: previous.amount + effect.amount,
        label,
        sourceActorId: actor.instanceId,
        sourceAbilityId: abilityId,
        tags: Array.from(new Set(previous.tags.concat(tags))),
      }
    : {
        amount: effect.amount,
        label,
        sourceActorId: actor.instanceId,
        sourceAbilityId: abilityId,
        tags: [...tags],
      }

  emitShieldEvent(ctx, state.round, 'shield_applied', target, {
    actorId: actor.instanceId,
    abilityId,
    amount: effect.amount,
    label,
    tags,
  })
  const shieldAbility = abilityId ? getAbilityById(target, abilityId) ?? undefined : undefined
  firePassives(state, ctx, target, actor, 'onShieldGain', shieldAbility, undefined, effect.amount)
}

function applyCostModifierToFighter(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'modifyAbilityCost' }>,
  abilityId?: string,
) {
  const modifier = createCostModifierState(actor, abilityId, effect.modifier)
  target.costModifiers.push(modifier)
  makeRuntimeEvent(ctx, state.round, 'ability_cost_modified', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: {
      label: modifier.label,
      mode: modifier.mode,
      duration: modifier.duration,
      uses: modifier.uses ?? null,
      abilityId: modifier.abilityId ?? null,
      abilityClass: modifier.abilityClass ?? null,
    },
  })
}

function applyEffectImmunityToFighter(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'effectImmunity' }>,
  abilityId?: string,
) {
  target.effectImmunities.push(createEffectImmunityState(actor, abilityId, effect))
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: {
      label: effect.label,
      stat: 'effectImmunity',
      mode: 'set',
      scope: 'fighter',
      status: null,
    },
  })
}

function applyDefeat(
  state: BattleState,
  ctx: ResolutionContext,
  defeated: BattleFighterState,
  source: BattleFighterState | null,
  ability?: BattleAbilityTemplate,
) {
  makeEvent(ctx, state.round, 'defeat', 'gold', `${defeated.shortName} was exorcised.`, source?.instanceId, defeated.instanceId, undefined, ability?.id)
  makeRuntimeEvent(ctx, state.round, 'fighter_defeated', {
    actorId: source?.instanceId,
    targetId: defeated.instanceId,
    team: defeated.team,
    abilityId: ability?.id,
    tags: ability?.classes,
  })
  runEffectReactionGuards(state, ctx, defeated, 'onDefeat', source, ability)
  if (source) {
    runEffectReactionGuards(state, ctx, source, 'onDefeatEnemy', defeated, ability)
  }
  firePassives(state, ctx, defeated, source, 'onDefeat', ability)
  if (source) {
    firePassives(state, ctx, source, defeated, 'onDefeatEnemy', ability)
  }
}

function applyDamagePacket(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState | null,
  target: BattleFighterState,
  packet: BattleDamagePacket,
  effect?: SkillEffect,
) {
  if (!isAlive(target)) return 0

  makeRuntimeEvent(ctx, state.round, 'damage_would_apply', {
    actorId: packet.sourceActorId,
    targetId: packet.targetId,
    team: target.team,
    abilityId: packet.abilityId,
    amount: packet.amount,
    tags: packet.tags,
    packet,
  })

  if (hasModifierBoolean(state, target, 'isInvulnerable', true, { statusKind: 'invincible' }) && !packet.flags.ignoresInvulnerability) {
    const packetAbility = actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined
    if (target.modifiers.some((modifier) => modifier.tags.includes('yuji-sukuna-bonus-on-blocked-damage'))) {
      adjustFighterCounter(target, 'sukuna_bonus_hp', 5)
      emitCounterChange(ctx, state.round, target, 'sukuna_bonus_hp', target.stateCounters.sukuna_bonus_hp ?? 0, actor?.instanceId, packet.abilityId)
    }
    makeEvent(ctx, state.round, 'system', 'teal', `${target.shortName} nullified ${actor?.shortName ?? 'the attack'}.`, actor?.instanceId, target.instanceId, 0, packet.abilityId)
    makeRuntimeEvent(ctx, state.round, 'damage_blocked', {
      actorId: packet.sourceActorId,
      targetId: packet.targetId,
      team: target.team,
      abilityId: packet.abilityId,
      amount: 0,
      tags: packet.tags,
      packet,
      meta: { blockedByInvincible: true },
    })
    runEffectReactionGuards(state, ctx, target, 'onDamageBlocked', actor, packetAbility)
    return 0
  }

  let remainingDamage = packet.amount
  if (target.shield && target.shield.amount > 0 && !packet.flags.ignoresShield) {
    const absorbed = Math.min(target.shield.amount, remainingDamage)
    target.shield.amount -= absorbed
    remainingDamage -= absorbed
    emitShieldEvent(ctx, state.round, 'shield_damaged', target, {
      actorId: actor?.instanceId,
      abilityId: packet.abilityId,
      amount: absorbed,
      label: target.shield.label,
      tags: target.shield.tags,
    })

    if (target.shield.amount <= 0) {
      const brokenShield = target.shield
      target.shield = null
      emitShieldEvent(ctx, state.round, 'shield_broken', target, {
        actorId: actor?.instanceId,
        abilityId: packet.abilityId,
        amount: absorbed,
        label: brokenShield.label,
        tags: brokenShield.tags,
      })
      firePassives(
        state,
        ctx,
        target,
        actor,
        'onShieldBroken',
        actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined,
        effect,
        absorbed,
        { brokenShieldTags: brokenShield.tags },
      )
      runEffectReactionGuards(
        state,
        ctx,
        target,
        'onShieldBroken',
        actor,
        actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined,
      )
    }
  }

  if (remainingDamage <= 0) {
    makeEvent(ctx, state.round, 'system', 'teal', `${target.shortName}'s shield absorbed the hit.`, actor?.instanceId, target.instanceId, 0, packet.abilityId)
    makeRuntimeEvent(ctx, state.round, 'damage_blocked', {
      actorId: packet.sourceActorId,
      targetId: packet.targetId,
      team: target.team,
      abilityId: packet.abilityId,
      amount: 0,
      tags: packet.tags,
      packet: { ...packet, amount: 0 },
      meta: { blockedByShield: true },
    })
    runEffectReactionGuards(
      state,
      ctx,
      target,
      'onDamageBlocked',
      actor,
      actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined,
    )
    return 0
  }

  const nextHp = Math.max(0, target.hp - remainingDamage)
  const isUndying = hasBooleanModifierForStat(getFighterModifierPool(state, target), 'isUndying', true)
  target.hp = isUndying && nextHp <= 0 ? 1 : nextHp
  makeEvent(ctx, state.round, 'damage', 'red', `${actor?.shortName ?? target.shortName} hit ${target.shortName} for ${remainingDamage}.`, actor?.instanceId, target.instanceId, remainingDamage, packet.abilityId)
  makeRuntimeEvent(ctx, state.round, 'damage_applied', {
    actorId: packet.sourceActorId,
    targetId: packet.targetId,
    team: target.team,
    abilityId: packet.abilityId,
    amount: remainingDamage,
    tags: packet.tags,
    packet: { ...packet, amount: remainingDamage },
  })
  runEffectReactionGuards(
    state,
    ctx,
    target,
    'onDamageApplied',
    actor,
    actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined,
  )

  if (actor) {
    const ability = packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined
    target.lastAttackerId = actor.instanceId
    firePassives(state, ctx, actor, target, 'onDealDamage', ability, effect, remainingDamage)
    firePassives(state, ctx, target, actor, 'onTakeDamage', ability, effect, remainingDamage)
    if (target.hp <= 0) {
      applyDefeat(state, ctx, target, actor, ability)
    }
  } else if (target.hp <= 0) {
    applyDefeat(state, ctx, target, null)
  }

  return remainingDamage
}

function applyHealPacket(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  packet: BattleHealPacket,
) {
  if (!isAlive(target)) return 0

  makeRuntimeEvent(ctx, state.round, 'heal_would_apply', {
    actorId: packet.sourceActorId,
    targetId: packet.targetId,
    team: target.team,
    abilityId: packet.abilityId,
    amount: packet.amount,
    tags: packet.tags,
    packet,
  })

  const before = target.hp
  target.hp = Math.min(target.maxHp, target.hp + packet.amount)
  const healed = target.hp - before
  if (healed > 0) {
    makeEvent(ctx, state.round, 'heal', 'teal', `${actor.shortName} restored ${healed} HP to ${target.shortName}.`, actor.instanceId, target.instanceId, healed, packet.abilityId)
    makeRuntimeEvent(ctx, state.round, 'heal_applied', {
      actorId: packet.sourceActorId,
      targetId: packet.targetId,
      team: target.team,
      abilityId: packet.abilityId,
      amount: healed,
      tags: packet.tags,
      packet: { ...packet, amount: healed },
    })
    const healAbility = packet.abilityId ? getAbilityById(target, packet.abilityId) ?? undefined : undefined
    firePassives(state, ctx, target, actor, 'onHeal', healAbility, undefined, healed)
  }
  return healed
}

function setCooldown(fighter: BattleFighterState, ability: BattleAbilityTemplate) {
  fighter.cooldowns[ability.id] = ability.cooldown
}

function calculateDamage(
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
    (cls): cls is BattleSkillDamageType => ['Physical', 'Energy', 'Affliction', 'Mental'].includes(cls),
  )

  amount += getNumericModifierTotal(state, actor, 'damageDealt', 'flat', actorContext)

  amount = Math.round(amount * (1 + getNumericModifierTotal(state, actor, 'damageDealt', 'percentAdd', actorContext)))
  amount = Math.round(amount * getModifierMultiplier(state, actor, 'damageDealt', actorContext))

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

function calculateHealing(
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

function resolveEffects(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState | null,
  effects: SkillEffect[],
  abilityId?: string,
  abilityClasses?: BattleAbilityTemplate['classes'],
  reactionResult?: PreDamageReactionResult,
  triggerAmount?: number,
) {
  const allies = getTeam(state, actor.team).filter(isAlive)
  const enemies = getOpposingTeam(state, actor.team).filter(isAlive)
  const isUlt = abilityClasses?.includes('Ultimate') ?? false
  const resolvedAbility = abilityId ? getAbilityById(actor, abilityId) ?? undefined : undefined

  for (const effect of effects) {
    const targets = resolveEffectTargets(effect.target, actor, target, allies, enemies, state)

    if (effect.type === 'schedule') {
      if (targets.length === 0) continue
      state.scheduledEffects.push({
        id: `scheduled-${state.round}-${state.scheduledEffects.length}`,
        actorId: actor.instanceId,
        targetIds: targets.map((entry) => entry.instanceId),
        abilityId,
        dueRound: state.round + effect.delay,
        phase: effect.phase,
        effects: effect.effects.map(cloneEffect),
      })
      makeEvent(ctx, state.round, 'system', 'frost', `${actor.shortName} armed a delayed effect for round ${state.round + effect.delay} ${effect.phase === 'roundStart' ? 'start' : 'end'}.`, actor.instanceId, targets[0]?.instanceId, undefined, abilityId)
      makeRuntimeEvent(ctx, state.round, 'scheduled_effect_created', {
        actorId: actor.instanceId,
        targetId: targets[0]?.instanceId,
        team: actor.team,
        abilityId,
        meta: { dueRound: state.round + effect.delay, phase: effect.phase },
      })
      continue
    }

    if (effect.type === 'randomEnemyDamageOverTime') {
      for (let delay = 1; delay <= effect.duration; delay += 1) {
        state.scheduledEffects.push({
          id: `scheduled-${state.round}-${state.scheduledEffects.length}`,
          actorId: actor.instanceId,
          targetIds: [actor.instanceId],
          abilityId,
          dueRound: state.round + delay,
          phase: 'roundStart',
          effects: [{
            type: 'randomEnemyDamageTick',
            power: effect.power,
            historyKey: `${abilityId ?? 'effect'}:${effect.historyKey}`,
            repeatPowerBonus: effect.repeatPowerBonus,
            repeatCounterKey: effect.repeatCounterKey,
            repeatCounterAmount: effect.repeatCounterAmount,
            newTargetCounterKey: effect.newTargetCounterKey,
            newTargetCounterAmount: effect.newTargetCounterAmount,
            target: 'self',
          }],
        })
      }
      makeEvent(ctx, state.round, 'system', 'frost', `${actor.shortName} set a roaming strike for ${effect.duration} turns.`, actor.instanceId, undefined, undefined, abilityId)
      continue
    }

    const scopedTargets = new Set<string>()

    for (const t of targets) {
      const canReflectEffect = resolvedAbility ? canEffectBeReflected(resolvedAbility, effect) : false
      const isReflected = canReflectEffect && Boolean(reactionResult?.reflectedTargetIds.has(t.instanceId))
      const effectActor = isReflected ? t : actor
      const effectTarget = isReflected ? actor : t

      if (effect.type === 'addModifier' || effect.type === 'removeModifier') {
        const modifierScope = effect.type === 'addModifier'
          ? effect.modifier.scope ?? 'fighter'
          : effect.filter.scope ?? 'fighter'
        const scopeKey = modifierScope === 'fighter'
          ? effectTarget.instanceId
          : modifierScope === 'team'
            ? `team:${effectTarget.team}`
            : 'battlefield'

        if (scopedTargets.has(scopeKey)) continue
        scopedTargets.add(scopeKey)
      }

      if (effect.type === 'energyGain' || effect.type === 'energyDrain' || effect.type === 'energySteal') {
        const scopeKey = `team:${effectTarget.team}`
        if (scopedTargets.has(scopeKey)) continue
        scopedTargets.add(scopeKey)
      }

      if (isEffectBlocked(effectTarget, effect)) {
        makeRuntimeEvent(ctx, state.round, 'effect_ignored', {
          actorId: effectActor.instanceId,
          targetId: effectTarget.instanceId,
          team: effectTarget.team,
          abilityId,
          tags: abilityClasses ?? [],
          meta: {
            effectType: effect.type,
            blockedBy: 'effectImmunity',
          },
        })
        continue
      }

      switch (effect.type) {
        case 'randomEnemyDamageTick':
          resolveRandomEnemyDamageTick(state, ctx, actor, effect, abilityId, abilityClasses)
          break
        case 'damage': {
          const isPiercing = effect.piercing ?? false
          const packetTarget = effectTarget
          const packetActor = effectActor
          const amount = calculateDamage(state, packetActor, packetTarget, effect.power, isUlt, isPiercing, abilityId, abilityClasses)
          const packet: BattleDamagePacket = {
            kind: 'damage',
            sourceActorId: packetActor.instanceId,
            targetId: packetTarget.instanceId,
            abilityId,
            baseAmount: effect.power,
            amount,
            damageType: 'normal',
            tags: abilityClasses ?? [],
            flags: {
              isUltimate: isUlt,
              ignoresInvulnerability: effect.ignoresInvulnerability,
              ignoresShield: effect.ignoresShield,
              isPiercing,
              cannotBeCountered: resolvedAbility?.cannotBeCountered ?? effect.cannotBeCountered ?? false,
              cannotBeReflected: resolvedAbility?.cannotBeReflected ?? effect.cannotBeReflected ?? false,
            },
          }
          applyDamagePacket(state, ctx, packetActor, packetTarget, packet, effect)
          break
        }
        case 'damageFiltered': {
          const hasTag = getFighterModifierPool(state, effectTarget).some((m) => m.tags.includes(effect.requiresTag))
          if (!hasTag) break
          const isPiercing = effect.piercing ?? false
          const amount = calculateDamage(state, effectActor, effectTarget, effect.power, isUlt, isPiercing, abilityId, abilityClasses)
          const packet: BattleDamagePacket = {
            kind: 'damage',
            sourceActorId: effectActor.instanceId,
            targetId: effectTarget.instanceId,
            abilityId,
            baseAmount: effect.power,
            amount,
            damageType: effect.damageType ?? 'normal',
            tags: abilityClasses ?? [],
            flags: {
              isUltimate: isUlt,
              ignoresInvulnerability: effect.ignoresInvulnerability,
              ignoresShield: effect.ignoresShield,
              isPiercing,
              cannotBeCountered: resolvedAbility?.cannotBeCountered ?? effect.cannotBeCountered ?? false,
              cannotBeReflected: resolvedAbility?.cannotBeReflected ?? effect.cannotBeReflected ?? false,
            },
          }
          applyDamagePacket(state, ctx, effectActor, effectTarget, packet, effect)
          break
        }
        case 'energyGain': {
          const currentPool = getEnergyPool(state, effectTarget.team)
          const { pool: nextPool, gained } = gainEnergyPool(
            currentPool,
            effect.amount,
            `${state.battleSeed}:energyGain:${state.round}:${ctx.runtimeEvents.length}:${effectTarget.team}`,
          )
          if (countEnergyAmounts(gained) <= 0) break
          setEnergyPool(state, effectTarget.team, nextPool)
          emitResourceChange(ctx, state.round, {
            kind: 'resource',
            sourceActorId: effectActor.instanceId,
            targetTeam: effectTarget.team,
            abilityId,
            mode: 'gain',
            amounts: getEnergyResourceDelta(gained, 1),
            tags: abilityClasses ?? [],
          })
          makeEvent(
            ctx,
            state.round,
            'system',
            'teal',
            `${effectTarget.shortName}'s team gained ${formatEnergyAmounts(gained)} cursed energy.`,
            effectActor.instanceId,
            effectTarget.instanceId,
            countEnergyAmounts(gained),
            abilityId,
          )
          break
        }
        case 'energyDrain': {
          const currentPool = getEnergyPool(state, effectTarget.team)
          const { pool: nextPool, drained } = drainEnergyPool(currentPool, effect.amount)
          if (countEnergyAmounts(drained) <= 0) break
          setEnergyPool(state, effectTarget.team, nextPool)
          emitResourceChange(ctx, state.round, {
            kind: 'resource',
            sourceActorId: effectActor.instanceId,
            targetTeam: effectTarget.team,
            abilityId,
            mode: 'spend',
            amounts: getEnergyResourceDelta(drained, -1),
            tags: abilityClasses ?? [],
          })
          makeEvent(
            ctx,
            state.round,
            'system',
            'red',
            `${effectTarget.shortName}'s team lost ${formatEnergyAmounts(drained)} cursed energy.`,
            effectActor.instanceId,
            effectTarget.instanceId,
            countEnergyAmounts(drained),
            abilityId,
          )
          break
        }
        case 'energySteal': {
          const currentPool = getEnergyPool(state, effectTarget.team)
          const { pool: drainedPool, drained } = drainEnergyPool(currentPool, effect.amount)
          if (countEnergyAmounts(drained) <= 0) break

          setEnergyPool(state, effectTarget.team, drainedPool)
          emitResourceChange(ctx, state.round, {
            kind: 'resource',
            sourceActorId: effectActor.instanceId,
            targetTeam: effectTarget.team,
            abilityId,
            mode: 'spend',
            amounts: getEnergyResourceDelta(drained, -1),
            tags: abilityClasses ?? [],
          })

          if (effectActor.team !== effectTarget.team) {
            const actorPool = getEnergyPool(state, effectActor.team)
            const { pool: actorNextPool, gained } = gainEnergyPool(
              actorPool,
              drained,
              `${state.battleSeed}:energySteal:${state.round}:${ctx.runtimeEvents.length}:${effectActor.team}`,
            )
            setEnergyPool(state, effectActor.team, actorNextPool)
            emitResourceChange(ctx, state.round, {
              kind: 'resource',
              sourceActorId: effectActor.instanceId,
              targetTeam: effectActor.team,
              abilityId,
              mode: 'gain',
              amounts: getEnergyResourceDelta(gained, 1),
              tags: abilityClasses ?? [],
            })
          }

          makeEvent(
            ctx,
            state.round,
            'system',
            'teal',
            `${effectActor.shortName} stole ${formatEnergyAmounts(drained)} cursed energy from ${effectTarget.shortName}'s team.`,
            effectActor.instanceId,
            effectTarget.instanceId,
            countEnergyAmounts(drained),
            abilityId,
          )
          break
        }
        case 'damageEqualToActorShield': {
          const shieldAmount = effectActor.shield
            ? (effect.shieldTag ? (effectActor.shield.tags.includes(effect.shieldTag) ? effectActor.shield.amount : 0) : effectActor.shield.amount)
            : 0
          if (shieldAmount <= 0) break
          const isPiercing = effect.piercing ?? false
          const deAmount = calculateDamage(state, effectActor, effectTarget, shieldAmount, isUlt, isPiercing, abilityId, abilityClasses)
          const dePacket: BattleDamagePacket = {
            kind: 'damage',
            sourceActorId: effectActor.instanceId,
            targetId: effectTarget.instanceId,
            abilityId,
            baseAmount: shieldAmount,
            amount: deAmount,
            damageType: effect.damageType ?? 'normal',
            tags: abilityClasses ?? [],
            flags: {
              isUltimate: isUlt,
              ignoresInvulnerability: effect.ignoresInvulnerability,
              ignoresShield: effect.ignoresShield,
              isPiercing,
              cannotBeCountered: resolvedAbility?.cannotBeCountered ?? effect.cannotBeCountered ?? false,
              cannotBeReflected: resolvedAbility?.cannotBeReflected ?? effect.cannotBeReflected ?? false,
            },
          }
          applyDamagePacket(state, ctx, effectActor, effectTarget, dePacket, effect)
          break
        }
        case 'damageScaledByCounter': {
          if (effect.requiresTag && !getFighterModifierPool(state, effectTarget).some((modifier) => modifier.tags.includes(effect.requiresTag!))) break
          const counterOwner = (effect.counterSource ?? 'target') === 'actor' ? effectActor : effectTarget
          const stackCount = counterOwner.stateCounters[effect.counterKey] ?? 0
          if (stackCount <= 0) break
          const basePower = stackCount * effect.powerPerStack
          const isPiercing = effect.piercing ?? false
          const packetTarget = effectTarget
          const packetActor = effectActor
          const amount = calculateDamage(state, packetActor, packetTarget, basePower, isUlt, isPiercing, abilityId, abilityClasses)
          const packet: BattleDamagePacket = {
            kind: 'damage',
            sourceActorId: packetActor.instanceId,
            targetId: packetTarget.instanceId,
            abilityId,
            baseAmount: basePower,
            amount,
            damageType: effect.damageType ?? 'normal',
            tags: abilityClasses ?? [],
            flags: {
              isUltimate: isUlt,
              ignoresInvulnerability: effect.ignoresInvulnerability,
              ignoresShield: effect.ignoresShield,
              isPiercing,
              cannotBeCountered: resolvedAbility?.cannotBeCountered ?? effect.cannotBeCountered ?? false,
              cannotBeReflected: resolvedAbility?.cannotBeReflected ?? effect.cannotBeReflected ?? false,
            },
          }
          applyDamagePacket(state, ctx, packetActor, packetTarget, packet, effect)
          if (effect.consumeStacks) {
            counterOwner.stateCounters[effect.counterKey] = 0
            emitCounterChange(ctx, state.round, counterOwner, effect.counterKey, 0, effectActor.instanceId, abilityId)
            if (effect.modifierTag) {
              removeModifiersFromFighter(state, ctx, counterOwner, { tags: [effect.modifierTag] }, effectActor.instanceId, abilityId)
            }
          }
          break
        }
        case 'heal': {
          const amount = calculateHealing(state, effectActor, effectTarget, effect.power, abilityId)
          const packet: BattleHealPacket = {
            kind: 'heal',
            sourceActorId: effectActor.instanceId,
            targetId: effectTarget.instanceId,
            abilityId,
            baseAmount: effect.power,
            amount,
            tags: abilityClasses ?? [],
            flags: {},
          }
          applyHealPacket(state, ctx, effectActor, effectTarget, packet)
          break
        }
        case 'setHpFromCounter': {
          const amount = Math.min(t.maxHp, effect.base + (t.stateCounters[effect.counterKey] ?? 0))
          t.hp = Math.max(t.hp, amount)
          makeEvent(ctx, state.round, 'heal', 'teal', `${t.shortName} forced their body back to ${t.hp} HP.`, actor.instanceId, t.instanceId, t.hp, abilityId)
          makeRuntimeEvent(ctx, state.round, 'heal_applied', {
            actorId: actor.instanceId,
            targetId: t.instanceId,
            team: t.team,
            abilityId,
            amount: t.hp,
            tags: abilityClasses ?? [],
            meta: { setHpFromCounter: effect.counterKey },
          })
          break
        }
        case 'overhealToShield': {
          const overhealAmount = calculateHealing(state, effectActor, effectTarget, effect.power, abilityId)
          const headroom = effectTarget.maxHp - effectTarget.hp
          const healed = Math.min(headroom, overhealAmount)
          const overflow = overhealAmount - healed
          if (healed > 0) {
            const overhealPacket: BattleHealPacket = {
              kind: 'heal',
              sourceActorId: effectActor.instanceId,
              targetId: effectTarget.instanceId,
              abilityId,
              baseAmount: effect.power,
              amount: healed,
              tags: abilityClasses ?? [],
              flags: {},
            }
            applyHealPacket(state, ctx, effectActor, effectTarget, overhealPacket)
          }
          if (overflow > 0) {
            applyShieldToFighter(state, ctx, effectActor, effectTarget, {
              type: 'shield',
              amount: overflow,
              label: effect.shieldLabel ?? 'Overheal',
              tags: effect.shieldTags ?? [],
              target: effect.target,
            }, abilityId)
            makeEvent(ctx, state.round, 'system', 'teal', `${effectTarget.shortName} gained ${overflow} shield from overheal.`, effectActor.instanceId, effectTarget.instanceId, overflow, abilityId)
          }
          break
        }
        case 'stun':
          applyModifierToFighter(state, ctx, effectTarget, {
            label: 'Stun',
            stat: 'canAct',
            mode: 'set',
            value: false,
            duration: { kind: 'rounds', rounds: effect.duration },
            tags: ['status', 'stun'],
            visible: true,
            stacking: 'max',
            statusKind: 'stun',
          }, effectActor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'status', 'gold', `${effectTarget.shortName} is stunned for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, effectActor.instanceId, effectTarget.instanceId, effect.duration, abilityId)
          break
        case 'classStun': {
          effectTarget.classStuns.push(createClassStunState(effectActor, abilityId, effect, state.round))
          makeEvent(ctx, state.round, 'status', 'gold', `${effectTarget.shortName}'s ${effect.blockedClasses.join('/')} techniques are sealed for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, effectActor.instanceId, effectTarget.instanceId, effect.duration, abilityId)
          makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
            actorId: effectActor.instanceId,
            targetId: effectTarget.instanceId,
            team: effectTarget.team,
            abilityId,
            meta: { label: 'Class Stun', stat: 'classStun', mode: 'set', scope: 'fighter', status: null },
          })
          break
        }
        case 'classStunScaledByCounter': {
          const stackCount = effectTarget.stateCounters[effect.counterKey] ?? 0
          const duration = effect.baseDuration + stackCount * effect.durationPerStack
          effectTarget.classStuns.push(createClassStunState(effectActor, abilityId, { type: 'classStun', duration, blockedClasses: effect.blockedClasses, target: effect.target }, state.round))
          makeEvent(ctx, state.round, 'status', 'gold', `${effectTarget.shortName}'s ${effect.blockedClasses.join('/')} techniques are sealed for ${duration} turn${duration === 1 ? '' : 's'}.`, effectActor.instanceId, effectTarget.instanceId, duration, abilityId)
          makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
            actorId: effectActor.instanceId,
            targetId: effectTarget.instanceId,
            team: effectTarget.team,
            abilityId,
            meta: { label: 'Class Stun', stat: 'classStun', mode: 'set', scope: 'fighter', status: null },
          })
          if (effect.consumeStacks) {
            effectTarget.stateCounters[effect.counterKey] = 0
            emitCounterChange(ctx, state.round, effectTarget, effect.counterKey, 0, effectActor.instanceId, abilityId)
            if (effect.modifierTag) {
              removeModifiersFromFighter(state, ctx, effectTarget, { tags: [effect.modifierTag] }, effectActor.instanceId, abilityId)
            }
          }
          break
        }
        case 'invulnerable': {
          const canGain = !hasBooleanModifierForStat(getFighterModifierPool(state, t), 'canGainInvulnerable', false)
          if (!canGain) {
            makeEvent(ctx, state.round, 'system', 'frost', `${t.shortName} cannot become invulnerable.`, actor.instanceId, t.instanceId, undefined, abilityId)
            break
          }
          applyModifierToFighter(state, ctx, t, {
            label: 'Invulnerable',
            stat: 'isInvulnerable',
            mode: 'set',
            value: true,
            duration: { kind: 'rounds', rounds: effect.duration },
            tags: ['status', 'invincible'],
            visible: true,
            stacking: 'max',
            statusKind: 'invincible',
          }, actor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'status', 'teal', `${t.shortName} became untouchable for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, undefined, abilityId)
          break
        }
        case 'attackUp':
          applyModifierToFighter(state, ctx, t, {
            label: 'Attack Up',
            stat: 'damageDealt',
            mode: 'flat',
            value: effect.amount,
            duration: { kind: 'rounds', rounds: effect.duration },
            tags: ['status', 'attackUp'],
            visible: true,
            stacking: 'max',
            statusKind: 'attackUp',
          }, actor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'status', 'teal', `${t.shortName} gained +${effect.amount} ATK for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, effect.amount, abilityId)
          break
        case 'mark':
          applyModifierToFighter(state, ctx, effectTarget, {
            label: 'Mark',
            stat: 'damageTaken',
            mode: 'flat',
            value: effect.bonus,
            duration: { kind: 'rounds', rounds: effect.duration },
            tags: ['status', 'mark'],
            visible: true,
            stacking: 'max',
            statusKind: 'mark',
          }, effectActor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'status', 'red', `${effectTarget.shortName} was marked for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, effectActor.instanceId, effectTarget.instanceId, effect.bonus, abilityId)
          break
        case 'burn':
          applyModifierToFighter(state, ctx, effectTarget, {
            label: 'Burn',
            stat: 'dotDamage',
            mode: 'flat',
            value: effect.damage,
            duration: { kind: 'rounds', rounds: effect.duration },
            tags: ['status', 'burn'],
            visible: true,
            stacking: 'max',
            statusKind: 'burn',
          }, effectActor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'status', 'red', `${effectTarget.shortName} is burning for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, effectActor.instanceId, effectTarget.instanceId, effect.damage, abilityId)
          break
        case 'addModifier': {
          const scope = effect.modifier.scope ?? 'fighter'
          applyModifierToScope(state, ctx, t, effect.modifier, actor.instanceId, abilityId)
          const targetLabel = scope === 'fighter' ? t.shortName : scope === 'team' ? `${t.team} team` : 'the battlefield'
          makeEvent(ctx, state.round, 'system', 'teal', `${targetLabel} gained ${effect.modifier.label}.`, actor.instanceId, scope === 'fighter' ? t.instanceId : undefined, undefined, abilityId)
          break
        }
        case 'removeModifier': {
          const scope = effect.filter.scope ?? 'fighter'
          const removed = removeModifiersFromScope(state, ctx, t, effect.filter, actor.instanceId, abilityId)
          if (removed.length > 0) {
            const targetLabel = scope === 'fighter' ? t.shortName : scope === 'team' ? `${t.team} team` : 'the battlefield'
            makeEvent(ctx, state.round, 'system', 'frost', `${targetLabel} lost ${removed[0]?.label ?? 'a modifier'}.`, actor.instanceId, scope === 'fighter' ? t.instanceId : undefined, undefined, abilityId)
          }
          break
        }
        case 'modifyAbilityState':
          if ((effect.delta.mode === 'replace' || effect.delta.mode === 'lock') && !hasBaseAbility(t, effect.delta.slotAbilityId)) break
          applyAbilityStateDeltaToFighter(state, ctx, t, effect.delta, actor.instanceId, abilityId)
          makeEvent(
            ctx,
            state.round,
            'system',
            'teal',
            effect.delta.mode === 'replace'
              ? `${t.shortName} replaced ${effect.delta.slotAbilityId} with ${effect.delta.replacement.name} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
              : effect.delta.mode === 'grant'
                ? `${t.shortName} gained ${effect.delta.grantedAbility.name} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
                : `${t.shortName} locked ${effect.delta.slotAbilityId} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`,
            actor.instanceId,
            t.instanceId,
            undefined,
            abilityId,
          )
          break
        case 'replaceAbility':
          if (!hasBaseAbility(t, effect.slotAbilityId)) break
          applyAbilityStateDeltaToFighter(state, ctx, t, {
            mode: 'replace',
            slotAbilityId: effect.slotAbilityId,
            replacement: effect.ability,
            duration: effect.duration,
          }, actor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'system', 'teal', `${t.shortName} replaced ${effect.slotAbilityId} with ${effect.ability.name} for ${effect.duration} round${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, undefined, abilityId)
          break
        case 'replaceAbilities': {
          const applied: string[] = []
          for (const r of effect.replacements) {
            if (!hasBaseAbility(t, r.slotAbilityId)) continue
            applyAbilityStateDeltaToFighter(state, ctx, t, {
              mode: 'replace',
              slotAbilityId: r.slotAbilityId,
              replacement: r.ability,
              duration: r.duration,
            }, actor.instanceId, abilityId)
            applied.push(r.ability.name)
          }
          if (applied.length > 0) {
            makeEvent(ctx, state.round, 'system', 'teal', `${t.shortName} transformed: ${applied.join(', ')}.`, actor.instanceId, t.instanceId, undefined, abilityId)
          }
          break
        }
        case 'shield':
          applyShieldToFighter(state, ctx, actor, t, effect, abilityId)
          makeEvent(ctx, state.round, 'system', 'teal', `${t.shortName} gained ${effect.amount} shield.`, actor.instanceId, t.instanceId, effect.amount, abilityId)
          break
        case 'shieldDamage': {
          if (!effectTarget.shield) break
          if (effect.tag && !effectTarget.shield.tags.includes(effect.tag)) break
          const shield = effectTarget.shield
          const drained = Math.min(shield.amount, effect.amount)
          shield.amount -= drained
          emitShieldEvent(ctx, state.round, 'shield_damaged', effectTarget, {
            actorId: effectActor.instanceId,
            abilityId,
            amount: drained,
            label: shield.label,
            tags: shield.tags,
          })
          if (shield.amount <= 0) {
            const brokenShield = shield
            effectTarget.shield = null
            emitShieldEvent(ctx, state.round, 'shield_broken', effectTarget, {
              actorId: effectActor.instanceId,
              abilityId,
              amount: brokenShield.amount,
              label: brokenShield.label,
              tags: brokenShield.tags,
            })
            firePassives(
              state,
              ctx,
              effectTarget,
              effectActor,
              'onShieldBroken',
              abilityId ? getAbilityById(effectActor, abilityId) ?? undefined : undefined,
              effect,
              brokenShield.amount,
              { brokenShieldTags: brokenShield.tags },
            )
            runEffectReactionGuards(
              state,
              ctx,
              effectTarget,
              'onShieldBroken',
              effectActor,
              abilityId ? getAbilityById(effectActor, abilityId) ?? undefined : undefined,
            )
          }
          makeEvent(
            ctx,
            state.round,
            'system',
            'frost',
            `${effectActor.shortName} damaged ${effectTarget.shortName}'s shield by ${drained}.`,
            effectActor.instanceId,
            effectTarget.instanceId,
            drained,
            abilityId,
          )
          break
        }
        case 'modifyAbilityCost':
          applyCostModifierToFighter(state, ctx, actor, t, effect, abilityId)
          makeEvent(ctx, state.round, 'system', 'teal', `${t.shortName}'s technique cost shifted via ${effect.modifier.label}.`, actor.instanceId, t.instanceId, undefined, abilityId)
          break
        case 'effectImmunity':
          applyEffectImmunityToFighter(state, ctx, actor, t, effect, abilityId)
          makeEvent(ctx, state.round, 'system', 'teal', `${t.shortName} gained ${effect.label}.`, actor.instanceId, t.instanceId, undefined, abilityId)
          break
        case 'removeEffectImmunity': {
          const before = t.effectImmunities.length
          t.effectImmunities = t.effectImmunities.filter((immunity) => {
            if (effect.filter.label && immunity.label === effect.filter.label) return false
            if (effect.filter.tag && immunity.tags?.includes(effect.filter.tag)) return false
            return true
          })
          if (t.effectImmunities.length < before) {
            makeEvent(ctx, state.round, 'system', 'teal', `${t.shortName} lost an effect immunity.`, actor.instanceId, t.instanceId, undefined, abilityId)
          }
          break
        }
        case 'breakShield': {
          if (!effectTarget.shield) break
          if (effect.tag && !effectTarget.shield.tags.includes(effect.tag)) break
          const brokenShield = effectTarget.shield
          effectTarget.shield = null
          emitShieldEvent(ctx, state.round, 'shield_broken', effectTarget, {
            actorId: effectActor.instanceId,
            abilityId,
            amount: brokenShield.amount,
            label: brokenShield.label,
            tags: brokenShield.tags,
          })
          firePassives(
            state,
            ctx,
            effectTarget,
            effectActor,
            'onShieldBroken',
            abilityId ? getAbilityById(effectActor, abilityId) ?? undefined : undefined,
            effect,
            brokenShield.amount,
            { brokenShieldTags: brokenShield.tags },
          )
          runEffectReactionGuards(
            state,
            ctx,
            effectTarget,
            'onShieldBroken',
            effectActor,
            abilityId ? getAbilityById(effectActor, abilityId) ?? undefined : undefined,
          )
          makeEvent(
            ctx,
            state.round,
            'system',
            'frost',
            `${effectActor.shortName} shattered ${effectTarget.shortName}'s ${brokenShield.label}.`,
            effectActor.instanceId,
            effectTarget.instanceId,
            undefined,
            abilityId,
          )
          break
        }
        case 'counter': {
          t.reactionGuards = t.reactionGuards.filter((guard) => guard.kind !== 'counter')
          const guard = createReactionGuardState(actor, abilityId, effect, state.round)
          t.reactionGuards.push(guard)
          makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
            actorId: actor.instanceId,
            targetId: t.instanceId,
            team: t.team,
            abilityId,
            meta: { label: guard.label, stat: 'counter', mode: 'set', scope: 'fighter', status: null },
          })
          makeEvent(
            ctx,
            state.round,
            'status',
            'gold',
            `${t.shortName} is ready to counter a harmful skill for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`,
            actor.instanceId,
            t.instanceId,
            effect.counterDamage,
            abilityId,
          )
          break
        }
        case 'reflect': {
          t.reactionGuards = t.reactionGuards.filter((guard) => guard.kind !== 'reflect')
          const guard = createReactionGuardState(actor, abilityId, effect, state.round)
          t.reactionGuards.push(guard)
          makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
            actorId: actor.instanceId,
            targetId: t.instanceId,
            team: t.team,
            abilityId,
            meta: { label: guard.label, stat: 'reflect', mode: 'set', scope: 'fighter', status: null },
          })
          makeEvent(
            ctx,
            state.round,
            'status',
            'teal',
            `${t.shortName} is ready to reflect a harmful skill for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`,
            actor.instanceId,
            t.instanceId,
            undefined,
            abilityId,
          )
          break
        }
        case 'reaction': {
          const guard = createReactionGuardState(actor, abilityId, effect, state.round)
          t.reactionGuards = t.reactionGuards.filter(
            (existing) => !(existing.kind === 'effect' && existing.label === guard.label && existing.sourceActorId === guard.sourceActorId),
          )
          t.reactionGuards.push(guard)
          makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
            actorId: actor.instanceId,
            targetId: t.instanceId,
            team: t.team,
            abilityId,
            meta: { label: guard.label, stat: 'reaction', mode: 'set', scope: 'fighter', status: null },
          })
          makeEvent(
            ctx,
            state.round,
            'status',
            'teal',
            `${t.shortName} is affected by ${guard.label} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`,
            actor.instanceId,
            t.instanceId,
            undefined,
            abilityId,
          )
          break
        }
        case 'setFlag':
          setFighterFlag(t, effect.key, effect.value)
          emitFlagChange(ctx, state.round, t, effect.key, effect.value, actor.instanceId, abilityId)
          break
        case 'setMode':
          t.stateModeDurations ??= {}
          t.stateModes[effect.key] = effect.value
          if (effect.duration && effect.duration > 0) {
            t.stateModeDurations[effect.key] = { remainingRounds: effect.duration, appliedInRound: state.round }
          } else {
            delete t.stateModeDurations[effect.key]
          }
          makeRuntimeEvent(ctx, state.round, 'fighter_flag_changed', {
            actorId: actor.instanceId,
            targetId: t.instanceId,
            team: t.team,
            abilityId,
            meta: { key: effect.key, value: effect.value, duration: effect.duration ?? null },
          })
          makeEvent(ctx, state.round, 'status', 'teal', `${t.shortName} entered ${effect.value}.`, actor.instanceId, t.instanceId, undefined, abilityId)
          break
        case 'clearMode':
          delete t.stateModes[effect.key]
          delete t.stateModeDurations?.[effect.key]
          makeRuntimeEvent(ctx, state.round, 'fighter_flag_changed', {
            actorId: actor.instanceId,
            targetId: t.instanceId,
            team: t.team,
            abilityId,
            meta: { key: effect.key, value: null },
          })
          makeEvent(ctx, state.round, 'status', 'frost', `${t.shortName} left ${effect.key}.`, actor.instanceId, t.instanceId, undefined, abilityId)
          break
        case 'adjustCounter':
          if (effect.requiresTag && !getFighterModifierPool(state, t).some((modifier) => modifier.tags.includes(effect.requiresTag!))) break
          adjustFighterCounter(t, effect.key, effect.amount)
          if (effect.min != null || effect.max != null) {
            const current = t.stateCounters[effect.key] ?? 0
            t.stateCounters[effect.key] = Math.min(effect.max ?? current, Math.max(effect.min ?? current, current))
          }
          emitCounterChange(ctx, state.round, t, effect.key, t.stateCounters[effect.key] ?? 0, actor.instanceId, abilityId)
          break
        case 'setCounter':
          t.stateCounters[effect.key] = effect.value
          emitCounterChange(ctx, state.round, t, effect.key, effect.value, actor.instanceId, abilityId)
          break
        case 'adjustSourceCounter': {
          const source = getModifierSourceFighter(state, { sourceActorId: t.modifiers.find((modifier) => modifier.sourceActorId === actor.instanceId)?.sourceActorId }) ?? actor
          adjustFighterCounter(source, effect.key, effect.amount)
          emitCounterChange(ctx, state.round, source, effect.key, source.stateCounters[effect.key] ?? 0, actor.instanceId, abilityId)
          break
        }
        case 'adjustCounterByTriggerAmount': {
          const delta = Math.floor(triggerAmount ?? 0)
          if (delta > 0) {
            adjustFighterCounter(t, effect.key, delta)
            emitCounterChange(ctx, state.round, t, effect.key, t.stateCounters[effect.key] ?? 0, actor.instanceId, abilityId)
          }
          break
        }
        case 'resetCounter':
          t.stateCounters[effect.key] = 0
          emitCounterChange(ctx, state.round, t, effect.key, 0, actor.instanceId, abilityId)
          break
        case 'conditional': {
          const conditionAbility = abilityId ? getAbilityById(effectActor, abilityId) ?? undefined : undefined
          const passed = effect.conditions.every((condition) => matchesReactionCondition(effectActor, condition, {
            target: effectTarget,
            ability: conditionAbility,
            amount: triggerAmount,
            isUltimate: abilityClasses?.includes('Ultimate'),
            round: state.round,
          }))
          const branch = passed ? effect.effects : effect.elseEffects ?? []
          if (branch.length > 0) {
            resolveEffects(state, ctx, effectActor, effectTarget, branch, abilityId, abilityClasses, reactionResult, triggerAmount)
          }
          break
        }
        case 'cooldownReduction':
        case 'damageBoost':
          break
        case 'cooldownAdjust': {
          const { changedAbilityIds, netDelta } = applyCooldownAdjust(effectTarget, effect)
          if (changedAbilityIds.length === 0) break
          makeRuntimeEvent(ctx, state.round, 'ability_resolved', {
            actorId: effectActor.instanceId,
            targetId: effectTarget.instanceId,
            team: effectTarget.team,
            abilityId,
            amount: netDelta,
            meta: {
              cooldownAdjust: effect.amount,
              abilityId: effect.abilityId ?? null,
              includeReady: effect.includeReady ?? false,
              changedAbilityIds: changedAbilityIds.join(','),
            },
          })
          makeEvent(
            ctx,
            state.round,
            'system',
            effect.amount < 0 ? 'teal' : 'gold',
            `${effectTarget.shortName}'s cooldowns ${effect.amount < 0 ? 'reduced' : 'increased'} by ${Math.abs(effect.amount)}.`,
            effectActor.instanceId,
            effectTarget.instanceId,
            Math.abs(effect.amount),
            abilityId,
          )
          break
        }
      }
    }
  }
}

function tickTeamTurn(state: BattleState, ctx: ResolutionContext, team: BattleTeamId) {
  getTeam(state, team).forEach((fighter) => {
    if (!isAlive(fighter)) return

    const cooldownTick = 1 + getNumericModifierTotal(state, fighter, 'cooldownTick', 'flat', { target: null })

    Object.keys(fighter.cooldowns).forEach((abilityId) => {
      fighter.cooldowns[abilityId] = Math.max(0, (fighter.cooldowns[abilityId] ?? 0) - cooldownTick)
    })

    const beforeKinds = fighter.statuses.map((status) => status.kind)
    const ticked = tickModifiers(fighter.modifiers, state.round)
    fighter.modifiers = ticked.modifiers
    syncFighterStatusesFromModifiers(fighter)

    ticked.expired.forEach((modifier) => {
      emitModifierRemoved(ctx, state.round, modifier, {
        targetId: fighter.instanceId,
        team: fighter.team,
      })
    })
    emitRemovedStatusEvents(ctx, state.round, fighter, beforeKinds)
    tickAbilityState(fighter)
    tickCostModifiers(fighter)
    tickEffectImmunities(fighter)
    tickClassStuns(fighter, state.round)
    tickReactionGuards(fighter, state.round)
    tickStateModes(fighter, state.round, ctx)
  })
}

function tickRoundEnd(state: BattleState, ctx: ResolutionContext) {
  ;(['player', 'enemy'] as BattleTeamId[]).forEach((team) => {
    const ticked = tickModifiers(getTeamModifierBucket(state, team))
    setTeamModifierBucket(state, team, ticked.modifiers)
    ticked.expired.forEach((modifier) => {
      emitModifierRemoved(ctx, state.round, modifier, { team })
    })
  })

  const battlefieldTick = tickModifiers(state.battlefieldModifiers)
  state.battlefieldModifiers = battlefieldTick.modifiers
  battlefieldTick.expired.forEach((modifier) => {
    emitModifierRemoved(ctx, state.round, modifier)
  })
}
function resolveAction(state: BattleState, ctx: ResolutionContext, command: QueuedBattleAction) {
  const actor = getFighterById(state, command.actorId)
  if (!actor || !isAlive(actor)) return

  const ability = getAbilityById(actor, command.abilityId)
  if (!ability) return

  if (hasModifierBoolean(state, actor, 'canAct', false, { statusKind: 'stun' })) {
    makeEvent(ctx, state.round, 'status', 'gold', `${actor.shortName} is stunned and passed the turn.`, actor.instanceId)
    removeModifiersFromFighter(state, ctx, actor, { statusKind: 'stun' }, actor.instanceId, ability.id)
    return
  }

  if (ability.id !== PASS_ABILITY_ID && isAbilityClassStunned(actor, ability)) {
    makeEvent(ctx, state.round, 'status', 'gold', `${actor.shortName}'s ${ability.name} is sealed and cannot be used.`, actor.instanceId, undefined, undefined, ability.id)
    return
  }

  if (!canUseAbility(state, actor, ability.id)) {
    makeEvent(ctx, state.round, 'system', 'frost', `${actor.shortName} couldn't activate ${ability.name}.`, actor.instanceId, undefined, undefined, ability.id)
    return
  }

  if (ability.id !== PASS_ABILITY_ID) {
    const { cost, applied } = getResolvedAbilityEnergyCost(actor, ability)
    const currentPool = getEnergyPool(state, actor.team)
    const requestedCost = getCommandResolvedCost(cost, command)
    const payableCost = canPayEnergy(currentPool, requestedCost) ? requestedCost : cost
    const spent = getSpentEnergyAmounts(currentPool, payableCost)
    const nextPool = spendEnergy(currentPool, payableCost)
    if (actor.team === 'player') {
      state.playerEnergy = nextPool
    } else {
      state.enemyEnergy = nextPool
    }
    setCooldown(actor, ability)
    emitResourceChange(ctx, state.round, {
      kind: 'resource',
      sourceActorId: actor.instanceId,
      targetTeam: actor.team,
      abilityId: ability.id,
      mode: 'spend',
      amounts: {
        reserve: -countEnergyCost(payableCost),
        ...Object.fromEntries(
          battleEnergyOrder
            .map((type) => [type, spent ? -spent[type] : 0] as const)
            .filter((entry) => entry[1] !== 0),
        ),
      },
      tags: ability.classes,
    })
    applied.forEach((modifier) => {
      makeRuntimeEvent(ctx, state.round, 'ability_cost_modified', {
        actorId: actor.instanceId,
        targetId: actor.instanceId,
        team: actor.team,
        abilityId: ability.id,
        meta: {
          label: modifier.label,
          mode: modifier.mode,
          applied: true,
        },
      })
    })
    consumeCostModifiers(actor, ability)
  }

  makeEvent(ctx, state.round, 'action', 'frost', `${actor.shortName} activated ${ability.name}.`, actor.instanceId, command.targetId ?? undefined, undefined, ability.id)
  makeRuntimeEvent(ctx, state.round, 'ability_used', {
    actorId: actor.instanceId,
    targetId: command.targetId ?? undefined,
    team: actor.team,
    abilityId: ability.id,
    tags: ability.classes,
  })

  const allies = getTeam(state, actor.team)
  const enemies = getOpposingTeam(state, actor.team)
  const explicitTarget = command.targetId ? getFighterById(state, command.targetId) : null
  const validTargetIds = new Set(getValidTargetIds(state, actor.instanceId, ability.id))
  const requiresValidatedSingleTarget = ability.targetRule === 'enemy-single' || ability.targetRule === 'ally-single'
  const fallbackSingleTarget = ability.targetRule === 'enemy-single'
    ? enemies.find((fighter) => isAlive(fighter) && targetHasRequiredTags(state, fighter, ability)) ?? null
    : ability.targetRule === 'ally-single'
      ? allies.find((fighter) => isAlive(fighter) && targetHasRequiredTags(state, fighter, ability)) ?? null
      : null
  const singleTarget: BattleFighterState | null =
    (explicitTarget && isAlive(explicitTarget) && (!requiresValidatedSingleTarget || validTargetIds.has(explicitTarget.instanceId)) ? explicitTarget : null) ??
    fallbackSingleTarget
  const allTargeted = ability.targetRule === 'enemy-all'
    ? getOpposingTeam(state, actor.team).filter(isAlive)
    : ability.targetRule === 'ally-all'
      ? getTeam(state, actor.team).filter(isAlive)
      : singleTarget && isAlive(singleTarget) ? [singleTarget] : []

  runEffectReactionGuards(state, ctx, actor, 'onAbilityUse', actor, ability)
  firePassives(state, ctx, actor, singleTarget, 'onAbilityUse', ability)
  for (const tgt of allTargeted) {
    runEffectReactionGuards(state, ctx, tgt, 'onBeingTargeted', actor, ability)
  }
  const preDamageReaction = runPreDamageReactionWindow(state, ctx, actor, ability, allTargeted)
  if (!preDamageReaction.cancelAction && isAlive(actor)) {
    resolveEffects(state, ctx, actor, singleTarget, ability.effects ?? [], ability.id, ability.classes, preDamageReaction)
  }
  firePassives(state, ctx, actor, singleTarget, 'onAbilityResolve', ability)

  for (const tgt of allTargeted) {
    firePassives(state, ctx, tgt, actor, 'onBeingTargeted', ability)
  }

  actor.previousUsedAbilityId = actor.lastUsedAbilityId
  actor.lastUsedAbilityId = ability.id
  actor.abilityHistory = [
    ...actor.abilityHistory,
    { abilityId: ability.id, round: state.round, targetId: singleTarget?.instanceId ?? null },
  ].slice(-12)
  makeRuntimeEvent(ctx, state.round, 'ability_resolved', {
    actorId: actor.instanceId,
    targetId: singleTarget?.instanceId,
    team: actor.team,
    abilityId: ability.id,
    tags: ability.classes,
  })
}

function resolveScheduledEffects(state: BattleState, ctx: ResolutionContext, phase: BattleScheduledPhase) {
  const due = state.scheduledEffects.filter((effect) => effect.phase === phase && effect.dueRound <= state.round)
  state.scheduledEffects = state.scheduledEffects.filter((effect) => !(effect.phase === phase && effect.dueRound <= state.round))

  due.forEach((scheduled) => {
    const actor = getFighterById(state, scheduled.actorId)
    if (!actor) return

    makeRuntimeEvent(ctx, state.round, 'scheduled_effect_resolved', {
      actorId: actor.instanceId,
      targetId: scheduled.targetIds[0],
      team: actor.team,
      abilityId: scheduled.abilityId,
      meta: { phase },
    })

    const targets = scheduled.targetIds
      .map((targetId) => getFighterById(state, targetId))
      .filter((target): target is BattleFighterState => Boolean(target))

    if (targets.length === 0) {
      resolveEffects(state, ctx, actor, null, scheduled.effects, scheduled.abilityId)
      return
    }

    targets.forEach((target) => {
      resolveEffects(state, ctx, actor, target, scheduled.effects, scheduled.abilityId)
    })
  })
}

function applyRoundStartEffects(state: BattleState, ctx: ResolutionContext) {
  resolveScheduledEffects(state, ctx, 'roundStart')

  const allUnits = state.playerTeam.concat(state.enemyTeam)
  allUnits.forEach((fighter) => {
    if (!isAlive(fighter)) return

    const burnDamage = sumNumericModifierValues(fighter.modifiers, 'dotDamage', 'flat', { statusKind: 'burn' })
    if (hasModifierStatus(fighter.modifiers, 'burn') && burnDamage > 0) {
      const packet: BattleDamagePacket = {
        kind: 'damage',
        sourceActorId: undefined,
        targetId: fighter.instanceId,
        baseAmount: burnDamage,
        amount: burnDamage,
        damageType: 'burn',
        tags: ['burn'],
        flags: { isStatusTick: true },
      }
      applyDamagePacket(state, ctx, null, fighter, packet)
    }

    if (isAlive(fighter)) {
      firePassives(state, ctx, fighter, null, 'onRoundStart')
      }
    })
}

function tickStateModes(fighter: BattleFighterState, round: number, ctx: ResolutionContext) {
  Object.entries(fighter.stateModeDurations ?? {}).forEach(([key, duration]) => {
    if (duration.appliedInRound === round) return
    const remainingRounds = Math.max(0, duration.remainingRounds - 1)
    if (remainingRounds > 0) {
      fighter.stateModeDurations[key] = { ...duration, remainingRounds }
      return
    }

    const previousValue = fighter.stateModes[key]
    delete fighter.stateModes[key]
    delete fighter.stateModeDurations[key]
    makeRuntimeEvent(ctx, round, 'fighter_flag_changed', {
      targetId: fighter.instanceId,
      team: fighter.team,
      meta: { key, value: null, previousValue, expired: true },
    })
    makeEvent(ctx, round, 'status', 'frost', `${fighter.shortName} left ${previousValue ?? key}.`, undefined, fighter.instanceId)
  })
}

function applyRoundEnergyGeneration(state: BattleState, ctx: ResolutionContext) {
  const playerAliveCount = state.playerTeam.filter(isAlive).length
  const enemyAliveCount = state.enemyTeam.filter(isAlive).length

  if (playerAliveCount > 0) {
    const playerSeed = `${state.battleSeed}:round:${state.round}:player`
    const playerGain = getRefreshGain(playerAliveCount, playerSeed)
    state.playerEnergy = refreshRoundEnergy(state.playerEnergy, playerAliveCount, playerSeed)
    makeEvent(
      ctx,
      state.round,
      'system',
      'teal',
      `Cursed energy refreshed: ${formatEnergyAmounts(playerGain)}.`,
    )
    emitResourceChange(ctx, state.round, {
      kind: 'resource',
      targetTeam: 'player',
      mode: 'refresh',
      amounts: { reserve: playerAliveCount, ...playerGain },
      tags: ['round-start'],
    })
  }

  if (enemyAliveCount > 0) {
    const enemySeed = `${state.battleSeed}:round:${state.round}:enemy`
    const enemyGain = getRefreshGain(enemyAliveCount, enemySeed)
    state.enemyEnergy = refreshRoundEnergy(state.enemyEnergy, enemyAliveCount, enemySeed)
    emitResourceChange(ctx, state.round, {
      kind: 'resource',
      targetTeam: 'enemy',
      mode: 'refresh',
      amounts: { reserve: enemyAliveCount, ...enemyGain },
      tags: ['round-start'],
    })
  }
}

function applyFatigue(state: BattleState, ctx: ResolutionContext) {
  if (state.round < state.battlefield.fatigueStartsRound) return
  const damage = 6 + (state.round - state.battlefield.fatigueStartsRound) * 2
  state.playerTeam.concat(state.enemyTeam).forEach((fighter) => {
    if (!isAlive(fighter)) return
    const packet: BattleDamagePacket = {
      kind: 'damage',
      sourceActorId: undefined,
      targetId: fighter.instanceId,
      baseAmount: damage,
      amount: damage,
      damageType: 'fatigue',
      tags: ['fatigue'],
      flags: { isStatusTick: true },
    }
    applyDamagePacket(state, ctx, null, fighter, packet)
    if (isAlive(fighter)) {
      makeEvent(ctx, state.round, 'system', 'red', `Domain pressure dealt ${damage} to ${fighter.shortName}.`, undefined, fighter.instanceId, damage)
    }
  })
}


export function resolveTeamTurn(
  previousState: BattleState,
  commands: Record<string, QueuedBattleAction>,
  team: BattleTeamId,
  actionOrder?: string[],
): BattleResolutionResult {
  const state = cloneState(previousState)
  const ctx: ResolutionContext = { events: [], runtimeEvents: [] }

  const aliveFighters = getTeam(state, team).filter(isAlive)
  const orderedIds = buildOrderedActionIds(aliveFighters, actionOrder)

  orderedIds.forEach((instanceId) => {
    const fighter = aliveFighters.find((f) => f.instanceId === instanceId)
    if (!fighter) return
    const command = commands[fighter.instanceId]
    if (!command) {
      resolveAction(state, ctx, {
        actorId: fighter.instanceId,
        team,
        abilityId: PASS_ABILITY_ID,
        targetId: null,
      })
      return
    }
    resolveAction(state, ctx, command)
  })

  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(ctx, state.round, 'victory', getVictoryTone(winner), getVictoryMessage(winner))
  } else {
    tickTeamTurn(state, ctx, team)
  }

  return { state, events: ctx.events, runtimeEvents: ctx.runtimeEvents }
}

export function resolveTeamTurnTimeline(
  previousState: BattleState,
  commands: Record<string, QueuedBattleAction>,
  team: BattleTeamId,
  actionOrder?: string[],
): BattleTimelineResult {
  const state = cloneState(previousState)
  const ctx: ResolutionContext = { events: [], runtimeEvents: [] }
  const steps: BattleTimelineStep[] = []
  const aliveFighters = getTeam(state, team).filter(isAlive)
  const orderedIds = buildOrderedActionIds(aliveFighters, actionOrder)

  for (const instanceId of orderedIds) {
    const fighter = aliveFighters.find((candidate) => candidate.instanceId === instanceId)
    if (!fighter) continue

    const previousEventCount = ctx.events.length
    const previousRuntimeCount = ctx.runtimeEvents.length
    const command =
      commands[fighter.instanceId] ?? {
        actorId: fighter.instanceId,
        team,
        abilityId: PASS_ABILITY_ID,
        targetId: null,
      }

    resolveAction(state, ctx, command)

    const winner = getWinner(state)
    if (winner) {
      state.phase = 'finished'
      state.winner = winner
      makeEvent(
        ctx,
        state.round,
        'victory',
        getVictoryTone(winner),
        getVictoryMessage(winner),
      )
    }

    const step = createTimelineStep('action', state, ctx, previousEventCount, previousRuntimeCount, {
      actorId: fighter.instanceId,
      targetId: command.targetId ?? undefined,
      team,
      abilityId: command.abilityId,
    })

    if (step) {
      steps.push(step)
    }

    if (winner) {
      break
    }
  }

  if (!state.winner) {
    const prevEventCount = ctx.events.length
    const prevRuntimeCount = ctx.runtimeEvents.length
    tickTeamTurn(state, ctx, team)
    const tickStep = createTimelineStep('action', state, ctx, prevEventCount, prevRuntimeCount)
    if (tickStep) steps.push(tickStep)
  }

  return { state, steps }
}

export function beginNewRound(previousState: BattleState): BattleResolutionResult {
  const state = cloneState(previousState)
  const ctx: ResolutionContext = { events: [], runtimeEvents: [] }

  state.round += 1
  makeEvent(ctx, state.round, 'phase', 'frost', `Round ${state.round} opened inside ${state.battlefield.name}.`)
  makeRuntimeEvent(ctx, state.round, 'round_started', { meta: { battlefield: state.battlefield.id } })

  applyRoundStartEffects(state, ctx)

  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(ctx, state.round, 'victory', getVictoryTone(winner), getVictoryMessage(winner))
    return { state, events: ctx.events, runtimeEvents: ctx.runtimeEvents }
  }

  applyRoundEnergyGeneration(state, ctx)
  state.activePlayer = state.firstPlayer
  state.phase = 'firstPlayerCommand'

  return { state, events: ctx.events, runtimeEvents: ctx.runtimeEvents }
}

export function beginNewRoundTimeline(previousState: BattleState): BattleTimelineResult {
  const state = cloneState(previousState)
  const ctx: ResolutionContext = { events: [], runtimeEvents: [] }
  const steps: BattleTimelineStep[] = []

  state.round += 1
  makeEvent(ctx, state.round, 'phase', 'frost', `Round ${state.round} opened inside ${state.battlefield.name}.`)
  makeRuntimeEvent(ctx, state.round, 'round_started', { meta: { battlefield: state.battlefield.id } })

  applyRoundStartEffects(state, ctx)

  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(
      ctx,
      state.round,
      'victory',
      getVictoryTone(winner),
      getVictoryMessage(winner),
    )
  } else {
    applyRoundEnergyGeneration(state, ctx)
    state.activePlayer = state.firstPlayer
    state.phase = 'firstPlayerCommand'
  }

  const step = createTimelineStep('roundStart', state, ctx, 0, 0, {
    team: state.firstPlayer,
  })
  if (step) {
    steps.push(step)
  }

  return { state, steps }
}

export function transitionToSecondPlayer(previousState: BattleState): BattleState {
  const state = cloneState(previousState)
  state.activePlayer = getSecondPlayer(state.firstPlayer)
  state.phase = 'secondPlayerCommand'
  return state
}

export function endRound(previousState: BattleState): BattleResolutionResult {
  const state = cloneState(previousState)
  const ctx: ResolutionContext = { events: [], runtimeEvents: [] }

  makeRuntimeEvent(ctx, state.round, 'round_ended')
  applyFatigue(state, ctx)
  resolveScheduledEffects(state, ctx, 'roundEnd')
  state.playerTeam.concat(state.enemyTeam).forEach((fighter) => {
    if (!isAlive(fighter)) return
    firePassives(state, ctx, fighter, null, 'onRoundEnd')
  })
  tickTeamTurn(state, ctx, getSecondPlayer(state.firstPlayer))
  tickRoundEnd(state, ctx)

  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(ctx, state.round, 'victory', getVictoryTone(winner), getVictoryMessage(winner))
    return { state, events: ctx.events, runtimeEvents: ctx.runtimeEvents }
  }

  const nextRound = beginNewRound(state)
  return {
    state: nextRound.state,
    events: [...ctx.events, ...nextRound.events],
    runtimeEvents: [...ctx.runtimeEvents, ...nextRound.runtimeEvents],
  }
}

export function endRoundTimeline(previousState: BattleState): BattleTimelineResult {
  const state = cloneState(previousState)
  const ctx: ResolutionContext = { events: [], runtimeEvents: [] }
  const steps: BattleTimelineStep[] = []

  makeRuntimeEvent(ctx, state.round, 'round_ended')
  applyFatigue(state, ctx)
  resolveScheduledEffects(state, ctx, 'roundEnd')
  state.playerTeam.concat(state.enemyTeam).forEach((fighter) => {
    if (!isAlive(fighter)) return
    firePassives(state, ctx, fighter, null, 'onRoundEnd')
  })
  tickTeamTurn(state, ctx, getSecondPlayer(state.firstPlayer))
  tickRoundEnd(state, ctx)

  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(
      ctx,
      state.round,
      'victory',
      getVictoryTone(winner),
      getVictoryMessage(winner),
    )
  }

  const roundEndStep = createTimelineStep('roundEnd', state, ctx, 0, 0)
  if (roundEndStep) {
    steps.push(roundEndStep)
  }

  if (winner) {
    return { state, steps }
  }

  const nextRound = beginNewRoundTimeline(state)
  return {
    state: nextRound.state,
    steps: [...steps, ...nextRound.steps],
  }
}

export function resolveRound(
  previousState: BattleState,
  playerCommands: Record<string, QueuedBattleAction>,
): BattleResolutionResult {
  const state = cloneState(previousState)
  const ctx: ResolutionContext = { events: [], runtimeEvents: [] }

  makeEvent(ctx, state.round, 'phase', 'frost', `Round ${state.round} began inside ${state.battlefield.name}.`)
  makeRuntimeEvent(ctx, state.round, 'round_started', { meta: { battlefield: state.battlefield.id, legacy: true } })

  applyRoundStartEffects(state, ctx)

  const enemyCommands = buildEnemyCommands(state)
  const firstTeam = state.firstPlayer
  const secondTeam = getSecondPlayer(firstTeam)
  const firstCommands = firstTeam === 'player' ? playerCommands : enemyCommands
  const secondCommands = secondTeam === 'player' ? playerCommands : enemyCommands

  getTeam(state, firstTeam).filter(isAlive).sort((a, b) => a.slot - b.slot).forEach((fighter) => {
    const command = firstCommands[fighter.instanceId]
    if (!command) {
      resolveAction(state, ctx, { actorId: fighter.instanceId, team: firstTeam, abilityId: PASS_ABILITY_ID, targetId: null })
      return
    }
    resolveAction(state, ctx, command)
  })

  let winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(ctx, state.round, 'victory', getVictoryTone(winner), getVictoryMessage(winner))
    return { state, events: ctx.events, runtimeEvents: ctx.runtimeEvents }
  }

  tickTeamTurn(state, ctx, firstTeam)

  getTeam(state, secondTeam).filter(isAlive).sort((a, b) => a.slot - b.slot).forEach((fighter) => {
    const command = secondCommands[fighter.instanceId]
    if (!command) {
      resolveAction(state, ctx, { actorId: fighter.instanceId, team: secondTeam, abilityId: PASS_ABILITY_ID, targetId: null })
      return
    }
    resolveAction(state, ctx, command)
  })

  makeRuntimeEvent(ctx, state.round, 'round_ended', { meta: { legacy: true } })
  applyFatigue(state, ctx)
  resolveScheduledEffects(state, ctx, 'roundEnd')
  state.playerTeam.concat(state.enemyTeam).forEach((fighter) => {
    if (!isAlive(fighter)) return
    firePassives(state, ctx, fighter, null, 'onRoundEnd')
  })
  tickTeamTurn(state, ctx, secondTeam)
  tickRoundEnd(state, ctx)

  winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(ctx, state.round, 'victory', getVictoryTone(winner), getVictoryMessage(winner))
  } else {
    state.round += 1
    makeRuntimeEvent(ctx, state.round, 'round_started', { meta: { battlefield: state.battlefield.id, legacy: true } })
    applyRoundStartEffects(state, ctx)
    applyRoundEnergyGeneration(state, ctx)
    state.activePlayer = state.firstPlayer
    state.phase = 'firstPlayerCommand'
    makeEvent(ctx, state.round, 'phase', 'frost', `Round ${state.round} command window opened.`)
  }

  return { state, events: ctx.events, runtimeEvents: ctx.runtimeEvents }
}
