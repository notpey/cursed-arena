/**
 * referee.ts — Battle Referee Predicates (Phase 1–6A + Phase 8–10)
 *
 * Centralized, pure predicate functions that express the Combat Laws
 * (docs/battle-referee/00-combat-laws.md) as code.
 *
 * PHASE 2 CHANGES:
 *   - actorIsStunned / actorHasClassStun are NOW wired into
 *     canUseAbility() in engine.ts. The UI/engine stun gap is closed.
 *   - resolveScheduledEffects / resolveOneScheduledEffect now skip
 *     dead targets (fighters that died before the scheduled effect fires).
 *
 * PHASE 3 CHANGES:
 *   - canGainInvulnerability() is now enforced universally inside
 *     applyModifierToFighter(). Any path that tries to write
 *     isInvulnerable=true to a fighter is blocked and logged when the
 *     target has canGainInvulnerable=false. The redundant check that
 *     previously existed only in applyInvulnerableStatus() was removed.
 *
 * PHASE 4A CHANGES:
 *   - applyDamagePacket() in damagePacket.ts now checks effectImmunities
 *     for the 'damage' block before applying any raw damage packet.
 *     This covers burn DOT ticks, fatigue ticks, and counter damage —
 *     all three previously bypassed immunity. Self-applied packets
 *     (sourceActorId === target.instanceId) bypass per Law 4.1.
 *   - applyRotMarkerAndRewards() in engine.ts now checks effectImmunities
 *     for the 'shield' block before calling applyShieldToFighter for the
 *     Blood Brothers passive (Eso's rot-marker shield reward).
 *
 * PHASE 4B CHANGES:
 *   - canReceiveHelpfulEffects is now a live modifier stat (added to
 *     BattleModifierStat in types.ts).
 *   - canReceiveHelpfulEffect() in referee.ts is now wired to read
 *     the real modifier instead of always returning true.
 *   - resolveEffects() in engine.ts checks this flag after effectImmunity
 *     and before dispatching any effect whose getEffectIntent() returns
 *     'helpful'. No self-bypass: the restriction applies regardless of actor.
 *   - Intent classification: uses getEffectIntent() from reactionPredicates.ts,
 *     which is the canonical per-effect-type declaration. Effects returning
 *     'neutral' or 'mixed' are not blocked here — 'mixed' effects (schedule,
 *     conditional, reaction) route their nested effects through resolveEffects
 *     recursively where each leaf is checked individually.
 *   - Ambiguous effects documented:
 *     'adjustCounter'/'setFlag'/'setMode' → 'neutral' (not blocked) since
 *     their impact is context-dependent and they are used by both harmful and
 *     helpful kits. 'removeModifier' → 'neutral' for same reason (cleanse vs
 *     debuff removal). These should get explicit intent flags in a future pass.
 *     'cooldownAdjust' with positive amount (increase) → 'harmful' (not
 *     blocked). 'cooldownAdjust' with negative (reduction) → 'helpful'
 *     (blocked by canReceiveHelpfulEffects). This matches existing intent logic.
 *
 * PHASE 5A CHANGES:
 *   - BattleScheduledEffect now carries an optional abilityClasses field
 *     (types.ts). createScheduledEffect() and createRandomEnemyDamageOverTime()
 *     accept and store the originating abilityClasses. resolveScheduledEffects()
 *     passes scheduled.abilityClasses to resolveEffects(). This means Affliction-
 *     class scheduled DOTs (randomEnemyDamageTick) correctly set ignoresShield
 *     on their damage packets, matching the behavior of direct Affliction damage.
 *   - resolveRandomEnemyDamageTick() now sets flags.ignoresShield from
 *     abilityClasses (was always empty flags: {}).
 *   - cloneScheduledEffect() in reactions.ts now deep-clones abilityClasses.
 *
 * PHASE 5A AUDIT FINDINGS (NO CODE CHANGE NEEDED):
 *   - Reflect path: ALREADY CORRECT. Reflected damage reuses the same
 *     effect flags (ignoresInvulnerability, ignoresShield, isPiercing), so
 *     attacker invulnerability/shields/DR apply normally via applyDamagePacket.
 *   - setHpFromCounter: Direct write `t.hp = Math.max(t.hp, amount)` can only
 *     RAISE hp (it's a minimum-HP set, like Sukuna's body restoration). It
 *     cannot bypass Undying because it never reduces HP to zero. No change needed.
 *   - Shield tag behavior: INTENTIONAL. shieldDamage and breakShield respect
 *     effect.tag vs shield.tags. Regular damage absorption ignores tags — this
 *     is correct for the single-shield model. See Phase 5B candidates below.
 *
 * PHASE 6A CHANGES:
 *   - runPreDamageReactionWindow() now sorts its `targets` array by fighter.slot
 *     before iterating. This makes counter and reflect priority deterministic:
 *     the lowest slot number (stable battlefield position) reacts first.
 *   - Counter-before-reflect ordering is already structural: the counter check
 *     has an early return that prevents reflect from running for the same target.
 *     Multiple targets can each independently trigger reflect; a counter on any
 *     target cancels the entire action and skips remaining targets.
 *   - Reaction guard damage (counter return damage) is flagged
 *     cannotBeCountered + cannotBeReflected on its packet, so it cannot chain
 *     another reaction window. This was already true before Phase 6A.
 *   - resolveCounterPriority() in this file was the design reference for the
 *     sort — the engine now matches that intent.
 *
 * PHASE 8 CHANGES:
 *   - resolveEffects() in engine.ts now has a dedicated invulnerability gate for
 *     non-damage harmful effects (Law 5.3: invulnerability is a TARGETING LAW).
 *   - The gate fires after effectImmunity and canReceiveHelpfulEffects, before
 *     the effect switch. It blocks any effect whose getEffectIntent() returns
 *     'harmful' against an invulnerable target, except:
 *     a) Damage effect types (damage, damageFiltered, damageScaledByCounter,
 *        damageEqualToActorShield) — handled by applyDamagePacket which already
 *        emits the canonical "invulnerability blocked" log.
 *     b) Self-bypass: when effectActor.instanceId === effectTarget.instanceId,
 *        the fighter's own invulnerability does not block their own effects (needed
 *        for self-targeted defensive abilities that grant invulnerable then reaction
 *        guard in the same ability, e.g. Junpei/Mahito/Hanami/Gojo kits).
 *     c) abilityIgnoresInvulnerability: the originating ability has a damage effect
 *        with ignoresInvulnerability: true (bypass passes all effects through).
 *   - On block, emits both a text log event and a 'effect_ignored' runtime event
 *     with meta: { effectType, blockedBy: 'invulnerability' }.
 *   - Fire-but-block contract is preserved: energy is spent, cooldown applied, text
 *     log emitted. Only the harmful effect resolution is suppressed.
 *
 * PHASE 9 CHANGES:
 *   - Added intent?: 'helpful' | 'harmful' | 'neutral' to 10 ambiguous SkillEffect
 *     union members (addModifier, removeModifier, setFlag, setMode, clearMode,
 *     adjustCounter, setCounter, adjustSourceCounter, adjustCounterByTriggerAmount,
 *     resetCounter) in types.ts.
 *   - getEffectIntent() in reactionPredicates.ts now reads the declared intent before
 *     the switch. Effects without a declared intent are unchanged (all 10 types still
 *     default to 'neutral' via the default case).
 *   - Yuji's Sukuna Vessel addModifier migrated to intent:'helpful' — the only
 *     clearly obvious existing case. All other kit usages of ambiguous types are
 *     bookkeeping and remain 'neutral'.
 *
 * PHASE 10 CHANGES:
 *   - BattleModifierTemplate / BattleModifierInstance now support
 *     onExpireEffects?: SkillEffect[].
 *   - Fighter-scoped modifiers resolve onExpireEffects through resolveEffects()
 *     only when tickModifiers() removes them by natural duration expiry.
 *   - Natural expiry uses the modifier's sourceActorId/sourceAbilityId and
 *     targetId context. If the original source fighter is dead but still present
 *     in state, the effect still resolves from that source; target death suppresses
 *     the effect. Team and battlefield modifiers intentionally do not fire
 *     on-expire hooks yet because they do not carry a concrete target owner.
 *
 * PHASE 11A CHANGES:
 *   - Replace ability-state deltas now support
 *     replacementsByRemainingTurns?: Record<number, BattleAbilityTemplate>.
 *   - getAbilityById()/getVisibleAbilities resolve the replacement variant
 *     matching the delta's current duration; missing keys fall back to the
 *     existing fixed replacement. Grant and lock behavior is unchanged.
 *   - Replacement cooldown carryover is intentionally not implemented here.
 *
 * PHASE 11B CHANGES:
 *   - resolveAction() no longer falls back from an unpayable requested random
 *     allocation to the raw ability cost. If the selected/requested cost cannot
 *     be paid, the action is interrupted before spending energy, setting
 *     cooldown, logging ability_used, or applying effects.
 *
 * PHASE 12 / POST-REFEREE REACTION TIMING:
 *   - Reaction effects can opt into deferEffectsUntilAfterTrigger. This is used
 *     for Gojo's Infinity Collapse cleanup so the triggering harmful action is
 *     blocked by active Infinity/fire-but-block first, then Infinity collapses.
 *     The generic contract is documented in
 *     docs/battle-referee/06-reaction-timing-laws.md. The general reaction
 *     priority order is unchanged.
 *   - Effect immunities now carry appliedInRound and skip their first same-round
 *     tick, matching modifiers, reaction guards, and state modes.
 *   - Character Readiness Phase 5 extended reaction effects with explicit
 *     intent?: 'helpful' | 'harmful' | 'neutral' for enemy-facing trap setup
 *     such as Momo Coordinated Assault and Hanami Cursed Bud Growth.
 *
 * PHASE 5B CANDIDATES (NOT YET IMPLEMENTED):
 *   - Shield tag behavior for regular damage: currently intentionally tag-agnostic.
 *     If a future design requires "this shield only protects against X damage type",
 *     that requires a model extension (Phase 5B or later).
 */

import { getCooldown, getAbilityById, isAlive } from '@/features/battle/engine/selectors.ts'
import {
  getFighterModifierPool,
  hasBooleanModifierForStat,
  hasBooleanModifierValue,
  hasModifierStatus,
} from '@/features/battle/modifiers.ts'
import { hasModifierBoolean } from '@/features/battle/engine/effects/modifierContext.ts'
import {
  isAbilityClassStunned,
  isAbilityIntentStunned,
} from '@/features/battle/engine/stateFactory.ts'
import {
  abilityCanBeCountered,
  abilityCanBeReflected,
  isEffectBlocked,
  isHarmfulAbility,
} from '@/features/battle/engine/reactionPredicates.ts'
import { canPayEnergy, getEnergyPool } from '@/features/battle/energy.ts'
import { getResolvedAbilityEnergyCost } from '@/features/battle/engine/costModifier.ts'
import type {
  BattleAbilityTemplate,
  BattleFighterState,
  BattleReactionGuardState,
  BattleState,
  SkillEffect,
} from '@/features/battle/types.ts'

// ─────────────────────────────────────────────
// Section 1 — Actor Predicates
// ─────────────────────────────────────────────

/**
 * Law 1.1 — A fighter must be alive to take any action.
 * Wraps the canonical isAlive() from selectors.
 */
export function isActorAlive(fighter: BattleFighterState): boolean {
  return isAlive(fighter)
}

/**
 * Law 1.2 — A stunned fighter cannot take any action.
 *
 * Uses hasModifierBoolean (includes passive modifiers via getModifierPool)
 * to match the resolution-time check in resolveAction(). The queue-time
 * check uses hasModifierStatus (simpler, fighter-local modifiers only).
 * Both should agree in practice; this uses the resolution-path primitive
 * because it is more precise.
 *
 */
export function actorIsStunned(state: BattleState, fighter: BattleFighterState): boolean {
  return hasModifierBoolean(state, fighter, 'canAct', false, { statusKind: 'stun' })
}

/**
 * Law 1.2 (queue-path variant) — Stun check using the same primitive
 * as getQueueAbilityBlockReason() and getBattleCommandBlockReason().
 * Reads fighter-local modifiers only (no team/battlefield pool).
 * Use actorIsStunned() for the more complete resolution-path check.
 */
export function actorIsStunnedLocal(fighter: BattleFighterState): boolean {
  return hasModifierStatus(fighter.modifiers, 'stun')
}

/**
 * Law 1.3 — A class-stunned fighter cannot use abilities of the blocked class.
 */
export function actorHasClassStun(
  fighter: BattleFighterState,
  ability: BattleAbilityTemplate,
): boolean {
  return isAbilityClassStunned(fighter, ability)
}

/**
 * Law 1.4 — An intent-stunned fighter cannot use abilities of the blocked intent.
 * This IS already called by canUseAbility() (no gap here).
 */
export function actorHasIntentStun(
  fighter: BattleFighterState,
  ability: BattleAbilityTemplate,
): boolean {
  return isAbilityIntentStunned(fighter, ability)
}

/**
 * Law 1.5 — A locked ability cannot be used.
 *
 * An explicit predicate over fighter.abilityState. The engine currently
 * enforces locks implicitly (getAbilityById returns null for locked
 * abilities), so there is no independent isAbilityLocked predicate.
 * This exposes one so callers can test the condition without relying
 * on the null-return side-effect of getAbilityById.
 */
export function isAbilityLocked(fighter: BattleFighterState, abilityId: string): boolean {
  return fighter.abilityState.some(
    (delta) => delta.mode === 'lock' && delta.slotAbilityId === abilityId,
  )
}

// ─────────────────────────────────────────────
// Section 2 — Ability Predicates
// ─────────────────────────────────────────────

/**
 * Law 2.1 — An ability on cooldown cannot be used.
 */
export function abilityIsOnCooldown(fighter: BattleFighterState, abilityId: string): boolean {
  return getCooldown(fighter, abilityId) > 0
}

/**
 * Returns the effective ability for a fighter after applying abilityState
 * deltas (replace / grant / lock). Returns null if the ability does not
 * exist or is locked.
 * Wraps getAbilityById() from selectors, which already handles all delta modes.
 */
export function getEffectiveAbility(
  fighter: BattleFighterState,
  abilityId: string,
): BattleAbilityTemplate | null {
  return getAbilityById(fighter, abilityId)
}

/**
 * Law 2.2 — An ability cannot be used unless the team can pay its cost.
 * Checks against the raw current pool (not the projected-minus-queued pool).
 * Use getQueueAbilityBlockReason() for the full projected-pool queue check.
 */
export function canPayAbilityCost(
  state: BattleState,
  fighter: BattleFighterState,
  ability: BattleAbilityTemplate,
): boolean {
  const { cost } = getResolvedAbilityEnergyCost(fighter, ability)
  return canPayEnergy(getEnergyPool(state, fighter.team), cost)
}

/**
 * Law 2.5 — Abilities flagged as uncounterable bypass counter mechanics.
 * Thin wrapper; exposed for referee call-sites and tests.
 */
export { abilityCanBeCountered }

/**
 * Law 2.6 — Abilities flagged as unreflectable bypass reflect mechanics.
 * Thin wrapper; exposed for referee call-sites and tests.
 */
export { abilityCanBeReflected }

// ─────────────────────────────────────────────
// Section 3 — Target Predicates
// ─────────────────────────────────────────────

/**
 * Law 3.2 — Dead fighters cannot be targeted.
 * Mirrors isActorAlive() but named for the target role.
 */
export function targetIsAlive(target: BattleFighterState): boolean {
  return isAlive(target)
}

/**
 * Law 3.3 — An invulnerable fighter is removed from harmful target pools.
 * Checks the fighter-local modifier pool with the invincible statusKind filter,
 * matching the check in canAbilityTargetFighter().
 */
export function targetIsInvulnerable(target: BattleFighterState): boolean {
  return hasBooleanModifierValue(target.modifiers, 'isInvulnerable', true, {
    statusKind: 'invincible',
  })
}

/**
 * Law 3.3 exception — Some abilities explicitly bypass invulnerability.
 * Scans effects for ignoresInvulnerability flags; matches engine behaviour.
 */
export function abilityIgnoresInvulnerability(ability: BattleAbilityTemplate): boolean {
  return (ability.effects ?? []).some(
    (effect) =>
      (effect.type === 'damage'
        || effect.type === 'damageFiltered'
        || effect.type === 'damageScaledByCounter'
        || effect.type === 'damageEqualToActorShield')
      && effect.ignoresInvulnerability === true,
  )
}

/**
 * Law 3.4 — Some abilities require their target to carry specific modifier tags.
 */
export function targetHasRequiredTags(
  state: BattleState,
  target: BattleFighterState,
  ability: BattleAbilityTemplate,
): boolean {
  const requiredTags = ability.requiredTargetTags ?? []
  if (requiredTags.length === 0) return true
  return requiredTags.every((tag) =>
    getFighterModifierPool(state, target).some((modifier) => modifier.tags.includes(tag)),
  )
}

/**
 * Laws 3.3 + 3.4 + 3.6 — Full target legality check for a given ability.
 * Returns true when the target is a legal target (alive, invulnerability
 * resolved, required tags present). Does NOT check team-side (that is
 * handled upstream by getValidTargetIds / getTeam / getOpposingTeam).
 * Wraps the same logic as canAbilityTargetFighter() in engine.ts.
 */
export function canAbilityTarget(
  state: BattleState,
  ability: BattleAbilityTemplate,
  target: BattleFighterState,
): boolean {
  if (!isAlive(target)) return false
  if (
    targetIsInvulnerable(target)
    && isHarmfulAbility(ability)
    && !abilityIgnoresInvulnerability(ability)
  ) {
    return false
  }
  return targetHasRequiredTags(state, target, ability)
}

// ─────────────────────────────────────────────
// Section 4 — Effect Predicates
// ─────────────────────────────────────────────

/**
 * Law 4.1 — A fighter with effect immunity is protected from specified types.
 * actorId is the fighter applying the effect; self-applied effects bypass
 * the target's own immunity (see Law 4.1 self-bypass rule).
 *
 * UNENFORCED GAPS: burn ticks, fatigue, and counter-damage packets do not
 * route through this check. That is a Phase 4/5 fix.
 */
export function targetHasEffectImmunity(
  target: BattleFighterState,
  effect: SkillEffect,
  actorId?: string,
): boolean {
  return isEffectBlocked(target, effect, actorId)
}

/**
 * Law 4.1 — Full effect legality gate used in resolveEffects().
 * Returns true when the effect may be applied (i.e. is NOT blocked).
 * actorId enables the self-bypass rule.
 */
export function canApplyEffect(
  target: BattleFighterState,
  effect: SkillEffect,
  actorId?: string,
): boolean {
  return !isEffectBlocked(target, effect, actorId)
}

/**
 * Law 4.3 — A fighter may be unable to receive helpful effects.
 *
 * Enforced universally at resolveEffects() in engine.ts (Phase 4B).
 * Any effect whose intent is 'helpful' is blocked when this returns false.
 * No self-bypass: a fighter with canReceiveHelpfulEffects=false cannot
 * self-heal, self-shield, or self-buff.
 *
 * Intent classification: uses getEffectIntent() from reactionPredicates.ts,
 * which declares each SkillEffect type as helpful, harmful, or neutral.
 * Effects classified as 'neutral' are NOT blocked by this check. Effects
 * classified as 'mixed' (containing both helpful and harmful sub-effects via
 * schedule/conditional/reaction) are also NOT blocked here — each nested
 * effect is gated individually when it resolves.
 */
export function canReceiveHelpfulEffect(
  state: BattleState,
  target: BattleFighterState,
): boolean {
  return !hasModifierBoolean(state, target, 'canReceiveHelpfulEffects', false)
}

/**
 * Law 4.2 — Harmful effect prevention (nonDamage catch-all).
 * A fighter is blocked from receiving a harmful effect if they have the
 * nonDamage immunity or a matching specific immunity.
 * This is a convenience alias for canApplyEffect with a harmful effect.
 */
export function canReceiveHarmfulEffect(
  target: BattleFighterState,
  effect: SkillEffect,
  actorId?: string,
): boolean {
  return !isEffectBlocked(target, effect, actorId)
}

/**
 * Law 4.4 — A fighter with canGainInvulnerable:false cannot become invulnerable.
 *
 * Enforced universally at applyModifierToFighter() in engine.ts (Phase 3).
 * Any attempt to write isInvulnerable=true is blocked and logged when this
 * predicate returns false, regardless of the call path (invulnerable effect,
 * addModifier, passive, or reaction).
 */
export function canGainInvulnerability(state: BattleState, target: BattleFighterState): boolean {
  return !hasBooleanModifierForStat(
    getFighterModifierPool(state, target),
    'canGainInvulnerable',
    false,
  )
}

/**
 * Law 4.5 — A fighter with canReduceDamageTaken:false ignores DR modifiers.
 * This is already enforced centrally in calculateDamage(). Exposed here
 * so callers can query the condition without reading calculateDamage internals.
 */
export function canReduceDamage(state: BattleState, target: BattleFighterState): boolean {
  return !hasBooleanModifierForStat(
    getFighterModifierPool(state, target),
    'canReduceDamageTaken',
    false,
  )
}

// ─────────────────────────────────────────────
// Section 5 — Protection Predicates
// ─────────────────────────────────────────────

/**
 * Law 5.2 — A shield is present and has HP remaining.
 */
export function hasShield(target: BattleFighterState): boolean {
  return target.shield !== null && target.shield.amount > 0
}

/**
 * Law 5.2 exception — Affliction-class abilities bypass shields.
 * Checks whether the damage packet's ignoresShield flag is set,
 * which the engine sets automatically for Affliction-class abilities.
 */
export function shouldBypassShield(ignoresShield: boolean): boolean {
  return ignoresShield
}

/**
 * Law 5.5 — A fighter with Undying cannot be reduced to zero HP by damage.
 * Reads the full modifier pool (fighter + team + battlefield), matching
 * the check in applyDamagePacket().
 */
export function targetIsUndying(state: BattleState, target: BattleFighterState): boolean {
  return hasBooleanModifierForStat(getFighterModifierPool(state, target), 'isUndying', true)
}

/**
 * Law 5.3 + 5.4 — Whether damage reduction modifiers should be applied.
 * Returns false when canReduceDamageTaken is blocked (piercing handled
 * separately within calculateDamage).
 */
export function shouldApplyDamageReduction(
  state: BattleState,
  target: BattleFighterState,
): boolean {
  return canReduceDamage(state, target)
}

// ─────────────────────────────────────────────
// Section 6 — Reaction Predicates
// ─────────────────────────────────────────────

/**
 * Law 6.1 — Deterministic counter priority.
 *
 * Given a list of active counter guards on multiple targets, returns them
 * sorted by the constitutional priority order:
 *   1. Explicit `priority` field (higher wins — descending)
 *   2. Fighter slot (lower slot = left = first — ascending)
 *   3. Guard creation order (earlier = first — ascending, by guard.id
 *      which encodes a seq number at creation time)
 *
 * NOTE: The current engine does NOT use this function — it uses a simple
 * first-match scan over the targets array. This predicate encodes the
 * DESIRED law for Phase 2+ enforcement. No behaviour change yet.
 *
 * Each entry is { guard, fighter } so callers know which fighter owns the
 * winning counter.
 */
export function resolveCounterPriority(
  candidates: Array<{ guard: BattleReactionGuardState; fighter: BattleFighterState }>,
): Array<{ guard: BattleReactionGuardState; fighter: BattleFighterState }> {
  return [...candidates].sort((a, b) => {
    // 1. Explicit priority (higher = first)
    const aPriority = (a.guard as BattleReactionGuardState & { priority?: number }).priority ?? 0
    const bPriority = (b.guard as BattleReactionGuardState & { priority?: number }).priority ?? 0
    if (bPriority !== aPriority) return bPriority - aPriority

    // 2. Stable battlefield position (left-to-right, lower slot wins)
    if (a.fighter.slot !== b.fighter.slot) return a.fighter.slot - b.fighter.slot

    // 3. Guard creation order — guard.id encodes a seq number; lexicographic
    //    ordering is sufficient since ids share the same prefix format.
    return a.guard.id < b.guard.id ? -1 : a.guard.id > b.guard.id ? 1 : 0
  })
}

/**
 * Law 6.2 — Reflect priority.
 *
 * Reflects are not priority-ranked in the same way as counters (all
 * eligible targets reflect simultaneously; partial reflects per effect
 * are possible). This predicate confirms whether a guard qualifies as
 * an active reflect for a given ability.
 *
 * Returns true when the guard is an active reflect that matches the
 * incoming ability.
 */
export function isActiveReflectGuard(
  guard: BattleReactionGuardState,
  ability: BattleAbilityTemplate,
): boolean {
  if (guard.kind !== 'reflect') return false
  if (guard.remainingRounds <= 0) return false
  if (guard.abilityClasses && guard.abilityClasses.length > 0) {
    if (!ability.classes.some((cls) => guard.abilityClasses?.includes(cls))) return false
  }
  return abilityCanBeReflected(ability)
}
