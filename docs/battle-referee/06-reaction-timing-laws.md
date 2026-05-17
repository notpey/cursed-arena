# Reaction Timing Laws

Status: Phase 12 implementation contract.

This document consolidates the reaction timing behavior that was clarified during the Gojo correctness pass. The goal is to make the timing rule generic: future reactive mechanics should rely on engine contracts, not on Gojo-specific assumptions.

## 1. Trigger Window

When an active ability resolves against one or more targets, the engine uses this order:

1. The actor's `onAbilityUse` reaction guards.
2. The actor's `onAbilityUse` passives.
3. Each target's `onBeingTargeted` effect reaction guards.
4. Counter checks.
5. Reflect checks.
6. The triggering ability's effects.
7. Deferred reaction effects queued by the earlier reaction window.
8. The actor's `onAbilityResolve` passives.
9. Each target's `onBeingTargeted` passives.

This means `onBeingTargeted` effect reactions can prepare protection before the triggering ability's effects land. A reaction that grants invulnerability during this window can block the triggering harmful action.

## 2. Normal Reaction Effects

By default, an effect reaction resolves immediately when its trigger matches.

For example, a non-deferred `onBeingTargeted` reaction that heals the target resolves before the incoming damage. If the target is already at full HP, that heal may do nothing before the triggering damage lands.

Normal reaction effects still route through `resolveEffects()`. They respect:

- effect immunity
- helpful immunity
- invulnerability gates
- shield/protection rules
- declared harmful/helpful/neutral intent

## 2.1 Scheduled Effect Setup Gates

Creating a scheduled effect is itself effect setup. A harmful schedule effect must pass the normal target gates before it is armed.

This means an invulnerable target, or a target with relevant non-damage effect immunity, can block a harmful delayed setup from being created at all. If a schedule has multiple targets, eligible targets can still be scheduled while blocked targets are omitted.

Once a scheduled effect is armed, the delayed payload still resolves later through `resolveEffects()` and checks the target's protection state at that later time.

## 3. Deferred Reaction Effects

A reaction effect may opt into:

```ts
deferEffectsUntilAfterTrigger?: boolean
```

When this flag is true, the reaction still triggers in its normal position, still consumes itself if configured to do so, and still logs that it triggered. Its effects are queued into `ResolutionContext.deferredReactionEffects` instead of resolving immediately.

The queue flushes after the triggering action's counter/reflect/effect window completes. This is the "block first, cleanup after" contract.

Deferred effects are intended for post-trigger cleanup such as:

- removing the protection that blocked the triggering action
- collapsing a defensive mode after it successfully caused a block
- applying a delayed self-state change caused by being targeted

Deferred effects are not a bypass path. When flushed, they still resolve through `resolveEffects()` and obey the same immunity, helpful/harmful intent, invulnerability, shield, passive, and reaction laws as normal effects.

## 4. Post-Trigger Cleanup

If a target has protection active when a harmful skill targets them, that protection applies to the triggering skill before deferred cleanup can remove it.

The important consequence:

- A reaction may remove or collapse the protection after the trigger.
- That removal does not expose the target to the original triggering action.

This is the generic form of Gojo's Infinity ruling. Infinity was active when the harmful action targeted Gojo, so the action is blocked first. Infinity collapse cleanup happens afterward.

## 5. Counter, Reflect, And Deferred Cleanup

Counter and reflect priority remains stable:

- `onBeingTargeted` effect reactions trigger before counter/reflect checks.
- Counter checks run before reflect checks.
- A counter cancels the triggering action and prevents reflect from firing for that action.
- Deferred reaction effects still flush after the canceled action window.

This preserves commitment and timing clarity: a target can react to being targeted, a counter can still cancel the skill, and queued post-trigger cleanup still completes afterward if the target remains alive.

## 6. Deterministic Reaction Ordering

Multiple targets are checked in deterministic battlefield-slot order for counter/reflect priority.

Multiple effect reactions on the same fighter resolve in their stored guard order. This is deterministic because guard state is stored as an ordered array and guards are cloned before iteration. A consumed guard is skipped if it has already been removed before its turn.

The engine still does not expose an authored `priority` field for effect reaction guards. If future kits need same-fighter priority beyond insertion order, that should be added explicitly and tested as a separate phase.

## 7. Same-Round Tick Protection

Effect immunity state now carries:

```ts
appliedInRound?: number
```

`tickEffectImmunities()` skips the first same-round tick when `appliedInRound === state.round`. This aligns effect immunity duration behavior with modifiers, class stuns, intent stuns, reaction guards, and state modes.

This is a generic timing law, not a Gojo-specific exception. A one-round effect immunity applied during a team's turn survives that same team's end-of-turn tick and can affect the intended reaction window.

## 8. Current Limits

Deferred reaction effects are flushed by the active action resolution path. Current kit usage is in `onBeingTargeted` action windows. If a future kit needs deferred cleanup from scheduled effects, round-start passive damage, fatigue, or other non-action sources, add focused tests first and extend the flush point deliberately.

The explicit reaction priority field remains unimplemented. Slot order and stored guard order are deterministic, but authored priority is still a future capability.
