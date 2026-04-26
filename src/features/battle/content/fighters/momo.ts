import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

export const momo = fighter({
  id: 'momo',
  name: 'Momo Nishimiya',
  shortName: 'Momo',
  rarity: 'R',
  role: 'Aerial Support',
  portraitFrame: { scale: 2, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'momo-battlefield-awareness',
      trigger: 'onRoundStart',
      effects: [
        { type: 'invulnerable', duration: 1, target: 'self' },
        modifierEffect('Battlefield Awareness', 'damageTaken', -5, 1, 'all-allies', ['battlefield-awareness']),
      ],
      label: 'Battlefield Awareness',
      description: 'Each turn, Momo briefly becomes invulnerable and her allies take 5 less damage.',
      icon: { label: 'BA', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'momo-aerial-support',
      name: 'Aerial Support',
      description: 'One ally deals 10 more damage and has random energy costs reduced for 2 turns.',
      kind: 'utility',
      targetRule: 'ally-single',
      classes: ['Strategic', 'Instant'],
      cooldown: 2,
      energyCost: { random: 1 },
      effects: [
        modifierEffect('Aerial Support', 'damageDealt', 10, 2, 'inherit', ['aerial-support']),
        { type: 'modifyAbilityCost', target: 'inherit', modifier: { mode: 'reduceRandom', amount: 1, duration: 2, label: 'Aerial Support' } },
      ],
    }),
    skill({
      id: 'momo-disrupting-gust',
      name: 'Disrupting Gust',
      description: 'Deals 10 damage. For 1 turn, the target deals 10 less damage and their next skill costs 1 more random energy.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { mental: 1 },
      power: 10,
      effects: [
        { type: 'damage', power: 10, target: 'inherit' },
        modifierEffect('Disrupting Gust', 'damageDealt', -10, 1, 'inherit', ['disrupting-gust']),
        { type: 'modifyAbilityCost', target: 'inherit', modifier: { mode: 'increaseRandom', amount: 1, duration: 1, uses: 1, label: 'Disrupting Gust' } },
      ],
    }),
    skill({
      id: 'momo-coordinated-assault',
      name: 'Coordinated Assault',
      description: 'The next time the target takes damage, they take 15 additional damage. Disrupted targets take the damage immediately.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { random: 1 },
      power: 15,
      effects: [
        {
          type: 'reaction',
          label: 'Coordinated Assault',
          trigger: 'onDamageApplied',
          duration: 1,
          consumeOnTrigger: true,
          target: 'inherit',
          effects: [{ type: 'damage', power: 15, target: 'inherit' }],
        },
        { type: 'damageFiltered', power: 15, requiresTag: 'disrupting-gust', target: 'inherit' },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'momo-evasive-flight',
    name: 'Evasive Flight',
    description: 'Momo becomes invulnerable for 1 turn. During that turn, allies take 5 less damage.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      modifierEffect('Evasive Flight', 'damageTaken', -5, 1, 'all-allies', ['evasive-flight']),
    ],
  }),
})
