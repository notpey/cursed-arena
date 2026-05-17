# Battle Referee Phase 7A — Expiration Timing Audit

**Version:** 1.1  
**Date:** 2026-05-16  
**Status:** Audit complete (Phase 7A). Fix implemented (Phase 7B).  
**Constitutional reference:** `docs/battle-referee/00-combat-laws.md` Law 7.1 / OCQ-1

---

## 1. Current Duration/Tick System — Exact Mechanics

### 1.1 Round Structure

Every round follows this fixed sequence:

```
beginNewRound:
  state.round += 1
  applyRoundStartEffects:           ← scheduled 'roundStart' effects fire
    resolveScheduledEffects('roundStart')
    burn DOT ticks (per fighter, both teams)
    onRoundStart passives fire

resolveTeamTurn(firstTeam):         ← first team actions resolve
  [all firstTeam abilities execute]
  tickTeamTurn(firstTeam)           ← FIRST TICK

transitionToSecondPlayer            ← phase transition only, no tick

resolveTeamTurn(secondTeam):        ← second team actions resolve
  [all secondTeam abilities execute]
  tickTeamTurn(secondTeam)          ← SECOND TICK

endRound:
  applyFatigue
  resolveScheduledEffects('roundEnd')
  onRoundEnd passives fire
  tickTeamTurn(secondTeam)          ← THIRD TICK (second team ticks AGAIN)
  tickRoundEnd                      ← team-scoped and battlefield modifiers tick
```

### 1.2 `tickTeamTurn(team)` — What It Does

Runs for every **alive** fighter on the specified team:

1. **Cooldowns:** `cooldowns[id] -= cooldownTick` (where `cooldownTick = 1 + cooldownTick modifier`)
2. **Modifiers:** `tickModifiers(fighter.modifiers, state.round)` — decrements `remaining` by 1 and removes expired entries
3. **Syncs statuses** from modifiers (invulnerable, stun, etc.)
4. **Emits** modifier-removed events for anything that expired
5. **tickAbilityState:** decrements `duration` on each `abilityState` delta, removes those reaching 0
6. **tickCostModifiers:** decrements `remainingRounds`, removes expired; also removes if `remainingUses === 0`
7. **tickEffectImmunities:** decrements `remainingRounds`, removes expired
8. **tickClassStuns:** decrements `remainingRounds`, removes expired — with skip guard
9. **tickIntentStuns:** same with skip guard
10. **tickReactionGuards:** same with skip guard
11. **tickStateModes:** decrements `remainingRounds` for timed modes, clears expired ones — with skip guard

### 1.3 The Skip Guard (`appliedInRound`)

A critical design choice: **every tick function (except cooldowns, abilityState, costModifiers, effectImmunities) skips the first tick when it fires in the same round the effect was applied.**

Specifically, `tickModifiers`, `tickClassStuns`, `tickIntentStuns`, `tickReactionGuards`, `tickStateModes` all check:

```typescript
if (appliedInRound !== undefined && appliedInRound === round) return  // skip this tick
```

This ensures that "stun for N turns" always means the victim misses N of **their own** turns, not N minus the first partial-round.

**Which effects carry `appliedInRound`:**
- All `BattleModifierInstance` entries created via `applyModifierToFighter` (sets `next.appliedInRound = state.round` at line 897)
- `BattleClassStunState` (set in `createClassStunState`)
- `BattleIntentStunState` (set in `createIntentStunState`)
- `BattleReactionGuardState` (set in `createReactionGuardState`)
- `BattleStateModeDuration` (set directly in `applySetModeEffect`)

**Which effects do NOT carry `appliedInRound` (no skip protection):**
- Cooldowns: no skip guard. Set on use; immediately begin ticking on the actor's own turn-end.
- `abilityState` deltas (replacement abilities): no skip guard. Immediately begin ticking.
- `costModifiers`: no skip guard. Immediately begin ticking.
- `effectImmunities`: no skip guard. Immediately begin ticking.

### 1.4 `tickRoundEnd` — What It Does

Runs at the end of every round, **after** `tickTeamTurn(secondTeam)` has already run:

- Ticks **team-scoped modifiers** (`playerTeamModifiers`, `enemyTeamModifiers`) for both teams
- Ticks **battlefield modifiers** (`battlefieldModifiers`)
- These use `tickModifiers()` WITHOUT passing `state.round`, so there is no skip guard here

**Key observation:** Team-scoped modifiers do NOT use `tickTeamTurn`; they use a separate call in `tickRoundEnd`. They tick once per round on the same schedule, regardless of team.

### 1.5 The Asymmetry

The round structure has **three `tickTeamTurn` calls per round:**
1. After first team actions: `tickTeamTurn(firstTeam)`
2. After second team actions: `tickTeamTurn(secondTeam)`
3. In `endRound`: `tickTeamTurn(secondTeam)` — **second team ticks again**

This is not a bug in the simple sense — the intent is that the second tick for the second team covers the "round end" period. But the consequence is that the **second team's effects tick twice per round**: once after their actions, once at round end. The **first team's effects tick once per round**: only after their actions.

---

## 2. Concrete Examples

For all examples, assume: **Player is `firstPlayer`** (acts first). Round is R.

### Example 1: Player A (first) stuns Player B (second) with a 1-round stun

**Application:**
- Round R, during Player turn: stun applied with `appliedInRound = R`

**Tick trace:**
- `tickTeamTurn(player)` fires at end of Player turn → stun is on **enemy** fighter → not ticked here
- `tickTeamTurn(enemy)` fires at end of Enemy turn → stun was applied in round R, `appliedInRound === R` → **SKIPPED**
- `tickTeamTurn(enemy)` fires again in `endRound` → still same round R → **SKIPPED again**
- Round boundary: `state.round` becomes R+1
- `beginNewRound` → `applyRoundStartEffects` (no tick here)
- Player acts in R+1 (stun doesn't block player)
- `tickTeamTurn(player)` → stun is on enemy, not ticked here
- Enemy tries to act in R+1 → **stun is still active** (remaining=1, never decremented) → **BLOCKED**
- `tickTeamTurn(enemy)` → now `appliedInRound=R`, current round=R+1, R≠R+1 → **DECREMENTS to 0** → stun expires
- `tickTeamTurn(enemy)` in endRound → stun already removed

**Result:** Stun applied by first-mover blocks exactly 1 of the enemy's turns. ✓ Works as intended.

---

### Example 2: Enemy B (second) stuns Player A (first) with a 1-round stun

**Application:**
- Round R, during Enemy turn: stun applied with `appliedInRound = R`

**Tick trace:**
- `tickTeamTurn(player)` fires at end of Player turn → stun is on **player** fighter, but this is at end of Player's turn, which already happened **before** the enemy's turn → not ticked here
  
Wait — this requires more careful sequencing. The stun is applied **during** the enemy's action resolution, which happens during `resolveTeamTurn(enemy)`, after `resolveTeamTurn(player)` and `tickTeamTurn(player)` have already completed.

**Corrected tick trace:**
- End of Player turn (round R): `tickTeamTurn(player)` runs → stun not yet applied → nothing relevant
- Enemy acts in round R: stun applied to player with `appliedInRound = R`
- `tickTeamTurn(enemy)` fires at end of Enemy turn → stun is on **player** fighter → not ticked here
- `tickTeamTurn(enemy)` fires in endRound → stun is on **player** fighter → not ticked here
- Round R+1 begins
- **Player tries to act in R+1 → stun is still active (remaining=1) → BLOCKED** ✓
- `tickTeamTurn(player)` fires → `appliedInRound=R`, current=R+1 → **DECREMENTS to 0** → stun expires
- Enemy acts in R+1 (stun doesn't affect enemy)
- `tickTeamTurn(enemy)` → no stun

**Result:** Stun applied by second-mover also blocks exactly 1 of the victim's turns. ✓ Symmetric.

**Stun conclusion:** The skip guard (`appliedInRound`) correctly ensures 1-round stun means "victim misses 1 of their own turns" regardless of whether the applier is first or second. Both cases are symmetric and correct.

---

### Example 3: Player applies 2-round burn to Enemy (burn as a `modifier` with `dotDamage`)

Burn is applied via `applyModifierToFighter` → creates modifier with `appliedInRound = R`.  
Burn ticks fire in `applyRoundStartEffects` at the start of each new round.

**Tick trace for the modifier duration:**
- Round R: burn applied with `appliedInRound = R`, `remaining = 2`
- `tickTeamTurn(player)` → burn is on enemy → not ticked here
- `tickTeamTurn(enemy)` → `appliedInRound=R`, current=R → **SKIPPED** (remaining stays 2)
- `tickTeamTurn(enemy)` in endRound → same round → **SKIPPED** (remaining stays 2)
- Round R+1 begins: `applyRoundStartEffects` → **burn tick fires (1st damage tick)**
- `tickTeamTurn(player)` → burn is on enemy → not ticked here
- `tickTeamTurn(enemy)` → `appliedInRound=R`, current=R+1, R≠R+1 → **DECREMENTS to 1**
- `tickTeamTurn(enemy)` in endRound → `appliedInRound=R`, current=R+1 → **DECREMENTS to 0** → **EXPIRES**
- Round R+2: `applyRoundStartEffects` → burn modifier is gone → **NO damage tick**

**Result:** A 2-round burn fires damage on round start of R+1 only — **1 damage tick total**, not 2.

**Why?** `tickTeamTurn(enemy)` fires **twice** in round R+1 (after enemy actions and in endRound), consuming both remaining duration points. This is the core asymmetry problem for the **second team's buffs/debuffs applied to them by the first team**.

Now consider the same burn applied by **enemy to player** during Enemy turn in round R:

**Tick trace:**
- Round R: burn applied to player during Enemy turn, `appliedInRound = R`, `remaining = 2`
- `tickTeamTurn(enemy)` and endRound enemy tick → burn is on player → not ticked here
- Round R+1: `applyRoundStartEffects` → **burn tick fires (1st damage tick)**
- `tickTeamTurn(player)` → `appliedInRound=R`, current=R+1 → **DECREMENTS to 1**
- `tickTeamTurn(enemy)`, endRound enemy tick → burn is on player → not ticked here
- Round R+2: `applyRoundStartEffects` → **burn tick fires (2nd damage tick)**
- `tickTeamTurn(player)` → `appliedInRound=R`, current=R+2 → **DECREMENTS to 0** → **EXPIRES**

**Result:** A 2-round burn on the player fires damage on rounds R+1 AND R+2 — **2 damage ticks total**.

**Burn asymmetry confirmed:**
- Enemy burn applied by player (first) → **1 damage tick** (duration consumed in 2 end-of-enemy-turn ticks)
- Player burn applied by enemy (second) → **2 damage ticks** (duration consumed in 1 per-round player tick)

---

### Example 4: Enemy applies a 2-round shield to themselves

Shields (`BattleShieldState`) have **no duration field**. `fighter.shield` is a plain object with `{ amount, label, tags }` — no `remainingRounds`, no tick, no expiry.

**Result:** Shields are **permanent until depleted by damage**. They never expire by duration. Duration is not tracked.

This means a shield effect applies indefinitely until the fighter takes enough damage to break it, or until a `breakShield` effect is used. There is no "shield lasts 2 rounds" mechanic — the `duration` field on a shield-granting effect, if any, would be stored as... there is no such field on `{ type: 'shield' }`. The shield type definition has only `amount`, `label`, `tags`.

**Shield conclusion:** Shields are not subject to timing asymmetry because they have no duration. They are a HP-pool overlay. This is a design limitation (shields can't expire by time), not a timing bug.

---

### Example 5: Player applies 1-round invulnerability to self

Invulnerability is a modifier (`stat: 'isInvulnerable'`, `value: true`, `duration: { kind: 'rounds', rounds: 1 }`), applied via `applyModifierToFighter`, with `appliedInRound = R`.

**Tick trace (player is firstTeam):**
- Round R: player uses ability, invuln applied to self, `appliedInRound = R`, `remaining = 1`
- `tickTeamTurn(player)` → player's own tick runs → `appliedInRound=R`, current=R → **SKIPPED**
- Enemy acts in round R → player is invulnerable ✓
- `tickTeamTurn(enemy)` → invuln is on player → not ticked here
- `tickTeamTurn(enemy)` in endRound → invuln is on player → not ticked here
- Round R+1: player is **still invulnerable** at round start
- Player tries to act in R+1
- `tickTeamTurn(player)` → `appliedInRound=R`, current=R+1 → **DECREMENTS to 0** → **EXPIRES**
- Player is now vulnerable for Enemy turn in R+1

**Result:** 1-round invulnerability covers the rest of Round R (enemy's actions) **and** Round R+1 (round start effects). It expires after the player's own R+1 tick, so the player is vulnerable during the enemy's R+1 actions.

**Effective coverage:** ~1.5 rounds of protection (round R enemy turn + round R+1 round start). This is because the first-mover's own tick at round end is the one that expires the effect after round R+1 starts.

Now consider **enemy (secondTeam) applying 1-round invulnerability to self** during their turn in round R:

**Tick trace:**
- Round R (enemy turn): invuln applied to enemy self, `appliedInRound = R`, `remaining = 1`
- `tickTeamTurn(enemy)` at end of enemy turn → `appliedInRound=R`, current=R → **SKIPPED**
- `tickTeamTurn(enemy)` in endRound → **SKIPPED again** (same round)
- Round R+1: enemy is **still invulnerable** at round start ✓
- Player acts in R+1 → enemy invulnerable ✓
- `tickTeamTurn(player)` → invuln is on enemy → not ticked here
- `tickTeamTurn(enemy)` → `appliedInRound=R`, current=R+1 → **DECREMENTS to 0** → **EXPIRES**
- `tickTeamTurn(enemy)` in endRound → already expired

**Result:** Enemy 1-round invulnerability covers the player's R+1 turn, then expires. Also about ~1 round of useful coverage (player's R+1 actions). Symmetric with the player case in terms of what it protects against.

**Invulnerability conclusion:** Functionally symmetric for the most common use case (protecting against the opponent's next turn). The double-tick for the second team doesn't create a visible difference here because both teams' invulnerability covers exactly one opponent attack window.

---

### Example 6: Replacement ability lasts 2 rounds

Replacement abilities are tracked via `abilityState` deltas (type `'replace'` or `'grant'`). These are ticked by `tickAbilityState`, which has **no `appliedInRound` skip guard**:

```typescript
export function tickAbilityState(fighter: BattleFighterState) {
  fighter.abilityState = fighter.abilityState
    .map((delta) => ({ ...delta, duration: Math.max(0, delta.duration - 1) }))
    .filter((delta) => delta.duration > 0)
}
```

This runs inside `tickTeamTurn`, so it ticks when the fighter's own team turn ends.

**Tick trace (player, first team, duration=2):**
- Round R: player uses ability, replacement granted with `duration = 2`
- `tickTeamTurn(player)` → **DECREMENTS to 1** (no skip guard!)
- Round R+1: player can use replacement (duration=1)
- `tickTeamTurn(player)` → **DECREMENTS to 0** → **EXPIRES** — replacement removed
- Round R+2: replacement gone

**Effective window:** Player can use replacement in round R (same round it was granted, if they have another action slot — or in round R itself before the tick) and round R+1. But **they lose it at the end of round R+1**, so they cannot use it in round R+2.

Actually more precisely: the replacement is granted when the ability fires (mid-round R). It's immediately decremented at round R end. So:
- **Round R:** granted. Available immediately for the rest of round R (but the granting action already used the turn slot). Available at round start of R.
- **End of round R:** `tickTeamTurn(player)` → duration 2→1
- **Round R+1:** replacement still available (duration=1). Player can use it.
- **End of round R+1:** `tickTeamTurn(player)` → duration 1→0 → EXPIRES.
- **Round R+2:** replacement gone.

**Result:** Duration 2 replacement = usable in rounds R and R+1. Two rounds of availability, which matches the stated duration. ✓

**For enemy (second team, duration=2):**
- Round R: enemy ability fires, replacement granted, `duration = 2`
- `tickTeamTurn(enemy)` after enemy turn → **DECREMENTS to 1**
- `tickTeamTurn(enemy)` in endRound → **DECREMENTS to 0** → **EXPIRES** — replacement removed in the same round it was granted!
- Round R+1: replacement is **already gone**

**Result:** Duration 2 replacement for the second team = usable only in round R. The double-tick in endRound consumes both duration points in a single round.

**Replacement asymmetry: severe.** The second team's replacement abilities with small durations are effectively halved because their team gets ticked twice per round.

---

### Example 7: Scheduled effect fires after 1 round delay

```typescript
state.scheduledEffects.push({
  dueRound: state.round + effect.delay,  // e.g., round R + 1 = round R+1
  phase: 'roundStart',                   // or 'roundEnd'
  ...
})
```

A `roundStart` scheduled effect with `delay: 1` applied in round R:
- `dueRound = R + 1`
- Fires in `applyRoundStartEffects` at the start of round R+1: checked as `effect.dueRound <= state.round`

This is **team-agnostic** — scheduled effects fire by absolute round number, not by team turn. So first vs. second mover makes no difference here. A 1-round delay always means "fires at round R+1 start."

**Scheduled effects conclusion:** No asymmetry. ✓

---

## 3. Summary of Asymmetry Findings

| Effect Type | Ticking Mechanism | First-mover bias | Second-mover bias | Symmetric? |
|---|---|---|---|---|
| Stun (modifier `canAct=false`) | `tickModifiers` via `tickTeamTurn(victim's team)` | Correct (skip guard) | Correct (skip guard) | ✓ Yes |
| Class/Intent stun | `tickClassStuns`/`tickIntentStuns` | Correct (skip guard) | Correct (skip guard) | ✓ Yes |
| Burn/DOT (modifier `dotDamage`) | `tickModifiers` via `tickTeamTurn(victim's team)` | **Half damage ticks** (double-tick) | Full damage ticks | ✗ **NO** |
| Invulnerability (modifier `isInvulnerable`) | `tickModifiers` via `tickTeamTurn(owner's team)` | ~Symmetric coverage | ~Symmetric coverage | ≈ Yes |
| Reaction guards | `tickReactionGuards` via `tickTeamTurn(owner's team)` | Correct (skip guard) | **Double-ticked** | ✗ **NO** |
| State modes | `tickStateModes` via `tickTeamTurn(owner's team)` | Correct (skip guard) | **Double-ticked** | ✗ **NO** |
| abilityState (replacements) | `tickAbilityState` via `tickTeamTurn(owner's team)` | Correct (no skip, 2 rounds = 2 usable) | **Double-ticked**: 2 rounds = 1 usable | ✗ **NO** |
| Cost modifiers | `tickCostModifiers` via `tickTeamTurn(owner's team)` | Correct | **Double-ticked** | ✗ **NO** |
| Effect immunities | `tickEffectImmunities` via `tickTeamTurn(owner's team)` | Correct | **Double-ticked** | ✗ **NO** |
| Cooldowns | Subtracted in `tickTeamTurn(owner's team)` | Correct | **Double-ticked** | ✗ **NO** |
| Shields | No duration tracking | N/A | N/A | ✓ (no timer) |
| Scheduled effects | `dueRound` absolute comparison | ✓ No bias | ✓ No bias | ✓ Yes |
| Team modifiers | `tickRoundEnd` once per round | Symmetric | Symmetric | ✓ Yes |

**Root cause:** `endRound` calls `tickTeamTurn(secondTeam)` explicitly:

```typescript
// endRound sequence:
tickTeamTurn(state, ctx, getSecondPlayer(state.firstPlayer))  // ← redundant for secondTeam
tickRoundEnd(state, ctx)
```

The second team's `tickTeamTurn` already ran after their own action in `resolveTeamTurn(secondTeam)`. Then `endRound` calls it a second time. First team gets `tickTeamTurn` only once (after their actions). Second team gets it twice (after actions + end of round).

---

## 4. Comparison of Timing Models

### Model A — Current: Per-Team Sequential Ticking (2x second team)

**How it works:** `tickTeamTurn(firstTeam)` after first-team actions, `tickTeamTurn(secondTeam)` after second-team actions, then `tickTeamTurn(secondTeam)` again in endRound.

**Pros:**
- Already implemented and tested
- Stun duration is symmetric (skip guard compensates)
- Scheduled effects are team-agnostic

**Cons:**
- Second team's non-stun effects tick twice per round
- Replacement abilities, reaction guards, cost modifiers, cooldowns, effect immunities, state modes all have ~half the effective duration for the second team's own self-buffs
- A 2-round burn applied to the second team fires only 1 tick instead of 2
- The double-tick is invisible to players — they see "2 rounds" but get behavior equivalent to 1 round in some contexts
- Fairness is structurally broken for any kit that cares about self-buff duration or DOT duration as a strategic variable
- Kit design is impossible to reason about without knowing team order

**Player expectations:** Violated. A player sees "stun for 2 turns" work correctly, but "replacement for 2 turns" effectively lasts 1 turn when they are the second-acting team. This inconsistency erodes trust.

**Risks:** As more kits are designed, the asymmetry creates an invisible balance hole. Any kit that self-buffs (reaction guards, forms, cost reducers) is strictly weaker when acting second.

---

### Model B — Synchronized Global Round-End Ticking

**How it works:** All fighter-scoped duration effects (modifiers, abilityState, costModifiers, effectImmunities, classStuns, intentStuns, reactionGuards, stateModes) tick exactly once per round at a synchronized point: the end of the round, after both teams have acted. Cooldowns still tick on actor's own turn (or also at round end). `tickTeamTurn` is eliminated; replaced by a single `tickAllFighters` at round end.

**Pros:**
- Perfect symmetry: every effect on every fighter ticks exactly once per round
- Trivially predictable: N-round duration = N rounds of effect
- No player trust problem: "2 turns" always means 2 turns regardless of team order
- Kit design is team-order-independent

**Cons:**
- **Migration risk:** The skip guard (`appliedInRound`) was designed specifically to compensate for the double-tick problem. If all effects tick once at round end, effects applied in the middle of the round would still tick at round end of the same round — meaning a 1-round stun applied in round R would expire at the end of round R, **before** the victim even acts in R+1. The skip guard would need to become a "was applied this round, skip this round's end tick" rule applied consistently.
- Cooldown timing changes: cooldowns currently tick on the actor's own team turn. Under synchronized model, they'd tick at round end. This means a cooldown set this round would tick at round end too, creating a half-tick on first use. The skip guard for cooldowns would be needed but currently absent.
- Test impact: ~100+ tests would need updating. Any test that verifies duration behavior (especially `endRound` integration tests) would break.
- UI display: current round display logic may assume per-team tick timing. Would need audit.
- Effective stun duration: with synchronized model and skip guard, a 1-round stun (skip first round-end tick) → expires at end of R+1 → victim misses turn in R+1. **This is correct and the same as Model A.** ✓

**Migration risks summary:** High. The skip guard logic needs to be preserved but shifted to "skip the first synchronized round-end tick." All tick functions in `tick.ts` need to be refactored to take a `phase: 'roundEnd'` signal rather than being called per-team. The round structure in `engine.ts` needs significant restructuring. Every duration-tracking test needs review.

**Player expectations:** Best of all models. No team-order bias. "N turns" always means N turns.

---

### Model C — Owner-Turn Based Ticking (effects tick when the owner's team acts next)

**How it works:** Each effect ticks when the fighter's own team's turn resolves. So first-team effects tick after first-team actions; second-team effects tick after second-team actions. `tickTeamTurn` is called exactly once per team per round, and `endRound` does NOT call `tickTeamTurn(secondTeam)` again.

**Pros:**
- Fixes the double-tick problem for the second team
- Effects owned by a fighter tick when that fighter's team acts, which is semantically consistent
- Minimal change from current: just **remove** the extra `tickTeamTurn(secondTeam)` call in `endRound`
- Cooldowns, abilityState, all self-buffs become symmetric

**Cons:**
- Effects applied **to** a fighter by an opponent still tick on the victim's team turn, which is correct (stun ticks on victim's turn)
- But effects the fighter applies **to themselves** tick on their own turn — meaning a self-buff applied by the second team after they act gets ticked at round end (which used to be the endRound double tick). Wait — if we remove the endRound double tick, second-team self-buffs now tick ONLY when second-team acts next round. This is correct.
- Burn applied by first team to second team: currently double-ticked (bug). Under Model C, ticks only once per round when second-team's `tickTeamTurn` runs. ✓ Fixed.
- The skip guard is preserved: effects applied in round R skip the round R tick. ✓
- **No change in stun behavior:** stun ticks on victim's team turn, skip guard still works. ✓

**Implementation risk:** **Very low.** The only code change is removing one line from `endRound`:

```typescript
// REMOVE this line from endRound:
tickTeamTurn(state, ctx, getSecondPlayer(state.firstPlayer))
```

Everything else — skip guards, tick logic, all tick functions — remains unchanged.

**Player expectations:** Good. "N turns" always means N turns, regardless of team order. Symmetric.

**Subtlety:** The `endRound` call to `tickTeamTurn(secondTeam)` was presumably intended to represent "the round boundary tick for the second team." Under Model C, that tick is already covered by the `tickTeamTurn(secondTeam)` call inside `resolveTeamTurn(secondTeam)`. The round-end tick is therefore redundant and causes the double-tick bug.

---

### Model D — Target-Turn Based Ticking (effects tick on the affected fighter's next team turn)

**How it works:** Effects tick when the **affected fighter's** team acts next — regardless of who applied them. So a stun on an enemy ticks during the enemy team's turn; a buff on an ally ticks during the ally team's turn. This is effectively the same as Model C for self-applied effects, and is already how stuns work (they tick on the victim's team turn).

**Pros:**
- Semantically clean: "2 turns" means the effect is present for 2 of the affected fighter's turns
- Stun timing is already implemented this way (ticks on victim's team turn via `tickTeamTurn`)
- For self-buffs: identical to Model C (owner = affected fighter)

**Cons:**
- Indistinguishable from Model C for the vast majority of effects (where owner = affected fighter for self-buffs, victim = affected fighter for debuffs)
- For buffs applied by one fighter **to an ally**: the ally's team turn tick already handles this correctly under both C and D
- No new information over Model C — same implementation

**Implementation risk:** Same as Model C — remove the extra `endRound` call.

**Conclusion:** Model D is the same as Model C in practice given the current effect architecture.

---

## 5. Recommendation

**Recommended model: Model C (Owner-Turn Based Ticking).**

The fix is a single-line removal in `endRound` (and `endRoundTimeline`):

```typescript
// BEFORE (current, broken):
tickTeamTurn(state, ctx, getSecondPlayer(state.firstPlayer))  // in endRound
tickRoundEnd(state, ctx)

// AFTER (Model C, correct):
// tickTeamTurn(secondTeam) already ran in resolveTeamTurn(secondTeam)
tickRoundEnd(state, ctx)
```

### Decision rationale:

| Criterion | Model A | Model B | Model C |
|---|---|---|---|
| Player trust | ✗ Broken | ✓ Best | ✓ Good |
| Naruto-Arena-style tactical psychology | ✗ | ✓ | ✓ |
| Readability | Confusing | Clear | Clear |
| Fairness | ✗ Broken | ✓ Perfect | ✓ Good |
| Implementation risk | — | High | **Very Low** |
| Test compatibility | — | Major rewrites | Targeted fixes |
| UI clarity | Misleading | Good | Good |

**Model B is theoretically ideal** but requires a large-scale refactor of the tick architecture, all `endRound` sequences, and ~100+ tests. The risk is high for a timing model that many tests implicitly rely on.

**Model C achieves all the same player-facing guarantees** with a single-line removal. The skip guard, all tick functions, and the entire round structure remain intact. Only the redundant endRound `tickTeamTurn(secondTeam)` call is removed.

### Naruto-Arena alignment

Naruto-Arena used simultaneous-command rounds where all actions resolve before any tick occurs, then effects expire at round boundaries that both teams share. This is closest to **Model B** in spirit, but **Model C** produces the same player-visible outcome for all common cases: "N turns" means N of the affected team's turns. The difference is that Naruto-Arena's synchronized architecture makes the symmetry structurally obvious, while Model C achieves symmetry by removing the redundant tick.

---

## 6. Systems That Would Need Changes Under Model C

### Engine files

**`src/features/battle/engine.ts`**
- `endRound`: remove `tickTeamTurn(state, ctx, getSecondPlayer(state.firstPlayer))`
- `endRoundTimeline`: remove the same line
- `resolveRound` (deprecated): same removal

That is the complete engine change. No other function requires modification.

### Test areas

Any test that verifies duration behavior for the **second-acting team's effects** will need review. The currently-broken behaviors (replacement halved, costModifier halved, etc.) may have tests asserting the broken behavior — those would need to be updated to assert the correct (fixed) behavior.

Specifically, look for tests that:
1. Verify `abilityState` duration after a full round — currently 2 rounds → 1 round, should become 2 rounds → 2 rounds
2. Verify `costModifier` duration for the second team
3. Verify `effectImmunity` duration for the second team
4. Verify `reactionGuard` duration for the second team
5. Verify stun duration (likely already correct and should remain correct under Model C — the skip guard handles this)
6. Verify burn DOT tick count when applied to the second team by the first team

The `endRound` integration tests in `engine.test.ts` that use multi-round scenarios are the highest risk. Run `npm run test` after the change and investigate failures systematically.

### UI display concerns

The current UI displays `remainingRounds` from modifier duration. Under Model C, a modifier on the second-team fighter will tick once per round (not twice), so the displayed duration will count down correctly at rate 1/round instead of the current 2/round for second-team fighters. This is a **fix**, not a regression, but UI display tests (if any) may need updating.

No UI code changes are needed — the engine state change propagates automatically. The numbers shown will simply be more accurate.

### Kit rebalance concerns

Any existing character kit that was **designed with the double-tick in mind** (knowingly or not) may now have longer-than-expected effect durations when acting as second team. In practice, no kit was intentionally designed to exploit the double-tick — the bug was unknown at design time. However, audit the following:

- Any self-buff ability with `duration: 1` for the second team: was previously double-ticked (expired immediately), will now persist for 1 round as stated. Net effect: **buffs are stronger** for the second team, which is the correct direction.
- Any DOT with `duration: 2` applied to the second team: was previously only 1 damage tick, will now be 2 damage ticks. If kit balance was calibrated assuming 1 tick (because that's what the engine actually delivered), damage output increases. **Kit numbers may need audit** after fixing.

The most likely practical impact is that enemy DOT abilities that were previously delivering fewer ticks than intended will now deliver the correct number. This may make some encounters feel harder but is correct behavior.

---

## 7. Summary

| Topic | Conclusion |
|---|---|
| Current model | Per-team sequential with double-tick for secondTeam |
| Stuns | ✓ Symmetric (skip guard works correctly) |
| DOT/burn | ✗ Asymmetric: applied-to-secondTeam burns fire half the expected ticks |
| Replacement abilities | ✗ Asymmetric: second-team replacements have half effective duration |
| Cost modifiers, effect immunities, reaction guards | ✗ Asymmetric: second-team's own buffs have half effective duration |
| Cooldowns | ✗ Asymmetric: second-team cooldowns recover 2x faster per round |
| Shields | ✓ Not affected (no duration tracking) |
| Scheduled effects | ✓ Not affected (absolute round number, team-agnostic) |
| Team-scoped modifiers | ✓ Symmetric (tickRoundEnd, not tickTeamTurn) |
| Recommended fix | Model C: remove one `tickTeamTurn` call from `endRound` |
| Implementation risk | Very Low (single-line removal) |
| Before more kit design? | **Yes** — every self-buff, DOT, and replacement duration in every kit is currently wrong for the second-acting team |

**The fix should happen before any further kit design.** Duration values in kit templates have been written assuming "N rounds = N usable turns," but the engine currently delivers N/2 for many effect types when the fighter acts second. Kit tuning cannot be meaningful until the timing model is correct.

---

---

## 8. Phase 7B Implementation Note

**Status:** Implemented 2026-05-16. No code changes beyond what is described here.

**Files changed:**
- `src/features/battle/engine.ts` — removed the redundant `tickTeamTurn(secondTeam)` call from both `endRound` and `endRoundTimeline`. A comment citing Law 7.1 was added in place of each removed line.
- `src/features/battle/engine.test.ts` — added Phase 7B regression describe block with 7 focused tests.

**Exact change in `endRound` and `endRoundTimeline` (same pattern in both):**
```typescript
// REMOVED (was line 2468 / 2499):
tickTeamTurn(state, ctx, getSecondPlayer(state.firstPlayer))

// REPLACED WITH:
// Law 7.1: second team already received tickTeamTurn inside resolveTeamTurn(secondTeam).
// A second call here was the redundant double-tick fixed in Phase 7B.
```

**The deprecated `resolveRound` function was NOT changed.** In that legacy path, the first-team and second-team each get exactly one `tickTeamTurn` call at the end of their respective action blocks, with no endRound double call. The pattern there was already correct.

**Tests added (8 tests in Phase 7B describe block):**
1. First-team cooldown decrements by 1 per round
2. Second-team cooldown decrements by 1 per round (not 2)
3. First-team and second-team cooldown decrements are symmetric
4. Second-team effectImmunity decrements by 1 per round
5. Second-team reactionGuard decrements by 1 per round (skip guard for same-round applies correctly)
6. Second-team abilityState (replacement) decrements by 1 per round
7. 2-round skip-guard test: modifier appliedInRound is not decremented in the same round, then decrements correctly in round 2
8. Scheduled roundStart effect fires at the correct absolute round regardless of team order

**Stun note:** The stun skip guard was not testable via multi-turn stun persistence because stun modifiers are actively consumed in `resolveAction` when a stunned fighter's turn begins (line 1827 in engine.ts: `removeModifiersFromFighter(..., { statusKind: 'stun' })`). This is the correct and intended stun behavior — the stun is not expired by `tickModifiers` but consumed by the engine when the victim's action is rejected. The skip guard on `tickModifiers` prevents duration from counting down the same round it was applied, which is validated by the mark-status modifier test (test #7) using a non-action-consumed modifier type.

**No tests had to be corrected.** No existing test was asserting the double-tick behavior; they all passed both before and after the fix. The 8 new tests now document the correct symmetric behavior.

**Final test count:** 745 (up from 737 before Phase 7B).
