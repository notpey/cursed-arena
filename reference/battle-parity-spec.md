# Cursed Arena Battle Parity Spec

## Purpose
This document freezes the target battle experience for Cursed Arena before more UI polish, content work, or character expansion continues.

Execution companion:
- [battle-roadblocks-workstreams.md](C:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/reference/battle-roadblocks-workstreams.md)

The goal is not "inspired by Naruto-Arena."

The goal is:
- match Naruto-Arena's battle cadence
- match Naruto-Arena's battle readability
- match Naruto-Arena's turn commitment flow
- preserve Cursed Arena's art direction, lore, and data model where possible

This is the path of least resistance with the highest quality because it reduces rework:
- content work stops fighting unstable UX
- engine work stops drifting from the intended feel
- UI work gets a fixed behavioral target

## Scope
This spec covers:
- battle flow
- command selection
- queue behavior
- timer behavior
- information visibility
- event presentation
- board interaction rules
- parity acceptance criteria

This spec does not cover:
- roster balance
- final VFX or polished animation production
- final matchmaking/ranking economy
- character release cadence
- non-battle screens

## Source Basis
This spec is based on:
- Naruto-Arena's public battle manual flow, especially in-game screen and end-turn queue behavior
- the current Naruto-Arena Classic site being live as of March 29, 2026
- the existing internal docs in this repo

Sources:
- https://narutoarena.fandom.com/wiki/The_Basics
- https://www.naruto-arena.site/
- https://www.naruto-arena.site/news/major-update-160

Important limitation:
- Chakra parity has now been locked from direct player confirmation of the live rules we are targeting.
- Public site documentation was still unclear, but implementation should follow the verified rules below.

## Design Principle
The battle screen must feel like a tactical workspace, not a cinematic scene.

The player should always feel:
- what state the battle is in
- which units can act
- what has been queued
- what each skill costs
- what targets are legal
- what just happened

The player should never feel:
- interrupted by decorative overlays
- forced through extra confirmation layers
- unsure whether an action is really queued
- told hidden opponent information
- delayed by fake pacing

## Locked Parity Rules

### 1. Turn Structure
Battle flow is sequential, not simultaneous.

The per-round structure is:
1. Round start and upkeep resolve.
2. First player chooses actions for all living units.
3. First player presses `PRESS WHEN READY`.
4. First player's queued actions resolve immediately.
5. Second player sees the updated board state.
6. Second player chooses actions for all living units.
7. Second player presses `PRESS WHEN READY`.
8. Second player's queued actions resolve immediately.
9. Round cleanup resolves.
10. Next round begins.

The side that opens the match remains the opening side for the entire match.

### 2. Board Stability
The board is the primary surface.

The battle should not repeatedly leave the board for:
- round splash overlays
- cinematic transition overlays
- informational full-screen interruptions
- hidden secondary control flows

Allowed overlays:
- match result
- hard disconnect/error state
- waiting for opponent before match start

Not allowed during normal turn flow:
- "round transition" splash panels
- enemy-turn dramatization overlays
- modal-like narration of routine battle state

### 3. Command Selection Model
Each living fighter chooses exactly one action per turn.

That action is represented on the board immediately after selection.

Selection flow:
1. Click a fighter row.
2. Click one of that fighter's four skill slots.
3. If the skill requires a target, valid targets highlight directly on the board.
4. Click the target.
5. The action is now queued.

If a skill does not require manual targeting, it queues immediately.

### 4. Deselect and Change Rules
Queued actions must be easy to undo.

Locked rules:
- clicking a queued slot removes that queued action
- reselecting another skill for the same fighter replaces the old queued action
- canceling out of the queue confirmation screen returns to the board without committing

Target parity note:
- classic Naruto-Arena documentation describes removing a used skill directly from the board
- exact double-click parity is not required if single-click removal is faster and clearer
- the important parity is low-friction de-queueing

### 5. Ready Button Semantics
`PRESS WHEN READY` is a commit action, not a planning action.

It should only do one thing:
- open the final queue confirmation screen if the player's turn is fully specified

It should not:
- begin a second layer of decision-making
- hide core state that should have been visible on the board already
- transform the turn into a different interaction model

### 6. Queue Screen Semantics
The queue screen exists to finalize an already-built turn.

It must contain:
- the already queued actions
- their current order
- explicit cost visibility
- explicit random-energy assignment when needed
- `OK`
- `CANCEL`
- the live turn timer

It must not become a second planning UI.

Locked behavior:
- no new targeting starts inside the queue screen
- no hidden auto-rewrites of chosen actions
- no abstract summary that hides which fighter is doing what

### 7. Queue Ordering
Queued actions resolve in visible order from left to right.

The queue confirmation screen is where the player reorders actions.

Ordering rules:
- only actually queued actions appear
- pass actions do not need to consume visual priority
- drag and drop or equivalent reorder interaction is allowed
- the visible order must be the actual resolution order

### 8. Timer Rules
The turn timer is always visible during command selection and queue confirmation.

Locked rules:
- the queue screen does not pause the timer
- the timer should be consistent everywhere it appears
- timeout behavior must be deterministic and documented

Required timeout behavior:
- if the player times out before final queue confirmation, the turn is canceled and becomes a pass turn
- if only part of the turn was specified but not committed, those uncommitted actions do not execute

This mirrors the public Naruto-Arena manual more closely than auto-locking unresolved queued actions.

### 9. Information Visibility
The player should see all public tactical information directly on the board.

Always visible:
- HP
- active statuses
- cooldown/unusable state
- selected skill
- valid targets
- queued action per unit
- available team energy/chakra
- timer
- combat log

Never visible if it is hidden information:
- explicit enemy intent summaries
- predictive "pressure" text describing opponent choices
- hidden internal AI knowledge

### 10. Event Presentation
Resolution should feel immediate and literal.

The game should present battle results as a short event timeline on the stable board.

Required presentation rules:
- actions resolve one event beat at a time
- affected rows update in place
- HP bars tick on impact
- status icons appear when applied
- KO state appears when a fighter dies
- the combat log appends as events occur

Not allowed:
- one hardcoded pause between large hidden batches of state
- the whole board visually acting as if it changed all at once

### 11. Chakra Rules
The battle uses Naruto-Arena-style shared chakra, not a bespoke focus system.

Locked rules:
- each side gains 1 random chakra per living character at round start
- unused chakra carries between rounds
- no chakra cap applies
- no focus, bias, or preselected preferred type exists
- the opening player starts the match with 1 random chakra
- the second player starts the match with normal distribution based on living characters
- a player may exchange 5 chakra of any types for 1 chakra of a chosen type
### 12. Log Panel
The battle log is persistent.

Locked rules:
- the log is a fixed panel on the battle screen
- it is not a drawer
- it should show recent actions in readable chronological order
- it should support reading what just happened without leaving the board

### 13. Layout Priority
Battle layout priority is:
1. fighter rows
2. skill readability
3. queue clarity
4. HP and statuses
5. timer and resources
6. combat log
7. flavor and atmosphere

If space gets tight, atmosphere loses first.

### 14. Visual Tone
The game should look like Cursed Arena, not like Naruto-Arena skinned directly.

Locked visual translation:
- keep the current dark, purple-undertone design system
- keep teal as primary system accent
- keep red rare and meaningful
- keep Bebas Neue / JetBrains Mono / Noto Sans usage
- avoid bright arcade color treatment

What must transfer is the interaction model and density, not the original color palette.

## Locked Product Decisions

### Decision A: We are targeting interaction parity before content parity
This means:
- queue behavior before roster depth
- board cadence before new characters
- event readability before animation polish

### Decision B: The battle board must be the source of truth
This means:
- queued state should live on rows
- action legality should be legible from rows
- the lower panels support the board instead of replacing it

### Decision C: "Feel" issues are treated as systems issues
This means:
- fake pacing is a bug
- hidden state changes are a bug
- unnecessary overlays are a bug
- wrong commitment semantics are a bug

## Current Known Mismatches
These are the current gaps this spec is meant to close.

1. The queue modal currently behaves like a second planning system instead of a final commit step.
2. Routine overlays interrupt the board.
3. Enemy intent is exposed even though it should be hidden.
4. Event resolution is batched in a way that feels synthetic.
5. Timer semantics are inconsistent.
6. Chakra parity needed to be locked and propagated through both UI and engine behavior.

## Acceptance Criteria
The battle experience is considered parity-ready when all of the following are true.

### Interaction
- A player can understand the turn state without opening any secondary panel.
- A player can queue, replace, or remove actions directly from fighter rows.
- Valid targets are obvious and only legal targets highlight.
- Pressing `PRESS WHEN READY` feels like commit, not another planning stage.

### Queue
- The queue screen shows only already chosen actions.
- The queue order matches actual resolution order.
- Random resource assignment is explicit and understandable.
- Cancel returns the player to the board without hidden side effects.

### Tempo
- Resolution occurs as a readable event timeline.
- No decorative overlay interrupts normal turn flow.
- No hidden batch update causes the board to jump abruptly.

### Information
- Public information is always visible.
- Hidden opponent information is never surfaced.
- The log is persistent and readable.

### Confidence
- A player familiar with Naruto-Arena can immediately recognize the tactical rhythm.
- A new player can learn the battle loop from the screen itself.

## Implementation Order
This is the recommended build order because it minimizes rework.

### Phase 1. Freeze the board contract
- remove enemy intent visibility
- remove normal-flow round transition overlay
- remove nonessential routine turn overlays
- keep only critical-state overlays

### Phase 2. Fix command semantics
- keep queued actions visible on the board
- make row interactions the primary command surface
- make `PRESS WHEN READY` open only a final confirmation queue
- document timeout as cancel-to-pass if not committed

### Phase 3. Rewrite the queue screen around literal parity
- show the exact queued actions
- show exact left-to-right resolution order
- keep timer visible
- keep random resource assignment explicit
- simplify any abstraction that hides actual action ownership

### Phase 4. Build an event timeline presenter
- resolve events in readable beats
- update rows locally as events occur
- append log entries in sync with those beats

### Phase 5. Lock chakra parity
- remove the focus mechanic entirely from live battle flow
- align opening-turn chakra and round refresh to the locked parity target
- add the 5-for-1 chakra exchange interaction
- mirror event playback for multiplayer so chakra spends do not visually jump

## Locked Resource Model
The chakra model is no longer provisional.

Implementation must preserve:
- random chakra generation by living-character count
- opening-player 1 chakra start
- second-player normal start
- carryover between rounds
- 5-for-1 targeted exchange

Implementation must not reintroduce:
- focus selection
- guaranteed matching refresh pips
- bespoke bias systems without an explicit product decision

## Repo Impact
This spec should govern changes to:
- [src/pages/BattlePage.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/pages/BattlePage.tsx)
- [src/components/battle/BattleBoard.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/components/battle/BattleBoard.tsx)
- [src/components/battle/BattleTopBar.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/components/battle/BattleTopBar.tsx)
- [src/components/battle/BattleAbilityStrip.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/components/battle/BattleAbilityStrip.tsx)
- [src/components/battle/BattleInfoPanel.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/components/battle/BattleInfoPanel.tsx)
- [src/features/battle/energy.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/energy.ts)
- [src/features/battle/engine.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/engine.ts)

## Immediate Next Step
After this spec is accepted, the next implementation target should be:
- queue semantics first

That means:
- make the board own command building
- strip the queue screen down to final confirmation
- remove hidden information and normal-flow overlays at the same time

Those changes will produce the largest improvement in perceived authenticity with the least total rework.
