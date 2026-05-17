# Character Readiness Phase 1 - Kit Contract Audit

Status: Phase 1 audit complete. Phase 2 P0, Phase 3 P1, Phase 4 narrow intent/copy, Phase 5 targeted residual readiness, and Phase 6 player-facing copy cleanup passes complete.

Date: 2026-05-17

## Scope

Inspected:

- `src/features/battle/content/fighters/_helpers.ts`
- `src/features/battle/content/fighters/yuji.ts`
- `src/features/battle/content/fighters/megumi.ts`
- `src/features/battle/content/fighters/nobara.ts`
- `src/features/battle/content/fighters/junpei.ts`
- `src/features/battle/content/fighters/maki.ts`
- `src/features/battle/content/fighters/panda.ts`
- `src/features/battle/content/fighters/toge.ts`
- `src/features/battle/content/fighters/todo.ts`
- `src/features/battle/content/fighters/miwa.ts`
- `src/features/battle/content/fighters/mai.ts`
- `src/features/battle/content/fighters/momo.ts`
- `src/features/battle/content/fighters/noritoshi.ts`
- `src/features/battle/content/fighters/nanami.ts`
- `src/features/battle/content/fighters/gojo.ts`
- `src/features/battle/content/fighters/yaga.ts`
- `src/features/battle/content/fighters/shoko.ts`
- `src/features/battle/content/fighters/ijichi.ts`
- `src/features/battle/content/fighters/sukuna.ts`
- `src/features/battle/content/fighters/mahito.ts`
- `src/features/battle/content/fighters/jogo.ts`
- `src/features/battle/content/fighters/hanami.ts`
- `src/features/battle/content/fighters/mechamaru.ts`
- `src/features/battle/content/fighters/eso.ts`
- `src/features/battle/content/fighters/kechizu.ts`
- `src/features/battle/data.ts`
- `src/features/battle/content.ts`
- `src/features/battle/validation.ts`
- Relevant referee and engine tests in `engine.test.ts` and `engine/referee.test.ts`

## Executive Summary

The roster is structurally valid and playable: current content validation passes, all abilities have the required basic metadata, and the full suite remains green. The main readiness risk is not missing metadata; it is contract precision under the finalized referee laws.

Most older kits were authored before explicit `intent` was available on ambiguous effects. As a result, many `modifierEffect()` and `markerEffect()` calls still default to neutral even when the gameplay-facing result is clearly harmful or helpful. Under the current referee, neutral effects are not blocked by invulnerability, helpful immunity, or harmful-effect gates. Gojo has already been corrected and should be treated as the reference pattern.

The second recurring risk is copy drift: several descriptions promise narrower behavior than the implementation actually provides, or describe conditional behavior that is not currently conditional.

## Phase 2 Resolution Notes

Character Readiness Phase 2 addressed the P0 trust issues without broad redesign or balance work.

- Shoko `Preserve the Body`: final contract is all-damage undying, not affliction-only. Copy now says the ally cannot be defeated by damage. The undying modifier is explicitly `intent: 'helpful'`.
- Shoko `Autopsy Report`: final contract matches the original copy. It applies a harmful marker plus two harmful damage-taken modifiers filtered to `Affliction` and `Mental`; Physical damage is not increased.
- Yaga `Cursed Corpse: Release`: final contract follows the existing implementation. The skill always deals 15 normal damage plus 15 additional piercing damage. Copy now removes the unimplemented destructible-defense condition.
- Eso/Kechizu Rot: player-facing Rot stack application is harmful state. Rot adjustments from Impaling Rush, Hostage Situation, Acidic Spit, Connected Souls, and Chomp now declare `intent: 'harmful'`. Rot payoff and cleanup remain damage/neutral cleanup under the existing design.
- Added focused regression tests for Shoko protection/heal/autopsy behavior, Yaga Release damage, and Rot application under invulnerability/effect-immunity gates.

No engine behavior was changed in Phase 2.

## Phase 3 Resolution Notes

Character Readiness Phase 3 added P1 referee stress tests for Todo, Miwa, Junpei, Mahito, and Jogo.

- Todo `Boogie Woogie`: enemy debuffs now declare harmful intent. Tests cover invulnerability blocking those debuffs, the guard becoming invulnerable/reflecting during the triggering window, and reflect behavior when invulnerability gain is blocked.
- Miwa `Simple Domain` / `Counter Slash`: the enemy `canGainInvulnerable=false` restriction now declares harmful intent. Tests cover partial invulnerability blocking, Counter Slash return effects against invulnerable attackers, and non-damage immunity blocking only the returned stun.
- Junpei `Moon Dregs`: marker/toxicity setup now declares harmful intent. Tests cover invulnerability and non-damage immunity blocking marker/reaction/scheduled setup, while direct damage still lands when only non-damage setup is blocked. Scheduled Affliction damage preserving shield-bypass class context is also covered.
- Mahito `Idle Transfiguration` / `Soul Experimentation`: gameplay-facing enemy transformation markers/debuffs now declare harmful intent. Tests cover invulnerability blocking Idle Transfiguration riders and attacker non-damage immunity blocking Self-Embodiment's transformation rider while damage still lands.
- Jogo `Scorched`: player-facing Scorched stack application now declares harmful intent. Tests cover invulnerability blocking Scorched setup, multi-target partial blocking for Cataclysmic Eruption, stack consumption, and Molten Husk triggering on helpful targeting while respecting per-target gates.
- Engine finding: harmful scheduled-effect setup now routes through normal target gates before being armed. This prevents delayed harmful setup from bypassing invulnerability or relevant effect immunity.

No balance redesigns were made.

## Phase 4 Resolution Notes

Character Readiness Phase 4 audited the remaining non-P0/P1 kits for clear missing intent and small copy mismatches.

- Added harmful intent to clear enemy-facing debuffs, markers, restrictions, vulnerability setup, and future payoff setup in Yuji, Megumi, Nobara, Toge, Momo, Ijichi, Mai, Nanami, Hanami, Mechamaru, Mahito, and Todo.
- Added helpful intent to clear ally/self-facing buffs in Yuji, Megumi, Momo, Ijichi, Hanami, Mechamaru, Yaga, Maki, Panda, Nanami, Noritoshi Kamo, and Todo.
- Updated Mai `Steady Aim` copy to remove the deferred-reload sentence. The implementation immediately reloads 1 Cursed Bullet use.
- Updated Sukuna `Cursed Sovereignty` copy to say it ignores incoming non-damage effects, matching its `nonDamage` effect immunity.
- Updated Yaga `Cursed Corpse: Intercept` copy to state the actual split contract: Yaga takes less damage and the guarded ally counters attackers.
- Added focused tests for Yuji Soul Charge, Nobara Straw Doll, Momo Aerial Support, Ijichi Barrier Tagging, Nanami Collapse Point, Mahito Soul Understanding, Hanami Root Snare, and Kechizu Connected Souls under `canGainInvulnerable=false`.

Remaining intentionally deferred:

- Rot Blood Brothers preserve-marker internals remain neutral bookkeeping.
- Hanami `Cursed Bud Growth` mixed trap setup and Nanami `Collapse Point` marker/vulnerability clarity were resolved in Phase 5.

## Phase 6 Resolution Notes

Character Readiness Phase 6 performed a focused player-facing copy cleanup pass across all authored fighter kits. No mechanics, intent declarations, engine behavior, or balance values were changed.

**Author notes removed from player-facing copy:**
- Jogo `Volcanic Infestation`: removed "This trap is visible for readability."
- Jogo `Ember Insects`: removed "persistent" from Scorched stack descriptions for consistency; all Scorched stacks are persistent by nature.
- Mahito `Idle Transfiguration`: removed internal "Random transfiguration effects are adapted to this deterministic control rider."
- Noritoshi `Blood Draw`: removed internal "This adapts the source no-cooldown rider."
- Noritoshi `Piercing Blood`: reworded "Refined Technique bonus applies after this branch" → "The Refined Technique damage bonus applies to this skill."
- Eso `Corrosive Blood`: removed "this effect is invisible" from the reaction description.
- Momo `Battlefield Awareness` passive: replaced internal author note with a real passive flavor description.

**Copy/implementation mismatches fixed:**
- Yuji `Black Flash`: the stun condition checks the Black Flash bonus counter ≥ 20, not a raw total damage value. Copy now says "If his Black Flash bonus is 20 or more" instead of the misleading "if the intended damage is 40 or more."
- Yuji `Soul Charge`: "harmful skills aimed at him" → "each time he is targeted by a harmful skill, his Black Flash bonus increases by 5" — matches the `onBeingTargeted` reaction precisely.
- Yuji `Indomitable Spirit`: "makes Yuji Itadori invulnerable for 1 turn" → "Yuji becomes invulnerable for 1 turn" (consistent short-name form used by other ultimates).
- Nobara `Hammer & Nails`: "For 1 turn, Soul Resonance costs 1 less random energy" → "Soul Resonance costs 1 less random energy for the next use" — the modifier is 1-use limited, not a 1-turn window.
- Nobara `Hairpin`: "For 1 turn, Hammer & Nails costs 0 energy" → "Hammer & Nails costs 0 energy for the next use" — same 1-use reason.
- Nanami `Ratio Technique`: "His next 7:3 Execution deals 20 additional damage" → "If he uses 7:3 Execution on the following turn, it deals 20 additional piercing damage" — the follow-through fires on the next turn via `usedAbilityLastTurn` and deals piercing damage.
- Shoko `Preserve the Body`: "will be healed when the effect ends" → "At the end of that duration, they heal 15 health" — the scheduled heal has a concrete timing, not an on-expiry hook.
- Yaga `Cursed Corpse: Substitute`: copy omitted the counter-attack on shield break. Added "If that defense is destroyed, the attacker takes 20 damage."
- Junpei `Toxic Break`: "increase all affliction effects by 5 permanently" → "the target permanently takes 5 more affliction damage" — the modifier is a targeted `damageTaken` increase with `damageClass: 'Affliction'`, not a broad affliction effect multiplier.
- Junpei `Moon Dregs: Guard`: simplified verbose "become affected by the Moon Dregs marker and harmful-skill punishment" → specific description of the 15 affliction damage, the marker application, and the 2-round punishment window.
- Mahito `Soul Multiplicity`: "targeting one enemy, dealing 15 damage to all enemies" → "targets one enemy and deals 15 damage to all enemies" — removes the grammatical conflict between the targeting sentence and the damage sentence.
- Hanami `Root Snare`: "cannot reduce or prevent damage" → "cannot reduce damage or become invulnerable" — standard cross-roster phrasing.
- Panda `Drumming Beat`: "stuns Panda from using harmful skills" → "prevents Panda from using harmful skills" — more accurate for an intentStun.
- Kechizu `Chomp`: "the first time a helpful skill is used on the target, the user will gain 1 stack of Rot" → removed "first time" (reaction is `consumeOnTrigger: false` so it fires every time). Reworded to use "caster" instead of "user" for clarity.
- Eso/Kechizu `Rot` passive: "This skill stacks" → "Rot stacks" — "This skill" is undefined in a passive description.
- Ijichi `Regulated Space` passive: vague "Each turn, allies gain barrier reinforcement and tagged enemies take damage" → specific "At round start, all allies gain 5 destructible defense. Enemies tagged by Barrier Tagging take 5 damage."
- Toge `Blast Away`: added explicit mention of the per-target Blast Away bonus counter in the description.

**Copy conventions standardized:**
- Duration: "For N turns" used consistently for modifier and mode durations.
- "cannot become invulnerable" is the standard phrasing for `canGainInvulnerable: false`.
- "cannot reduce damage" is the standard phrasing for `canReduceDamageTaken: false`.
- "piercing damage" refers to damage with `piercing: true` (bypasses shields).
- "destructible defense" is the player-facing term for shields.
- Author/dev notes are not player copy and have been removed from all ability descriptions.

No tests were added in Phase 6. The copy changes are string-only and do not affect engine behavior.

## Phase 5 Resolution Notes

Character Readiness Phase 5 targeted the remaining residual readiness risks for Nobara, Momo, Mechamaru, Hanami, and Nanami.

- Nobara `Hammer & Nails` / `Soul Resonance` / `Hairpin`: failed Straw Doll setup under invulnerability does not apply stacks or marker tags and does not unlock payoff targeting. Successful setup applies the marker/stack and unlocks both required-tag payoffs.
- Momo `Coordinated Assault`: trap setup is harmful, blocked by invulnerability and non-damage immunity, consumes after the next damage event, and still deals immediate damage to `Disrupting Gust` targets without installing a trap.
- Mechamaru `Overload Cannon`: all-enemy damage respects per-target invulnerability, damage immunity, and damage reduction. The self overload mode still applies after legal use.
- Hanami `Cursed Bud Growth`: setup contract is harmful enemy-facing trap setup. The reaction setup now declares `intent: 'harmful'`, so invulnerability blocks both damage and trap arming, and non-damage immunity blocks only the trap while direct damage lands. If the trap was legally armed, the original Hanami source deals 15 damage, heals 15, and consumes the guard when the enemy next uses a skill.
- Nanami `Collapse Point`: the permanent marker is intentional display/tracking state. The 4-turn damage vulnerability is a separate timed modifier. Copy now says the skill leaves a marker and separately describes the 4-turn vulnerability.

No broad redesigns, balance changes, or engine refactors were made.

## Helper Findings

`modifierEffect()` and `markerEffect()` now support explicit intent, but default to neutral when no intent is passed.

This is safe for internal state bookkeeping:

- self mode flags
- display-only markers
- counters used only by the actor
- internal cleanup flags

It is risky for gameplay-facing effects:

- enemy debuffs such as `damageDealt -10`
- enemy restrictions such as `canGainInvulnerable=false`
- enemy vulnerability markers such as `damageTaken +5`
- harmful markers used as future skill requirements
- ally buffs such as damage reduction or undying protection when helpful immunity should matter

Recommended convention for future kit updates:

- Enemy debuff marker/modifier: `intent: 'harmful'`
- Ally buff marker/modifier: `intent: 'helpful'`
- Self/internal setup or cleanup: leave neutral unless a law should gate it

## Readiness Table

| Character | Classification | Main Contract Notes |
|---|---|---|
| Gojo | Ready for playtesting | Reference kit. Infinity block-then-collapse, harmful Pulled setup, effect immunity timing, counter/reflect interactions covered. Six Eyes edge tests under helpful immunity and `cannotGainInvulnerable` remain useful but not blocking. |
| Yuji | Ready for playtesting | Soul Charge self guard now declares helpful intent and enemy suppression declares harmful intent. Partial invulnerability gating is covered. |
| Megumi | Needs focused tests first | Demon Dogs restrictions now declare harmful intent. Recall heal/shield should still be tested under helpful immunity. |
| Nobara | Ready for playtesting | Straw Doll setup declares harmful intent. Tests cover invulnerability/effect-immunity setup blocking, failed setup not unlocking payoffs, and successful setup unlocking required-tag payoffs. |
| Junpei | Ready for playtesting | Moon Dregs marker/toxicity setup now declares harmful intent. Tests cover invulnerability/effect-immunity gates, scheduled Affliction shield bypass, and Guard baseline behavior. |
| Maki | Ready for playtesting | Weapon Mastery and scheduled follow-ups are covered better than most. Remaining risk is scheduled `ignoresInvulnerability` expectations and Weapon Mastery cost-increase edge cases. |
| Panda | Needs focused tests first | Cursed Body damage reduction now declares helpful intent. Gorilla Mode cost/state behavior still needs helpful-immunity coverage. |
| Toge | Needs focused tests first | Don't Move debuff and Blast Away bonus setup now declare harmful intent. Vocal Strain self-damage and Throat Spray self-vs-ally flag behavior still need coverage. |
| Todo | Ready for playtesting | Boogie Woogie debuffs now declare harmful intent. Tests cover invulnerability blocking setup and guard reflect timing. |
| Miwa | Ready for playtesting | Simple Domain enemy restriction now declares harmful intent. Tests cover partial invulnerability gates and Counter Slash return effects against invulnerability/effect immunity. |
| Mai | Ready for playtesting | Steady Aim copy now matches immediate reload. Suppressing Fire debuff declares harmful intent. |
| Momo | Ready for playtesting | Aerial Support, Disrupting Gust, and Coordinated Assault setup now declare intent. Tests cover helpful immunity, invulnerability/effect-immunity setup gates, trap consumption, and immediate Disrupting Gust payoff. |
| Noritoshi Kamo | Ready for playtesting | Sequencing and Refined Technique behavior are already covered in scenario tests. Blood Draw self-damage uses explicit bypass flags; Blood Draw Tempo now declares helpful intent. |
| Nanami | Ready for playtesting | Execution and Collapse Point declare harmful intent. Collapse Point setup is covered against non-damage immunity, and Phase 5 clarified/tested permanent marker vs 4-turn vulnerability. |
| Yaga | Ready for playtesting | Release copy matches behavior. Intercept copy now states Yaga takes less damage while the guarded ally counters attackers. |
| Shoko | Ready for playtesting | Preserve the Body now truthfully describes all-damage undying and declares helpful intent. Autopsy Report now affects only Affliction and Mental damage with harmful intent, matching copy. |
| Ijichi | Ready for playtesting | Barrier Tagging now declares harmful intent and is covered against invulnerability. Ally barrier reductions now declare helpful intent. |
| Sukuna | Ready for playtesting | Cursed Sovereignty copy now matches its broader incoming non-damage effect immunity. |
| Mahito | Ready for playtesting | Idle Transfiguration, Soul Experimentation, and Soul Understanding enemy markers/riders now declare harmful intent. Soul Understanding is covered against invulnerability. |
| Jogo | Ready for playtesting | Scorched application now declares harmful intent. Tests cover invulnerability/effect gates, multi-target partial blocking, stack consumption, and Molten Husk helpful targeting. |
| Hanami | Ready for playtesting | Root Snare, Forest Expansion, and Cursed Bud Growth setup declare harmful intent; Natural Body declares helpful intent. Tests cover Root Snare invulnerability gates and Cursed Bud Growth setup/payoff/consumption. |
| Mechamaru | Ready for playtesting | Suppressive Fire now declares harmful intent; Overload Cannon and Remote Shielding buffs declare helpful intent. Tests cover Overload Cannon partial protection and damage reduction; existing coverage pins overload mode and delayed self-damage. |
| Eso | Needs focused tests first | Rot application now declares harmful intent and is covered against invulnerability/effect immunity. Corrosive Blood delayed cleanup/preservation has scenario coverage but still deserves deeper edge tests before balance reads. |
| Kechizu | Needs focused tests first | Rot application now declares harmful intent and Acidic Spit is covered per target against invulnerability. Connected Souls now has `cannotGainInvulnerable` coverage; Blood Brothers preserve-marker internals remain deferred. |

## High-Risk Kits

### Shoko

Phase 2 status: resolved.

- `Preserve the Body` is an all-damage undying effect for 2 turns with a delayed heal. Copy now says damage, not affliction damage.
- The undying modifier is explicitly helpful and is blocked by helpful immunity.
- `Autopsy Report` now applies harmful Affliction-only and Mental-only damage-taken modifiers, plus a harmful marker.
- Focused tests cover ordinary lethal damage preservation, scheduled end-of-round healing, helpful-immunity blocking of Preserve the Body, Affliction/Mental-only Autopsy bonus, Physical non-bonus, and invulnerability blocking Autopsy.

Remaining note: the delayed heal from `Preserve the Body` still resolves as a normal scheduled heal at its due time.

### Yaga

Phase 2 status: partially resolved.

- `Cursed Corpse: Release` always deals the extra 15 piercing damage. Copy now matches that unconditional implementation.
- `Cursed Corpse: Intercept` says Yaga guards one ally, reducing damage he takes and countering attackers. Implementation puts damage reduction on Yaga and a counter on the ally. This may be intended as Yaga intercepting, but the wording is ambiguous.

Remaining note: Intercept wording should be reviewed in a later copy pass.

### Eso / Kechizu

Phase 2 status: core Rot application contract resolved.

- Rot stack application is harmful when applied to enemies.
- Rot preservation/removal in Corrosive Blood is cleanup, but because counter reset/removal is neutral, it needs explicit tests around invulnerability, effect immunity, and blocked action windows.
- Blood Brothers shield reward depends on Rot application side effects and should be covered before playtest balance reads.
- Focused tests now cover Eso Rot application blocked by invulnerability, Kechizu Acidic Spit Rot blocked per invulnerable target, non-damage effect immunity blocking Rot application while allowing the initial damage to land, and existing Corrosive Blood cleanup/preservation scenarios.

Remaining note: Blood Brothers preserve-marker internals remain neutral bookkeeping. Do not treat that as final design guidance for future marker systems.

### Todo / Miwa / Junpei / Mahito

Phase 3 status: core stress contracts resolved for Todo, Miwa, Junpei, Mahito, and Jogo. Mahito's first-target passive marker remains a documented future edge case.

These kits have Naruto-Arena-style reactive mechanics that are playable, but they should be pinned now that Phase 12 exists.

- Todo Boogie Woogie: reactive invulnerability + reflect covered.
- Miwa Counter Slash: return damage/stun against protected attackers covered.
- Junpei Guard and Moon Dregs setup: reactive punishment plus marker/scheduled setup covered.
- Mahito Self-Embodiment: reactive punishment plus Idle Transfiguration rider covered.
- Jogo Molten Husk and Scorched: helpful targeting, invulnerability gates, and multi-target partial blocking covered.

Recommendation: move next to small player-facing copy cleanup before broader playtest UX and balance work.

## Cross-Roster Contract Patterns

### Intent Gaps

Phase 4 resolved the clear helper-level intent gaps found in this audit. Enemy-facing `markerEffect()` / `modifierEffect()` calls that apply debuffs, restrictions, vulnerability, or future payoff markers now declare `intent: 'harmful'` in the audited kits. Ally/self-facing helper modifiers that clearly grant protection or offense now declare `intent: 'helpful'`.

Known remaining intent/design ambiguities:

- Yaga `Cursed Corpse: Substitute` installs an ally guard that damages an attacker later. It is effectively a protective trap, but reaction setup intent is still inferred from nested damage.
- Rot Blood Brothers preserve-marker internals remain neutral bookkeeping by design for now.
- Internal self flags, display-only markers, and cleanup counters remain neutral unless a future law requires otherwise.

### Marker Duration And Cleanup

Most marker durations are mechanically valid after Phase 7B, but player-facing copy should be reviewed carefully where:

- a marker is permanent but another modifier expires, such as Nanami `Collapse Point` after its Phase 5 clarification
- a counter is permanent but represented by a display-only passive, such as Rot
- a marker is used only for required targeting, such as Nobara Straw Doll
- a marker is consumed by a damaging skill, such as Gojo Pulled, where intent has now been corrected

### Invulnerability And Fire-But-Block

Kits with reactive protection must be tested with the Phase 12 contract:

- Gojo is covered.
- Todo, Junpei, Mahito, Jogo, Kechizu, and Miwa now have focused coverage.
- Hanami has baseline resilience, Root Snare, and Cursed Bud Growth trap setup/payoff coverage.

### Helpful Immunity And Cannot Gain Invulnerable

All invulnerability-granting ultimates should have one generic suite or representative character tests for:

- `canGainInvulnerable=false`
- `canReceiveHelpfulEffects=false`
- partial resolution when the invulnerability is blocked but neutral mode/cost/shield effects remain

Gojo has this coverage for Infinity; ordinary ultimates do not all need per-character duplication, but high-complexity kits do.

## Prioritized Test Recommendations

### P0 - Correctness Before Playtest Trust

1. ~~Shoko `Preserve the Body`~~ - resolved in Phase 2.
   - Verify whether undying blocks all damage or only affliction damage.
   - Verify on-expire/scheduled heal behavior if target dies first.
   - Verify helpful immunity blocks the intended helpful state once intent is corrected or deliberately left neutral.

2. ~~Shoko `Autopsy Report`~~ - resolved in Phase 2.
   - Verify whether the damage taken increase is all sources or Affliction/Mental only.
   - Add class-filter tests after the intended contract is chosen.

3. ~~Yaga `Cursed Corpse: Release`~~ - resolved in Phase 2 by copy correction.
   - Verify extra piercing damage only when an ally has destructible defense, or update copy if always-on is intended.

4. ~~Rot package: Eso and Kechizu core application gates~~ - resolved in Phase 2.
   - Rot stack application blocked by invulnerability when applied as harmful state.
   - Rot stack application blocked by relevant effect immunity if declared harmful.
   - Corrosive Blood delayed damage and stack cleanup/preservation.
   - Blood Brothers shield reward when Rot is applied by Eso/Kechizu reactions and schedules.

### P1 - Referee Stress Tests

1. ~~Todo `Boogie Woogie`~~ - resolved in Phase 3.
   - Reactive invulnerability + reflect blocks/redirects the triggering harmful skill.
   - Behavior when Todo cannot gain invulnerability.
   - Behavior against unreflectable or uncounterable skills.

2. ~~Miwa `Counter Slash`~~ - core protected-attacker interactions resolved in Phase 3.
   - Non-domain version consumes after one harmful targeting.
   - Simple Domain version persists and counters every harmful targeting that turn.
   - Attacker invulnerability/effect immunity interaction with returned stun/damage.

3. ~~Junpei `Moon Dregs: Guard` / `Moon Dregs: Injection`~~ - resolved in Phase 3.
   - Triggering harmful action is blocked by invulnerability.
   - Attacker receives damage/marker/punishment.
   - Marker/punishment do not bypass immunity once intent is declared.

4. ~~Mahito `Self-Embodiment`~~ - core reaction rider resolved in Phase 3.
   - Triggering harmful action is blocked.
   - Attacker receives damage and Idle Transfiguration.
   - Idle Transfiguration marker/debuff respects intent laws.

5. ~~Jogo `Molten Husk`~~ - resolved in Phase 3.
   - Harmful and helpful targeting behavior matches "whenever targeted by a skill."
   - Scorched stack application respects intended immunity/intent law once declared.

### P2 - Copy And Metadata Regression Tests

1. ~~Nanami `Collapse Point`~~ - resolved in Phase 5 by copy clarification and marker/vulnerability test.
   - Permanent marker vs 4-turn vulnerability display.
   - Required-tag behavior after vulnerability expires.

2. ~~Mai `Steady Aim`~~ - resolved in Phase 4 by copy correction.
   - Copy around "delayed reload" vs immediate reload.
   - Emergency Cover scheduled reload.

3. ~~Sukuna `Cursed Sovereignty`~~ - resolved in Phase 4 by copy correction.
   - Confirm whether `nonDamage` immunity is intended to block all non-damage effects, not just cost disruption.

4. ~~Nobara Straw Doll~~ - residual required-tag behavior resolved in Phase 5.
   - Marker and stack application through invulnerability/effect immunity.
   - Required-target behavior after marker application.

5. ~~Momo `Coordinated Assault`~~ - residual trap setup/payoff behavior resolved in Phase 5.
   - onDamageApplied reaction respects invulnerability, damage immunity, and target death.

6. ~~Mechamaru `Overload Cannon`~~ - residual partial-protection behavior resolved in Phase 5.
   - Scheduled self-damage and modifier cleanup at round end.

## Implementation / Copy Mismatches

- ~~Shoko `Preserve the Body`: affliction-only copy vs general undying implementation.~~ Resolved in Phase 2 by copy correction and helpful intent.
- ~~Shoko `Autopsy Report`: Affliction/Mental-only copy vs all-damage implementation.~~ Resolved in Phase 2 by class-filtered harmful modifiers.
- ~~Yaga `Cursed Corpse: Release`: conditional copy vs unconditional extra damage implementation.~~ Resolved in Phase 2 by copy correction.
- ~~Yaga `Cursed Corpse: Intercept`: ambiguous "he takes" wording vs damage reduction on Yaga and counter on ally.~~ Resolved in Phase 4 by copy clarification.
- ~~Mai `Steady Aim`: copy mentions deferred reload, implementation reloads immediately.~~ Resolved in Phase 4 by copy correction.
- ~~Sukuna `Cursed Sovereignty`: copy mentions cost disruption, implementation blocks all non-damage effects.~~ Resolved in Phase 4 by copy correction.
- ~~Nanami `Collapse Point`: copy says 4 turns, but the marker is permanent while the damage-taken modifier expires.~~ Resolved in Phase 5 by copy clarification: the marker is left on the target, while the vulnerability lasts 4 turns.

## Engine Limitations Discovered

- No authored priority field is wired for same-fighter reaction guard ordering. Stored order is deterministic, but not design-authored priority.
- Team/battlefield `onExpireEffects` still lack concrete owner/target context.
- Replacement cooldown carryover is still deferred.
- Random damage ranges are not implemented.
- Class-specific damage vulnerability depends on existing modifier class filters; several copy promises should be verified against those filters before kit edits.
- There is no broad automated lint that flags likely harmful/helper `modifierEffect()` or `markerEffect()` calls missing explicit intent.

## Recommended Next Phase

The next phase should be a small player-facing copy cleanup pass, not a rebalance pass.

Recommended order:

1. Review player-facing ability copy for wording consistency after the readiness tests.
2. Keep the pass copy-only unless a tooltip exposes a clear implementation mismatch.
3. After copy cleanup is green, begin playtest UX/readability work before balance tuning.
