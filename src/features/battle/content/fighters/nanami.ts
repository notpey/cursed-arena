import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect, markerEffect } from './_helpers.ts'

export const nanami = fighter({
  id: 'nanami',
  name: 'Kento Nanami',
  shortName: 'Nanami',
  rarity: 'SR',
  role: 'Ratio Executioner',
  portraitFrame: { scale: 2.1, y: '-12%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'nanami-overtime',
      trigger: 'onTakeDamage',
      conditions: [
        { type: 'selfHpBelow', threshold: 0.6 },
        { type: 'fighterFlag', key: 'nanami_overtime', value: false },
      ],
      effects: [
        { type: 'setFlag', key: 'nanami_overtime', value: true, target: 'self' },
        modifierEffect('Overtime', 'damageDealt', 10, 'permanent', 'self', ['overtime']),
      ],
      label: 'Overtime',
      description: 'The first time Nanami drops below 60 health, his skills deal 10 more damage for the rest of the game.',
      icon: { label: 'OT', tone: 'gold' },
    }),
    definePassive({
      id: 'nanami-ratio-follow-through',
      trigger: 'onAbilityResolve',
      conditions: [
        { type: 'abilityId', abilityId: 'nanami-execution' },
        { type: 'usedAbilityLastTurn', abilityId: 'nanami-ratio-technique' },
      ],
      effects: [{ type: 'damage', power: 20, target: 'inherit', piercing: true }],
      label: 'Ratio Follow-Through',
      hidden: true,
    }),
  ],
  abilities: [
    skill({
      id: 'nanami-ratio-technique',
      name: 'Ratio Technique',
      description: 'Nanami gains 10 destructible defense. His next 7:3 Execution deals 20 additional damage.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 1,
      energyCost: {},
      effects: [
        { type: 'shield', amount: 10, label: 'Ratio Guard', tags: ['ratio-technique'], target: 'self' },
        markerEffect('Ratio Technique', 1, 'self', ['ratio-technique']),
      ],
    }),
    skill({
      id: 'nanami-execution',
      name: '7:3 Execution',
      description: 'Deals 20 piercing damage and weakens enemy affliction damage for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { mental: 1, technique: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit', piercing: true },
        modifierEffect('7:3 Execution', 'dotDamage', -5, 1, 'inherit', ['execution']),
      ],
    }),
    skill({
      id: 'nanami-collapse-point',
      name: 'Collapse Point',
      description: 'Deals 5 piercing damage and marks the target for future execution pressure.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 5,
      effects: [
        { type: 'damage', power: 5, target: 'inherit', piercing: true },
        markerEffect('Collapse Point', 'permanent', 'inherit', ['collapse-point']),
        modifierEffect('Collapse Point', 'damageTaken', 5, 'permanent', 'inherit', ['collapse-point']),
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'nanami-professional-guard',
    name: 'Professional Guard',
    description: 'Nanami becomes invulnerable for 1 turn.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
  }),
})
