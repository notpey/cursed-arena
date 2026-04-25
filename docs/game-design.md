# Cursed Arena — Game Design Reference

This document is the single source of truth for how Cursed Arena is supposed to function as a game. It describes rules as they should work for the player, independent of the engine implementation. Use it to audit character kits, write tests, and keep the engine aligned with design intent.

---

## Teams and Victory

Each player fields a team of **3 characters**. A team is defeated when all 3 characters reach 0 HP. The last team with at least one living character wins. If both teams are eliminated on the same turn, the result is a draw.

---

## Turns and Phases

Each **round** has two halves: the first player acts, then the second player acts. At the start of each battle, a coin flip determines who goes first. The first-player advantage alternates each round so that the second player in round 1 becomes the first player in round 2, and so on.

**Each half of a round:**
1. The active player selects one skill per living character and assigns targets.
2. All selected skills resolve simultaneously, in the order they were queued.
3. After both halves complete, round-end effects tick (cooldowns decrement, durations expire, burn damage is dealt, etc.).

**Fatigue:** Starting on a configurable round (default: round 8), all living characters take increasing damage at the start of each round. This prevents indefinitely long games.

---

## Cursed Energy (Resources)

Cursed Energy is the resource used to activate skills. There are four named types and one flexible type:

| Type | Color | Engine Key |
|---|---|---|
| Force | Green | `physical` |
| Technique | Red | `technique` |
| Blessing | Blue | `vow` |
| Authority | White | `mental` |
| Random | Any | resolved at spend time |

At the start of each round, each living character generates **1 Cursed Energy** for their team. The type of that energy is determined randomly (25% chance each type). Because the draw is random, you may receive multiple of the same type in one round.

**Random Cursed Energy** in a skill's cost means "pay using any type." The player chooses which type(s) to spend when queuing the skill.

**Excess energy** carries over between rounds. There is no cap.

**Energy drain / steal:** Some skills remove or transfer energy from the opponent's pool. If the opponent doesn't have the specific type being drained, nothing happens.

---

## Health

Each character has a maximum HP of 100. Damage reduces current HP; healing restores it. HP cannot go above the character's maximum.

Characters at 0 HP are **defeated** and are removed from play. Defeated characters cannot be healed back.

---

## Damage

Damage reduces a character's HP (or shield, if one is active — see **Shields** below).

### Damage Classes

Every damaging skill belongs to one or more damage classes. These determine what defenses apply and what effects can interact with the damage:

- **Physical** — direct physical strikes
- **Energy** — cursed energy or technique-based damage
- **Affliction** — indirect or status-based damage; ignores both damage reduction and destructible defense (shields)
- **Mental** — psychological or spiritual damage

A skill may carry multiple classes (e.g., Melee + Physical + Action).

### Damage Types (internal)

At the packet level, damage also carries a type that describes its origin. This is separate from the class above and affects DoT behavior:

- **normal** — standard ability damage
- **burn** — damage-over-time from a burn status
- **fatigue** — domain pressure that scales each round
- **true** — bypasses all modifiers (reserved for special cases)

### Piercing Damage

Piercing damage ignores damage reduction effects on the target. It does not ignore shields or invulnerability unless those are also bypassed by flags on the skill.

### Affliction Damage (clarification)

Affliction-class skills ignore both damage reduction and destructible defense (shields). They still deal 0 damage to an invulnerable character unless the skill also carries the ignore-invulnerability flag.

### Increased / Reduced Damage

Modifiers can raise or lower the damage dealt or taken:
- **Flat** adjustment: adds or subtracts a fixed amount.
- **Percent** adjustment: multiplies by (1 + bonus). Multiple percent adjustments stack additively before multiplying.
- **Multiplier**: applies on top of the above as a direct coefficient.

Damage is always floored at 0 — modifiers cannot make damage negative (which would heal).

---

## Shields (Destructible Defense)

A shield is temporary protective HP that must be depleted before the character's actual HP takes damage. Healing does not restore shields.

- A character can only hold one shield at a time. Applying a new shield to a character who already has one adds to the existing amount.
- Affliction-class damage bypasses shields entirely and hits HP directly.
- When a shield is fully depleted, any remaining damage carries over to HP.
- Losing a shield triggers **onShieldBroken** reactions.

---

## Invulnerability

An invulnerable character **cannot be targeted by enemy skills** and cannot take damage from any source, except skills that explicitly carry the ignore-invulnerability flag.

- Invulnerability is applied as a timed status (rounds-based).
- Ongoing effects (burn DoT, fatigue) that were already applied before the character became invulnerable continue to tick unless they are also blocked by the ignore rules.
- Some effects prevent a character from gaining invulnerability at all.

---

## Healing

Healing restores a fixed or percentage-based amount of HP.

- HP cannot exceed the character's maximum. Excess healing is wasted unless a skill explicitly converts it to a shield (overheal-to-shield).
- Characters at 0 HP cannot be healed.
- Healing is affected by heal modifiers on the healer (healDone) and on the target (healTaken).

---

## Stuns

A stunned character **cannot use skills** for the duration of the stun. On their turn, a stunned character is forced to use their Pass skill instead.

- Duration is measured in **victim turns** — the number of turns the stunned character would have taken. Applying a stun during a round does not consume a duration tick until the character's next end-of-round tick.
- **Class stun**: A softer form of stun that only prevents skills of specific classes (e.g., Melee, Physical). The character can still use other skill classes.

---

## Cooldowns

A skill's cooldown is the number of turns it cannot be used after it is activated.

> Example: A skill with cooldown 4 cannot be used for the next 4 turns. After 4 full turns have passed, it becomes available again.

Cooldowns tick down by 1 at the end of each round. Effects can increase or decrease cooldowns. A cooldown cannot go below 0.

---

## Skill Classes

Every skill carries one or more class tags. Classes determine what stuns can seal them, what effects can target them, and what damage class the skill deals:

**Range:**
- **Melee** — close-range physical
- **Ranged** — at-range or projectile

**Damage Class:**
- **Physical** — direct physical
- **Energy** — cursed energy
- **Affliction** — ignores reductions and shields
- **Mental** — psychological / spiritual

**Action Type:**
- **Instant** — resolves immediately; does not create a persistent action
- **Action** — creates an ongoing action that can be countered on its first turn
- **Control** — disables or restricts; often a stun or seal

**Special:**
- **Ultimate** — powerful capstone skill; typically higher cost and damage
- **Unique** — character-specific rule; defined per character
- **Strategic** — team-support or setup skill
- **Special** — misc; catch-all for unusual mechanics

---

## Counters

A **counter** is a defensive reaction that activates when the character is targeted by an enemy skill.

When triggered, the counter:
1. Deals damage back to the attacker.
2. **Cancels** the incoming skill — the attacker's effects do not resolve.

Rules:
- Action-class skills can only be countered on their first turn.
- Counters can filter by skill class (e.g., only counter Melee skills).
- A counter may be single-use (consumes on trigger) or persistent.
- Skills with the `cannotBeCountered` flag bypass counters entirely.

---

## Reflect

A **reflect** reverses a skill's effects back onto the attacker.

When triggered:
- The attacker becomes the receiver of the reflected effects (damage, stuns, marks, burns, drains, etc.).
- The original target is unaffected by those reflected effects.
- The incoming skill is not fully cancelled — only the reflected effects are redirected.

Rules:
- Reflects can filter by skill class.
- A reflect is typically single-use.
- Skills with the `cannotBeReflected` flag bypass reflects.

---

## Reactions and Passives

**Reactions** are effects that fire automatically in response to combat events. Every character can have passive effects that define reaction rules.

### Trigger Events

| Trigger | When it fires |
|---|---|
| `onDealDamage` | This character deals damage to a target |
| `onTakeDamage` | This character takes damage |
| `onAbilityUse` | This character uses a skill |
| `onAbilityResolve` | This character's skill finishes resolving |
| `onBeingTargeted` | An enemy skill targets this character |
| `onShieldBroken` | This character's shield is destroyed |
| `onHeal` | This character is healed |
| `onShieldGain` | This character gains a shield |
| `onDefeat` | This character is defeated |
| `onDefeatEnemy` | This character defeats an enemy |
| `onRoundStart` | A new round begins while this character is alive |
| `onRoundEnd` | The round ends while this character is alive |

### Reaction Conditions

Reactions can require conditions before firing. All conditions on a reaction must be true for it to trigger. Conditions include:

- **HP threshold** — actor or target HP below a percentage
- **Status check** — actor or target has a specific status (stun, invincible, mark, burn, etc.)
- **Modifier tag** — actor or target has a modifier with a specific tag
- **Skill filter** — the triggering skill matches a class or is Ultimate
- **Fighter flag** — a boolean per-character flag is true or false
- **Mode check** — actor or target is in a specific mode/form
- **Counter threshold** — a character's stack counter is at or above a value
- **Ability history** — used a specific skill last turn, within N rounds, or on a specific target
- **First use on target** — this character has not yet used a skill (or a specific skill) on the current target this battle
- **Shield state** — a shield is or isn't active, or was broken with a specific tag

---

## Modifiers

Modifiers are temporary or permanent stat changes applied to a character, team, or the entire battlefield.

### Modifier Stats

| Stat | Effect |
|---|---|
| `damageDealt` | Changes how much damage this character deals |
| `damageTaken` | Changes how much damage this character receives |
| `healDone` | Changes how much this character heals others |
| `healTaken` | Changes how much healing this character receives |
| `cooldownTick` | Changes cooldown reduction rate per round |
| `dotDamage` | Burn damage dealt per round |
| `canAct` | Whether this character can act (false = stunned) |
| `isInvulnerable` | Whether this character is invulnerable |
| `isUndying` | Whether this character stays at 1 HP instead of dying |
| `canGainInvulnerable` | Whether this character can gain invulnerability |
| `canReduceDamageTaken` | Whether damage reduction applies to this character |

### Modifier Modes

- **flat** — adds or subtracts a fixed value
- **percentAdd** — adds a percentage (stacks additively with other percentAdd modifiers)
- **multiplier** — multiplies the final result
- **set** — forces the stat to a specific value (boolean modifiers)

### Modifier Stacking

When a modifier of the same type is applied to a character who already has that modifier:
- **max** — keep whichever duration is longer; don't duplicate
- **replace** — overwrite the existing modifier
- **stack** — allow multiple instances to coexist and sum

### Modifier Duration

- **rounds** — expires after N round-end ticks
- **permanent** — never expires
- **untilRemoved** — must be explicitly removed by an effect

### Modifier Scope

- **fighter** — affects only this character
- **team** — affects all characters on this team
- **battlefield** — affects all characters in the battle

### Damage Class Filtering

A modifier on `damageTaken` can specify which damage class it applies to:
- `damageClass` — only reduce damage of this class
- `excludedDamageClass` — skip this modifier when the incoming damage is of this class

---

## Status Effects

Statuses are named shorthand for common modifier combinations:

| Status | Effect |
|---|---|
| **Stun** | Character cannot act (`canAct: false`) |
| **Invincible** | Character is invulnerable (`isInvulnerable: true`) |
| **Mark** | Character takes extra flat damage (`damageTaken: flat: +N`) |
| **Burn** | Character takes DoT damage each round (`dotDamage: flat: +N`) |
| **Attack Up** | Character deals extra flat damage (`damageDealt: flat: +N`) |

---

## Modes and Forms

A **mode** represents a character's current form or stance (e.g., Gorilla Mode, Infinity Active). Modes are string keys stored per character.

- A character can be in multiple modes simultaneously.
- Skills and passives can check what mode a character is in using conditions.
- Modes can be timed: if a duration is given, the mode expires after that many victim turns. If no duration is given, the mode persists until explicitly cleared.
- Setting a mode that is already active resets its duration.

---

## Character-Specific Counters

Some characters have numeric counters that track stacks, charges, or ammo (e.g., Cursed Bullets, Scorched stacks). These are displayed as pips on the character's portrait.

- Counters are initialized to a starting value per character.
- They are adjusted by effects: `adjustCounter` (add/subtract, with optional min/max clamping), `setCounter` (set to a fixed value), `resetCounter` (set to 0).
- Skills can scale in power or duration based on counter values.
- Counters can be consumed as part of a skill's effect.

---

## Effect Immunity

A character can be made immune to specific effect types for a duration. While immune, those effects are ignored when they would be applied to that character. Immunities can stack.

---

## Energy Manipulation

Skills can:
- **Gain energy**: Add energy to your team's pool.
- **Drain energy**: Remove energy from the opponent's pool. If the opponent lacks the specified type, nothing happens.
- **Steal energy**: Remove energy from the opponent and add it to your own pool.

---

## Ability History and "First Use" Tracking

The engine tracks the last 12 skills each character has used, including what target they used them on. This enables conditions like:
- "This is the first time this character has used any skill on this specific enemy."
- "This character used skill X within the last 2 rounds."
- "This character used a different skill last turn."

---

## Passive Skill Effects

Some characters have passive effects that always modify their behavior without occupying a skill slot. Passives can:
- Apply ongoing modifiers while the character is alive.
- React to combat events (see **Reactions**).
- Conditionally fire effects when thresholds are crossed.

Passives are authored as part of the character's template and cannot be copied by default.

---

## Copy

Some skills copy another skill, temporarily replacing one of the user's skills. Skills that require a prerequisite to have been used first (e.g., they check ability history) cannot be copied.

---

## Invisible Skills

Some skills are invisible to the opponent: the opponent cannot see the skill's icon while it is active. The opponent may know a skill is being used without knowing its target.

---

## Load / Revert State

A skill may return a character's effects, skills, and HP to how they were on the previous turn. Effects that were not present at that time are removed.

---

## Increasing or Decreasing Duration

Some effects modify the duration of an active skill or status. When a duration is modified, all effects connected to that skill via "during this time" are modified together.

---

## Replacing Skills

A skill can be partially or fully replaced: its cost, cooldown, effect list, or icon may change. Replacement is typically temporary and duration-based.

---

## Round Summary (Quick Reference)

```
Round Start:
  - Rotate first player
  - Tick scheduled roundStart effects
  - Apply burn DoT damage
  - Fire onRoundStart passives
  - Check for winner
  - Generate energy (+1 random type per living character per team)

Player 1 Command → Player 1 Resolve (per queued action):
  - Check stun / class stun → force Pass if blocked
  - Pay energy, set cooldown
  - Fire onAbilityUse / onBeingTargeted reactions
  - Run pre-damage window (counter check → reflect check)
  - If not cancelled → resolve all effects
  - Fire onAbilityResolve, record ability history

Player 2 Command → Player 2 Resolve (same flow)

Round End:
  - Apply fatigue (if applicable)
  - Tick scheduled roundEnd effects
  - Fire onRoundEnd passives
  - Decrement cooldowns
  - Expire timed modifiers / statuses
  - Tick ability state durations
  - Tick cost modifiers
  - Tick effect immunities
  - Tick class stuns
  - Tick reaction guards (counters, reflects)
  - Tick state mode durations
```

---

## Terminology Glossary

| Term | Meaning |
|---|---|
| Damage | Reduces a character's HP (or shield if one is active) |
| Piercing Damage | Damage that ignores damage reduction |
| Affliction Damage | Damage that ignores damage reduction and shields |
| Increased Damage | Damage raised by a flat, percent, or multiplier modifier |
| Stun | Prevents a character from using skills for a set duration |
| Class Stun | Prevents a character from using skills of specific classes |
| Damage Reduction | Reduces incoming damage after all bonuses are calculated |
| Invulnerable | Cannot be targeted or damaged (except by bypass flags) |
| Heal | Restores HP; cannot exceed maximum; cannot revive |
| Drain Cursed Energy | Removes energy from the opponent's pool |
| Steal Cursed Energy | Removes energy from the opponent and adds it to yours |
| Reflect | Returns an incoming skill's effects to the attacker |
| Counter | Cancels an incoming skill and deals damage to the attacker |
| Remove Effect | Completely removes a named status or modifier |
| Ignore Effect | The effect is present but does not apply to this skill |
| Destructible Defense | Temporary protective HP (shield) that absorbs damage first |
| Copy | Temporarily replaces a skill slot with another skill |
| Invisible | Opponent cannot see the skill's icon while active |
| Increasing/Decreasing Duration | Extends or shortens an active effect's remaining turns |
| Replace | Partially or fully swaps a skill's cost, cooldown, or effects |
| Load/Revert State | Returns a character to their state from the previous turn |
| Mode / Form | A named state that changes a character's behavior |
| Counter (stacks) | A numeric value tracking charges, ammo, or stacks |
| Fatigue | Escalating damage applied to all characters in late rounds |
