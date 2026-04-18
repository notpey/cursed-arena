import {
  PASS_ABILITY_ID,
  battlePassAbility,
  battleRosterById,
  defaultBattleSetup,
} from '@/features/battle/data'
import {
  battleEnergyExchangeCost,
  battleEnergyOrder,
  canExchangeEnergy,
  canPayEnergy,
  countEnergyCost,
  createRoundEnergyPool,
  exchangeEnergy,
  getAbilityEnergyCost,
  getRefreshGain,
  getSpentEnergyAmounts,
  refreshRoundEnergy,
  spendEnergy,
  sumEnergyCosts,
  totalEnergyInPool,
  type BattleEnergyType,
} from '@/features/battle/energy'
import { createSeededRandom } from '@/features/battle/random'
import {
  cloneAbilityTemplate,
  clonePassiveEffect,
  cloneScheduledEffect,
  getEffectivePassiveTrigger,
  getPassiveConditions,
} from '@/features/battle/reactions'
import {
  cloneModifiers,
  createModifierInstance,
  createModifiers,
  getFighterModifierPool,
  getNumericModifierMultiplier,
  getTeamModifierBucket,
  hasBooleanModifierValue,
  hasModifierStatus,
  removeModifiers,
  setTeamModifierBucket,
  sumNumericModifierValues,
  syncFighterStatusesFromModifiers,
  tickModifiers,
  upsertModifier,
} from '@/features/battle/modifiers'
import {
  cloneStatuses,
  createStatuses,
} from '@/features/battle/statuses'
import type {
  BattleAbilityStateDelta,
  BattleAbilityTemplate,
  BattleDamagePacket,
  BattleEvent,
  BattleEventTone,
  BattleFighterState,
  BattleHealPacket,
  BattleModifierFilter,
  BattleModifierInstance,
  BattleModifierStat,
  BattleModifierTemplate,
  BattleReactionCondition,
  BattleResolutionResult,
  BattleResourceKey,
  BattleResourcePacket,
  BattleRuntimeEvent,
  BattleRuntimeEventType,
  BattleScheduledPhase,
  BattleState,
  BattleStatusKind,
  BattleTeamId,
  BattleTimelineResult,
  BattleTimelineStep,
  BattleTimelineStepKind,
  PassiveEffect,
  PassiveTrigger,
  QueuedBattleAction,
  SkillEffect,
} from '@/features/battle/types'
type ReactionContext = {
  target: BattleFighterState | null
  ability?: BattleAbilityTemplate
  effect?: SkillEffect
  amount?: number
  isUltimate?: boolean
}

type ResolutionContext = {
  events: BattleEvent[]
  runtimeEvents: BattleRuntimeEvent[]
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

function cloneFighter(fighter: BattleFighterState): BattleFighterState {
  return {
    ...fighter,
    passiveEffects: fighter.passiveEffects?.map(clonePassiveEffect),
    abilities: fighter.abilities.map(cloneAbilityTemplate),
    ultimate: cloneAbilityTemplate(fighter.ultimate),
    cooldowns: { ...fighter.cooldowns },
    statuses: cloneStatuses(fighter.statuses),
    modifiers: cloneModifiers(fighter.modifiers),
    abilityState: fighter.abilityState.map(cloneAbilityStateDelta),
  }
}

function cloneState(state: BattleState): BattleState {
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
      }
    })
    .filter(Boolean) as BattleFighterState[]
}

function getVisibleAbilities(fighter: BattleFighterState) {
  const replacements = new Map(
    fighter.abilityState
      .filter((delta): delta is Extract<BattleAbilityStateDelta, { mode: 'replace' }> => delta.mode === 'replace')
      .map((delta) => [delta.slotAbilityId, delta.replacement]),
  )
  const locks = new Set(
    fighter.abilityState
      .filter((delta): delta is Extract<BattleAbilityStateDelta, { mode: 'lock' }> => delta.mode === 'lock')
      .map((delta) => delta.slotAbilityId),
  )
  const grants = fighter.abilityState
    .filter((delta): delta is Extract<BattleAbilityStateDelta, { mode: 'grant' }> => delta.mode === 'grant')
    .map((delta) => delta.grantedAbility)

  const baseAbilities = fighter.abilities.flatMap((ability) =>
    locks.has(ability.id) ? [] : [replacements.get(ability.id) ?? ability],
  )
  const ultimate = locks.has(fighter.ultimate.id) ? [] : [replacements.get(fighter.ultimate.id) ?? fighter.ultimate]

  return baseAbilities.concat(ultimate, grants)
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

function tickAbilityState(fighter: BattleFighterState) {
  fighter.abilityState = fighter.abilityState
    .map((delta) => ({ ...delta, duration: Math.max(0, delta.duration - 1) }))
    .filter((delta) => delta.duration > 0)
}
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
    battleSeed: setup.battleSeed,
    round: 1,
    phase: 'firstPlayerCommand',
    firstPlayer: first,
    activePlayer: first,
    battlefield: setup.battlefield,
    playerEnergy: createRoundEnergyPool(first === 'player' ? 1 : playerTeam.filter(isAlive).length, null, `${setup.battleSeed}:initial:player`),
    enemyEnergy: createRoundEnergyPool(first === 'enemy' ? 1 : enemyTeam.filter(isAlive).length, null, `${setup.battleSeed}:initial:enemy`),
    playerTeam,
    enemyTeam,
    playerTeamModifiers: createModifiers(),
    enemyTeamModifiers: createModifiers(),
    battlefieldModifiers: createModifiers(),
    scheduledEffects: [],
    winner: null,
  }
}

export function getTeam(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.playerTeam : state.enemyTeam
}

export function getOpposingTeam(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.enemyTeam : state.playerTeam
}

export function getFighterById(state: BattleState, fighterId: string) {
  return state.playerTeam.concat(state.enemyTeam).find((fighter) => fighter.instanceId === fighterId) ?? null
}

export function getAbilityById(fighter: BattleFighterState, abilityId: string) {
  if (abilityId === PASS_ABILITY_ID) return battlePassAbility
  return getVisibleAbilities(fighter).find((ability) => ability.id === abilityId) ?? null
}

export function getCooldown(fighter: BattleFighterState, abilityId: string) {
  return fighter.cooldowns[abilityId] ?? 0
}

export function isAlive(fighter: BattleFighterState) {
  return fighter.hp > 0
}

function getEnergyPool(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.playerEnergy : state.enemyEnergy
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

function getCommandEnergyCost(state: BattleState, command: QueuedBattleAction) {
  const actor = getFighterById(state, command.actorId)
  if (!actor) return {}

  const ability = getAbilityById(actor, command.abilityId)
  return ability ? getAbilityEnergyCost(ability) : {}
}

function cloneEnergyPool(state: BattleState, team: BattleTeamId) {
  const pool = getEnergyPool(state, team)
  return {
    amounts: { ...pool.amounts },
    focus: pool.focus,
  }
}

function tryAffordAbilityWithExchanges(pool: ReturnType<typeof cloneEnergyPool>, cost: ReturnType<typeof getAbilityEnergyCost>) {
  let current = {
    amounts: { ...pool.amounts },
    focus: pool.focus,
  }
  const exchanges: BattleEnergyType[] = []
  const maxExchanges = Math.floor(totalEnergyInPool(current) / battleEnergyExchangeCost)

  for (let index = 0; index <= maxExchanges; index += 1) {
    if (canPayEnergy(current, cost)) {
      return { pool: current, exchanges }
    }

    const deficits = battleEnergyOrder
      .map((type) => ({ type, amount: Math.max(0, (cost[type] ?? 0) - current.amounts[type]) }))
      .filter((entry) => entry.amount > 0)
      .sort((left, right) => right.amount - left.amount || battleEnergyOrder.indexOf(left.type) - battleEnergyOrder.indexOf(right.type))

    const targetType = deficits[0]?.type
    if (!targetType || !canExchangeEnergy(current)) {
      break
    }

    const next = exchangeEnergy(current, targetType)
    if (totalEnergyInPool(next) >= totalEnergyInPool(current)) {
      break
    }

    current = next
    exchanges.push(targetType)
  }

  return canPayEnergy(current, cost) ? { pool: current, exchanges } : null
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
  if (!canPayEnergy(getEnergyPool(state, fighter.team), getAbilityEnergyCost(ability))) return false
  return getCooldown(fighter, abilityId) <= 0
}

export function canQueueAbility(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
  fighter: BattleFighterState,
  abilityId: string,
) {
  const ability = getAbilityById(fighter, abilityId)
  if (!ability) return false
  if (!isAlive(fighter)) return false
  if (abilityId === PASS_ABILITY_ID) return true
  if (getCooldown(fighter, abilityId) > 0) return false

  const projectedPool = getProjectedTeamEnergy(state, queued, fighter.team, fighter.instanceId)
  return canPayEnergy(projectedPool, getAbilityEnergyCost(ability))
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
      return enemies.map((fighter) => fighter.instanceId)
    case 'ally-single':
      return allies.map((fighter) => fighter.instanceId)
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

function makeEvent(
  ctx: ResolutionContext,
  round: number,
  kind: BattleEvent['kind'],
  tone: BattleEventTone,
  message: string,
  actorId?: string,
  targetId?: string,
  amount?: number,
  abilityId?: string,
) {
  ctx.events.push({
    id: `battle-${round}-${ctx.events.length}`,
    round,
    kind,
    tone,
    message,
    actorId,
    targetId,
    amount,
    abilityId,
  })
}

function makeRuntimeEvent(
  ctx: ResolutionContext,
  round: number,
  type: BattleRuntimeEventType,
  payload: Omit<BattleRuntimeEvent, 'id' | 'round' | 'type'> = {},
) {
  ctx.runtimeEvents.push({
    id: `runtime-${round}-${ctx.runtimeEvents.length}`,
    round,
    type,
    ...payload,
  })
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
    case 'abilityId':
      return context.ability?.id === condition.abilityId
    case 'abilityTag':
      return Boolean(context.ability?.tags.includes(condition.tag))
    case 'isUltimate':
      return context.isUltimate ?? Boolean(context.ability?.tags.includes('ULT'))
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
) {
  const context: ReactionContext = {
    target,
    ability,
    effect,
    amount,
    isUltimate: ability?.tags.includes('ULT') ?? false,
  }

  getTriggeredPassiveEffects(actor, trigger, context).forEach(({ effects }) => {
    resolveEffects(state, ctx, actor, target, effects, ability?.id, ability?.tags)
  })
}

function createPassiveModifier(actor: BattleFighterState, effect: Extract<SkillEffect, { type: 'damageBoost' | 'cooldownReduction' }>): BattleModifierInstance {
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
    },
  )
}

function getPassiveModifiers(actor: BattleFighterState, context: ReactionContext) {
  return getTriggeredPassiveEffects(actor, 'whileAlive', context)
    .flatMap((entry) => entry.effects)
    .flatMap((effect) => {
      if (effect.type === 'damageBoost' || effect.type === 'cooldownReduction') {
        return [createPassiveModifier(actor, effect)]
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

function cloneEffect(effect: SkillEffect): SkillEffect {
  switch (effect.type) {
    case 'schedule':
      return { ...effect, effects: effect.effects.map(cloneEffect) }
    case 'replaceAbility':
      return { ...effect, ability: cloneAbilityTemplate(effect.ability) }
    case 'modifyAbilityState':
      return { ...effect, delta: cloneAbilityStateDelta(effect.delta) }
    default:
      return { ...effect }
  }
}

function resolveEffectTargets(
  targetMode: SkillEffect['target'],
  actor: BattleFighterState,
  selectedTarget: BattleFighterState | null,
  allies: BattleFighterState[],
  enemies: BattleFighterState[],
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
    default:
      return selectedTarget ? [selectedTarget] : []
  }
}

function getResourcePacketAmount(amounts: Partial<Record<BattleResourceKey, number>>) {
  if (typeof amounts.reserve === 'number') return amounts.reserve
  return Object.values(amounts).reduce((total, amount) => total + (amount ?? 0), 0)
}

function emitResourceChange(
  ctx: ResolutionContext,
  round: number,
  packet: BattleResourcePacket,
) {
  makeRuntimeEvent(ctx, round, 'resource_changed', {
    actorId: packet.sourceActorId,
    team: packet.targetTeam,
    abilityId: packet.abilityId,
    amount: getResourcePacketAmount(packet.amounts),
    tags: packet.tags,
    packet,
  })
}

function emitModifierApplied(
  ctx: ResolutionContext,
  round: number,
  target: BattleFighterState,
  modifier: BattleModifierInstance,
  actorId?: string,
  abilityId?: string,
) {
  makeRuntimeEvent(ctx, round, 'modifier_applied', {
    actorId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    amount: typeof modifier.value === 'number' ? modifier.value : undefined,
    tags: modifier.tags,
    meta: {
      label: modifier.label,
      stat: modifier.stat,
      mode: modifier.mode,
      scope: modifier.scope,
      status: modifier.statusKind ?? null,
    },
  })
}

function emitRemovedStatusEvents(
  ctx: ResolutionContext,
  round: number,
  target: BattleFighterState,
  beforeKinds: BattleStatusKind[],
  actorId?: string,
  abilityId?: string,
) {
  const beforeUnique = Array.from(new Set(beforeKinds))
  const afterKinds = new Set(target.statuses.map((status) => status.kind))

  target.statuses.forEach((status) => {
    if (beforeUnique.includes(status.kind)) return
    makeRuntimeEvent(ctx, round, 'status_applied', {
      actorId,
      targetId: target.instanceId,
      team: target.team,
      abilityId,
      amount:
        status.kind === 'mark'
          ? status.bonus
          : status.kind === 'burn'
            ? status.damage
            : status.kind === 'attackUp'
              ? status.amount
              : undefined,
      tags: ['status', status.kind],
      meta: {
        status: status.kind,
        duration: status.duration,
      },
    })
  })

  beforeUnique.forEach((kind) => {
    if (afterKinds.has(kind)) return
    makeRuntimeEvent(ctx, round, 'status_removed', {
      actorId,
      targetId: target.instanceId,
      team: target.team,
      abilityId,
      tags: ['status', kind],
      meta: { status: kind },
    })
  })
}

function emitModifierRemoved(
  ctx: ResolutionContext,
  round: number,
  modifier: BattleModifierInstance,
  payload: { actorId?: string; targetId?: string; team?: BattleTeamId; abilityId?: string } = {},
) {
  makeRuntimeEvent(ctx, round, 'modifier_removed', {
    actorId: payload.actorId,
    targetId: payload.targetId,
    team: payload.team,
    abilityId: payload.abilityId,
    amount: typeof modifier.value === 'number' ? modifier.value : undefined,
    tags: modifier.tags,
    meta: {
      label: modifier.label,
      stat: modifier.stat,
      mode: modifier.mode,
      scope: modifier.scope,
      status: modifier.statusKind ?? null,
    },
  })
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
    tags: ability?.tags,
  })
  firePassives(state, ctx, defeated, source, 'onDefeat', ability)
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
    return 0
  }

  target.hp = Math.max(0, target.hp - packet.amount)
  makeEvent(ctx, state.round, 'damage', 'red', `${actor?.shortName ?? target.shortName} hit ${target.shortName} for ${packet.amount}.`, actor?.instanceId, target.instanceId, packet.amount, packet.abilityId)
  makeRuntimeEvent(ctx, state.round, 'damage_applied', {
    actorId: packet.sourceActorId,
    targetId: packet.targetId,
    team: target.team,
    abilityId: packet.abilityId,
    amount: packet.amount,
    tags: packet.tags,
    packet,
  })

  if (actor) {
    const ability = packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined
    firePassives(state, ctx, actor, target, 'onDealDamage', ability, effect, packet.amount)
    firePassives(state, ctx, target, actor, 'onTakeDamage', ability, effect, packet.amount)
    if (target.hp <= 0) {
      applyDefeat(state, ctx, target, actor, ability)
    }
  } else if (target.hp <= 0) {
    applyDefeat(state, ctx, target, null)
  }

  return packet.amount
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
  abilityId?: string,
) {
  let amount = basePower
  const ability = abilityId ? getAbilityById(actor, abilityId) ?? undefined : undefined
  const actorContext: ReactionContext = { target, ability, isUltimate }
  const targetContext: ReactionContext = { target: actor, ability, isUltimate }

  amount += getNumericModifierTotal(state, actor, 'damageDealt', 'flat', actorContext)

  amount = Math.round(amount * (1 + getNumericModifierTotal(state, actor, 'damageDealt', 'percentAdd', actorContext)))
  amount = Math.round(amount * getModifierMultiplier(state, actor, 'damageDealt', actorContext))

  if (isUltimate) {
    amount = Math.round(amount * (1 + state.battlefield.ultimateDamageBoost))
  }

  amount += getNumericModifierTotal(state, target, 'damageTaken', 'flat', targetContext)
  amount = Math.round(amount * (1 + getNumericModifierTotal(state, target, 'damageTaken', 'percentAdd', targetContext)))
  amount = Math.round(amount * getModifierMultiplier(state, target, 'damageTaken', targetContext))

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
  const actorContext: ReactionContext = { target, ability, isUltimate: ability?.tags.includes('ULT') ?? false }
  const targetContext: ReactionContext = { target: actor, ability, isUltimate: ability?.tags.includes('ULT') ?? false }

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
  abilityTags?: string[],
) {
  const allies = getTeam(state, actor.team).filter(isAlive)
  const enemies = getOpposingTeam(state, actor.team).filter(isAlive)
  const isUlt = abilityTags?.includes('ULT') ?? false

  for (const effect of effects) {
    const targets = resolveEffectTargets(effect.target, actor, target, allies, enemies)

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

    const scopedTargets = new Set<string>()

    for (const t of targets) {
      if (effect.type === 'addModifier' || effect.type === 'removeModifier') {
        const modifierScope = effect.type === 'addModifier'
          ? effect.modifier.scope ?? 'fighter'
          : effect.filter.scope ?? 'fighter'
        const scopeKey = modifierScope === 'fighter'
          ? t.instanceId
          : modifierScope === 'team'
            ? `team:${t.team}`
            : 'battlefield'

        if (scopedTargets.has(scopeKey)) continue
        scopedTargets.add(scopeKey)
      }

      switch (effect.type) {
        case 'damage': {
          const amount = calculateDamage(state, actor, t, effect.power, isUlt, abilityId)
          const packet: BattleDamagePacket = {
            kind: 'damage',
            sourceActorId: actor.instanceId,
            targetId: t.instanceId,
            abilityId,
            baseAmount: effect.power,
            amount,
            damageType: 'normal',
            tags: abilityTags ?? [],
            flags: { isUltimate: isUlt },
          }
          applyDamagePacket(state, ctx, actor, t, packet, effect)
          break
        }
        case 'heal': {
          const amount = calculateHealing(state, actor, t, effect.power, abilityId)
          const packet: BattleHealPacket = {
            kind: 'heal',
            sourceActorId: actor.instanceId,
            targetId: t.instanceId,
            abilityId,
            baseAmount: effect.power,
            amount,
            tags: abilityTags ?? [],
            flags: {},
          }
          applyHealPacket(state, ctx, actor, t, packet)
          break
        }
        case 'stun':
          applyModifierToFighter(state, ctx, t, {
            label: 'Stun',
            stat: 'canAct',
            mode: 'set',
            value: false,
            duration: { kind: 'rounds', rounds: effect.duration },
            tags: ['status', 'stun'],
            visible: true,
            stacking: 'max',
            statusKind: 'stun',
          }, actor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'status', 'gold', `${t.shortName} is stunned for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, effect.duration, abilityId)
          break
        case 'invulnerable':
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
          applyModifierToFighter(state, ctx, t, {
            label: 'Mark',
            stat: 'damageTaken',
            mode: 'flat',
            value: effect.bonus,
            duration: { kind: 'rounds', rounds: effect.duration },
            tags: ['status', 'mark'],
            visible: true,
            stacking: 'max',
            statusKind: 'mark',
          }, actor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'status', 'red', `${t.shortName} was marked for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, effect.bonus, abilityId)
          break
        case 'burn':
          applyModifierToFighter(state, ctx, t, {
            label: 'Burn',
            stat: 'dotDamage',
            mode: 'flat',
            value: effect.damage,
            duration: { kind: 'rounds', rounds: effect.duration },
            tags: ['status', 'burn'],
            visible: true,
            stacking: 'max',
            statusKind: 'burn',
          }, actor.instanceId, abilityId)
          makeEvent(ctx, state.round, 'status', 'red', `${t.shortName} is burning for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, effect.damage, abilityId)
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
        case 'cooldownReduction':
        case 'damageBoost':
          break
      }
    }
  }
}

function tickRoundEnd(state: BattleState, ctx: ResolutionContext) {
  state.playerTeam.concat(state.enemyTeam).forEach((fighter) => {
    if (!isAlive(fighter)) return

    const cooldownTick = 1 + getNumericModifierTotal(state, fighter, 'cooldownTick', 'flat', { target: null })

    Object.keys(fighter.cooldowns).forEach((abilityId) => {
      fighter.cooldowns[abilityId] = Math.max(0, (fighter.cooldowns[abilityId] ?? 0) - cooldownTick)
    })

    const beforeKinds = fighter.statuses.map((status) => status.kind)
    const ticked = tickModifiers(fighter.modifiers)
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
  })

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

  if (!canUseAbility(state, actor, ability.id)) {
    makeEvent(ctx, state.round, 'system', 'frost', `${actor.shortName} couldn't activate ${ability.name}.`, actor.instanceId, undefined, undefined, ability.id)
    return
  }

  if (ability.id !== PASS_ABILITY_ID) {
    const cost = getAbilityEnergyCost(ability)
    const currentPool = getEnergyPool(state, actor.team)
    const spent = getSpentEnergyAmounts(currentPool, cost)
    const nextPool = spendEnergy(currentPool, cost)
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
        reserve: -countEnergyCost(cost),
        ...Object.fromEntries(
          battleEnergyOrder
            .map((type) => [type, spent ? -spent[type] : 0] as const)
            .filter((entry) => entry[1] !== 0),
        ),
      },
      tags: ability.tags,
    })
  }

  makeEvent(ctx, state.round, 'action', 'frost', `${actor.shortName} activated ${ability.name}.`, actor.instanceId, command.targetId ?? undefined, undefined, ability.id)
  makeEvent(ctx, state.round, 'action', 'frost', `${actor.shortName} activated ${ability.name}.`, actor.instanceId, command.targetId ?? undefined, undefined, ability.id)
  makeRuntimeEvent(ctx, state.round, 'ability_used', {
    actorId: actor.instanceId,
    targetId: command.targetId ?? undefined,
    team: actor.team,
    abilityId: ability.id,
    tags: ability.tags,
  })

  const allies = getTeam(state, actor.team)
  const enemies = getOpposingTeam(state, actor.team)
  const explicitTarget = command.targetId ? getFighterById(state, command.targetId) : null
  const singleTarget: BattleFighterState | null =
    (explicitTarget && isAlive(explicitTarget) ? explicitTarget : null) ??
    (ability.targetRule === 'enemy-single'
      ? enemies.find(isAlive) ?? null
      : ability.targetRule === 'ally-single'
        ? allies.find(isAlive) ?? null
        : null)

  firePassives(state, ctx, actor, singleTarget, 'onAbilityUse', ability)
  resolveEffects(state, ctx, actor, singleTarget, ability.effects ?? [], ability.id, ability.tags)
  firePassives(state, ctx, actor, singleTarget, 'onAbilityResolve', ability)
  makeRuntimeEvent(ctx, state.round, 'ability_resolved', {
    actorId: actor.instanceId,
    targetId: singleTarget?.instanceId,
    team: actor.team,
    abilityId: ability.id,
    tags: ability.tags,
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

function applyRoundEnergyGeneration(state: BattleState, ctx: ResolutionContext) {
  const playerAliveCount = state.playerTeam.filter(isAlive).length
  const enemyAliveCount = state.enemyTeam.filter(isAlive).length

  if (playerAliveCount > 0) {
    const playerSeed = `${state.battleSeed}:round:${state.round}:player`
    const playerGain = getRefreshGain(playerAliveCount, null, playerSeed)
    state.playerEnergy = refreshRoundEnergy(state.playerEnergy, playerAliveCount, playerSeed, null)
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
    const enemyGain = getRefreshGain(enemyAliveCount, null, enemySeed)
    state.enemyEnergy = refreshRoundEnergy(state.enemyEnergy, enemyAliveCount, enemySeed, null)
    makeEvent(
      ctx,
      state.round,
      'system',
      'red',
      `Enemy cursed energy refreshed: ${formatEnergyAmounts(enemyGain)}.`,
    )
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


function getWinner(state: BattleState): BattleTeamId | null {
  const playerAlive = state.playerTeam.some(isAlive)
  const enemyAlive = state.enemyTeam.some(isAlive)
  if (playerAlive && enemyAlive) return null
  if (playerAlive) return 'player'
  if (enemyAlive) return 'enemy'
  return 'enemy'
}

export function buildEnemyCommands(state: BattleState): Record<string, QueuedBattleAction> {
  const commands: Record<string, QueuedBattleAction> = {}
  let plannedPool = cloneEnergyPool(state, 'enemy')

  const fighters = state.enemyTeam
    .filter(isAlive)
    .sort((left, right) => left.slot - right.slot)

  fighters.forEach((fighter) => {
    const lowHpAlly = state.enemyTeam.filter(isAlive).sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp)[0]
    const enemyFront = state.playerTeam.filter(isAlive).sort((left, right) => left.hp - right.hp)[0]

    const availableAbilities = getVisibleAbilities(fighter)
      .filter((ability) => getCooldown(fighter, ability.id) <= 0)

    const sorted = availableAbilities
      .map((ability) => {
        let score = ability.power ?? ability.healPower ?? ability.attackBuffAmount ?? 0
        if (ability.tags.includes('ULT') && state.round >= 3) score += 28
        if (ability.kind === 'heal' && lowHpAlly && lowHpAlly.hp / lowHpAlly.maxHp < 0.5) score += 40
        if (ability.kind === 'defend' && fighter.hp / fighter.maxHp < 0.35) score += 26
        if (ability.kind === 'buff' && fighter.hp / fighter.maxHp > 0.35) score += 14
        if (ability.kind === 'debuff') score += 18
        return { ability, score }
      })
      .sort((left, right) => right.score - left.score)

    const plannedAction =
      sorted
        .map(({ ability }) => {
          const cost = getAbilityEnergyCost(ability)
          if (canPayEnergy(plannedPool, cost)) {
            return { ability, pool: plannedPool }
          }

          const exchangePlan = tryAffordAbilityWithExchanges(plannedPool, cost)
          if (!exchangePlan) return null

          return {
            ability,
            pool: exchangePlan.pool,
          }
        })
        .find((entry) => Boolean(entry)) ?? null

    const ability = plannedAction?.ability ?? battlePassAbility
    let targetId: string | null = null

    if (ability.targetRule === 'enemy-single') {
      targetId = enemyFront?.instanceId ?? null
    } else if (ability.targetRule === 'ally-single') {
      targetId = lowHpAlly?.instanceId ?? fighter.instanceId
    } else if (ability.targetRule === 'self') {
      targetId = fighter.instanceId
    }

    commands[fighter.instanceId] = {
      actorId: fighter.instanceId,
      team: 'enemy',
      abilityId: ability.id,
      targetId,
    }

    if (ability.id !== PASS_ABILITY_ID) {
      plannedPool = spendEnergy(plannedAction?.pool ?? plannedPool, getAbilityEnergyCost(ability))
    }
  })

  return commands
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
    makeEvent(ctx, state.round, 'victory', winner === 'player' ? 'teal' : 'red', winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.')
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
        winner === 'player' ? 'teal' : 'red',
        winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.',
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
    makeEvent(ctx, state.round, 'victory', winner === 'player' ? 'teal' : 'red', winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.')
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
      winner === 'player' ? 'teal' : 'red',
      winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.',
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
  tickRoundEnd(state, ctx)

  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(ctx, state.round, 'victory', winner === 'player' ? 'teal' : 'red', winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.')
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
  tickRoundEnd(state, ctx)

  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(
      ctx,
      state.round,
      'victory',
      winner === 'player' ? 'teal' : 'red',
      winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.',
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
    makeEvent(ctx, state.round, 'victory', winner === 'player' ? 'teal' : 'red', winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.')
    return { state, events: ctx.events, runtimeEvents: ctx.runtimeEvents }
  }

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
  tickRoundEnd(state, ctx)

  winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(ctx, state.round, 'victory', winner === 'player' ? 'teal' : 'red', winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.')
  } else {
    state.round += 1
    makeRuntimeEvent(ctx, state.round, 'round_started', { meta: { battlefield: state.battlefield.id, legacy: true } })
    applyRoundStartEffects(state, ctx)
    applyRoundEnergyGeneration(state, ctx)
    makeEvent(ctx, state.round, 'phase', 'frost', `Round ${state.round} command window opened.`)
  }

  return { state, events: ctx.events, runtimeEvents: ctx.runtimeEvents }
}

















