# Playtest Issue Log

**Last updated:** 2026-05-17  
**Session count:** 0 (pre-playtest)

Add one row per issue. Use the IDs sequentially: PT-001, PT-002, etc.  
See `04-triage-guide.md` for category definitions and status values.

---

## Active Issues

| ID | Date | Category | Severity | Team / Character | Summary | Status | Owner | Notes | Linked Fix / Test |
|----|------|----------|----------|-----------------|---------|--------|-------|-------|-------------------|
| — | — | — | — | — | No issues logged yet | — | — | — | — |

---

## Resolved Issues

| ID | Date | Category | Severity | Team / Character | Summary | Status | Owner | Notes | Linked Fix / Test |
|----|------|----------|----------|-----------------|---------|--------|-------|-------|-------------------|
| PT-000 | 2026-05-17 | UI bug | Minor | All | Practice match end overlay showed "View Results" button leading to blank "No Match Recorded" page | fixed | Phase 8 | Button hidden for practice mode; "Play Again" is primary CTA | `BattlePage.tsx` `BattleResultOverlay` |
| PT-001 | 2026-05-17 | UI bug | Minor | All | "OPEN CHAT" button in utility rail was non-functional stub | fixed | Phase 8 | Button removed | `BattlePage.tsx` `UtilityRail` |

---

## Deferred / Not-A-Bug

| ID | Date | Category | Summary | Status | Notes |
|----|------|----------|---------|--------|-------|
| D-001 | 2026-05-17 | Art / audio polish | Sound volume slider in utility rail is decorative | deferred | No drag handler; use system audio or Settings page |
| D-002 | 2026-05-17 | AI issue | Practice AI plays greedy strategy, does not demonstrate setup/payoff combos | deferred | Known stub; does not block mechanic testing |
| D-003 | 2026-05-17 | Art / audio polish | Some fighter portraits show placeholder initials instead of art | deferred | Fallback is intentional; portrait assets not yet complete |

---

## Issue Entry Template

Copy this block and fill it in when logging a new issue from a playtest report:

```
| PT-XXX | YYYY-MM-DD | <category> | <severity> | <Fighter or All> | <one-line summary> | open | — | <any notes> | — |
```

Category values: `engine bug` / `UI bug` / `UX confusion` / `copy issue` / `balance concern` / `AI issue` / `art/audio polish`  
Severity values: `blocker` / `major` / `minor` / `polish`  
Status values: `open` / `investigating` / `fix-pending` / `fixed` / `deferred` / `not-a-bug` / `duplicate`

---

## Session Index

| Session | Date | Testers | Matches Run | Issues Filed | Notes |
|---------|------|---------|-------------|--------------|-------|
| S-000 | 2026-05-17 | — | 0 | PT-000, PT-001 | Pre-playtest fixes from Phase 8 inspection |

Add a row here after each playtest session with the count of new issues filed.
