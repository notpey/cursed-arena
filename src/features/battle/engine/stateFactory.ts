import { cloneEffect } from '@/features/battle/engine/clone.ts'
import { cloneAbilityTemplate } from '@/features/battle/reactions.ts'
import type {
  BattleAbilityStateDelta,
  BattleAbilityTemplate,
  BattleClassStunState,
  BattleEffectImmunityState,
  BattleFighterState,
  BattleReactionGuardState,
  SkillEffect,
} from '@/features/battle/types.ts'

export function hasBaseAbility(fighter: BattleFighterState, slotAbilityId: string) {
  return (
    fighter.abilities.some((ability) => ability.id === slotAbilityId)
    || fighter.ultimate.id === slotAbilityId
  )
}

export function ensureCooldownEntry(fighter: BattleFighterState, abilityId: string) {
  if (!(abilityId in fighter.cooldowns)) {
    fighter.cooldowns[abilityId] = 0
  }
}

export function addAbilityStateDelta(
  fighter: BattleFighterState,
  delta: BattleAbilityStateDelta,
) {
  switch (delta.mode) {
    case 'replace':
      fighter.abilityState = fighter.abilityState.filter(
        (current) =>
          !(current.mode === 'replace' && current.slotAbilityId === delta.slotAbilityId),
      )
      fighter.abilityState.push({ ...delta, replacement: cloneAbilityTemplate(delta.replacement) })
      ensureCooldownEntry(fighter, delta.replacement.id)
      return
    case 'grant':
      fighter.abilityState = fighter.abilityState.filter(
        (current) =>
          !(current.mode === 'grant' && current.grantedAbility.id === delta.grantedAbility.id),
      )
      fighter.abilityState.push({
        ...delta,
        grantedAbility: cloneAbilityTemplate(delta.grantedAbility),
      })
      ensureCooldownEntry(fighter, delta.grantedAbility.id)
      return
    case 'lock':
      fighter.abilityState = fighter.abilityState.filter(
        (current) =>
          !(current.mode === 'lock' && current.slotAbilityId === delta.slotAbilityId),
      )
      fighter.abilityState.push({ ...delta })
      return
  }
}

export function createClassStunState(
  actor: BattleFighterState,
  abilityId: string | undefined,
  effect: Extract<SkillEffect, { type: 'classStun' }>,
  round: number,
): BattleClassStunState {
  return {
    id: `classstun-${actor.instanceId}-${abilityId ?? 'passive'}-${Date.now()}`,
    label: `Class Stun (${effect.blockedClasses.join(', ')})`,
    blockedClasses: [...effect.blockedClasses],
    remainingRounds: effect.duration,
    appliedInRound: round,
    sourceActorId: actor.instanceId,
    sourceAbilityId: abilityId,
  }
}

export function createReactionGuardState(
  actor: BattleFighterState,
  abilityId: string | undefined,
  effect: Extract<SkillEffect, { type: 'counter' | 'reflect' | 'reaction' }>,
  round: number,
): BattleReactionGuardState {
  return {
    id: `reaction-${effect.type}-${actor.instanceId}-${abilityId ?? 'passive'}-${Date.now()}`,
    kind: effect.type === 'reaction' ? 'effect' : effect.type,
    label:
      effect.type === 'counter'
        ? 'Counter'
        : effect.type === 'reflect'
          ? 'Reflect'
          : effect.label,
    remainingRounds: effect.duration,
    appliedInRound: round,
    counterDamage: effect.type === 'counter' ? effect.counterDamage : undefined,
    abilityClasses: effect.abilityClasses ? [...effect.abilityClasses] : undefined,
    consumeOnTrigger: effect.consumeOnTrigger ?? true,
    trigger: effect.type === 'reaction' ? effect.trigger : undefined,
    harmfulOnly: effect.type === 'reaction' ? effect.harmfulOnly : undefined,
    oncePerRound: effect.type === 'reaction' ? effect.oncePerRound : undefined,
    triggeredRounds: effect.type === 'reaction' ? [] : undefined,
    effects: effect.type === 'reaction' ? effect.effects.map(cloneEffect) : undefined,
    sourceActorId: actor.instanceId,
    sourceAbilityId: abilityId,
  }
}

export function isAbilityClassStunned(
  fighter: BattleFighterState,
  ability: BattleAbilityTemplate,
): boolean {
  return fighter.classStuns.some(
    (cs) =>
      cs.remainingRounds > 0 && ability.classes.some((cls) => cs.blockedClasses.includes(cls)),
  )
}

export function createEffectImmunityState(
  actor: BattleFighterState,
  abilityId: string | undefined,
  effect: Extract<SkillEffect, { type: 'effectImmunity' }>,
): BattleEffectImmunityState {
  return {
    id: `immunity-${actor.instanceId}-${abilityId ?? 'passive'}-${actor.effectImmunities.length}`,
    label: effect.label,
    blocks: [...effect.blocks],
    remainingRounds: effect.duration,
    tags: effect.tags ? [...effect.tags] : undefined,
    sourceActorId: actor.instanceId,
    sourceAbilityId: abilityId,
  }
}
