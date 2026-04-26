import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill } from './_helpers.ts'

export const sukuna = fighter({
  id: 'sukuna',
  name: 'Ryomen Sukuna',
  shortName: 'Sukuna',
  rarity: 'SSR',
  role: 'Piercing Carry',
  portraitFrame: { scale: 2, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'sukuna-kings-vessel',
      trigger: 'onAbilityResolve',
      effects: [
        { type: 'energyGain', amount: { random: 1 }, target: 'self' },
        { type: 'modifyAbilityCost', target: 'self', modifier: { mode: 'reduceRandom', amount: 1, duration: 1, uses: 1, label: "King's Vessel" } },
      ],
      label: "King's Vessel",
      description: "Each time Sukuna uses a skill, he gains random energy and his next skill's random cost is reduced.",
      icon: { label: 'KV', tone: 'gold' },
    }),
  ],
  abilities: [
    skill({
      id: 'sukuna-dismantle',
      name: 'Dismantle',
      description: 'Deals 75 piercing damage to one enemy. It becomes cheaper as costs are paid.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { physical: 1, technique: 3 },
      power: 75,
      effects: [{ type: 'damage', power: 75, target: 'inherit', piercing: true }],
    }),
    skill({
      id: 'sukuna-malevolent-shrine',
      name: 'Malevolent Shrine',
      description: 'Sukuna heals 50 health and gains 50 destructible defense.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 2,
      energyCost: { physical: 1, technique: 3 },
      effects: [
        { type: 'heal', power: 50, target: 'self' },
        { type: 'shield', amount: 50, label: 'Malevolent Shrine', tags: ['malevolent-shrine'], target: 'self' },
      ],
    }),
    skill({
      id: 'sukuna-cleave',
      name: 'Cleave',
      description: 'Deals 40 piercing damage to all enemies.',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { mental: 1, technique: 3 },
      power: 40,
      effects: [{ type: 'damage', power: 40, target: 'all-enemies', piercing: true }],
    }),
  ],
  ultimate: defendSkill({
    id: 'sukuna-cursed-sovereignty',
    name: 'Cursed Sovereignty',
    description: 'Sukuna becomes invulnerable for 1 turn and ignores enemy cost disruption.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'effectImmunity', label: 'Cursed Sovereignty', blocks: ['nonDamage'], duration: 1, tags: ['cursed-sovereignty'], target: 'self' },
    ],
  }),
})
