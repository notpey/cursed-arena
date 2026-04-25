# Battle Engine Roadmap

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

- Add damage filters for direct, affliction, fatigue, piercing, non-affliction, non-mental, and skill-class-specific damage.
- Add prevention filters for direct-damage death versus affliction/debuff death.
- Add skill history predicates:
  - used ability last turn.
  - used two different skills consecutively.
  - used ability on this target.
  - first interaction with each enemy.
  - used both named abilities within N turns.
- Add a first-class fighter mode/form system for durable states:
  - Panda Balanced/Gorilla Mode.
  - Nanami Overtime.
  - Gojo Infinity active/collapsed.
  - Maki Weapon Mastery.
  - Yuji/Sukuna transformation.
- Add tests for Gojo Blue/Red/Purple, Kamo sequencing, Panda form upgrades, Shoko death prevention, and Toge strain.

## Milestone 4: Roster Fidelity and UI Polish

- Replace approximation effects in the authored roster with exact engine-backed behavior.
- Review every character against source screenshots and add one focused test per signature mechanic.
- Update pip descriptions to read from reaction, conditional, counter, and mode metadata.
- Make pips visually group related state: counters, modes, pending reactions, shields, and immunity.
- Update the practice battle turn log to name reaction triggers, conditional branches, counter spends, and mode transitions clearly.
- Run a full roster validation pass through the ACP publish flow and practice battle flow.
