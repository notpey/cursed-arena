import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, markerEffect, modifierEffect } from './_helpers.ts'

const CURSED_BULLET_USES = 'cursed_bullet_uses'

const reloadBullet = {
  type: 'adjustCounter' as const,
  key: CURSED_BULLET_USES,
  amount: 1,
  min: 0,
  max: 3,
  target: 'self' as const,
}

export const mai = fighter({
  id: 'mai',
  name: "Mai Zen'in",
  shortName: 'Mai',
  rarity: 'R',
  role: 'Precision Ranged / Limited Ammo',
  portraitFrame: { scale: 2.02, y: '-10%' },
  maxHp: 100,
  initialStateCounters: { [CURSED_BULLET_USES]: 2 },
  passiveEffects: [
    definePassive({
      id: 'mai-reserved-fire',
      trigger: 'onRoundStart',
      conditions: [{ type: 'counterAtLeast', key: '__never_mai_display_only', value: 1 }],
      effects: [markerEffect('Reserved Fire', 'permanent', 'self', ['reserved-fire'])],
      label: 'Reserved Fire',
      description: 'Mai begins with 2 Cursed Bullet uses. Her maximum number of uses is 3.',
      icon: { label: 'RF', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'mai-cursed-bullet',
      name: 'Cursed Bullet',
      description: 'This skill targets one enemy. If Mai has ammo, it deals 30 damage and consumes 1 Cursed Bullet use. At 0 uses, it deals 15 damage instead.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { technique: 2 },
      power: 30,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'counterAtLeast', key: CURSED_BULLET_USES, value: 1 }],
          effects: [
            { type: 'damage', power: 30, target: 'inherit' },
            { type: 'adjustCounter', key: CURSED_BULLET_USES, amount: -1, min: 0, max: 3, target: 'self' },
          ],
          elseEffects: [{ type: 'damage', power: 15, target: 'inherit' }],
        },
      ],
    }),
    skill({
      id: 'mai-steady-aim',
      name: 'Steady Aim',
      description: 'Mai gains 1 Cursed Bullet use, up to 3. Her next skill deals 10 additional damage. The delayed reload for skipping Cursed Bullet is deferred.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 1,
      energyCost: {},
      effects: [
        reloadBullet,
        modifierEffect('Steady Aim', 'damageDealt', 10, 1, 'self', ['steady-aim']),
      ],
    }),
    skill({
      id: 'mai-suppressing-fire',
      name: 'Suppressing Fire',
      description: 'This skill targets one enemy. With ammo remaining, it deals 15 damage and makes the target deal 10 less damage for 1 turn. At 0 Cursed Bullet uses, it deals 25 damage and stuns the target for 1 turn instead.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { technique: 1 },
      power: 15,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'counterAtLeast', key: CURSED_BULLET_USES, value: 1 }],
          effects: [
            { type: 'damage', power: 15, target: 'inherit' },
            modifierEffect('Suppressing Fire', 'damageDealt', -10, 1, 'inherit', ['suppressing-fire']),
          ],
          elseEffects: [
            { type: 'damage', power: 25, target: 'inherit' },
            { type: 'stun', duration: 1, target: 'inherit' },
          ],
        },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'mai-emergency-cover',
    name: 'Emergency Cover',
    description: 'Mai becomes invulnerable for 1 turn and gains 1 Cursed Bullet use at the next round start.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      {
        type: 'schedule',
        delay: 1,
        phase: 'roundStart',
        target: 'self',
        effects: [reloadBullet],
      },
    ],
  }),
})
