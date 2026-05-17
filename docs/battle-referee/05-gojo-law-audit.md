# Gojo Law Audit

Status: resolved by the Gojo correctness pass. The original audit was read-only; this document now includes resolution notes.

Overall classification: Correct after targeted implementation and wording updates.

## Resolution Notes

- Infinity collapse contract is locked: if Infinity is active when a harmful skill targets Gojo, the triggering skill is blocked by Infinity/fire-but-block first. Collapse cleanup then runs after the triggering action's effect/counter/reflect window.
- Gojo's Infinity Collapse reaction now defers its cleanup effects until after the triggering action. General reaction priority is unchanged.
- Gojo's Pulled application from Blue and Pulled removal from Red now declare `intent: 'harmful'`.
- Effect immunity state now carries `appliedInRound` and skips the first same-round tick, matching modifiers, reaction guards, and state modes.
- Infinity passive wording now states that the first harmful targeting is blocked before Infinity collapses.

Gojo is already exercising the intended referee surface: round-start passives, invulnerability, effect immunity, self-removal, fire-but-block targeting, mode gates, cost replacement, and multi-round setup. The current tests cover the primary Infinity, Six Eyes Focus, and Hollow Purple flows, but several behaviors are either under-declared in the tooltips or rely on neutral/bookkeeping effects that can bypass stricter referee laws in surprising ways.

## Key Law Findings

- Infinity is now a "block then collapse" shield. In the unguarded case, the `onBeingTargeted` reaction fires before the incoming skill resolves, but its cleanup effects are deferred until after the triggering action's effect window.
- Six Eyes Focus changes that behavior: while `infinity_guarded` is active, the first harmful targeting clears the guard instead of collapsing Infinity, so the triggering harmful skill is blocked by the still-active invulnerability.
- Gojo's own helpful effects are subject to helpful immunity unless the engine treats them as self-bypassed. `effectImmunity`, `invulnerable`, and free-cost replacement are helpful effects by intent law.
- `cannotGainInvulnerable` blocks Gojo's passive and Six Eyes invulnerability, but it does not necessarily block the other Infinity bookkeeping pieces. That can produce a partial Infinity state.
- Gojo's Blue/Red Pulled setup effects now declare harmful intent. Internal self bookkeeping remains neutral.
- Round-start duration behavior now includes effect immunities in the applied-round skip model.

## Passive: Limitless - Infinity

Classification: Correct.

### Current Implementation

`gojo-infinity` is an `onRoundStart` passive.

If Gojo has `infinity_collapsed`, it applies a one-round `Infinity Collapsed` marker to himself.

Otherwise, it applies three self effects:

- `effectImmunity`, label `Infinity`, blocking `nonDamage`, duration 1, tag `infinity`
- `invulnerable`, duration 1
- `reaction`, label `Infinity Collapse`, trigger `onBeingTargeted`, harmful-only, duration 1, consume on trigger

The collapse reaction checks `infinity_guarded`.

If guarded, it clears `infinity_guarded`.

If unguarded, it sets `infinity_collapsed` for 1 round, removes Gojo's `invincible` status modifier, and removes Infinity-tagged effect immunity.

### Actual Runtime Behavior Under Referee Laws

At round start, Gojo gains invulnerability and non-damage immunity unless Infinity is already collapsed.

Against ordinary harmful targeting, the reaction guard fires before the incoming ability resolves, but the collapse cleanup is deferred. The triggering harmful skill resolves into active Infinity and is blocked by invulnerability/effect immunity as applicable. After that action window, Infinity collapses for the next round.

Against harmful targeting while Six Eyes Focus is guarding Infinity, the reaction only clears `infinity_guarded`. Infinity remains active, so the triggering harmful skill is fire-but-blocked by invulnerability.

Effects with `ignoresInvulnerability` can still damage Gojo through Infinity. Current tests assert this for damage.

Self-removal of invulnerability uses neutral `removeModifier` bookkeeping. That means Gojo's own collapse cleanup is not blocked by his helpful immunity, effect immunity, or invulnerability gates.

If `cannotGainInvulnerable` is active on Gojo, the invulnerable portion should be blocked while effect immunity, reaction guard, and mode bookkeeping may still apply. That creates a partial Infinity state unless the kit explicitly accounts for it.

If Gojo cannot receive helpful effects, the passive's helpful pieces can be blocked. That may suppress invulnerability and non-damage immunity while leaving neutral bookkeeping effects active.

### Tooltip/Expectation Mismatches

Resolved. The passive now says the first harmful targeting is blocked, then collapses Infinity for the next round.

The tooltip does not explain that Six Eyes Focus changes the immediate result from "collapse then get hit" to "do not collapse and block the triggering skill."

The tooltip does not mention that `cannotGainInvulnerable` or helpful immunity can prevent part of Infinity from being applied.

Resolved for the triggering skill. Harmful non-damage effects attached to the triggering skill are blocked before deferred collapse cleanup.

### Potential Exploits/Confusion

Resolved. A harmful skill that targets active Infinity is blocked before collapse cleanup.

Resolved. Mixed damage-plus-stun abilities are blocked by the still-active Infinity protections before collapse cleanup.

Partial Infinity states are possible if invulnerability is blocked but the reaction guard or non-damage immunity remains.

Counters and reflects are not part of Gojo's kit, but Infinity is a reaction guard, so it participates in deterministic reaction priority before ordinary effect resolution. If future kit updates give Gojo counters or reflects, priority tests should be added before relying on the combined behavior.

### Recommended Fixes

Resolved by the Gojo correctness pass. The contract is now block-then-collapse, with tests covering harmful damage, harmful non-damage effects, `cannotGainInvulnerable`, helpful immunity, counter/reflect priority, and effect-immunity tick behavior.

## Ability: Cursed Technique Lapse - Blue

Classification: Correct.

### Current Implementation

Blue is an enemy-single Energy/Ranged/Instant attack with cooldown 1 and cost `mental: 1`.

It deals 20 damage, or 25 damage if the target already has the `pulled` tag. It applies a `Pulled` marker for 2 rounds and sets Gojo's `recent_blue` mode for 3 rounds.

### Actual Runtime Behavior Under Referee Laws

The damage portion is harmful and obeys ordinary damage, invulnerability, shield, counter, and reflect rules.

The `Pulled` marker is applied through `markerEffect` with declared harmful intent.

Gojo's `recent_blue` mode is self bookkeeping and is neutral.

### Tooltip/Expectation Mismatches

Resolved. Pulled is now harmful and is blocked by invulnerability when applicable.

The tooltip does not need to describe counters or reflects, but the implementation should be clear about whether reflected Blue applies Pulled to Gojo or to the original target.

### Potential Exploits/Confusion

Resolved for invulnerability. If Blue is fired into an invulnerable target through a fire-but-block path, damage and Pulled are both blocked.

Because Pulled drives Red and Hollow Purple setup, a marker that bypasses harmful gates can create setup progress when the damaging skill was otherwise blocked.

### Recommended Fixes

Resolved for the obvious harmful setup path. Broader counter/reflect coverage remains a future kit-audit question, not a current Gojo law violation.

## Ability: Cursed Technique Reversal - Red

Classification: Correct.

### Current Implementation

Red is an enemy-single Energy/Ranged/Instant attack with cooldown 1 and cost `physical: 1`.

If the target is Pulled, it deals 40 damage, stuns for 1 round, removes the Pulled modifier, and sets Gojo's `blue_red_aligned` mode for 3 rounds.

If the target is not Pulled, it deals 25 damage.

It always sets Gojo's `recent_red` mode for 3 rounds.

### Actual Runtime Behavior Under Referee Laws

Damage and stun are harmful and should be blocked by invulnerability, effect immunity, and applicable stun/class/intent laws.

Pulled removal now declares harmful intent. The alignment and recent Red modes remain neutral self bookkeeping.

The condition checks the target's Pulled marker before the branch resolves. If later harmful effects are blocked, neutral cleanup and setup effects can still resolve unless explicitly gated.

### Tooltip/Expectation Mismatches

Resolved for invulnerability fire-but-block. Red's Pulled branch is blocked as a harmful conditional against an invulnerable target, so damage, stun, Pulled consumption, and Hollow Purple alignment do not apply.

The tooltip does not clarify whether Red's stun is subject to non-damage immunity and invulnerability. Under referee law, it should be.

### Potential Exploits/Confusion

Resolved for invulnerability fire-but-block by harmful conditional gating and harmful Pulled removal intent.

Players may see no damage or stun but still lose Pulled and enable upgraded Hollow Purple.

### Recommended Fixes

Resolved for the audited invulnerability path. Additional effect-immunity-specific Red setup tests can be added during the broader kit test pass if needed.

## Ability: Hollow Technique - Purple

Classification: Needs wording update.

### Current Implementation

Hollow Purple is an enemy-all Energy/Ranged/Instant attack with cooldown 3 and cost `physical: 1`, `mental: 1`, and `technique: 1`.

It requires Gojo to have both `recent_blue` and `recent_red` active.

If `blue_red_aligned` is active, it deals 45 piercing damage to all enemies with `ignoresInvulnerability` and `ignoresShield`.

Otherwise, it deals 30 piercing damage to all enemies.

### Actual Runtime Behavior Under Referee Laws

The base version is harmful all-enemy damage. It is piercing, but it does not declare `ignoresInvulnerability` or `ignoresShield`.

The aligned version bypasses invulnerability and shield in addition to being piercing.

The setup modes use duration-based state modes. These modes preserve applied-round context and should not lose a round immediately under the Phase 7B double-tick fix.

The ability remains subject to ordinary availability, cost, cooldown, stun, lock, counter, and reflect laws unless explicitly exempted.

### Tooltip/Expectation Mismatches

"Piercing" can be read as bypassing every defense. Runtime distinguishes piercing damage from `ignoresShield` and `ignoresInvulnerability`. The aligned version bypasses more defenses than the base version.

The tooltip says "after recent Blue and Red setup" but does not expose the exact 3-round mode duration or that the aligned version requires Red consuming Pulled.

### Potential Exploits/Confusion

Players may expect base Purple to bypass shields or invulnerability because it is described as piercing.

Players may not understand why the upgraded version bypasses shield and invulnerability when the base version does not.

### Recommended Fixes

Clarify the tooltip distinction between base piercing damage and aligned defense-bypassing damage.

Keep the current implementation unless balance or UX review decides that both Purple versions should have the same defensive bypass flags.

## Ability: Six Eyes Focus

Classification: Needs wording update.

### Current Implementation

Six Eyes Focus is a self-targeted Strategic/Instant/Ultimate defend skill with cooldown 4, duration 1, and cost `random: 1`.

It applies invulnerability to Gojo for 1 round, applies a one-use free-cost modifier for 2 rounds, and sets `infinity_guarded` for 2 rounds.

### Actual Runtime Behavior Under Referee Laws

The invulnerability and free-cost modifier are helpful effects. They can be blocked by helpful immunity unless self-applied helpful effects bypass that state.

`cannotGainInvulnerable` blocks the invulnerability portion but does not necessarily block the free-cost modifier or `infinity_guarded` bookkeeping.

While `infinity_guarded` is active, the next harmful targeting of Gojo consumes the guard instead of collapsing Infinity. If Infinity is active, the triggering harmful skill is blocked by invulnerability.

The free-cost modifier uses one use and should preserve current replacement-cost behavior. It does not implement replacement cooldown carryover.

### Tooltip/Expectation Mismatches

The tooltip says the next harmful targeting will not collapse Infinity, but the runtime impact is stronger: if Infinity is active, the triggering harmful skill is also blocked.

The tooltip does not explain what happens if Gojo cannot gain invulnerability or cannot receive helpful effects.

The phrase "next skill costs no energy" is accurate for normal flow, but edge cases involving helpful immunity should be tested and documented if they are intended.

### Potential Exploits/Confusion

Gojo may receive guard bookkeeping without actually becoming invulnerable if invulnerability gain is blocked. That creates a state where Six Eyes can prevent collapse without providing the defensive promise in the tooltip.

If helpful immunity blocks the free-cost modifier but not `infinity_guarded`, players may see only part of the ultimate resolve.

### Recommended Fixes

Clarify that Six Eyes Focus guards Infinity and, when Infinity is active, causes the next harmful targeting to be blocked instead of collapsing it.

Add focused tests for Six Eyes Focus under helpful immunity and `cannotGainInvulnerable`.

Decide whether `infinity_guarded` should be blocked together with the helpful parts when Gojo cannot receive helpful effects, or whether it is intentional neutral bookkeeping.

## Cross-Cutting Audit Notes

### Targeting Legality

Gojo's invulnerability should remove him from ordinary harmful target pools when the player is selecting targets. If an action was already queued against Gojo and he becomes invulnerable before resolution, the engine intentionally allows the action to fire so fire-but-block law can spend cost and cooldown while blocking effects.

Infinity now follows the locked contract: the triggering harmful action is blocked first, then deferred collapse cleanup removes the protection.

### Helpful Immunity

Helpful immunity is broad enough to matter for Gojo. Infinity, Six Eyes invulnerability, and Six Eyes cost modification are helpful effects by intent law. The correctness pass confirmed self-helpful Infinity pieces are blocked; Six Eyes partial-resolution edge cases remain worth a targeted tooltip/test pass.

### Cannot Gain Invulnerable

`cannotGainInvulnerable` stops passive Infinity invulnerability. The current kit can still apply other Infinity/Six Eyes pieces unless those are separately gated. That is not necessarily wrong, but Six Eyes-specific wording and tests remain a small follow-up.

### Counters And Reflects

Gojo's direct attacks are not marked as uncounterable or unreflectable. Damage and stun portions should participate in the normal counter/reflect laws.

Infinity Collapse is a reaction guard, not a counter or reflect. It fires on targeting before normal effect resolution, while its cleanup can be deferred until after the triggering action window. Focused tests now cover counter and reflect priority against active Infinity.

### Duration Behavior After Phase 7B

Modifiers, reaction guards, and state modes preserve applied-round context and are protected from the old double-tick behavior.

Resolved. Effect immunities now carry `appliedInRound` and skip the first same-round tick, matching invulnerability modifiers and reaction guards.

## Recommended Follow-Up Order

1. Add Six Eyes-specific tests under `cannotGainInvulnerable` and helpful immunity.
2. Add effect-immunity-specific Red setup tests if future kits depend on Pulled consumption under immunity states.
3. Keep broader Gojo balance and redesign work out of referee correctness passes.
