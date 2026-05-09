import {
  PASS_ABILITY_ID,
  battleRosterById,
  defaultBattleSetup,
} from '@/features/battle/data.ts'
import { normalizeBattleAssetSrc } from '@/features/battle/assets.ts'
import {
  getCooldown,
  getFighterById,
  getOpposingTeam,
  getTeam,
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
  tickIntentStuns,
  tickReactionGuards,
} from '@/features/battle/engine/tick.ts'
import {
  emitCounterChange,
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
  getResolvedAbilityEnergyCost,
} from '@/features/battle/engine/costModifier.ts'
import { buildEnemyCommands } from '@/features/battle/engine/ai.ts'
import {
  abilityCanBeCountered,
  abilityCanBeReflected,
  canEffectBeReflected,
  consumeReactionGuard,
  guardMatchesAbility,
  isEffectBlocked,
  isHelpfulAbility,
  isHarmfulAbility,
} from '@/features/battle/engine/reactionPredicates.ts'
import {
  createEffectImmunityState,
  isAbilityClassStunned,
  isAbilityIntentStunned,
} from '@/features/battle/engine/stateFactory.ts'
import {
  getWinner,
  getVictoryTone,
  getVictoryMessage,
} from '@/features/battle/engine/victory.ts'
import {
  battleEnergyOrder,
  canPayEnergy,
  countEnergyCost,
  createRoundEnergyPool,
  formatEnergyAmounts,
  getEnergyPool,
  getRefreshGain,
  getSpentEnergyAmounts,
  normalizeEnergyAmount,
  normalizeEnergyCost,
  refreshRoundEnergy,
  spendEnergy,
  sumEnergyCosts,
  type BattleEnergyCost,
} from '@/features/battle/energy.ts'
import { createSeededRandom } from '@/features/battle/random.ts'
import {
  cloneAbilityTemplate,
  clonePassiveEffect,
} from '@/features/battle/reactions.ts'
import {
  createModifierInstance,
  createModifiers,
  getFighterModifierPool,
  getTeamModifierBucket,
  hasBooleanModifierValue,
  hasModifierStatus,
  removeModifiers,
  setTeamModifierBucket,
  sumNumericModifierValues,
  syncFighterStatusesFromModifiers,
  tickModifiers,
  upsertModifier,
} from '@/features/battle/modifiers.ts'
import {
  calculateDamage,
  calculateHealing,
  getNumericModifierTotal,
  getTriggeredPassiveEffects,
  hasModifierBoolean,
  matchesReactionCondition,
  type ReactionContext,
} from '@/features/battle/engine/effects/modifierContext.ts'
import { applyDamagePacket } from '@/features/battle/engine/effects/damagePacket.ts'
import { applyHealPacket } from '@/features/battle/engine/effects/healPacket.ts'
import { applyEnergyDrain, applyEnergyGain, applyEnergySteal } from '@/features/battle/engine/effects/resourceEffects.ts'
import { applyShieldDamageToFighter, applyShieldToFighter } from '@/features/battle/engine/effects/shieldPacket.ts'
import { applyCooldownAdjustEffect, applyModifyAbilityCost } from '@/features/battle/engine/effects/costCooldownEffects.ts'
import { applyModifyAbilityState, applyReplaceAbilities, applyReplaceAbility } from '@/features/battle/engine/effects/abilityStateEffects.ts'
import { createRandomEnemyDamageOverTime, createScheduledEffect } from '@/features/battle/engine/effects/scheduledEffects.ts'
import {
  applyAttackUpStatus,
  applyBurnStatus,
  applyClassStunScaledByCounterStatus,
  applyClassStunStatus,
  applyIntentStunStatus,
  applyInvulnerableStatus,
  applyMarkStatus,
  applyStunStatus,
} from '@/features/battle/engine/effects/statusEffects.ts'
import {
  applyAdjustCounterByTriggerAmountEffect,
  applyAdjustCounterEffect,
  applyAdjustSourceCounterEffect,
  applyClearModeEffect,
  applyResetCounterEffect,
  applySetCounterEffect,
  applySetFlagEffect,
  applySetModeEffect,
} from '@/features/battle/engine/effects/stateFlagEffects.ts'
import { resolveRandomEnemyDamageTick } from '@/features/battle/engine/effects/randomEnemyDamageTick.ts'
import { applyCounterSetupEffect, applyReactionSetupEffect, applyReflectSetupEffect } from '@/features/battle/engine/effects/reactionSetupEffects.ts'
import { createStatuses } from '@/features/battle/statuses.ts'
import { BATTLE_STATE_SCHEMA_VERSION } from '@/features/battle/types.ts'
import type {
  BattleAbilityTemplate,
  BattleDamagePacket,
  BattleFighterState,
  BattleHealPacket,
  BattleModifierFilter,
  BattleModifierTemplate,
  BattleReactionTrigger,
  BattleResolutionResult,
  BattleScheduledPhase,
  BattleState,
  BattleTeamId,
  BattleTimelineResult,
  BattleTimelineStep,
  BattleTimelineStepKind,
  PassiveTrigger,
  QueuedBattleAction,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'
type PreDamageReactionResult = {
  cancelAction: boolean
  reflectedTargetIds: Set<string>
}

const ROT_COUNTER_KEY = 'rot'
const ROT_MARKER_TAG = 'rot'
const ROT_OUTGOING_TAG = 'rot-outgoing-damage-down'
const ESO_BLOOD_BROTHERS_FLAG = 'eso_blood_brothers'

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
        boardPortraitSrc: normalizeBattleAssetSrc(template.boardPortraitSrc),
        portraitFrame: template.portraitFrame,
        boardPortraitFrame: template.boardPortraitFrame,
        maxHp: template.maxHp,
        hp: template.maxHp,
        passiveEffects: template.passiveEffects?.map((passive) => {
          const cloned = clonePassiveEffect(passive)
          if (cloned.icon) cloned.icon.src = normalizeBattleAssetSrc(cloned.icon.src)
          return cloned
        }),
        abilities: template.abilities.map((ability) => {
          const cloned = cloneAbilityTemplate(ability)
          cloned.icon.src = normalizeBattleAssetSrc(cloned.icon.src)
          return cloned
        }),
        ultimate: (() => {
          const cloned = cloneAbilityTemplate(template.ultimate)
          cloned.icon.src = normalizeBattleAssetSrc(cloned.icon.src)
          return cloned
        })(),
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
        intentStuns: [],
        reactionGuards: [],
        lastAttackerId: null,
      }
    })
    .filter(Boolean) as BattleFighterState[]
}


function hasRot(fighter: BattleFighterState) {
  return (fighter.stateCounters[ROT_COUNTER_KEY] ?? 0) > 0
}



function targetHasRequiredTags(state: BattleState, target: BattleFighterState, ability: BattleAbilityTemplate) {
  const requiredTags = ability.requiredTargetTags ?? []
  if (requiredTags.length === 0) return true
  return requiredTags.every((tag) => getFighterModifierPool(state, target).some((modifier) => modifier.tags.includes(tag)))
}

/**
 * Returns true if the ability has at least one damage/shieldDamage effect that
 * explicitly carries ignoresInvulnerability, meaning it can hit invulnerable targets.
 */
function abilityIgnoresInvulnerability(ability: BattleAbilityTemplate): boolean {
  return (ability.effects ?? []).some((effect) =>
    (effect.type === 'damage'
      || effect.type === 'damageFiltered'
      || effect.type === 'damageScaledByCounter'
      || effect.type === 'damageEqualToActorShield')
    && effect.ignoresInvulnerability === true,
  )
}

/**
 * Whether an invulnerable enemy fighter is a valid target for the given ability.
 * Harmful abilities cannot target invulnerable fighters unless the ability explicitly
 * bypasses invulnerability. Helpful/neutral abilities may still target them.
 */
export function canAbilityTargetFighter(
  state: BattleState,
  ability: BattleAbilityTemplate,
  target: BattleFighterState,
): boolean {
  const targetIsInvulnerable = hasBooleanModifierValue(
    target.modifiers,
    'isInvulnerable',
    true,
    { statusKind: 'invincible' },
  )

  if (targetIsInvulnerable && isHarmfulAbility(ability) && !abilityIgnoresInvulnerability(ability)) {
    return false
  }

  return targetHasRequiredTags(state, target, ability)
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
          applyDamagePacket(state, ctx, target, actor, packet, firePassives, runEffectReactionGuards, applyDefeat)
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
    if (guard.helpfulOnly && (!ability || !isHelpfulAbility(ability))) continue
    if (guard.newSkillOnly && ability && source?.lastUsedAbilityId === ability.id) continue
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
      undefined,
      undefined,
      guard.linkedTargetId,
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
  if (isAbilityIntentStunned(fighter, ability)) return false
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
  if (isAbilityIntentStunned(fighter, ability)) return 'Skill intent sealed'
  if (isAbilityClassStunned(fighter, ability)) return 'Technique class sealed'

  const cooldown = getCooldown(fighter, abilityId)
  if (cooldown > 0) return `Cooldown ${cooldown} turn${cooldown === 1 ? '' : 's'}`

  if (
    (
      ability.targetRule === 'enemy-single'
      || ability.targetRule === 'ally-single'
      || ability.targetRule === 'enemy-all'
      || ability.targetRule === 'ally-all'
    )
    && getValidTargetIds(state, fighter.instanceId, abilityId).length === 0
  ) {
    return 'No valid targets'
  }

  const projectedPool = getProjectedTeamEnergy(state, queued, fighter.team, fighter.instanceId)
  if (!canPayEnergy(projectedPool, getResolvedAbilityEnergyCost(fighter, ability).cost)) {
    return 'Insufficient cursed energy'
  }

  return null
}

/**
 * Canonical command validator for a fully-formed QueuedBattleAction.
 * Returns null when the command is legal, or a human-readable reason string
 * when it should be rejected.
 *
 * `queued` is the map of already-queued commands for the same turn, used to
 * detect team-energy overcommit across multiple actors.  Omit (or pass {})
 * when validating in isolation.
 */
export function getBattleCommandBlockReason(
  state: BattleState,
  command: QueuedBattleAction,
  queued: Record<string, QueuedBattleAction> = {},
): string | null {
  const actor = getFighterById(state, command.actorId)
  if (!actor) return 'Actor not found'
  if (!isAlive(actor)) return 'Fighter is KO'
  if (actor.team !== command.team) return 'Actor does not belong to command team'

  const ability = getAbilityById(actor, command.abilityId)
  if (!ability) return 'Technique unavailable'

  if (command.abilityId === PASS_ABILITY_ID) return null

  if (hasModifierStatus(actor.modifiers, 'stun')) return 'Stunned this turn'
  if (isAbilityIntentStunned(actor, ability)) return 'Skill intent sealed'
  if (isAbilityClassStunned(actor, ability)) return 'Technique class sealed'

  const cooldown = getCooldown(actor, command.abilityId)
  if (cooldown > 0) return `Cooldown ${cooldown} turn${cooldown === 1 ? '' : 's'}`

  if (ability.targetRule === 'enemy-single' || ability.targetRule === 'ally-single') {
    const validIds = getValidTargetIds(state, actor.instanceId, command.abilityId)
    if (validIds.length === 0) return 'No valid targets'
    if (!command.targetId) return 'No target selected'
    if (!validIds.includes(command.targetId)) return 'Invalid target'
  }

  // Validate random energy allocation before checking the projected pool.
  const { cost } = getResolvedAbilityEnergyCost(actor, ability)
  const resolvedCost = getCommandResolvedCost(cost, command)
  if (!canPayEnergy(getEnergyPool(state, actor.team), resolvedCost)) {
    return 'Insufficient cursed energy'
  }

  // Projected check: account for all already-queued commands from the same team.
  const projectedPool = getProjectedTeamEnergy(state, queued, actor.team, actor.instanceId)
  if (!canPayEnergy(projectedPool, resolvedCost)) {
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
      return enemies.filter((fighter) => canAbilityTargetFighter(state, ability, fighter)).map((fighter) => fighter.instanceId)
    case 'ally-single':
      return allies.filter((fighter) => canAbilityTargetFighter(state, ability, fighter)).map((fighter) => fighter.instanceId)
    case 'enemy-all':
      return enemies.filter((fighter) => canAbilityTargetFighter(state, ability, fighter)).map((fighter) => fighter.instanceId)
    case 'ally-all':
      return allies.filter((fighter) => canAbilityTargetFighter(state, ability, fighter)).map((fighter) => fighter.instanceId)
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


function resolveEffectTargets(
  targetMode: SkillEffect['target'],
  actor: BattleFighterState,
  selectedTarget: BattleFighterState | null,
  allies: BattleFighterState[],
  enemies: BattleFighterState[],
  state?: BattleState,
  linkedTargetId?: string,
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
    case 'linked-target': {
      if (!state || !linkedTargetId) return []
      const linkedTarget = getFighterById(state, linkedTargetId)
      return linkedTarget && isAlive(linkedTarget) ? [linkedTarget] : []
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

function applyRotMarkerAndRewards(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  amount: number,
  abilityId?: string,
) {
  if (amount <= 0 || !hasRot(target)) return

  applyModifierToFighter(state, ctx, target, {
    label: 'Rot',
    stat: 'cooldownTick',
    mode: 'flat',
    value: 0,
    duration: { kind: 'permanent' },
    tags: [ROT_MARKER_TAG],
    visible: true,
    stacking: 'replace',
  }, actor.instanceId, abilityId)

  const alliedEso = getTeam(state, actor.team).find(
    (fighter) => fighter.templateId === 'eso' && fighter.stateFlags[ESO_BLOOD_BROTHERS_FLAG] && isAlive(fighter),
  )
  if (alliedEso) {
    applyShieldToFighter(state, ctx, alliedEso, alliedEso, {
      type: 'shield',
      amount: 5 * amount,
      label: 'Blood Brothers',
      tags: ['blood-brothers'],
      target: 'self',
    }, 'eso-blood-brothers', firePassives)
    makeEvent(ctx, state.round, 'system', 'teal', `${alliedEso.shortName} gained blood-bound defense.`, alliedEso.instanceId, alliedEso.instanceId, 5 * amount, 'eso-blood-brothers')
  }
}

function removeRotMarkerIfEmpty(
  state: BattleState,
  ctx: ResolutionContext,
  target: BattleFighterState,
  actorId?: string,
  abilityId?: string,
) {
  if (hasRot(target)) return
  removeModifiersFromFighter(state, ctx, target, { tags: [ROT_MARKER_TAG] }, actorId, abilityId)
}

function applyRotOutgoingPenalty(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  ability: BattleAbilityTemplate,
) {
  const stacks = actor.stateCounters[ROT_COUNTER_KEY] ?? 0
  if (stacks <= 0 || !isHarmfulAbility(ability) || actor.lastUsedAbilityId === ability.id) return

  const amount = -5 * stacks
  applyModifierToFighter(state, ctx, actor, {
    label: 'Rot Weakening',
    stat: 'damageDealt',
    mode: 'flat',
    value: amount,
    duration: { kind: 'rounds', rounds: 1 },
    tags: [ROT_OUTGOING_TAG],
    visible: true,
    stacking: 'replace',
    excludedDamageClass: 'Affliction',
  }, actor.instanceId, ability.id)
  makeEvent(ctx, state.round, 'status', 'red', `${actor.shortName}'s Rot reduced non-affliction damage by ${Math.abs(amount)}.`, actor.instanceId, actor.instanceId, Math.abs(amount), ability.id)
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

function setCooldown(fighter: BattleFighterState, ability: BattleAbilityTemplate) {
  fighter.cooldowns[ability.id] = ability.cooldown
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
  linkedTargetId?: string,
) {
  const allies = getTeam(state, actor.team).filter(isAlive)
  const enemies = getOpposingTeam(state, actor.team).filter(isAlive)
  const isUlt = abilityClasses?.includes('Ultimate') ?? false
  const resolvedAbility = abilityId ? getAbilityById(actor, abilityId) ?? undefined : undefined
  const rotCounterCallbacks = {
    counterKey: ROT_COUNTER_KEY,
    applyMarkerAndRewards: applyRotMarkerAndRewards,
    removeMarkerIfEmpty: removeRotMarkerIfEmpty,
  }

  for (const effect of effects) {
    const targets = resolveEffectTargets(effect.target, actor, target, allies, enemies, state, linkedTargetId)

    if (effect.type === 'schedule') {
      createScheduledEffect(state, ctx, actor, targets, effect, abilityId)
      continue
    }

    if (effect.type === 'randomEnemyDamageOverTime') {
      createRandomEnemyDamageOverTime(state, ctx, actor, effect, abilityId)
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

      if (isEffectBlocked(effectTarget, effect, effectActor.instanceId)) {
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
          resolveRandomEnemyDamageTick(state, ctx, actor, effect, abilityId, abilityClasses, firePassives, runEffectReactionGuards, applyDefeat)
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
          applyDamagePacket(state, ctx, packetActor, packetTarget, packet, firePassives, runEffectReactionGuards, applyDefeat, effect)
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
          applyDamagePacket(state, ctx, effectActor, effectTarget, packet, firePassives, runEffectReactionGuards, applyDefeat, effect)
          break
        }
        case 'energyGain': {
          applyEnergyGain(state, ctx, effectActor, effectTarget, effect, abilityId, abilityClasses)
          break
        }
        case 'energyDrain': {
          applyEnergyDrain(state, ctx, effectActor, effectTarget, effect, abilityId, abilityClasses)
          break
        }
        case 'energySteal': {
          applyEnergySteal(state, ctx, effectActor, effectTarget, effect, abilityId, abilityClasses)
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
          applyDamagePacket(state, ctx, effectActor, effectTarget, dePacket, firePassives, runEffectReactionGuards, applyDefeat, effect)
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
          applyDamagePacket(state, ctx, packetActor, packetTarget, packet, firePassives, runEffectReactionGuards, applyDefeat, effect)
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
          applyHealPacket(state, ctx, effectActor, effectTarget, packet, firePassives)
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
            applyHealPacket(state, ctx, effectActor, effectTarget, overhealPacket, firePassives)
          }
          if (overflow > 0) {
            applyShieldToFighter(state, ctx, effectActor, effectTarget, {
              type: 'shield',
              amount: overflow,
              label: effect.shieldLabel ?? 'Overheal',
              tags: effect.shieldTags ?? [],
              target: effect.target,
            }, abilityId, firePassives)
            makeEvent(ctx, state.round, 'system', 'teal', `${effectTarget.shortName} gained ${overflow} shield from overheal.`, effectActor.instanceId, effectTarget.instanceId, overflow, abilityId)
          }
          break
        }
        case 'stun':
          applyStunStatus(state, ctx, effectActor, effectTarget, effect, abilityId, applyModifierToFighter)
          break
        case 'classStun':
          applyClassStunStatus(state, ctx, effectActor, effectTarget, effect, abilityId)
          break
        case 'intentStun':
          applyIntentStunStatus(state, ctx, effectActor, effectTarget, effect, abilityId)
          break
        case 'classStunScaledByCounter':
          applyClassStunScaledByCounterStatus(state, ctx, effectActor, effectTarget, effect, abilityId, removeModifiersFromFighter)
          break
        case 'invulnerable':
          applyInvulnerableStatus(state, ctx, actor, t, effect, abilityId, applyModifierToFighter)
          break
        case 'attackUp':
          applyAttackUpStatus(state, ctx, actor, t, effect, abilityId, applyModifierToFighter)
          break
        case 'mark':
          applyMarkStatus(state, ctx, effectActor, effectTarget, effect, abilityId, applyModifierToFighter)
          break
        case 'burn':
          applyBurnStatus(state, ctx, effectActor, effectTarget, effect, abilityId, applyModifierToFighter)
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
          applyModifyAbilityState(state, ctx, actor, t, effect, abilityId)
          break
        case 'replaceAbility':
          applyReplaceAbility(state, ctx, actor, t, effect, abilityId)
          break
        case 'replaceAbilities': {
          applyReplaceAbilities(state, ctx, actor, t, effect, abilityId)
          break
        }
        case 'shield':
          applyShieldToFighter(state, ctx, actor, t, effect, abilityId, firePassives)
          makeEvent(ctx, state.round, 'system', 'teal', `${t.shortName} gained ${effect.amount} shield.`, actor.instanceId, t.instanceId, effect.amount, abilityId)
          break
        case 'shieldDamage': {
          applyShieldDamageToFighter(state, ctx, effectActor, effectTarget, effect, abilityId, firePassives, runEffectReactionGuards)
          break
        }
        case 'modifyAbilityCost':
          applyModifyAbilityCost(state, ctx, actor, t, effect, abilityId)
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
          applyCounterSetupEffect(state, ctx, actor, t, effect, abilityId)
          break
        }
        case 'reflect': {
          applyReflectSetupEffect(state, ctx, actor, t, effect, abilityId)
          break
        }
        case 'reaction': {
          applyReactionSetupEffect(state, ctx, actor, t, effect, abilityId, target?.instanceId)
          break
        }
        case 'setFlag':
          applySetFlagEffect(state, ctx, actor, t, effect, abilityId)
          break
        case 'setMode':
          applySetModeEffect(state, ctx, actor, t, effect, abilityId)
          break
        case 'clearMode':
          applyClearModeEffect(state, ctx, actor, t, effect, abilityId)
          break
        case 'adjustCounter':
          applyAdjustCounterEffect(state, ctx, actor, t, effect, abilityId, rotCounterCallbacks)
          break
        case 'setCounter':
          applySetCounterEffect(state, ctx, actor, t, effect, abilityId, rotCounterCallbacks)
          break
        case 'adjustSourceCounter':
          applyAdjustSourceCounterEffect(state, ctx, actor, t, effect, abilityId)
          break
        case 'adjustCounterByTriggerAmount':
          applyAdjustCounterByTriggerAmountEffect(state, ctx, actor, t, effect, abilityId, triggerAmount)
          break
        case 'resetCounter':
          applyResetCounterEffect(state, ctx, actor, t, effect, abilityId, rotCounterCallbacks)
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
            resolveEffects(state, ctx, effectActor, effectTarget, branch, abilityId, abilityClasses, reactionResult, triggerAmount, linkedTargetId)
          }
          break
        }
        case 'cooldownReduction':
        case 'damageBoost':
          break
        case 'cooldownAdjust': {
          applyCooldownAdjustEffect(state, ctx, effectActor, effectTarget, effect, abilityId)
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
    tickIntentStuns(fighter, state.round)
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

  // Reject commands where the actor's actual team does not match the command's
  // declared team.  All other structural checks (target validity, energy,
  // cooldown, stun) are handled by the existing guards below; invulnerable
  // targets are intentionally allowed through so that damage-blocking mechanics
  // (e.g. Brink Control) can still fire on the correct unit.
  if (actor.team !== command.team) {
    makeEvent(ctx, state.round, 'system', 'frost', `${actor.shortName} couldn't activate ${ability.name}.`, actor.instanceId, undefined, undefined, ability.id)
    return
  }

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
  applyRotOutgoingPenalty(state, ctx, actor, ability)

  const explicitTarget = command.targetId ? getFighterById(state, command.targetId) : null
  const requiresValidatedSingleTarget = ability.targetRule === 'enemy-single' || ability.targetRule === 'ally-single'
  const singleTarget: BattleFighterState | null = (() => {
    if (!requiresValidatedSingleTarget) {
      return explicitTarget && isAlive(explicitTarget) ? explicitTarget : null
    }
    // Missing or dead target → no fallback; action resolves with no target.
    if (!explicitTarget || !isAlive(explicitTarget)) return null
    // Valid explicit target — use it directly.
    const validTargetIds = new Set(getValidTargetIds(state, actor.instanceId, ability.id))
    if (validTargetIds.has(explicitTarget.instanceId)) return explicitTarget
    // Target is alive but not in getValidTargetIds (e.g. invulnerable). Allow it so that
    // damage-blocking mechanics (e.g. Brink Control) still trigger on the correct unit,
    // but only if it's on the correct side of the field.
    const isCorrectSide = ability.targetRule === 'enemy-single'
      ? getOpposingTeam(state, actor.team).some((f) => f.instanceId === explicitTarget.instanceId)
      : getTeam(state, actor.team).some((f) => f.instanceId === explicitTarget.instanceId)
    return isCorrectSide ? explicitTarget : null
  })()
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
      applyDamagePacket(state, ctx, null, fighter, packet, firePassives, runEffectReactionGuards, applyDefeat)
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
    applyDamagePacket(state, ctx, null, fighter, packet, firePassives, runEffectReactionGuards, applyDefeat)
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

/**
 * @deprecated Legacy single-call round resolver.  Use the phased team-turn
 * flow instead:
 *   1. resolveTeamTurn(state, playerCommands, 'player' | 'enemy')
 *   2. transitionToSecondPlayer(state)
 *   3. resolveTeamTurn(state, secondCommands, secondTeam)
 *   4. endRound / beginNewRound as applicable
 *
 * resolveRound collapses both halves and the round boundary into one call,
 * which makes it unsuitable for the multiplayer turn-submission model where
 * each half-round is submitted and validated separately.  It is kept here only
 * for offline tooling / tests that have not yet been migrated.  New production
 * code should not call this function.
 */
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
