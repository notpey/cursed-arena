# Playtest Triage Guide

**Purpose:** Classify incoming playtest feedback, decide what to act on, and sequence fixes correctly.  
**Audience:** Developer triaging reports after an internal playtest session.

---

## Triage Decision Tree

When a new feedback entry arrives, ask these questions in order:

```
1. Did it prevent the match from being completed?
   YES → Blocker. Fix before next playtest session.

2. Did a skill resolve in a way that contradicts its description?
   YES → Engine bug. Fix before balance work.

3. Did multiple testers report the same confusion independently?
   YES → UX confusion. Fix before balance work.

4. Is the description wrong but the engine is correct?
   YES → Copy issue. Fix before balance work.

5. Is a visual element missing, overlapping, or showing wrong data?
   YES → UI bug. Fix before balance work.

6. Is the number too high/low, the cooldown too long/short, or a kit too dominant?
   YES → Balance concern. Log and defer.

7. Is it art, animation, or audio roughness with no readability impact?
   YES → Polish. Defer.
```

---

## Triage Categories and Priority Order

### Priority 1 — Fix Immediately (Blockers)

**Definition:** The tester could not complete the match, or a core loop was completely broken.

**Examples:**
- Match does not start after pressing PRACTICE
- Pressing PRESS WHEN READY has no effect
- A fighter's ability strip does not render
- The game freezes or shows a crash/white screen

**Action:** Fix before any further playtesting. Do not let more testers hit the same blocker.

---

### Priority 2 — Fix Before Next Session (Engine Bugs)

**Definition:** A skill resolved in a way that contradicts its description. Damage numbers, targeting, timing, or condition checks are wrong.

**Examples:**
- Chomp blocks harmful skills when description says it blocks helpful skills
- Black Flash does not stun when bonus reaches 20 as described
- Connected Souls does not intercept the next harmful skill on the ally
- Corrosive Blood removes Rot stacks even when Blood Brothers was active

**Action:** File a code fix. Cross-check the engine against the kit file and the combat laws doc (`docs/battle-referee/00-combat-laws.md`). Add a failing test, fix it, re-run the suite.

**Do not:** Rebalance numbers while fixing an engine bug. Fix only the correctness issue.

---

### Priority 3 — Fix Before Next Session (Repeated UX Confusion)

**Definition:** The UI is working correctly, but multiple testers independently could not figure out how to do the same thing.

**One report** of "I didn't know I had to click the enemy portrait" is a data point.  
**Two or more independent reports** of the same confusion is a UX problem to fix.

**Examples (threshold: 2+ independent reports):**
- Multiple testers did not know they could click enemy portraits to inspect skills
- Multiple testers did not understand how to dequeue a skill
- Multiple testers were confused by the queue commit modal's random energy step
- Multiple testers did not notice the phase bar sub-message

**Action:** Improve the relevant UI feedback — a label, tooltip, animation, or hint. Do not redesign the whole page. Do not fix a UX issue that only one tester reported until you see a second report.

**Do not:** Change mechanics in response to UX confusion. The fix is the hint, not the rule.

---

### Priority 4 — Fix Before Next Session (Copy Issues)

**Definition:** A skill description, badge label, or tooltip text does not accurately describe what the skill does.

**Examples:**
- A description says "for 1 turn" but the effect lasts 2 turns
- A description says "first time" but the reaction fires on every trigger
- A badge tooltip says "Counter armed" but the fighter has a reflect, not a counter

**Action:** Update the copy in the relevant fighter kit file or badge label. Do not change the underlying mechanic unless both the description and the mechanic are wrong.

**Note:** If a description is ambiguous (could be read either way), update the wording toward the clearer reading of what the engine actually does.

---

### Priority 5 — Fix Before Next Session (UI Bugs)

**Definition:** A visual element is rendering incorrectly — wrong number, wrong state, layout overlap, element missing.

**Examples:**
- Cooldown number shows 0 but skill is still greyed out
- HP bar shows 100 but fighter shows "KO" badge
- Energy cost badge is missing from a skill tile
- Portrait badge STUN shows on a fighter who is not stunned

**Action:** Fix the rendering logic. Cross-check the display code against the engine state — the engine is the source of truth, the display should match it.

---

### Priority 6 — Log and Defer (Balance Concerns)

**Definition:** Numbers feel too strong or too weak. A kit feels dominant or useless.

**Examples:**
- "Gojo's Infinity feels impossible to beat around"
- "Nanami deals more damage than anyone else"
- "Mahito's transfiguration skills feel weak for the cost"

**Action:** Log the report with the team and match context. **Do not rebalance from a single match report.** Wait until 3+ testers report the same character or mechanic as a problem before investigating balance.

**Exception:** If a number is clearly a coding error (e.g. a skill that says it deals 10 damage deals 100 or 0), treat it as an engine bug instead.

**Rationale:** First-session testers are learning the game. Their balance impressions are strongly influenced by what they happened to face, what they tried, and what the AI happened to do. One session is not enough signal.

---

### Priority 7 — Log and Defer (AI Behavior)

**Definition:** The practice AI played in a way that confused or frustrated the tester.

**Examples:**
- The AI never used its ultimate
- The AI used a setup skill but never used the payoff skill
- The AI used a harmful skill on itself

**Action:** Log it. The current AI is a known greedy stub and does not represent ideal play. Fix AI behavior only if it actively prevents testing a mechanic — e.g. if the AI never triggers a reactive effect that the tester needs to see in order to evaluate it.

**Do not:** Prioritize AI polish until the core mechanics have been validated with human-controlled matches.

---

### Priority 8 — Defer (Art / Audio Polish)

**Definition:** Something looks or sounds rough but does not affect readability, correctness, or usability.

**Examples:**
- Portrait placeholder letter feels jarring
- A transition animation looks clunky
- A sound effect is missing or repetitive
- Colors feel off

**Action:** Log it for a dedicated art/audio pass. Do not act on it during the playtest triage cycle unless it is causing misunderstanding (e.g. a color that signals "good" for something that is "bad").

---

## Separating Bugs from Balance Opinions

This is the most common triage error. Use this checklist:

| Question | If YES | If NO |
|---------|--------|-------|
| Does the skill description say X? | Did the skill do X? If not → engine or copy bug | — |
| Does the number match the kit file? | If not → engine bug | If yes → balance concern |
| Did the game crash, freeze, or show a console error? | → Blocker or engine bug | → Probably not a blocker |
| Did multiple testers independently report this character as overpowered? | → Start balance investigation | → Log and wait |
| Is the complaint about "it felt unfair"? | → Likely balance concern; defer | — |
| Is the complaint about "I didn't know what happened"? | → UX confusion or copy issue | — |

---

## What to Fix Before More Playtesting

Before inviting more testers or running a second session:

1. All **Blockers** resolved
2. All confirmed **Engine bugs** with test coverage
3. Any **Copy issues** confirmed by cross-checking the kit file
4. Any **UX confusion** reported by 2+ testers independently
5. Clear **UI bugs** with obvious fixes (wrong number, missing element)

Do **not** block the next session on:
- Balance changes
- AI behavior improvements
- Art or audio polish
- UX confusion from a single tester

---

## Examples by Category

### Engine Bug
> "I used Chomp on an enemy. The description says it prevents helpful skills for 1 turn. But the AI kept using helpful skills on its own team. The restriction didn't seem to apply."

**Triage:** Engine bug. Check `isAbilityIntentStunned` in `engine.ts` and the `intentStun` effect in `kechizu.ts`. Verify whether `intent: 'helpful'` correctly blocks the AI's helpful skills or only the enemy's use of helpful skills on themselves.

---

### UX Confusion
> "I didn't realize clicking the enemy portrait would open the skill inspection panel. I spent several turns not knowing what the enemy could do."

**Triage (1 report):** Log it. Wait for a second independent report.  
**Triage (2+ reports):** Add a visual affordance — a hover highlight or a small "INSPECT" label that appears on enemy portraits when not in targeting mode.

---

### Copy Issue
> "Kechizu's Chomp says 'preventing them from using helpful skills.' But the description also says 'each time a helpful skill is used on the target, the user gains 1 Rot.' This is confusing — can helpful skills be used on them or not?"

**Triage:** Copy issue. The intent stun prevents the *target* from *using* helpful skills. It does not prevent allies from *using helpful skills on the target* — that is a separate reaction that punishes opponents who heal the locked fighter. Update the description to make this distinction explicit.

---

### Balance Concern (Deferred)
> "Gojo's Infinity passive makes him basically impossible to kill."

**Triage:** Log it. Check after 3+ sessions whether this comes up repeatedly. Infinity is a defensive ultimate that costs energy — whether it is overcentralizing is a balance question that needs more data.

---

### Correctly Not a Bug
> "The AI used Jogo's Cataclysmic Eruption when there were no Scorched stacks on my team, so it did 0 damage."

**Triage:** Not a bug. The AI does not evaluate conditional payoff. This is expected AI greedy behavior. Log under AI issues and defer.

---

## Issue Log

All triaged issues should be recorded in `05-playtest-issue-log.md` with a status. Statuses:

| Status | Meaning |
|--------|---------|
| `open` | Not yet triaged |
| `investigating` | Being looked at |
| `fix-pending` | Fix identified, not yet merged |
| `fixed` | Fix merged and validated |
| `deferred` | Intentionally deferred (balance, polish, AI) |
| `not-a-bug` | Triaged as expected behavior |
| `duplicate` | Same issue as another entry |
