# First Playtest Script — Internal Session

**Version:** 1.0  
**Date:** 2026-05-17  
**Scope:** Practice mode (vs AI), desktop browser, 5 structured matches  
**Prerequisite:** Read `01-internal-playtest-readiness.md` before running

---

## Before You Start

### Setup Checklist

- [ ] Open the app in a desktop browser (Chrome or Firefox recommended)
- [ ] You are on the Battle Prep page (`/battle/prep`)
- [ ] Open browser DevTools (F12) and keep the Console tab visible in a corner — note any red errors
- [ ] Have the feedback template (`03-feedback-template.md`) open or printed for notes
- [ ] Set aside 60–90 minutes for the full session (all 5 matches)

### Known Limitations — Read Before Playing

These are expected and should **not** be reported as bugs:

- The **sound volume slider** in the utility rail does not respond to dragging. Use system volume or the Settings page.
- **Fighter portraits** may appear as a single letter if the portrait image is not loaded — this is a placeholder, not a crash.
- **The AI opponent** uses a simple greedy strategy. It will use skills when it can but will not demonstrate advanced combos. Treat it as a training dummy, not a skilled opponent.
- **Practice match results are not saved.** After a practice match ends, use "Play Again" to return to prep. Do not use "View Results."

---

## How to Start a Practice Match

1. On the Battle Prep page, click fighters from the roster to fill your 3-slot team.
2. Once 3 fighters are selected, the **PRACTICE** button becomes active.
3. Click **PRACTICE** to launch the match.
4. The AI opponent team is chosen automatically.
5. The battle begins. If the AI goes first, it will take its first turn automatically before you get control.

---

## Turn Flow — Quick Reference

| Step | What to Do |
|------|-----------|
| Your turn starts | Phase bar shows "YOUR COMMAND" in teal |
| Queue a skill | Click a fighter portrait to select them, then click a skill tile |
| Target a fighter | For single-target skills: click the glowing gold "TARGET" portrait |
| AoE / self skills | Queue immediately with no target needed |
| Swap queued skill | Click the fighter's portrait again to dequeue and re-pick |
| Check a skill | Hover any skill tile — the info panel shows name, description, cost, cooldown, status |
| Inspect enemy skills | Click any enemy portrait, then click their skill cards in the panel |
| Press Ready | When done queueing, click **PRESS WHEN READY** |
| Allocate random energy | If prompted, assign random energy dice to your queued skills |
| Watch resolution | Actions resolve one by one with banners — controls are locked during this |
| Next turn | Controls re-enable; the phase bar returns to teal |
| Match end | An overlay shows Victory / Defeat / Draw with team survival summary |

---

## The 5 Matches

Run each match in order. Each one introduces new mechanics. Use the exact team listed.

---

### Match 1 — Introduction to Battle Flow
**Your Team: Yuji / Nobara / Nanami**

**Goal:** Get familiar with the basic loop. Queue actions, press Ready, watch resolution, manage cooldowns and energy.

**What to do:**
- Queue at least one action per fighter each turn if possible.
- Try every skill at least once across the match, including the ultimate (4th skill).
- Try passing without queuing to see what happens.
- Try running out of energy intentionally to see the block state.
- Hover a locked (greyed-out) skill to see why it is unavailable.
- End the match naturally — win or lose.

**Pay attention to:**
- Can you always tell whose turn it is?
- Does the phase bar change make sense?
- Are cooldowns clear after you use a skill?
- Does the info panel description match what the skill actually did?
- Is the turn timer visible? Did it pressure you?
- Did the match-end overlay appear cleanly?

---

### Match 2 — Setup and Payoff Mechanics
**Your Team: Megumi / Nobara / Yuji**

**Goal:** Test that stacking effects and their payoff skills communicate clearly before you commit to them.

**What to do:**
- With Megumi: use skills that summon Shikigami (watch for the pip/stack counter on his portrait), then use Shikigami Recall and observe the heal.
- With Nobara: apply Straw Doll Ritual stacks to an enemy, then watch the passive damage each round. Use Soul Resonance on a stacked enemy.
- With Yuji: build up Black Flash bonus during Soul Charge by getting hit or using Divergent Fist, then check if Black Flash deals more damage and notes the stun condition.
- Hover pip tooltips on Megumi and Nobara when stacks are active and read them.

**Pay attention to:**
- Without reading the descriptions first, could you guess that these fighters have a "charge first, pay off later" pattern from the UI alone?
- Does the stack counter on the portrait portrait make sense?
- Can you tell what the payoff skill does differently when you have stacks vs. when you don't?
- Is the MARK badge on an enemy (Straw Doll) noticeable?

---

### Match 3 — Disruption and Protection
**Your Team: Kechizu / Eso / Nanami**

**Goal:** Test that lock/seal/counter states communicate clearly to the player.

**What to do:**
- With Kechizu: use Connected Souls on an ally to set up the intercept reaction, then watch whether the enemy targets that ally. Try Chomp on an enemy and observe the LOCK badge and intent seal.
- With Eso: apply Rot stacks with Impaling Rush and watch the Corrosive Blood delayed damage. Try Blood Brothers ultimate before Corrosive Blood.
- With Nanami: use Ratio Technique then follow up with 7:3 Execution the next turn. Check if the extra damage registers.
- Let one of your fighters get stunned by the AI and try to use a skill on them — read the block reason.

**Pay attention to:**
- When a fighter has LOCK or SEAL on their portrait, is it obvious why their skills are blocked?
- Is the Rot counter on enemies visible and meaningful-looking?
- Did you understand that Corrosive Blood would deal delayed damage before it fired?
- When Connected Souls activated and intercepted an attack, was it clear what happened in the turn log?

---

### Match 4 — Field Effects and Delayed Damage
**Your Team: Jogo / Ijichi / Yaga**

**Goal:** Test passive triggers, round-start effects, and delayed damage display.

**What to do:**
- With Jogo: use Ember Insects and Volcanic Infestation, watch Scorched stacks accumulate on enemies via the passive (Disaster Heat fires every round start). Use Cataclysmic Eruption on a heavily Scorched enemy.
- With Ijichi: use Barrier Tagging on an enemy and then watch the round-start damage pip fire each turn. Stack several tags.
- With Yaga: deploy a Cursed Corpse with the Substitute skill, let an enemy attack through it, and observe the counter-attack damage and the shield absorbing hits.
- Note the DLY badge on any fighter with a pending delayed effect. Hover the pips.

**Pay attention to:**
- Is it clear that Jogo's passive fires **every round start** without you taking any action?
- When the AI uses a skill and gains a Scorched stack from Volcanic Infestation, is the trigger readable in the turn log?
- Does the DLY badge / delayed pip make sense before the effect fires?
- After Ijichi's Barrier Tagging fires its round-start damage, is it clear what caused it?

---

### Match 5 — Invulnerability, Reflect, and Healing
**Your Team: Gojo / Maki / Shoko**

**Goal:** Test that defensive states (invulnerability, reflect, shield) are clearly distinguishable and that healing reads correctly.

**What to do:**
- With Gojo: activate Limitless and then Infinity (the ultimate). Attack with your other fighters and watch the reflect trigger. Attempt to use a skill on an invulnerable Gojo with the AI — observe the damage-blocked log.
- With Maki: accumulate Weapon Bonus stacks, watch the damage scaling on attacks, then use her ultimate to see the burst.
- With Shoko: use Reverse Cursed Technique on a damaged ally, observe the HP bar change. Try using it when the ally is at full HP to see if the block condition is clear.
- Try using a skill on a fighter with INVUL — the attack should be blocked.

**Pay attention to:**
- Is INVUL clearly different from RFLT on the portrait badge? Can you tell which one stops damage vs. reflects it?
- When a skill is blocked by invulnerability, does the turn log explain that clearly?
- Is healing visually distinct from damage on the HP bar?
- Did you understand the difference between destructible defense (shield) and invulnerability at any point during the match?

---

## After All 5 Matches

Take 5–10 minutes immediately after the session while it is fresh:

1. Fill in the **feedback template** (`03-feedback-template.md`) for each issue you noted — one entry per issue.
2. Note any moments where you felt lost, confused, or unsure — even if no bug occurred.
3. Note any skill description that did not match what happened.
4. Note any time the UI felt unclear even if it was "working correctly."

**Target feedback per session:** 3–10 entries. Even "I didn't understand X" without a bug is valuable.

---

## What Counts as What

| Type | Definition | Example |
|------|-----------|---------|
| **Engine bug** | A skill resolved in a way that contradicts its description | "Chomp said 1 turn stun but the fighter was locked for 2" |
| **UI bug** | Visual element is broken, missing, or wrong | "The cooldown number shows 0 but the skill is greyed out" |
| **UX confusion** | You understood the UI but couldn't figure out how to do what you wanted | "I didn't know I had to click the enemy portrait to inspect skills" |
| **Copy issue** | Description is unclear, misleading, or contradicts behavior | "Description says 'next turn' but the effect fired immediately" |
| **Balance concern** | Numbers feel too strong or weak | "Gojo feels unkillable" — hold for balance phase |
| **AI issue** | AI behavior prevented you from understanding a mechanic | "The AI never used its ultimate so I couldn't see how it works" |
| **Art/audio polish** | Visual or audio is rough but functional | "The portrait letter placeholder looks out of place" |

**Priority order for reporting:** engine bugs > UI bugs > UX confusion > copy issues > balance concerns (defer) > AI issues > art polish.

---

## How Many Matches

**Minimum:** 3 matches (Matches 1, 3, 5) to cover basic flow, disruption, and defense.  
**Recommended:** All 5 matches for full archetype coverage.  
**Extra credit:** Replay Match 2 or 3 with a different team composition of your choice and note any differences in readability.

Each match typically takes 10–20 minutes at a first-playtest pace.
