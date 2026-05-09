# Cursed Arena Kit Authoring Guide

Reference for designing and implementing character kits. Based on the Yuji / Nobara / Megumi gold-standard pass.

---

## Table of Contents

1. [Kit Design Philosophy](#1-kit-design-philosophy)
2. [File and Folder Conventions](#2-file-and-folder-conventions)
3. [The `fighter()` Helper and Template Shape](#3-the-fighter-helper-and-template-shape)
4. [Ability Anatomy](#4-ability-anatomy)
5. [SkillEffect Types Reference](#5-skilleffect-types-reference)
6. [Targeting and Target Rules](#6-targeting-and-target-rules)
7. [Conditions and Conditional Effects](#7-conditions-and-conditional-effects)
8. [Counters, Modes, and Flags](#8-counters-modes-and-flags)
9. [Passive Effects](#9-passive-effects)
10. [Energy and Cooldown Design](#10-energy-and-cooldown-design)
11. [Availability Gating](#11-availability-gating)
12. [Counter Display and Pip Registration](#12-counter-display-and-pip-registration)
13. [Validation Rules](#13-validation-rules)
14. [Testing a Kit](#14-testing-a-kit)
15. [Common Mistakes and Anti-Patterns](#15-common-mistakes-and-anti-patterns)

---

## 1. Kit Design Philosophy

Cursed Arena uses an alternating team-turn model inspired by Naruto Arena. On a player's turn, they command their available fighters, then the engine resolves that player's queued actions. The opponent then takes their turn. Energy is shared across the team, not per-character. This shapes every design decision.

**Design constraints to internalize first:**

- Energy is a team resource. A skill that costs 3 energy of the same type is punishing relative to one that costs 2 mixed. Design costs with the whole team's pool in mind.
- On a player's turn, each available fighter can generally use one skill, subject to stun, cooldown, energy, targeting, ability availability, and other restrictions. Combo mechanics must be designed to work across turns and rounds, not within a single activation.
- Cooldowns are per-fighter and count down after each team's turn resolves. A 3-turn cooldown ticks once on the acting player's tick and once on the opponent's tick per round — so it may return faster than a round count alone implies. Design cooldowns by feel, not by raw arithmetic.
- Reactions fire during the acting team's resolution window. Passives that say "when targeted" trigger as that team's queued actions resolve, not as a response to an opponent acting simultaneously.

**Kit design goals per character:**

- **One primary resource** — one counter, mode, or flag that the kit is built around. Avoid designing two independent resource systems on one character.
- **Clear setup → payoff arc** — at least one skill that builds toward something, and at least one that consumes or benefits from it.
- **Legible from pip display alone** — a watching opponent should be able to read what the character is working toward from the visible pips on their portrait.
- **One unique mechanic** — each character should do something no other character does. Shared generic effects (shield, heal, stun) are scaffolding, not identity.

**Three tiers of complexity:**

- **Tier 1 (Beginner):** Linear effects, no setup required. Example: Yuji's Divergent Fist — deal damage, straightforward.
- **Tier 2 (Intermediate):** One resource to manage, conditional payoff. Example: Yuji's full kit — Soul Charge unlocks Black Flash, which scales off accumulated bonus.
- **Tier 3 (Advanced):** Multiple resources or inter-turn timing requirements. Example: Nobara's kit — must apply Straw Doll Technique first, then stack resonance hits on marked targets.

Start new characters at Tier 1 or 2. Save Tier 3 for characters with established in-canon complexity.

---

## 2. File and Folder Conventions

```
src/features/battle/content/fighters/
  yuji.ts
  nobara.ts
  megumi.ts
  _helpers.ts          ← shared factory helpers
src/features/battle/content.ts   ← definePassive, defendSkill exports
src/features/battle/types.ts     ← all type definitions
src/features/battle/engine.ts    ← effect dispatch and ability logic
src/features/battle/engine.test.ts
src/components/battle/battleDisplay.ts   ← pip registration and UI descriptions
```

Each character lives in a single `.ts` file in `content/fighters/`. Export one named constant matching the character's first name (lowercase). The file imports from `_helpers.ts` and `content.ts`; it does not import from `engine.ts` or `battleDisplay.ts`.

**Naming conventions:**

- Counter keys: `snake_case`, prefixed with the character name where unique to them. Example: `yuji_black_flash_bonus`, `shikigami`, `straw_doll_ritual_stacks`.
- Mode keys: `snake_case`, descriptive of the state. Example: `soul_charge`.
- Flag keys: `snake_case`, past-tense boolean semantics. Example: `sukuna_vessel_used`.
- Passive IDs: `{character}-{descriptor}`. Example: `yuji-sukuna-vessel`.
- Ability IDs: `{character}-{ability-name}`. Example: `yuji-black-flash`.
- Shield labels: Title Case, character-flavored. Example: `'Shikigami Recall'`.
- Shield tags: kebab-case, namespaced. Example: `['shikigami-recall']`.

---

## 3. The `fighter()` Helper and Template Shape

```typescript
import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, modifierEffect, skill } from './_helpers.ts'

export const yuji = fighter({
  id: 'yuji',
  name: 'Yuji Itadori',
  shortName: 'Yuji',
  rarity: 'SSR',
  role: 'Beginner Brawler / Setup Payoff',
  portraitFrame: { scale: 2.06, y: '-10%' },
  maxHp: 100,
  passiveEffects: [...],
  abilities: [...],
  ultimate: ...,
})
```

**Required fields:** `id`, `name`, `shortName`, `maxHp`, `abilities`, `ultimate`.

**Optional fields:** `rarity`, `role`, `portraitFrame`, `passiveEffects`.

**HP baseline:** Standard fighters use 100 HP. Tanks may go to 120; glass cannons to 80. Stay within 80–120 for the first roster pass.

**`role` string:** Freeform. Used in the character detail page and admin panel. Write it as a two-part archetype: `'Primary Role / Secondary Trait'`. Examples: `'Beginner Brawler / Setup Payoff'`, `'Debuffer / Affliction Punisher'`, `'Summons Controller / Resource Converter'`.

**`abilities` array:** Exactly 3 skills in display order (the ultimate is separate). Order: basic → cooldown skill → mode-setter or key skill. The ultimate is always the 4th slot.

---

## 4. Ability Anatomy

```typescript
skill({
  id: 'megumi-shadow-recall',
  name: 'Shadow Recall',
  description: 'Megumi removes all Shikigami stacks and recovers 5 health and 5 shield per stack consumed.',
  kind: 'heal',
  targetRule: 'self',
  classes: ['Special', 'Instant'],
  cooldown: 0,
  energyCost: { random: 1 },
  effects: [...],
})
```

**`kind` values and their semantics:**

| kind | Use when |
|------|----------|
| `attack` | Primary damage source |
| `heal` | Restores HP (self or ally) |
| `defend` | Applies invulnerability or major damage reduction |
| `buff` | Enhances the actor or allies |
| `debuff` | Impairs enemies without direct damage |
| `utility` | Mixed or hard-to-categorize |
| `pass` | No-op; passes the turn |

The `kind` field drives the admin panel display and is used for validation of heal-type effects.

**`classes` array — choose carefully:**

Classes gate certain engine restrictions (e.g., class sealing) and appear in skill card UI. Use only classes that match the skill's literal action.

- `Physical` — involves a physical strike or technique
- `Melee` — close-range contact
- `Ranged` — projectile or distance-based
- `Special` — cursed technique or supernatural effect
- `Strategic` — tactical action (mode-setting, repositioning)
- `Instant` — resolves before other skills this round (most skills are Instant)
- `Action` — resolves at normal priority
- `Control` — disables, stuns, or restricts
- `Affliction` — applies a persistent harmful condition
- `Mental` — targets perception or will
- `Piercing` — bypasses barriers and shields
- `Energy` — costs or manipulates energy
- `Ultimate` — reserved for ultimate skills only
- `Unique` — one-of-a-kind effect with no comparable reference

All three gold-standard characters use `Instant` on every skill. `Action` is for skills that resolve after `Instant` skills in the same round — use it deliberately.

**`description` field:**

Write the description from the player's perspective. Include all mechanically relevant details:
- What it does
- Under what conditions it does something extra
- What resource it builds or consumes
- Numeric values

Do not include flavor text in the description. Keep it factual. Example of a good description: `'This skill deals 20 damage to one enemy plus 1 additional damage for each Black Flash bonus Yuji has. If the intended damage is 40 or more, the target is stunned for 1 turn.'`

---

## 5. SkillEffect Types Reference

Effects are applied in array order. All effects in a skill's `effects` array run unconditionally unless wrapped in a `conditional`.

### Damage effects

```typescript
{ type: 'damage', power: 20, target: 'inherit' }
```

```typescript
{
  type: 'damageScaledByCounter',
  counterKey: 'yuji_black_flash_bonus',
  counterSource: 'actor',   // 'actor' | 'target' — defaults to 'actor'
  powerPerStack: 1,
  consumeStacks: false,
  target: 'inherit',
}
```

`damageScaledByCounter` with `consumeStacks: false` reads the counter without clearing it. Use this when the counter is informational (accumulated damage bonus) rather than a spend resource.

### Heal effects

```typescript
{ type: 'heal', power: 20, target: 'inherit' }
```

```typescript
{
  type: 'healScaledByCounter',
  counterKey: 'shikigami',
  counterSource: 'actor',
  powerPerStack: 5,
  consumeStacks: false,   // false when a paired shield effect owns the reset
  target: 'self',
}
```

Heal effects bypass modifier scaling — they represent direct resource conversion, not attack-style power scaling.

### Shield effects

```typescript
{ type: 'shield', amount: 15, label: 'Ten Shadows Shield', tags: ['ten-shadows'], target: 'self' }
```

```typescript
{
  type: 'shieldScaledByCounter',
  counterKey: 'shikigami',
  counterSource: 'actor',
  powerPerStack: 5,
  shieldLabel: 'Shikigami Recall',
  shieldTags: ['shikigami-recall'],
  consumeStacks: true,   // owns the counter reset
  target: 'self',
}
```

**Paired heal + shield pattern:** When both effects read the same counter, order them with the heal first (`consumeStacks: false`) and the shield second (`consumeStacks: true`). Both execute against the original stack count; only the shield fires the reset.

### Counter effects

```typescript
{ type: 'adjustCounter', key: 'shikigami', amount: 1, target: 'self' }
```

`amount` can be negative to decrement. Counter cannot go below 0 by convention — guard with a `counterAtLeast` condition if needed.

### Mode effects

```typescript
{ type: 'setMode', key: 'soul_charge', value: 'active', duration: 4, target: 'self' }
```

`duration` counts in rounds. A duration of 4 means the mode is active for 4 full rounds including the round it was set. `value: 'inactive'` or `value: ''` clears a mode.

### Flag effects

```typescript
{ type: 'setFlag', key: 'sukuna_vessel_used', value: true, target: 'self' }
```

Flags are permanent by default — there is no `duration` field. Use for one-time triggers (`value: true`) or toggleable binary states.

### Status effects

```typescript
{ type: 'stun', duration: 1, target: 'inherit' }
{ type: 'invulnerable', duration: 1, target: 'self' }
```

### Modifier effects

Use the `modifierEffect` helper for common modifier patterns:

```typescript
modifierEffect('Soul Charge Guard', 'damageTaken', -10, 4, 'self', ['soul-charge'])
```

Signature: `modifierEffect(label, stat, value, duration, target, tags)`

For flat reductions, use a negative number. For percent-based reductions, use `mode: 'percentAdd'` and pass a value like `-0.25`.

**Stat keys:** `damageTaken`, `canReduceDamageTaken`, `canGainInvulnerable`, `healingReceived`, `damageDealt`. Check `types.ts` for the full union.

### Marker effects

```typescript
markerEffect('Straw Doll Mark', 4, 'enemy-single', ['straw-doll-marked'])
```

Signature: `markerEffect(label, duration, target, tags)`

Markers are passive modifiers used for `requiredTargetTags` gating. Only use markers for genuine target-gating requirements (e.g., "can only use this skill on a marked enemy"). Do not use markers to gate actor-state mechanics — use `requiredActorConditions` instead.

### Reaction effects

```typescript
{
  type: 'reaction',
  target: 'self',
  label: 'Soul Charge Focus',
  trigger: 'onBeingTargeted',
  duration: 4,
  harmfulOnly: true,
  newSkillOnly: true,
  consumeOnTrigger: false,
  effects: [{ type: 'adjustCounter', key: 'yuji_black_flash_bonus', amount: 5, target: 'self' }],
}
```

Reactions are conditional triggers placed on a fighter's status. `trigger` values: `onTakeDamage`, `onBeingTargeted`, `onDealDamage`, `onUseSkill`, etc. `harmfulOnly: true` restricts to skills flagged as harmful. `consumeOnTrigger: true` removes the reaction after its first activation.

### Conditional effects

```typescript
{
  type: 'conditional',
  target: 'inherit',
  conditions: [{ type: 'actorModeIs', key: 'soul_charge', value: 'active' }],
  effects: [...],         // runs when conditions pass
  elseEffects: [...],     // optional — runs when conditions fail
}
```

Conditions in the array are ANDed together. Use `elseEffects` when a skill has an explicit fallback behavior.

### Schedule effects

```typescript
{
  type: 'schedule',
  delay: 1,
  phase: 'end',
  target: 'inherit',
  effects: [...],
}
```

Defers nested effects by `delay` rounds. `phase: 'end'` fires at end-of-round; `phase: 'start'` fires at start-of-round. Use sparingly — delayed effects are harder to read in UI.

---

## 6. Targeting and Target Rules

**`targetRule` values:**

| Rule | Meaning |
|------|---------|
| `none` | No target selection; targets are determined programmatically |
| `self` | Automatically targets the actor |
| `enemy-single` | Player picks one enemy |
| `enemy-all` | Hits all enemies simultaneously |
| `ally-single` | Player picks one ally |
| `ally-all` | Hits all allies simultaneously |

**`target` on individual effects:**

Most effects use `target: 'inherit'` to target whatever the ability targets. Override per-effect when needed:

- `target: 'self'` — always targets the actor regardless of ability target
- `target: 'all-enemies'` — always hits all enemies
- `target: 'all-allies'` — always hits all allies
- `target: 'inherit'` — uses the ability's resolved target

Example: Soul Charge applies modifiers to `all-enemies` even though the skill's `targetRule` is `'self'`.

**`requiredTargetTags`:**

Use only when the skill genuinely cannot be used on an unmarked target:

```typescript
requiredTargetTags: ['straw-doll-marked']
```

This causes the ability to show `'NO TARGET'` when no valid targets exist. It does NOT gate on actor state — use `requiredActorConditions` for that.

---

## 7. Conditions and Conditional Effects

All conditions belong to the `BattleReactionCondition` union. They appear in:
- `conditions` arrays inside `conditional` effects
- `conditions` arrays inside `PassiveEffect`
- `requiredActorConditions` on abilities

**Common condition types:**

```typescript
{ type: 'actorModeIs', key: 'soul_charge', value: 'active' }
{ type: 'fighterFlag', key: 'sukuna_vessel_used', value: false }
{ type: 'counterAtLeast', key: 'yuji_black_flash_bonus', value: 20 }
{ type: 'selfHpBelow', threshold: 0.5 }       // 0.5 = 50% HP
{ type: 'targetHpBelow', threshold: 0.3 }
{ type: 'targetModeIs', key: 'some_mode', value: 'active' }
{ type: 'usedAbilityLastTurn', abilityId: 'megumi-shadow-summon' }
```

**Threshold values for HP conditions:** Always a fraction (0.0–1.0), not a raw HP value. `0.5` means "50% HP or below."

**Actor vs. target in conditions:**

When conditions appear inside a `conditional` effect that is inside a skill, "actor" is the skill user and "target" is the skill's resolved target. In a passive, "actor" is the fighter who owns the passive. In `requiredActorConditions`, only actor-relative conditions are valid — `targetHpBelow`, `targetModeIs`, and similar target-dependent conditions will always return `false` and must not be used there.

---

## 8. Counters, Modes, and Flags

These three state stores are distinct types with different semantics.

### Counters (`stateCounters`)

Integer values, default 0. Used for stackable resources.

- **Increment:** `{ type: 'adjustCounter', key: 'shikigami', amount: 1, target: 'self' }`
- **Decrement:** `{ type: 'adjustCounter', key: 'shikigami', amount: -3, target: 'self' }`
- **Read:** `counterAtLeast` condition, or `counterSource` on scaled effects
- **Clear:** `consumeStacks: true` on scaled effects, or `adjustCounter` to 0

Counter keys are global (not owned by a source). Two fighters cannot independently track the same counter key on the same target. Name keys to avoid collisions across the roster.

Counter values persist across rounds until explicitly changed. They do not reset on fighter death by default.

### Modes (`stateModes`)

String values per named mode key, with optional duration in rounds. Used for temporary states.

- **Set:** `{ type: 'setMode', key: 'soul_charge', value: 'active', duration: 4, target: 'self' }`
- **Clear manually:** `{ type: 'setMode', key: 'soul_charge', value: 'inactive', duration: 0, target: 'self' }`
- **Read:** `actorModeIs` and `targetModeIs` conditions
- **Expiry:** automatic after `duration` rounds; triggers mode-expiry passives if registered

Modes expire at the end of the round they were set + duration - 1. A mode set on round 3 with duration 4 is active on rounds 3, 4, 5, 6 and expires entering round 7.

### Flags (`stateFlags`)

Boolean values. Used for permanent one-time triggers.

- **Set:** `{ type: 'setFlag', key: 'sukuna_vessel_used', value: true, target: 'self' }`
- **Read:** `fighterFlag` condition
- **No expiry.** Flags have no duration. Once set, they persist for the match.

Use flags for: first-time triggers that must not repeat (`sukuna_vessel_used`), binary unlocks that last forever.

Do not use flags for temporary states — use modes with a duration instead.

---

## 9. Passive Effects

```typescript
definePassive({
  id: 'yuji-sukuna-vessel',
  trigger: 'onTakeDamage',
  conditions: [
    { type: 'selfHpBelow', threshold: 0.5 },
    { type: 'fighterFlag', key: 'sukuna_vessel_used', value: false },
  ],
  effects: [
    { type: 'setFlag', key: 'sukuna_vessel_used', value: true, target: 'self' },
    { type: 'addModifier', target: 'self', modifier: { ... } },
  ],
  label: "Sukuna's Vessel",
  description: 'When Yuji reaches 50 health for the first time, Sukuna awakens and Yuji permanently takes 25% less non-piercing damage.',
  icon: { label: 'SV', tone: 'red' },
  counterKey: 'yuji_black_flash_bonus',
})
```

**`trigger` values:** `onTakeDamage`, `onDealDamage`, `onBeingTargeted`, `onRoundStart`, `onRoundEnd`, `onDeath`, `onAllyDeath`, `onShieldBroken`, `onModeExpired`.

**`conditions` array:** ANDed. Passive fires only when all conditions pass. An empty array means the passive fires unconditionally on every trigger.

**`label` and `description`:** Shown in the pip tooltip. Write the description in the third person from a narrator perspective: "When Yuji reaches 50 health for the first time..."

**`icon`:** `{ label: string, tone: 'red' | 'teal' | 'gold' | 'frost' | 'blue' | 'green' }`. Label is 2–4 characters.

**`counterKey`:** Attaches a counter display to this passive's pip. When the counter value is greater than 0, the pip shows the counter value alongside the passive label. Use this for counters that are semantically owned by the passive. If the semantic association is wrong or the passive only fires on damage taken (making the description misleading for a resource pip), use `visibleCounterPresenters` instead (see Section 12).

**Passive best practices:**

- Gate one-time passives with a flag condition on their own first effect: set the flag true as the first effect, so the passive cannot fire again.
- Do not add a `counterKey` to a passive if the passive description describes a reaction (e.g., "when taking damage...") and the counter describes a resource the player builds proactively. The mismatch confuses the pip tooltip.
- Passive effects use `target: 'self'` for self-effects. The passive's "target" context is the fighter who owns the passive.

---

## 10. Energy and Cooldown Design

Energy is shared across the team. All types pull from the same pool.

**Energy types:** `physical`, `vow`, `random` (wildcard — satisfies any type during generation but is spent as a specific type when consumed; check `energy.ts` for the exact wildcard rule).

**Cost guidelines by skill tier:**

| Tier | Cost |
|------|------|
| Basic / no-cooldown | 1 of one type |
| Cooldown skill | 1–2 of one or mixed types |
| Mode-setter | 1 random |
| Ultimate | 1 of primary type + 1 random, or 2 random |

Avoid costs above 3 total. A skill costing 4+ energy is almost never usable in a real game unless it wins immediately.

**Cooldown guidelines:**

| Cooldown | Use case |
|----------|----------|
| 0 | Basic attack; spammable buff |
| 1 | Strong single-target hit; most payoff skills |
| 2 | AoE damage; major heal; powerful debuff |
| 3 | Mode-setter; gameplan-defining ability |
| 4 | Ultimate (default for `defendSkill`) |

Cooldowns do not start counting until the round after the skill is used. A cooldown-1 skill used on round 2 is available on round 4 (rounds 3 and 4 count down 1 and 0).

**The `defendSkill` helper:**

```typescript
defendSkill({
  id: 'yuji-indomitable-spirit',
  name: 'Indomitable Spirit',
  description: 'This skill makes Yuji Itadori invulnerable for 1 turn.',
  targetRule: 'self',
  classes: ['Strategic', 'Instant', 'Ultimate'],
  cooldown: 4,
  duration: 1,
  energyCost: { random: 1 },
})
```

Use for ultimate-tier defend skills. Automatically applies the `invulnerable` status for `duration` rounds.

---

## 11. Availability Gating

Two independent gating mechanisms exist. Use the right one for the right job.

### `requiredActorConditions` — for actor-state locks

```typescript
requiredActorConditions: [{ type: 'actorModeIs', key: 'soul_charge', value: 'active' }]
```

- Evaluated against the actor's state before target selection
- Any valid `BattleReactionCondition` works, provided it only reads actor-relative state
- On failure, block reason is `'Not available'`; badge shown is `LOCKED`
- Use for: mode-gated skills, flag-gated ultimates, counter-threshold unlocks

**Do not use `requiredTargetTags` as an actor-state lock.** The old Yuji workaround did this — it created target markers to simulate Soul Charge gating. Problems: the block reason was `'NO TARGET'` instead of `'LOCKED'`; the lock could be bypassed by a debuff-clearing opponent; the markers accumulated on all enemies even though the mechanic was about Yuji's internal state.

### `requiredTargetTags` — for target-filter locks

```typescript
requiredTargetTags: ['straw-doll-marked']
```

- Filters the valid target pool; ability is `'NO TARGET'`-locked when no valid targets
- Use for: skills that can only target enemies with a specific debuff applied
- Nobara's Soul Resonance and Hairpin use this pattern correctly — both require the Straw Doll mark to be present on the target

**Distinguishing the two:** Ask "Is this a lock about MY state, or about THE TARGET'S state?" If the answer is "my state" (I need to be in a mode, I've used the flag, I have enough stacks), use `requiredActorConditions`. If the answer is "the target's state" (only marked enemies can be hit), use `requiredTargetTags`.

---

## 12. Counter Display and Pip Registration

Counters need a display home to be visible as pips on portrait slots. There are two paths.

### Path A — `counterKey` on a `PassiveEffect`

```typescript
definePassive({
  id: 'megumi-ten-shadows-strategist',
  ...
  counterKey: 'shikigami',
})
```

The passive's pip displays the counter value when `stateCounters[counterKey] > 0`. The pip label and tone come from the passive's `icon`. The tooltip comes from the passive's `description`.

Use this when:
- The counter is semantically owned by the passive (the passive grants or manages the counter)
- The passive description accurately describes the counter's role

Do not use this when the passive fires on `onTakeDamage` but the counter tracks a resource the player actively builds — the "when taking damage" description in the tooltip will be confusing.

### Path B — `visibleCounterPresenters` in `battleDisplay.ts`

```typescript
visibleCounterPresenters['straw_doll_ritual_stacks'] = {
  label: 'Ritual Stacks',
  icon: { label: 'RS', tone: 'gold' },
  descriptionLines: (count) => [
    `${count} Straw Doll stack${count === 1 ? '' : 's'} accumulated.`,
    'Soul Resonance deals more damage per stack.',
    'Hairpin executes below 25 HP.',
  ],
}
```

Use this when:
- The counter has no naturally associated passive
- The passive description would be misleading as a counter tooltip
- The counter needs custom multi-line tooltip content

This is the cleanest path for pure resource counters (like Nobara's stacks). The downside is display logic lives in `battleDisplay.ts` outside the character file.

### Gap 1 (open) — future improvement

A planned `visibleCounters` array on `BattleFighterTemplate` will centralize counter display in the character file itself, removing the need for `battleDisplay.ts` entries. Until that is implemented, use Path A or Path B as described.

---

## 13. Validation Rules

The engine validates all ability and passive definitions at startup. Validation errors throw immediately in development.

**Rules that catch common mistakes:**

- `requiredActorConditions` must be non-empty when present (an empty array is rejected)
- Each condition in `requiredActorConditions` must pass `validateCondition`
- `healScaledByCounter` is valid on abilities with `kind: 'heal'` or `kind: 'utility'`
- `shieldScaledByCounter` is valid on any ability kind
- `counterKey` in scaled effects must be a non-empty string
- `powerPerStack` must be a positive number
- `duration` on `setMode` must be a positive integer
- `adjustCounter` `amount` must be a non-zero integer
- `requiredTargetTags` must be a non-empty array when present

**Run validation:** The engine runs `validateFighter` on every fighter at module load. TypeScript type errors catch most shape issues; the runtime validator catches semantic issues (empty arrays, invalid condition types, etc.).

---

## 14. Testing a Kit

Add tests to `src/features/battle/engine.test.ts`. Tests use real engine state with mocked fighters. Do not mock the engine — integration tests only.

### Test structure

```typescript
describe('Yuji Itadori', () => {
  let state: BattleState
  let yujiId: string

  beforeEach(() => {
    state = createTestBattleState([yuji], [mockEnemy])
    yujiId = state.teams[0].fighters[0].instanceId
  })

  it('Black Flash is locked without Soul Charge', () => {
    const blockReason = getQueueAbilityBlockReason(state, yujiId, 'yuji-black-flash', enemyId)
    expect(blockReason).toBe('Not available')
  })

  it('Black Flash becomes available after Soul Charge', () => {
    applySkill(state, yujiId, 'yuji-soul-charge', yujiId)
    expect(canUseAbility(state, yujiId, 'yuji-black-flash')).toBe(true)
  })
})
```

### What to test per kit

1. **Basic skill:** Deals correct damage / heals correct amount
2. **Mode-setter:** Correct mode duration, grants expected modifiers
3. **Mode-gated skill:** Blocked (`'Not available'`) before mode, available after
4. **Mode expiry:** Gated skill locked again after mode expires
5. **Counter accumulation:** Counter increments correctly per trigger
6. **Counter payoff:** Scaled effect deals/heals correct amount per stack count
7. **Counter reset:** `consumeStacks: true` clears counter; subsequent check finds 0
8. **Passive trigger:** Fires under correct conditions, does not fire otherwise
9. **One-time passive:** Does not fire a second time after the flag is set
10. **Block reason label:** `'Not available'` vs. `'No valid targets'` for actor vs. target locks

### Scaled effect test pattern

```typescript
it('Shikigami Recall heals 5 HP per stack', () => {
  const megumi = getTestFighter(state, megumiId)
  megumi.stateCounters['shikigami'] = 3
  megumi.hp = 70  // so there's room to heal
  applySkill(state, megumiId, 'megumi-shadow-recall', megumiId)
  const after = getTestFighter(state, megumiId)
  expect(after.hp).toBe(85)   // 70 + (3 * 5)
  expect(after.stateCounters['shikigami']).toBe(0)
})
```

Test multiple stack counts (1, 2, max) to confirm linearity.

---

## 15. Common Mistakes and Anti-Patterns

### Using `requiredTargetTags` to gate actor-state mechanics

**Wrong:** Adding `markerEffect('Mode Enabled', 4, 'all-enemies', ['mode-enabled'])` in a mode-setter, then `requiredTargetTags: ['mode-enabled']` on the gated skill.

**Why wrong:** Block reason is `'NO TARGET'` not `'LOCKED'`; bypassed by opponent debuff-clearing; markers accumulate on all enemies for an actor-internal mechanic.

**Right:** Use `requiredActorConditions: [{ type: 'actorModeIs', key: 'mode_key', value: 'active' }]`.

---

### Double-consuming a counter in paired effects

**Wrong:** Both heal and shield with `consumeStacks: true` — the shield reads 0 stacks because the heal reset the counter.

**Right:** Heal with `consumeStacks: false`, shield (the final effect) with `consumeStacks: true`. Both read the original counter; only the shield fires the reset.

---

### Using `counterKey` on a passive with a mismatched description

**Wrong:** Attaching `counterKey: 'shikigami'` to a passive whose description says "When Megumi takes damage..." — the pip tooltip will say "when taking damage" even though shikigami stacks are built proactively.

**Right:** Register the counter in `visibleCounterPresenters` if there is no semantically appropriate passive. Or ensure the passive's description accurately describes the counter's role when the passive owns the counter.

---

### Writing `elseEffects` where a `conditional` isn't needed

**Wrong:** Wrapping an unconditional effect in a `conditional` with no real conditions just to use the `elseEffects` branch.

**Right:** If the primary effects always run, put them at the top level. Use `conditional` only when behavior splits on a condition.

---

### Setting a mode to gate actor abilities and also putting that mode's expiry on the passive

The mode expiry passive (`onModeExpired`) fires when the engine clears the mode. If your gated ability checks `actorModeIs`, you don't also need a passive to explicitly disable the ability — the mode expiry naturally re-locks it. Only add a passive if expiry triggers additional side effects (removing modifiers, emitting an event, etc.).

---

### Using `amount: 0` on `adjustCounter`

This is a validation error. If you're conditionally adjusting a counter, wrap the effect in a `conditional` rather than adjusting by 0 in the else branch.

---

### Forgetting to import `emitCounterChange` in new effect handlers

If you add a new effect handler that resets a counter with `consumeStacks`, it must call `emitCounterChange` after setting the counter to 0. Without this call, the UI counter pips won't update visually even though the state is correct. See `healPacket.ts` and `shieldPacket.ts` for the correct pattern.

---

### Designing two independent resource systems on one character

One counter or one mode per character. A character with both a charge counter and a separate mode that operates independently has kit legibility problems: opponents can't track two resources from pip display, and the character's power ceiling becomes unpredictable to play against. If a design genuinely needs two resources, they should be tightly coupled (one feeds the other).

---

## Quick Reference

**State store by use case:**

| Need | Use |
|------|-----|
| Stackable resource (0–N) | `stateCounters` + `adjustCounter` |
| Temporary named state | `stateModes` + `setMode` with duration |
| Permanent one-time trigger | `stateFlags` + `setFlag` |

**Gating by what is being locked:**

| Lock condition | Mechanism |
|----------------|-----------|
| Actor must be in a mode | `requiredActorConditions: [actorModeIs]` |
| Actor must have N+ stacks | `requiredActorConditions: [counterAtLeast]` |
| Target must have a mark | `requiredTargetTags: [tag]` |

**Counter display by situation:**

| Situation | Path |
|-----------|------|
| Counter owned by a semantically matching passive | `counterKey` on `definePassive` |
| Counter has no matching passive, or passive description is wrong | `visibleCounterPresenters` in `battleDisplay.ts` |

**Scaled effect pairing:**

```
heal (consumeStacks: false) → shield (consumeStacks: true)
```

Both read original count. Shield owns the reset.
