import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

const GORILLA_MODE_KEY = 'gorilla_mode'
const gorillaModeCondition = { type: 'actorModeIs' as const, key: GORILLA_MODE_KEY, value: 'active' }
const pandaGorillaCost = (abilityId: string, duration = 99, uses?: number) => ({
  type: 'modifyAbilityCost' as const,
  target: 'self' as const,
  modifier: {
    label: 'Gorilla Mode Cost',
    abilityId,
    mode: 'increaseRandom' as const,
    amount: 1,
    duration,
    uses,
  },
})

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
        { type: 'fighterFlag', key: 'panda_three_cores_triggered', value: false },
      ],
      effects: [
        { type: 'setFlag', key: 'panda_three_cores_triggered', value: true, target: 'self' },
        { type: 'setMode', key: GORILLA_MODE_KEY, value: 'active', target: 'self' },
        { type: 'heal', power: 15, target: 'self' },
        pandaGorillaCost('panda-punch'),
        pandaGorillaCost('panda-drumming-beat'),
      ],
      label: 'Three Cores',
      description: 'The first time Panda drops below 30 health, he permanently enters Gorilla Mode and heals 15 health.',
      icon: { label: 'TC', tone: 'red' },
    }),
  ],
  abilities: [
    skill({
      id: 'panda-punch',
      name: 'Panda Punch',
      description: 'This skill targets one enemy, dealing 20 damage to them. While in Gorilla Mode, this skill deals 40 damage and costs 1 additional random energy.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 20,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [gorillaModeCondition],
          effects: [{ type: 'damage', power: 40, target: 'inherit' }],
          elseEffects: [{ type: 'damage', power: 20, target: 'inherit' }],
        },
      ],
    }),
    skill({
      id: 'panda-cursed-body',
      name: 'Cursed Body',
      description: 'Panda gains 20 destructible defense and takes 10 less non-affliction damage for 2 turns. In Gorilla Mode, this lasts 3 turns and Panda ignores non-damage harmful effects while active.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 2,
      energyCost: { random: 1 },
      effects: [
        {
          type: 'conditional',
          target: 'self',
          conditions: [gorillaModeCondition],
          effects: [
            { type: 'shield', amount: 20, label: 'Cursed Body', tags: ['cursed-body'], target: 'self' },
            modifierEffect('Cursed Body', 'damageTaken', -10, 3, 'self', ['cursed-body'], { excludedDamageClass: 'Affliction' }),
            { type: 'effectImmunity', label: 'Cursed Body', blocks: ['nonDamage'], duration: 3, tags: ['cursed-body'], target: 'self' },
          ],
          elseEffects: [
            { type: 'shield', amount: 20, label: 'Cursed Body', tags: ['cursed-body'], target: 'self' },
            modifierEffect('Cursed Body', 'damageTaken', -10, 2, 'self', ['cursed-body'], { excludedDamageClass: 'Affliction' }),
          ],
        },
      ],
    }),
    skill({
      id: 'panda-drumming-beat',
      name: 'Drumming Beat',
      description: 'This skill targets one enemy, dealing 30 damage to them. While in Gorilla Mode, this skill deals 60 damage, costs 1 additional random energy, and stuns Panda from using harmful skills for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 0,
      energyCost: { physical: 1, technique: 1 },
      power: 30,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [gorillaModeCondition],
          effects: [
            { type: 'damage', power: 60, target: 'inherit' },
            { type: 'intentStun', intent: 'harmful', duration: 1, target: 'self' },
          ],
          elseEffects: [{ type: 'damage', power: 30, target: 'inherit' }],
        },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'panda-core-shift',
    name: 'Core Shift',
    description: 'Panda becomes invulnerable for 1 turn and enters Gorilla Mode for 1 round.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'setMode', key: GORILLA_MODE_KEY, value: 'active', duration: 1, target: 'self' },
      pandaGorillaCost('panda-punch', 2, 1),
      pandaGorillaCost('panda-drumming-beat', 2, 1),
    ],
  }),
})
