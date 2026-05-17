import { emitCounterChange } from '@/features/battle/engine/events.ts'
import { applyDamagePacket } from '@/features/battle/engine/effects/damagePacket.ts'
import { calculateDamage, type ReactionContext } from '@/features/battle/engine/effects/modifierContext.ts'
import { getOpposingTeam, isAlive } from '@/features/battle/engine/selectors.ts'
import { createSeededRandom } from '@/features/battle/random.ts'
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

function adjustFighterCounter(fighter: BattleFighterState, key: string, amount: number): void {
  fighter.stateCounters[key] = (fighter.stateCounters[key] ?? 0) + amount
}

export function resolveRandomEnemyDamageTick(
  state: BattleState,
  ctx: ResolutionContext,
  actor: BattleFighterState,
  effect: Extract<SkillEffect, { type: 'randomEnemyDamageTick' }>,
  abilityId: string | undefined,
  abilityClasses: BattleAbilityTemplate['classes'] | undefined,
  firePassives: FirePassivesFn,
  runEffectReactionGuards: RunEffectReactionGuardsFn,
  applyDefeat: ApplyDefeatFn,
): void {
  const aliveEnemies = getOpposingTeam(state, actor.team).filter(isAlive)
  if (aliveEnemies.length === 0) return

  const unhitEnemies = aliveEnemies.filter((enemy) => (actor.stateCounters[`${effect.historyKey}:${enemy.templateId}`] ?? 0) <= 0)
  const candidates = unhitEnemies.length > 0 ? unhitEnemies : aliveEnemies
  state.randomTickCount = (state.randomTickCount ?? 0) + 1
  const rng = createSeededRandom(`${state.battleSeed}:${effect.historyKey}:${state.round}:${state.randomTickCount}`)
  const target = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]
  if (!target) return

  const wasRepeat = (actor.stateCounters[`${effect.historyKey}:${target.templateId}`] ?? 0) > 0
  actor.stateCounters[`${effect.historyKey}:${target.templateId}`] = (actor.stateCounters[`${effect.historyKey}:${target.templateId}`] ?? 0) + 1
  emitCounterChange(ctx, state.round, actor, `${effect.historyKey}:${target.templateId}`, actor.stateCounters[`${effect.historyKey}:${target.templateId}`] ?? 0, actor.instanceId, abilityId)

  if (wasRepeat && effect.repeatCounterKey && effect.repeatCounterAmount) {
    adjustFighterCounter(actor, effect.repeatCounterKey, effect.repeatCounterAmount)
    emitCounterChange(ctx, state.round, actor, effect.repeatCounterKey, actor.stateCounters[effect.repeatCounterKey] ?? 0, actor.instanceId, abilityId)
  }

  if (!wasRepeat && effect.newTargetCounterKey && effect.newTargetCounterAmount) {
    adjustFighterCounter(actor, effect.newTargetCounterKey, effect.newTargetCounterAmount)
    emitCounterChange(ctx, state.round, actor, effect.newTargetCounterKey, actor.stateCounters[effect.newTargetCounterKey] ?? 0, actor.instanceId, abilityId)
  }

  const effectivePower = wasRepeat && effect.repeatPowerBonus ? effect.power + effect.repeatPowerBonus : effect.power
  const isAfflictionClass = abilityClasses?.includes('Affliction') ?? false
  const amount = calculateDamage(state, actor, target, effectivePower, abilityClasses?.includes('Ultimate') ?? false, false, abilityId, abilityClasses)
  const packet: BattleDamagePacket = {
    kind: 'damage',
    sourceActorId: actor.instanceId,
    targetId: target.instanceId,
    abilityId,
    baseAmount: effectivePower,
    amount,
    damageType: 'normal',
    tags: abilityClasses ?? [],
    flags: { ignoresShield: isAfflictionClass },
  }
  applyDamagePacket(state, ctx, actor, target, packet, firePassives, runEffectReactionGuards, applyDefeat, effect)
}
