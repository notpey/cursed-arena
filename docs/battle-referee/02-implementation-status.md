# Battle Referee — Implementation Status

**Version:** 1.5  
**Date:** 2026-05-17  
**Source of truth for:** `src/features/battle/engine/referee.ts`, `referee.test.ts`  
**Constitutional reference:** `docs/battle-referee/00-combat-laws.md`  
**Original audit:** `docs/battle-referee/01-rule-enforcement-audit.md`

---

## 1. Completed Phases

### Phase 1 — Centralize Referee Predicates

**Goal:** Create `referee.ts` as a single source of truth for all combat-law predicate functions. No behavioral change.

**What was done:**
- Created `src/features/battle/engine/referee.ts` with pure predicate exports covering all six law sections: actor, ability, target, effect, protection, reaction.
- Key exports: `actorIsStunned`, `actorIsStunnedLocal`, `actorHasClassStun`, `actorHasIntentStun`, `isAbilityOnCooldown`, `isAbilityLocked`, `getEffectiveAbility`, `canPayAbilityCost`, `targetIsAlive`, `targetIsInvulnerable`, `abilityIgnoresInvulnerability`, `targetHasRequiredTags`, `canAbilityTarget`, `canApplyEffect`, `canReceiveHelpfulEffect`, `canReceiveHarmfulEffect`, `canGainInvulnerability`, `canReduceDamage`, `hasShield`, `shouldBypassShield`, `targetIsUndying`, `shouldApplyDamageReduction`, `resolveCounterPriority`, `isActiveReflectGuard`, and others.
- No behavioral changes to the engine. The predicates describe what the engine already did; Phase 1's value is testability and documentation.

**Files changed:** `src/features/battle/engine/referee.ts` (new), `src/features/battle/engine/referee.test.ts` (new)

**Tests added:** ~65 predicate unit tests across all six law sections (Phases 1 and pre-Phase-2 groundwork).

---

### Phase 2 — Actor/Target Legality Integration

**Goal:** Close the gap where `canUseAbility()` did not check base stun or class stun, causing a UI/engine disagreement. Enforce dead-target filtering in scheduled effects.

**What was done:**
- `canUseAbility()` in `engine.ts` now calls `actorIsStunned()` and `actorHasClassStun()` — the two missing stun checks.
- `resolveScheduledEffects()` and `resolveOneScheduledEffect()` now skip targets that are dead (`isAlive` check added before resolving effects on captured target IDs).
- Law violation closed: the UI and engine now agree on stun states.

**Files changed:** `src/features/battle/engine.ts`

**Tests added:** 9 integration tests — `canUseAbility` stun/class-stun/pass-bypass edge cases, target legality with invulnerable fighters, dead-target filtering for scheduled effects including fire-but-block verification.

---

### Phase 3 — Universal Cannot Gain Invulnerability

**Goal:** Move the `canGainInvulnerable` check from the `invulnerable` effect handler to `applyModifierToFighter`, so that any pathway to invulnerability — including raw `addModifier` effects — is universally blocked when the restriction is active.

**What was done:**
- `applyModifierToFighter()` now intercepts any modifier with `stat === 'isInvulnerable'` and `value === true`, verifies `canGainInvulnerable` is not blocked, and emits an event if it is.
- Removed the now-redundant local check in `applyInvulnerableStatus()` in `statusEffects.ts`.
- OCQ-3 resolved: no self-bypass for `canGainInvulnerable`. The restriction is applied by opponents and cannot be circumvented by self-targeting.

**Files changed:** `src/features/battle/engine.ts`, `src/features/battle/engine/effects/statusEffects.ts`

**Tests added:** 5 tests — `invulnerable` effect blocked, `addModifier` with `isInvulnerable` blocked, self-application blocked, normal grant permitted, restriction expiration restores access.

---

### Phase 4A — Effect Immunity Consistency

**Goal:** Enforce effect immunity for all effect sources that previously bypassed it: burn DOT ticks, fatigue ticks, counter damage packets, and the rot-marker shield reward.

**What was done:**
- `applyRoundStartEffects()` (burn ticks): now checks `effectImmunities` for `'damage'` before applying.
- `applyFatigue()`: same `'damage'` immunity check added.
- `runPreDamageReactionWindow()` counter damage packets: now checked against `'damage'` immunity on the attacker before dealing counter return damage. The counter still cancels the action even if its damage is blocked.
- `applyRotMarkerAndRewards()`: now checks `'shield'` immunity on the allied Eso fighter before applying the rot-marker shield reward.
- Self-applied packets (`sourceActorId === target.instanceId`) retain their existing self-bypass per Law 4.1.

**Files changed:** `src/features/battle/engine.ts`, `src/features/battle/engine/effects/damagePacket.ts`

**Tests added:** 7 tests — burn DOT blocked by damage immunity, burn DOT lands without immunity, fatigue blocked and not blocked, counter damage blocked by immunity (action still canceled), counter damage lands without immunity, counter still cancels with immunity on attacker.

---

### Phase 4B — Helpful Effect Immunity

**Goal:** Implement `canReceiveHelpfulEffects` as a live modifier stat and enforce it universally across all helpful effect types, with no self-bypass.

**What was done:**
- Added `'canReceiveHelpfulEffects'` to `BattleModifierStat` union in `types.ts`.
- `canReceiveHelpfulEffect()` in `referee.ts` is now wired to read the real modifier instead of always returning `true`.
- `resolveEffects()` in `engine.ts` checks this flag after the effect immunity gate and before dispatching any effect whose `getEffectIntent()` returns `'helpful'`.
- `getEffectIntent()` in `reactionPredicates.ts` changed from private to exported so it can be used in `engine.ts`.
- No self-bypass: the restriction applies regardless of who is casting. This is the correct ruling for an opponent-applied control mechanic (see Law 4.3).
- Intent classification for ambiguous effects documented: `adjustCounter`, `setFlag`, `setMode`, `removeModifier` → `'neutral'` (not blocked). `schedule`, `conditional`, `reaction` → `'mixed'` (nested effects checked individually). `cooldownAdjust` with positive amount → `'harmful'`; negative → `'helpful'`.

**Files changed:** `src/features/battle/types.ts`, `src/features/battle/engine/reactionPredicates.ts`, `src/features/battle/engine.ts`, `src/features/battle/engine/referee.ts`

**Tests added:** 13 tests — predicate unit tests, ally heal blocked, self-heal blocked (no self-bypass), ally shield blocked, self-shield blocked, invulnerable effect blocked, `addModifier` classified neutral (not blocked), damage still applies, stun still applies, restriction expiration, effect immunity self-bypass confirmed unchanged.

---

### Phase 5A — Protection Law Cleanup

**Goal:** Audit and fix four specific bypass paths: reflected damage vs. attacker protections, Affliction DOT class propagation, Undying scope, and shield tag consistency.

**What was done:**

**Fixed — Affliction DOT shield bypass:**
- `BattleScheduledEffect` in `types.ts` gained optional `abilityClasses` field.
- `createScheduledEffect()` and `createRandomEnemyDamageOverTime()` in `scheduledEffects.ts` now accept and store `abilityClasses`.
- `resolveScheduledEffects()` passes `scheduled.abilityClasses` to `resolveEffects()` so Affliction-class DOT ticks correctly set `ignoresShield: true` on their damage packets.
- `resolveRandomEnemyDamageTick()` fixed: `flags: {}` → `flags: { ignoresShield: isAfflictionClass }`.
- `cloneScheduledEffect()` in `reactions.ts` now deep-clones `abilityClasses`.

**Audit findings — no code change needed:**
- Reflected damage: already correct. Reflected packets reuse original effect flags (`ignoresInvulnerability`, `ignoresShield`, `isPiercing`), so attacker protections apply normally via `applyDamagePacket`. OCQ-4 resolved.
- `setHpFromCounter`: uses `Math.max(t.hp, amount)` — can only raise HP, never reduce it to zero. Not a Undying bypass.
- Shield tag behavior: intentional. `shieldDamage` and `breakShield` respect `effect.tag` vs. `shield.tags`. Regular damage absorption does not filter by tag — correct for the single-shield model. Documented as a Phase 5B candidate if multi-shield tag filtering is ever required.

**Files changed:** `src/features/battle/types.ts`, `src/features/battle/engine/effects/scheduledEffects.ts`, `src/features/battle/engine/effects/randomEnemyDamageTick.ts`, `src/features/battle/engine.ts`, `src/features/battle/reactions.ts`

**Tests added:** 10 tests — reflected damage blocked by attacker invulnerability, reflected damage hits non-invulnerable attacker, reflected damage absorbed by attacker shield, reflected damage blocked by attacker damage immunity, non-Affliction DOT does not bypass shield, Affliction DOT bypasses shield, `shieldDamage` tag filter, `shieldDamage` matching tag, regular damage ignores shield tags, `breakShield` tag filter.

---

### Phase 6A — Deterministic Reaction Priority

**Goal:** Make counter and reflect priority deterministic and law-aligned. The combat constitution (Law 6.1) specifies: explicit priority → stable battlefield position → creation timestamp.

**What was done:**
- `runPreDamageReactionWindow()` in `engine.ts` now sorts `targets` by `fighter.slot` before iterating. Lowest slot reacts first — stable battlefield position.
- Counter-before-reflect ordering is structural: the counter check has an early return that skips reflect for the same ability. Multiple targets can each independently reflect; a counter on any target cancels the entire action.
- Counter return damage packets carry `cannotBeCountered: true` and `cannotBeReflected: true` — reaction guard damage cannot chain another reaction window. This was already true; Phase 6A confirmed and documented it.
- `resolveCounterPriority()` in `referee.ts` was the design reference for the sort; the engine now matches it.
- `BattleReactionGuardState` has no explicit `priority` field. Phase 6A uses slot-based ordering only — the correct minimal fix given the current data model.

**Files changed:** `src/features/battle/engine.ts`, `src/features/battle/engine/referee.ts` (header update)

**Tests added:** 5 tests — multi-counter resolves by slot order, counter cancels before reflect fires, reflect fires when no counter eligible, `consumeOnTrigger` removes correct guard, counter return damage does not trigger another counter.

---

### Phase 7A — Expiration Timing Audit

**Goal:** Audit the current tick model before making any code changes. Research and recommendation only.

**What was done:**
- Read and traced all tick functions: `tickTeamTurn`, `tickRoundEnd`, `tickModifiers`, `tickAbilityState`, `tickClassStuns`, `tickIntentStuns`, `tickReactionGuards`, `tickEffectImmunities`, `tickStateModes`, `tickCostModifiers`.
- Identified the root cause: `endRound` (and `endRoundTimeline`) called `tickTeamTurn(secondTeam)` after `resolveTeamTurn(secondTeam)` had already called it — giving the second team two duration ticks per round.
- Traced 7 concrete timing examples (stun, burn, shield, invulnerability, replacement ability, scheduled effects).
- Documented that stun skip guard (`appliedInRound`) correctly protects stun behavior from the double-tick in all cases.
- Identified all affected systems: cooldowns, abilityState (replacements), effectImmunities, reactionGuards, stateModes, costModifiers, and burn/DOT timing.
- Compared four timing models (A–D) and recommended Model C: remove the one redundant `tickTeamTurn(secondTeam)` call from `endRound`.
- Created `docs/battle-referee/03-expiration-timing-audit.md`.

**Files changed:** `docs/battle-referee/03-expiration-timing-audit.md` (new)

**Tests added:** None (research phase only)

---

### Phase 7B — Expiration Double-Tick Fix

**Goal:** Remove the redundant second-team tick identified in Phase 7A. Surgical fix only.

**What was done:**
- Removed `tickTeamTurn(state, ctx, getSecondPlayer(state.firstPlayer))` from `endRound` in `engine.ts`.
- Removed the same line from `endRoundTimeline` in `engine.ts`.
- Added a comment at each removal site citing Law 7.1 as the reason.
- The deprecated `resolveRound` function was NOT changed — its tick structure was already correct (one tick per team, in the same function body with no double-call).
- All 737 pre-existing tests passed without modification. No test was asserting the double-tick behavior.
- Added 8 regression tests in `engine.test.ts` covering: cooldown symmetry (first and second team both decrement by 1), effectImmunity, reactionGuard, abilityState/replacement, skip-guard preservation (marker modifier, not stun), and scheduled-effect round-number correctness.

**Stun note:** Stun modifiers are consumed in `resolveAction` (not by `tickModifiers`) when the stunned fighter's action is rejected. This is the intended behavior. The skip guard on `tickModifiers` prevents duplicate duration decrements, validated via a non-action-consumed modifier type (mark/damageTaken stat).

**Files changed:** `src/features/battle/engine.ts` (2 lines removed, 2 comment blocks added), `src/features/battle/engine.test.ts` (1 new import, 8 new tests in Phase 7B describe block)

**Tests added:** 8 tests — cooldown first-team symmetry, cooldown second-team (not double-ticked), cooldown first=second comparison, effectImmunity second-team, reactionGuard second-team, abilityState second-team, skip-guard preservation via mark modifier, scheduled effect absolute round.

---

### Phase 8 — Invulnerability Scope for Non-Damage Effects

**Goal:** Align invulnerability with Law 5.3: invulnerability is a TARGETING LAW that blocks ALL harmful effects in fire-but-block scenarios, not just damage.

**What was done:**
- `resolveEffects()` in `engine.ts` now has a dedicated invulnerability gate inserted after `canReceiveHelpfulEffects` and before the effect `switch`.
- The gate blocks any effect where `getEffectIntent(effect) === 'harmful'` against an invulnerable target, with three bypass conditions:
  1. **Damage effect types excluded** (`damage`, `damageFiltered`, `damageScaledByCounter`, `damageEqualToActorShield`) — these are handled by `applyDamagePacket` which already emits the canonical "invulnerability blocked" log. Excluding them preserves the existing correct path.
  2. **Self-bypass**: when `effectActor.instanceId === effectTarget.instanceId`, the fighter's own invulnerability does not block their own ability effects. Required for self-targeted defensive abilities (Junpei/Mahito/Hanami/Gojo/Panda kits) that grant invulnerability then a reaction guard in the same ability — the `reaction` effect with `harmfulOnly: true` is classified `'harmful'` by `getEffectIntent`, so without self-bypass these kits would break themselves.
  3. **`abilityIgnoresInvulnerability` bypass**: if the originating ability has any damage effect with `ignoresInvulnerability: true`, all effects in that ability pass through.
- On block: emits both a text log event ("invulnerability blocked") and a `'effect_ignored'` runtime event with `meta: { effectType, blockedBy: 'invulnerability' }`.
- Fire-but-block contract preserved: energy spent, cooldown applied, log emitted. Only harmful effect resolution is suppressed.

**Files changed:** `src/features/battle/engine.ts`, `src/features/battle/engine/referee.ts` (header update), `docs/battle-referee/02-implementation-status.md`

**Tests added:** 11 tests — stun blocked when target invulnerable, damage still handled by applyDamagePacket path (block log confirmed), cooldown-increase effect blocked, breakShield blocked, burn (dotDamage modifier) blocked, mixed ability (enemy stun blocked + self-heal passes), helpful ally effect on invulnerable target passes, neutral setMode passes through, `ignoresInvulnerability` bypass allows non-damage effects, self-bypass (defensive ability grants own invulnerable then reaction guard), block emits 'effect_ignored' runtime event.

---

### Phase 9 — Declared Intent on Ambiguous Effect Types

**Goal:** Close the helpful-immunity loophole by allowing `addModifier`, `removeModifier`, and other context-dependent effect types to declare their intent explicitly, so `canReceiveHelpfulEffects` can correctly gate them.

**What was done:**
- Added `intent?: 'helpful' | 'harmful' | 'neutral'` to 10 ambiguous `SkillEffect` union members in `types.ts`: `addModifier`, `removeModifier`, `setFlag`, `setMode`, `clearMode`, `adjustCounter`, `setCounter`, `adjustSourceCounter`, `adjustCounterByTriggerAmount`, `resetCounter`.
- Updated `getEffectIntent()` in `reactionPredicates.ts` to read the declared `intent` field before the switch statement. When `intent` is declared, it is returned immediately. When omitted, existing behavior is preserved (all 10 types default to `'neutral'` via the `default` case).
- Migration — only one obviously correct case: added `intent: 'helpful'` to Yuji's passive `addModifier` (the `damageTaken -0.25` Sukuna Vessel self-buff) in `yuji.ts`. All other kit usages of ambiguous types are bookkeeping or context-dependent and remain `'neutral'`.
- No behavioral change for any existing kit (none declared `intent` before; all still return `'neutral'` by default).

**Files changed:** `src/features/battle/types.ts`, `src/features/battle/engine/reactionPredicates.ts`, `src/features/battle/content/fighters/yuji.ts`, `src/features/battle/engine/referee.ts` (header update)

**Tests added:** 6 tests — `addModifier` with `intent:'helpful'` blocked by helpful immunity, `addModifier` with `intent:'harmful'` not blocked by helpful immunity, `addModifier` with no declared intent is neutral (not blocked), `adjustCounter` with `intent:'helpful'` blocked, `setFlag` with `intent:'helpful'` blocked, `intent:'harmful' addModifier` blocked by invulnerability gate.

---

### Phase 10 - On-Expire Effects

**Goal:** Add declared modifier expiration hooks without changing duration timing or making expiration noisy by default.

**What was done:**
- Added `onExpireEffects?: SkillEffect[]` to `BattleModifierTemplate` and `BattleModifierInstance`.
- `createModifierInstance()`, `cloneModifiers()`, and `upsertModifier()` now preserve the field.
- Fighter-scoped natural expiration now resolves declared `onExpireEffects` through `resolveEffects()` after `tickModifiers()` removes the expired modifier.
- The hook uses stored `sourceActorId`, `sourceAbilityId`, and fighter `targetId` context. If the original source fighter is dead but still present in battle state, the effect still resolves from that source. If the target is dead, the hook does not fire.
- Manual removal/cleanse and replacement/overwrite do not fire on-expire hooks because they do not go through the natural-expiration list.
- Team and battlefield on-expire hooks are intentionally deferred because those modifier scopes do not carry a concrete target owner.

**Files changed:** `src/features/battle/types.ts`, `src/features/battle/modifiers.ts`, `src/features/battle/engine.ts`, `src/features/battle/engine/referee.ts` (header update), `src/features/battle/engine/referee.test.ts`, `docs/battle-referee/00-combat-laws.md`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** 9 tests - damage on natural expiration, stun/mark on natural expiration, no fire when target died, no fire after manual removal, damage immunity respected, helpful immunity respected, original live source used, dead source still resolves while target lives, ordinary modifiers remain silent.

---

### Phase 11A - Turn-Indexed Ability Replacement

**Goal:** Add optional replacement variants by remaining duration without changing existing fixed replacement behavior, grant behavior, lock behavior, cooldown behavior, or expiration timing.

**What was done:**
- Added `replacementsByRemainingTurns?: Record<number, BattleAbilityTemplate>` to replace-mode `BattleAbilityStateDelta`.
- `getVisibleAbilities()` now chooses the replacement variant matching the replace delta's current `duration` when present.
- Missing remaining-turn keys fall back to the existing fixed `replacement`.
- Clone/application paths now preserve and clone turn-indexed variants: `addAbilityStateDelta()`, `cloneAbilityStateDelta()` in `engine/clone.ts`, and `cloneAbilityStateDelta()` in `reactions.ts`.
- Grant and lock modes were left unchanged.
- Replacement cooldown carryover was intentionally not implemented; replacement cooldown abandonment remains documented in §4.9.

**Files changed:** `src/features/battle/types.ts`, `src/features/battle/engine/selectors.ts`, `src/features/battle/engine/stateFactory.ts`, `src/features/battle/engine/clone.ts`, `src/features/battle/reactions.ts`, `src/features/battle/engine/referee.ts` (header update), `src/features/battle/engine/referee.test.ts`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** 8 tests - fixed replacement preserved, remaining-3 variant, remaining-2 variant after tick, remaining-1 variant after second tick, original returns after expiration, missing key falls back to fixed replacement, grant still works, lock still works.

---

### Phase 11B - Strict Energy Affordability

**Goal:** Remove the soft fallback from requested random-energy allocation to raw ability cost. If the selected/requested cost cannot be paid, the action does not fire.

**What was done:**
- Audited `resolveAction()`: the fallback happened after `canUseAbility()` accepted the raw cost, when a complete `randomCostAllocation` resolved to a typed requested cost that could not be paid. The old code silently spent the raw random cost instead.
- `resolveAction()` now checks the command-resolved cost before spending energy, setting cooldown, emitting `ability_used`, or applying effects.
- If the command-resolved cost cannot be paid, the action is interrupted with a clear insufficient-energy log and `ability_interrupted` runtime event.
- Valid random allocations and normal no-allocation random-cost spending are unchanged.
- Queue/projected-cost validation remains unchanged.

**Files changed:** `src/features/battle/engine.ts`, `src/features/battle/engine.test.ts`, `src/features/battle/engine/referee.ts` (header update), `docs/battle-referee/02-implementation-status.md`

**Tests added:** 8 tests - valid requested cost pays and fires, invalid requested cost blocks instead of falling back, no requested cost uses normal cost, insufficient normal cost blocks, blocked action does not apply effects, blocked action does not set cooldown, blocked action logs clear cost failure, projected queued-cost behavior remains unchanged.

---

### Post-Referee Gojo Correctness Pass

**Goal:** Resolve the Gojo law-audit findings without redesigning or rebalancing Gojo.

**What was done:**
- Locked the Infinity contract: if Infinity is active when a harmful skill targets Gojo, the triggering skill is blocked first. Infinity collapse cleanup is deferred until after that triggering action's effect/counter/reflect window.
- Added `deferEffectsUntilAfterTrigger?: boolean` for reaction effects and used it only on Gojo's Infinity Collapse reaction. General reaction priority remains unchanged.
- Added `appliedInRound` to effect immunity state and gave `tickEffectImmunities()` the same first same-round tick protection used by modifiers, reaction guards, and state modes.
- Declared Gojo's Pulled marker application and Pulled removal as `intent: 'harmful'`.
- Updated Gojo's Infinity passive wording to match the locked contract.
- Updated `docs/battle-referee/05-gojo-law-audit.md` with resolution notes.

**Files changed:** `src/features/battle/types.ts`, `src/features/battle/engine.ts`, `src/features/battle/engine/tick.ts`, `src/features/battle/engine/stateFactory.ts`, `src/features/battle/content/fighters/_helpers.ts`, `src/features/battle/content/fighters/gojo.ts`, `src/features/battle/engine.test.ts`, `src/features/battle/engine/referee.ts`, `docs/battle-referee/05-gojo-law-audit.md`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** 8 tests - Infinity blocks triggering harmful damage, Infinity blocks triggering harmful non-damage effects, ignores-invulnerability still pierces then collapses Infinity, Blue Pulled setup blocked by invulnerability, Red Pulled consumption/alignment blocked by invulnerability, `canGainInvulnerable=false` blocks Infinity invulnerability, helpful immunity blocks Gojo self-helpful Infinity effects, counter/reflect priority with Infinity, and effect immunity same-round tick behavior.

---

### Phase 12 - Reaction Timing Law Consolidation

**Goal:** Turn the Gojo/Infinity timing fix into a generic referee contract for future reactive mechanics.

**What was done:**
- Audited the reaction flow in `engine.ts`, `referee.ts`, `tick.ts`, `types.ts`, and `stateFactory.ts`.
- Confirmed the generic action timing order: `onAbilityUse` reactions/passives, target `onBeingTargeted` effect reactions, counter, reflect, triggering effects, deferred reaction effects, then resolve/targeted passives.
- Added generic tests proving deferred reactions are not Gojo-specific and do not bypass intent/immunity laws.
- Added `docs/battle-referee/06-reaction-timing-laws.md` documenting trigger windows, normal vs. deferred reactions, post-trigger cleanup, counter/reflect priority, deterministic ordering, and same-round effect-immunity tick protection.
- No character kits were changed in Phase 12.

**Files changed:** `src/features/battle/engine.test.ts`, `docs/battle-referee/06-reaction-timing-laws.md`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** 8 tests - blocking reaction prevents triggering damage, deferred cleanup does not expose the target to the original action, deferred effects resolve after the triggering action window, non-deferred effects retain normal timing, multiple same-target effect reactions resolve deterministically, counter-before-reflect priority remains stable with deferred cleanup, newly applied effect immunity has generic same-round tick protection, and deferred effects still respect helpful intent laws.

---

### Character Readiness Phase 1 - Kit Contract Audit

**Goal:** Audit the current roster for playtest readiness against skill copy, metadata completeness, referee laws, marker/state behavior, and Naruto-Arena-style expectations.

**What was done:**
- Inspected all 24 authored character kit files and fighter helper patterns.
- Created `docs/character-readiness/01-kit-contract-audit.md`.
- Classified each character as ready, needing focused tests, needing implementation/copy clarification, or risky/blocked.
- Identified the main cross-roster risk: older kits often use neutral `modifierEffect()` / `markerEffect()` defaults for gameplay-facing harmful debuffs or helpful buffs.
- Prioritized missing tests by character and risk level.
- No character kit or engine behavior was changed.

**Files changed:** `docs/character-readiness/01-kit-contract-audit.md`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** None. This was a read-only audit/documentation phase.

---

### Character Readiness Phase 2 - P0 Trust Fixes

**Goal:** Resolve the highest-risk character trust findings from the kit contract audit with focused tests and minimal implementation/copy fixes.

**What was done:**
- Shoko `Preserve the Body` copy now matches its all-damage undying behavior, and the undying modifier declares `intent: 'helpful'`.
- Shoko `Autopsy Report` now matches copy by applying harmful Affliction-only and Mental-only damage-taken modifiers instead of a blanket all-damage modifier.
- Yaga `Cursed Corpse: Release` copy now matches the existing unconditional 15 normal plus 15 piercing damage implementation.
- Eso/Kechizu Rot stack application now declares `intent: 'harmful'` where it is applied to enemies through Impaling Rush, Hostage Situation, Acidic Spit, Connected Souls, and Chomp.
- No engine behavior or broad kit balance was changed.

**Files changed:** `src/features/battle/content/fighters/shoko.ts`, `src/features/battle/content/fighters/yaga.ts`, `src/features/battle/content/fighters/eso.ts`, `src/features/battle/content/fighters/kechizu.ts`, `src/features/battle/engine.test.ts`, `docs/character-readiness/01-kit-contract-audit.md`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** 9 tests - Shoko ordinary lethal damage preservation, Shoko scheduled Preserve the Body healing, Shoko helpful-immunity blocking for Preserve the Body, Shoko Affliction/Mental-only Autopsy bonus, Shoko Autopsy blocked by invulnerability, Yaga Release unconditional normal-plus-piercing damage, Eso Rot blocked by invulnerability, Kechizu Acidic Spit Rot blocked per invulnerable target, and Rot blocked by non-damage effect immunity while initial damage still lands.

---

### Character Readiness Phase 3 - P1 Referee Stress Tests

**Goal:** Add focused referee-law tests for the highest-risk stress kits before broader playtesting: Todo, Miwa, Junpei, Mahito, and Jogo.

**What was done:**
- Added focused stress tests for Boogie Woogie reaction timing, Miwa Counter Slash return effects, Junpei delayed Affliction setup, Mahito transformation riders, and Jogo multi-target/Scorched gates.
- Declared harmful intent on focused gameplay-facing debuffs/markers for these five kits where tests proved protection-law relevance.
- Scheduled effect setup now routes through the normal per-target gates before arming. Harmful delayed setup is not created for invulnerable or relevant effect-immune targets.
- Updated `docs/battle-referee/06-reaction-timing-laws.md` to document scheduled effect setup gates.

**Files changed:** `src/features/battle/engine.ts`, `src/features/battle/content/fighters/todo.ts`, `src/features/battle/content/fighters/miwa.ts`, `src/features/battle/content/fighters/junpei.ts`, `src/features/battle/content/fighters/mahito.ts`, `src/features/battle/content/fighters/jogo.ts`, `src/features/battle/engine.test.ts`, `docs/character-readiness/01-kit-contract-audit.md`, `docs/battle-referee/02-implementation-status.md`, `docs/battle-referee/06-reaction-timing-laws.md`

**Tests added:** 14 tests - Todo Boogie Woogie debuffs blocked by invulnerability, Todo guard reflect timing, Todo guard when invulnerability gain is blocked, Miwa Simple Domain partial invulnerability gate, Miwa Counter Slash vs invulnerability, Miwa Counter Slash vs non-damage immunity, Junpei Moon Dregs setup blocked by invulnerability, Junpei Moon Dregs setup blocked by non-damage immunity while damage lands, Junpei scheduled Affliction shield bypass, Mahito Idle Transfiguration blocked by invulnerability, Mahito Self-Embodiment vs attacker non-damage immunity, Jogo Ember Insects Scorched blocked by invulnerability, Jogo Cataclysmic Eruption partial blocking/stack consumption, and Jogo Molten Husk helpful-target trigger with partial Scorched blocking.

---

### Character Readiness Phase 4 - Narrow Remaining Intent / Copy Audit

**Goal:** Audit the remaining non-P0/P1 kits for missing explicit intent, misleading copy, and protection-law ambiguity. Make minimal low-risk fixes only.

**What was done:**
- Added explicit `intent` to clear remaining gameplay-facing helpful buffs and harmful enemy debuffs/markers/restrictions across Yuji, Megumi, Nobara, Toge, Momo, Ijichi, Mai, Nanami, Hanami, Mechamaru, Yaga, Mahito, Maki, Panda, Noritoshi Kamo, and Todo.
- Corrected two copy mismatches: Mai `Steady Aim` no longer references a deferred reload, and Sukuna `Cursed Sovereignty` now says it ignores incoming non-damage effects.
- Clarified Yaga `Cursed Corpse: Intercept` copy without changing behavior.
- Added focused tests for the highest-risk remaining gates: Soul Charge suppression, Straw Doll setup, Aerial Support helpful immunity, Barrier Tagging, Collapse Point, Soul Understanding, Root Snare, and Kechizu Connected Souls under `canGainInvulnerable=false`.
- No broad redesign, balance pass, or new engine feature was added.

**Files changed:** `src/features/battle/content/fighters/yuji.ts`, `src/features/battle/content/fighters/megumi.ts`, `src/features/battle/content/fighters/nobara.ts`, `src/features/battle/content/fighters/toge.ts`, `src/features/battle/content/fighters/momo.ts`, `src/features/battle/content/fighters/ijichi.ts`, `src/features/battle/content/fighters/mai.ts`, `src/features/battle/content/fighters/nanami.ts`, `src/features/battle/content/fighters/sukuna.ts`, `src/features/battle/content/fighters/hanami.ts`, `src/features/battle/content/fighters/mechamaru.ts`, `src/features/battle/content/fighters/yaga.ts`, `src/features/battle/content/fighters/mahito.ts`, `src/features/battle/content/fighters/maki.ts`, `src/features/battle/content/fighters/panda.ts`, `src/features/battle/content/fighters/noritoshi.ts`, `src/features/battle/content/fighters/todo.ts`, `src/features/battle/engine.test.ts`, `docs/character-readiness/01-kit-contract-audit.md`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** 8 tests - Yuji Soul Charge partial suppression blocking, Nobara Straw Doll blocked by non-damage immunity while damage lands, Momo Aerial Support blocked by helpful immunity, Ijichi Barrier Tagging blocked by invulnerability, Nanami Collapse Point setup blocked by non-damage immunity while damage lands, Mahito Soul Understanding passive marker blocked by invulnerability, Hanami Root Snare restrictions blocked by invulnerability, and Kechizu Connected Souls behavior when ally cannot gain invulnerability.

---

### Character Readiness Phase 6 - Player-Facing Copy Cleanup

**Goal:** Perform a focused copy-only cleanup pass across all authored fighter kits. No engine changes, balance changes, or new mechanics.

**What was done:**
- Removed all internal author and dev notes from player-facing ability descriptions (Jogo Volcanic Infestation, Mahito Idle Transfiguration, Noritoshi Blood Draw/Piercing Blood, Eso Corrosive Blood, Momo Battlefield Awareness passive).
- Fixed copy/implementation mismatches: Yuji Black Flash stun condition wording, Yuji Soul Charge reaction phrasing, Nobara Hammer & Nails and Hairpin 1-use cost discounts, Nanami Ratio Technique follow-through timing and damage type, Shoko Preserve the Body heal timing, Yaga Cursed Corpse Substitute missing counter-attack clause, Junpei Toxic Break affliction modifier scope, Junpei Moon Dregs: Guard simplified, Mahito Soul Multiplicity target sentence structure, Kechizu Chomp "first time" inaccuracy removed, Eso/Kechizu Rot passive "This skill stacks" wording.
- Standardized copy conventions: "cannot become invulnerable" for canGainInvulnerable, "cannot reduce damage" for canReduceDamageTaken, "piercing damage" for piercing:true, consistent "for N turns" duration language, Ijichi Regulated Space passive now states specific numbers.
- Standardized Scorched stack copy (removed "persistent" since all Scorched stacks are permanent by design), standardized Hanami Root Snare restriction language.

**Files changed:** `src/features/battle/content/fighters/yuji.ts`, `src/features/battle/content/fighters/nobara.ts`, `src/features/battle/content/fighters/nanami.ts`, `src/features/battle/content/fighters/jogo.ts`, `src/features/battle/content/fighters/mahito.ts`, `src/features/battle/content/fighters/junpei.ts`, `src/features/battle/content/fighters/panda.ts`, `src/features/battle/content/fighters/shoko.ts`, `src/features/battle/content/fighters/yaga.ts`, `src/features/battle/content/fighters/hanami.ts`, `src/features/battle/content/fighters/momo.ts`, `src/features/battle/content/fighters/eso.ts`, `src/features/battle/content/fighters/kechizu.ts`, `src/features/battle/content/fighters/noritoshi.ts`, `src/features/battle/content/fighters/toge.ts`, `src/features/battle/content/fighters/ijichi.ts`, `docs/character-readiness/01-kit-contract-audit.md`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** None. Copy-only pass with no behavioral changes.

---

### Character Readiness Phase 5 - Targeted Residual Readiness Tests

**Goal:** Resolve or document the final targeted readiness risks for Nobara, Momo, Mechamaru, Hanami, and Nanami before copy cleanup and broader playtest work.

**What was done:**
- Added focused tests for Nobara Straw Doll required-tag behavior after failed and successful setup.
- Added focused tests for Momo `Coordinated Assault` trap setup gates, trap consumption, and immediate payoff against `Disrupting Gust` targets.
- Added focused tests for Mechamaru `Overload Cannon` under partial invulnerability, damage immunity, and damage reduction.
- Resolved Hanami `Cursed Bud Growth` mixed trap setup by declaring the reaction setup `intent: 'harmful'`; the later self-heal still resolves only if the trap was legally armed and triggered.
- Added focused Hanami tests for invulnerability, non-damage immunity, original-source payoff, and guard consumption.
- Clarified Nanami `Collapse Point` copy: it leaves a marker, while only the damage vulnerability is limited to 4 turns.

**Files changed:** `src/features/battle/types.ts`, `src/features/battle/content/fighters/momo.ts`, `src/features/battle/content/fighters/hanami.ts`, `src/features/battle/content/fighters/nanami.ts`, `src/features/battle/engine.test.ts`, `docs/character-readiness/01-kit-contract-audit.md`, `docs/battle-referee/02-implementation-status.md`

**Tests added:** 8 tests - Nobara failed Straw Doll setup does not unlock payoffs, Nobara successful setup unlocks payoffs, Momo Coordinated Assault blocked by invulnerability/non-damage immunity, Momo Coordinated Assault deterministic trap/immediate payoff, Mechamaru Overload Cannon partial protection/damage reduction, Hanami Cursed Bud Growth setup blocked by invulnerability/non-damage immunity, Hanami Cursed Bud Growth source/payoff/consumption, and Nanami Collapse Point permanent marker vs 4-turn vulnerability.

---

## 2. Test Coverage

| Scope | Count |
|---|---|
| Total tests (full suite) | **831** across 27 test files (unchanged after Phase 6 copy-only pass) |
| referee.test.ts total | **165** tests |
| engine.test.ts Phase 7B tests | 8 |
| Phase 1 predicate unit tests | ~65 |
| Phase 2 integration tests | 9 |
| Phase 3 tests | 5 |
| Phase 4A tests | 7 |
| Phase 4B tests | 13 |
| Phase 5A tests | 10 |
| Phase 6A tests | 5 |
| Phase 8 tests | 11 |
| Phase 9 tests | 6 |
| Phase 10 tests | 9 |
| Phase 11A tests | 8 |
| Phase 11B tests | 8 |
| Post-referee Gojo correctness tests | 8 |
| Phase 12 reaction timing tests | 8 |
| Character Readiness Phase 2 P0 tests | 9 |
| Character Readiness Phase 3 P1 tests | 14 |
| Character Readiness Phase 4 intent/copy tests | 8 |
| Character Readiness Phase 5 residual tests | 8 |
| (Pre-existing test files) | 595 across 26 other files |

**Key behaviors now covered by referee tests:**
- `canUseAbility` correctly rejects stunned and class-stunned fighters
- Dead targets are skipped by scheduled effects (fire-but-block for invulnerable targets confirmed)
- `canGainInvulnerable=false` blocks all pathways to invulnerability including `addModifier`
- Damage immunity blocks burn ticks, fatigue, and counter return damage
- Counter damage blocked by immunity still cancels the action
- `canReceiveHelpfulEffects=false` blocks heals, shields, and invulnerable grants from all sources including self
- Affliction DOT ticks correctly bypass shields
- Reflected damage respects attacker invulnerability, shields, and damage immunity
- Counter priority is resolved by slot order, not array insertion order
- Counter fires before reflect; counter on any target cancels before other targets' reflects check
- Invulnerability blocks all non-damage harmful effects (stun, burn, breakShield, cooldown increase)
- Helpful and neutral effects pass through invulnerability; self-targeted defensive effects self-bypass
- First and second team cooldowns, effectImmunities, reactionGuards, abilityState (replacements), and modifiers all decrement by exactly 1 per round (symmetric)
- Skip guard correctly preserves modifier duration in the round it was applied
- Scheduled effects fire at the correct absolute round number regardless of team order
- Harmful scheduled-effect setup must pass normal target gates before being armed
- `addModifier` with `intent:'helpful'` is blocked by `canReceiveHelpfulEffects=false`; without declared intent it remains neutral (not blocked)
- Modifier `onExpireEffects` fire only from natural fighter-modifier expiration, use stored source/target context, and route through normal immunity/protection gates
- Replace ability-state deltas can select variants by remaining duration while preserving fixed replacement, grant, and lock behavior
- Requested random-energy allocations are strict: an unpayable selected allocation blocks the action instead of falling back to raw cost
- Targeted residual kit contracts are pinned for Nobara required tags, Momo and Hanami reaction-trap setup gates, Mechamaru partial protection, and Nanami marker/vulnerability duration clarity
- Gojo's Infinity blocks the triggering harmful skill before collapse cleanup, while still collapsing afterward unless guarded
- Deferred reaction effects are generic post-trigger cleanup and still route through normal effect-law gates
- Shoko/Yaga P0 copy contracts and Eso/Kechizu Rot harmful application gates are covered for playtest trust
- Todo, Miwa, Junpei, Mahito, and Jogo P1 referee-law stress contracts are covered
- Remaining clear kit intent declarations now have targeted protection-law regression coverage

---

## 3. Current Battle Law Guarantees

The engine now universally guarantees:

**Actor laws**
- A dead fighter cannot act (`isAlive` checked at action resolution and in `canUseAbility`).
- A stunned fighter cannot act — `canUseAbility`, `resolveAction`, queue checks all agree.
- A class-stunned fighter cannot use abilities of the blocked class — UI and engine agree.
- An intent-stunned fighter cannot use abilities of the blocked intent — consistent across all check sites.
- A locked ability cannot be used — enforced via `getAbilityById` returning null for locked slots.

**Effect laws**
- Effect immunity applies to all effect sources: active abilities, passives, burn DOT ticks, fatigue ticks, counter return damage, and the rot-marker shield reward.
- `canGainInvulnerable=false` blocks invulnerability through all pathways — `invulnerable` effects, `addModifier` with `isInvulnerable`, and self-application.
- `canReceiveHelpfulEffects=false` blocks all helpful effects (heals, shields, buffs, invulnerability grants) from all sources including self — no self-bypass.
- Dead targets do not receive scheduled effects.

**Protection laws**
- Affliction-class abilities bypass shields consistently — including scheduled DOT ticks from Affliction abilities.
- Reflected damage is subject to the original attacker's full protection stack (invulnerability, shields, damage immunity, damage reduction).
- Undying clamps HP at 1 for all damage packets through `applyDamagePacket`.

**Reaction laws**
- Counter checks run before reflect checks for each target — structural early return.
- A counter on any target cancels the entire action; no remaining targets' reflects fire after a cancel.
- Counter return damage cannot chain another counter or reflect — `cannotBeCountered: true` and `cannotBeReflected: true` on the packet.
- When multiple targets have reactions, priority is deterministic by `fighter.slot` (lowest slot first).
- Counter return damage is subject to the attacker's damage immunity.

---

## 4. Remaining Known Gaps

### 4.1 `addModifier` Intent Ambiguity — ✅ RESOLVED (Phase 9)

**What it was:** `addModifier`, `removeModifier`, `adjustCounter`, `setFlag`, and `setMode` effects were classified `'neutral'` by `getEffectIntent()`. This meant they were not blocked by `canReceiveHelpfulEffects` even when the modifier was clearly beneficial.

**Resolution:** Phase 9 added `intent?: 'helpful' | 'harmful' | 'neutral'` to all 10 ambiguous effect types and updated `getEffectIntent()` to respect it. Kit authors can now declare intent per-instance. Effects without a declared intent remain `'neutral'` (no behavioral change for existing kits). Yuji's Sukuna Vessel self-buff (`addModifier` with `damageTaken -0.25`) was migrated to `intent: 'helpful'` as the only clearly obvious existing case.

---

### 4.2 Explicit Reaction Priority Not Yet Modeled

**What it is:** `BattleReactionGuardState` has no explicit `priority` field. Phase 6A implemented slot-based ordering (stable battlefield position) as the tiebreaker. The combat constitution describes three-level priority: explicit priority → stable slot → creation timestamp. The explicit priority level is unimplemented.

**Gameplay impact:** Low for now. No current character kit uses priority-differentiated counters. The gap becomes meaningful when two counters on the same fighter need precedence ordering, or when a kit explicitly wants "this counter fires before others."

**Implementation risk:** Low. Add an optional `priority?: number` field to `BattleReactionGuardState`, update `resolveCounterPriority()` (already reads this field), and wire it into `runPreDamageReactionWindow` by sorting guards per fighter before the `.find()`. OCQ-5 from the constitution covers this.

**Before character-kit redesign?** No. Only add when a kit design requires it.

---

### 4.3 Expiration Timing Double-Tick — ✅ RESOLVED (Phase 7A/7B)

**What it was:** `endRound` and `endRoundTimeline` called `tickTeamTurn(secondTeam)` after `resolveTeamTurn(secondTeam)` had already ticked the second team — causing cooldowns, abilityState, effectImmunities, reactionGuards, stateModes, costModifiers, and burn/DOT duration to tick twice per round for the second-acting team. Stun was unaffected due to the `appliedInRound` skip guard.

**Resolution:** Phase 7B removed the redundant `tickTeamTurn` call from `endRound` and `endRoundTimeline`. All duration systems now tick exactly once per round per fighter regardless of team order. Audited in Phase 7A (`docs/battle-referee/03-expiration-timing-audit.md`), implemented in Phase 7B. 8 regression tests added.

---

### 4.4 On-Expire Effects - ✅ RESOLVED (Phase 10)

**What it was:** `BattleModifierTemplate` had no `onExpireEffects` field. When a modifier expired, it silently disappeared. No effect fired. Law 7.2 and OCQ-6 documented this as a known gap.

**Resolution:** Phase 10 added `onExpireEffects?: SkillEffect[]` to modifier templates and instances. Fighter-scoped modifiers now fire declared on-expire effects only when they naturally expire by duration, and route those effects through normal `resolveEffects()` gates.

**Remaining limitation:** Team and battlefield modifiers still expire silently because those scopes do not carry a concrete target owner.

---

### 4.5 Turn-Indexed Ability Replacement - ✅ RESOLVED (Phase 11A)

**What it was:** The `replace` delta mode gave a fighter a single fixed replacement ability for its duration. There was no mechanism to show a different version of the replacement based on how many turns remain.

**Resolution:** Phase 11A added optional `replacementsByRemainingTurns` to replace deltas. Effective ability resolution now selects a duration-indexed variant when one exists and falls back to the fixed replacement otherwise.

**Remaining limitation:** Replacement cooldown carryover is still not implemented; see §4.9.

---

### 4.6 Random Damage Ranges Not Implemented

**What it is:** All damage effects use a fixed `power` value. There is no native support for "deals 20–30 damage" (a range). This is not a current kit requirement but would expand design options.

**Gameplay impact:** None currently. Hypothetical future requirement.

**Implementation risk:** Low-medium if added (needs seeded RNG for determinism, UI display of range). No urgency.

**Before character-kit redesign?** No.

---

### 4.7 Energy Affordability Graceful Fallback - RESOLVED (Phase 11B)

**Resolution:** Phase 11B removed the fallback. `resolveAction()` now blocks the action when the command-resolved cost cannot be paid, before energy spend, cooldown, `ability_used`, or effects. Valid requested random allocations still work; commands without a requested allocation still use normal raw cost; projected queued-cost validation is unchanged.

**Historical note:** The text below describes the pre-Phase-11B gap.

**What it is:** `resolveAction()` in `engine.ts` has a soft fallback: if the exact `requestedCost` cannot be paid (due to random allocation desync), it attempts the raw `cost` instead. Law 2.2 says there should be no graceful fallback — if the team cannot afford the ability, it does not fire.

**Gameplay impact:** Low. The fallback is triggered only by an edge case in random energy allocation. In practice it may never fire in normal gameplay. It is a latent rule violation.

**Implementation risk:** Low. Remove the fallback and emit a block event instead. Risk: if the edge case is real and common, some abilities that currently fire might stop firing. Requires testing with the actual allocation system.

**Before character-kit redesign?** No. Low urgency given the edge case is rare in practice.

---

### 4.8 Invulnerability Scope for Non-Damage Effects — ✅ RESOLVED (Phase 8)

**What it was:** Non-damage harmful effects (stun, burn, breakShield, cooldown increase) were not blocked by invulnerability in fire-but-block scenarios. Only `applyDamagePacket` checked invulnerability.

**Resolution:** Phase 8 added a dedicated gate in `resolveEffects()` that blocks all `'harmful'`-intent non-damage effects against an invulnerable target. Self-bypass and `ignoresInvulnerability` bypass are preserved. 11 focused tests added. See Phase 8 section above.

---

### 4.9 Replacement Ability Cooldown Abandonment

**What it is:** When a temporary replacement ability expires, any cooldown accumulated on the replacement ability ID is abandoned. The original ability is restored at whatever cooldown it had when replaced. A player can use a replacement ability on the last turn before expiry and pay no cooldown cost on the restored original.

**Gameplay impact:** Low. Only relevant for replacement abilities that have cooldowns and kits specifically designed around this interaction.

**Implementation risk:** Low-medium. Requires carrying the replacement's cooldown over to the original ability when the replacement expires. The `tickAbilityState` function would need to do this transfer.

**Before character-kit redesign?** No. Low urgency; only relevant for specific kit interactions.

---

## 5. Recommended Next Phases

Character Readiness Phase 6 (copy cleanup) is complete. The roster descriptions now match implementation and have no internal author notes. Recommended next step is playtest UX/readability work followed by balance tuning. The remaining engine gaps (§4.2, §4.6, §4.9) are low urgency and not blocking playtest.

Phase 11A is complete. The remaining Phase 11 work is energy fallback removal only; replacement cooldown carryover remains tracked separately in §4.9.

### ~~Phase 7~~ — ✅ Expiration Timing Double-Tick (Resolved in Phase 7A/7B)

---

### Phase 9 — `addModifier` Intent Declaration

**Scope:** Add optional `intent?: 'helpful' | 'harmful' | 'neutral'` to `addModifier`, `adjustCounter`, `setFlag`, `setMode`, and `removeModifier` effect types. Update `getEffectIntent()` to read this field. Migrate existing kit uses to declare intent where it matters for helpful immunity. Keep `'neutral'` as the default (no behavioral change for unmigrated effects).

**Why second:** Closes the `canReceiveHelpfulEffects` loophole for buff-applying kits. Needed before any character is designed with helpful-immunity-dependent counter-play. Additive change with no behavioral regression for existing kits that don't declare intent.

**Risk level:** Low. Optional field with safe default.

---

### Phase 10 — On-Expire Effects

**Scope:** Add `onExpireEffects?: SkillEffect[]` to `BattleModifierTemplate`. In `tickTeamTurn()`, after `tickModifiers()` returns the expired list, resolve each modifier's `onExpireEffects` via `resolveEffects()` with the modifier's actor and target. Constitutionalize OCQ-6 ruling: death before expiration cancels on-expire effects; use `onDefeat` for death triggers.

**Why third:** Unlocks a design pattern used by several planned character kits. Low implementation risk; purely additive.

**Risk level:** Low-medium. New capability only; no existing behavior changes.

---

### Phase 11 — Energy Fallback Removal and Turn-Indexed Replacement

**Scope:** Remove the graceful energy fallback from `resolveAction()` — block and log instead of silently rerouting. Add `replacementsByRemainingTurns` to the replace delta for kits that need turn-indexed form changes.

**Why fourth:** Two small cleanups that close documented gaps. Neither is urgent, but both are blocking specific future design requirements.

**Risk level:** Low for turn-indexed replacement (additive). Low-medium for energy fallback removal (requires edge case testing).

---

## 6. Risk Assessment

| Gap | Gameplay Impact | Implementation Risk | Before Kit Redesign? |
|---|---|---|---|
| `addModifier` intent ambiguity (§4.1) | Medium — buff bypass via `addModifier` | Medium — field migration | Yes, low urgency |
| No explicit reaction priority field (§4.2) | Low — no current kit uses it | Low — add optional field | No |
| ~~Expiration timing double-tick (§4.3)~~ | ~~High~~ | ~~High~~ | ✅ Resolved (Phase 7A/7B) |
| On-expire effects not implemented (§4.4) | Resolved in Phase 10 | Additive capability implemented for fighter modifiers | No |
| Turn-indexed replacement not implemented (§4.5) | None currently | Low — additive | No |
| Random damage ranges not implemented (§4.6) | None currently | Medium | No |
| Energy graceful fallback (§4.7) | Low — edge case only | Low | No |
| ~~Invulnerability scope for non-damage effects (§4.8)~~ | ~~Medium — constitution gap~~ | ~~Medium~~ | ✅ Resolved (Phase 8) |
| Replacement cooldown abandonment (§4.9) | Low — specific kits only | Low-medium | No |

**Summary:** All gaps that were required before kit expansion are now resolved (§4.3 expiration timing, §4.8 invulnerability scope). Remaining gaps are design-capability additions that can wait for the first kit that requires them.

---

## 7. Post-Referee Remaining Engine Gaps

The referee-law implementation pass is complete through Phase 11B. The current non-blocking engine gaps are:

- Explicit reaction priority field: slot ordering is deterministic, but no authored `priority` field is wired for same-fighter guard precedence.
- Random damage ranges: fixed damage is still the only supported damage model.
- Team/battlefield on-expire owner context: fighter modifiers support `onExpireEffects`; wider scopes still need explicit owner/target semantics before hooks can fire safely.
- Replacement cooldown carryover: temporary replacement cooldowns are still abandoned when the original ability returns.
- Deferred reaction flush points outside active action resolution: current usage and tests cover active action windows; future scheduled/passive/fatigue deferred-cleanup designs should add focused tests before extending flush points.

Resolved in the final referee pass:

- Energy graceful fallback (§4.7) is resolved in Phase 11B. Command-resolved costs are strict; unpayable selected random allocations block the action.
- Gojo Infinity collapse ordering is resolved in the post-referee Gojo correctness pass. The triggering harmful skill is blocked first; collapse cleanup happens afterward.
- Reaction timing consolidation is resolved in Phase 12 and documented in `docs/battle-referee/06-reaction-timing-laws.md`.
- Effect immunity same-round tick protection is resolved in the post-referee Gojo correctness pass.
- Turn-indexed replacement (§4.5) is resolved in Phase 11A.
- On-expire effects (§4.4) are resolved for fighter modifiers in Phase 10.

*This document is generated from the implementation record and should be updated at the conclusion of each phase.*
