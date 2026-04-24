# Battle Contract v1 Checklist

Use this as a release gate for any battle UI/UX PR.

## A. Prep Screen
- [ ] A1: Team assembly surface always shows exactly 3 slots.
- [ ] A2: Start/queue CTA is disabled until all 3 slots are filled.
- [ ] A3: Character selection updates detail pane immediately.
- [ ] A4: Skill detail pane remains fixed-height across short/long descriptions.

## B. Prep -> Battle Handoff
- [ ] B1: Staged session payload contains mode, teams, seed, and practice/opponent metadata.
- [ ] B2: Battle launch reads staged payload without hidden team rewrite.
- [ ] B3: Portrait/icon references resolve via shared URLs for all players (not local-only paths).
- [ ] B4: Live publish is blocked when remote persistence is unavailable.

## C. Board Stability
- [ ] C1: The battlefield does not shift vertically when hovering different skills.
- [ ] C2: The skill information panel keeps fixed height across short and long descriptions.
- [ ] C3: No normal turn-flow overlay interrupts board interaction.

## D. Skill Strip and Passives
- [ ] D1: Passives are not displayed as selectable skill slots.
- [ ] D2: Skill slots never require horizontal or vertical scroll.
- [ ] D3: Only usable actions appear in the skill strip.

## E. Pip System
- [ ] E1: Effect pips are grouped by source skill, not split into noisy fragments.
- [ ] E2: Opening board shows only always-on passive pips (no premature stack clutter).
- [ ] E3: Pip visual footprint and border/glow weight are reduced versus previous implementation.

## F. Pip Hover Accuracy
- [ ] F1: Hover title shows the source skill name.
- [ ] F2: Hover body lists concrete gameplay effects (not generic passive text).
- [ ] F3: Each effect line includes remaining duration when duration exists.
- [ ] F4: Multi-effect hover ordering is duration-aware and readable.

## G. Queue and Commit
- [ ] G1: Queue modal contains only commit-critical controls and data.
- [ ] G2: Resolution order shown in queue matches actual engine resolution order.
- [ ] G3: `CANCEL` returns without rewriting existing queued actions.
- [ ] G4: Timeout before commit results in pass for uncommitted actions.

## H. Information Authenticity
- [ ] H1: Hidden enemy intent is never surfaced as explicit predictive UI.
- [ ] H2: Public tactical state is visible without opening secondary planning surfaces.
- [ ] H3: If combat log is present, it is secondary and does not dominate board hierarchy.

## I. Design System Compliance
- [ ] I1: Battle visuals remain in Cursed Arena token palette and typography.
- [ ] I2: Red CTA count remains constrained (single dominant red action).
- [ ] I3: Spacing follows 8px grid discipline in battle core panels.

## J. Regression Safety
- [ ] J1: Automated tests cover pip grouping payload mapping from engine state.
- [ ] J2: Automated tests cover hover payload accuracy for at least one stack and one timed effect.
- [ ] J3: Automated tests/assertions enforce no-scroll skill strip and fixed-height skill detail behavior.
