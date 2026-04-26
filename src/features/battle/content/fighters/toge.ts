import { definePassive, defendSkill, healSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

export const toge = fighter({
  id: 'toge',
  name: 'Toge Inumaki',
  shortName: 'Toge',
  rarity: 'SR',
  role: 'Cursed Speech Controller',
  portraitFrame: { scale: 2, y: '-10%' },
  maxHp: 100,
  initialStateCounters: { vocal_strain_damage: 5 },
  passiveEffects: [
    definePassive({
      id: 'toge-vocal-strain',
      trigger: 'onAbilityResolve',
      effects: [
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'fighterFlag', key: 'throat_spray_self_used', value: false }],
          effects: [{ type: 'damageScaledByCounter', counterKey: 'vocal_strain_damage', counterSource: 'actor', powerPerStack: 1, consumeStacks: false, target: 'self', piercing: true }],
        },
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'fighterFlag', key: 'throat_spray_self_used', value: true }],
          effects: [
            { type: 'setFlag', key: 'throat_spray_self_used', value: false, target: 'self' },
            { type: 'setCounter', key: 'vocal_strain_damage', value: 5, target: 'self' },
          ],
        },
      ],
      label: 'Vocal Strain',
      description: "Each time Toge uses a skill, he takes 5 affliction damage. This damage increases by 5 each time Toge uses \"Don't Move\" or \"Blast Away\", and resets when he uses Throat Spray on himself.",
      icon: { label: 'VS', tone: 'red' },
      counterKey: 'vocal_strain_damage',
    }),
  ],
  abilities: [
    skill({
      id: 'toge-dont-move',
      name: "Don't Move.",
      description: "This skill targets one enemy, dealing 20 damage and reducing their non-affliction damage by 10 for 1 turn. For one turn, if the target uses a new skill, \"Blast Away\" will deal 5 additional damage to them permanently; this effect stacks.",
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Special', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { random: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit' },
        modifierEffect("Don't Move", 'damageDealt', -10, 1, 'inherit', ['dont-move']),
        { type: 'adjustCounter', key: 'vocal_strain_damage', amount: 5, target: 'self' },
        {
          type: 'reaction',
          label: "Don't Move Curse",
          trigger: 'onAbilityUse',
          duration: 1,
          consumeOnTrigger: true,
          harmfulOnly: false,
          target: 'inherit',
          effects: [
            { type: 'adjustCounter', key: 'blast_away_bonus', amount: 5, target: 'attacker' },
          ],
        },
      ],
    }),
    skill({
      id: 'toge-blast-away',
      name: 'Blast Away',
      description: "This skill targets all enemies, dealing 25 damage to them. If \"Don't Move\" was used last turn, this skill will deal an additional 10 damage. If \"Throat Spray\" was used last turn, this skill cannot be countered or reflected.",
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Special', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { random: 3 },
      power: 25,
      effects: [
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'usedAbilityLastTurn', abilityId: 'toge-throat-spray' }],
          effects: [
            { type: 'damage', power: 25, target: 'all-enemies', cannotBeCountered: true, cannotBeReflected: true },
            { type: 'damageScaledByCounter', counterKey: 'blast_away_bonus', counterSource: 'target', powerPerStack: 1, consumeStacks: false, target: 'all-enemies', cannotBeCountered: true, cannotBeReflected: true },
            {
              type: 'conditional',
              target: 'self',
              conditions: [{ type: 'usedAbilityLastTurn', abilityId: 'toge-dont-move' }],
              effects: [{ type: 'damage', power: 10, target: 'all-enemies', cannotBeCountered: true, cannotBeReflected: true }],
            },
          ],
          elseEffects: [
            { type: 'damage', power: 25, target: 'all-enemies' },
            { type: 'damageScaledByCounter', counterKey: 'blast_away_bonus', counterSource: 'target', powerPerStack: 1, consumeStacks: false, target: 'all-enemies' },
            {
              type: 'conditional',
              target: 'self',
              conditions: [{ type: 'usedAbilityLastTurn', abilityId: 'toge-dont-move' }],
              effects: [{ type: 'damage', power: 10, target: 'all-enemies' }],
            },
          ],
        },
        { type: 'adjustCounter', key: 'vocal_strain_damage', amount: 5, target: 'self' },
      ],
    }),
    healSkill({
      id: 'toge-throat-spray',
      name: 'Throat Spray',
      description: 'This skill can be used on Toge or an ally. The target will heal 10 health and gain 10 destructible defense for 1 turn. If this skill is used on Toge, then he will ignore the effects of Vocal Strain the next time he uses a skill.',
      targetRule: 'ally-single',
      classes: ['Strategic', 'Instant'],
      cooldown: 2,
      energyCost: { mental: 1 },
      healPower: 10,
      effects: [
        { type: 'heal', power: 10, target: 'inherit' },
        { type: 'shield', amount: 10, label: 'Throat Spray', tags: ['throat-spray'], target: 'inherit' },
        { type: 'setFlag', key: 'throat_spray_self_used', value: true, target: 'self' },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'toge-nimble-reflexes',
    name: 'Nimble Reflexes',
    description: 'This skill makes Toge Inumaki invulnerable for 1 turn.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { mental: 1 },
  }),
})
