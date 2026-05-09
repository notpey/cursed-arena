import {
  countEnergyAmounts,
  drainEnergyPool,
  formatEnergyAmounts,
  gainEnergyPool,
  getEnergyPool,
  getEnergyResourceDelta,
  setEnergyPool,
} from '@/features/battle/energy.ts'
import { emitResourceChange, makeEvent } from '@/features/battle/engine/events.ts'
import type {
  BattleFighterState,
  BattleSkillClass,
  BattleState,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'

export function applyEnergyGain(
  state: BattleState,
  ctx: ResolutionContext,
  effectActor: BattleFighterState,
  effectTarget: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'energyGain' }>,
  abilityId: string | undefined,
  abilityClasses: BattleSkillClass[] | undefined,
): void {
  const currentPool = getEnergyPool(state, effectTarget.team)
  const { pool: nextPool, gained } = gainEnergyPool(
    currentPool,
    effect.amount,
    `${state.battleSeed}:energyGain:${state.round}:${ctx.runtimeEvents.length}:${effectTarget.team}`,
  )
  if (countEnergyAmounts(gained) <= 0) return
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
}

export function applyEnergyDrain(
  state: BattleState,
  ctx: ResolutionContext,
  effectActor: BattleFighterState,
  effectTarget: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'energyDrain' }>,
  abilityId: string | undefined,
  abilityClasses: BattleSkillClass[] | undefined,
): void {
  const currentPool = getEnergyPool(state, effectTarget.team)
  const { pool: nextPool, drained } = drainEnergyPool(currentPool, effect.amount)
  if (countEnergyAmounts(drained) <= 0) return
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
}

export function applyEnergySteal(
  state: BattleState,
  ctx: ResolutionContext,
  effectActor: BattleFighterState,
  effectTarget: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'energySteal' }>,
  abilityId: string | undefined,
  abilityClasses: BattleSkillClass[] | undefined,
): void {
  const currentPool = getEnergyPool(state, effectTarget.team)
  const { pool: drainedPool, drained } = drainEnergyPool(currentPool, effect.amount)
  if (countEnergyAmounts(drained) <= 0) return

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
}
