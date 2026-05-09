import { emitCounterChange, makeEvent, makeRuntimeEvent } from '@/features/battle/engine/events.ts'
import { createClassStunState, createIntentStunState } from '@/features/battle/engine/stateFactory.ts'
import { getFighterModifierPool, hasBooleanModifierForStat } from '@/features/battle/modifiers.ts'
import type {
  BattleFighterState,
  BattleModifierFilter,
  BattleModifierTemplate,
  BattleState,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'

type ApplyModifierToFighterFn = (
  state: BattleState,
  ctx: ResolutionContext,
  target: BattleFighterState,
  template: BattleModifierTemplate,
  actorId?: string,
  abilityId?: string,
) => unknown

type RemoveModifiersFromFighterFn = (
  state: BattleState,
  ctx: ResolutionContext,
  target: BattleFighterState,
  filter: BattleModifierFilter,
  actorId?: string,
  abilityId?: string,
) => unknown

export function applyStunStatus(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'stun' }>,
  abilityId: string | undefined,
  applyModifierToFighter: ApplyModifierToFighterFn,
): void {
  applyModifierToFighter(state, ctx, target, {
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
  makeEvent(ctx, state.round, 'status', 'gold', `${target.shortName} is stunned for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, effect.duration, abilityId)
}

export function applyClassStunStatus(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'classStun' }>,
  abilityId: string | undefined,
): void {
  target.classStuns.push(createClassStunState(actor, abilityId, effect, state.round, target.classStuns.length))
  makeEvent(ctx, state.round, 'status', 'gold', `${target.shortName}'s ${effect.blockedClasses.join('/')} techniques are sealed for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, effect.duration, abilityId)
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: { label: 'Class Stun', stat: 'classStun', mode: 'set', scope: 'fighter', status: null },
  })
}

export function applyIntentStunStatus(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'intentStun' }>,
  abilityId: string | undefined,
): void {
  target.intentStuns.push(createIntentStunState(actor, abilityId, effect, state.round, target.intentStuns.length))
  const label = effect.intent === 'harmful' ? 'harmful' : 'helpful'
  makeEvent(ctx, state.round, 'status', 'gold', `${target.shortName}'s ${label} skills are stunned for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, effect.duration, abilityId)
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: { label: 'Intent Stun', stat: 'intentStun', mode: 'set', scope: 'fighter', status: null, intent: effect.intent },
  })
}

export function applyClassStunScaledByCounterStatus(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'classStunScaledByCounter' }>,
  abilityId: string | undefined,
  removeModifiersFromFighter: RemoveModifiersFromFighterFn,
): void {
  const stackCount = target.stateCounters[effect.counterKey] ?? 0
  const duration = effect.baseDuration + stackCount * effect.durationPerStack
  target.classStuns.push(createClassStunState(actor, abilityId, { type: 'classStun', duration, blockedClasses: effect.blockedClasses, exemptClasses: effect.exemptClasses, target: effect.target }, state.round, target.classStuns.length))
  makeEvent(ctx, state.round, 'status', 'gold', `${target.shortName}'s ${effect.blockedClasses.join('/')} techniques are sealed for ${duration} turn${duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, duration, abilityId)
  makeRuntimeEvent(ctx, state.round, 'modifier_applied', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    meta: { label: 'Class Stun', stat: 'classStun', mode: 'set', scope: 'fighter', status: null },
  })
  if (effect.consumeStacks) {
    target.stateCounters[effect.counterKey] = 0
    emitCounterChange(ctx, state.round, target, effect.counterKey, 0, actor.instanceId, abilityId)
    if (effect.modifierTag) {
      removeModifiersFromFighter(state, ctx, target, { tags: [effect.modifierTag] }, actor.instanceId, abilityId)
    }
  }
}

export function applyInvulnerableStatus(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'invulnerable' }>,
  abilityId: string | undefined,
  applyModifierToFighter: ApplyModifierToFighterFn,
): void {
  const canGain = !hasBooleanModifierForStat(getFighterModifierPool(state, target), 'canGainInvulnerable', false)
  if (!canGain) {
    makeEvent(ctx, state.round, 'system', 'frost', `${target.shortName} cannot become invulnerable.`, actor.instanceId, target.instanceId, undefined, abilityId)
    return
  }
  applyModifierToFighter(state, ctx, target, {
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
  makeEvent(ctx, state.round, 'status', 'teal', `${target.shortName} became untouchable for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, undefined, abilityId)
}

export function applyAttackUpStatus(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'attackUp' }>,
  abilityId: string | undefined,
  applyModifierToFighter: ApplyModifierToFighterFn,
): void {
  applyModifierToFighter(state, ctx, target, {
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
  makeEvent(ctx, state.round, 'status', 'teal', `${target.shortName} gained +${effect.amount} ATK for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, effect.amount, abilityId)
}

export function applyMarkStatus(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'mark' }>,
  abilityId: string | undefined,
  applyModifierToFighter: ApplyModifierToFighterFn,
): void {
  applyModifierToFighter(state, ctx, target, {
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
  makeEvent(ctx, state.round, 'status', 'red', `${target.shortName} was marked for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, effect.bonus, abilityId)
}

export function applyBurnStatus(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'burn' }>,
  abilityId: string | undefined,
  applyModifierToFighter: ApplyModifierToFighterFn,
): void {
  applyModifierToFighter(state, ctx, target, {
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
  makeEvent(ctx, state.round, 'status', 'red', `${target.shortName} is burning for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, effect.damage, abilityId)
}
