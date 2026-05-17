# System Inventory: Cursed Arena vs. Naruto-Arena
> Phase 1 — Discovery Only. No fixes proposed.

**Source A:** Cursed Arena (`src/features/battle/`)  
**Source B:** Naruto-Arena (`EmpressClover/Naruto-Arena` on GitHub)  
**Date:** 2026-05-16  

---

## Table of Contents

1. [Battle Architecture](#1-battle-architecture)
   - [Turn Structure](#11-turn-structure)
   - [Action Resolution](#12-action-resolution)
   - [Queue System](#13-queue-system)
   - [Status Resolution](#14-status-resolution)
   - [Timing Systems & Delayed Effects](#15-timing-systems--delayed-effects)
   - [Counter Systems](#16-counter-systems)
   - [Protection Systems](#17-protection-systems)
   - [Cooldown Handling](#18-cooldown-handling)
   - [Targeting Rules](#19-targeting-rules)
   - [Resource Systems](#110-resource-systems)
2. [Skill System Architecture](#2-skill-system-architecture)
   - [Skill Schema](#21-skill-schema)
   - [Effect Pipeline](#22-effect-pipeline)
   - [Status Effect Vocabulary](#23-status-effect-vocabulary)
   - [Conditional Logic](#24-conditional-logic)
   - [Temporary Skill Replacement](#25-temporary-skill-replacement)
   - [Transforms / Forms](#26-transforms--forms)
   - [Combo Structures](#27-combo-structures)
3. [UI/UX Battle Flow](#3-uiux-battle-flow)
   - [Turn Cadence](#31-turn-cadence)
   - [Player Decision Flow](#32-player-decision-flow)
   - [Information Density](#33-information-density)
   - [Cooldown Visibility](#34-cooldown-visibility)
   - [Enemy Visibility](#35-enemy-visibility)
   - [Target Readability](#36-target-readability)
   - [Pacing](#37-pacing)
4. [Meta Systems](#4-meta-systems)
   - [Missions](#41-missions)
   - [Progression & Unlocks](#42-progression--unlocks)
   - [Ladder](#43-ladder)
   - [Clans](#44-clans)
   - [Profiles](#45-profiles)

---

## 1. Battle Architecture

### 1.1 Turn Structure

#### Cursed Arena
The engine in `engine.ts` uses an explicit `TurnPhase` enum:

```
coinFlip → firstPlayerCommand → firstPlayerResolve
         → secondPlayerCommand → secondPlayerResolve
         → roundEnd → (repeat) → finished
```

Both players act **sequentially**, not simultaneously. A coin flip at game start determines who commands first for the entire match (the first-mover advantage is fixed). Each round: Player A queues → Player A resolves → Player B queues → Player B resolves → round-end tick. This is a **sequential asymmetric** model.

The engine does support an `resolveInterleavedPlayerTurnTimeline()` path where players can manually reorder commands across teams, but the default path is strict phase ordering.

There is no per-turn timer enforced in the engine code itself — timer enforcement appears to be a UI/server concern.

#### Naruto-Arena
Uses **simultaneous submission**. Both players queue actions during the same 60-second window (`TURN_DURATION_MS = 60_000`). Once both submit (or the timer expires), the server resolves all queued actions in one batch. The client polls for state updates (`GET /api/match/{matchId}`) rather than receiving push updates.

Resolution order within a simultaneous turn is based on queue order and skill priority, not who-pressed-first. There is no concept of a "first player" per turn — both players lock in simultaneously.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no simultaneous submission | Players can react to seeing the opponent's queue (depending on UI visibility — a major tactical difference) |
| No hard turn timer at the engine level in Cursed Arena | Naruto-Arena's 60s clock creates urgent, forced decisions |
| Cursed Arena's first-mover advantage is fixed at coinFlip | Naruto-Arena has no such structural advantage — symmetry is built-in |
| Simultaneous resolution means "I don't know what you'll do" | This is the heart of Naruto-Arena's decision tension |

**Confidence:** High (both systems thoroughly documented in source)

---

### 1.2 Action Resolution

#### Cursed Arena
Each action is resolved immediately after it is submitted within a phase. The resolution pipeline per ability:

1. Validate actor is alive and not stunned
2. Resolve effective ability (accounting for ability state deltas / replacements)
3. Pay energy cost
4. Compute target(s) — check invulnerability, effect immunity, required tags
5. Check counters and reflects — if present, fire them and potentially abort
6. Execute effects sequentially (damage, status, shields, etc.)
7. Fire passive triggers (`onAbilityUse`, `onAbilityResolve`, `onDealDamage`, etc.)
8. Emit events for UI log

The resolution is fully synchronous and deterministic. There is no RNG in damage values (damage is fixed power, modified by modifiers).

#### Naruto-Arena
Server-side batch resolution after both players submit. The pipeline:

1. Validate all queued skills (affordability, cooldowns, targets)
2. Resolve skill replacements via `resolveEffectiveSkill()`
3. Execute effects sequentially per queued action
4. After each harmful skill: trigger reactive defenses (`maybeTriggerReactiveDefenses()`)
5. Attempt reflect (`maybeTriggerReflectDamage()`)
6. Decrement status durations at turn end
7. Auto-timeout if unresolved random chakra lingers

Naruto-Arena has **randomness in damage** — certain skills have variable damage ranges. It also has **evasion** (`getEvadeChanceAgainstSkill()`) that creates RNG in outcome (probability of miss).

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no hit-or-miss evasion | Naruto-Arena evasion creates "did I commit to the right play?" uncertainty |
| Cursed Arena damage is fully deterministic | No variance means min-maxing is purely about math, not chance |
| Naruto-Arena resolves both players' full queues in one batch | Players cannot react mid-turn — decisions are true commitments |
| Naruto-Arena can auto-resolve timeout turns | Prevents game-stall; Cursed Arena has no such fallback |

**Confidence:** High

---

### 1.3 Queue System

#### Cursed Arena
Each player queues one action per living fighter (up to 3 per team). The queue is:

```typescript
QueuedBattleAction = {
  actorId: string
  team: BattleTeamId
  abilityId: string
  targetId?: string | null
  randomCostAllocation?: Partial<Record<BattleEnergyType, number>>
}
```

Actions are stored per-actor in a map keyed by `instanceId`. The queue preview in `buildQueuePreview()` includes:
- Pending scheduled effects (upcoming delayed abilities)
- Player-queued actions (draggable, reorderable)
- `onRoundStart` passives (auto-fire, non-movable)
- Active reaction guards (visible but non-movable)

**Players can reorder their own queue** — the `actionOrder` array controls execution sequence. This is a meaningful tactical choice: acting with fighter B before fighter A can change outcomes (e.g., if A's skill applies a buff that B benefits from).

#### Naruto-Arena
Similarly, players queue one action per character (3 characters). The queue structure:

```javascript
queuedByActorSlot: {}  // skill per character slot
queueOrder: []         // execution sequence (slot indices)
```

Players can also **drag-reorder** their execution sequence before submitting. This reorder is submitted via `POST /api/match/{matchId}/skill/reorder`.

Random chakra must be resolved before submission — the UI forces allocation of unresolved `random` chakra costs.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Both systems support queue reordering | This is present in Cursed Arena — not a gap |
| Naruto-Arena forces random chakra resolution before commit | Cursed Arena has no equivalent random element in energy |
| Naruto-Arena's queue is submitted together with random assignments | The allocation step creates an additional decision layer |
| Cursed Arena shows reaction guards in queue preview | Naruto-Arena does not surface this information pre-turn |

**Confidence:** High

---

### 1.4 Status Resolution

#### Cursed Arena
Status effects are implemented as **modifiers** (the `BattleModifier` system) rather than a separate status list. The modifier system supports:

- **Stats:** `damageDealt`, `damageTaken`, `healDone`, `healTaken`, `cooldownTick`, `dotDamage`, `canAct`, `isInvulnerable`, `isUndying`, `canGainInvulnerable`, `canReduceDamageTaken`
- **Duration:** `rounds` (countdown), `permanent`, `untilRemoved`
- **Modes:** `flat`, `percentAdd`, `multiplier`, `set`
- **Stacking:** `max`, `replace`, `stack`
- **Scope:** `fighter`, `team`, `battlefield`

There is also a legacy `BattleStatusKind` system (`stun`, `invincible`, `mark`, `burn`, `attackUp`) that overlaps with the modifier system — these are the "named" statuses surfaced in UI badges.

Duration decrements happen at **round end** via `endRound()`. There is no "tick at start of my turn" vs "tick at end of my turn" distinction — all durations tick together at the global round end.

#### Naruto-Arena
Statuses are discrete objects with explicit fields:

```javascript
{ id, remainingTurns, metadata }
```

Duration decrements at **turn end** (the shared round end). Statuses can carry rich metadata that directly drives gameplay:
- Damage bonuses/reductions
- Chakra cost modifications
- Skill replacement maps (by remaining turns: `skillReplacementsByRemainingTurns`)
- Targeting restrictions
- Reactive trigger conditions

A critical nuance: Naruto-Arena statuses can have **`onExpireEffects`** — when a status runs out, it can fire additional effects. This creates anticipatory gameplay: "this status will expire and do something when it does."

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no `onExpireEffects` equivalent | Status expiry is silent — no burst-on-expire mechanics |
| Naruto-Arena's status-driven skill replacement is per-remaining-turn granular | Cursed Arena replacement is duration-based but less granular |
| Cursed Arena has no "turn starts before/after my turn" status timing distinction | Some NA statuses implicitly vary in when they tick |
| Cursed Arena's modifier system is very powerful but invisible | Players cannot easily see what each modifier does without rich tooltip coverage |

**Confidence:** High

---

### 1.5 Timing Systems & Delayed Effects

#### Cursed Arena
Supports **scheduled effects** via the `schedule` effect type:

```typescript
{
  type: 'schedule'
  delay: number        // rounds from now
  phase: 'roundStart' | 'roundEnd'
  effects: SkillEffect[]
}
```

These are stored in `state.scheduledEffects` and resolved by `resolveScheduledEffects()`. They appear in the queue preview as draggable items labeled "DLY." Scheduled effects track the original actor, target(s), and ability ID, so they resolve relative to the original context.

#### Naruto-Arena
Does not have a discrete "schedule" effect type. Instead, delayed mechanics are implemented as **status effects that do work over time**: a status with `remainingTurns: 3` that deals damage each turn is functionally a 3-turn delayed/repeating effect. The `randomEnemyDamageOverTime` effect type in the original design is closest to multi-turn scheduling.

There is no explicit "this skill will fire in 2 turns" mechanic — everything lives in the status metadata.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena's `schedule` system is more explicit | Delayed effects are real game objects visible in the queue |
| Naruto-Arena uses status durations as implicit delay | Less transparent but creates the same effect through different means |
| Cursed Arena shows DLY pips on portrait | Clear but small — may not convey "this will hurt on round 3" urgency |
| Neither system has a countdown clock shown on scheduled effects' remaining rounds | Players must remember or check |

**Confidence:** Medium-High (Naruto-Arena's delayed mechanics were inferred from status architecture; no explicit schedule type was found)

---

### 1.6 Counter Systems

#### Cursed Arena
Three distinct reactive mechanic types:

1. **Counter** (`counter` effect): Fires when the actor is targeted by a harmful skill. Returns a fixed damage amount to attacker, filtered by `abilityClasses`. `consumeOnTrigger` determines if it's one-shot or persistent.

2. **Reflect** (`reflect` effect): Redirects the ability's full effects back to the attacker. Also filtered by `abilityClasses`, also optionally consumed on trigger.

3. **Reaction Guards** (`reaction` effect): A generic post-event system. Can trigger on `onAbilityUse`, `onBeingTargeted`, `onDamageApplied`, `onDamageBlocked`, `onShieldBroken`, `onDefeat`, `onDefeatEnemy`. Can fire arbitrary `effects[]`, filtered by harmfulness, ability class, whether it's a new skill, and has `oncePerRound` support.

Counter and Reflect both check `cannotBeCountered` and `cannotBeReflected` flags on the incoming ability before firing.

#### Naruto-Arena
Reactive mechanics are implemented entirely through **status metadata** on trap statuses:

- `triggerOnEnemyHarmfulSkill` — Any harmful skill triggers the trap
- `triggerOnEnemyHarmfulNonMental` — Non-mental harmful skills only (Mental skills bypass this)
- `counterDamage` — Damage reflected to attacker
- `counterDamageIgnoresReduction` — Armor-piercing counter
- `counterStatusId` — Apply status to attacker on trigger
- `counterEffectsToSourceOwner` — Effect array on trap owner (self)
- `counterEffectsToEnemiesOfSource` — Broadcast effects to trap owner's allies
- `removeStatusIdsOnTrigger` / `removeStatusGroupIdsOnTrigger` — Cleanup on fire
- `cancelEnemyStatusesByIdFromSelfSource` — Strip specific statuses from attacker

Naruto-Arena adds a **Mental skill bypass rule**: traps with `triggerOnEnemyHarmfulNonMental` are not triggered by Mental-class skills. This creates a specific rock-paper-scissors dynamic — Mental attackers bypass traps.

There is also a separate `reflectFirstHarmfulDamage` metadata that reflects the first harmful damage hit (one-shot, tracked via `_lastReflectTurnMarker` to prevent double-triggers on the same turn).

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no "Mental bypasses counters" rule | Naruto-Arena's Mental class is specifically an anti-trap tool — this is a core tactical axis |
| Cursed Arena counter fires on targeting, not on damage | Naruto-Arena counter fires on damage landing — subtle but different timing |
| Naruto-Arena counter can broadcast effects to attacker's allies | Cursed Arena counter only affects the attacker |
| Cursed Arena Reaction Guards are more powerful/flexible | But they don't have Naruto-Arena's clean class-bypass taxonomy |
| Naruto-Arena tracks "already reflected this turn" | Prevents stacking reflect from multiple statuses within the same turn |

**Confidence:** High

---

### 1.7 Protection Systems

#### Cursed Arena
Multiple layers:

1. **Invulnerability** (`invulnerable` effect / `isInvulnerable` modifier): Blocks all damage. Can be bypassed by damage packets with `ignoresInvulnerability: true` or abilities with that flag.

2. **Shields** (destructible defense): Stored as `BattleShieldState[]` per fighter. Absorb damage before HP. Multiple shields stack. Can be tagged; `breakShield` and `shieldDamage` effects target shields by tag. Broken shields trigger `onShieldBroken` passives and reaction guards.

3. **Undying** (`isUndying` modifier): HP cannot reach 0 while active. Stays at 1 HP. Distinct from invulnerability — damage still registers but cannot kill.

4. **Damage reduction modifiers:** `damageTaken` (flat/percent, pierceable) and `unpierceableDamageReductionFlat/Percent` (cannot be bypassed). Class-specific filtering by `damageClass`.

5. **Effect Immunity** (`effectImmunity`): Blocks entire effect types (e.g., immune to `stun`, immune to `nonDamage`). Self-applied effects bypass own immunity.

#### Naruto-Arena
Also layered:

1. **Invulnerability:** `invulnerable` metadata — full block. `invulnerableToNonAffliction` — blocks non-affliction only. `invulnerableToSkillClasses` — blocks by class array.

2. **Destructible Defense (DD):** Shield-equivalent. Absorbs damage. `destroy_destructible_defense` effect removes it. `ignoreDestructibleDefense` flag on damage bypasses it.

3. **Damage Reduction:** `damageReductionFlat`, `damageReductionPercent` (pierceable), `unpierceableDamageReductionFlat/Percent` (not pierceable).

4. **Helpful Skill Immunity:** `invulnerableToHelpfulSkills` status — blocks beneficial effects from allies. Bypassed by `ignoreHelpfulInvulnerability` flag. This is a **distinct anti-buff defense** with no Cursed Arena equivalent.

5. **Minimum HP:** `minimumHp` metadata — cannot be reduced below this value. `minimumHpFromSelfSkillDamage` — self-damage threshold only. No "hard stop at 1" but rather an HP floor.

6. **Targeting Immunity:** `cannotBeTargeted`, `cannotBeTargetedByEnemy` — blocks single-target skills from even selecting this unit.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| **Cursed Arena has no "Helpful Skill Immunity"** | Naruto-Arena can make a unit unable to receive heals/buffs — creates "you can't help your ally" scenarios |
| **Cursed Arena has no targeting immunity** | Naruto-Arena's `cannotBeTargeted` prevents even selecting a unit as a single target |
| **Naruto-Arena has Affliction damage class that pierces non-affliction invulnerability** | Cursed Arena's Affliction class exists as a tag but the pierce rule is less systematically enforced |
| Naruto-Arena invulnerability-to-skill-class is fine-grained | "I'm immune to Chakra skills but not Taijutsu" — enables nuanced counterplay |
| Naruto-Arena's minimumHp is an HP floor, not a kill-prevention mechanic | Different gameplay feel from Undying — floor is a sustained tank tool; Undying is a burst survival tool |

**Confidence:** High

---

### 1.8 Cooldown Handling

#### Cursed Arena
- Tracked per fighter: `cooldowns: Record<string, number>` (0 = ready)
- Decremented at round end via `cooldownTick` modifier stat (default 1 per round)
- `cooldownTick` can be modified (e.g., flat -1 means abilities cool down twice as fast)
- `cooldownAdjust` effect: manually add/subtract from specific ability cooldowns
- `cooldownReduction` effect: passive bonus to tick rate
- `modifyAbilityCost` covers cooldown indirectly but is primarily about energy

There is no concept of a cooldown reset (setting to 0 directly) unless via `cooldownAdjust` with a large negative value.

#### Naruto-Arena
- Per-unit: `cooldowns[skillId] = remainingTurns`
- Decremented at turn end (once per round)
- `modify_cooldowns` effect: adjust specific skill's cooldown by value
- `nextUsedSkillCooldownAdjustment` status metadata: automatically adjusts the cooldown of the *next* skill the unit uses after casting

Naruto-Arena's **`nextUsedSkillCooldownAdjustment`** is a hidden nuance: a status can secretly increase the cost of the next skill used (e.g., "after using X, your next skill has +1 cooldown"). This is not surfaced prominently in the UI and creates invisible resource pressure.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Naruto-Arena's `nextUsedSkillCooldownAdjustment` has no Cursed Arena equivalent | A subtle cooldown-as-punishment mechanic, difficult for opponents to anticipate |
| Cursed Arena's `cooldownTick` rate modifier is more powerful | Can dramatically speed up recovery globally — Naruto-Arena has no equivalent |
| Neither system shows cooldown reduction bonuses in the UI clearly | Players may not know how fast their abilities recover |

**Confidence:** High

---

### 1.9 Targeting Rules

#### Cursed Arena
Target rules at ability level:
- `none` — No selection
- `self` — Caster only
- `enemy-single` — One opponent
- `enemy-all` — All opponents
- `ally-single` — One teammate
- `ally-all` — All teammates

Effect-level target overrides (EffectTarget):
- `inherit` — Use ability's rule
- `self`, `all-allies`, `all-enemies`, `other-enemies`
- `attacker` — Source of passive/ongoing effect
- `linked-target` — From reaction guard context
- `random-enemy` — Random opponent (used in scheduled effects)

Targeting constraints:
- Invulnerable fighters: harmful abilities cannot select them (unless `ignoresInvulnerability`)
- `requiredTargetTags`: target must have modifier tags matching criteria
- Alive requirement enforced

#### Naruto-Arena
Target types at skill level:
- `single-enemy`, `all-enemy`, `self`, `single-ally`, `all-allies`, `all-units`
- Random filtered variants (tracked by `pickTrackedEnemyEntry()`)

Targeting strategies: `nearest-enemy`, `different-random-enemy`, `standard-random`

Status-imposed targeting restrictions:
- `cannotBeTargeted` — Blanket targeting immunity (single-target skills cannot select)
- `cannotBeTargetedByEnemy` — Enemy-only targeting restriction (allies can still target)

Effect can carry `cannotBeEvaded` flag to force accuracy against evasion.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| **No "cannotBeTargeted" targeting immunity in Cursed Arena** | This is a critical hidden mechanic — some Naruto-Arena characters create untargetable teammates |
| **No evasion / hit chance system in Cursed Arena** | All non-invulnerable units always take damage — no "dodge" gameplay |
| Naruto-Arena's `cannotBeTargetedByEnemy` allows allied targeting | Creates "I protect you from enemies but allies can still buff you" asymmetry |
| Naruto-Arena distinguishes "random filtered" targeting strategies | Cursed Arena `random-enemy` is simpler — one pool |

**Confidence:** High

---

### 1.10 Resource Systems

#### Cursed Arena
**Energy pool is shared per team.** One pool per team, not per fighter.

Types:
- `physical` (PHY) — Green
- `technique` (CT) — Red
- `vow` (SPC) — Blue
- `mental` (SPI) — White

Refresh: +1 random type per living fighter per round start (3 fighters → 3 energy per round).

Exchange: 5 energy (any combination) → converted to a different type (5:1 rate, manually triggered).

Cost modifiers: `set`, `reduceTyped`, `reduceRandom`, `increaseRandom`, `increaseTyped`

#### Naruto-Arena
**Chakra pool is also shared per team** (two players, one pool each).

Types: Taijutsu, Ninjutsu, Bloodline, Genjutsu, Random (unassigned)

Each turn, players receive random chakra (quantity and distribution is randomized). Random chakra must be allocated before submitting the turn — players choose which typed bucket to assign it to.

Exchange: 5 chakra (any combination) → converts to replaceable resources (5:1).

Status-based cost modifiers per type: `taijutsuCostReduction`, `ninjutsuCostIncrease`, etc.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| **Naruto-Arena has "random" chakra allocation as a decision point every turn** | Players must choose where random energy goes — a micro-decision that matters. Cursed Arena has no equivalent |
| Naruto-Arena's chakra distribution is random each turn (RNG) | Creates "good draw" and "bad draw" variance, like drawing cards |
| Cursed Arena energy gain is deterministic (+1 per living fighter) | Predictable economy; more consistent but less exciting |
| Naruto-Arena skills can drain specific chakra types | Type-specific drain (e.g., drain Bloodline) creates class-identity warfare |
| Cursed Arena has `energySteal` but not type-specific drain | Less identity-based economic warfare |
| Naruto-Arena has `spend_all_chakra` — destroy opponent's entire pool | A "nuclear" economic disruption effect with no Cursed Arena equivalent |

**Confidence:** High

---

## 2. Skill System Architecture

### 2.1 Skill Schema

#### Cursed Arena

```typescript
BattleAbilityTemplate = {
  id: string
  name: string
  description: string
  kind: BattleAbilityKind  // attack | heal | defend | buff | debuff | utility | pass
  targetRule: BattleTargetRule
  classes: BattleSkillClass[]
  intent?: BattleAbilityIntent  // harmful | helpful | mixed | neutral
  icon: BattleAbilityIcon
  cooldown: number
  cannotBeCountered?: boolean
  cannotBeReflected?: boolean
  requiredTargetTags?: string[]
  requiredActorConditions?: BattleReactionCondition[]
  energyCost?: BattleEnergyCost
  effects?: SkillEffect[]
  // Shorthand fields (for simple cases):
  power?: number
  healPower?: number
  attackBuffAmount?: number
  statusTurns?: number
  statusPower?: number
}
```

Abilities are typed by `kind` and `classes`, have explicit `intent`, and carry `requiredActorConditions` for state-gated use (e.g., only usable while in a certain mode).

#### Naruto-Arena

```javascript
{
  id, name, imageUrl,
  energy: ['Taijutsu', 'Ninjutsu'],  // array of chakra types
  targetType: 'single-enemy' | 'all-enemy' | ...,
  cooldown: number,
  classes: ['Physical', 'Melee', 'Instant'],
  effects: [ { type, ... } ]
}
```

Simpler schema — no explicit `kind`, `intent`, or `requiredActorConditions`. State gating is handled via effect conditions and skill replacement systems rather than ability-level flags.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena schema is more explicit and type-safe | Better for tooling but same gameplay capability |
| Naruto-Arena has no `requiredActorConditions` at ability level | Conditions live in effects — requires reading effect chain to know when ability is usable |
| Cursed Arena's shorthand fields (`power`, `healPower`) suggest many abilities are simple wrappers | Potential for rich abilities to be under-specified if shorthand is over-relied on |

**Confidence:** High

---

### 2.2 Effect Pipeline

#### Cursed Arena
40+ discrete effect types resolved sequentially. Key pipeline:

1. Ability resolved to effective form (accounting for state deltas)
2. Energy paid
3. Target(s) selected (with constraint checks)
4. Counter/Reflect check fires BEFORE effect execution
5. Effects execute in array order
6. Passive triggers fire AFTER resolution (`onAbilityResolve`, `onDealDamage`, etc.)
7. Events emitted for UI

Effect types with distinct semantics (selection):
- Damage: `damage`, `damageFiltered`, `damageScaledByCounter`, `damageEqualToActorShield`, `randomEnemyDamageOverTime`, `randomEnemyDamageTick`
- Healing: `heal`, `healScaledByCounter`, `setHpFromCounter`, `overhealToShield`
- Scheduling: `schedule` — deferred multi-turn resolution
- Conditional branching: `conditional` — if/else with condition array

The `conditional` effect is notable: it supports branching within a single ability resolution, allowing "if X then effect A else effect B."

#### Naruto-Arena
25+ effect types. Key pipeline:

1. Effective skill resolved (replacement chains followed)
2. Target options computed (filtering invulnerable units)
3. Target validated
4. Cost paid
5. Conditions evaluated per-effect (`doesEffectConditionMatch()`)
6. Effects execute in array order
7. Reactive defenses triggered after each harmful skill
8. Reflect check fires separately

No explicit `conditional` branching type — conditions are per-effect filters that include/exclude individual effects. There is no "else" branch — the "else" is simply another effect with the inverse condition.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has explicit `conditional` with else branch | Naruto-Arena uses dual-effect conditions to approximate this — less readable for kit designers |
| Naruto-Arena reactive defenses trigger AFTER each skill | Cursed Arena counters trigger BEFORE effect execution — opposite timing, opposite strategic implications |
| Cursed Arena passive triggers are richer (9+ trigger points) | Naruto-Arena reactions are status-metadata only (simpler but less flexible) |
| Cursed Arena `damageEqualToActorShield` type has no NA equivalent | Convert-shield-to-damage is a unique resource inversion mechanic |

**Confidence:** High

---

### 2.3 Status Effect Vocabulary

#### Cursed Arena
Named status effects (legacy system + modifier system):

**Named statuses (BattleStatusKind):**
- `stun` — Cannot act
- `invincible` — Invulnerable to damage
- `mark` — Increased damage taken (with bonus amount)
- `burn` — Damage over time (with damage amount)
- `attackUp` — Increased damage dealt

**Modifier-based statuses (BattleModifier stats):**
- `damageDealt` — Outgoing damage modifier
- `damageTaken` — Incoming damage modifier
- `healDone` / `healTaken` — Healing modifiers
- `cooldownTick` — Cooldown rate
- `dotDamage` — DOT damage modifier
- `canAct` — Action prevention
- `isInvulnerable` — Invulnerability
- `isUndying` — Kill prevention
- `canGainInvulnerable` — Prevent gaining invulnerability
- `canReduceDamageTaken` — Prevent damage reduction

**State-based effects:**
- `classStun` — Specific ability classes blocked
- `intentStun` — Harmful or helpful intents blocked
- `effectImmunity` — Specific effect types blocked
- Reaction guards (counter, reflect, generic reaction)

**Counters/modes/flags:** Arbitrary named values per fighter

Total visible vocabulary: ~15 named status types + arbitrary modifier labels + counters + modes

#### Naruto-Arena
Status metadata vocabulary (key fields):

**Protection:**
- `invulnerable`, `invulnerableToNonAffliction`, `invulnerableToSkillClasses`
- `damageReductionFlat/Percent`, `unpierceableDamageReductionFlat/Percent`
- `physicalDamageReductionFlat` (class-specific)
- `minimumHp`, `minimumHpFromSelfSkillDamage`

**Offense:**
- `outgoingDamageFlat/Percent` — Damage bonus
- `incomingDamageFlat/Percent` — Damage modifier to receiver

**Control:**
- `cannotUseHarmfulSkills` — Silence on offense
- `cannotUseNonMentalSkills` — Force Mental-only
- `cannotUseSkillIds[]` — Block specific skills
- `cannotBeTargeted`, `cannotBeTargetedByEnemy`

**Skill Manipulation:**
- `skillReplacements{}` — Static ID substitutions
- `skillReplacementsByRemainingTurns{}` — Turn-indexed replacements

**Chakra:**
- `[type]CostReduction/Increase` per energy type
- `allRandomConfig` — Override all costs to random

**Reactive:**
- `triggerOnEnemyHarmfulSkill`, `triggerOnEnemyHarmfulNonMental`
- `counterDamage`, `counterDamageIgnoresReduction`
- `counterStatusId`, `counterEffectsToSourceOwner`, `counterEffectsToEnemiesOfSource`
- `reflectFirstHarmfulDamage`

**Temporal:**
- `onExpireEffects[]` — On-expiry effect array
- `consumeOnMatch` — Self-removes when condition triggered
- `stack` — Stacking limit or boolean
- `activeWhileOwnerCurrentHpAtLeast/AtMost` — HP-conditional activity

Total vocabulary: ~35+ distinct metadata keys, all driving runtime behavior

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| **`cannotUseHarmfulSkills`** — Cursed Arena has no "silence offense" status | Naruto-Arena can prevent a character from ever using harmful skills this turn |
| **`cannotUseNonMentalSkills`** — force Mental-only | Creates a forced-play state with no Cursed Arena equivalent |
| **`cannotUseSkillIds[]`** — block specific skills by ID | Granular "you cannot use that specific move" has no equivalent |
| **`outgoingDamageFlat/Percent`** overlaps with Cursed Arena's `damageDealt` modifier | Similar capability, different implementation |
| **HP-conditional status activity** (`activeWhileOwnerCurrentHpAtLeast/AtMost`) | Status can turn off when HP drops — creates HP-threshold state machine. Cursed Arena requires conditional effects for this |
| **`consumeOnMatch`** — reactive self-removal | Status checks a condition every turn and self-removes when met |

**Confidence:** High

---

### 2.4 Conditional Logic

#### Cursed Arena
**Effect-level conditions (`BattleReactionCondition[]`):**
- `selfHpBelow`, `targetHpBelow` — HP thresholds
- `actorHasStatus`, `targetHasStatus` — Named status checks
- `actorHasModifierTag`, `targetHasModifierTag` — Tag presence
- `abilityId`, `abilityClass` — Ability matching
- `fighterFlag`, `actorModeIs`, `targetModeIs` — State checks
- `counterAtLeast`, `targetCounterAtLeast` — Numeric counter checks
- `usedAbilityLastTurn`, `usedAbilityWithinRounds` — History checks
- `usedAbilityOnTarget`, `firstAbilityOnTarget` — Per-target history
- `shieldActive`, `brokenShieldTag` — Shield state
- `isUltimate` — Ability classification

**Structural conditional:** `conditional` effect type supports full `if/else` branching within a single ability resolution.

**Passive trigger conditions:** Same condition vocabulary used in passive trigger guards.

#### Naruto-Arena
**Per-effect conditions (`doesEffectConditionMatch()`):**
- **Scope:** Self vs. target scope evaluation
- **Status:** `statusId`, `statusIdsAny`, `missingStatusId`
- **HP:** `sourceCurrentHpAtLeast/AtMost`
- **Skill history:** `sourceSkillUsesAtLeast/AtMost` — usage count
- **Metadata:** `statusMetadataAtLeast` — check numeric value in active status

No `else` branching — conditions are one-directional gates. Inverse conditions use `missingStatusId` or flipped HP thresholds as approximation.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| **`sourceSkillUsesAtLeast/AtMost`** — skill usage count as condition | "This effect only triggers if you've used X at least 3 times" — enables stacking combo patterns. No equivalent in Cursed Arena |
| **`statusMetadataAtLeast`** — check a numeric value inside an active status | "If the status stack count is >= 2, do this" — condition on the *magnitude* of a status |
| Cursed Arena's condition vocabulary is richer overall | More trigger types, history checks, shield checks |
| Naruto-Arena conditions are simpler but some are uniquely tacticaly meaningful | Skill usage count creates "investment" conditions |

**Confidence:** High

---

### 2.5 Temporary Skill Replacement

#### Cursed Arena
**Ability state delta system:**

```typescript
BattleAbilityStateDelta =
  | { mode: 'replace'; slotAbilityId: string; replacement: BattleAbilityTemplate; duration: number }
  | { mode: 'grant'; grantedAbility: BattleAbilityTemplate; duration: number }
  | { mode: 'lock'; slotAbilityId: string; duration: number }
```

- `replace` — Swap a specific slot ability for another for N rounds
- `grant` — Add a temporary new ability (not replacing a slot)
- `lock` — Prevent use of a specific ability for N rounds

Replacements tick down and restore automatically. Multiple replacements can coexist. The `replaceAbilities` effect applies multiple replacements at once, and `replaceAbility` applies a single one.

#### Naruto-Arena
**Two replacement mechanisms:**

1. **`skillReplacements{}`** — Static map: `{ [originalSkillId]: replacementSkillId }`. Flat substitution while status is active.

2. **`skillReplacementsByRemainingTurns{}`** — Turn-indexed map: `{ '3': replacementIdWhen3TurnsLeft, '2': replacementIdWhen2TurnsLeft }`. The replacement changes based on how many turns are left on the status.

The second mechanism is unique: a skill literally changes form as the effect countdown decreases. A 3-turn status could present a different skill version at 3 turns, 2 turns, and 1 turn — creating a degrading or escalating ability chain.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| **`skillReplacementsByRemainingTurns`** has no Cursed Arena equivalent | A skill that evolves turn-by-turn as a status counts down is a unique design pattern |
| Cursed Arena `grant` is more flexible (adds a new slot, not just replaces) | Naruto-Arena replacement always replaces in-slot |
| Cursed Arena `lock` prevents use explicitly | Naruto-Arena uses `cannotUseSkillIds[]` for the same purpose |
| Naruto-Arena's replacement resolution uses `resolveEffectiveSkill()` chain following | Handles chains of replacements (A→B→C) with cycle prevention |

**Confidence:** High

---

### 2.6 Transforms / Forms

#### Cursed Arena
**State modes** (`stateModes: Record<string, string>`) represent form/transformation states. Operations:
- `setMode` — Enter a mode (with optional duration)
- `clearMode` — Exit a mode

Modes can:
- Gate ability usage (`requiredActorConditions` with `actorModeIs`)
- Trigger reaction conditions (`type: 'actorModeIs' | 'targetModeIs'`)
- Drive skill replacements (via `modifyAbilityState` effect combined with mode checks)

Example: A character could be in mode `"TrueForm"` which unlocks specific abilities and changes passive behavior.

#### Naruto-Arena
**No discrete "form" or "mode" system.** Transformations are implemented through:
1. A long-duration status that carries skill replacement maps
2. Ability interactions that stack toward a threshold (usage count conditions)
3. The `buildInitialBoard()` function supports `initialStatuses` with `randomize` support — characters can start battle in randomized states

For characters like Naruto, form changes (e.g., "Shadow Clones active" vs. "without clones") are modeled as status presence/absence combined with skill replacement maps.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena's `stateMode` is a cleaner abstraction for forms | Easier to understand "character is in X form" — Naruto-Arena requires inferring form from status presence |
| Naruto-Arena's approach is more emergent | Form states arise from skill usage rather than explicit mode-setting |
| Both approaches work — this is an implementation style difference | Not a gameplay gap |
| Cursed Arena modes can expire (duration-based) | Naruto-Arena form-statuses can also expire |

**Confidence:** High

---

### 2.7 Combo Structures

#### Cursed Arena
Combos are implemented through:
- **Counters** (`stateCounters`) that accumulate across turns/uses
- **`damageScaledByCounter`** — Damage scales with counter value (consume optional)
- **`healScaledByCounter`** — Healing scales with counter
- **`shieldScaledByCounter`** — Shield scales with counter
- **`classStunScaledByCounter`** — Stun duration scales with counter
- **`adjustSourceCounter`** — Skill increments caster's counter
- **`adjustCounterByTriggerAmount`** — Scale by trigger context amount
- **`requiredActorConditions`** with `counterAtLeast` — Gate skills on counter value

Pattern: Use skill A to build counter → Use skill B that scales off counter or requires threshold.

#### Naruto-Arena
Combos are implemented through:
- **Status presence conditions:** "Skill B only does bonus damage while Status X is active" (Status X applied by Skill A)
- **Skill replacement triggers:** Using Skill A applies a status that replaces Skill B with Skill B+ for N turns
- **Usage count conditions:** `sourceSkillUsesAtLeast` — "after using X 3 times, Y becomes available"
- Naruto's `Underground Ambush` does bonus damage "during Shadow Clones" — classic status-gates-bonus pattern

**Hidden nuance:** The combo in Naruto-Arena is often communicated through skill description text ("deals X more during Y") rather than explicit UI indicators. Players learn combos through description reading and experimentation.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena counters are more mechanically explicit | The counter *number* is trackable and visible (CTR pip) |
| Naruto-Arena combos are status-boolean-gated | Simpler to design but less graduated — it's on/off, not scaled |
| Neither system has multi-character combo abilities | "If both character A and character B used abilities this turn, trigger bonus" — a potential tactical depth layer |
| Cursed Arena `adjustCounterByTriggerAmount` is a powerful scaling primitive | Synergy with damage passives creates damage-based counter accumulation |

**Confidence:** High

---

## 3. UI/UX Battle Flow

### 3.1 Turn Cadence

#### Cursed Arena
Sequential phases — Player A acts, resolves, then Player B acts, resolves. The UI experience is:
1. Player A queues all actions (sees their queue, opponent queue is unknown or hidden)
2. Player A confirms — effects resolve immediately and are displayed
3. Player B queues (can now see what A did)
4. Player B confirms — effects resolve
5. Round end ticks

This creates a **first-mover information disadvantage**: Player A commits without knowing B's response. Player B can respond to A's moves, giving B a structural advantage. The coin flip to determine who goes first matters every round.

#### Naruto-Arena
Both players queue simultaneously during the 60-second window. Neither player sees the other's queue before submission. After both submit, all effects resolve server-side and the result is polled. This creates **true simultaneous decision pressure** — both players commit to a plan blind.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena's sequential model means second-player advantage every round | Player B always gets to react — this is a fundamental asymmetry |
| Naruto-Arena's simultaneous model is more tension-generating | "What will they do?" is the entire game |
| Cursed Arena could be made simultaneous at the server level | But the current sequential model changes fundamental strategic feel |

**Confidence:** High

---

### 3.2 Player Decision Flow

#### Cursed Arena
Per turn, player must:
1. Select target for each fighter (if targeting required)
2. Select ability for each fighter
3. Optionally reorder queue (drag-reorder)
4. Optionally use energy exchange
5. Commit turn

The queue preview shows upcoming events, reaction guards, and scheduled effects. The player can see their own full decision space before committing.

#### Naruto-Arena
Per turn, player must:
1. Select skill for each character
2. Select target for each skill
3. Resolve random chakra allocation (which bucket to assign each random into)
4. Optionally reorder queue
5. Submit within 60 seconds

The random chakra allocation step is a **micro-decision that Cursed Arena completely lacks** — players must decide where to assign their random energy, which can enable or disable specific skills.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| **No random energy allocation step in Cursed Arena** | This is a weekly micro-decision in Naruto-Arena that creates meaningful engagement every turn |
| Naruto-Arena has a hard timer (60s) that creates urgency | Cursed Arena relies on social contract for turn timing |
| Cursed Arena's queue preview is richer (shows scheduled effects, reaction guards) | More information about the future state |

**Confidence:** High

---

### 3.3 Information Density

#### Cursed Arena
**BattlePortraitSlot** badges displayed per fighter:
- KO, STN (stun), CLS (class locked), INT (intent locked), INV (invulnerable)
- Shield amount, CTR (counter), RFL (reflect), MRK (mark), DOT
- MOD (mode), IMM (immunity), DLY (delayed effect), QUE (queued)

Active effect pips with colors, stack badges, hover tooltips with duration info.

**BattleLogPanel:** Recent events with event-type glyphs, color-coded, automatic labels. Round dividers.

High information density. The pip system surfaces most active effects.

#### Naruto-Arena
UI shows per character:
- HP bar
- Status effect indicators (active statuses)
- Chakra display (4 colored boxes, totals)
- Turn timer
- Skill queue visualization

Status information is present but less granulated than Cursed Arena's badge system. The four-type chakra display gives immediate resource clarity.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena badge system is comprehensive but may be overwhelming | 14+ badge types per portrait |
| Naruto-Arena chakra pool is immediately readable (4 boxes) | The resource state is visually simpler and clearer |
| Neither system clearly shows "what will happen at round end" | The upcoming tick (DOT damage, status expiry, cooldown reduction) is not pre-visualized |
| Cursed Arena DLY pips show delayed effects exist but not what they'll do | Naruto-Arena statuses similarly don't pre-announce their expiry behavior |

**Confidence:** Medium (NA UI was inferred from HTML/JS analysis, not direct visual inspection)

---

### 3.4 Cooldown Visibility

#### Cursed Arena
Cooldowns are shown on ability slots. The `CLS` badge on portraits indicates a class stun (abilities of that class locked). Individual ability cooldown numbers are shown.

The `cooldownTick` modifier (which can accelerate recovery) is not visually surfaced — a player may not know their cooldowns are recovering faster.

#### Naruto-Arena
Cooldown numbers shown on skill buttons. Gray-out when on cooldown. No visible "cooldown reduction" effects — these are similarly invisible.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cooldown recovery rate modifiers are invisible in both systems | If a buff accelerates cooldowns, the player just sees faster numbers |
| Class stun visibility in Cursed Arena (CLS badge) is better than Naruto-Arena | Naruto-Arena doesn't show which class is locked — players must infer |
| Naruto-Arena's `nextUsedSkillCooldownAdjustment` is completely invisible | The next skill used will secretly cost extra cooldown — no UI warning |

**Confidence:** Medium

---

### 3.5 Enemy Visibility

#### Cursed Arena
In the sequential model, Player B can see Player A's resolved effects before acting. The opponent's portrait badges (shield, counter, invulnerable, etc.) are visible. The opponent's energy pool is presumably visible.

Whether the opponent's *queued but unresolved* actions are visible depends on the UI phase — during firstPlayerResolve, Player B's queue is not yet committed.

#### Naruto-Arena
During the simultaneous decision window, **neither player can see the opponent's choices**. After resolution, full results are visible.

The opponent's skill cooldowns ARE visible (you can see what's available to them), which is a meaningful information vector. Knowing an opponent's powerful skill is on cooldown is strategic intelligence.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| **Showing opponent cooldowns is intentional in Naruto-Arena** | This is a design decision, not a UI oversight — it informs blind-commit decisions |
| Cursed Arena in sequential mode gives second player full information | This may undermine the tactical tension of commitment |
| Neither system makes the opponent's energy pool fully opaque | Energy management is readable, reducing bluffing potential |

**Confidence:** Medium

---

### 3.6 Target Readability

#### Cursed Arena
Target selection via portrait click. Valid targets presumably highlighted. `requiredTargetTags` constraints may silently invalidate some targets (user may not understand why a target is unselectable).

#### Naruto-Arena
Target selection via character portrait click. Invulnerable characters are grayed or removed from target list. Single-target immunity (`cannotBeTargeted`) removes the character from the selection list entirely.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena does not show WHY a target is invalid | `requiredTargetTags` failure is silent — this creates confusion |
| Naruto-Arena's targeting immunity changes the visual affordance | A character that "isn't a valid target" disappears from the selection pool visually |

**Confidence:** Medium

---

### 3.7 Pacing

#### Cursed Arena
No hard turn timer. Pacing is player-controlled. The round resolves quickly once committed (synchronous local resolution). No waiting for opponent — this is presumably a single-player simulation or async multiplayer.

#### Naruto-Arena
60-second hard timer creates strict pacing. Both players must act within the window. Auto-timeout ends the turn if random chakra is allocated but submission is not made. Bot battles have a 15-second action delay (`BATTLE_BOT_ACTION_DELAY_MS`).

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no turn timer | In a multiplayer context, this would allow indefinite stalling |
| Naruto-Arena's 60s timer is a design choice as much as a technical one | It creates urgency and prevents analysis paralysis |
| Cursed Arena's synchronous resolution means no wait states | Faster per-action feel but less anticipation |

**Confidence:** High

---

## 4. Meta Systems

### 4.1 Missions

#### Cursed Arena
No mission system found in the codebase.

#### Naruto-Arena
Full mission system present. Players can complete objectives for rewards. Specific mission data structure not retrieved but the system is referenced in multiple API routes and the database schema.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no mission or objective system | No directed progression goals to orient new players |

**Confidence:** High (absence confirmed by codebase search)

---

### 4.2 Progression & Unlocks

#### Cursed Arena
Character rarity system exists (R, SR, SSR, UR) and is surfaced in UI (border glow). No unlock gating was found in the battle engine — all characters appear available.

#### Naruto-Arena
Character unlock system referenced (likely tied to win count or ladder rank). New characters unlocked through play. Creates long-term progression goals.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has rarity but no unlock mechanic found | Rarity is cosmetic/status only — no actual gating |
| Naruto-Arena's unlock system gives meaning to continued play | "Play 50 more games to unlock Gaara" is a retention loop |

**Confidence:** Medium (NA unlock system referenced but not fully documented)

---

### 4.3 Ladder

#### Cursed Arena
No ladder system found.

#### Naruto-Arena
Full ladder/ranking system. `GET /api/ladder` endpoint. Players earn rank through wins. Ranks can be displayed on profiles.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no competitive ranking | No way to track improvement or compare to others |

**Confidence:** High

---

### 4.4 Clans

#### Cursed Arena
No clan system found.

#### Naruto-Arena
Full clan system with clan creation, membership, and clan-based competition. Referenced in API routes.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no social/clan layer | Naruto-Arena uses clans as social retention glue |

**Confidence:** High

---

### 4.5 Profiles

#### Cursed Arena
No user profile system found in the battle engine or UI.

#### Naruto-Arena
User profiles with: win/loss records, character usage statistics, clan membership, ladder rank, avatar/display customization. JWT authentication confirms persistent accounts.

#### Missing / Hidden Nuances
| Gap | Notes |
|---|---|
| Cursed Arena has no persistent user identity | Every session is stateless from the system's perspective |
| Naruto-Arena profiles track character usage — players develop identities around characters | "I'm a Shikamaru main" is a retention and identity mechanic |

**Confidence:** High

---

## Summary: Highest-Value Missing Systems

The following represent Naruto-Arena mechanics that are **absent or materially weaker** in Cursed Arena and that contribute significantly to tactical depth and engagement feel:

| Priority | System | What NA Has | CA Status |
|---|---|---|---|
| 1 | **Simultaneous submission** | Both players commit blind; true tension | Sequential; second player reacts — asymmetric |
| 2 | **Mental class bypasses traps** | Rock/paper/scissors with counter mechanics | No class-based trap bypass rule |
| 3 | **Random energy allocation** | Micro-decision every turn; RNG variance in economy | Deterministic, no allocation step |
| 4 | **Helpful skill immunity** | `invulnerableToHelpfulSkills` — block ally buffs/heals | Not present |
| 5 | **Targeting immunity** | `cannotBeTargeted` / `cannotBeTargetedByEnemy` | Not present |
| 6 | **Turn-indexed skill replacement** | `skillReplacementsByRemainingTurns` — evolving abilities | Not present |
| 7 | **Evasion / hit chance** | Skills can miss; evasion can be specced into | All hits land if not invulnerable |
| 8 | **`spend_all_chakra` effect** | Nuclear economic disruption | No equivalent |
| 9 | **`onExpireEffects`** | Status expiry fires additional effects | Silent expiry only |
| 10 | **Skill usage count conditions** | Combo gates based on how many times X was used | Not present |
| 11 | **Mental-only stun** | `cannotUseNonMentalSkills` — forced play state | Not present |
| 12 | **Specific skill block** | `cannotUseSkillIds[]` — granular move prevention | Not present |

---

*End of Phase 1 — Discovery.*  
*Phase 2 should prioritize items 1–6 for highest tactical feel impact.*
