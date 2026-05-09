import { getAbilityById } from '@/features/battle/engine/selectors.ts'
import { emitShieldEvent, makeEvent } from '@/features/battle/engine/events.ts'
import type { ReactionContext } from '@/features/battle/engine/effects/modifierContext.ts'
import type {
  BattleAbilityTemplate,
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

export function applyShieldToFighter(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'shield' }>,
  abilityId: string | undefined,
  firePassives: FirePassivesFn,
): void {
  const label = effect.label?.trim() || 'Barrier'
  const tags = effect.tags ?? []
  const previous = target.shield
  target.shield = previous
    ? {
        ...previous,
        amount: previous.amount + effect.amount,
        label,
        sourceActorId: actor.instanceId,
        sourceAbilityId: abilityId,
        tags: Array.from(new Set(previous.tags.concat(tags))),
      }
    : {
        amount: effect.amount,
        label,
        sourceActorId: actor.instanceId,
        sourceAbilityId: abilityId,
        tags: [...tags],
      }

  emitShieldEvent(ctx, state.round, 'shield_applied', target, {
    actorId: actor.instanceId,
    abilityId,
    amount: effect.amount,
    label,
    tags,
  })
  const shieldAbility = abilityId ? getAbilityById(target, abilityId) ?? undefined : undefined
  firePassives(state, ctx, target, actor, 'onShieldGain', shieldAbility, undefined, effect.amount)
}

export function applyShieldDamageToFighter(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  target: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'shieldDamage' }>,
  abilityId: string | undefined,
  firePassives: FirePassivesFn,
  runEffectReactionGuards: RunEffectReactionGuardsFn,
): void {
  if (!target.shield) return
  if (effect.tag && !target.shield.tags.includes(effect.tag)) return

  const shield = target.shield
  const drained = Math.min(shield.amount, effect.amount)
  shield.amount -= drained
  emitShieldEvent(ctx, state.round, 'shield_damaged', target, {
    actorId: actor.instanceId,
    abilityId,
    amount: drained,
    label: shield.label,
    tags: shield.tags,
  })

  if (shield.amount <= 0) {
    const brokenShield = shield
    target.shield = null
    emitShieldEvent(ctx, state.round, 'shield_broken', target, {
      actorId: actor.instanceId,
      abilityId,
      amount: brokenShield.amount,
      label: brokenShield.label,
      tags: brokenShield.tags,
    })
    firePassives(
      state,
      ctx,
      target,
      actor,
      'onShieldBroken',
      abilityId ? getAbilityById(actor, abilityId) ?? undefined : undefined,
      effect,
      brokenShield.amount,
      { brokenShieldTags: brokenShield.tags },
    )
    runEffectReactionGuards(
      state,
      ctx,
      target,
      'onShieldBroken',
      actor,
      abilityId ? getAbilityById(actor, abilityId) ?? undefined : undefined,
    )
  }

  makeEvent(
    ctx,
    state.round,
    'system',
    'frost',
    `${actor.shortName} damaged ${target.shortName}'s shield by ${drained}.`,
    actor.instanceId,
    target.instanceId,
    drained,
    abilityId,
  )
}
