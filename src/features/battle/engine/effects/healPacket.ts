import { getAbilityById, isAlive } from '@/features/battle/engine/selectors.ts'
import { makeEvent, makeRuntimeEvent } from '@/features/battle/engine/events.ts'
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
