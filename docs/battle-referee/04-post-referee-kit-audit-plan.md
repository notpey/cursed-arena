# Post-Referee Kit Audit Plan

**Status:** Planning document. Do not treat this as a kit-change spec until each character has been reviewed against live gameplay and UI copy.

## A. Final Engine-Law State

The battle engine can now reliably support these referee-law behaviors:

- Strict stun, class stun, and intent stun law: queue checks, command checks, and resolution checks agree.
- Invulnerability as a targeting and fire-but-block law: harmful effects are blocked at resolution when a target becomes invulnerable after legal queueing; damage packets keep their canonical protection path.
- Helpful immunity: `canReceiveHelpfulEffects=false` blocks helpful effects from all sources, including self.
- Effect immunity across all sources: active abilities, passives, burn ticks, fatigue, counter return damage, scheduled effects, and special reward paths use the same immunity contracts.
- On-expire effects: fighter-scoped modifiers may declare `onExpireEffects`, which fire only on natural duration expiration and resolve through normal effect handling.
- Turn-indexed replacement: replace-mode ability state can choose replacement variants by remaining duration while preserving fixed fallback replacement behavior.
- Strict energy affordability: selected random-energy allocations are strict; unpayable requested costs block the action instead of falling back to raw random cost.
- Deterministic reaction priority: multi-target counter/reflect resolution is stable by battlefield slot, with counter structurally checked before reflect.
- Fixed expiration double-tick: first and second teams tick once per round; the previous second-team double-tick is gone.

## B. Newly Available Kit Mechanics

The following mechanics are now available for character design or cleanup:

- `canReceiveHelpfulEffects=false`: anti-support windows, cursed seals that block healing/shields/buffs, and no-self-bypass control effects.
- `canGainInvulnerable=false`: anti-defensive pressure that blocks invulnerability from effects and raw modifier paths.
- On-expire punishments: delayed detonations, countdown curses, "when this mark expires" damage/stun/mark effects, and delayed self-benefits.
- Evolving countdown skills: replacement abilities can change at remaining 3, 2, 1, etc. without introducing new engine timing.
- Explicit harmful/helpful/neutral routing on ambiguous effects: `addModifier`, `removeModifier`, counters, modes, and flags can declare intent when they are gameplay-facing rather than bookkeeping.
- Affliction DOT shield bypass: Affliction-class damage and scheduled Affliction ticks can reliably bypass destructible defense while still respecting invulnerability and damage immunity.
- Deterministic counters and reflects: slot-stable reaction behavior makes multi-reactor interactions testable and authorable.
- Strict command-cost behavior: random-cost allocation mismatches fail cleanly instead of silently spending a different resource mix.

## C. Current Kit Audit Classification

Audit criteria:

- Are intents declared correctly on ambiguous effects?
- Are buffs or debuffs relying on neutral `addModifier` unintentionally?
- Does invulnerability usage still match fire-but-block behavior?
- Did the expiration double-tick fix change effective durations?
- Could a kit benefit from `onExpireEffects` or turn-indexed replacements?
- Did stricter energy affordability alter a random-cost edge case?
- Are descriptions/tooltips still accurate after referee-law changes?

| Character | Classification | Audit Notes |
|---|---|---|
| Yuji Itadori | Needs light polish | Sukuna Vessel already declares helpful `addModifier` intent. Soul Charge has long-duration mode/reaction timing that should be checked after the double-tick fix. Black Flash countdown/bonus copy should be verified. |
| Nobara Kugisaki | Needs referee-law update | Straw Doll style delayed pressure is a strong candidate for on-expire effects. Marker and scheduled-damage descriptions should be checked for duration and dead-target behavior. |
| Megumi Fushiguro | Needs light polish | Existing `cannot reduce damage` / `cannot gain invulnerability` modifier patterns are now well-supported. Audit helper-created modifiers for explicit harmful/helpful intent and verify duration copy. |
| Toge Inumaki | Needs light polish | Vocal Strain and self-reset flags are mostly bookkeeping. Check ambiguous `setFlag`/`setCounter` intent remains neutral intentionally and verify counter/reflect copy under deterministic reactions. |
| Todo Aoi | Needs referee-law update | Boogie Woogie uses random-cost allocation and reflection/invulnerability interactions; retest strict energy allocation and fire-but-block behavior. Some anti-invulnerability/debuff modifiers likely need explicit harmful intent. |
| Sukuna | Ready | Mostly direct damage, cost modifier, invulnerability, and non-damage immunity. Audit copy only for strict cost disruption and invulnerability terminology. |
| Shoko Ieiri | Needs referee-law update | Support kit should be reviewed against helpful immunity. Ally invulnerability plus healing may now be blocked by `canReceiveHelpfulEffects=false` if the target is sealed; tooltip should explain when blocked. |
| Panda | Needs light polish | Mode/flag-based Gorilla behavior is compatible. Verify temporary mode duration after double-tick fix and consider explicit intent on mode/cost-related effects only if opponent-facing. |
| Noritoshi Kamo | Needs light polish | Refined bonus counters and next-skill-free effects look compatible. Blood-binding control descriptions should be checked against class/intent stun law and strict cost behavior. |
| Nanami Kento | Needs light polish | Overtime mode/duration should be rechecked after double-tick fix. Passive `setFlag`/`setMode` effects are likely neutral bookkeeping. |
| Momo Nishimiya | Needs referee-law update | Cost increase/reduction support should be checked under strict energy affordability. Team damage reduction and invulnerability copy should be verified after fire-but-block changes. |
| Miwa Kasumi | Needs referee-law update | Simple Domain combines non-damage immunity, anti-invulnerability, counter reactions, and cooldown adjustment. Audit explicit effect intents and verify counter wording with deterministic reaction behavior. |
| Mechamaru | Needs light polish | Overload mode and remove-modifier cleanup should be checked for neutral-vs-harmful intent. Team defense/invulnerability copy should be verified. |
| Maki Zenin | Needs referee-law update | Weapon Mastery uses flags/modes/counters and a long-lived display modifier. Audit ambiguous effects for intent, and verify multi-use timing after double-tick fix. |
| Mai Zenin | Needs light polish | Bullet counters and round-start reload are mostly bookkeeping. Verify invulnerability/reload timing and tooltip language after duration fixes. |
| Mahito | Needs deeper redesign | Idle Transfiguration and Soul Understanding use remove-modifier/mark-style patterns that may benefit from on-expire punishments and explicit harmful intent. High-value candidate for a referee-law pass. |
| Kechizu | Needs referee-law update | Rot, helpful intent stun, reactions, and ally invulnerability should be checked against helpful immunity, anti-invulnerability, and reaction priority. Rot countdowns may benefit from on-expire hooks. |
| Junpei Yoshino | Needs referee-law update | Moon Dregs marker and punishment mechanics are natural on-expire candidates. Invulnerable guard plus harmful-target reaction should be retested against fire-but-block law. |
| Jogo | Needs light polish | Scorched counters and reactive invulnerability are compatible. Review neutral counter adjustments and verify whether Scorched would read better with on-expire pressure. |
| Ijichi | Needs referee-law update | The kit explicitly mentions enemies cannot reduce damage or become invulnerable. Confirm those modifiers declare harmful intent when authored through helpers and that descriptions match actual duration. |
| Hanami | Ready | Natural Body and harmful-target punishment align with deterministic reactions and fire-but-block. Audit copy only. |
| Gojo | Needs deeper redesign | Infinity uses round-start invulnerability, non-damage immunity, mode collapse, and self-removal of invulnerability. This should get a dedicated law review for target legality, fire-but-block, and tooltip accuracy. |
| Eso | Needs deeper redesign | Corrosive Blood and Blood Brothers combine hidden reactions, rot counters, preserve/remove behavior, and explicit remove/set flag effects. Strong candidate for on-expire cleanup and intent declaration. |
| Yaga | Needs light polish | Counter guard and ally protection now benefit from deterministic priority. Verify counter copy and helper-created modifier intent. |

## D. Recommended Kit Update Order

1. Correctness and tooltip mismatches:
   - Gojo, Eso, Mahito, Ijichi, Shoko, Todo.
   - Focus on invulnerability wording, helpful immunity, anti-invulnerability, and hidden reaction descriptions.

2. Kits affected by duration fixes:
   - Yuji, Nanami, Panda, Mai, Miwa, Maki, Gojo.
   - Verify modes, cost modifiers, reaction guards, and scheduled effects last the intended number of rounds.

3. Kits affected by helpful immunity or explicit intent routing:
   - Shoko, Megumi, Ijichi, Todo, Miwa, Momo, Mahito, Eso, Kechizu.
   - Add `intent` only where the effect is gameplay-facing and the target should be allowed to block it. Leave internal bookkeeping neutral.

4. Kits that can benefit from Naruto-Arena-style nuance:
   - Nobara, Junpei, Mahito, Eso, Kechizu, Jogo.
   - Consider on-expire punishments for marks, rot/corrosion, countdown curses, and delayed detonations.

5. Broader redesigns:
   - Gojo and Eso first, then Mahito.
   - These kits combine multiple advanced systems and should be adjusted with targeted tests.

## E. Proposed Next Development Phase

Recommended next phase: **kit audit only**.

Rationale:

- The engine-law surface is now stable enough to evaluate kits without changing engine behavior.
- Several kits likely need copy/intent/duration corrections before balance changes.
- Applying kit changes before an audit risks mixing correctness fixes with design buffs/nerfs.

Suggested sequence:

1. Run a read-only kit audit and produce per-character issues.
2. Apply targeted kit updates for correctness and tooltip mismatches only.
3. Add focused tests for changed kits.
4. Do a battle UX readability pass for referee feedback: blocked helpful effects, invulnerability fire-but-block, strict energy failures, and on-expire logs.
5. Only then start a balance pass or broader character redesigns.
