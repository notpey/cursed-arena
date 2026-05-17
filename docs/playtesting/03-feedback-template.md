# Playtest Feedback Template

Copy one block per issue. Submit as many as needed — one entry per distinct issue, confusion, or observation.

---

## Template

```
---
Tester Name:
Date:
Browser / Device:          (e.g. Chrome 124, Windows 11 desktop)
Team Used:                 (e.g. Yuji / Nobara / Nanami)
Opponent Team (if known):
Match Number:              (1–5 from the script, or "free play")

What happened?
[Describe what you observed. Be specific: what skill, what fighter, what round, what the screen showed.]

What did you expect?
[Describe what you thought should happen based on skill descriptions, UI, or intuition.]

Can you reproduce it?
[Yes, reliably / Yes, sometimes / No, happened once / Unsure]

Steps to reproduce (if yes):
1.
2.
3.

Screenshot / video link:
[Paste URL or write "none"]

Severity:
[ ] Blocker — Could not complete the match or a core loop was broken
[ ] Major — Significant confusion or wrong outcome; meaningfully hurts the experience
[ ] Minor — Noticeable issue but did not block progress
[ ] Polish — Visual roughness or wording oddity; low friction

Category:
[ ] Engine bug — Skill resolved incorrectly
[ ] UI bug — Visual element broken, missing, or wrong
[ ] UX confusion — UI worked but the interaction was unclear
[ ] Copy issue — Description was misleading or did not match behavior
[ ] Balance concern — Numbers feel too strong/weak (note: deferred to balance phase)
[ ] AI issue — AI behavior was confusing or prevented understanding
[ ] Art / audio polish — Visual or sound roughness (not a functional issue)

Notes:
[Anything else relevant — other effects that were active, what you tried before, whether this is the first time you saw this mechanic, etc.]
---
```

---

## Severity Guide

| Severity | Meaning | Example |
|---------|---------|---------|
| **Blocker** | A core loop cannot be completed — no workaround exists | Match does not start; pressing Ready has no effect |
| **Major** | A significant wrong outcome or confusion that would send a tester away — but they can continue | A skill consistently deals damage to the wrong target; invulnerability does not block damage |
| **Minor** | A noticeable problem that a tester works around | A tooltip says the wrong cooldown number; a badge label is hard to read |
| **Polish** | Rough but harmless — visual noise or wording that is slightly off | Portrait placeholder letter feels jarring; animation timing feels off |

When in doubt, **report it** and let the triage team decide the severity.

---

## Category Guide

| Category | Meaning |
|---------|---------|
| **Engine bug** | The battle engine resolved something incorrectly — damage, targeting, timing, or conditions. Highest priority to fix. |
| **UI bug** | Something visual is broken: wrong number displayed, layout overlap, element missing, badge shows wrong state. |
| **UX confusion** | The mechanics are working correctly but the player could not figure out how to interact with them. Fix by improving feedback, not the mechanic itself. |
| **Copy issue** | A skill description, badge label, or tooltip does not match what the skill actually does. |
| **Balance concern** | Numbers feel unfair. These are real feedback but are deferred — do not file as bugs unless numbers are clearly broken (e.g. a skill deals 0 damage when description says 10). |
| **AI issue** | The practice AI opponent played in a way that was confusing or prevented the tester from understanding a mechanic. Note: the AI is a known stub; only report if it actively prevented testing. |
| **Art / audio polish** | Something looks or sounds rough but does not affect readability or correctness. Deferred unless it causes confusion. |

---

## Filled-In Example

```
---
Tester Name: A. Tester
Date: 2026-05-18
Browser / Device: Chrome 124, Windows 11 desktop
Team Used: Kechizu / Eso / Nanami
Opponent Team (if known): Unknown AI team
Match Number: 3

What happened?
Applied Chomp to an enemy fighter. The LOCK badge appeared on their portrait. On the following turn, I tried to queue a harmful skill on that enemy and it was blocked. But I also tried to queue a helpful skill on an ally — that worked fine. I expected both to be blocked.

What did you expect?
Based on the skill description "preventing them from using helpful skills for 1 turn," I expected the enemy's helpful skills would be blocked, not their harmful skills. The block seemed inverted.

Can you reproduce it?
Yes, reliably

Steps to reproduce:
1. Use Chomp (Kechizu, skill 3) on any enemy.
2. Next turn, observe whether the AI can use harmful skills on your team.
3. Note whether harmful or helpful skills are blocked.

Screenshot / video link: none

Severity:
[x] Major — Wrong outcome; Chomp would be useless if it blocks the wrong intent

Category:
[x] Copy issue — Description says "helpful skills" are blocked; LOCK badge showed but behavior may be inverted, or description may be wrong

Notes:
The LOCK portrait badge appeared and the skill description text was visible in the info panel. The description clearly says "preventing them from using helpful skills." I'm not sure if the engine is wrong or the description is wrong, but one of them is.
---
```

---

## Submission

- Save filled-in entries in `docs/playtesting/05-playtest-issue-log.md` or email/share them with the dev team.
- Group multiple entries from the same session together.
- Date-stamp your submission.
