# Cursed Arena Prep + Battle Contract (Authoritative)

Status: authoritative  
Effective date: 2026-04-24  
Version: v2 (replaces v1 content)

## Authority
This file is the single source of product truth for:
- Battle Prep screen UX
- Prep-to-Battle handoff behavior
- Battle screen interaction parity
- Queue commit semantics

If another document conflicts with this one, this one wins.

## Research Baseline (Round 2)
Parity targets were re-checked against Naruto-Arena references:
- Selection and in-game manual: https://narutoarena.fandom.com/wiki/The_Basics
- Selection screenshot: https://static.wikia.nocookie.net/narutoarena/images/5/55/Selection.jpg/revision/latest?cb=20181230050046
- In-battle screenshot: https://static.wikia.nocookie.net/narutoarena/images/9/9e/Inbattle.jpg/revision/latest?cb=20181230052211
- Queue/chakra commit screenshot: https://static.wikia.nocookie.net/narutoarena/images/7/71/Chakraselection.jpg/revision/latest?cb=20181230054408
- Manual mirror with section labels and behavior notes: https://naruto-arenaonline.blogspot.com/2012/01/selection-screen-first-thing-you-will.html
- Classic client footprint signal (community tooling): https://www.reddit.com/r/NarutoArena/comments/1salcd7/i_built_a_minimal_browser_extension_for_naruto/

## Core Product Goal
Players coming from Naruto-Arena should immediately recognize the prep-to-battle rhythm.

The experience must be:
- familiar in structure and flow
- cleaner and more polished visually
- still unmistakably Cursed Arena

## Scope
In scope:
- prep layout and interaction model
- mode selection and team assembly flow
- state handoff into battle
- in-battle board readability and queue semantics
- passive/effect pip presentation

Out of scope:
- roster balance
- matchmaking/ranking economy changes
- VFX-heavy polish

## Prep Screen Contract

### 1) Layout Priorities
Prep screen must prioritize these regions in order:
1. team slots (always visible)
2. roster selection grid/list
3. selected character details
4. selected skill details
5. mode controls (`LADDER`, `QUICK`, `PRIVATE`, `PRACTICE`)

### 2) Team Assembly Rules
- Team is always exactly 3 slots.
- Start button is only enabled when all 3 slots are filled.
- Assigning a character to a full team replaces the focused slot or explicit slot target.
- Clearing/replacing slots never opens modal confirmations.

### 3) Character + Skill Inspection
- Selecting a character updates identity and skill detail panes immediately.
- Skill info panel shows name, cost, classes, cooldown, and description in a stable fixed-height panel.
- No layout jump when moving between short and long skill descriptions.

### 4) Prep Familiarity Targets
Preserve NA-style familiarity with Cursed Arena styling:
- explicit mode buttons grouped near primary CTA
- always-visible three-slot team assembly surface
- clear "choose character, inspect skills, start match" rhythm

## Prep -> Battle Handoff Contract

### 5) Session Data Authority
Prep must stage one session payload containing at minimum:
- mode
- player team ids
- enemy team ids (or matchmaking-resolved ids)
- battle seed
- opponent metadata
- practice options

Battle page must consume this staged payload as the launch source.

### 6) Publish and Asset Visibility
- Portraits/icons used in prep and battle must use shared URLs, not local file paths.
- Live publish is valid only when content is persisted remotely (Supabase path).
- "Local-only publish" must not be represented as global/live.

### 7) Consistency Requirement
- What player sees in prep must match what appears in battle for the same selected roster content.
- No hidden team rewrites between prep confirmation and battle load.

## Battle Screen Contract

### 8) Stable Geometry
- Battlefield vertical position never shifts during normal interaction.
- Technique detail region uses fixed height.
- Skill text length must not resize the battle shell.

### 9) Skill Strip Rules
- Skill strip shows usable actions only.
- Passives are not selectable strip slots.
- Skill strip must never scroll.

### 10) Passive and Effect Pips
- Passive and status effects render as pips near portraits.
- Effects are grouped by source skill.
- Opening board shows only always-on passive pips; triggered stacks appear only after gaining them.
- Pip visual weight remains reduced (size, border intensity, glow intensity).

### 11) Pip Hover Accuracy
Hover content must include:
- source skill name
- exact gameplay effect lines
- duration/turns-left per effect when applicable
- ordered multi-line presentation by duration/state clarity

Generic filler copy (e.g. "This is a passive") is forbidden.

### 12) Commit and Queue Semantics
- `PRESS WHEN READY` opens final commit only.
- Queue modal is not a second planning interface.
- Queue modal displays already-selected actions, resolution order, cost assignment controls, `OK`, and `CANCEL`.
- `CANCEL` returns to board with queued actions intact.
- Timeout before final commit turns uncommitted actions into pass behavior.

### 13) Information Authenticity
- Show only legitimately visible tactical information.
- Never expose hidden enemy intent summaries.
- Board should communicate outcomes through direct state changes, not decorative explanation overlays.

### 14) Combat Log Priority
- Combat log is optional.
- If present, it is secondary to board clarity and must not dominate hierarchy.

## Visual Translation Rules
- Preserve Cursed Arena token system and typography.
- Keep one dominant red CTA per viewport.
- Maintain compact NA-like tactical density with CA dark aesthetic.

## Longevity Guardrails
- Keep deterministic mapping from engine effect state to pip/hover payload.
- Keep queue order and commit state as single-source runtime truth.
- Use explicit tokens for pip sizing and battle panel geometry.
- Gate releases via checklist.

## Required Gate
Every Prep/Battle PR must pass:
- [battle-contract-v1-checklist.md](./battle-contract-v1-checklist.md)
