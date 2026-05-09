import { getAbilityById, isAlive } from '@/features/battle/engine/selectors.ts'
import { emitCounterChange, makeEvent, makeRuntimeEvent } from '@/features/battle/engine/events.ts'
import type {
  BattleAbilityTemplate,
  BattleFighterState,
  BattleHealPacket,
  BattleState,
  PassiveTrigger,
  ResolutionContext,
  SkillEffect,
} from '@/features/battle/types.ts'

type FirePassivesFn = (
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState | null,
  trigger: Exclude<PassiveTrigger, 'onTargetBelow'>,
  ability?: BattleAbilityTemplate,
  effect?: SkillEffect,
  amount?: number,
) => void

export function applyHealScaledByCounter(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'healScaledByCounter' }>,
  abilityId: string | undefined,
  firePassives: FirePassivesFn,
): void {
  const counterOwner = (effect.counterSource ?? 'actor') === 'actor' ? actor : target
  const stackCount = counterOwner.stateCounters[effect.counterKey] ?? 0
  if (stackCount <= 0) return
  const power = stackCount * effect.powerPerStack
  const packet: BattleHealPacket = {
    kind: 'heal',
    sourceActorId: actor.instanceId,
    targetId: target.instanceId,
    abilityId,
    baseAmount: power,
    amount: power,
    tags: [],
    flags: {},
  }
  applyHealPacket(state, ctx, actor, target, packet, firePassives)
  if (effect.consumeStacks) {
    counterOwner.stateCounters[effect.counterKey] = 0
    emitCounterChange(ctx, state.round, counterOwner, effect.counterKey, 0, actor.instanceId, abilityId)
  }
}

export function applyHealPacket(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  packet: BattleHealPacket,
  firePassives: FirePassivesFn,
): number {
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
