import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

export const noritoshi = fighter({
  id: 'noritoshi',
  name: 'Noritoshi Kamo',
  shortName: 'Kamo',
  rarity: 'SR',
  role: 'Blood Technique Controller',
  portraitFrame: { scale: 2, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'noritoshi-refined-technique',
      trigger: 'onAbilityResolve',
      conditions: [{ type: 'usedAbilityLastTurn', abilityId: 'noritoshi-blood-draw' }],
      effects: [modifierEffect('Refined Technique', 'damageDealt', 10, 1, 'self', ['refined-technique'])],
      label: 'Refined Technique',
      description: 'If Kamo sequences different skills, his next skill deals additional damage.',
      icon: { label: 'RT', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'noritoshi-blood-draw',
      name: 'Blood Draw',
      description: 'Kamo loses 10 health and gains 1 random energy. His next skill has no cooldown.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Affliction'],
      cooldown: 2,
      energyCost: {},
      effects: [
        { type: 'damage', power: 10, target: 'self', piercing: true },
        { type: 'energyGain', amount: { random: 1 }, target: 'self' },
        modifierEffect('Blood Draw', 'cooldownTick', 99, 1, 'self', ['blood-draw']),
      ],
    }),
    skill({
      id: 'noritoshi-piercing-blood',
      name: 'Piercing Blood',
      description: 'Deals 20 damage to one enemy. If used after Blood Draw, it deals additional piercing damage.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit' },
        { type: 'damageFiltered', power: 15, requiresTag: 'blood-draw', target: 'inherit', piercing: true },
      ],
    }),
    skill({
      id: 'noritoshi-crimson-binding',
      name: 'Crimson Binding',
      description: 'Deals 15 damage and seals non-Strategic skills for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { mental: 1 },
      power: 15,
      effects: [
        { type: 'damage', power: 15, target: 'inherit' },
        { type: 'classStun', duration: 1, blockedClasses: ['Physical', 'Energy', 'Affliction', 'Melee', 'Ranged', 'Mental', 'Special'], target: 'inherit' },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'noritoshi-flowing-red-scale',
    name: 'Flowing Red Scale',
    description: 'Kamo becomes invulnerable for 1 turn and his next skill has reduced cost.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'modifyAbilityCost', target: 'self', modifier: { mode: 'reduceRandom', amount: 99, duration: 1, uses: 1, label: 'Flowing Red Scale' } },
    ],
  }),
})
