import { makeEvent, makeRuntimeEvent } from '@/features/battle/engine/events.ts'
import { createReactionGuardState } from '@/features/battle/engine/stateFactory.ts'
import type {
  BattleFighterState,
  BattleState,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'

export function applyCounterSetupEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'counter' }>,
  abilityId: string | undefined,
): void {
  target.reactionGuards = target.reactionGuards.filter((guard) => guard.kind !== 'counter')
  const guard = createReactionGuardState(actor, abilityId, effect, state.round, target.reactionGuards.length)
  target.reactionGuards.push(guard)
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: { label: guard.label, stat: 'counter', mode: 'set', scope: 'fighter', status: null },
  })
  makeEvent(
    ctx,
    state.round,
    'status',
    'gold',
    `${target.shortName} is ready to counter a harmful skill for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`,
    actor.instanceId,
    target.instanceId,
    effect.counterDamage,
    abilityId,
  )
}

export function applyReflectSetupEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'reflect' }>,
  abilityId: string | undefined,
): void {
  target.reactionGuards = target.reactionGuards.filter((guard) => guard.kind !== 'reflect')
  const guard = createReactionGuardState(actor, abilityId, effect, state.round, target.reactionGuards.length)
  target.reactionGuards.push(guard)
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: { label: guard.label, stat: 'reflect', mode: 'set', scope: 'fighter', status: null },
  })
  makeEvent(
    ctx,
    state.round,
    'status',
    'teal',
    `${target.shortName} is ready to reflect a harmful skill for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`,
    actor.instanceId,
    target.instanceId,
    undefined,
    abilityId,
  )
}

export function applyReactionSetupEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'reaction' }>,
  abilityId: string | undefined,
  linkedTargetId: string | undefined,
): void {
  const guard = createReactionGuardState(actor, abilityId, effect, state.round, target.reactionGuards.length, linkedTargetId)
  target.reactionGuards = target.reactionGuards.filter(
    (existing) => !(existing.kind === 'effect' && existing.label === guard.label && existing.sourceActorId === guard.sourceActorId),
  )
  target.reactionGuards.push(guard)
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: { label: guard.label, stat: 'reaction', mode: 'set', scope: 'fighter', status: null },
  })
  makeEvent(
    ctx,
    state.round,
    'status',
    'teal',
    `${target.shortName} is affected by ${guard.label} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`,
    actor.instanceId,
    target.instanceId,
    undefined,
    abilityId,
  )
}
