# Cursed Arena Battle Board Spec

> Core gameplay target: [battle-contract-v1.md](./battle-contract-v1.md)

## Goal
Convert the current battle screen from a cinematic stage layout into a Naruto-Arena-style combat board while preserving Cursed Arena's visual language, battle engine, and design tokens.

The target result is:
- board-first, not character-showcase-first
- compact and information-dense
- fast to read during targeting and action queueing
- visually native to Cursed Arena, not a Naruto skin transplant

## Non-Goals
- Do not rewrite combat resolution unless later steps explicitly change rules.
- Do not replace the existing 3v3 simultaneous round structure.
- Do not introduce a bright anime UI palette.
- Do not build final art production assets in this step.

## Source Comparison
The current screen in [src/pages/BattlePage.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/pages/BattlePage.tsx) is split into:
- a large cinematic center stage
- three ally cards on the left
- three enemy cards on the right
- a large footer ability table
- a right-side detail panel
- a toggleable feed drawer

Naruto-Arena's structure is different:
- compact player bars across the top
- three stacked ally combat rows on the left
- three stacked enemy combat rows on the right
- a horizontal ability strip per character
- a persistent lower-left info panel
- a persistent lower-right quick battle/chat panel

The refactor should copy Naruto-Arena's board logic and density, not its bright presentation.

## Board Layout
The battle screen should remain full-viewport and shell-less at `/battle`, but its internal layout should become a single compact board.

### Region 1: Top Battle Strip
Height target: `72px` to `88px`.

Content:
- Left player identity block
- Center command status block
- Team resource display
- Timer display
- Single red `PRESS WHEN READY` CTA
- Right player identity block

Behavior:
- Player blocks remain anchored left and right.
- The ready button stays center-dominant.
- Resource pips and timer are always visible without modal interaction.
- Battlefield/domain info becomes a small inline badge in this strip, not a floating stage callout.

### Region 2: Main Board
Height target: roughly `55%` to `60%` of viewport after top strip.

Structure:
- Left lane for the player's three fighters
- Right lane for the enemy's three fighters
- Middle gutter reserved for board atmosphere, target cues, and spacing

Each fighter row contains:
- Square portrait tile
- Compact HP display
- Name and small metadata
- Inline ability strip with four fixed slots
- Status indicators
- Queued/selected/disabled state

Important rule:
- Remove the giant featured ally and enemy portraits entirely.
- Full-body art can remain as a low-opacity atmospheric background layer only.

### Region 3: Bottom Utility Band
Height target: `220px` to `280px`.

Split:
- Bottom-left selected-character panel
- Bottom-right quick battle log panel

Bottom-left panel:
- selected fighter portrait
- name, rarity, role
- short bio or flavor text
- status chips
- hovered or selected ability details
- energy cost and cooldown detail

Bottom-right panel:
- persistent round log
- most recent actions
- compact scroll area
- optional input stub later if chat is ever implemented

Important rule:
- The battle feed drawer becomes a permanent log panel.
- The current right-side hover detail card is absorbed into the lower-left info panel.

## Exact Board Regions
All spacing should remain on the 8px grid.

### Desktop Region Map
- Outer page padding: `12px` to `16px`
- Board shell radius: `16px`
- Top strip: full width
- Main board columns:
- left combat lane: `minmax(420px, 1fr)`
- center atmosphere gutter: `96px` to `160px`
- right combat lane: `minmax(420px, 1fr)`
- Bottom utility band columns:
- info panel: `minmax(420px, 1.1fr)`
- log panel: `minmax(320px, 0.9fr)`

### Per-Row Composition
- Portrait tile: `72px` to `88px` square
- Ability strip: four equal slots
- Row min height: `92px` to `112px`
- HP display should be readable without opening any detail panel

### Tablet Fallback
- Narrow the center gutter first
- Reduce row height second
- Keep ally and enemy lanes side-by-side until it becomes unreadable

### Mobile Fallback
- Stack ally rows, enemy rows, then utility panels
- Maintain board semantics
- Do not reintroduce cinematic large-character framing

## Component Tree
This tree is the target architecture, not the exact first commit.

```text
BattlePage
  BattleViewport
    BattleBackdrop
    BattleTopBar
      BattlePlayerBadge
      BattlePhaseHeader
      BattleResourceBar
      BattleTimer
      BattleReadyButton
      BattlePlayerBadge
    BattleBoard
      BattleLane team="player"
        BattleRow x3
          BattlePortraitSlot
          BattleVitals
          BattleAbilityStrip
            BattleAbilitySlot x4
          BattleRowState
      BattleBoardCenter
        BattleAtmosphere
        BattleTargetPrompt
      BattleLane team="enemy"
        BattleRow x3
          BattlePortraitSlot
          BattleVitals
          BattleAbilityStrip
            BattleAbilitySlot x4
          BattleRowState
    BattleBottomPanels
      BattleInfoPanel
      BattleLogPanel
```

## State Mapping
The existing battle state is already close to what the new board needs. Most work is presentation and interaction remapping.

### Existing State To Reuse
- `battle.state.playerTeam`
- `battle.state.enemyTeam`
- `battle.queued`
- `battle.selectedActorId`
- `selectedAbilityId`
- `selectedTargetId`
- `latestEvents`
- `turnSecondsLeft`
- `commitReady`
- `validTargetIds`
- `getCommandSummary(...)`
- `getCooldown(...)`
- `canQueueAbility(...)`
- `getAbilityById(...)`
- `getValidTargetIds(...)`

### UI Mapping
- Current left `SideRosterCard` state maps to `BattleRow` identity, HP, active state, and ally targeting state.
- Current right `SideRosterCard` state maps to enemy row targeting state.
- Current footer `AbilityRow` becomes the inline `BattleAbilityStrip` inside each row.
- Current `HoverDetailPanel` content maps to the new `BattleInfoPanel`.
- Current `FeedDrawer` events map to the persistent `BattleLogPanel`.
- Current selected ability banner maps to row-level highlights and target prompts.
- Current featured ally/enemy stage cards are removed from the interaction model.

### New Derived UI State
- `inspectedFighterId`
- this should resolve as hovered fighter, else selected actor, else first living ally
- `inspectedAbilityId`
- this should resolve as hovered ability, else selected ability, else queued ability if useful
- `rowMode`
- values like `idle`, `selected`, `queued`, `targetable`, `disabled`, `ko`
- `boardPrompt`
- values like `Select Technique`, `Pick Enemy`, `Pick Ally`, `Ready to Resolve`

### State That Should Be Simplified
- `feedOpen`
- remove once the log becomes persistent
- `endTurnOpen`
- remove when the ready flow no longer uses a confirmation modal

## What Gets Removed
- Giant ally featured stage portrait
- Giant enemy featured stage portrait
- Floating battlefield panel inside the stage
- Toggle battle feed drawer button
- Footer-wide ability table layout
- Right-side hover detail card as a standalone region
- Floating selected-ability status pill
- End-turn confirmation modal, unless retained temporarily during transition

## What Gets Reused
- Battle engine in [src/features/battle/engine.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/engine.ts)
- Battle energy logic in [src/features/battle/energy.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/energy.ts)
- Battle data roster in [src/features/battle/data.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/data.ts)
- Existing selection and target queueing logic in [src/pages/BattlePage.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/pages/BattlePage.tsx)
- Existing status derivation from `getStatusPills(...)`
- Existing progress bar utility where helpful
- Existing design tokens from [src/styles/tokens.css](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/styles/tokens.css)

## What Gets Added
- Small board portrait assets or derived crops
- Real or placeholder ability icon fields
- Info panel biography or flavor fields
- Dedicated battle UI component set
- Persistent combat log panel
- Row-level status and queue markers
- Inline battlefield/domain badge in the top strip
- More explicit selected, targetable, and disabled row/slot states

## Visual Direction Rules
- Keep the dark purple-undertone background scale from the existing design system.
- Keep teal as the dominant system accent.
- Keep red rare and reserved for the ready CTA, damage, and urgent targeting emphasis.
- Avoid bright green Naruto health boxes. HP should use Cursed Arena tones.
- Use Bebas Neue for display labels and buttons.
- Use JetBrains Mono for combat metadata.
- Use Noto Sans for descriptions.
- The board must feel tighter and more tactical than the current page.
- Motion should be subtle and functional. No cinematic drift or large glow theatrics.

## Interaction Rules
- Clicking a player row selects that actor.
- Clicking an ability in that row starts targeting or instantly queues if no manual target is needed.
- Valid targets highlight directly on eligible rows and portraits.
- Queued actions must be visible directly on each acting row.
- Disabled abilities must show cooldown or unusable state clearly.
- Hovering an ability updates the lower-left info panel.
- Pressing ready resolves immediately when all living allies have actions queued.
- Dead fighters remain visible in-place with muted KO styling.

## Data Additions Needed
These should be added in a later implementation step.

### Fighter Data
- `portraitSrc`
- `bio`
- `affiliationLabel`
- `battleTitle` or `descriptor`

### Ability Data
- `iconSrc`
- optional `shortLabel` if the icon needs a fallback two-letter marker

### Optional UI Metadata
- `playerBadgeTitle`
- `teamLabel`
- `boardAccent`

## File-By-File Implementation Plan

### 1. Spec File
Create and maintain this file:
- [reference/battle-board-spec.md](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/reference/battle-board-spec.md)

### 2. Battle Page Orchestrator
Refactor:
- [src/pages/BattlePage.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/pages/BattlePage.tsx)

Responsibilities after refactor:
- own battle page state
- wire engine and event flow
- pass derived props into smaller presentation components
- stop containing most rendering details directly

### 3. New Battle UI Components
Expected new files:
- `src/components/battle/BattleTopBar.tsx`
- `src/components/battle/BattleBoard.tsx`
- `src/components/battle/BattleLane.tsx`
- `src/components/battle/BattleRow.tsx`
- `src/components/battle/BattlePortraitSlot.tsx`
- `src/components/battle/BattleAbilityStrip.tsx`
- `src/components/battle/BattleAbilitySlot.tsx`
- `src/components/battle/BattleInfoPanel.tsx`
- `src/components/battle/BattleLogPanel.tsx`
- `src/components/battle/BattleStatusChips.tsx`

These files should absorb the layout and display logic currently living in `BattlePage.tsx`.

### 4. Battle Types
Extend:
- [src/features/battle/types.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/types.ts)

Likely additions:
- portrait and icon metadata fields
- optional info panel text fields
- small helper UI types if needed

### 5. Battle Data
Extend:
- [src/features/battle/data.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/data.ts)

Likely additions:
- portrait placeholders
- ability icon placeholders
- biography text
- top-bar profile metadata if the page should stop hardcoding it

### 6. Engine
Keep stable first:
- [src/features/battle/engine.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/engine.ts)

Later only if needed:
- remove modal-dependent flow assumptions
- support richer event labeling for the persistent log

### 7. Energy System
Keep stable first:
- [src/features/battle/energy.ts](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/features/battle/energy.ts)

Later audit:
- whether the existing rotating resource model should gain a Naruto-Arena-like exchange interaction

### 8. Shared Styles
Possibly extend:
- [src/styles/tokens.css](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/styles/tokens.css)

Only add tokens if the current set is insufficient. Prefer existing variables.

## Implementation Sequence

### Phase 1: Stabilize Architecture
- extract battle-specific components from `BattlePage.tsx`
- keep behavior unchanged
- confirm build and lint remain clean

### Phase 2: Add Missing Data
- add portrait, icon, and bio fields
- use placeholders where production art is missing
- confirm build and lint remain clean

### Phase 3: Replace Layout Skeleton
- implement top strip
- implement board lanes and row layout
- implement bottom utility band
- remove giant stage windows and footer table

### Phase 4: Reconnect UX
- reconnect selection
- reconnect targeting highlights
- reconnect queued state display
- reconnect info panel and persistent log

### Phase 5: Cleanup
- remove dead components and obsolete layout helpers
- audit spacing and responsiveness
- tune typography and contrast

## Acceptance Criteria
- The battle screen reads as a tactical board within one glance.
- Each of the six fighters occupies a single clear board row.
- Abilities are selected inline from the acting fighter's row.
- Selected ability details appear in the lower-left panel.
- Combat events are always visible in the lower-right panel.
- No giant featured character windows remain.
- The battle still supports target selection, queueing, readiness, and round resolution.
- The page still feels like Cursed Arena.

## Risks And Unknowns
- The current project does not appear to include dedicated square portraits or true skill icons, so placeholders or generated crops will be needed early.
- [src/pages/BattlePage.tsx](c:/Users/breed/OneDrive/Documents/cursed-arena-main/cursed-arena/src/pages/BattlePage.tsx) is large and currently owns too much UI logic, so layout rewrites without extraction will be brittle.
- Chakra parity is now a gameplay requirement, not a later optional change. The battle UI should assume random round gain, carryover, and 5-for-1 exchange.
- The current fighter data includes `ce/maxCe`, but the visible battle UI is driven by shared team energy. That mismatch may need cleanup in a later pass.
- Responsive behavior will require deliberate design because Naruto-Arena's original layout assumes a wide desktop canvas.

## Decision Summary
This refactor should be treated as:
- architecture extraction first
- board layout rewrite second
- interaction remapping third
- optional resource-system redesign last

That order keeps the existing combat logic intact while moving the visual and UX model much closer to Naruto-Arena.
