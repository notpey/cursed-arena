import type { BattleFighterState } from '@/features/battle/types.ts'

export function tickAbilityState(fighter: BattleFighterState) {
  fighter.abilityState = fighter.abilityState
    .map((delta) => ({ ...delta, duration: Math.max(0, delta.duration - 1) }))
    .filter((delta) => delta.duration > 0)
}

export function tickCostModifiers(fighter: BattleFighterState) {
  fighter.costModifiers = fighter.costModifiers
    .map((modifier) => ({ ...modifier, remainingRounds: Math.max(0, modifier.remainingRounds - 1) }))
    .filter((modifier) => modifier.remainingRounds > 0 && (modifier.remainingUses == null || modifier.remainingUses > 0))
}

export function tickEffectImmunities(fighter: BattleFighterState) {
  fighter.effectImmunities = fighter.effectImmunities
    .map((immunity) => ({ ...immunity, remainingRounds: Math.max(0, immunity.remainingRounds - 1) }))
    .filter((immunity) => immunity.remainingRounds > 0)
}

export function tickClassStuns(fighter: BattleFighterState, round: number) {
  fighter.classStuns = fighter.classStuns
    .map((cs) => {
      // Skip the first end-of-round tick: "stun for N turns" should mean
      // the victim misses N of *their own* turns, not N-1.
      if (cs.appliedInRound !== undefined && cs.appliedInRound === round) return cs
      return { ...cs, remainingRounds: Math.max(0, cs.remainingRounds - 1) }
    })
    .filter((cs) => cs.remainingRounds > 0)
}

export function tickIntentStuns(fighter: BattleFighterState, round: number) {
  fighter.intentStuns = fighter.intentStuns
    .map((stun) => {
      if (stun.appliedInRound !== undefined && stun.appliedInRound === round) return stun
      return { ...stun, remainingRounds: Math.max(0, stun.remainingRounds - 1) }
    })
    .filter((stun) => stun.remainingRounds > 0)
}

export function tickReactionGuards(fighter: BattleFighterState, round: number) {
  fighter.reactionGuards = fighter.reactionGuards
    .map((guard) => {
      if (guard.appliedInRound !== undefined && guard.appliedInRound === round) return guard
      return { ...guard, remainingRounds: Math.max(0, guard.remainingRounds - 1) }
    })
    .filter((guard) => guard.remainingRounds > 0)
}
