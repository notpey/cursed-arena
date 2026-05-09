import { cloneEffect } from '@/features/battle/engine/clone.ts'
import { makeEvent, makeRuntimeEvent } from '@/features/battle/engine/events.ts'
import type {
  BattleFighterState,
  BattleState,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'

export function createScheduledEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  targets: BattleFighterState[],
  effect: Extract<SkillEffect, { type: 'schedule' }>,
  abilityId: string | undefined,
): void {
  if (targets.length === 0) return
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
}

export function createRandomEnemyDamageOverTime(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'randomEnemyDamageOverTime' }>,
  abilityId: string | undefined,
): void {
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
}
