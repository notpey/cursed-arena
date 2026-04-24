# Cursed Arena Battle Engine Effects Spec

## Purpose
This document turns the battle-effect wishlist into a concrete engine plan.
It defines the primitives we should build so new skills and passives become authored data instead of engine-specific code.

Use this spec as the source of truth for the next engine phases after the current status/trigger/schedule/replacement groundwork.

## Current Engine Snapshot
The current runtime already supports:
- generic statuses
- passive triggers with basic conditions
- delayed scheduled effects
- temporary ability replacement
- deterministic damage/heal resolution
- cooldown and energy systems

The current effect model is still too shallow for long-term kit design because most advanced mechanics would require adding more one-off effect opcodes.
The next step is to stabilize a small set of engine primitives that can express many mechanics.

## Design Rule
Add a new top-level effect type only when it changes engine control flow or state shape.
Most authored mechanics should reduce to one of these primitives:
- packet ops: damage, heal, resource, shield
- modifier ops: add, remove, transform, consume
- ability-state ops: grant, lock, replace, copy, mutate
- scheduler ops: run later, repeat, expire
- entity ops: summon, transform, spawn field effect
- event reactions: when X happens, evaluate conditions and resolve effects

## Core Runtime Primitives

### 1. Structured Event Bus
The engine should emit structured events, not just log strings.
Those events drive passives, traps, counters, and delayed logic.

```ts
export type BattleEventType =
  | 'round_started'
  | 'round_ended'
  | 'turn_started'
  | 'turn_ended'
  | 'ability_selected'
  | 'ability_used'
  | 'ability_resolved'
  | 'damage_would_apply'
  | 'damage_applied'
  | 'heal_would_apply'
  | 'heal_applied'
  | 'resource_changed'
  | 'modifier_applied'
  | 'modifier_removed'
  | 'status_applied'
  | 'status_removed'
  | 'fighter_defeated'
  | 'fighter_revived'
  | 'summon_spawned'
  | 'summon_removed'
```

```ts
export type BattleEventPayload = {
  type: BattleEventType
  round: number
  actorId?: string
  targetId?: string
  team?: BattleTeamId
  abilityId?: string
  amount?: number
  tags?: string[]
  meta?: Record<string, string | number | boolean | null>
}
```

Implementation notes:
- keep the existing UI log as a presentation layer derived from structured events
- allow listeners to inspect and mutate packets before final application where appropriate
- avoid an open callback registry at first; use an internal dispatch pipeline that collects matching authored reactions

### 2. Packet Pipeline
Packets are the correct home for combat math and prevention.

```ts
export type DamagePacket = {
  kind: 'damage'
  sourceActorId: string
  targetId: string
  abilityId?: string
  baseAmount: number
  amount: number
  damageType?: 'normal' | 'true' | 'burn' | 'execute' | 'recoil'
  flags: {
    isUltimate?: boolean
    isCounter?: boolean
    ignoresShield?: boolean
    ignoresReduction?: boolean
    lethal?: boolean
  }
  tags: string[]
}

export type HealPacket = {
  kind: 'heal'
  sourceActorId: string
  targetId: string
  abilityId?: string
  baseAmount: number
  amount: number
  flags: {
    isRegen?: boolean
    canOverheal?: boolean
  }
  tags: string[]
}

export type ResourcePacket = {
  kind: 'resource'
  sourceActorId?: string
  targetTeam: BattleTeamId
  resource: 'physical' | 'technique' | 'vow' | 'mental' | 'reserve'
  amount: number
  mode: 'gain' | 'spend' | 'drain' | 'steal' | 'set'
  tags: string[]
}
```

Implementation notes:
- all damage/heal/resource effects should resolve through packets
- mitigation, amplification, prevention, reflect, lifesteal, and redirection all hook into packets
- packet history should be preserved for later conditions like "if this attack dealt 30+ damage"

### 3. Generic Modifier Model
Most statuses and buffs should become generic modifiers.
Named statuses still exist for UI and validation, but the runtime primitive should be broader.

```ts
export type ModifierScope = 'fighter' | 'team' | 'battlefield' | 'ability'

export type ModifierStat =
  | 'damageDealt'
  | 'damageTaken'
  | 'healDone'
  | 'healTaken'
  | 'shieldGain'
  | 'shieldValue'
  | 'speed'
  | 'cooldownRate'
  | 'energyGain'
  | 'energyCost'
  | 'canAct'
  | 'canUseUltimate'
  | 'canUseSkill'
  | 'forcedTarget'
  | 'targetable'
  | 'evasion'
  | 'critChance'
  | 'critDamage'

export type ModifierMode = 'flat' | 'percentAdd' | 'multiplier' | 'set'

export type DurationModel =
  | { kind: 'rounds'; remaining: number }
  | { kind: 'turns'; remaining: number }
  | { kind: 'hits'; remaining: number }
  | { kind: 'uses'; remaining: number }
  | { kind: 'permanent' }
  | { kind: 'untilRemoved' }

export type ModifierInstance = {
  id: string
  label: string
  sourceActorId?: string
  sourceAbilityId?: string
  scope: ModifierScope
  targetId?: string
  stat: ModifierStat
  mode: ModifierMode
  value: number | boolean | string
  duration: DurationModel
  stacks?: number
  maxStacks?: number
  tags: string[]
  visible?: boolean
}
```

Implementation notes:
- `stun`, `silence`, `blind`, `taunt`, `invulnerable`, `attack up`, `damage amp`, and many others should become modifiers or modifier bundles
- keep `BattleStatusKind` only for the short list of highly visible canonical labels unless/until UI moves to generic modifier chips

### 4. Persistent Effects
Persistent effects cover traps, bombs, auras, summons, domains, and repeating jobs.

```ts
export type PersistentEffect = {
  id: string
  ownerId?: string
  team?: BattleTeamId
  label: string
  kind: 'aura' | 'trap' | 'countdown' | 'field' | 'summon-link'
  duration: DurationModel
  triggers: ReactionDefinition[]
  tags: string[]
}
```

Implementation notes:
- scheduled jobs are the simplest subset of persistent effects
- do not keep adding special arrays for each new mechanic; unify them under persistent runtime objects

### 5. Ability State Model
Temporary unlocks, seals, copies, and transformations should not mutate base authored ability arrays directly.

```ts
export type AbilityStateDelta = {
  slotAbilityId: string
  mode: 'replace' | 'grant' | 'lock' | 'mutate'
  replacement?: BattleAbilityTemplate
  granted?: BattleAbilityTemplate
  changes?: Partial<BattleAbilityTemplate>
  duration: DurationModel
  tags: string[]
}
```

Implementation notes:
- current `replaceAbility` becomes one specialization of `AbilityStateDelta`
- `grant` covers temporary unlocks and copied skills
- `lock` covers silence, seal, disable-ult, or one-slot suppression
- `mutate` covers "next use costs 0" or "this skill becomes AoE"

### 6. Entity Model
Summons and transforms need a first-class entity abstraction.

```ts
export type BattleEntityKind = 'fighter' | 'summon'

export type BattleEntityState = BattleFighterState & {
  entityKind: BattleEntityKind
  ownerId?: string
  expiresOn?: DurationModel
  tags: string[]
}
```

Implementation notes:
- do not split engine logic into separate summon paths if they mostly behave like fighters
- summons can later opt out of energy generation, ultimate access, or targeting through tags/modifiers

## Reaction Model
Current passive triggers are a good start, but the long-term model should be a reusable reaction definition used by fighters, persistent effects, summons, and battlefield rules.

```ts
export type ReactionTrigger = BattleEventType

export type ReactionCondition =
  | { type: 'selfHpBelow'; threshold: number }
  | { type: 'targetHpBelow'; threshold: number }
  | { type: 'sourceHasTag'; tag: string }
  | { type: 'targetHasTag'; tag: string }
  | { type: 'actorHasModifier'; label: string }
  | { type: 'targetHasModifier'; label: string }
  | { type: 'abilityId'; abilityId: string }
  | { type: 'abilityTag'; tag: string }
  | { type: 'damageAtLeast'; amount: number }
  | { type: 'killConfirmed' }
  | { type: 'wouldBeLethal' }
  | { type: 'teamHasLivingCountAtMost'; count: number }
  | { type: 'roundAtLeast'; round: number }
  | { type: 'oncePerBattle' }

export type ReactionDefinition = {
  id: string
  label: string
  trigger: ReactionTrigger
  conditions: ReactionCondition[]
  effects: EngineEffect[]
}
```

Implementation notes:
- replace `PassiveEffect` internally with `ReactionDefinition`; keep `PassiveEffect` as authored sugar if needed
- `onTargetBelow` should remain only as compatibility sugar that normalizes to a condition on a normal trigger

## Comprehensive Effect Catalog
This is the implementation map. Most future effects should slot into one of these families.

### A. Damage Ops
Use damage packets.
- flat damage
- true damage
- percent max-HP damage
- percent missing-HP damage
- splash damage
- chained damage
- recoil
- self-sacrifice damage
- reflected damage
- drain damage / lifesteal source
- execute bonus
- damage cap
- damage floor
- redirected damage
- delayed damage

### B. Healing Ops
Use heal packets.
- flat heal
- percent heal
- regen
- burst delayed heal
- overheal
- overheal to shield
- heal block
- heal reduction
- heal amplification
- revive to fixed HP

### C. Shield and Protection Ops
Use packets + modifiers.
- flat shield
- percent max-HP shield
- shield conversion
- shield steal
- damage reduction
- damage immunity
- one-hit barrier
- lethal prevention
- dodge charges
- interception/bodyguard

### D. Resource Ops
Use resource packets.
- gain energy
- gain specific resource type
- spend extra resource
- refund resource
- drain enemy resource
- steal enemy resource
- lock resource generation
- convert one resource into another
- HP as cost
- ult gauge gain/loss if that exists later

### E. Modifier Ops
Use generic modifiers.
- attack up/down
- damage dealt up/down
- damage taken up/down
- heal done/taken up/down
- speed up/down
- cooldown rate up/down
- cost reduction/increase
- evasion, accuracy, crit rate, crit damage
- cannot act, cannot use ult, cannot target allies, forced target
- invisibility/untargetable/reveal once supported by UI

### F. Status Lifecycle Ops
Operate on modifiers/statuses.
- apply
- refresh
- extend
- reduce duration
- stack
- cap stacks
- convert stacks to burst
- consume stack on use/hit
- copy
- steal
- transfer
- spread
- cleanse one/all by filter
- purge buffs/debuffs by filter

### G. Ability-State Ops
Operate on ability-state deltas.
- replace slot
- temporary unlock
- grant copied skill
- lock slot
- disable ultimate
- mutate target rule
- mutate cost
- mutate cooldown
- mutate effect payload
- repeat last used skill
- force next skill
- set charges
- consume charges

### H. Action-Economy Ops
Mutate queue or per-turn action state.
- extra action
- skip action
- force pass
- act first
- act last
- repeat action
- cancel queued action
- delay queued action to next turn
- reserve action for later trigger

### I. Persistent/Delayed Ops
Use persistent effects.
- round-start bomb
- round-end bomb
- after-N-actions trigger
- after-N-hits trigger
- repeating aura pulse
- timed trap
- expiry burst
- field zone that alters packets

### J. Entity Ops
Use entity model.
- summon ally
- summon enemy construct
- clone self
- sacrifice summon for effect
- linked HP summon
- untargetable support summon
- escort summon

### K. Transformation Ops
Use entity/ability-state/modifier bundles.
- stance swap
- awaken on threshold
- ultimate form
- death-trigger transform
- transform ally into summon state
- possession / alternate personality

### L. Battlefield / Team Ops
Use persistent effects scoped above fighter level.
- team aura
- enemy-wide debuff aura
- terrain / weather / domain
- round rule changes
- anti-heal field
- bonus ult damage field
- team damage split
- teamwide shield pulse

## Minimal New Top-Level Engine Effects
The engine does not need an opcode for every row above.
A durable long-term set is:

```ts
export type EngineEffect =
  | { type: 'emitDamage'; packet: DamageEffectTemplate; target: EffectTarget }
  | { type: 'emitHeal'; packet: HealEffectTemplate; target: EffectTarget }
  | { type: 'emitResource'; packet: ResourceEffectTemplate; targetTeam: 'self' | 'enemy' }
  | { type: 'addModifier'; modifier: ModifierTemplate; target: EffectTarget }
  | { type: 'removeModifier'; filter: ModifierFilter; target: EffectTarget }
  | { type: 'modifyAbilityState'; delta: AbilityStateDeltaTemplate; target: EffectTarget }
  | { type: 'schedule'; schedule: ScheduleTemplate; target: EffectTarget }
  | { type: 'spawnPersistent'; persistent: PersistentEffectTemplate; target: EffectTarget }
  | { type: 'summon'; summon: SummonTemplate; targetSide: 'self' | 'enemy' }
  | { type: 'transform'; formId: string; target: EffectTarget }
  | { type: 'cleanse'; filter: ModifierFilter; target: EffectTarget }
  | { type: 'dispel'; filter: ModifierFilter; target: EffectTarget }
```

Everything else should compile down to these.

## Recommended Phase Order

### Phase A: Event Bus and Packets
Build first.
- introduce structured runtime events
- route current damage/heal/resource through packets
- convert current trigger checks to event-driven matching

### Phase B: Generic Modifier System
Build second.
- introduce modifier instances and filters
- migrate current statuses (`attackUp`, `mark`, `burn`, `stun`, `invincible`) to modifier-backed or hybrid implementations
- keep current UI labels stable during migration

### Phase C: Ability-State and Persistent Effects
Build third.
- generalize current replacement into ability-state deltas
- fold scheduled effects into persistent effects
- add slot locks and temporary grants

### Phase D: Summons and Transformations
Build fourth.
- add entity abstraction
- add summon lifecycle
- add fighter-form swaps

### Phase E: ACP Authoring Upgrade
Build after the runtime is stable.
- visual editor for conditions and modifier filters
- nested effect editor for scheduled/persistent payloads
- reusable blueprints for common mechanics
- validation that catches illegal combinations before publish

## ACP Requirements
The ACP will become the limiting factor if the runtime gets more expressive than the authoring surface.
The minimum ACP upgrades needed after runtime work:
- condition builder UI instead of raw JSON only
- nested effect editing for delayed and persistent effects
- modifier builder UI with stat, mode, value, duration, stacks, visibility
- ability-state editor for unlock/replace/lock/grant
- packet flags editor for damage/heal/resource templates
- validation messages phrased in designer language, not engine language only

## Immediate Implementation Recommendation
The next code phase should not add five random effect opcodes.
It should add these exact runtime pieces in order:
1. `BattleEventPayload` and event dispatch inside resolution.
2. `DamagePacket` and `HealPacket` with pre/post hooks.
3. `ModifierInstance` storage on fighters/teams/battlefield plus filter helpers.
4. `addModifier` and `removeModifier` effects.
5. Generalized `AbilityStateDelta` replacing the current single-purpose replacement effect.

Once those exist, most of the remaining effect catalog becomes authored content rather than engine refactors.

## Compatibility Notes
To avoid breaking the current roster while migrating:
- normalize current `PassiveEffect` into `ReactionDefinition` at load time
- normalize current named statuses into modifier bundles at resolve time
- keep the current battle UI reading legacy labels until modifier chips are ready
- preserve current tests and add packet/modifier parity tests before removing old paths
