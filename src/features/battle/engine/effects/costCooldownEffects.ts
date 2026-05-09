import { PASS_ABILITY_ID } from '@/features/battle/data.ts'
import { createCostModifierState } from '@/features/battle/engine/costModifier.ts'
import { makeEvent, makeRuntimeEvent } from '@/features/battle/engine/events.ts'
import { getAbilityById, getVisibleAbilities } from '@/features/battle/engine/selectors.ts'
import type {
  BattleFighterState,
  BattleState,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'

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

export function applyModifyAbilityCost(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'modifyAbilityCost' }>,
  abilityId: string | undefined,
): void {
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
  makeEvent(ctx, state.round, 'system', 'teal', `${target.shortName}'s technique cost shifted via ${effect.modifier.label}.`, actor.instanceId, target.instanceId, undefined, abilityId)
}

export function applyCooldownAdjustEffect(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'cooldownAdjust' }>,
  abilityId: string | undefined,
): void {
  const { changedAbilityIds, netDelta } = applyCooldownAdjust(target, effect)
  if (changedAbilityIds.length === 0) return
  makeRuntimeEvent(ctx, state.round, 'ability_resolved', {
    actorId: actor.instanceId,
    targetId: target.instanceId,
    team: target.team,
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
    `${target.shortName}'s cooldowns ${effect.amount < 0 ? 'reduced' : 'increased'} by ${Math.abs(effect.amount)}.`,
    actor.instanceId,
    target.instanceId,
    Math.abs(effect.amount),
    abilityId,
  )
}
