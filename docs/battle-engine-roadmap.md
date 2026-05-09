# Battle Engine Roadmap

## Phase 1: Engine Hardening (in progress)

Goal: make the local battle engine safe to use as the foundation for server-side match resolution.

### Step 1 — Invalid target fallback removed ✓
`resolveAction` no longer silently retargets to a different unit when the
commanded target is missing or dead.  Actions with no valid target resolve as
a no-op.  Invulnerable targets are still forwarded to `applyDamagePacket` so
blocking mechanics (e.g. Brink Control) fire correctly.

### Step 2 — Canonical command validator ✓
`getBattleCommandBlockReason(state, command, queued?)` in `engine.ts` is the
single authoritative check for whether a `QueuedBattleAction` is legal.  It
covers: actor existence/liveness/team, ability existence, pass shortcut, stun,
intent-stun, class-stun, cooldown, single-target validity, random-cost
allocation, current-pool energy, and projected overcommit across queued
actions.  The UI, AI, and future Edge Function should all route through this
helper rather than re-implementing the checks.

### Step 3 — Deterministic runtime IDs ✓
`createClassStunState`, `createIntentStunState`, and `createReactionGuardState`
in `engine/stateFactory.ts` no longer use `Date.now()`.  IDs are derived from
the target array length at creation time (the same pattern already used by
`createEffectImmunityState`).  Identical inputs now produce identical
`BattleState` output, which is required for replay verification and server-side
validation.

### Step 4 — Shared energy documented; resolveRound deprecated ✓
See `docs/game-design.md` §Shared Pool Model and the `@deprecated` JSDoc on
`resolveRound` in `engine.ts`.

#### Canonical production flow (use this, not resolveRound)
```
resolveTeamTurn(state, firstCommands, firstTeam)
transitionToSecondPlayer(state)       // or equivalent phase gate
resolveTeamTurn(state, secondCommands, secondTeam)
endRound(state) / beginNewRound(state)
```
`resolveRound` collapses both halves into one call and is not suitable for the
multiplayer submission model.  It is kept for offline tooling only.

---

## Milestone 2: Conditional Effects and Counter Rules

- Status: partially implemented.
- Added a `conditional` skill effect wrapper with shared battle reaction conditions and optional `elseEffects`.
- Added `setCounter` and `adjustCounter` min/max clamps for capped stack/ammo rules.
- Added modifier-tag conditions: `actorHasModifierTag` and `targetHasModifierTag`.
- Converted Mai Cursed Bullet / Steady Aim / Suppressing Fire to use conditional effects and capped bullets.
- Added tests for conditional branches, capped ammo, and else-branch behavior.

Remaining Milestone 2 work:

- Support conditions for actor/target modifier tags, active shield tags, current form/mode, prior ability use, and counter thresholds.
- Add counter authoring rules: initial value, max value, set value, spend amount, decay timing, and visible labels.
- Convert ammo and stack systems to capped counters:
  - Jogo Scorched stack display and consumption.
  - Megumi Shikigami spending.
  - Sukuna cost-reduction stacks.
  - Nanami Collapse Point execution scaling.
  - Toge Blast Away stacking.
- Add tests for conditional damage, conditional stun, capped counters, counter spending, and counter display metadata.

Implementation notes for next pass:

- `conditional` exists in `SkillEffect`; nested effects are cloned, validated, and resolved through `resolveEffects`.
- `adjustCounter` supports optional `min` and `max` clamps, but there is not yet a reusable counter metadata registry for labels/decay/visibility.
- `initialStateCounters` exists on fighter templates, but max values are currently authored per effect rather than centrally enforced.
- ACP supports basic authoring for the new effect shapes, but nested `conditional.effects` editing is still JSON/manual-level through existing nested structures rather than a polished sub-editor.

## Milestone 3: Damage Filters, Skill History, and Modes

Status: partially implemented.

Implemented in the current pass:

- Added fighter `stateModes` plus `initialStateModes`.
- Added `setMode` and `clearMode` effects.
- Added mode conditions: `actorModeIs` and `targetModeIs`.
- Added ability history storage on fighter state:
  - `previousUsedAbilityId`
  - rolling `abilityHistory`
- Added history conditions:
  - `usedDifferentAbilityLastTurn`
  - `usedAbilityWithinRounds`
  - `usedAbilityOnTarget`
- Added damage flags on authored damage effects:
  - `ignoresInvulnerability`
  - `ignoresShield`
  - optional packet `damageType`
- Added pip display for active fighter modes and more readable Cursed Bullet / Scorched counters.
- Converted Panda Gorilla Mode branches to use mode conditions.
- Tightened Gojo Hollow Purple using Limitless counters and shield/invulnerability bypass flags.
- Added tests for Panda mode branches and Gojo enhanced Hollow Purple.

Implemented in the WIP pass (now merged):

- Added `BattleStateModeDuration` and `stateModeDurations` on fighter state.
- `setMode` accepts optional `duration`; expired modes are ticked at round end (with skip-on-apply-round rule matching stun/classStun behavior).
- Pip display shows mode duration remaining.
- Added `excludedDamageClass` on `BattleModifierTemplate` and `BattleModifierInstance`; modifier math skips the modifier when the incoming damage class matches the excluded class.
- Added `firstAbilityOnTarget` reaction condition (true when actor has not yet used the ability, or any ability if omitted, on the current target).
- Validation and ACP description support for `firstAbilityOnTarget`.
- Fixed: counter damage in `runPreDamageReactionWindow` used an undefined `effect` reference; hardcoded to `'normal'` damageType.
- Added focused tests: mode duration expiry, `firstAbilityOnTarget` per-target tracking, and `excludedDamageClass` modifier filtering.

Remaining Milestone 3 work:

- Add prevention filters for direct-damage death versus affliction/debuff death.
- Convert durable states to modes:
  - Nanami Overtime.
  - Gojo Infinity active/collapsed.
  - Maki Weapon Mastery.
  - Yuji/Sukuna transformation.
  - Panda temporary Core Shift mode should expire instead of permanently forcing Gorilla Mode.
- Improve roster fidelity:
  - Kamo sequencing.
  - Shoko death prevention / affliction-specific preserve behavior.
  - Toge Vocal Strain scaling/reset.
  - Sukuna cost decay.
  - Gojo Blue/Red/Purple exactness.
  - Maki/Nanami/Panda mode and cost behavior.
- Add tests for Gojo Blue/Red/Purple, Kamo sequencing, Panda form upgrades, Shoko death prevention, and Toge strain.

## Phase 2 Preparation: Signature Mechanic Tests ✓

Added 19 focused mechanic-level tests to `engine.test.ts` covering:

- **Jogo**: Disaster Heat onTakeDamage accumulation (25-damage threshold → Scorched trigger); Cataclysmic Eruption scaled damage with stack consumption.
- **Sukuna**: King's Vessel energy gain per ability; reduceRandom costModifier lifecycle (applied by onAbilityResolve, consumed before next ability activation, gone after tickTeamTurn).
- **Nanami**: Overtime one-shot HP threshold passive; Ratio Follow-Through chained execution bonus (20 piercing via onAbilityResolve inherit target).
- **Toge**: Vocal Strain self-damage counter; Throat Spray flag lifecycle (flag set and consumed within same turn by passive — observable state is always reset).
- **Todo**: Besto Friendo target marking; Brutal Swing damage filter on marked target.
- **Panda**: Three Cores gorilla-mode trigger below 30% HP; flag prevents second trigger.
- **Kamo**: Refined Technique +10 modifier added after Blood Draw → applied to next ability (not the current one, since onAbilityResolve fires after damage); damageFiltered on Piercing Blood never fires (requires enemy to hold blood-draw tag, not Kamo).
- **Gojo**: Infinity passive invulnerability at round start; ignoresInvulnerability damage pierces it.

**Engine bug fixed**: `isEffectBlocked` in `reactionPredicates.ts` was blocking self-applied effects when the actor's own `effectImmunity` was applied first in the same passive chain. Fixed by passing `actorId` to `isEffectBlocked` and skipping immunity when actor equals target. This manifested as Gojo's `invulnerable` effect being silently blocked by his own `Infinity` effectImmunity.

**Content bug fixed (Kamo Piercing Blood)**: `damageFiltered` checks the *target's* modifier pool. Blood Draw gave Kamo himself the `blood-draw` tag, not the enemy — so the +15 piercing bonus never fired. Fixed by replacing `damageFiltered` with a `conditional { type: 'usedAbilityLastTurn', abilityId: 'noritoshi-blood-draw' }` on `target: 'inherit'`. Tests updated to assert 35 damage after Blood Draw (20 base + 15 piercing conditional). Also note: the Refined Technique passive fires `onAbilityResolve` AFTER damage, so its +10 modifier boosts the *following* ability, not Piercing Blood itself.

## Focused Mechanic Audit ✓

Reviewed all `damageFiltered` uses, `usedAbilityLastTurn` timing, `onAbilityResolve` ordering, and `effectImmunity`+`invulnerable` co-occurrence across the full roster.

### Confirmed intentional / acceptable

- **Todo Besto Friendo**: `onAbilityResolve` marks target with `todo-type` and applies `damageTaken +5`. The mark fires *after* the damage of the current ability — the +5 bonus applies to future hits. By design.
- **Nanami Ratio Follow-Through**: `onAbilityResolve` with `abilityId('nanami-execution')` fires 20 piercing damage on `inherit` after Execution's own damage. The double-check (`abilityId` + `usedAbilityLastTurn`) is intentional gating.
- **Toge Vocal Strain / Throat Spray flag**: flag is set and consumed within the same turn (Throat Spray sets it, Vocal Strain passive consumes it). Observable state is always flag=false. This is intentional by-design; the flag is a within-turn signal.
- **Sukuna King's Vessel `reduceRandom` lifetime**: `duration: 1, uses: 1` cost modifier is applied by `onAbilityResolve`, then ticked away by `tickCostModifiers` at end of `resolveTeamTurn`. It is consumed before the tick if the next ability uses it in the same turn. One-use-per-turn is intentional.
- **Jogo Disaster Heat trigger description**: says "Ember Insects will trigger on all enemies" but the `onTakeDamage` passive only applies `adjustCounter(scorched, +1)` + `markerEffect(Scorched, 5 turns)` — not the full Ember Insects skill (which also grants a shield and a `onShieldBroken` reaction). The description is approximate; the mechanic is functionally correct. Description wording could be improved but this is not a bug.
- **Gojo Reversal Red `damageFiltered` (requiresTag `pulled`)**: correct — Lapse Blue applies `pulled` marker to the *enemy target*, and Reversal Red checks the same enemy target. Works correctly.
- **All other `damageFiltered` uses** (Todo Boogie-Woogie, Junpei Moon Dregs, Mahito Idle Transfiguration, Momo Disrupting Gust, Nobara Hairpin, Ijichi Barrier Tagging): all correctly apply the tag to the *enemy target* and check the same enemy target. No issues.

### Confirmed bugs fixed in this pass

- **Engine**: `isEffectBlocked` self-blocks self-applied effects — fixed (see above).
- **Kamo Piercing Blood**: `damageFiltered` with `requiresTag: 'blood-draw'` never fired — fixed with `usedAbilityLastTurn` conditional.

### Known issues documented but not fixed (deferred to Milestone 3 / Milestone 4)

- **Panda Core Shift**: sets `form = gorilla` with no duration, permanently forcing Gorilla Mode after use. Should expire after 1 round. Already listed in Milestone 3 remaining work.
- **Toge Blast Away nested condition**: the "Don't Move used last turn" bonus inside the Throat Spray branch is architecturally unreachable — `usedAbilityLastTurn` can only match one prior ability at a time. The two bonuses cannot combine. Not a crash bug, but the description implies they should stack. Deferred.

### Description wording to update (low priority)

- **Jogo Disaster Heat**: "Ember Insects will trigger" → say "all enemies gain 1 Scorched stack" instead, to match actual engine behavior.
- **Kamo Piercing Blood**: already updated to "deals 15 additional piercing damage" (was "additional piercing damage" without amount).

---

## Milestone 4: Roster Fidelity and UI Polish

Status: started.

- Pips now show fighter modes.
- Reaction pips now describe generic event reactions instead of treating all non-counter guards as reflect.
- Counter pips now include readable Cursed Bullet and Scorched lines.

Remaining Milestone 4 work:

- Replace approximation effects in the authored roster with exact engine-backed behavior.
- Review every character against source screenshots and add one focused test per signature mechanic.
- Update pip descriptions to read from reaction, conditional, counter, and mode metadata.
- Make pips visually group related state: counters, modes, pending reactions, shields, and immunity.
- Update the practice battle turn log to name reaction triggers, conditional branches, counter spends, and mode transitions clearly.
- Run a full roster validation pass through the ACP publish flow and practice battle flow.
