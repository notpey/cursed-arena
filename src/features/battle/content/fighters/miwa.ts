import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, markerEffect, modifierEffect } from './_helpers.ts'

const SIMPLE_DOMAIN_MODE = 'simple_domain'
const DEFENSIVE_STANCE_MODE = 'defensive_stance_ready'

export const miwa = fighter({
  id: 'miwa',
  name: 'Kasumi Miwa',
  shortName: 'Miwa',
  rarity: 'R',
  role: 'Defensive Counter-Control / Anti-Technique',
  portraitFrame: { scale: 2.08, y: '-12%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'miwa-steady-discipline',
      trigger: 'onRoundStart',
      conditions: [{ type: 'counterAtLeast', key: '__never_miwa_display_only', value: 1 }],
      effects: [markerEffect('Steady Discipline', 'permanent', 'self', ['steady-discipline'])],
      label: 'Steady Discipline',
      description: 'Adapted: while Simple Domain is active, Miwa takes 5 less damage from all sources.',
      icon: { label: 'SD', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'miwa-simple-domain',
      name: 'Simple Domain',
      description: 'For 2 turns, Miwa enters Simple Domain, ignores non-damage effects, takes 15 less damage, and enemies cannot become invulnerable. If Defensive Stance is prepared, this skill reduces its cooldown by 1.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 4,
      energyCost: { physical: 1, mental: 1 },
      effects: [
        { type: 'setMode', key: SIMPLE_DOMAIN_MODE, value: 'active', duration: 2, target: 'self' },
        { type: 'effectImmunity', label: 'Simple Domain', blocks: ['nonDamage'], duration: 2, tags: ['simple-domain'], target: 'self' },
        modifierEffect('Simple Domain', 'damageTaken', -10, 2, 'self', ['simple-domain']),
        modifierEffect('Steady Discipline', 'damageTaken', -5, 2, 'self', ['steady-discipline', 'simple-domain']),
        modifierEffect('Simple Domain', 'canGainInvulnerable', false, 2, 'all-enemies', ['simple-domain'], { intent: 'harmful' }),
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'actorModeIs', key: DEFENSIVE_STANCE_MODE, value: 'active' }],
          effects: [
            { type: 'clearMode', key: DEFENSIVE_STANCE_MODE, target: 'self' },
            { type: 'cooldownAdjust', amount: -1, abilityId: 'miwa-simple-domain', target: 'self' },
          ],
        },
      ],
    }),
    skill({
      id: 'miwa-quick-draw',
      name: 'Quick Draw',
      description: 'This skill targets one enemy, dealing 15 damage. While Simple Domain is active, it deals 30 damage and ignores destructible defense.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 15,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'actorModeIs', key: SIMPLE_DOMAIN_MODE, value: 'active' }],
          effects: [{ type: 'damage', power: 30, target: 'inherit', ignoresShield: true }],
          elseEffects: [{ type: 'damage', power: 15, target: 'inherit' }],
        },
      ],
    }),
    skill({
      id: 'miwa-counter-slash',
      name: 'Counter Slash',
      description: 'For 1 turn, Miwa counters the next harmful skill used on her, dealing 25 damage to the attacker and stunning them for 1 turn. While Simple Domain is active, this counters every harmful skill used on her during the turn.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 2,
      energyCost: { physical: 1 },
      effects: [
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'actorModeIs', key: SIMPLE_DOMAIN_MODE, value: 'active' }],
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
    description: 'Miwa becomes invulnerable for 1 turn. While this preparation is active, her next Simple Domain reduces its cooldown by 1.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { mental: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'setMode', key: DEFENSIVE_STANCE_MODE, value: 'active', duration: 1, target: 'self' },
    ],
  }),
})
