import { getAbilityById, isAlive } from '@/features/battle/engine/selectors.ts'
import {
  emitCounterChange,
  emitShieldEvent,
  makeEvent,
  makeRuntimeEvent,
} from '@/features/battle/engine/events.ts'
import { getFighterModifierPool, hasBooleanModifierForStat } from '@/features/battle/modifiers.ts'
import { hasModifierBoolean, type ReactionContext } from '@/features/battle/engine/effects/modifierContext.ts'
import type {
  BattleAbilityTemplate,
  BattleDamagePacket,
  BattleFighterState,
  BattleReactionTrigger,
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
  extraContext?: Partial<ReactionContext>,
) => void

type RunEffectReactionGuardsFn = (
  state: BattleState,
  ctx: ResolutionContext,
  observed: BattleFighterState,
  trigger: BattleReactionTrigger,
  source: BattleFighterState | null,
  ability?: BattleAbilityTemplate,
) => void

type ApplyDefeatFn = (
  state: BattleState,
  ctx: ResolutionContext,
  defeated: BattleFighterState,
  source: BattleFighterState | null,
  ability?: BattleAbilityTemplate,
) => void

export function applyDamagePacket(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState | null,
  target: BattleFighterState,
  packet: BattleDamagePacket,
  firePassives: FirePassivesFn,
  runEffectReactionGuards: RunEffectReactionGuardsFn,
  applyDefeat: ApplyDefeatFn,
  effect?: SkillEffect,
): number {
  if (!isAlive(target)) return 0

  // Self-applied damage (e.g. self-harm effects) bypasses immunity per Law 4.1.
  const isSelfApplied = packet.sourceActorId !== undefined && packet.sourceActorId === target.instanceId
  if (!isSelfApplied) {
    const blocked = target.effectImmunities.some((imm) => imm.blocks.includes('damage'))
    if (blocked) {
      makeEvent(ctx, state.round, 'system', 'teal', `${target.shortName}'s effect immunity blocked incoming damage.`, actor?.instanceId, target.instanceId, 0, packet.abilityId)
      makeRuntimeEvent(ctx, state.round, 'damage_blocked', {
        actorId: packet.sourceActorId,
        targetId: packet.targetId,
        team: target.team,
        abilityId: packet.abilityId,
        amount: 0,
        tags: packet.tags,
        packet,
        meta: { blockedByImmunity: true },
      })
      return 0
    }
  }

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
    const packetAbility = actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined
    if (target.modifiers.some((modifier) => modifier.tags.includes('yuji-sukuna-bonus-on-blocked-damage'))) {
      target.stateCounters.sukuna_bonus_hp = (target.stateCounters.sukuna_bonus_hp ?? 0) + 5
      emitCounterChange(ctx, state.round, target, 'sukuna_bonus_hp', target.stateCounters.sukuna_bonus_hp ?? 0, actor?.instanceId, packet.abilityId)
    }
    makeEvent(ctx, state.round, 'system', 'teal', `${target.shortName}'s invulnerability blocked ${actor?.shortName ?? 'the attack'}'s damage.`, actor?.instanceId, target.instanceId, 0, packet.abilityId)
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
    runEffectReactionGuards(state, ctx, target, 'onDamageBlocked', actor, packetAbility)
    return 0
  }

  let remainingDamage = packet.amount
  if (target.shield && target.shield.amount > 0 && !packet.flags.ignoresShield) {
    const absorbed = Math.min(target.shield.amount, remainingDamage)
    target.shield.amount -= absorbed
    remainingDamage -= absorbed
    emitShieldEvent(ctx, state.round, 'shield_damaged', target, {
      actorId: actor?.instanceId,
      abilityId: packet.abilityId,
      amount: absorbed,
      label: target.shield.label,
      tags: target.shield.tags,
      carryoverDamage: remainingDamage,
    })

    if (target.shield.amount <= 0) {
      const brokenShield = target.shield
      target.shield = null
      emitShieldEvent(ctx, state.round, 'shield_broken', target, {
        actorId: actor?.instanceId,
        abilityId: packet.abilityId,
        amount: absorbed,
        label: brokenShield.label,
        tags: brokenShield.tags,
        carryoverDamage: remainingDamage,
        trigger: 'onShieldBroken',
      })
      makeEvent(
        ctx,
        state.round,
        'system',
        'gold',
        `${target.shortName}'s ${brokenShield.label} destructible defense was destroyed after absorbing ${absorbed}${remainingDamage > 0 ? `; ${remainingDamage} damage carried through` : ''}.`,
        actor?.instanceId,
        target.instanceId,
        absorbed,
        packet.abilityId,
      )
      firePassives(
        state,
        ctx,
        target,
        actor,
        'onShieldBroken',
        actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined,
        effect,
        absorbed,
        { brokenShieldTags: brokenShield.tags },
      )
      runEffectReactionGuards(
        state,
        ctx,
        target,
        'onShieldBroken',
        actor,
        actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined,
      )
    }
  }

  if (remainingDamage <= 0) {
    makeEvent(ctx, state.round, 'system', 'teal', `${target.shortName}'s destructible defense absorbed the hit with no carryover damage.`, actor?.instanceId, target.instanceId, 0, packet.abilityId)
    makeRuntimeEvent(ctx, state.round, 'damage_blocked', {
      actorId: packet.sourceActorId,
      targetId: packet.targetId,
      team: target.team,
      abilityId: packet.abilityId,
      amount: 0,
      tags: packet.tags,
      packet: { ...packet, amount: 0 },
      meta: { blockedByShield: true },
    })
    runEffectReactionGuards(
      state,
      ctx,
      target,
      'onDamageBlocked',
      actor,
      actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined,
    )
    return 0
  }

  const nextHp = Math.max(0, target.hp - remainingDamage)
  const isUndying = hasBooleanModifierForStat(getFighterModifierPool(state, target), 'isUndying', true)
  target.hp = isUndying && nextHp <= 0 ? 1 : nextHp
  makeEvent(ctx, state.round, 'damage', 'red', `${actor?.shortName ?? target.shortName} hit ${target.shortName} for ${remainingDamage}.`, actor?.instanceId, target.instanceId, remainingDamage, packet.abilityId)
  makeRuntimeEvent(ctx, state.round, 'damage_applied', {
    actorId: packet.sourceActorId,
    targetId: packet.targetId,
    team: target.team,
    abilityId: packet.abilityId,
    amount: remainingDamage,
    tags: packet.tags,
    packet: { ...packet, amount: remainingDamage },
  })
  runEffectReactionGuards(
    state,
    ctx,
    target,
    'onDamageApplied',
    actor,
    actor && packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined,
  )

  if (actor) {
    const ability = packet.abilityId ? getAbilityById(actor, packet.abilityId) ?? undefined : undefined
    target.lastAttackerId = actor.instanceId
    firePassives(state, ctx, actor, target, 'onDealDamage', ability, effect, remainingDamage)
    firePassives(state, ctx, target, actor, 'onTakeDamage', ability, effect, remainingDamage)
    if (target.hp <= 0) {
      applyDefeat(state, ctx, target, actor, ability)
    }
  } else if (target.hp <= 0) {
    applyDefeat(state, ctx, target, null)
  }

  return remainingDamage
}
