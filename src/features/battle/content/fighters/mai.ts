import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect, markerEffect } from './_helpers.ts'

export const mai = fighter({
  id: 'mai',
  name: "Mai Zen'in",
  shortName: 'Mai',
  rarity: 'R',
  role: 'Ammunition Striker',
  portraitFrame: { scale: 2.02, y: '-10%' },
  maxHp: 100,
  initialStateCounters: { cursed_bullet: 2 },
  passiveEffects: [
    definePassive({
      id: 'mai-reserved-fire',
      trigger: 'whileAlive',
      effects: [markerEffect('Reserved Fire', 'permanent', 'self', ['reserved-fire'])],
      label: 'Reserved Fire',
      description: 'Mai begins with 2 Cursed Bullet uses. Her maximum number of uses is 3.',
      icon: { label: 'RF', tone: 'teal' },
      counterKey: 'cursed_bullet',
    }),
  ],
  abilities: [
    skill({
      id: 'mai-cursed-bullet',
      name: 'Cursed Bullet',
      description: 'Deals 15 damage, plus 15 more if Mai has a Cursed Bullet use remaining.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { technique: 2 },
      power: 15,
      effects: [
        { type: 'damage', power: 15, target: 'inherit' },
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'counterAtLeast', key: 'cursed_bullet', value: 1 }],
          effects: [
            { type: 'damage', power: 15, target: 'inherit' },
            { type: 'adjustCounter', key: 'cursed_bullet', amount: -1, min: 0, max: 3, target: 'self' },
          ],
        },
      ],
    }),
    skill({
      id: 'mai-steady-aim',
      name: 'Steady Aim',
      description: 'Mai gains 1 Cursed Bullet use and her next skill deals 10 more damage.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 1,
      energyCost: {},
      effects: [
        { type: 'adjustCounter', key: 'cursed_bullet', amount: 1, min: 0, max: 3, target: 'self' },
        modifierEffect('Steady Aim', 'damageDealt', 10, 1, 'self', ['steady-aim']),
      ],
    }),
    skill({
      id: 'mai-suppressing-fire',
      name: 'Suppressing Fire',
      description: 'Deals 15 damage and makes the target deal 10 less damage for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { technique: 1 },
      power: 15,
      effects: [
        { type: 'damage', power: 15, target: 'inherit' },
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'counterAtLeast', key: 'cursed_bullet', value: 1 }],
          effects: [
            { type: 'damage', power: 10, target: 'inherit' },
            { type: 'stun', duration: 1, target: 'inherit' },
          ],
        },
        modifierEffect('Suppressing Fire', 'damageDealt', -10, 1, 'inherit', ['suppressing-fire']),
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'mai-emergency-cover',
    name: 'Emergency Cover',
    description: 'Mai becomes invulnerable for 1 turn and gains 1 Cursed Bullet use.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'adjustCounter', key: 'cursed_bullet', amount: 1, min: 0, max: 3, target: 'self' },
    ],
  }),
})
