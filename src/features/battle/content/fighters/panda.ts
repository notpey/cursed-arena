import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

export const panda = fighter({
  id: 'panda',
  name: 'Panda',
  shortName: 'Panda',
  rarity: 'SR',
  role: 'Form Shifter',
  portraitFrame: { scale: 2, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'panda-three-cores',
      trigger: 'onTakeDamage',
      conditions: [
        { type: 'selfHpBelow', threshold: 0.3 },
        { type: 'fighterFlag', key: 'panda_gorilla_mode', value: false },
      ],
      effects: [
        { type: 'setFlag', key: 'panda_gorilla_mode', value: true, target: 'self' },
        { type: 'setMode', key: 'form', value: 'gorilla', target: 'self' },
        { type: 'heal', power: 15, target: 'self' },
        modifierEffect('Gorilla Mode', 'damageDealt', 20, 'permanent', 'self', ['gorilla-mode']),
      ],
      label: 'Three Cores',
      description: 'The first time Panda drops below 30 health, he enters Gorilla Mode and heals.',
      icon: { label: 'TC', tone: 'red' },
    }),
  ],
  abilities: [
    skill({
      id: 'panda-punch',
      name: 'Panda Punch',
      description: 'Deals 20 damage. Gorilla Mode adds damage and increases the cost.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit' },
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'actorModeIs', key: 'form', value: 'gorilla' }],
          effects: [{ type: 'damage', power: 20, target: 'inherit' }],
        },
      ],
    }),
    skill({
      id: 'panda-cursed-body',
      name: 'Cursed Body',
      description: 'Panda gains 20 destructible defense and reduces non-affliction damage for 2 turns.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 2,
      energyCost: { technique: 1 },
      effects: [
        { type: 'shield', amount: 20, label: 'Cursed Body', tags: ['cursed-body'], target: 'self' },
        modifierEffect('Cursed Body', 'damageTaken', -10, 2, 'self', ['cursed-body']),
        { type: 'effectImmunity', label: 'Cursed Body', blocks: ['nonDamage'], duration: 2, tags: ['cursed-body'], target: 'self' },
      ],
    }),
    skill({
      id: 'panda-drumming-beat',
      name: 'Drumming Beat',
      description: 'Deals 30 damage. Gorilla Mode increases this to a heavy strike and stuns the target.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 0,
      energyCost: { physical: 1, technique: 1 },
      power: 30,
      effects: [
        { type: 'damage', power: 30, target: 'inherit' },
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'actorModeIs', key: 'form', value: 'gorilla' }],
          effects: [
            { type: 'damage', power: 30, target: 'inherit' },
            { type: 'classStun', duration: 1, blockedClasses: ['Physical', 'Energy', 'Affliction', 'Melee', 'Ranged', 'Mental', 'Special'], target: 'inherit' },
          ],
        },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'panda-core-shift',
    name: 'Core Shift',
    description: 'Panda becomes invulnerable for 1 turn and prepares his next skill as if in Gorilla Mode.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: {},
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'setMode', key: 'form', value: 'gorilla', target: 'self' },
    ],
  }),
})
