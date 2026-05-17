# Battle Referee — Rule Enforcement Audit
> Discovery & Implementation Plan — No code changed in this document.

**Engine source:** `src/features/battle/engine.ts` and `src/features/battle/engine/**`  
**Date:** 2026-05-16  

---

## Table of Contents

1. [Actor Legality](#1-actor-legality)
2. [Ability Legality](#2-ability-legality)
3. [Target Legality](#3-target-legality)
4. [Effect Legality](#4-effect-legality)
5. [Protection Law](#5-protection-law)
6. [Reactive Law](#6-reactive-law)
7. [Expiration Law](#7-expiration-law)
8. [Proposed Battle Law Order](#8-proposed-battle-law-order)
9. [Phased Implementation Plan](#9-phased-implementation-plan)
10. [Testing Plan](#10-testing-plan)

---

## Reading Key

| Symbol | Meaning |
|---|---|
| ✅ | Enforced, centralized |
| ⚠️ | Enforced, but locally/inconsistently |
| ❌ | Not enforced at all |
| 🔁 | Duplicated across multiple sites |

---

## 1. Actor Legality

Actor legality governs whether a fighter is allowed to take any action at all.

### 1.1 Alive / Dead Check

**Where enforced:**
- `resolveAction()` (engine.ts:1696) — checks `isAlive(actor)` at the start; cancels and emits event if dead.
- `getQueueAbilityBlockReason()` (engine.ts:646) — checks `isAlive(fighter)` at the start.
- `getBattleCommandBlockReason()` (engine.ts:693) — checks `isAlive(actor)`.
- `canUseAbility()` (engine.ts:621) — checks `isAlive(fighter)`.
- `resolveInterleavedPlayerTurnTimeline()` (engine.ts:2237) — checks `isAlive(actor)` before resolving.
- `resolveTeamTurn()` (engine.ts:2067) — uses `aliveFighters` filter before passing commands.

**Assessment:** ✅ Centralized enough. `isAlive()` is in `selectors.ts` and used consistently. The queuing path and resolution path both check independently.

**Risk of changing:** Low. `isAlive` is a pure function on `fighter.hp > 0`. No inconsistencies found.

**Recommended referee function:** Existing `isAlive(fighter)` in `selectors.ts` is the right primitive. No change needed here.

---

### 1.2 Stunned / Cannot Act Check

**Where enforced:**
- `resolveAction()` (engine.ts:1721) — calls `hasModifierBoolean(state, actor, 'canAct', false, { statusKind: 'stun' })`. Fires event, removes stun modifier, returns.
- `getQueueAbilityBlockReason()` (engine.ts:648) — calls `hasModifierStatus(fighter.modifiers, 'stun')`.
- `getBattleCommandBlockReason()` (engine.ts:701) — same call as above.
- `canUseAbility()` — **does NOT check stun**. It calls `isAbilityIntentStunned` and `actorConditionsMet` and `canPayEnergy`, but NOT the base stun modifier.

**Inconsistency found:** `canUseAbility()` skips the base stun check. A fighter that is stun-modifiered will pass `canUseAbility()` but fail in `resolveAction()`. This means `canUseAbility()` gives a false positive for stunned fighters — the UI may not correctly show a stunned fighter as blocked.

**Assessment:** 🔁 Two separate stun checks exist (`hasModifierStatus` vs `hasModifierBoolean`) that are subtly different. The queuing path uses `hasModifierStatus` (simpler) and the resolution path uses `hasModifierBoolean` with a `statusKind` filter (more precise). Both should agree.

**Risk of changing:** Medium. The queuing check and resolution check use different primitives. Unifying them requires verifying both primitives always agree given current modifier definitions.

**Recommended referee function:** `actorIsStunned(fighter: BattleFighterState): boolean` — a single function that reads the `canAct` modifier and stun status. Should replace all three call sites.

---

### 1.3 Class Stun Check

**Where enforced:**
- `resolveAction()` (engine.ts:1737) — calls `isAbilityClassStunned(actor, ability)`.
- `getQueueAbilityBlockReason()` (engine.ts:650) — calls same.
- `getBattleCommandBlockReason()` (engine.ts:703) — calls same.
- `canUseAbility()` — **does NOT check class stun**. Same gap as with base stun.

**Assessment:** ⚠️ Enforced in two of three check paths, missing from `canUseAbility()`.

`isAbilityClassStunned()` lives in `stateFactory.ts` and is correctly implemented. The issue is that `canUseAbility()` is inconsistent with `getBattleCommandBlockReason()`.

**Risk of changing:** Low. `isAbilityClassStunned` is pure and correct. Just needs to be called in `canUseAbility()`.

**Recommended referee function:** Add `isAbilityClassStunned` call to `canUseAbility()`. Or extract `canActorUseAbility(state, fighter, ability)` that runs all stun checks together.

---

### 1.4 Intent Stun Check

**Where enforced:**
- `resolveAction()` (engine.ts:1752) — calls `isAbilityIntentStunned(actor, ability)`.
- `getQueueAbilityBlockReason()` (engine.ts:649) — calls same.
- `getBattleCommandBlockReason()` (engine.ts:702) — calls same.
- `canUseAbility()` (engine.ts:623) — calls same. ✅ This one is consistent.

**Assessment:** ✅ Intent stun is checked everywhere including `canUseAbility()`. This is the one stun variant that is fully consistent.

---

### 1.5 Skill-Specific Locks (Ability State `lock` mode)

**Where enforced:**
- `getAbilityById()` in `selectors.ts` — already returns the **effective ability** after applying `abilityState` deltas. The `lock` delta mode prevents the effective ability from being returned (the ability is excluded from the fighter's usable set).
- `getBattleCommandBlockReason()` — indirectly: if the ability cannot be found via `getAbilityById`, returns `'Technique unavailable'`.

**Assessment:** ⚠️ Skill lock enforcement is implicit — it depends on `getAbilityById` returning null for locked abilities. This means lock enforcement is only as correct as `getAbilityById`'s implementation. If a lock delta is applied but `getAbilityById` still returns the ability (e.g., due to a bug in `tickAbilityState`), the lock silently fails.

There is no explicit "this ability is locked" check anywhere in the action resolution path — it relies entirely on `getAbilityById` returning null.

**Inconsistency found:** The `lock` mode in `BattleAbilityStateDelta` is defined in types but its actual enforcement is entirely implicit through ability lookup. There is no `isAbilityLocked(fighter, abilityId)` predicate that could be independently tested.

**Risk of changing:** Medium. Changing `getAbilityById` semantics could break many callers.

**Recommended referee function:** `isAbilityLocked(fighter: BattleFighterState, abilityId: string): boolean` — reads `fighter.abilityState` for `mode === 'lock'` entries. Independent of `getAbilityById`.

---

### 1.6 Mode / Condition Requirements (`requiredActorConditions`)

**Where enforced:**
- `actorConditionsMet()` (engine.ts:612) — evaluates all conditions via `matchesReactionCondition`.
- Called from `canUseAbility()` (engine.ts:624). ✅
- Called from `getQueueAbilityBlockReason()` (engine.ts:655). ✅
- Called from `getBattleCommandBlockReason()` (engine.ts:708). ✅
- Called from `resolveAction()` indirectly via `canUseAbility()` (engine.ts:1767). ✅

**Assessment:** ✅ Fully consistent. `actorConditionsMet` is centralized and called at every check site. This is the best-enforced rule in the engine.

---

### Section 1 Summary

| Rule | Status | Gap |
|---|---|---|
| Alive check | ✅ | None |
| Base stun check | ⚠️ | Missing from `canUseAbility()` |
| Class stun check | ⚠️ | Missing from `canUseAbility()` |
| Intent stun check | ✅ | None |
| Ability lock | ⚠️ | Implicit only; no explicit predicate |
| Required conditions | ✅ | None |

---

## 2. Ability Legality

Ability legality governs whether a specific ability is legal to execute, independent of actor state.

### 2.1 Cooldown Check

**Where enforced:**
- `getQueueAbilityBlockReason()` (engine.ts:652) — `getCooldown(fighter, abilityId) > 0`.
- `getBattleCommandBlockReason()` (engine.ts:705) — same.
- `canUseAbility()` (engine.ts:626) — same.
- `resolveAction()` — indirectly via `canUseAbility()` at line 1767.

**Assessment:** ✅ Consistent. `getCooldown` is in `selectors.ts`. All check sites use it the same way.

**Note:** Cooldown is checked at queue time but NOT re-checked at resolution time against intermediate state. If Fighter A's action reduces Fighter B's cooldown during the same turn, Fighter B's new cooldown availability is correctly reflected because cooldown ticking happens at `tickTeamTurn`, not mid-resolution.

---

### 2.2 Energy Affordability

**Where enforced:**
- `getQueueAbilityBlockReason()` (engine.ts:670) — checks projected pool (after subtracting already-queued costs).
- `getBattleCommandBlockReason()` (engine.ts:718–728) — checks direct pool, then projected pool.
- `canUseAbility()` (engine.ts:625) — checks the raw pool (not projected). This is intentionally simplified for UI use.
- `resolveAction()` (engine.ts:1772–1817) — pays cost using the current pool at resolution time. Uses a graceful fallback: if the exact `requestedCost` can't be paid (e.g., random allocation mismatch), falls back to `cost` and attempts anyway.

**Assessment:** ⚠️ The graceful fallback in `resolveAction()` at line 1776 is a soft-law violation: `canPayEnergy(currentPool, requestedCost) ? requestedCost : cost`. If the pool is insufficient for the requested cost, it silently tries the raw cost instead of blocking the action. This can allow an ability to fire even when the team technically cannot afford it with the exact allocation chosen.

**Risk of changing:** Medium. The fallback was probably added to handle edge cases where random allocation desync occurs. Removing it would require tightening the allocation system.

**Recommended referee function:** `assertCanPayCost(pool, cost): boolean` — raise an explicit block reason if the pool is insufficient, rather than silently falling back.

---

### 2.3 Ability Replacement

**Where enforced:**
- `getAbilityById()` in `selectors.ts` — applies `abilityState` deltas (replace/grant/lock) to return the effective ability.
- All check paths use `getAbilityById`, so replacement is universally applied.

**Assessment:** ✅ Centralized in `selectors.ts`. No local override exists.

---

### 2.4 Temporary Granted Abilities

**Where enforced:**
- `getAbilityById()` includes granted abilities in the effective set.
- All check paths pick up granted abilities through the same `getAbilityById` call.

**Assessment:** ✅ Covered by the same mechanism as replacement.

---

### 2.5 `cannotBeCountered` / `cannotBeReflected`

**Where enforced:**
- `abilityCanBeCountered()` in `reactionPredicates.ts` (line 144) — checks `ability.cannotBeCountered` AND individual damage effect flags.
- `abilityCanBeReflected()` in `reactionPredicates.ts` (line 154) — checks per-effect `canEffectBeReflected()`.
- `canEffectBeReflected()` (line 133) — checks `ability.cannotBeReflected` and per-effect `cannotBeReflected`.
- `runPreDamageReactionWindow()` (engine.ts:344) — uses `abilityCanBeCountered` and `abilityCanBeReflected`.
- In `resolveEffects()`, damage packets are built with `cannotBeCountered` and `cannotBeReflected` from both the ability and the effect (line 1281–1282).

**Assessment:** ✅ Well enforced. Granularity is correct: ability-level and per-effect flags both respected.

**Subtle gap:** Counter damage packets (created in `runPreDamageReactionWindow`, line 354–364) hardcode `cannotBeCountered: true` and `cannotBeReflected: true` — correct. But when those counter packets call `applyDamagePacket`, they do NOT go through the pre-damage reaction window again. This is correct behavior (counter damage cannot trigger another counter) but is implicit rather than explicitly enforced by the packet flags. The flags ARE set, so it works, but the prevention relies on the counter-packet pathway bypassing `runPreDamageReactionWindow` rather than on the flags themselves.

---

### Section 2 Summary

| Rule | Status | Gap |
|---|---|---|
| Cooldown check | ✅ | None |
| Energy affordability | ⚠️ | Graceful fallback at resolution silently ignores cost failure |
| Ability replacement | ✅ | None |
| Granted abilities | ✅ | None |
| `cannotBeCountered` | ✅ | None |
| `cannotBeReflected` | ✅ | None |

---

## 3. Target Legality

Target legality governs which fighters can be chosen as a target for a given ability.

### 3.1 Valid Target Team (Enemy vs. Ally)

**Where enforced:**
- `getValidTargetIds()` (engine.ts:733) — uses `getTeam` or `getOpposingTeam` based on `ability.targetRule`. ✅
- `resolveAction()` (engine.ts:1831–1853) — enforces correct-side check for `requiresValidatedSingleTarget` abilities.
- `resolveEffects()` computes `allies` and `enemies` from `actor.team` at resolution time.

**Assessment:** ✅ Correct-side enforcement is sound.

---

### 3.2 Alive Target

**Where enforced:**
- `getValidTargetIds()` filters by `isAlive` before returning IDs.
- `resolveAction()` (line 1834, 1837) — for single-target, dead target = no fallback = no-op.
- `resolveEffectTargets()` — the `attacker` and `linked-target` modes check `isAlive` before returning.
- `resolveEffects()` — iterates `allies` and `enemies`, both filtered by `isAlive` at resolution start.
- `resolveScheduledEffects()` — does NOT re-check alive status of targets before resolving effects on them.

**Inconsistency found:** Scheduled effects store target IDs at creation time. When they fire, the target may have died. `resolveScheduledEffects()` (engine.ts:1930) does filter out null targets via `.filter(Boolean)`, but it does NOT check `isAlive(target)`. A scheduled effect can resolve on a dead fighter.

**Assessment:** ⚠️ Dead targets can receive scheduled effects. This may be intentional for some effects (e.g., heal that does nothing on a dead fighter because `applyHealPacket` checks `isAlive`), but for effects like `adjustCounter` or `setMode`, they would silently apply to a dead fighter without any guard.

**Risk of changing:** Low-medium. Adding `isAlive` filter to `resolveScheduledEffects` is surgical. But there may be intentional "fire on dead" effects — needs case-by-case review.

---

### 3.3 Self / Ally / Enemy Target Rules

**Where enforced:**
- `getValidTargetIds()` — routes to correct pool per `targetRule`.
- `resolveEffects()` — `allies` and `enemies` are derived from `actor.team` at execution time, so even effect-level `all-allies` / `all-enemies` targets are always on the correct side.

**Assessment:** ✅ Correct.

---

### 3.4 Invulnerability as Targeting Prevention

**Where enforced:**
- `canAbilityTargetFighter()` (engine.ts:307–324) — checks `hasBooleanModifierValue` for `isInvulnerable`. If target is invulnerable and ability is harmful and ability doesn't ignore invulnerability → returns false.
- `getValidTargetIds()` calls `canAbilityTargetFighter()` per fighter.

**Critical exception:** `resolveAction()` (engine.ts:1839–1847) has a deliberate override — if a target is alive but not in `getValidTargetIds` (e.g., became invulnerable between queuing and resolution), the action is still allowed if the target is on the correct side. The comment says: *"Allow it so that damage-blocking mechanics (e.g. Brink Control) still trigger on the correct unit."*

This means invulnerability prevents targeting at queue time but does NOT prevent the action from firing at resolution time if the target was pre-selected. The effect is blocked later in `applyDamagePacket` by the invulnerability check there.

**Assessment:** ⚠️ This is intentional design but creates a layered check: targeting prevention at queue time, damage blocking at application time. The invulnerability-as-untargetable semantic (from Phase 1 analysis as a Naruto-Arena gap) is therefore partially present — the ability still fires, it just does nothing. The gap is at the queuing UX level only.

**Recommended:** Document this explicitly as the "fire-but-block" contract. Consider whether to tighten targeting immunity to also block at resolution, or keep the current layered behavior (which supports Brink Control semantics).

---

### 3.5 `ignoresInvulnerability` Behavior

**Where enforced:**
- `abilityIgnoresInvulnerability()` (engine.ts:292) — scans ability effects for any damage effect with `ignoresInvulnerability: true`.
- Used in `canAbilityTargetFighter()` — if present, invulnerable target is still targetable.
- `applyDamagePacket()` (damagePacket.ts:73) — checks the packet flag directly.

**Assessment:** ✅ Correct. Both targeting and application are consistent.

---

### 3.6 Required Target Tags

**Where enforced:**
- `targetHasRequiredTags()` (engine.ts:282) — checks modifier tags on target.
- Called from `canAbilityTargetFighter()` only.

**Assessment:** ⚠️ Required tags are enforced at target selection time, but not re-checked at resolution time. If the tag modifier expires between queuing and resolution (possible if the ability is queued at the start of the turn and the tag expires mid-turn), the ability fires on a target that no longer qualifies.

**Risk of changing:** Low-medium. Adding a re-check at `resolveAction` is straightforward, but it could cause confusing mid-turn "no valid target" cancellations.

---

### 3.7 Helpful vs. Harmful Targeting

**Where enforced:**
- `canAbilityTargetFighter()` — only applies the invulnerability targeting block to `isHarmfulAbility`. Helpful abilities can always target invulnerable fighters.
- `runPreDamageReactionWindow()` — only fires for `isHarmfulAbility`.
- `runEffectReactionGuards` with `harmfulOnly` / `helpfulOnly` filters.

**Assessment:** ✅ Intent classification is consistent via `isHarmfulAbility` and `isHelpfulAbility` from `reactionPredicates.ts`. Both check `getAbilityIntent()` which computes intent from kind, explicit `intent` field, or effect inference.

**Gap:** Effect immunity (`isEffectBlocked`) does NOT distinguish helpful vs. harmful. A target with immunity to `heal` will block enemy heals AND friendly heals — there is no "immune to helpful only" or "immune to harmful heals only" distinction. This is a missing law for the Naruto-Arena "helpful skill immunity" feature.

---

### Section 3 Summary

| Rule | Status | Gap |
|---|---|---|
| Correct team targeting | ✅ | None |
| Alive target check | ⚠️ | Scheduled effects don't re-check alive; tag expiry not re-checked at resolution |
| Target rules | ✅ | None |
| Invulnerability as targeting block | ⚠️ | Block is at queue time; ability still fires at resolution (fire-but-block contract) |
| `ignoresInvulnerability` | ✅ | None |
| Required target tags | ⚠️ | Not re-checked at resolution time |
| Helpful/harmful intent routing | ✅ | None |

---

## 4. Effect Legality

Effect legality governs whether a specific effect can legally apply to a target.

### 4.1 Effect Immunity

**Where enforced:**
- `isEffectBlocked()` in `reactionPredicates.ts` (line 19) — checks `target.effectImmunities` for matching effect type or `nonDamage` catch-all.
- Called in `resolveEffects()` (engine.ts:1232) — centralized check before each effect executes. ✅
- Self-applied effects bypass immunity: `if (actorId === target.instanceId) return false`. ✅

**Assessment:** ✅ The immunity check is centralized in the main `resolveEffects()` loop. Every effect that goes through this loop is checked.

**Gap 1:** Effects that are applied from outside `resolveEffects()` do NOT go through `isEffectBlocked`. These include:
- `applyRoundStartEffects()` — burn ticks bypass effect immunity entirely.
- `applyFatigue()` — fatigue damage bypasses effect immunity.
- Counter damage in `runPreDamageReactionWindow()` — counter packets bypass effect immunity.
- Reaction guard effects via `runEffectReactionGuards()` — calls `resolveEffects()` directly, so immunity IS checked. ✅

**Gap 2:** `breakShield` in `resolveEffects()` goes through the immunity check. But the equivalent shield-breaking that happens inside `applyDamagePacket()` (when damage exceeds shield amount, the shield is broken) does NOT go through an immunity check. A fighter immune to `breakShield` can still have their shield broken by damage carryover.

**Assessment:** ⚠️ Burn and fatigue bypass effect immunity. Damage-carryover shield break bypasses `breakShield` immunity.

---

### 4.2 Helpful Skill Immunity (Anti-buff Defense)

**Where enforced:**
- Not enforced anywhere. There is no `invulnerableToHelpfulSkills` equivalent in the current engine.
- Effect immunity can block individual helpful effect types (e.g., `heal`), but there is no single "this fighter cannot receive beneficial effects from any source" modifier.

**Assessment:** ❌ Completely missing. This is gap #4 from the Phase 1 analysis. A modifier with `stat: 'canReceiveHelpfulEffects', value: false` does not exist.

---

### 4.3 Harmful Effect Prevention

**Where enforced:**
- Covered by the `isEffectBlocked` check for `nonDamage` catch-all — this blocks all non-damage effects.
- Can block classes like `stun`, `mark`, `burn`, `cooldownAdjust`, etc. via `nonDamage`.

**Assessment:** ✅ The `nonDamage` immunity is a valid broad harmful-effect blocker.

**Gap:** Damage effects are excluded from `nonDamage` immunity. A fighter can be immune to `stun` and `mark` but not to the `damage` effect that caused them. This is by design, but it means you cannot create "immune to all harm" without separate immunity entries for each damage type.

---

### 4.4 Cannot Gain Invulnerability

**Where enforced:**
- `applyInvulnerableStatus()` in `statusEffects.ts` (line 131) — checks `hasBooleanModifierForStat(..., 'canGainInvulnerable', false)` before applying.
- This check lives inside the `invulnerable` effect handler specifically.

**Assessment:** ⚠️ Enforced locally, not universally. It only applies to the `invulnerable` effect type. If invulnerability were granted through an `addModifier` effect directly applying an `isInvulnerable: true` modifier, the `canGainInvulnerable` check would NOT fire.

An `addModifier` effect with `{ stat: 'isInvulnerable', value: true }` bypasses the `canGainInvulnerable` guard entirely.

**Risk of changing:** Medium. Tightening this requires checking `canGainInvulnerable` in `applyModifierToFighter` when the incoming stat is `isInvulnerable`. This would be a universal enforcement.

**Recommended referee function:** Add a modifier-level guard: when `stat === 'isInvulnerable' && value === true`, check `canGainInvulnerable` before applying. Move this into `applyModifierToFighter` rather than the effect handler.

---

### 4.5 Cannot Reduce Damage Taken

**Where enforced:**
- `calculateDamage()` in `modifierContext.ts` (line 221) — reads `canReduceDamageTaken` modifier and filters out damage reduction modifiers from the target's pool before summing.
- This is fully centralized in the damage formula. ✅

**Assessment:** ✅ Correctly enforced at the damage calculation level. Any damage packet that goes through `calculateDamage` respects this law.

**Gap:** Direct HP manipulation that bypasses damage calculation (e.g., `setHpFromCounter` in `resolveEffects` at line 1413–1427) does not respect `canReduceDamageTaken`. But `setHpFromCounter` is a heal-type effect, not a damage-reduction bypass, so this is semantically correct.

---

### 4.6 Cannot Receive Shields / Heals / Buffs If Blocked

**Where enforced:**
- `applyHealPacket()` in `healPacket.ts` — does NOT check effect immunity. A `heal` effect goes through `isEffectBlocked()` in `resolveEffects()` first. If it passes, `applyHealPacket` is called unconditionally. ✅ (because the check happens before the call)
- `applyShieldToFighter()` — same: no immunity check inside the function itself, but `resolveEffects()` calls `isEffectBlocked` before dispatching `shield`.

**Assessment:** ✅ The immunity check in `resolveEffects()` is the gate. Sub-functions do not need to re-check.

**Gap:** Some shield application paths bypass `resolveEffects()` entirely:
- `applyRotMarkerAndRewards()` (engine.ts:1067) — directly calls `applyShieldToFighter` on the allied ESO fighter. Does NOT go through immunity check. If ESO has `shield` immunity, this still applies.
- Counter damage (line 354) — directly calls `applyDamagePacket`, bypassing `isEffectBlocked`. Counter packets are damage only, so this is less dangerous.

---

### Section 4 Summary

| Rule | Status | Gap |
|---|---|---|
| Effect immunity (general) | ✅ / ⚠️ | Burn ticks, fatigue, rot-marker shield bypass immunity |
| Helpful skill immunity | ❌ | Not implemented at all |
| Harmful effect prevention | ✅ | None (nonDamage catch-all works) |
| Cannot gain invulnerability | ⚠️ | Only blocks `invulnerable` effect; `addModifier` with `isInvulnerable` bypasses it |
| Cannot reduce damage taken | ✅ | Centralized in `calculateDamage()` |
| Shield/heal/buff blocking | ✅ / ⚠️ | Correct in main path; `applyRotMarkerAndRewards` bypasses check |

---

## 5. Protection Law

Protection law governs how damage, shields, DR, and invulnerability interact.

### 5.1 Destructible Defense / Shields

**Where enforced:**
- `applyDamagePacket()` — absorbs damage into `target.shield.amount` before HP. ✅
- `breakShield` effect in `resolveEffects()` — destroys shield directly. ✅
- `shieldDamage` in `applyShieldDamageToFighter()` — drains shield amount. ✅
- `overhealToShield` — converts excess healing to shield. ✅

**The shield model:** Only ONE shield object exists per fighter (`target.shield: BattleShieldState | null`). Multiple shields stack into this single object — amounts are summed, tags are merged. This means shields cannot be independently tracked; you cannot have "shield A blocks physical damage" and "shield B blocks everything" simultaneously with different amounts.

**Assessment:** ⚠️ The single-shield model conflates all shield sources. Tag filtering on `shieldDamage` and `breakShield` works by checking the single shield's tags, but if two sources contribute shields with different tags, they get merged into one object with combined tags.

**Risk of changing:** High. Changing to multi-shield tracking would be a structural refactor.

---

### 5.2 Shield Damage

**Where enforced:**
- `applyShieldDamageToFighter()` — checks `effect.tag` before applying. Only drains if tag matches.
- `applyDamagePacket()` — absorbs general damage into shield regardless of tag (no tag filtering on the shield side of `applyDamagePacket`).

**Inconsistency:** `shieldDamage` respects tag filtering. But regular damage absorption in `applyDamagePacket` does NOT filter by shield tag — all damage hits all shields indiscriminately.

**Assessment:** ⚠️ Regular damage and `shieldDamage` effects have asymmetric tag behavior. Regular damage always drains the shield; `shieldDamage` respects tags.

---

### 5.3 Shield Breaking

**Where enforced:**
- Happens automatically in both `applyDamagePacket()` (carryover) and `applyShieldDamageToFighter()` when `shield.amount <= 0`.
- `breakShield` effect in `resolveEffects()` — destroys shield directly.
- All three paths fire `onShieldBroken` passives and `runEffectReactionGuards`. ✅

**Assessment:** ✅ All shield-break paths correctly trigger follow-on reactions.

---

### 5.4 Damage Reduction

**Where enforced:**
- `calculateDamage()` in `modifierContext.ts` — applies `damageTaken` flat + percentAdd + multiplier modifiers.
- Pierceable reductions are tagged (lack `'unpierceable'` tag); piercing attacks filter them out.
- Class-specific DR uses `sumNumericModifierValuesForClass` with the damage class.

**Assessment:** ✅ Centralized in `calculateDamage()`. Every damage packet uses this formula.

---

### 5.5 Unpierceable Damage Reduction

**Where enforced:**
- In `calculateDamage()` — the `piercingAdjustedTargetPool` filter only retains modifiers with `tags.includes('unpierceable')` when dealing piercing damage.
- Unpierceable modifiers must carry the `'unpierceable'` tag at creation time.

**Assessment:** ⚠️ The `unpierceable` behavior is entirely tag-based. If a kit adds a DR modifier without the `'unpierceable'` tag, it is pierceable even if the designer intended otherwise. There is no modifier field `pierceable: false` — it is purely a tag convention.

**Risk of changing:** Medium. Adding an explicit field would be cleaner but requires migrating existing modifier definitions.

---

### 5.6 Piercing Damage

**Where enforced:**
- The `damage` effect has `piercing?: boolean` field.
- In `resolveEffects()`, `isPiercing` is set from `effect.piercing ?? false` (line 1263).
- Passed to `calculateDamage()` and into the packet's `flags.isPiercing`.

**Assessment:** ✅ Explicit and correctly threaded.

**Note:** The `isPiercing` flag in the packet is currently unused — `applyDamagePacket` does not read it. The piercing logic all lives in `calculateDamage`, which runs before the packet is created. So the flag is informational only, not a law enforcement mechanism.

---

### 5.7 Affliction Bypass Behavior

**Where enforced:**
- In `resolveEffects()`, `isAfflictionClass` is detected from `abilityClasses.includes('Affliction')` (line 1183).
- When true, `ignoresShield: isAfflictionClass` is added to every damage packet built in that resolution (lines 1279, 1305, 1345, 1378).
- This means Affliction-class abilities bypass shields automatically, without requiring the ability/effect author to set `ignoresShield: true`.

**Assessment:** ✅ Centralized and automatic for Affliction class. Works for `damage`, `damageFiltered`, `damageEqualToActorShield`, `damageScaledByCounter`.

**Gap:** `randomEnemyDamageTick` is resolved by `resolveRandomEnemyDamageTick()` separately. That function builds its own packets and does NOT receive `isAfflictionClass`. If a DOT is created by an Affliction-class ability, the ticks may not carry the Affliction bypass correctly.

---

### 5.8 Invulnerability

**Where enforced:**
- `applyDamagePacket()` — checks `hasModifierBoolean(..., 'isInvulnerable', true)`. Blocks damage if true and packet doesn't have `ignoresInvulnerability`. ✅
- `canAbilityTargetFighter()` — prevents targeting at queue time. ✅

**Gap:** Invulnerability is checked at damage application, but NOT for non-damage effects. A stun or mark can still land on an invulnerable fighter. The effect immunity system handles non-damage blocking, but invulnerability ≠ effect immunity — they are separate systems.

This means: invulnerable fighter can be stunned, marked, or have their shield broken, unless they also have effect immunity for those effects.

**Assessment:** ⚠️ Invulnerability is damage-only. Non-damage effects hit through invulnerability. This may be intentional design, but it is not documented or enforced as a law.

---

### 5.9 Undying / Minimum HP Behavior

**Where enforced:**
- `applyDamagePacket()` (line 177) — `hasBooleanModifierForStat(..., 'isUndying', true)` → if next HP ≤ 0, set to 1.
- This check is localized to `applyDamagePacket`.

**Assessment:** ✅ Correct for damage. But `setHpFromCounter` in `resolveEffects()` (line 1413–1415) can set HP to a value directly: `t.hp = Math.max(t.hp, amount)`. This uses `Math.max`, so it can only increase HP — it cannot reduce it below 1 via undying. But a future effect that directly sets HP to 0 (e.g., an execute effect) would bypass undying.

**Recommended:** Add an `assertMinimumHp(fighter)` utility called whenever HP is mutated directly, which applies the undying constraint.

---

### Section 5 Summary

| Rule | Status | Gap |
|---|---|---|
| Shield absorption | ✅ | Single-shield model conflates sources |
| Shield damage (tag-filtered) | ⚠️ | Asymmetric: regular damage ignores tags; shieldDamage respects them |
| Shield breaking | ✅ | All paths trigger reactions |
| Damage reduction | ✅ | Centralized in calculateDamage |
| Unpierceable DR | ⚠️ | Tag convention only; no explicit field |
| Piercing | ✅ | Correct; packet flag is informational only |
| Affliction bypass | ✅ / ⚠️ | Correct for main path; DOT ticks may miss Affliction bypass |
| Invulnerability | ⚠️ | Damage-only; non-damage effects land through invulnerability |
| Undying | ⚠️ | Covered in applyDamagePacket; direct HP writes bypass it |

---

## 6. Reactive Law

Reactive law governs when and how counters, reflects, and reaction guards fire.

### 6.1 Counters

**Where enforced:**
- `runPreDamageReactionWindow()` (engine.ts:327) — fires BEFORE effects execute.
- Returns `{ cancelAction: true }` on first matching counter.
- Only one counter fires per ability (first match, then early return).
- Counter check uses `abilityCanBeCountered(ability)` which checks ability-level AND per-effect flags.

**Assessment:** ⚠️ The early-return means only ONE counter fires per attack. If multiple targets have counters, only the first one fires (counters are checked per-target in order). This is consistent but the ordering is positional (array order), which may not be the desired semantic.

**Gap:** Counter damage packets call `applyDamagePacket` directly without going through `resolveEffects()`. This means:
- Counter damage bypasses effect immunity on the attacker.
- Counter damage bypasses `isEffectBlocked` entirely.

A fighter immune to `damage` effects can still receive counter damage.

---

### 6.2 Reflects

**Where enforced:**
- `runPreDamageReactionWindow()` — sets `reflectedTargetIds` on the result object.
- `resolveEffects()` — for each effect, checks `reactionResult?.reflectedTargetIds.has(t.instanceId)` (line 1208).
- If reflected: `effectActor = t` (target becomes actor), `effectTarget = actor` (actor becomes target).

**Assessment:** ✅ Reflects correctly swap actor/target for effect application.

**Gap:** The swap is per-effect, not per-ability. An ability with 5 effects may have 4 reflected back and 1 not, if one effect is flagged `cannotBeReflected`. This is correct behavior but creates unintuitive scenarios where the attacker receives most of their own ability but not all.

**Gap 2:** Reflect and counter are checked per target, but in the current implementation, if target A counters (and cancels the action), target B's reflect is never checked. The early return from counter takes priority over all other targets' reactions.

---

### 6.3 Reaction Guards (Generic Effect Reactions)

**Where enforced:**
- `runEffectReactionGuards()` (engine.ts:436) — iterates guards, applies `harmfulOnly`, `helpfulOnly`, `newSkillOnly`, `guardMatchesAbility`, `oncePerRound` filters.
- Called from: `resolveAction()` (onAbilityUse, onBeingTargeted), `applyDamagePacket()` (onDamageApplied, onDamageBlocked), `applyShieldDamageToFighter()` (onShieldBroken), `applyDefeat()` (onDefeat, onDefeatEnemy), `resolveEffects()` breakShield case (onShieldBroken).

**Assessment:** ✅ Well covered. The trigger points are comprehensive.

**Gap:** When `runEffectReactionGuards` fires its own `effects[]` via `resolveEffects()`, those inner effects go through the full `resolveEffects()` loop — including immunity checks. So reaction guard effects respect effect immunity. ✅

**Gap:** Reaction guard `effects[]` do NOT go through the pre-damage reaction window (`runPreDamageReactionWindow`). This means reaction guard damage cannot be countered or reflected. This is probably intentional but is not documented.

---

### 6.4 Passive Triggers

**Where enforced:**
- `firePassives()` (engine.ts:791) — retrieves triggered passives via `getTriggeredPassiveEffects()`, then calls `resolveEffects()` for each.
- Passive effects go through the full `resolveEffects()` loop (immunity checked). ✅
- Passives are NOT checked against `canUseAbility` — they always fire if triggered.

**Assessment:** ✅ Passives correctly go through effect resolution. The only gap is that passive-triggered `resolveEffects()` calls do not go through `runPreDamageReactionWindow`, so passive damage cannot be countered.

---

### 6.5 Order of Reactions

**Actual order in `resolveAction()`:**

```
1. onAbilityUse reaction guards (actor)
2. onAbilityUse passives (actor)
3. onBeingTargeted reaction guards (each target)
4. runPreDamageReactionWindow → counter (cancels) / reflect (mark for swap)
5. resolveEffects (if not canceled):
   - per-effect: isEffectBlocked?
   - per-effect: apply effect
   - onDamageApplied / onDamageBlocked / onShieldBroken reaction guards (inside applyDamagePacket / applyShieldDamageToFighter)
   - onDealDamage / onTakeDamage passives (inside applyDamagePacket)
6. onAbilityResolve passives (actor)
7. onBeingTargeted passives (each target)
```

**Assessment:** ⚠️ The reaction order has a structural oddity: `onBeingTargeted` reaction guards fire (step 3) BEFORE the pre-damage reaction window (step 4), meaning a reaction guard triggered by being targeted could affect the actor BEFORE the counter/reflect check. Then `onBeingTargeted` passives fire AFTER all effects resolve (step 7). The guards and passives for the same trigger are interleaved with main effect resolution.

This is unlikely to cause bugs with current content but is a footgun for future kit designers.

---

### 6.6 Consume-On-Trigger Behavior

**Where enforced:**
- Counters: `if (counter.consumeOnTrigger) consumeReactionGuard(target, counter.id)` (line 349). ✅
- Reflects: `if (reflect.consumeOnTrigger) consumeReactionGuard(target, reflect.id)` (line 401). ✅
- Effect reaction guards: `if (guard.consumeOnTrigger) consumeReactionGuard(observed, guard.id)` (line 474). ✅

**Assessment:** ✅ Consistent across all three reaction types.

---

### 6.7 Reactions Respecting Immunity, Invulnerability, Target Legality, Shields

**Counter damage → invulnerability:**
- Counter damage packets go to `applyDamagePacket()`, which DOES check invulnerability. ✅

**Counter damage → shields:**
- Counter damage goes through `applyDamagePacket()` which absorbs shields normally. ✅ Counter can be shielded.

**Counter damage → effect immunity:**
- Counter packets bypass `isEffectBlocked`. ❌ (documented in §6.1)

**Reflect → invulnerability of the original actor:**
- After reflect, `effectTarget = actor`. The actor's invulnerability is NOT checked for reflected effects. A reflected `damage` effect will still hit the actor even if they are invulnerable.

**Assessment:** ⚠️ Reflected damage is not invulnerability-checked on the reflected target (the original actor). The actor is never expected to be invulnerable when attacking, but self-applied invulnerability combined with a reflect would create an inconsistency.

---

### Section 6 Summary

| Rule | Status | Gap |
|---|---|---|
| Counter fires pre-effect | ✅ | First match only; multiple target counter order is positional |
| Counter damage bypasses immunity | ❌ | Counter packets skip `isEffectBlocked` |
| Reflect correctly swaps | ✅ | Works per-effect |
| Reflect vs. counter priority | ⚠️ | Counter cancels before reflect is checked on other targets |
| Reaction guard effects respect immunity | ✅ | Go through resolveEffects |
| Reaction guard damage bypasses counter/reflect | ⚠️ | Intentional but undocumented |
| Passive damage bypasses counter/reflect | ⚠️ | Same: intentional but undocumented |
| Consume-on-trigger | ✅ | Consistent |
| Reflected damage vs. actor invulnerability | ⚠️ | Not checked |

---

## 7. Expiration Law

Expiration law governs how durations tick down and what happens when states expire.

### 7.1 Duration Ticking — Modifiers

**Where enforced:**
- `tickTeamTurn()` (engine.ts:1642) — calls `tickModifiers(fighter.modifiers, state.round)`.
- `tickRoundEnd()` (engine.ts:1674) — ticks team and battlefield modifier buckets.
- `tickModifiers()` in `modifiers.ts` — decrements `duration.rounds` counters, returns expired list.

**Assessment:** ✅ Modifier ticking is centralized in `tickModifiers()`.

**Gap:** `tickTeamTurn` ticks fighter modifiers only for the current team. The opposing team's modifiers are ticked when their team turn runs. This means modifiers don't all tick at the same moment — player modifiers tick during `resolveTeamTurn('player')`, enemy modifiers tick during `resolveTeamTurn('enemy')`. In the sequential turn model, Player A's modifiers expire before Player B's, even if both were applied in the same round.

This creates asymmetric expiration timing — a 1-round modifier applied by Player A in round 1 expires when A's turn ticks at the end of the first team resolve; Player B's same-duration modifier doesn't expire until B's turn ticks.

**Assessment:** ⚠️ Asymmetric tick timing is an inherent property of the sequential model. It is consistent with the model but creates first-vs-second mover asymmetry in modifier duration.

---

### 7.2 Duration Ticking — Class Stuns, Intent Stuns, Reaction Guards, Ability State, Cost Modifiers, Effect Immunities

**Where enforced:**
- All in `tickTeamTurn()` → `tickAbilityState(fighter)`, `tickCostModifiers(fighter)`, `tickEffectImmunities(fighter)`, `tickClassStuns(fighter, state.round)`, `tickIntentStuns(fighter, state.round)`, `tickReactionGuards(fighter, state.round)`.
- All in `tick.ts`.

**Assessment:** ✅ All secondary state arrays are ticked consistently within `tickTeamTurn`.

---

### 7.3 State Modes (Form/Transform Durations)

**Where enforced:**
- `tickStateModes()` (engine.ts:1973) — called from `tickTeamTurn()`.
- Respects `appliedInRound` to skip the first tick. ✅
- Fires a `fighter_flag_changed` runtime event and a log event on expiry. ✅

**Assessment:** ✅ Correct.

---

### 7.4 Ability Replacement / Grant / Lock Expiration

**Where enforced:**
- `tickAbilityState(fighter)` in `tick.ts` — decrements duration on deltas, removes expired ones.

**Assessment:** ✅ Correct.

**Gap:** When a `replace` delta expires, the original ability is restored. But if the replacement ability had a cooldown set on it (because it was used while the replacement was active), that cooldown is stored under the replacement ability's ID. When the replacement expires and the original ability is restored, the original's cooldown is independent of the replacement's cooldown. The replacement ability's cooldown is abandoned (it is on a non-existent ability ID). This means a replacement ability can be used on the last turn before expiry with no cooldown consequence on the restored original.

**Assessment:** ⚠️ Cooldowns on temporary replacement abilities are lost when the replacement expires. This is an edge case but could be exploited for cooldown manipulation.

---

### 7.5 Scheduled Effects

**Where enforced:**
- `resolveScheduledEffects()` (engine.ts:1901) — filters effects by `dueRound <= state.round` and `phase`.
- Removes them from `state.scheduledEffects` before resolving to prevent double-fire.
- `resolveOneScheduledEffect()` (engine.ts:2170) — drains a single effect (used in interleaved timeline).

**Assessment:** ✅ No double-fire risk. Phase-correct.

---

### 7.6 On-Expire Effects

**Where enforced:**
- Not implemented. Modifier expiration in `tickModifiers()` returns a list of expired modifiers but does NOT fire `onExpireEffects`.
- The expired modifier list is used only to emit `modifier_removed` events.

**Assessment:** ❌ On-expire effects are not supported. This is gap #9 from the Phase 1 analysis.

**Risk of adding:** Medium. Would require `tickModifiers` to return effect arrays alongside expired modifiers, and `tickTeamTurn` to resolve those effects via `resolveEffects()`.

---

### Section 7 Summary

| Rule | Status | Gap |
|---|---|---|
| Modifier ticking | ✅ | Asymmetric timing between teams in sequential model |
| Class/intent stun, reaction guard, ability state, cost modifier, effect immunity ticking | ✅ | All in tickTeamTurn |
| State mode duration ticking | ✅ | Correct |
| Ability replacement expiry | ✅ / ⚠️ | Cooldowns on expired replacement abilities are abandoned |
| Scheduled effects | ✅ | No double-fire |
| On-expire effects | ❌ | Not implemented |

---

## 8. Proposed Battle Law Order

Based on the audit, this is the accurate description of what the engine CURRENTLY does, followed by the IDEAL order.

### Current Actual Order (in `resolveAction`)

```
1.  getFighterById / getAbilityById — resolve actor and effective ability
2.  isAlive(actor) — dead check
3.  actor.team === command.team — team ownership check
4.  hasModifierBoolean(canAct) — stun check
5.  isAbilityClassStunned — class stun check
6.  isAbilityIntentStunned — intent stun check
7.  canUseAbility() — combined cooldown + conditions + energy check (but MISSES stun/classStun)
8.  Energy payment + cooldown set
9.  Target resolution (including alive filter, invulnerability pass-through)
10. onAbilityUse reaction guards + passives
11. onBeingTargeted reaction guards (per target)
12. runPreDamageReactionWindow (counter/reflect)
13. resolveEffects → per-effect: isEffectBlocked, effect application, sub-reactions
14. onAbilityResolve passives
15. onBeingTargeted passives (after all effects)
16. history update
```

### Recommended Referee Law Order (corrected and explicit)

```
Law 1.  Resolve effective ability (getAbilityById with abilityState deltas)
Law 2.  Actor alive check
Law 3.  Actor team ownership check
Law 4.  Actor stun check (canAct = false modifier)
Law 5.  Actor class stun check (for this specific ability's classes)
Law 6.  Actor intent stun check (for this specific ability's intent)
Law 7.  Ability locked check (explicit isAbilityLocked predicate)
Law 8.  Cooldown check
Law 9.  Required actor conditions check
Law 10. Energy affordability check (no graceful fallback)
Law 11. Energy payment + cooldown set
Law 12. Target resolution:
        a. Resolve target set (all-allies, all-enemies, single, self)
        b. Filter: alive only
        c. Filter: canAbilityTargetFighter (invulnerability, requiredTargetTags)
        d. If single-target and no valid: log no-op, do not proceed
Law 13. onAbilityUse reaction guards + passives (actor)
Law 14. onBeingTargeted reaction guards (per target)
Law 15. runPreDamageReactionWindow (counter → cancel; reflect → mark targets)
Law 16. resolveEffects (if not canceled):
        a. per-effect: isEffectBlocked (immunity check)
        b. per-effect: apply effect
        c. within applyDamagePacket:
           i.  alive check
           ii. invulnerability check (block + onDamageBlocked reaction)
           iii. shield absorption
           iv. HP reduction (apply undying minimum)
           v.  onDamageApplied reaction guards + onDealDamage/onTakeDamage passives
           vi. defeat check
Law 17. onAbilityResolve passives
Law 18. onBeingTargeted passives
Law 19. history update
```

**Changes from current:**
- Step 7 (ability locked explicit check) is new — currently implicit.
- Step 10 (energy affordability) removes graceful fallback.
- Step 12d explicitly documents the no-valid-target no-op.
- Within Law 16c, the undying minimum is noted at HP reduction (currently correct but not explicit).
- The order of 13–14–15 is unchanged from current.

---

## 9. Phased Implementation Plan

### Phase 1 — Centralize Read-Only Referee Checks (No Behavioral Change)

**Goal:** Create a single `referee.ts` file with pure predicate functions that can be imported anywhere. No functional changes — just make existing logic explicit and deduplicated.

**Functions to create:**

```typescript
// src/features/battle/engine/referee.ts

actorIsAlive(fighter: BattleFighterState): boolean
  // → isAlive(fighter)  [already exists, expose via referee]

actorIsStunned(state: BattleState, fighter: BattleFighterState): boolean
  // → hasModifierBoolean(state, fighter, 'canAct', false, { statusKind: 'stun' })
  // Fix: add this check to canUseAbility()

actorIsClassStunned(fighter: BattleFighterState, ability: BattleAbilityTemplate): boolean
  // → isAbilityClassStunned(fighter, ability)  [exists in stateFactory.ts]
  // Fix: add this check to canUseAbility()

actorIsIntentStunned(fighter: BattleFighterState, ability: BattleAbilityTemplate): boolean
  // → isAbilityIntentStunned(fighter, ability)  [exists in stateFactory.ts]
  // Already in canUseAbility() ✅

actorConditionsAreMet(actor: BattleFighterState, ability: BattleAbilityTemplate, round: number): boolean
  // → actorConditionsMet(actor, ability, round)  [already exists]

isAbilityOnCooldown(fighter: BattleFighterState, abilityId: string): boolean
  // → getCooldown(fighter, abilityId) > 0

isAbilityLocked(fighter: BattleFighterState, abilityId: string): boolean
  // NEW: checks fighter.abilityState for mode === 'lock' with matching slotAbilityId

canAbilityTarget(state, ability, target): boolean
  // → canAbilityTargetFighter()  [already exists — just re-export from referee]
```

**Files changed:** New `src/features/battle/engine/referee.ts`. Minor additions to `canUseAbility()` to add the two missing stun checks. No behavioral change to existing tests.

**Tests added:** Unit tests for each referee predicate in isolation.

**Risks:** Low. Pure functions only.

---

### Phase 2 — Enforce Target Legality and Re-Check Tags at Resolution

**Goal:** Ensure target validity is re-verified at the moment of resolution, not just at queue time.

**Changes:**

1. `resolveAction()` — after resolving `singleTarget`, call `canAbilityTargetFighter()` again if the target was in `getValidTargetIds`. If it now fails (e.g., tag expired) → log no-op.

2. `resolveScheduledEffects()` — filter `targets` by `isAlive(target)` before passing to `resolveEffects()`.

3. `resolveOneScheduledEffect()` — same `isAlive` filter.

**Files changed:** `engine.ts` only.

**Tests added:**
- Tag expires between queue and resolution → action does nothing.
- Fighter dies before scheduled effect fires → scheduled effect skips dead target.

**Risks:** Low. Could surface previously hidden "ability fired on invalid target" edge cases but will not break correct behavior.

---

### Phase 3 — Enforce Cannot Gain Invulnerability Universally

**Goal:** Move the `canGainInvulnerable` check from the `invulnerable` effect handler to `applyModifierToFighter`, so it applies regardless of how invulnerability is granted.

**Changes:**

1. In `applyModifierToFighter()` — before calling `upsertModifier`, check: if `template.stat === 'isInvulnerable' && template.value === true`, verify `!hasBooleanModifierForStat(..., 'canGainInvulnerable', false)`. If blocked, emit event and return null.

2. Remove the now-redundant check from `applyInvulnerableStatus()` in `statusEffects.ts`.

**Files changed:** `engine.ts` (applyModifierToFighter), `engine/effects/statusEffects.ts`.

**Tests added:**
- Fighter with `canGainInvulnerable: false` receives `invulnerable` effect → blocked.
- Fighter with `canGainInvulnerable: false` receives `addModifier` with `isInvulnerable: true` → blocked.
- Fighter without restriction can become invulnerable normally.

**Risks:** Medium. Any `addModifier` effect that grants `isInvulnerable` would now be blocked by `canGainInvulnerable`. Audit all existing kits to confirm no current kit uses `addModifier { stat: 'isInvulnerable' }` on fighters that should be allowed to gain it.

---

### Phase 4 — Enforce Helpful Skill Immunity and Effect Immunity Consistently

**Goal:** Ensure effect immunity applies to burn ticks, fatigue, and the rot-marker shield path.

**Changes:**

1. `applyRoundStartEffects()` — wrap burn DOT packets in `isEffectBlocked(fighter, { type: 'damage' }, undefined)` check before applying. (Note: `actorId` is undefined for DOT ticks, so self-bypass does not apply.)

2. `applyFatigue()` — same immunity check for fatigue damage packets.

3. `applyRotMarkerAndRewards()` — check `isEffectBlocked(alliedEso, { type: 'shield' }, actor.instanceId)` before calling `applyShieldToFighter`.

4. **New helpful skill immunity modifier:** Add `canReceiveHelpfulEffects` as a `BattleModifierStat`. In `resolveEffects()`, before applying any effect with intent `helpful`, check this stat on the target. If `false`, emit "blocked helpful effect" event and skip.

**Files changed:** `engine.ts` (applyRoundStartEffects, applyFatigue, applyRotMarkerAndRewards, resolveEffects), `types.ts` (new stat).

**Tests added:**
- Fighter immune to `damage` does not take burn DOT.
- Fighter immune to `damage` does not take fatigue.
- Fighter with `canReceiveHelpfulEffects: false` does not receive heals.
- Fighter with `canReceiveHelpfulEffects: false` does not receive shields.
- Fighter applying helpful effect to self bypasses helpful immunity (same self-bypass rule as effect immunity).

**Risks:** Medium. Burn and fatigue immunity could feel weird if existing characters have damage immunity and suddenly stop taking fatigue. Review all existing `effectImmunity` blocks in the kit data before deploying.

---

### Phase 5 — Protection Law Cleanup: Shields, DR, Affliction, Undying

**Goal:** Fix specific gaps in the protection system.

**Changes:**

1. **Counter damage → effect immunity:** In `runPreDamageReactionWindow()`, check `isEffectBlocked(actor, { type: 'damage' }, target.instanceId)` before dealing counter damage. If blocked, skip counter damage (still cancel the action if counter matches).

2. **Reflected damage → actor invulnerability:** After swapping actor/target for reflected effects, in `resolveEffects()`, for reflected damage effects, check `hasModifierBoolean(state, effectTarget, 'isInvulnerable', ...)` before building the damage packet. If invulnerable and packet doesn't `ignoresInvulnerability`, skip.

3. **`randomEnemyDamageTick` Affliction bypass:** Pass `isAfflictionClass` into `resolveRandomEnemyDamageTick` so DOT ticks from Affliction abilities set `ignoresShield: true` on their packets.

4. **Undying on direct HP writes:** Add `function applyMinimumHp(fighter)` that reads the `isUndying` modifier and clamps HP to 1. Call it after any direct `target.hp = ...` assignment (currently only `setHpFromCounter` but document as a law).

**Files changed:** `engine.ts`, `engine/effects/randomEnemyDamageTick.ts`.

**Tests added:**
- Fighter immune to damage receives counter attack → counter damage is blocked, but action is still canceled.
- Fighter gains invulnerability between queuing and reflection → reflected damage blocked.
- Affliction DOT ticks ignore shields.
- Undying fighter cannot be reduced below 1 HP by any direct write.

**Risks:** Medium. Counter behavior change (block counter damage while still canceling action) may affect kit balance. Test against all existing kits with counter mechanics.

---

### Phase 6 — On-Expire Effects and Turn-Indexed Replacement (If Feasible)

**Goal:** Support Naruto-Arena-style on-expire effects and turn-indexed skill replacements.

**Changes:**

1. **On-expire effects for modifiers:** Add optional `onExpireEffects?: SkillEffect[]` to `BattleModifierTemplate`. In `tickTeamTurn()`, after `tickModifiers()` returns expired list, call `resolveEffects()` for each expired modifier's `onExpireEffects[]` with the modifier's `sourceActorId` as actor and `targetId` as target.

2. **Turn-indexed replacement (assessment):** The existing `replace` delta mode replaces a fixed ability for a fixed duration. Turn-indexed replacement would require the replacement itself to change at each turn. This is feasible by: adding an optional `replacementsByRemainingTurns: Record<number, BattleAbilityTemplate>` to the replace delta, and in `getAbilityById`, reading the replacement from this map based on remaining duration. **Feasibility: High. Risk: Low.** This adds a new capability without changing existing behavior.

**Files changed:** `types.ts`, `tick.ts`, `engine.ts`, `engine/effects/abilityStateEffects.ts`.

**Tests added:**
- Modifier with `onExpireEffects: [{ type: 'damage', power: 20 }]` fires damage when the modifier expires.
- `onExpireEffects` fires even if the target is dead (edge case: document behavior).
- Turn-indexed replacement shows different ability at 3 turns remaining vs. 2 turns remaining.

**Risks:** Low-medium for on-expire effects (new capability). Low for turn-indexed replacement (additive to existing system).

---

## 10. Testing Plan

### 10.1 Phase 1 Test Cases (Referee Predicates)

| Test | Expected |
|---|---|
| `actorIsStunned(fighter with canAct=false modifier)` | `true` |
| `actorIsStunned(fighter without stun)` | `false` |
| `actorIsClassStunned(fighter, ability with class 'Physical')` when class stun blocks Physical | `true` |
| `actorIsClassStunned(fighter, ability with class 'Strategic')` when class stun blocks Physical | `false` |
| `isAbilityLocked(fighter, 'some-ability-id')` when lock delta exists | `true` |
| `isAbilityLocked(fighter, 'other-id')` when lock delta exists for different ID | `false` |
| `canUseAbility` on stunned fighter | `false` (currently bug — fix in Phase 1) |
| `canUseAbility` on class-stunned fighter with matching class | `false` (currently bug — fix in Phase 1) |

### 10.2 Phase 2 Test Cases (Target Re-Validation)

| Test | Expected |
|---|---|
| Queue attack on tagged target; tag expires before resolution | Action logs "no valid target," no effect |
| Queue attack; target becomes invulnerable after queue | Action fires, damage blocked (fire-but-block contract) |
| Schedule effect targeting fighter who dies before resolution | Scheduled effect does not resolve on dead fighter |

### 10.3 Phase 3 Test Cases (Cannot Gain Invulnerability — Universal)

| Test | Expected |
|---|---|
| Fighter has `canGainInvulnerable: false`; receives `invulnerable` effect | Blocked, event logged |
| Fighter has `canGainInvulnerable: false`; receives `addModifier { stat: 'isInvulnerable', value: true }` | Blocked, event logged |
| Fighter has `canGainInvulnerable: false`; self-applies invulnerability via ability | Blocked (self-bypass does NOT apply to `canGainInvulnerable`) |
| Fighter without restriction; receives `invulnerable` effect | Applied successfully |

### 10.4 Phase 4 Test Cases (Effect Immunity — Burn, Fatigue, Helpful)

| Test | Expected |
|---|---|
| Fighter immune to `damage`; round-start burn tick fires | No damage, event logged as blocked |
| Fighter immune to `damage`; fatigue fires | No damage, event logged |
| Fighter with `canReceiveHelpfulEffects: false`; ally applies `heal` | Blocked |
| Fighter with `canReceiveHelpfulEffects: false`; ally applies `shield` | Blocked |
| Fighter with `canReceiveHelpfulEffects: false`; self-applies `shield` | Not blocked (self-bypass) |
| Fighter with `canReceiveHelpfulEffects: false`; enemy applies `attackUp` (helpful to enemy) | N/A — helpful immunity only applies to beneficial effects to the target, not debuffs |

### 10.5 Phase 5 Test Cases (Protection Law)

| Test | Expected |
|---|---|
| Fighter immune to `damage`; receives counter attack | Counter damage blocked, action still canceled |
| Fighter with invulnerability uses harmful attack; enemy has reflect | Reflected damage hits the attacker (no invulnerability on attacker initially) |
| Fighter becomes invulnerable after attack is reflected | Implementation decision: either block or allow (document the choice) |
| Ability with Affliction class creates DOT; DOT ticks | DOT ticks ignore shields |
| Fighter with `isUndying: true`; receives execute-type HP write | HP floored at 1 |

### 10.6 Phase 6 Test Cases (On-Expire Effects, Turn-Indexed Replacement)

| Test | Expected |
|---|---|
| Modifier with `onExpireEffects: [{ type: 'burn', ... }]` expires | Burn applied to target when modifier expires |
| Modifier on dead fighter expires | `onExpireEffects` fires (document whether this is correct) |
| Ability replaced with `replacementsByRemainingTurns: { 2: abilityA, 1: abilityB }` | At 2 turns remaining: shows abilityA; at 1 turn: shows abilityB |
| Turn-indexed replacement expires normally | Original ability restored |

### 10.7 Regression Test Coverage

Before any phase ships, run the full existing test suite. Key regression scenarios:

- All existing character kit scenarios (any test that uses specific characters).
- Stun behavior (particularly the `canUseAbility` fix).
- Counter and reflect scenarios.
- Invulnerability with `Brink Control`-style mechanics.
- Burn DOT timing.
- Energy payment and cooldown interaction.

---

*End of Audit.*  
*Proceed to implementation when ready, starting with Phase 1.*
