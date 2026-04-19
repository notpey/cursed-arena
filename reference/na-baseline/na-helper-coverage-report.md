# NA Helper Baseline Coverage Report

Generated: 2026-04-19T21:57:43.719Z
Source: https://cc-maker.na-helper.ninja/default%20characters

## Snapshot

- Characters: 184
- Skill rows: 822
- Characters with explicit unlock requirement: 0

## Skill Slot Distribution

| Skills per character | Character count |
|---:|---:|
| 4 | 123 |
| 5 | 44 |
| 6 | 11 |
| 7 | 4 |
| 8 | 2 |

## Class Vocabulary Diff

- NA classes missing in engine class union: (none)
- Engine classes not present in NA baseline: Ultimate
- Unknown NA class tokens after normalization: (none)
- Alias mapping applied for comparison: Chakra->Energy

## Prioritized Coverage Gaps

| Mechanic | Support status | Mentions | Priority score |
|---|---|---:|---:|
| Destructible defense | partial | 91 | 182 |
| Cannot be countered/reflected clauses | partial | 43 | 86 |
| Reflect mechanics | partial | 41 | 82 |

## Mechanic Matrix

| Mechanic | Mentions | Support | Rationale |
|---|---:|---|---|
| Counter mechanics | 7 | native | Engine has first-class counter guards with class filtering and optional multi-trigger behavior. |
| Reflect mechanics | 41 | partial | Engine reflect guards now reroute core harmful effects with class filters and optional multi-trigger behavior, but not every skill-level pattern. |
| Piercing and unpierceable DR | 172 | native | Damage effects expose piercing flags and the mitigation lane supports unpierceable-tagged reductions. |
| Destructible defense | 91 | partial | Shield has first-class chip (`shieldDamage`) and shatter (`breakShield`) effects, but broader NA defense interactions remain partial. |
| Chakra drain/steal/generation/cost pressure | 29 | native | Engine now has explicit energyGain, energyDrain, energySteal, plus ability cost modifiers. |
| Cooldown increase/decrease | 15 | native | Engine now supports cooldownAdjust for positive/negative deltas and keeps cooldownReduction for passive tempo. |
| Transformation / skill replacement | 186 | native | Engine has replaceAbility/replaceAbilities/modifyAbilityState and passive trigger hooks. |
| Invulnerability and anti-invuln clauses | 310 | native | Engine models invulnerability plus canGainInvulnerable gate and boolean modifier checks. |
| Cannot be countered/reflected clauses | 43 | partial | Ability/effect/packet flags exist for anti-counter and anti-reflect clauses. |

## Sample Gap Examples

### Reflect mechanics
- Uchiha Sasuke -> Passive: Cursed Seal Awakening
- Nara Shikamaru -> Meditate
- Kimimaro -> Dance of the Camellia
- Kimimaro -> Dance of the Clematis
- Kimimaro -> Dance of the Seedling Fern

### Destructible defense
- Aburame Shino -> Bug Wall
- Gaara of the Desert -> Third Eye
- Kankuro -> Puppet Preparation
- Haku -> Demonic Ice Mirrors
- Demon Brothers -> Bladed Gauntlet

### Cannot be countered/reflected clauses
- Uchiha Sasuke -> Passive: Cursed Seal Awakening
- Hyuuga Hinata -> Byakugan
- Nara Shikamaru -> Meditate
- Rock Lee -> Final Lotus
- Gaara of the Desert -> Desert Graveyard

## Engine Type Snapshot

- SkillEffect variants (30): damage, damageScaledByCounter, shieldDamage, energyGain, energyDrain, energySteal, cooldownAdjust, heal, invulnerable, attackUp, stun, classStun, mark, burn, cooldownReduction, damageBoost, shield, modifyAbilityCost, effectImmunity, setFlag, adjustCounter, addModifier, removeModifier, modifyAbilityState, replaceAbilities, schedule, replaceAbility, breakShield, counter, reflect
- Reaction conditions (13): selfHpBelow, targetHpBelow, actorHasStatus, targetHasStatus, abilityId, abilityClass, fighterFlag, counterAtLeast, targetCounterAtLeast, usedAbilityLastTurn, shieldActive, brokenShieldTag, isUltimate
- Skill classes (11): Action, Affliction, Control, Energy, Instant, Melee, Mental, Physical, Ranged, Ultimate, Unique

