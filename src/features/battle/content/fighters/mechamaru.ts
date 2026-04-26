import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

export const mechamaru = fighter({
  id: 'mechamaru',
  name: 'Mechamaru',
  shortName: 'Mechamaru',
  rarity: 'SR',
  role: 'Ranged Artillery',
  portraitFrame: { scale: 2, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'mechamaru-artillery-frame',
      trigger: 'onRoundStart',
      effects: [{ type: 'damage', power: 5, target: 'all-enemies' }],
      label: 'Artillery Frame',
      description: 'At the start of each turn, Mechamaru deals 5 damage to all enemies.',
      icon: { label: 'AF', tone: 'red' },
    }),
  ],
  abilities: [
    skill({
      id: 'mechamaru-cursed-energy-cannon',
      name: 'Cursed Energy Cannon',
      description: 'Deals 20 damage to one enemy and 10 damage to all other enemies.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Energy', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { mental: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit' },
        { type: 'damage', power: 10, target: 'other-enemies' },
      ],
    }),
    skill({
      id: 'mechamaru-suppressive-fire',
      name: 'Suppressive Fire',
      description: 'Deals 15 damage to all enemies. Affected enemies deal 10 less damage for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Energy', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { mental: 1 },
      power: 15,
      effects: [
        { type: 'damage', power: 15, target: 'all-enemies' },
        modifierEffect('Suppressive Fire', 'damageDealt', -10, 1, 'all-enemies', ['suppressive-fire']),
      ],
    }),
    skill({
      id: 'mechamaru-overload-cannon',
      name: 'Overload Cannon',
      description: "Deals 25 damage to all enemies. Mechamaru's skills deal 5 more damage for 2 turns, then he takes 10 damage.",
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Energy', 'Ranged', 'Instant'],
      cooldown: 3,
      energyCost: { technique: 2 },
      power: 25,
      effects: [
        { type: 'damage', power: 25, target: 'all-enemies' },
        modifierEffect('Overload Cannon', 'damageDealt', 5, 2, 'self', ['overload-cannon']),
        { type: 'schedule', delay: 2, phase: 'roundEnd', target: 'self', effects: [{ type: 'damage', power: 10, target: 'inherit' }] },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'mechamaru-remote-shielding',
    name: 'Remote Shielding',
    description: 'Mechamaru becomes invulnerable for 1 turn. During that turn, allies take 5 less damage.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      modifierEffect('Remote Shielding', 'damageTaken', -5, 1, 'all-allies', ['remote-shielding']),
    ],
  }),
})
