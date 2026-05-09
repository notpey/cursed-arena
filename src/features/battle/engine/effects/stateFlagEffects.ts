import { emitCounterChange, emitFlagChange, makeEvent, makeRuntimeEvent } from '@/features/battle/engine/events.ts'
import { getFighterById } from '@/features/battle/engine/selectors.ts'
import { getFighterModifierPool } from '@/features/battle/modifiers.ts'
import type {
  BattleFighterState,
  BattleState,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'

type RotCounterCallbacks = {
  counterKey: string
  applyMarkerAndRewards: (
    state: BattleState,
    ctx: ResolutionContext,
    actor: BattleFighterState,
    target: BattleFighterState,
    amount: number,
    abilityId?: string,
  ) => void
  removeMarkerIfEmpty: (
    state: BattleState,
    ctx: ResolutionContext,
    target: BattleFighterState,
    actorId?: string,
    abilityId?: string,
  ) => void
}

function setFighterFlag(fighter: BattleFighterState, key: string, value: boolean): void {
  fighter.stateFlags[key] = value
}

function adjustFighterCounter(fighter: BattleFighterState, key: string, amount: number): void {
  fighter.stateCounters[key] = (fighter.stateCounters[key] ?? 0) + amount
}

function getModifierSourceFighter(state: BattleState, modifier: { sourceActorId?: string }): BattleFighterState | null {
  return modifier.sourceActorId ? getFighterById(state, modifier.sourceActorId) : null
}

export function applySetFlagEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'setFlag' }>,
  abilityId: string | undefined,
): void {
  setFighterFlag(target, effect.key, effect.value)
  emitFlagChange(ctx, state.round, target, effect.key, effect.value, actor.instanceId, abilityId)
}

export function applySetModeEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'setMode' }>,
  abilityId: string | undefined,
): void {
  target.stateModeDurations ??= {}
  target.stateModes[effect.key] = effect.value
  if (effect.duration && effect.duration > 0) {
    target.stateModeDurations[effect.key] = { remainingRounds: effect.duration, appliedInRound: state.round }
  } else {
    delete target.stateModeDurations[effect.key]
  }
  makeRuntimeEvent(ctx, state.round, 'fighter_flag_changed', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: { key: effect.key, value: effect.value, duration: effect.duration ?? null },
  })
  makeEvent(ctx, state.round, 'status', 'teal', `${target.shortName} entered ${effect.value}.`, actor.instanceId, target.instanceId, undefined, abilityId)
}

export function applyClearModeEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'clearMode' }>,
  abilityId: string | undefined,
): void {
  delete target.stateModes[effect.key]
  delete target.stateModeDurations?.[effect.key]
  makeRuntimeEvent(ctx, state.round, 'fighter_flag_changed', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: { key: effect.key, value: null },
  })
  makeEvent(ctx, state.round, 'status', 'frost', `${target.shortName} left ${effect.key}.`, actor.instanceId, target.instanceId, undefined, abilityId)
}

export function applyAdjustCounterEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'adjustCounter' }>,
  abilityId: string | undefined,
  rotCallbacks: RotCounterCallbacks,
): void {
  if (effect.requiresTag && !getFighterModifierPool(state, target).some((modifier) => modifier.tags.includes(effect.requiresTag!))) return
  adjustFighterCounter(target, effect.key, effect.amount)
  if (effect.min != null || effect.max != null) {
    const current = target.stateCounters[effect.key] ?? 0
    target.stateCounters[effect.key] = Math.min(effect.max ?? current, Math.max(effect.min ?? current, current))
  }
  emitCounterChange(ctx, state.round, target, effect.key, target.stateCounters[effect.key] ?? 0, actor.instanceId, abilityId)
  if (effect.key === rotCallbacks.counterKey) {
    rotCallbacks.applyMarkerAndRewards(state, ctx, actor, target, effect.amount, abilityId)
    rotCallbacks.removeMarkerIfEmpty(state, ctx, target, actor.instanceId, abilityId)
  }
}

export function applySetCounterEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'setCounter' }>,
  abilityId: string | undefined,
  rotCallbacks: RotCounterCallbacks,
): void {
  target.stateCounters[effect.key] = effect.value
  emitCounterChange(ctx, state.round, target, effect.key, effect.value, actor.instanceId, abilityId)
  if (effect.key === rotCallbacks.counterKey) {
    if (effect.value > 0) rotCallbacks.applyMarkerAndRewards(state, ctx, actor, target, effect.value, abilityId)
    rotCallbacks.removeMarkerIfEmpty(state, ctx, target, actor.instanceId, abilityId)
  }
}

export function applyAdjustSourceCounterEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'adjustSourceCounter' }>,
  abilityId: string | undefined,
): void {
  const source = getModifierSourceFighter(state, { sourceActorId: target.modifiers.find((modifier) => modifier.sourceActorId === actor.instanceId)?.sourceActorId }) ?? actor
  adjustFighterCounter(source, effect.key, effect.amount)
  emitCounterChange(ctx, state.round, source, effect.key, source.stateCounters[effect.key] ?? 0, actor.instanceId, abilityId)
}

export function applyAdjustCounterByTriggerAmountEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'adjustCounterByTriggerAmount' }>,
  abilityId: string | undefined,
  triggerAmount: number | undefined,
): void {
  const delta = Math.floor(triggerAmount ?? 0)
  if (delta > 0) {
    adjustFighterCounter(target, effect.key, delta)
    emitCounterChange(ctx, state.round, target, effect.key, target.stateCounters[effect.key] ?? 0, actor.instanceId, abilityId)
  }
}

export function applyResetCounterEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'resetCounter' }>,
  abilityId: string | undefined,
  rotCallbacks: RotCounterCallbacks,
): void {
  target.stateCounters[effect.key] = 0
  emitCounterChange(ctx, state.round, target, effect.key, 0, actor.instanceId, abilityId)
  if (effect.key === rotCallbacks.counterKey) {
    rotCallbacks.removeMarkerIfEmpty(state, ctx, target, actor.instanceId, abilityId)
  }
}
