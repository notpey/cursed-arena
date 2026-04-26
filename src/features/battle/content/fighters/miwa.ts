import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

export const miwa = fighter({
  id: 'miwa',
  name: 'Kasumi Miwa',
  shortName: 'Miwa',
  rarity: 'R',
  role: 'Simple Domain Defender',
  portraitFrame: { scale: 2.08, y: '-12%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'miwa-steady-discipline',
      trigger: 'onRoundStart',
      effects: [
        { type: 'effectImmunity', label: 'Steady Discipline', blocks: ['nonDamage'], duration: 1, tags: ['steady-discipline'], target: 'self' },
        modifierEffect('Steady Discipline', 'damageTaken', -5, 1, 'self', ['steady-discipline']),
      ],
      label: 'Steady Discipline',
      description: 'While Miwa is not affected by any non-damage effects, she takes 5 less damage from all sources.',
      icon: { label: 'SD', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'miwa-simple-domain',
      name: 'Simple Domain',
      description: 'For 2 turns, Miwa will ignore all non-damage effects from enemy skills and will reduce all damage she takes by 10. During this time, enemies cannot ignore damage reduction or become invulnerable.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 4,
      energyCost: { physical: 1, mental: 1 },
      effects: [
        { type: 'effectImmunity', label: 'Simple Domain', blocks: ['nonDamage'], duration: 2, tags: ['simple-domain'], target: 'self' },
        modifierEffect('Simple Domain', 'damageTaken', -10, 2, 'self', ['simple-domain']),
        modifierEffect('Simple Domain', 'canGainInvulnerable', false, 2, 'all-enemies', ['simple-domain']),
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'fighterFlag', key: 'defensive_stance_used', value: true }],
          effects: [
            { type: 'setFlag', key: 'defensive_stance_used', value: false, target: 'self' },
            { type: 'cooldownAdjust', amount: -1, abilityId: 'miwa-simple-domain', target: 'self' },
          ],
        },
      ],
    }),
    skill({
      id: 'miwa-quick-draw',
      name: 'Quick Draw',
      description: 'This skill targets one enemy, dealing 15 damage to them. If Simple Domain is active, this skill will deal 30 damage and ignore destructible defense.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 15,
      effects: [
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'actorHasModifierTag', tag: 'simple-domain' }],
          effects: [{ type: 'damage', power: 30, target: 'inherit', ignoresShield: true }],
          elseEffects: [{ type: 'damage', power: 15, target: 'inherit' }],
        },
      ],
    }),
    skill({
      id: 'miwa-counter-slash',
      name: 'Counter Slash',
      description: 'For 1 turn, Miwa will counter the next harmful skill used on her. The attacker will take 25 damage and become stunned for 1 turn. If Simple Domain is active, this skill will counter all harmful skills used on Miwa during this turn.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 2,
      energyCost: { physical: 1 },
      effects: [
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'actorHasModifierTag', tag: 'simple-domain' }],
          effects: [{
            type: 'reaction',
            label: 'Counter Slash',
            trigger: 'onBeingTargeted',
            duration: 1,
            harmfulOnly: true,
            consumeOnTrigger: false,
            target: 'self',
            effects: [
              { type: 'damage', power: 25, target: 'attacker', cannotBeCountered: true, cannotBeReflected: true },
              { type: 'stun', duration: 1, target: 'attacker' },
            ],
          }],
          elseEffects: [{
            type: 'reaction',
            label: 'Counter Slash',
            trigger: 'onBeingTargeted',
            duration: 1,
            harmfulOnly: true,
            consumeOnTrigger: true,
            target: 'self',
            effects: [
              { type: 'damage', power: 25, target: 'attacker', cannotBeCountered: true, cannotBeReflected: true },
              { type: 'stun', duration: 1, target: 'attacker' },
            ],
          }],
        },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'miwa-defensive-stance',
    name: 'Defensive Stance',
    description: 'Miwa becomes invulnerable for 1 turn. If she uses Simple Domain on the following turn, its cooldown will be reduced by 1.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { mental: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'setFlag', key: 'defensive_stance_used', value: true, target: 'self' },
    ],
  }),
})
