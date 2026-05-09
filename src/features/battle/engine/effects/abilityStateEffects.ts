import { makeEvent, makeRuntimeEvent } from '@/features/battle/engine/events.ts'
import { addAbilityStateDelta, hasBaseAbility } from '@/features/battle/engine/stateFactory.ts'
import type {
  BattleAbilityStateDelta,
  BattleFighterState,
  BattleState,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'

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

export function applyModifyAbilityState(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'modifyAbilityState' }>,
  abilityId: string | undefined,
): void {
  if ((effect.delta.mode === 'replace' || effect.delta.mode === 'lock') && !hasBaseAbility(target, effect.delta.slotAbilityId)) return
  applyAbilityStateDeltaToFighter(state, ctx, target, effect.delta, actor.instanceId, abilityId)
  makeEvent(
    ctx,
    state.round,
    'system',
    'teal',
    effect.delta.mode === 'replace'
      ? `${target.shortName} replaced ${effect.delta.slotAbilityId} with ${effect.delta.replacement.name} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
      : effect.delta.mode === 'grant'
        ? `${target.shortName} gained ${effect.delta.grantedAbility.name} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
        : `${target.shortName} locked ${effect.delta.slotAbilityId} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`,
    actor.instanceId,
    target.instanceId,
    undefined,
    abilityId,
  )
}

export function applyReplaceAbility(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'replaceAbility' }>,
  abilityId: string | undefined,
): void {
  if (!hasBaseAbility(target, effect.slotAbilityId)) return
  applyAbilityStateDeltaToFighter(state, ctx, target, {
    mode: 'replace',
    slotAbilityId: effect.slotAbilityId,
    replacement: effect.ability,
    duration: effect.duration,
  }, actor.instanceId, abilityId)
  makeEvent(ctx, state.round, 'system', 'teal', `${target.shortName} replaced ${effect.slotAbilityId} with ${effect.ability.name} for ${effect.duration} round${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, target.instanceId, undefined, abilityId)
}

export function applyReplaceAbilities(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'replaceAbilities' }>,
  abilityId: string | undefined,
): void {
  const applied: string[] = []
  for (const replacement of effect.replacements) {
    if (!hasBaseAbility(target, replacement.slotAbilityId)) continue
    applyAbilityStateDeltaToFighter(state, ctx, target, {
      mode: 'replace',
      slotAbilityId: replacement.slotAbilityId,
      replacement: replacement.ability,
      duration: replacement.duration,
    }, actor.instanceId, abilityId)
    applied.push(replacement.ability.name)
  }
  if (applied.length > 0) {
    makeEvent(ctx, state.round, 'system', 'teal', `${target.shortName} transformed: ${applied.join(', ')}.`, actor.instanceId, target.instanceId, undefined, abilityId)
  }
}
