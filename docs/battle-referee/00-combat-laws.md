# Cursed Arena — Combat Laws
## The Battle Referee's Constitutional Document

> *The engine is a judge. It does not negotiate. It does not forget. It does not play favorites. It reads the laws and enforces them, every time, without exception.*

**Version:** 1.1  
**Date:** 2026-05-16  
**Status:** Source of Truth — supersedes any conflicting implementation detail

---

## Core Philosophy

### The Stern Referee Model

Cursed Arena is a tactical combat game. Players invest thought into every decision — which ability to use, who to target, which order to act in, how to spend their energy. That investment only matters if the game enforces its own rules precisely and consistently.

The battle engine must behave like a stern referee, not a permissive friend.

A permissive friend might let a stunned fighter slip a skill through "just this once." A permissive friend might let a player target someone who should be untargetable "because nothing bad happens anyway." A permissive friend produces bugs, exploits, and players who distrust the game.

A stern referee says: *the law applies here. Here is what happens. No exceptions unless the law explicitly names one.*

This document is the referee's rulebook.

---

### Deterministic Combat

Every outcome in Cursed Arena must be derivable from the game state. Given the same inputs, the referee produces the same result — every time, on every machine, for every player.

There are no hidden RNG rolls during combat resolution that the player cannot account for. There is no "it depends on which handler ran first." There is no "well, it's complicated."

If a player understands the combat laws, they can predict how any interaction resolves. That predictability is what makes the game tactical rather than arbitrary.

---

### Readable Tactical States

Every meaningful condition a fighter can be in — stunned, invulnerable, marked, burning, shielded, locked — must be visible and unambiguous. Players should never have to wonder "is my fighter stunned right now?" The answer must be available in the UI in the same form that the engine reads it.

**The UI and engine must agree at all times.** If the engine says a fighter is stunned and the UI doesn't show it, that is a law violation. If the UI shows invulnerable but the engine allows damage through, that is a law violation.

---

### Clear Cause and Effect

Every combat event must have a traceable cause. When a fighter takes damage, the player should be able to see who dealt it, from what ability, and how much. When an ability fails, the player should be told why — not silently ignored.

*The game says no, and the game says why.*

---

### Player Trust

Player trust is the most fragile resource in a competitive game. It takes thousands of correct interactions to build and one inconsistent interaction to damage.

A player who discovers that their counter didn't fire because of a subtle ordering issue, or that their invulnerable fighter still got stunned, will not conclude that they misunderstood the rules. They will conclude the game is broken. They may not be wrong.

**Laws exist to protect player trust.** Every combat law in this document exists because inconsistent behavior in that area would erode a player's confidence in the game.

---

### Laws Over Spaghetti Interactions

In a game with 40+ effect types, dozens of passive triggers, and an expanding character roster, individual effect handlers will multiply. If each handler is responsible for remembering to check every relevant law, bugs are inevitable. When the eighteenth character kit introduces a new shield effect and the programmer forgets to check effect immunity, the referee has failed.

**No combat law should depend on whether an individual handler remembered to check it.**

Laws must be enforced through centralized, universal mechanisms. A handler that applies a shield should not need to know about helpful-effect immunity. The referee layer should have already confirmed that applying the shield is legal before the handler ever runs.

---

### Inspiration: Naruto-Arena's Tactical Psychology

Cursed Arena draws inspiration from the tactical depth of Naruto-Arena — specifically its clarity about what each mechanic does and when. In Naruto-Arena, every interaction has a clean answer: counters fire under these conditions, invulnerability blocks these effects, mental skills bypass these traps.

Players learn the rules once and rely on them forever. That reliability is what transforms a game from a novelty into a competitive system.

Cursed Arena modernizes and extends this philosophy. We add more effect types, richer condition logic, and more expressive character kits. But the underlying commitment is the same: **the rules are the rules, and the game always follows them.**

---

## Section 0 — Intent Classification Law

Intent classification is the foundation on which targeting, immunities, and reaction logic all rest. Before any other law can be applied, the engine must know what an ability or effect is trying to do. This section defines intent as a first-class concept, not an implementation assumption.

---

### Law 0.1 — Universal Intent Categories

Every ability and every effect must carry a classified intent. Intent is not inferred on the fly; it is a declared property. There are exactly three valid intent categories:

**Harmful**
An ability or effect is harmful if its purpose is to disadvantage an opponent. Examples:
- Direct damage (all types)
- Stun, class stun, intent stun
- Marks, burns, debuffs
- Cooldown extension or ability lock
- Energy drain or steal
- Shield damage or break
- Applying any harmful modifier to an enemy

**Helpful**
An ability or effect is helpful if its purpose is to benefit the recipient. Examples:
- Healing HP
- Granting a shield
- Granting invulnerability
- Buffing attack, defense, or other stats
- Cleansing status effects
- Granting energy
- Applying any beneficial modifier to an ally

**Neutral**
An ability or effect is neutral if it neither harms nor benefits a fighter in a direct sense. Examples:
- Stance change or mode shift on self
- Transformation or form change with no immediate stat effect
- Setting an internal flag or counter on self
- Information reveals (such as scouting)
- Cosmetic state changes

Neutral effects are not subject to harmful or helpful immunity checks. They pass through both effect immunity categories freely, unless a specific immunity explicitly targets them by name.

---

### Law 0.2 — Classification Is Declared, Not Inferred

Intent must be a declared property of the ability and its effects — not something the engine infers at runtime by reading effect types. Runtime inference is error-prone, fragile, and inconsistent. When the engine needs to know if an ability is harmful or helpful, it reads the declared classification.

This applies equally to:
- The top-level ability intent (used for targeting, intent stun, and reaction routing)
- Individual effect intent (used for effect-level immunity, reflect, and conditional logic)

If an ability contains only helpful effects, it is classified helpful. If it contains only harmful effects, it is classified harmful. If it contains both — the mixed-intent rule applies (see Law 0.3).

---

### Law 0.3 — Mixed-Intent Abilities

Some abilities combine helpful and harmful effects: an attack that also buffs the attacker, or a heal that poisons the target as a cost. These abilities cannot be assigned a single intent in a way that satisfies all laws without ambiguity.

**Constitutional ruling: effect-level split.**

Mixed-intent abilities are classified harmful or helpful at the **effect level**, not the ability level. Each individual effect carries its own intent. The ability's top-level classification reflects the dominant purpose, used only for routing decisions that require a single answer (such as intent stun evaluation).

Concretely:

- **For intent stun:** The ability's top-level intent determines whether intent stun blocks it. If the primary purpose of the ability is harmful, a harmful intent stun blocks the entire ability — including its helpful sub-effects. The fighter is not allowed to do the harmful thing by hiding it in a mixed-intent package.
- **For targeting:** The ability targets according to its primary harmful or helpful routing. A primarily harmful ability targets enemies even if it includes self-buffs.
- **For helpful immunity:** Individual helpful effects within a mixed-intent ability are blocked by helpful immunity on the target, even if the ability overall is classified harmful. A harmful ability that heals the target as a secondary effect cannot heal a target with helpful immunity.
- **For effect immunity:** Each effect is blocked or permitted individually based on its type, regardless of the top-level ability classification.

**Justification:** Ability-level dominant classification alone creates exploits — players would wrap harmful effects in mixed packages to evade intent stuns. Effect-level splitting stops this while preserving expressive ability design. The top-level classification is retained as a routing shortcut only.

---

### Law 0.4 — Self-Targeted Effects and Intent

A self-targeted effect — an effect where the actor targets themselves explicitly — is always classified based on its outcome, not its origin. A fighter self-applying a burn for a cost is applying a harmful effect to themselves. That effect is still classified harmful, even though the source is self.

This distinction matters for:
- Helpful immunity: a self-applied heal is helpful and is blocked by helpful immunity.
- Effect immunity self-bypass: the self-bypass rule (see Law 4.1) permits the actor to bypass their *own* effect immunity. It does not re-classify the effect.

---

### Law 0.5 — Intent Is Used Consistently Across All Laws

Intent drives the following laws — they must all read the same classification:

- **Law 1.4 (Intent Stun):** Which abilities are blocked
- **Law 3.1 (Correct Side):** Which fighters can be targeted
- **Law 3.3 (Invulnerability Targeting):** Whether the target is shielded from this ability
- **Law 4.3 (Helpful Effect Immunity):** Whether a helpful effect is blocked
- **Law 6.1 (Counter):** Whether a counter fires (counters respond to harmful abilities)
- **Law 6.2 (Reflect):** Whether reflect engages (reflect responds to harmful abilities)

Any implementation that classifies intent differently for different laws is a bug.

---

## Section 1 — Actor Laws

Actor laws govern whether a fighter is allowed to take any action at all in a given moment.

These are the first laws evaluated, in order, before anything else. If an actor law fails, the action stops. No energy is spent. No targets are resolved. No effects fire.

---

### Law 1.1 — Alive Law

**Definition:** A fighter must be alive to take any action.

**Referee interpretation:** A fighter is alive if and only if their current HP is greater than zero. A fighter at exactly zero HP is dead and cannot act, be targeted for helpful effects, or have their cooldowns tick. Dead is final. There is no partially-dead state.

**Player expectation:** A dead fighter's portrait shows a KO state. No abilities are available. No actions can be queued. If a fighter dies mid-turn before their queued action resolves, their action is canceled with an explicit message.

**Exceptions:** None. A fighter with Undying protection cannot die from damage (their HP is floored at 1), but this prevents them from ever reaching zero HP — it does not change the definition of alive. A fighter at 1 HP is alive.

**Examples:**
- Fighter A queues an ability. Fighter B kills Fighter A before Fighter A's action resolves. Fighter A's action is canceled. No energy is refunded. Fighter A's turn is lost.
- A scheduled effect targets Fighter A. Fighter A dies before the effect fires. The scheduled effect does not resolve.

---

### Law 1.2 — Full Stun Law

**Definition:** A stunned fighter cannot take any action.

**Referee interpretation:** A fighter afflicted with a stun effect (the `canAct = false` condition) may not use abilities, may not have abilities queued on their behalf, and may not resolve any queued action they had pending. This is a complete action block. The fighter is not merely hindered — they are locked out entirely.

**Player expectation:** A stunned fighter shows the STN badge. No ability can be selected in the UI. If the fighter was already in the queue when the stun was applied, the action is canceled at the moment of resolution with an explicit message. The turn is lost.

**Exceptions:** An ability that explicitly carries the property "can be used while stunned" bypasses this law. Such abilities must be explicitly designed and documented. No ability bypasses stun implicitly.

**Examples:**
- Fighter B stuns Fighter A. On Fighter A's next turn, every ability is locked. The fighter is forced to pass.
- Fighter A queues an ability. Then Fighter B's action resolves and stuns Fighter A. When Fighter A's turn comes, the queued action is canceled.
- A passive effect on Fighter A would normally fire on round start. Stun does not prevent passives from firing — only active ability usage is blocked.

**Current engine note:** The `canUseAbility()` function currently does not check for stun. This is a law violation: the engine's ability legality check must agree with the referee's actor law. This gap must be closed.

---

### Law 1.3 — Class Stun Law

**Definition:** A class-stunned fighter cannot use abilities belonging to the blocked class.

**Referee interpretation:** A class stun targets a category of abilities rather than all abilities. If a fighter's Cursed Technique skills are sealed, they may still use Physical skills, Strategic skills, or any ability not in the blocked class. If all their available abilities fall into the blocked class, they are functionally unable to act.

A class stun specifies which classes are blocked. It may also specify exempt classes — classes that are permitted even within a broader block. Class stun and full stun are independent: a fighter can be class-stunned without being fully stunned, and vice versa.

**Player expectation:** A fighter with class stun shows the CLS badge. In the UI, blocked abilities are visually disabled and display the reason. Available abilities remain accessible. The UI and engine agree on which abilities are blocked.

**Exceptions:** An ability explicitly in the exempt class list of an active class stun may still be used. The exemption is part of the class stun definition, not an override of the law.

**Examples:**
- Fighter A's Physical skills are sealed. They can still use their Cursed Technique abilities.
- Fighter A's Physical skills are sealed with an exemption for the "Instant" sub-class. Physical Instant abilities remain usable.
- Fighter A has all four abilities sealed by a broad class stun. They are functionally unable to act despite not being technically full-stunned.

**Current engine note:** `canUseAbility()` does not currently check class stun. This must be fixed.

---

### Law 1.4 — Intent Stun Law

**Definition:** An intent-stunned fighter cannot use abilities of the blocked intent.

**Referee interpretation:** Intent stun targets abilities by their declared intent (see Section 0). Harmful intent covers attacks, debuffs, and effects designed to hurt the opponent. Helpful intent covers heals, buffs, shields, and effects designed to support allies.

A fighter stunned against harmful abilities can still defend their team. A fighter stunned against helpful abilities can still attack. Unlike class stun, intent stun is based on what an ability is trying to do, not what category it belongs to.

**Player expectation:** The intent stun shows the INT badge. Blocked-intent abilities are disabled in the UI with a clear reason.

**Exceptions:** A mixed-intent ability is evaluated by its top-level declared intent (see Law 0.3). If the primary classification matches the blocked intent, the ability is blocked entirely, even if some of its effects would individually be acceptable.

**Examples:**
- Fighter A is intent-stunned against harmful actions. They cannot attack or debuff. They can still use a heal or apply a shield to a teammate.
- Fighter A is intent-stunned against helpful actions. They cannot heal or buff. They can still attack.
- Fighter A has a mixed ability (primarily harmful, with a self-buff). It is blocked by a harmful intent stun.

---

### Law 1.5 — Skill Lock Law

**Definition:** A locked ability cannot be used, regardless of class, intent, or conditions.

**Referee interpretation:** A skill lock targets a specific ability by identity. It does not seal a class — it targets one exact ability. A fighter with a locked ability cannot use that ability until the lock expires, even if the ability would otherwise be fully legal to use.

Skill lock is more surgical than class stun. It is used to prevent a specific technique rather than an entire category.

**Player expectation:** A locked ability appears visually distinct from a cooldown — it is not merely unavailable, it is sealed. The game should communicate this distinction. The lock duration should be visible.

**Exceptions:** None. A skill lock cannot be bypassed by any condition, form change, or modifier unless the lock is explicitly removed by an effect.

**Examples:**
- Fighter A's ultimate ability is locked for 2 turns. They cannot use it at all during that window, even if they can otherwise afford it.
- Fighter A has a skill replacement active. If the replacement ability is locked, they cannot use the replacement either.

---

### Law 1.6 — Required Conditions Law

**Definition:** An ability with required actor conditions can only be used when all conditions are met.

**Referee interpretation:** Some abilities are only available in specific circumstances — a particular mode, a counter threshold, a flag set by a previous action. These conditions must all be true at the moment of queuing and at the moment of resolution.

If conditions were met at queue time but are no longer met at resolution time, the action fails. The player spent their decision, but the ability does nothing. A clear message is displayed.

**Player expectation:** Unavailable abilities (due to unmet conditions) are visually distinguished from cooldown-locked abilities. A tooltip explains what is needed.

**Exceptions:** None. Required conditions are requirements, not suggestions.

**Examples:**
- An ability requires "True Form" mode. If the fighter has not entered True Form, the ability cannot be selected.
- A fighter queues an ability that requires a certain counter value. Between queuing and resolution, the counter is reduced below the threshold. The ability fails at resolution.

---

## Section 2 — Ability Laws

Ability laws govern whether a specific ability is legal to execute, independently of the actor's state.

Actor laws are checked first. If all actor laws pass, ability laws are checked next.

---

### Law 2.1 — Cooldown Law

**Definition:** An ability on cooldown cannot be used.

**Referee interpretation:** Cooldown represents recovery time after using an ability. A cooldown value of zero means ready. Any positive value means the ability is unavailable. Cooldowns decrement at the end of each round.

Cooldowns are checked at queue time and implicitly enforced at resolution time because the queue is not permitted if the cooldown is active.

**Player expectation:** The cooldown remaining is shown clearly on the ability. The ability is visually locked until it reaches zero.

**Exceptions:** Abilities that reduce or reset cooldowns may bring an ability back to zero mid-turn. If an ability's cooldown reaches zero during a turn, it is available for queuing on the next turn, not the current one.

---

### Law 2.2 — Energy Affordability Law

**Definition:** An ability cannot be used unless the team can afford its full energy cost.

**Referee interpretation:** Energy is a shared team resource. A team that cannot cover the full cost of an ability may not use it. The referee checks affordability strictly — if the pool is insufficient, the action is refused.

This check accounts for all abilities currently queued by the same team in the same turn. Queuing Fighter A's ability reduces the projected available energy for Fighter B. A player cannot overcommit their energy across their team.

**Player expectation:** An ability is shown as unavailable (grayed out) when the team cannot afford it given current queued actions. The reason is displayed.

**Exceptions:** If an effect during resolution changes the energy pool (via energy drain or gain), this may affect later abilities in the same turn. Energy changes during resolution are applied immediately and affect subsequent actions.

**Firm rule:** There is no graceful fallback. If the team cannot pay the cost, the ability does not fire. The engine does not silently substitute a cheaper version of the cost. The action is blocked or voided.

---

### Law 2.3 — Ability Replacement Law

**Definition:** When a replacement ability is active, the original is treated as though it does not exist.

**Referee interpretation:** A replaced ability is completely superseded. The fighter sees the replacement. The engine runs the replacement. The original ability's cooldown and cost are irrelevant while the replacement is active. When the replacement expires, the original returns exactly as it was.

**Player expectation:** The replacement ability appears in the ability slot. There is no indication that something was replaced unless explicitly surfaced. The replacement behaves as a first-class ability.

**Exceptions:** If both the original and the replacement are on cooldown independently, both cooldowns run concurrently while the replacement is active.

---

### Law 2.4 — Granted Ability Law

**Definition:** A temporarily granted ability is a full ability for the duration of the grant.

**Referee interpretation:** A granted ability is added to the fighter's available set in addition to their existing abilities. It behaves identically to a native ability. It has its own cooldown, cost, and effects.

**Player expectation:** The granted ability appears visibly in the fighter's ability panel. When the grant expires, it disappears.

---

### Law 2.5 — Cannot Be Countered Law

**Definition:** Abilities flagged as uncounterable bypass counter mechanics entirely.

**Referee interpretation:** Certain abilities are designed to be unblockable by reactive defenses. An uncounterable ability cannot trigger an opponent's counter guard. The ability proceeds to full resolution as though no counter exists.

**Player expectation:** There is no visual indication to the opponent that a skill is uncounterable before it fires. The absence of a counter trigger is itself informative — skilled players will learn which abilities bypass counters.

**Exceptions:** An ability may be counterable in general but have specific effects within it marked as uncounterable. In this case, those effects proceed normally while the ability itself can still be countered at the pre-effect stage.

---

### Law 2.6 — Cannot Be Reflected Law

**Definition:** Abilities flagged as unreflectable bypass reflect mechanics entirely.

**Referee interpretation:** A reflect-proof ability cannot have its effects redirected back to the attacker. It proceeds to full effect as though no reflect exists on the target.

This may be applied at the ability level (nothing in this ability can be reflected) or at the individual effect level (this specific effect within the ability cannot be reflected).

---

## Section 3 — Targeting Laws

Targeting laws govern which fighters can legally be selected as a target for a given ability. These are among the most important laws in the game, because targeting clarity is fundamental to tactical decision-making.

The central question is: **when the player aims at a fighter, what can happen?**

---

### Law 3.1 — Correct Side Law

**Definition:** Harmful abilities may only target the opposing team. Helpful abilities may only target the player's own team.

**Referee interpretation:** Side membership is determined at the time of targeting. A fighter belongs to either the player team or the enemy team. This does not change during combat.

Self-targeted abilities always target the acting fighter, regardless of team.

**Exceptions:** Abilities with explicit "all-units" targeting are designed to affect everyone. These are rare and must be explicitly designated.

---

### Law 3.2 — Alive Targeting Law

**Definition:** Dead fighters cannot be targeted by any active ability.

**Referee interpretation:** A fighter at zero HP is dead. Dead fighters are removed from all target pools. An ability that would target all enemies does not hit dead enemies. An ability that requires a single-target selection cannot select a dead fighter.

**Player expectation:** Dead fighters are visually distinct and unselectable.

**Exceptions:** Scheduled effects that were set up before a fighter died may still technically fire. The referee's preference is: if the target is dead when the scheduled effect resolves, skip that target. The effect was aimed at a living fighter and that condition is no longer met.

---

### Law 3.3 — Invulnerability Targeting Law

**Definition:** An invulnerable fighter is removed from harmful target pools. Invulnerability is primarily a targeting law, not merely a damage law.

**Referee interpretation:** Invulnerability is a targeting shield before it is a damage shield. When a harmful ability is seeking valid targets, an invulnerable fighter does not appear in that pool. The player cannot legally aim a harmful action at an invulnerable fighter.

This extends beyond damage: **all harmful effects are blocked against an invulnerable target** — not because of a separate effect immunity, but because the harmful targeting itself was illegal. The invulnerable fighter was never a valid target for that action. Stun, mark, debuff, cooldown extension, and shield break that arrive as part of a harmful ability cannot land on an invulnerable fighter because the ability could not legally target them in the first place.

**What invulnerability does not block:** Helpful effects can freely target invulnerable fighters (see Law 3.5). Neutral effects are also unaffected. Invulnerability is not a blanket immunity from all game effects — it is a shield against being legally targeted by harmful actions.

**The fire-but-block contract:** When a target becomes invulnerable *after* an action was legally queued against them, the game cannot retroactively cancel the player's commitment. The action fires. Its effects hit the invulnerability wall and are blocked in full. No harmful effect resolves — not damage, not stun, not anything that was aimed as part of a harmful action at that target. The action is logged. Energy is not refunded. Cooldown applies. See Law 5.6 for full fire-but-block resolution details.

**Player expectation:** The targeting UI shows only valid targets. An invulnerable fighter is visually marked as protected and cannot be selected for harmful actions. If invulnerability is gained mid-turn, the committed action fires into the protection and produces no effect, with a clear message.

**Exceptions:** Abilities flagged as ignoring invulnerability can target invulnerable fighters and resolve their effects normally.

---

### Law 3.4 — Required Tag Targeting Law

**Definition:** Some abilities require their target to carry a specific modifier tag. Targets without the tag cannot be selected.

**Referee interpretation:** Tag requirements are checked at the moment of target selection. If the tag is present, the fighter is a valid target. If the tag expires between queuing and resolution, the action fails as a no-op at resolution with a clear message.

**Player expectation:** Only tagged fighters appear in the valid target pool for these abilities. If no valid tagged target exists, the ability cannot be queued.

---

### Law 3.5 — Helpful Targeting Law

**Definition:** Helpful abilities can target invulnerable fighters.

**Referee interpretation:** Invulnerability protects against harm. An ally applying a heal or a shield to an invulnerable teammate is not attempting harm — the protection should not interfere with support.

**Exceptions:** If a fighter has "cannot receive helpful effects" active, even allied support is refused. This is a separate law from invulnerability (see Law 4.3).

---

### Law 3.6 — Targeting Resolution Hierarchy

When determining whether a target is valid, the referee evaluates in this order:

1. Is the target alive? (If no: invalid)
2. Is the ability's side correct? (Enemy vs. ally rule)
3. Is the target invulnerable and the ability harmful without bypass? (If yes: invalid — removed from target pool)
4. Does the target have the required tags? (If missing: invalid)

If all checks pass, the target is valid.

When the game must decide what to do with no valid target:

- **Refuse at queue time.** The player cannot queue the ability at all.
- **No-op at resolution.** If the target situation changes between queue and resolution (death, invulnerability, tag expiry), the action resolves as a no-op with a clear log message. No energy is refunded — the player committed to the action.

---

## Section 4 — Effect Laws

Effect laws govern whether a specific effect can legally apply to its target, after targeting has succeeded.

These laws are enforced during effect resolution, individually, per-effect, per-target.

---

### Law 4.1 — Effect Immunity Law

**Definition:** A fighter with effect immunity is protected from specified effect types.

**Referee interpretation:** Effect immunity blocks effects by type. A fighter immune to `stun` cannot be stunned. A fighter immune to `nonDamage` effects cannot receive any non-damaging harmful effect. The immunity is precise and exhaustive — if the effect type matches, it is blocked.

This check is universal. It applies to all effects from all sources: active abilities, passive triggers, reaction guards, burn ticks, fatigue, and any other mechanism. No effect is exempt from the immunity check unless the law says so.

**The self-bypass rule:** A fighter applying an effect to themselves bypasses their own effect immunity. This exists because many kit abilities grant self-buffs, and it would be unreasonable for a fighter's own protective systems to block their own self-improvement. However, this self-bypass applies only when the fighter is the source of the effect targeting themselves — not when a third party targets the fighter with a beneficial effect "for their benefit."

**Player expectation:** A fighter with effect immunity shows the IMM badge. When an effect is blocked by immunity, a clear message is logged.

**Exceptions:** The self-bypass is the only exception. There is no "powerful enough to pierce immunity" flag for non-damage effects; piercing flags are reserved for the damage and protection system.

---

### Law 4.2 — Harmful Effect Prevention Law

**Definition:** A fighter may be made immune to harmful effects broadly, not just specific types.

**Referee interpretation:** The `nonDamage` immunity catch-all blocks all non-damage harmful effects — stuns, marks, burns, debuffs, cooldown increases, and anything else that is not a direct HP reduction. This is a broad protective tool.

Damage is handled separately under protection laws and requires its own immunity specification.

---

### Law 4.3 — Helpful Effect Immunity Law

**Definition:** A fighter may be made unable to receive helpful effects from any source.

**Referee interpretation:** This is a control tool, not a defensive one. When an opponent applies a "cannot receive helpful effects" condition to a fighter, that fighter cannot receive heals, shields, buffs, invulnerability, or any other beneficial effect for the duration. This includes effects from their own teammates.

**No self-bypass for helpful effect immunity.** A fighter under helpful effect immunity cannot receive any helpful effects from any source, including themselves. This ruling is firm. Helpful effect immunity is an opponent-applied control mechanic — its entire purpose is to deny support, including self-support. If the fighter could self-heal through it, the mechanic would lose most of its strategic value. The opponent committed an action to apply this condition. The law respects that commitment.

This distinguishes helpful effect immunity from standard effect immunity:
- Standard effect immunity (Law 4.1): self-bypass permitted. The fighter's own protective systems should not block their own improvement.
- Helpful effect immunity (Law 4.3): no self-bypass. This is opponent-applied control, not a fighter's own protective system. The fighter is subject to it from all sources.

**Player expectation:** When a fighter cannot receive helpful effects, every attempted heal, shield, or buff directed at them is blocked with a message. Teammates should see the block so they don't waste actions.

---

### Law 4.4 — Cannot Gain Invulnerability Law

**Definition:** A fighter with this condition cannot become invulnerable through any means.

**Referee interpretation:** This blocks all pathways to invulnerability. It does not matter whether the invulnerability attempt came from an `invulnerable` effect, a modifier applied directly, a passive trigger, or any other mechanism. If gaining invulnerability is the intended outcome and this condition is active, it does not happen.

**Universality requirement:** This check must fire at the modifier application level, not in individual effect handlers. Any effect that would result in an `isInvulnerable` modifier being applied to the fighter must be intercepted by this law.

**Exceptions:** None. This condition cannot be bypassed. If the designer intends a fighter to become invulnerable despite an opponent's restriction, they must first remove the restriction.

---

### Law 4.5 — Cannot Reduce Damage Taken Law

**Definition:** A fighter with this condition cannot benefit from damage reduction.

**Referee interpretation:** Damage reduction modifiers on this fighter are ignored during damage calculation. The fighter takes full, unreduced damage. Unpierceable reductions are also ignored — "cannot reduce damage taken" overrides all forms of reduction regardless of the unpierceable tag.

**Exceptions:** Shields still absorb damage first. "Cannot reduce damage taken" affects modifier-based damage reduction, not destructible defense.

---

## Section 5 — Protection Laws

Protection laws govern the exact sequence and interaction of all defensive mechanics.

When damage is dealt, the referee applies protections in a specific, universal order. No kit can change this order. The order is the law.

---

### Law 5.1 — Protection Priority Order

When damage is directed at a fighter, the referee evaluates defenses in this exact sequence:

**Step 1: Invulnerability check.**
If the fighter is invulnerable and the damage does not carry an invulnerability-bypass flag, the damage is blocked entirely. No further steps are evaluated. The shield is not touched. HP is not touched. The attack is completely negated.

**Step 2: Destructible defense (shield) absorption.**
If a shield is present, damage is absorbed by the shield before reaching HP. If the damage exceeds the shield, the shield is destroyed and the remaining damage continues to HP.

**Step 3: Damage reduction calculation.**
The remaining damage (after any shield absorption) is reduced by modifier-based reductions. Piercing damage bypasses pierceable reductions. Unpierceable reductions are always applied. "Cannot reduce damage taken" removes all modifier reductions from the formula.

**Step 4: HP reduction.**
The final damage value is subtracted from HP.

**Step 5: Undying / Minimum HP enforcement.**
If the fighter has the Undying condition and HP would reach zero, HP is clamped to 1 instead.

**Step 6: Defeat check.**
If HP is zero after all the above, the fighter is defeated.

**Justification for this order:** Invulnerability is the strongest protection — it stops everything before anything else evaluates. Shields are the second line — they are physical defenses that take damage before the fighter's HP is reached. Damage reduction is a passive modifier that applies to whatever damage the shield didn't absorb. Undying is a last-resort survival mechanic that prevents outright death.

---

### Law 5.2 — Destructible Defense Law

**Definition:** A shield (destructible defense) absorbs incoming damage before HP.

**Referee interpretation:** Shields are finite. They have an amount. Damage reduces the shield amount. If damage exceeds the shield amount, the shield is destroyed and the overflow damage continues to HP. When a shield is destroyed, all relevant reactions fire: passive triggers, reaction guards, and any on-break effects.

**Exceptions:** Affliction-class abilities bypass shields. This is a fundamental class interaction — Affliction damage always reaches HP directly, regardless of shield presence.

---

### Law 5.3 — Invulnerability Scope Law

**Definition:** Invulnerability is a targeting law. All harmful effects originating from a legally blocked harmful action are blocked against an invulnerable fighter — not just damage.

**Referee interpretation:** Because invulnerability removes the fighter from harmful target pools (Law 3.3), the entire harmful action has no legal basis against them. This means every effect in a harmful ability — damage, stun, mark, debuff, shield break — is blocked when that ability hits the invulnerability wall.

This is distinct from having individual effect immunities. An invulnerable fighter does not need a separate "stun immunity" to avoid being stunned by a harmful ability. Invulnerability stops the harmful targeting — and all effects that flow from it — at the gate.

**What still applies through invulnerability:**
- Helpful effects targeting an invulnerable ally: fully permitted (Law 3.5)
- Neutral effects: permitted
- Passive triggers that fire on "being targeted" may still fire, even against an invulnerable fighter, if they are designed to respond to the targeting event itself rather than the damage outcome

**Important distinction — Fire-but-Block:** When an action was legally queued before the target became invulnerable, the action fires under the fire-but-block contract (Law 5.6). In this case, the targeting was legal at queue time. The invulnerability was not present when the commitment was made. The action fires, hits the wall, and resolves as a no-op. This does not mean invulnerability "only blocks damage" — it means the targeting was honored but the protection fully blocked the effects.

**Why not rely on effect immunity instead?** Effect immunity requires explicit enumeration of blocked effect types. Invulnerability via targeting is broader and more predictable: the whole action fails, not just specific effects within it. A fighter who is invulnerable should not need to worry about a clever harmful ability that avoids damage but stuns — invulnerability's targeting scope prevents that.

---

### Law 5.4 — Piercing Law

**Definition:** Piercing damage bypasses pierceable damage reduction modifiers.

**Referee interpretation:** A piercing attack ignores DR modifiers that are not specifically marked as unpierceable. Unpierceable reductions always apply, regardless of piercing.

Piercing does not bypass shields. Piercing does not bypass invulnerability. Piercing is specifically a damage-reduction penetration mechanic.

---

### Law 5.5 — Undying Law

**Definition:** A fighter with Undying cannot be reduced to zero HP by damage.

**Referee interpretation:** While Undying is active, the fighter cannot die from any damage source. Their HP is clamped to 1 at the moment it would reach zero. They remain alive, fighting at minimum HP, until the Undying effect expires.

This applies to all damage — normal attacks, burns, afflictions, fatigue, and counter damage.

**Exceptions:** Undying does not prevent defeat from other sources if those sources bypass the HP reduction path entirely. (In current Cursed Arena, this edge case does not exist, but the law is stated for clarity.)

---

### Law 5.6 — Fire-But-Block Resolution Law

**Definition:** When an action was legally queued but its target's state changes before resolution, the action fires into the new state. What happens depends on why the target changed.

**This law governs the exact outcome of every blocked-at-resolution scenario.**

---

#### Scenario A: Target became invulnerable after queue

The targeting was legal when the commitment was made. The action fires. The invulnerability law blocks all harmful effects entirely. This includes damage, stun, mark, debuff, and every other harmful effect in the ability — not just damage.

| Element | Outcome |
|---|---|
| Energy spent? | Yes — committed and paid at queue time |
| Cooldown applied? | Yes — the ability was used |
| Harmful effects? | None — all blocked by invulnerability |
| Passive triggers on attacker? | Yes — "on use" passives fire normally |
| Passive triggers on target? | Target's "on being targeted" passives may fire — the action was aimed at them |
| Reactions (counter/reflect)? | No — the target's invulnerability makes them an invalid harmful target; counter and reflect do not engage for an invulnerable target |
| Log entry? | Yes — "Ability X blocked by [target]'s invulnerability" |

---

#### Scenario B: Target died after queue

The targeting was legal when the commitment was made. The action resolves as a no-op. Dead targets receive nothing.

| Element | Outcome |
|---|---|
| Energy spent? | Yes |
| Cooldown applied? | Yes |
| Harmful effects? | None — dead targets are removed from effect resolution |
| Passive triggers on attacker? | Yes — "on use" passives fire normally |
| Log entry? | Yes — "Ability X had no valid target" |

---

#### Scenario C: Required tag expired after queue

The targeting was legal when the commitment was made. At resolution, the required tag is gone. No valid target exists. The action resolves as a no-op.

| Element | Outcome |
|---|---|
| Energy spent? | Yes |
| Cooldown applied? | Yes |
| Effects? | None |
| Log entry? | Yes — "Ability X had no valid target (tag expired)" |

---

#### Scenario D: Target gained effect immunity after queue

The action was legal. The immunity check fires per-effect during resolution. Effects that are blocked produce individual immunity log entries. Effects not blocked by immunity still resolve.

| Element | Outcome |
|---|---|
| Energy spent? | Yes |
| Cooldown applied? | Yes |
| Blocked effects? | Blocked individually with log entries |
| Unblocked effects? | Resolve normally |
| Reactions? | Counter and reflect engage normally — immunity is an effect-level check, not a targeting check |

---

**Constitutional principle:** The fire-but-block contract is not a loophole. It is a respect for the player's committed decision. The referee does not retroactively cancel legal commitments — it enforces the protection system against them. **Commitment is spent. Protection is respected. The log explains what happened.**

---

## Section 6 — Reactive Laws

Reactive laws govern what happens before, during, and after an ability fires, when defenders have reactions set up.

---

### Law 6.1 — Counter Law

**Definition:** A counter fires before the ability's effects resolve, and cancels the ability.

**Referee interpretation:** When a harmful ability targets a fighter with a counter active, the counter fires immediately — before any damage is dealt, before any effects apply. The ability is interrupted and its effects never resolve. The counter may deal damage back to the attacker.

Counter damage is dealt to the attacker directly. It is subject to the attacker's defenses (shields and invulnerability apply). It is also subject to effect immunity — a fighter immune to damage does not take counter damage.

**Multiple counters — deterministic priority:** If multiple targets have counters active when a harmful ability is used, only one counter fires. Priority is determined in this order:

1. **Explicit priority value** — if a counter carries a numeric priority field, higher priority fires first.
2. **Stable battlefield position** — left-to-right by the fighter's fixed position in the team array. This order is established at battle start and does not change.
3. **Creation timestamp** — if two counters have the same position (impossible in practice but defined for completeness), the counter created earlier fires.

Only one counter fires per incoming ability. The first counter that meets its trigger condition and wins the priority evaluation cancels the action — all remaining counters do not fire.

**Why deterministic priority matters:** A counter that fires "sometimes" based on which fighter happens to be first in an array is a law the player cannot learn. They cannot build a strategy around unpredictable counter precedence. Fixed, learnable priority lets players know exactly which counter will engage before the action fires. That knowledge is part of the tactical depth.

**Player expectation:** If a counter fires, a clear message names the fighter who countered and the attacker whose ability was stopped. Counter interactions are high-impact and must be legible.

**Exceptions:** Abilities flagged as "cannot be countered" do not trigger counter mechanics.

---

### Law 6.2 — Reflect Law

**Definition:** A reflect redirects an ability's effects back at the attacker.

**Referee interpretation:** When a harmful ability targets a fighter with a reflect active, the reflect marks that ability's effects as redirected. Instead of applying to the target, reflectable effects are applied to the original attacker.

Reflect does not cancel the ability — it reroutes it. The attacker deals an attack that then hits themselves.

**Counter vs. reflect priority:** If a counter and a reflect both exist on the same target, the counter fires first (since counters run before reflects in the pre-effect window). If the counter cancels the action, the reflect never fires. This priority is by design: counters are more disruptive and should resolve first.

**Reflected damage and attacker defenses:** Reflected damage treats the original attacker as its new target. The attacker's invulnerability is checked. The attacker's shields absorb reflected damage. The attacker's damage reduction applies. A reflected attack against an attacker who is themselves invulnerable deals no damage.

**Partial reflect:** Some effects within an ability may be marked unreflectable. Those effects apply to the original target normally, while reflectable effects are redirected. This can produce split outcomes where the original target receives some effects and the attacker receives others.

**Exceptions:** Abilities flagged as "cannot be reflected" do not trigger reflect mechanics at all.

---

### Law 6.3 — Reaction Guard Law

**Definition:** Reaction guards are persistent triggers that fire in response to specific events.

**Referee interpretation:** Unlike counters and reflects, reaction guards are not a single pre-effect check. They monitor ongoing events — damage applied, shields broken, defeats occurring — and fire their effects when the monitored event happens.

Reaction guard effects go through full effect resolution, including effect immunity checks. A reaction guard that deals damage can be blocked by the target's defenses.

Reaction guard damage, however, cannot be countered or reflected. Reactions to reactions would create recursive chains. This is a deliberate design constraint.

**oncePerRound guards:** Some guards are marked to fire at most once per round. This prevents infinite loops where a guard fires, triggers an event, which would fire the guard again.

**consume-on-trigger:** A guard marked to consume on trigger is removed from the fighter after it fires. It gets one use and is done. Guards without this flag persist until they expire by duration.

---

### Law 6.4 — Passive Law

**Definition:** Passives fire automatically when their trigger condition is met. They cannot be suppressed by the acting player.

**Referee interpretation:** Passives are a fighter's intrinsic capabilities — they are part of what the fighter is, not a choice they make. They fire when their condition is met, period.

Passive effects go through full effect resolution and are subject to effect immunity. Passive damage cannot be countered or reflected — the same rule that applies to reaction guards.

**Stun does not prevent passives.** A stunned fighter cannot choose to act, but their passive nature still responds to events around them. A passive that fires on "being attacked" does so whether the fighter is stunned or not.

---

### Law 6.5 — Reactive Priority Order

When an ability is used and reactions are possible, they resolve in this order:

1. **onAbilityUse** reaction guards on the attacker (self-triggered on attack)
2. **onAbilityUse** passives on the attacker
3. **onBeingTargeted** reaction guards on all targets
4. **Counter check** — if a counter fires (using priority order from Law 6.1), ability is canceled; stop here
5. **Reflect check** — mark reflected targets
6. **Effect resolution** — apply effects (possibly redirected by reflect)
   - During damage application: **onDamageApplied / onDamageBlocked** reactions
   - During shield break: **onShieldBroken** reactions
7. **onAbilityResolve** passives on the attacker
8. **onBeingTargeted** passives on all targets

This order is fixed. It cannot be changed by kit design. Kit mechanics must work within this order.

---

## Section 7 — Expiration Laws

Expiration laws govern how time-limited effects decay and what happens when they end.

---

### Law 7.1 — Duration Ticking Law

**Definition:** All timed effects decrement their duration at the end of each team's resolution. The exact ticking model requires engine audit before it can be fully constitutionalized.

**Referee interpretation:** Duration is measured in rounds-remaining, not rounds-elapsed. A 1-round effect expires after one tick; a 2-round effect expires after two ticks.

In the sequential turn model, each team's effects tick when that team's resolution completes — not at a single shared moment. This creates an asymmetry: a stun applied by the first-acting team expires after their tick; a stun applied by the second-acting team doesn't expire until that team's tick runs. Both 1-round stuns were used in the same round but expire at different moments in the sequence.

**This asymmetry is an inherent property of sequential turns.** It is not a bug. But it has balance implications — first-mover effects get a shorter window than second-mover effects of the same stated duration.

**Audit required:** Before this law is finalized with precise timing guarantees, the current engine's tick behavior must be audited against player-facing expectations. Specifically: does the UI communicate the asymmetry? Does the stated duration match what players observe? The timing model may need to be adjusted or at minimum clearly documented before it becomes constitutional.

**What is constitutionalized now:**
- Duration counts down, not up.
- Expiration is deterministic — no effect expires "randomly" or mid-effect.
- A 0-duration effect is expired. A 1-duration effect survives one more tick.
- The order of ticks within a round (which team ticks first) follows the same sequence as action resolution.

---

### Law 7.2 — Expiration Is Silent Unless Declared

**Definition:** When an effect expires, it simply ends, unless it has declared on-expire effects.

**Referee interpretation:** A burn that runs out of duration disappears. The fighter is no longer burning. There is no burst of damage, no special message beyond the status-removed event. Expiry is clean and quiet.

If an effect is designed to do something when it expires, that behavior must be explicitly declared as part of the effect's definition. It does not happen implicitly.

Declared on-expire effects are resolved through the normal effect pipeline. They respect effect immunity, helpful-effect restrictions, invulnerability targeting gates, shields/protection, and any passives or reactions that already fire from normal `resolveEffects()` paths.

**Source context:** On-expire effects use the original modifier source when that source is still present in battle state. Source death does not suppress the expiration effect; only target death does. Death-triggered behavior belongs in `onDefeat` reactions, not on-expire effects.

**Scope note:** Fighter-scoped modifiers carry a concrete `targetId` and can fire on-expire effects. Team and battlefield modifiers currently do not carry a concrete target owner; until that model is extended, their expiration remains silent even if a template author attaches on-expire data.

**On-expire effects and dead fighters:** If a fighter dies before an effect on them expires, the on-expire effect does not fire. The effect expires because the fighter is dead, not because its duration ran out — different cause, no triggered effect. This is the cleaner and more predictable ruling.

---

### Law 7.3 — Ability Replacement Expiration Law

**Definition:** When a temporary ability replacement expires, the original ability is restored in its previous state.

**Referee interpretation:** The original ability is returned as it was before the replacement began, including its cooldown state. The replacement ability's cooldown (if any was accumulated during the replacement window) is discarded.

This creates a potential edge case: a fighter can use a temporary replacement on the last turn before it expires without incurring a cooldown on their restored original ability. This is acknowledged as a minor inconsistency. The correct long-term fix is for a replacement cooldown to carry over to the original when the replacement expires, but this is noted as a future refinement rather than a blocking issue.

---

### Law 7.4 — Scheduled Effect Resolution Law

**Definition:** A scheduled effect fires at its designated round and phase, targeting the fighters it recorded when created.

**Referee interpretation:** When a scheduled effect is created, it captures the actor and target(s) at that moment. When it fires, it uses those captured identities.

If a captured target is dead when the effect fires, the effect does not resolve on that target. Dead fighters cannot receive effects from scheduled abilities. The effect fires into the void for that target.

If the actor that created the scheduled effect is dead when it fires, the effect still resolves. The actor's death does not cancel their prior commitments. The effect was set in motion — it completes.

---

## Section 8 — Combat Constitution

These are the non-negotiable principles that govern all of Cursed Arena's combat design. They cannot be traded away for a clever kit interaction or bypassed for convenience. If an implementation conflicts with any of these principles, the implementation must change, not the principle.

---

### Principle 1: The UI and Engine Must Always Agree

If the engine says a fighter is stunned, the UI shows stun. If the engine allows an ability, the UI shows it as available. If the engine blocks a target, the UI does not offer that target.

Any divergence between what the UI shows and what the engine enforces is a critical bug. There is no "the engine is right but the UI is wrong and that's okay." Both must agree, always.

**Current violation:** `canUseAbility()` does not check base stun or class stun, meaning the UI may render stunned fighters' abilities as available even though the engine will cancel them at resolution. This must be fixed.

---

### Principle 2: Illegal Actions Are Rejected Consistently

A blocked action is blocked the same way every time it is blocked. The same inputs produce the same refusal. There is no "it depends on timing" or "it works sometimes."

Consistency is what lets players learn rules once and rely on them forever.

---

### Principle 3: Every Block Has a Reason, and the Reason Is Shown

When the game says no, it says why. A canceled action emits a message explaining the cause. An immunity block logs that immunity fired. A counter logs who countered and what was interrupted.

Players should never see a skill silently fail and wonder what happened.

---

### Principle 4: Exceptions Must Be Explicit and Documented

No exception is implicit. An ability that bypasses invulnerability carries that property explicitly. A fighter that can act while stunned has that property explicitly declared. A mechanic that bypasses effect immunity has the flag on the relevant construct.

Implicit exceptions are the root cause of most balance bugs. If a mechanic seems to bypass a law "by accident," that accident must be either converted into an explicit flag or eliminated.

---

### Principle 5: Universal Laws Override Kit-Specific Assumptions

A character kit cannot assume that "cannot gain invulnerability" won't apply to it because the kit designer didn't think to check. The law is universal. It applies to every character, every ability, every effect, regardless of who designed it and when.

New characters are designed within the laws. The laws are not designed around new characters.

---

### Principle 6: Effects Must Never Rely on Hidden Handler Behavior

No gameplay outcome should depend on a specific effect handler "remembering" to check something. The referee layer checks first. If the referee says proceed, the handler runs. The handler does not re-check what the referee already verified.

Conversely, the handler does not skip a check that belongs to the referee. If an effect fires from outside the main resolution path (a burn tick, a fatigue tick, a counter packet), it must pass through the same referee gates that any other effect would.

**Current violations:**
- Burn DOT ticks bypass effect immunity.
- Fatigue ticks bypass effect immunity.
- Counter damage packets bypass effect immunity.
- The rot-marker shield bypass skips the immunity gate.

These must be corrected so that every effect — from any source — is subject to the same law.

---

### Principle 7: Player Trust Is More Important Than Clever Interactions

Sometimes a clever interaction is possible that "technically works" within the current engine but violates player expectations. A counter that fires sometimes depending on array order. A reflection that partially applies but not fully. An immunity that blocks one source but not another.

In every such case, clarity wins over cleverness. If the interaction would confuse a reasonable player who understands the rules, it must be redesigned until it is unambiguous.

Tactical depth comes from deep, clear rules — not from obscure edge cases that only experts discover by trial and error.

---

### Principle 8: Commitment Is Sacred

When a player commits an action — spending energy, setting cooldown, declaring a target — that commitment is binding. The action resolves (or it fails for a documented reason), but the commitment stands.

No mid-action refunds for energy. No silent re-routing of targets. No "well, it didn't work so let's pretend it didn't happen." The player spent a turn. The game acknowledges it.

This principle exists because tactical games derive tension from commitment. If commitments can be undone or have no consequence when they fail, there is no risk, and therefore no meaningful decision.

---

### Principle 9: The Order of Laws Is the Order of Resolution

Intent classification → Actor laws → Ability laws → Target laws → Effect laws → Protection laws → Reactive laws.

This sequence is not negotiable. An actor check does not happen after a target check. A protection check does not happen before an effect check. The hierarchy is fixed, and every resolution follows it in order.

---

*End of Combat Constitution.*

---

## Section 9 — Open Constitutional Questions

The following questions are unresolved design decisions that must be answered before implementation of the affected systems can begin. They are listed here so that implementation is not blocked by ambiguity, and so that answers, when made, are recorded as constitutional additions rather than ad-hoc code decisions.

---

### OCQ-1: Exact Expiration Timing Model

**Question:** Does a 1-round stun applied during the first team's action expire before or after the second team acts in the same round?

**Why it matters:** If the stun expires before the second team acts, first-mover stuns are strictly weaker than second-mover stuns of the same stated duration. This affects every stun-based kit and all duration-based mechanics.

**What must be decided:**
- Does the sequential tick model (each team ticks after their own resolution) match player-facing expectations?
- Should duration expiration be synchronized at round end for all teams, or remain per-team?
- If per-team, should the stated duration be adjusted to compensate (e.g., "1 round" for the second team = "1 full round" while "1 round" for the first team = "less than 1 full round")?

**Status:** Requires engine behavior audit. Do not lock the timing model in code until this is answered.

---

### OCQ-2: Mixed-Intent Ability Classification — Edge Cases

**Question:** When a primarily harmful ability has a helpful sub-effect, and the target has helpful immunity — does the helpful sub-effect on the *target* get blocked, while the attacker's self-buff in the same ability proceeds?

**Why it matters:** Law 0.3 says helpful effects within a mixed-intent ability are blocked by helpful immunity on the target. But what if the helpful sub-effect targets the *attacker* and not the targeted enemy? The attacker is not subject to the target's helpful immunity.

**What must be decided:**
- Helpful immunity is a per-target check. The attacker's self-buff in a mixed-intent ability should not be blocked by the *target's* helpful immunity. Confirm this reading is correct.
- Are there mixed-intent abilities where the helpful sub-effect does target the enemy (e.g., "a debuff that also heals the enemy a small amount as flavor")? If so, those sub-effects would be blocked by helpful immunity on the enemy.

**Status:** Likely resolved by "helpful immunity is per-target" — confirm in implementation.

---

### OCQ-3: Self-Bypass for `canGainInvulnerability` Restriction

**Question:** If a fighter has `canGainInvulnerability: false`, and they self-apply invulnerability via their own ability, is it blocked?

**The self-bypass rule (Law 4.1)** permits fighters to bypass their *own* effect immunity when they target themselves.

**But `canGainInvulnerability` is not effect immunity — it is a restriction.**

**What must be decided:**
- Does the self-bypass rule extend to modifier-level restrictions (`canGainInvulnerability: false`) or only to `effectImmunities` entries?
- Recommendation: No self-bypass for `canGainInvulnerability`. This restriction is typically applied by an opponent, not the fighter themselves. If the fighter's own ability could bypass their opponent's restriction, the restriction is meaningless against fighters with self-invulnerability abilities.

**Status:** Recommended ruling stated above. Confirm and constitutionalize before Phase 3 implementation.

---

### OCQ-4: Reflection Against an Invulnerable Attacker

**Question:** A fighter uses a harmful ability. The target has reflect. The reflect fires. The reflected effects now target the original attacker. If the attacker is currently invulnerable, are the reflected effects blocked?

**Current engine behavior:** The attacker's invulnerability is not checked for reflected effects.

**What must be decided:**
- Law 3.3 says invulnerable fighters are removed from harmful target pools. The attacker was not invulnerable when they aimed the attack — they may have become invulnerable between queuing and resolution.
- Should reflected damage respect the attacker's invulnerability? Recommended: yes. A reflected harmful action treats the attacker as a new target — and the attacker's protection laws apply.

**Status:** Recommended ruling stated above. Requires engine fix.

---

### OCQ-5: Counter Priority With Multiple Counter Guards on the Same Fighter

**Question:** A fighter has two counter guards active simultaneously. The same incoming harmful ability triggers both. Which fires?

**What must be decided:**
- Apply the same priority rules as multi-fighter counter priority (explicit priority → stable order → creation timestamp)?
- Or: only one counter guard per fighter can be active at a time (design constraint rather than a resolution rule)?

**Status:** Likely resolved by applying the same priority rules. Confirm in implementation.

---

### OCQ-6: On-Expire Effects and the Death Exception

**Question:** Law 7.2 states that on-expire effects do not fire when a fighter dies. But what if the on-expire effect was specifically designed to fire on death — a "last gasp" mechanic?

**What must be decided:**
- Is there a `firesOnDeath: true` flag that overrides the death exception?
- Or is death-triggered behavior always implemented as a separate reaction guard (`onDefeat`) rather than an on-expire effect?
- Recommendation: use `onDefeat` reaction guards for death-triggered mechanics. On-expire effects are for duration-end, not death. Keep the two concepts separate.

**Status:** Resolved in Phase 10. Death-triggered behavior uses `onDefeat`; on-expire effects are duration-end only.

---

### OCQ-7: Invulnerability and "onBeingTargeted" Passives

**Question:** Law 5.3 states that invulnerability blocks all harmful effects from a legally blocked targeting. But some passives fire on the trigger "being targeted" — before the effects resolve. Does an invulnerable fighter's "being targeted" passives still fire when a harmful ability is aimed at them (during the fire-but-block scenario)?

**Why it matters:** A character might have a passive that charges a counter or adjusts a state when targeted, regardless of whether the attack lands. This is valuable reactive design. But it could conflict with the principle that invulnerability removes the fighter from harmful target pools entirely.

**What must be decided:**
- Fire-but-block scenario: the targeting was legal at queue time, so the action fires. "On being targeted" passives on the invulnerable target may fire because the action was genuinely aimed at them.
- Legal queue-time scenario: if the target was already invulnerable when the action was queued, it was never a legal target. "On being targeted" passives should NOT fire.
- Recommendation: "onBeingTargeted" passives fire in the fire-but-block scenario (targeting was legal), not in the invalid-target-at-queue scenario.

**Status:** Recommended ruling stated above. Requires careful implementation.

---

*These questions represent the frontier of constitutional certainty. When each is resolved, the answer should be added to the relevant law section, and the question removed from this list. This list should be empty by the time full implementation is complete.*

---

*This document is the foundation. All implementation must be grounded in it. When in doubt about how an interaction should resolve, return here. If the laws do not clearly answer the question, the laws must be extended before the interaction is implemented — not after.*
