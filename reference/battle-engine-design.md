# Cursed Arena — Battle Engine Design

## Philosophy

Naruto-Arena proved that turn-based 3v3 combat with a shared energy pool is deeply engaging. The strategic layer — reading your opponent, managing resources, building team synergy — is the core that made the game addictive. Cursed Arena preserves that core while expanding the engine's expressive power.

**What we keep:**
- Sequential turn structure (Player A acts → resolves, Player B acts → resolves, coin flip for who goes first)
- 3v3 team format with a shared energy pool
- Simple, fixed damage numbers (no RNG rolls)
- 4 skills per character (3 standard + 1 ultimate)
- Compact matches (typically 8–15 rounds)

**What we expand:**
- Variable HP pools (not fixed 100 for everyone)
- A data-driven trigger/passive system (no hardcoded ability checks)
- Character-unique passives that shape playstyle per game
- Conditional "if X then Y" ability effects
- Quality-of-life improvements to the overall experience

---

## Turn Structure

### How Naruto-Arena worked (and how we replicate it)

Naruto-Arena was **not** simultaneous. It was sequential:

1. A coin flip determines who goes **first** for the match (Player A or Player B)
2. **Player A's turn:** Player A selects one skill for each of their living characters, then presses Ready. All of Player A's actions resolve immediately — damage is dealt, heals are applied, statuses are inflicted, deaths are checked.
3. **Player B's turn:** Player B now sees the results of Player A's actions and selects their own skills. Player B presses Ready, and their actions resolve.
4. This constitutes **one round**. A new round begins, and the process repeats.

**Who goes first stays consistent for the entire match** (determined by the initial coin flip). This means going second is a consistent strategic advantage — you always get to react to your opponent's plays. The coin flip balances this by making it random.

### Phase Order (per round)

```
1. ROUND START / UPKEEP
   - Tick status durations (burn, mark, buff, debuff)
   - Apply DoT damage (burn, etc.)
   - Apply regen/passive healing
   - Check for deaths from DoT
   - Generate energy for both teams (1 per living character per team)

2. FIRST PLAYER'S TURN
   - Player selects one skill per living character
   - 60-second timer (auto-pass on timeout)
   - Player presses Ready
   - All of this player's actions resolve immediately
   - Damage dealt, heals applied, statuses applied, deaths checked

3. SECOND PLAYER'S TURN
   - Second player sees updated game state (results of first player's actions)
   - Player selects one skill per living character
   - Player presses Ready
   - All of this player's actions resolve immediately

4. ROUND END / CLEANUP
   - Tick cooldowns down by 1
   - Remove expired statuses
   - Check win/loss conditions
   - Apply fatigue if past the fatigue threshold round
   - Advance round counter
```

### Why sequential matters

Going second is inherently advantageous — you see what your opponent did and can react. Naruto-Arena balanced this with the coin flip. We keep this because:
- It creates **asymmetric strategy** — the first player wants to set up plays that are hard to react to, the second player wants to capitalize on information
- It makes **defensive skills more interesting** for the first player (you defend preemptively, hoping you guessed right)
- It makes **aggressive plays riskier** for the first player (if you commit and miss, the second player punishes)

---

## Energy System

### Simple for now

Each round, each team receives energy based on **living characters**:
- 3 alive → 3 energy
- 2 alive → 2 energy
- 1 alive → 1 energy

Energy enters a **shared reserve pool**. All characters on a team draw from the same pool. Unspent energy carries over between rounds.

Skills have costs defined in terms of the four energy types (Physical, Cursed Technique, Binding Vow, Mental). The reserve is generic — spending any type deducts from the same pool.

We'll revisit energy balance, focus mechanics, and potential energy denial later. For now, the goal is to get the core loop working.

---

## Skill System

### Structure

Every character has:
- **3 standard skills** — varying costs, cooldowns, and purposes
- **1 ultimate skill** — expensive (costs 3 energy), high-impact, long cooldown

### Skill Properties

Each skill defines:

```
id, name, description
kind: attack | heal | defend | buff | debuff | utility | pass
targetRule: self | enemy-single | enemy-all | ally-single | ally-all
cost: { physical?, technique?, vow?, mental? }
cooldown: number (turns after use before available again)
power: number (flat damage/heal amount)
tags: string[] (ATK, HEAL, BUFF, DEBUFF, UTILITY, ULT)
```

### Targeting

Keep it simple (same as Naruto-Arena):
- **Self** — affects only the user
- **Single enemy** — pick one opponent
- **All enemies** — hits all living opponents
- **Single ally** — pick one teammate
- **All allies** — affects all living teammates

No positional mechanics. The original proved this works.

### Cooldowns

- Standard skills: 1–3 turn cooldowns
- Ultimates: 4–5 turn cooldowns
- Some cheap skills: 0–1 turn cooldown (usable frequently but low power)
- Cooldowns tick down by 1 each round during cleanup
- Passive cooldown reduction exists (e.g., Gojo's Six Eyes)

---

## Damage and Defense Model

### Damage Calculation

```
base = ability.power + actor.attack
modifiers:
  + actor.attackUpAmount (if buffed)
  + target.markBonus (if marked/vulnerable)
  × (1 + actor.passive.damageBoost) (if passive applies)
  × (1 + actor.passive.executeBonus) (if target below threshold)
  × (1 + battlefield.ultimateDamageBoost) (if ultimate)

final = base after modifiers, floored to integer
```

Damage is **deterministic**. No crits, no RNG rolls. You can always calculate exactly how much a skill will deal.

### Defense (current)

- **Invulnerability** — blocks all incoming damage for the turn. Usually 1-turn duration, high cooldown.

### HP Pools (variable)

Characters have different max HP values (currently 88–112):
- Tanks: 105–115 HP
- Standard: 90–105 HP
- Glass cannons: 80–92 HP

---

## Status Effects (current)

| Status | Effect |
|--------|--------|
| Stun | Cannot use skills, forced to pass for N turns |
| Invincible | Blocks all incoming damage for N turns |
| Burn | X damage per turn for N turns (ticks at round start) |
| Mark | +X damage taken from all sources for N turns |
| Attack Up | +X damage dealt for N turns |

---

## Win/Loss Conditions

**Primary:** KO all 3 enemy characters.

**Fatigue (anti-stall):** After round 7, both teams take escalating fatigue damage each round:
- Round 7: 6 damage
- Round 8: 8 damage
- Round 9: 10 damage
- etc. (+2 per round)

**Draw:** If both teams' last characters die in the same round (from DoT or fatigue), the game is a draw.

---

## Trigger & Passive System (Priority #1 for expansion)

This is the biggest expansion over Naruto-Arena's engine. NA couldn't do "if X then Y" — everything was static. Cursed Arena needs a **data-driven trigger system** so new character mechanics don't require engine code changes.

### What we already have (hardcoded)

These passives exist but are implemented as special-case code in the engine:

| Character | Passive | How it works |
|-----------|---------|--------------|
| Gojo | Six Eyes | Cooldown reduction: all cooldowns tick down 1 extra per round |
| Megumi | Ten Shadows | Damage boost: all damage dealt increased by 8% |
| Yuji | Vessel Body | Regen: heals 6 HP per round |
| Jogo | Volcanic Core | Burn on hit: when dealing damage, applies 7 burn for 2 turns |
| Nanami | Ratio Technique | Execute: 22% bonus damage when target is below 45% HP |

Additionally, stun application is hardcoded per ability ID (`gojo-blue` and `megumi-nue` specifically check by ID).

### What we need: a generalized system

Instead of `if (ability.id === 'gojo-blue') { apply stun }`, abilities should declare their effects as data:

```typescript
type SkillEffect =
  | { type: 'damage'; power: number; target: 'inherit' }
  | { type: 'heal'; power: number; target: 'inherit' }
  | { type: 'applyStatus'; status: 'stun' | 'burn' | 'mark' | ...; duration: number; value?: number; target: 'inherit' }
  | { type: 'invulnerable'; duration: number; target: 'self' }
  | { type: 'attackUp'; amount: number; duration: number; target: 'self' }
  | { type: 'removeStatus'; status: string; target: 'inherit' }

type PassiveEffect =
  | { trigger: 'onDealDamage'; effect: SkillEffect }
  | { trigger: 'onTakeDamage'; condition?: { threshold: number }; effect: SkillEffect }
  | { trigger: 'onRoundStart'; effect: SkillEffect }
  | { trigger: 'onDeath'; effect: SkillEffect }
  | { trigger: 'onKill'; effect: SkillEffect }
  | { trigger: 'whileAlive'; effect: SkillEffect }  // permanent passive like cooldown reduction
  | { trigger: 'onTargetBelow'; threshold: number; effect: SkillEffect }  // execute
```

### Why this matters

With a generalized system, creating a new character with a unique passive like "when this character takes lethal damage, survive with 1 HP once per match" or "when an ally dies, gain 30% attack for 2 turns" becomes a **data entry**, not an engine change. This is the single most important architectural improvement.

### Character-unique passives (design space)

The passive system opens up design space Naruto-Arena never had:

- **Counter-attack:** "When hit by a single-target attack, deal 10 damage back to the attacker"
- **Last Stand:** "When below 25% HP, all skills cost 1 less energy"
- **Copy:** "The first time an enemy uses an ultimate, copy it (usable once)"
- **Sacrifice:** "When an ally would die, this character takes the lethal damage instead (once per match)"
- **Escalation:** "Each time this character uses an attack skill, the next attack deals +5 damage (stacks)"
- **Disruption:** "When this character stuns an enemy, steal 1 energy from their team"
- **Domain:** "While this character is alive, all allies take 5 less damage" (aura passive)

Each of these is expressible as a trigger + effect combination, no special-case code needed.

---

## What Our Engine Already Has vs. What Needs to Change

### Already implemented ✓
- 3v3 teams with shared energy pool
- Deterministic energy generation (1 per living character)
- Speed-based resolution order
- Fixed damage calculation with attack stat + power
- Invulnerability status
- Burn DoT
- Mark/vulnerability debuff
- Attack Up buff
- Stun (full)
- Cooldown system with passive cooldown reduction
- Execute threshold passive (Nanami)
- Damage boost passive (Megumi)
- Regen passive (Yuji)
- Burn-on-hit passive (Jogo)
- Fatigue system
- Enemy AI (basic priority scoring)
- Battle event log

### Needs to change for sequential turns ✗
- **Turn structure:** Currently resolves all actions in one pass sorted by speed. Needs to change to: Player A's actions resolve fully → game state updates → Player B sees results → Player B's actions resolve.
- **Coin flip:** Add initial turn-order determination at match start.
- **UI flow:** Currently both players queue simultaneously and press Ready once. Needs to become: active player queues and presses Ready → resolution animation → other player's turn activates.
- **Enemy AI:** Currently builds all commands at once. Needs to react to the player's resolved actions (if AI goes second) or commit blind (if AI goes first).

### Needs implementation for trigger system ✗
- Generalized `SkillEffect` type replacing hardcoded ability logic
- Generalized `PassiveEffect` type replacing hardcoded passive checks
- Engine resolver that reads effects from data instead of checking ability IDs
- Ability data updated to declare effects instead of relying on `kind` alone

### Implementation priority

**Phase 1 — Sequential turn structure:**
Refactor the resolution loop to process one team's actions fully before the other team acts. Add coin flip. Update UI flow.

**Phase 2 — Generalized trigger/passive system:**
Define `SkillEffect` and `PassiveEffect` types. Refactor the resolver to read from data. Migrate existing abilities and passives to the new format.

**Phase 3 — New character passives:**
Design and implement characters that showcase the new trigger system capabilities.

---

## Differences from Naruto-Arena (summary)

| Aspect | Naruto-Arena | Cursed Arena |
|--------|-------------|--------------|
| Turn structure | Sequential (P1 → resolve → P2 → resolve), coin flip for order | Same — preserved faithfully |
| Energy generation | Random chakra types each turn | Deterministic: 1 per living character, shared pool |
| HP pools | Fixed 100 for all characters | Variable (80–115) per character |
| Speed stat | None | Determines resolution order within a turn |
| Passive abilities | None (characters were purely their 4 skills) | Unique per-character passives with trigger system |
| Conditional effects | Not possible in the engine | Data-driven trigger system (on-hit, on-death, threshold, etc.) |
| Match length | No limit (could stall forever) | Fatigue after round 7 forces conclusion |
| Character skills | 4 skills, all equal | 3 standard + 1 ultimate (higher cost/impact) |
