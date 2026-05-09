# Engine Authoring Gaps

Identified during the Yuji / Nobara / Megumi gold-standard kit pass. 353/353 tests pass. typecheck, lint, and build are clean.

Gaps 2, 3, and 5 are implemented. Gaps 1 and 4 remain open.

---

## Gap 1 — Dedicated visible-counter presenters

**Status:** Open  
**Priority:** Medium  
**Blocks roster overhaul:** No

### Problem

Important per-fighter counters that live on `stateCounters` have no first-class display home. A counter can only show up as a pip if it either (a) is registered in `visibleCounterPresenters` in `battleDisplay.ts`, or (b) attaches itself to an existing pip through the fuzzy name-match heuristic and the `counterKey` field on a `PassiveEffect`.

The heuristic is fragile. It scores on normalized string overlap between the counter key and existing group labels, which means counters with ambiguous names can silently attach to the wrong pip, or float away when modifiers aren't present at all.

### Current workaround

- **Yuji Black Flash bonus** (`yuji_black_flash_bonus`) is registered on the `yuji-sukuna-vessel` passive via `counterKey: 'yuji_black_flash_bonus'`. The counter piggybacks on the "Sukuna's Vessel" pip even before Sukuna triggers. The passiveEffects tracker only creates a pip when `stateCounters[counterKey] > 0`, so nothing shows until the bonus accumulates — but it renders under a conceptually unrelated passive.
- **Megumi Shikigami stacks** (`shikigami`) are registered on the `megumi-ten-shadows-strategist` passive via `counterKey: 'shikigami'`. That association is semantically appropriate, but the passive also fires on `onTakeDamage`, so the pip copy describes a reactive buff rather than the stack resource Megumi is building.
- **Nobara Straw Doll stacks** (`straw_doll_ritual_stacks`) are handled by a hardcoded entry in `visibleCounterPresenters` with fully custom description lines. This is the cleanest path today, but it required hand-authoring display strings in `battleDisplay.ts` outside of the character file.

### Why it matters for future roster design

Future characters will introduce counters that are strategically meaningful on their own: Mahito soul stacks (his power ceiling), Nanami ratio marks (a precision-based finisher gate), Toji weapon charges, and so on. Each will need a distinct, correctly-branded pip. The current path forces display logic into `battleDisplay.ts` (for `visibleCounterPresenters`) or silently attaches to whatever passive happens to declare `counterKey`. Neither scales cleanly to a 20+ character roster.

### Suggested future engine approach

Add a `visibleCounters` array to `BattleFighterTemplate` (and `BattlePassiveEffect` as an alternative). Each entry declares the counter key, display label, icon (label + tone), tooltip lines (as a format function or template string), and a `tone`. The pip renderer reads this declaration directly instead of deriving it from passive `counterKey` heuristics. Crucially, this separates "how this counter looks" from "which passive owns this counter," which are different concerns.

---

## Gap 2 — Generic `healScaledByCounter`

**Status:** Implemented  
**Priority:** High  
**Blocks roster overhaul:** No longer applicable

### What was implemented

A new `SkillEffect` type:

```typescript
{
  type: 'healScaledByCounter';
  counterKey: string;
  counterSource?: 'actor' | 'target';  // defaults to 'actor'
  powerPerStack: number;
  consumeStacks?: boolean;
  target: EffectTarget;
}
```

Handler lives in `src/features/battle/engine/effects/healPacket.ts` (`applyHealScaledByCounter`). Dispatched from the effect switch in `engine.ts`. Validation is in `validation.ts`. UI description is in `battleDisplay.ts` (`'restore HP for each stack'`).

### Where it is used

Megumi's **Shikigami Recall** (`megumi-shadow-recall`). Heals 5 HP per Shikigami stack. Uses `consumeStacks: false` so the shield effect that follows reads the same stack count before reset.

### Authoring notes

- `counterSource` defaults to `'actor'` — this is the expected default for heal effects, where the actor spends their own stacks to recover.
- `consumeStacks: false` on the heal when a paired `shieldScaledByCounter` follows — let the shield effect own the reset to avoid a double-consume.
- A 0-stack actor causes an early return with no events emitted, consistent with `damageScaledByCounter`.
- The heal bypasses `calculateHealing` modifier scaling intentionally — it represents a flat resource conversion, not an attack-style scaled heal. Revisit if a future kit needs modifier-amplified stack heals.

### Original problem (resolved)

Megumi's Recall had been flattened to a constant 15 HP heal gated on `counterAtLeast: 1`. This over-healed at 1 or 2 stacks. The adapted description said "15 HP" rather than exposing the per-stack mechanic. The implementation eliminates the approximation.

---

## Gap 3 — Generic `shieldScaledByCounter`

**Status:** Implemented  
**Priority:** High  
**Blocks roster overhaul:** No longer applicable

### What was implemented

A new `SkillEffect` type:

```typescript
{
  type: 'shieldScaledByCounter';
  counterKey: string;
  counterSource?: 'actor' | 'target';  // defaults to 'actor'
  powerPerStack: number;
  consumeStacks?: boolean;
  shieldLabel?: string;
  shieldTags?: string[];
  target: EffectTarget;
}
```

Handler lives in `src/features/battle/engine/effects/shieldPacket.ts` (`applyShieldScaledByCounter`). Dispatched from the effect switch in `engine.ts`. Validation is in `validation.ts`. UI description is in `battleDisplay.ts` (`'gain shield for each stack'`).

### Where it is used

Megumi's **Shikigami Recall** (`megumi-shadow-recall`). Grants 5 shield per Shikigami stack consumed. Uses `consumeStacks: true` — this is the final effect in Recall, so it owns the counter reset.

### Authoring notes

- When pairing with `healScaledByCounter` on the same counter, put the heal first with `consumeStacks: false` and the shield second with `consumeStacks: true`. Both read the original stack count; only the shield effect fires the reset.
- `shieldLabel` and `shieldTags` are optional and pass through directly to `applyShieldToFighter`, so existing shield tag mechanics (breakShield by tag, onShieldBroken passives) work without extra handling.
- A 0-stack actor causes an early return with no events emitted.

### Original problem (resolved)

Paired with Gap 2 — the same Recall adaptation that flattened heal also flattened shield. Both gaps were implemented together to keep the `scaledByCounter` effect family coherent.

---

## Gap 4 — Optional source-owned counters

**Status:** Deferred — wait for a specific kit that requires it  
**Priority:** Low  
**Blocks roster overhaul:** No

### Problem

All counters live on the *target* fighter's `stateCounters` record, keyed by a flat string. There is no concept of ownership — two different source fighters cannot independently track stacks of the same logical debuff on the same target.

For Nobara, this is fine: `straw_doll_ritual_stacks` is a Nobara-exclusive mechanic and only one Nobara can be on a team. The limitation is invisible in the current roster.

### Current workaround

No workaround needed yet. The convention works for all current characters because no two fighters share a counter key on the same target. The risk is latent.

### Why it matters for future roster design

Future kits may require independent mark-stacking. Examples:

- A Kechizu + Eso team applying Rot marks independently, where each source's stacks should drain separately on defeat.
- Two copies of the same character in the same team (not currently possible, but a design decision that was deliberately deferred rather than ruled out).
- A character whose debuff specifically tracks "stacks applied by this fighter" for payoff purposes.

If counter ownership is never needed, this gap is harmless. But the first kit that needs it will require structural changes to `stateCounters` (e.g., keying by `${sourceId}:${counterKey}`) and all readers of `counterSource` in effect resolution.

### Suggested future engine approach

Introduce an optional `counterOwner` field on `adjustCounter` and `damageScaledByCounter`. When set, the counter is stored in a namespaced key `${ownerId}:${counterKey}` internally. Effect resolution reads the namespaced key. Presenters would aggregate or display per-owner totals. This is additive — unowned counters continue to use the flat key — so the change is backward-compatible.

---

## Gap 5 — Actor-condition ability availability

**Status:** Implemented  
**Priority:** Medium  
**Blocks roster overhaul:** No longer applicable

### What was implemented

A new optional field on `BattleAbilityTemplate`:

```typescript
requiredActorConditions?: BattleReactionCondition[]
```

When present, the engine evaluates every condition against the actor's own fighter state before the ability is considered usable. If any condition fails, the ability is blocked. This happens before target validation, so the block reason is always actor-state-specific rather than "no valid targets."

The check is enforced in three places in `engine.ts`:
- `canUseAbility` — used by the AI
- `getQueueAbilityBlockReason` — drives the UI disabled state; returns `'Not available'` on failure
- `getBattleCommandBlockReason` — validates fully-formed queued commands before execution

The UI (`BattleAbilityStrip.tsx`) maps `'Not available'` to the `'LOCKED'` badge, distinct from `'NO TARGET'`. `BattleInfoPanel.tsx` displays the raw reason string verbatim, so it reads correctly without changes.

Validation in `validation.ts` rejects an empty `requiredActorConditions` array and validates each entry through the existing `validateCondition` function.

### Where it is used

Yuji's **Black Flash** (`yuji-black-flash`):

```typescript
requiredActorConditions: [{ type: 'actorModeIs', key: 'soul_charge', value: 'active' }]
```

Black Flash is only usable while Yuji is in Soul Charge mode. The Soul Charge skill (`yuji-soul-charge`) sets `soul_charge` mode for 4 turns; when that mode expires, Black Flash is automatically locked again.

### Authoring notes

**Use `requiredActorConditions` for actor-state locks.** Any condition from `BattleReactionCondition` works: `actorModeIs`, `fighterFlag`, `counterAtLeast`, `selfHpBelow`, etc. These conditions are evaluated against the actor with `context.target = null`, so target-dependent condition types (`targetHpBelow`, `targetModeIs`, etc.) will always evaluate to false and should not be used here.

**Do not use `requiredTargetTags` for actor-state availability.** Target tags remain correct for true target-based requirements — "can only target marked enemies" (Nobara's Soul Resonance and Hairpin). The distinction matters: a debuff-cleanse mechanic that strips enemy markers should not inadvertently unlock a mode-gated ability.

**The `actorModeIs` condition is the primary tool for mode-gated abilities.** `setMode` with a duration is the natural pairing — the ability becomes usable when the mode is set and automatically re-locks when the mode expires.

### Original problem (resolved)

Yuji's Black Flash previously used `requiredTargetTags: ['yuji-black-flash-enabled']`. Soul Charge applied that marker to all enemies for 4 turns. When the marker expired, Black Flash became untargetable — but the block reason shown to the player was "no valid targets" rather than "not in Soul Charge." A future debuff-purge character would have been able to unlock Black Flash by clearing the marker. The workaround is fully removed: the tag constant, the `markerEffect` call in Soul Charge, and the `requiredTargetTags` field on Black Flash are all gone.

---

## Open work summary

| Gap | Description | Status | Priority |
|-----|-------------|--------|----------|
| 1 | Dedicated visible-counter presenters | Open | Medium |
| 2 | `healScaledByCounter` | Implemented | — |
| 3 | `shieldScaledByCounter` | Implemented | — |
| 4 | Source-owned counters | Deferred | Low |
| 5 | `requiredActorConditions` ability availability | Implemented | — |

Gap 1 is the only remaining display-layer gap. It does not block any current kit but will become noticeable as the roster grows past characters whose counters already have ad-hoc display homes. Gap 4 should wait for a specific kit that requires it.
