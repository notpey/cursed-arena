# Internal Playtest Readiness — Phase 8

**Status:** READY FOR INTERNAL PLAYTESTING  
**Date:** 2026-05-17  
**Scope:** Practice mode (vs AI), desktop browser

---

## Readiness Checklist

### 1. Roster and Team Setup

| Item | Status | Notes |
|------|--------|-------|
| All 24 authored fighters in roster | ✅ | Confirmed in `src/features/battle/data.ts` lines 74–99 |
| Missing portrait fallback | ✅ | Falls back to fighter initial letter; no broken UI |
| Missing ability icon fallback | ✅ | Falls back to icon label abbreviation |
| Team size rule enforced (exactly 3) | ✅ | Enforced in `prep.ts`; Submit blocked until 3 selected |
| Duplicate fighter prevention | ✅ | Deduped in `sanitizePrepTeamIds()`; UI redirects focus to existing slot |
| Team persists in localStorage | ✅ | Key `'ca-battle-prep-selection-v1'` |
| Battle can start from valid team | ✅ | Practice mode via `createPracticeSession()` → `/battle` |

### 2. Battle Initialization

| Item | Status | Notes |
|------|--------|-------|
| Both teams load correctly | ✅ | `createInitialBattleState()` instantiates both teams |
| Null-safe fighter lookup | ✅ | `instantiateTeam` filters null entries |
| HP / energy / cooldowns initialize correctly | ✅ | All set in `stateFactory.ts` / `engine.ts` |
| Round 1 / `firstPlayerCommand` phase on start | ✅ | Confirmed |
| If enemy goes first, AI resolves first turn automatically | ✅ | Handled in `createNewBattle()` |
| No undefined/null display on first load | ✅ | All rendering is null-safe; portrait/icon fallbacks present |

### 3. Skill Usability

| Item | Status | Notes |
|------|--------|-------|
| Usable skills appear usable | ✅ | Normal border, hover lift |
| Unusable skills appear locked | ✅ | `opacity-42 grayscale` + lock tooltip on hover |
| Cooldown shows as large number overlay | ✅ | Large centered number + "TRN" sub-label |
| Block reason is shown | ✅ | Hover tooltip on tile AND STATUS field in info panel |
| Energy cost visible on skill tile | ✅ | Bottom-right badge; "FREE" when no cost |
| STUNNED overlay appears on strip | ✅ | Full-strip overlay when fighter is stunned |
| Selected skill state is clear | ✅ | White border + scale + `animate-ca-soft-pop` |

### 4. Targeting

| Item | Status | Notes |
|------|--------|-------|
| Valid targets pulse gold | ✅ | `animate-ca-target-pulse` + "TARGET" label badge |
| Invalid targets dim (enemy inspect only) | ✅ | Non-valid targets get no pulse |
| AoE / self / no-target skills queue without target prompt | ✅ | Handled in `handleSelectAbility` |
| Single-target skills enter targeting mode | ✅ | `selectedAbilityId` set; top bar shows "TARGET ENEMY WITH X" |
| Queued target visible before commit | ✅ | `QUE` badge on skill tile + portrait `RDY` badge |
| Dequeue by clicking queued actor or `QueuedSlot` | ✅ | `clearQueuedAction` on actor click or slot click |

### 5. Turn Flow

| Item | Status | Notes |
|------|--------|-------|
| Phase bar shows current phase | ✅ | `BattlePhaseBar` with teal/red accent |
| Sub-message always visible | ✅ | Fixed in Phase 7 (removed `sm:block` gate) |
| "PRESS WHEN READY" button active when queue complete | ✅ | `commitReady` gate; disabled when locked or no units |
| Pass-turn if no actions queued | ✅ | "No actions queued" event fires and turn passes |
| Turn timer (60s) present | ✅ | Timer bar + countdown + auto-timeout |
| Resolution lock (LOCKED label, disabled controls) | ✅ | `timelineLocked` disables all interaction |
| Cooldowns and HP update visibly after resolution | ✅ | Per-step state commits in `playTimelineSteps` |
| AI takes its turn automatically | ✅ | `buildEnemyCommands` after player commits |
| Practice turn log (draggable overlay) | ✅ | Shows every event: damage, status, resource, delayed |

### 6. Enemy Skill Inspection

| Item | Status | Notes |
|------|--------|-------|
| Click enemy portrait to inspect | ✅ | `onInspectEnemy` callback |
| Enemy skill panel shows skill row | ✅ | Expanded `EnemySkillIcon` cards (Phase 7) |
| Each skill card shows name, cooldown, cost | ✅ | Added in Phase 7 |
| Hovering / clicking skill shows description | ✅ | `BattleInfoPanel` center section |
| "ENEMY — READ ONLY" label visible | ✅ | Red chip in panel header |

### 7. Status / Effect Display

| Item | Status | Notes |
|------|--------|-------|
| Portrait badge labels readable | ✅ | STUN, INVUL, CNTR, RFLT, MARK, AFFL, IMMU, etc. (Phase 7) |
| Badge `title` hover text is descriptive | ✅ | All expanded in Phase 7 |
| Active effect pips show on hover | ✅ | Rich tooltip with effect name, lines, duration |
| Stack counts visible on pips | ✅ | Top-right overlay on pip square |
| HP flash on damage / heal / shield-break | ✅ | Red / emerald / white flash animations |
| Stun shimmer on stunned portrait | ✅ | Amber overlay animation |

### 8. Match Completion

| Item | Status | Notes |
|------|--------|-------|
| Victory / Defeat / Draw detected correctly | ✅ | `getWinner()` checks all-dead on each team |
| `BattleResultOverlay` appears on finish | ✅ | Covers full screen, shows team survival summary |
| Practice mode: "Practice results are not recorded" shown | ✅ | Fixed in Phase 8 |
| Practice mode: "View Results" button hidden | ✅ | Fixed in Phase 8; only "Play Again" and "Home" shown |
| Non-practice: "View Results" → `/battle/results` | ✅ | Full results page with XP/level/history |
| "Play Again" → `/battle/prep` | ✅ | Returns to team selection |
| Surrender confirm dialog | ✅ | Practice: explains no ladder penalty; returns to prep |

---

## Known Non-Blocking Limitations

These are known gaps that do not block first playtest but should be noted.

| Limitation | Impact | Notes |
|-----------|--------|-------|
| Sound volume slider in utility rail is decorative | Low | Slider bar does not respond to drag; use system audio or Settings page |
| Queue commit modal requires "random energy" allocation for skills with `random` cost | Medium | New players may be surprised by the allocation step; the modal explains it |
| AI (practice mode) plays a fixed greedy strategy | Low | Enemy team will not use complex setup/payoff combos well; testers should notice this is a dummy AI |
| Online / ranked / private match modes require authentication | Out of scope | Playtest uses practice mode only |
| Fighter portraits are not all final art | Low | Placeholder initials appear for fighters without a portrait asset; functionality is unaffected |
| `BattleResultsPage` (full results page) will show "No Match Recorded" if visited directly after a practice match | Low | Fixed in Phase 8: "View Results" button is now hidden for practice matches; only accessible from non-practice matches |
| `PracticeTurnLogOverlay` may obscure bottom-left content on small viewports | Low | Overlay is draggable; can be repositioned or collapsed |
| "OPEN CHAT" button was a non-functional stub | Fixed | Removed in Phase 8 |

---

## Recommended Internal Playtest Teams

These teams are selected to cover the major mechanical archetypes. Use **Practice Mode** with the player controlling one team and the AI controlling the other. For best results, test with two humans by having one player use the "no AI" practice mode variant (if available) and alternate turns.

### Team 1 — Basic Aggression
**Yuji / Nobara / Nanami**
- Covers: direct damage, affliction, delayed follow-up, basic energy management
- Good entry point for new testers; all skills resolve immediately or with clear 1-turn delays

### Team 2 — Setup and Payoff
**Megumi / Nobara / Yuji**
- Covers: Shikigami stacking and recall, Straw Doll stacking, Black Flash charge threshold
- Tests that setup indicators (MARK badge, pip tooltips) are readable before payoff

### Team 3 — Protection and Interference
**Kechizu / Eso / Nanami**
- Covers: Rot stacking (counter stacks), `Connected Souls` intercept, `Chomp` intent lock, Corrosive Blood
- Tests that LOCK/SEAL badges and counter pips communicate clearly

### Team 4 — Defense and Field Control
**Jogo / Ijichi / Yaga**
- Covers: Scorched field stacking via passive, `Regulated Space` round-start passives, `Cursed Corpse` shield + counter-attack, multi-target affliction damage
- Tests delayed-effect pips (DLY badge) and passive fire indicators

### Team 5 — Invulnerability and Reflect
**Gojo / Maki / Shoko**
- Covers: `Infinity` invulnerability + reflect, `Weapon Bonus` scaling, `Reverse Cursed Technique` healing
- Tests INVUL/RFLT badges and whether testers understand invulnerability vs. shield distinction

---

## What Testers Should Report

Testers should note and report:

1. **Confusion points** — Any moment where they did not understand what a skill does, what state a fighter is in, or why an action was blocked.
2. **Visual bugs** — Missing portraits, broken layouts, overlapping elements, unreadable text.
3. **Flow interruptions** — Cases where they could not figure out how to queue an action, commit a turn, or exit a match.
4. **Wrong outcomes** — Skill resolved differently than the description said it would.
5. **Console errors** — Any red errors visible in browser developer tools (F12).
6. **"Dead" UI** — Buttons or elements that appear interactive but do nothing (beyond the known sound slider limitation).
7. **AI confusion** — Cases where the AI opponent's behavior was so strange that it disrupted understanding of how a skill works.

Testers do **not** need to report:
- Balance (damage numbers, cooldowns, kit strength)
- Missing content beyond the 24 fighters
- Online / ranked / matchmaking features
- Profile progression, XP, or unlocks
- Mobile / touch UX

---

## Out of Scope for First Playtest

- Character balance, damage tuning, cooldown values
- Online matchmaking, ranked mode, private rooms
- Profile progression, missions, quests, unlocks
- Mobile / tablet / touch UI
- Animation polish, sound effects, music
- Social features (chat, clans, friends list)
- Supabase, authentication, or server-side issues
- Any fighter not in the 24-fighter authored roster

---

## Phase 8 Files Changed

| File | Change |
|------|--------|
| `src/pages/BattlePage.tsx` | `BattleResultOverlay`: added `isPractice` prop; hides "View Results" for practice, shows "Practice Match" label and "Practice results are not recorded" sub-text |
| `src/pages/BattlePage.tsx` | `UtilityRail`: removed non-functional "OPEN CHAT" stub button |
| `docs/playtesting/01-internal-playtest-readiness.md` | Created this document |

No engine, kit, or test changes were made.
