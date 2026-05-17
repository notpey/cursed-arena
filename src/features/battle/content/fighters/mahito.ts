import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect, markerEffect } from './_helpers.ts'

const SOUL_UNDERSTANDING_TAG = 'soul-understanding'
const IDLE_TRANSFIGURATION_TAG = 'idle-transfiguration'
const SOUL_EXPERIMENTATION_TAG = 'soul-experimentation'

const understandingPayoff = [
  { type: 'damageFiltered' as const, power: 10, requiresTag: SOUL_UNDERSTANDING_TAG, target: 'inherit' as const },
  { type: 'removeModifier' as const, target: 'inherit' as const, filter: { tags: [SOUL_UNDERSTANDING_TAG] } },
]

const idleTransfigurationEffects = (target: 'inherit' | 'attacker') => [
  modifierEffect('Idle Transfiguration', 'damageDealt', -15, 1, target, [IDLE_TRANSFIGURATION_TAG], { intent: 'harmful' }),
  markerEffect('Idle Transfiguration', 2, target, [IDLE_TRANSFIGURATION_TAG], { intent: 'harmful' }),
]

const experimentationPayoff = [
  { type: 'damageFiltered' as const, power: 10, requiresTag: SOUL_EXPERIMENTATION_TAG, target: 'inherit' as const },
]

export const mahito = fighter({
  id: 'mahito',
  name: 'Mahito',
  shortName: 'Mahito',
  rarity: 'SSR',
  role: 'Soul Manipulator',
  portraitFrame: { scale: 2.08, y: '-12%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'mahito-understanding-the-soul',
      trigger: 'onAbilityResolve',
      conditions: [{ type: 'firstAbilityOnTarget' }],
      effects: [markerEffect('Soul Understanding', 'permanent', 'inherit', [SOUL_UNDERSTANDING_TAG], { intent: 'harmful' })],
      label: 'Understanding the Soul',
      description: 'The first time Mahito uses a skill on each enemy, that enemy is marked. His next damaging skill against that target deals 10 additional damage and consumes the mark.',
      icon: { label: 'US', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'mahito-idle-transfiguration',
      name: 'Idle Transfiguration',
      description: 'This skill targets one enemy, dealing 20 damage to them and reducing their damage by 15 for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Mental', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { random: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit' },
        ...understandingPayoff,
        ...experimentationPayoff,
        ...idleTransfigurationEffects('inherit'),
      ],
    }),
    skill({
      id: 'mahito-soul-multiplicity',
      name: 'Soul Multiplicity',
      description: 'This skill targets one enemy and deals 15 damage to all enemies. If the main target is affected by Idle Transfiguration, it deals 25 damage to all enemies instead.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Mental', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { random: 2 },
      power: 15,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'targetHasModifierTag', tag: IDLE_TRANSFIGURATION_TAG }],
          effects: [{ type: 'damage', power: 25, target: 'all-enemies' }],
          elseEffects: [
            { type: 'damage', power: 15, target: 'inherit' },
            { type: 'damage', power: 15, target: 'other-enemies' },
          ],
        },
        ...understandingPayoff,
        ...experimentationPayoff,
      ],
    }),
    skill({
      id: 'mahito-soul-experimentation',
      name: 'Soul Experimentation',
      description: 'This skill marks one enemy for 3 turns. Mahito deals 10 additional damage with damaging skills against that target. If the target is defeated while marked, Mahito permanently deals 10 more damage.',
      kind: 'utility',
      targetRule: 'enemy-single',
      classes: ['Mental', 'Melee', 'Action'],
      cooldown: 4,
      energyCost: { random: 1, technique: 1 },
      effects: [
        markerEffect('Soul Experimentation', 3, 'inherit', [SOUL_EXPERIMENTATION_TAG], { intent: 'harmful' }),
        {
          type: 'reaction',
          label: 'Soul Experimentation',
          trigger: 'onDefeat',
          duration: 3,
          consumeOnTrigger: true,
          target: 'inherit',
          effects: [modifierEffect('Soul Experimentation Breakthrough', 'damageDealt', 10, 'permanent', 'self', ['soul-experimentation-breakthrough'])],
        },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'mahito-self-embodiment',
    name: 'Self-Embodiment',
    description: 'Mahito becomes invulnerable for 1 turn. During this turn, the first enemy that uses a harmful skill on him takes 20 damage and is affected by Idle Transfiguration.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      {
        type: 'reaction',
        label: 'Self-Embodiment',
        trigger: 'onBeingTargeted',
        duration: 1,
        harmfulOnly: true,
        consumeOnTrigger: true,
        target: 'self',
        effects: [
          { type: 'damage', power: 20, target: 'attacker' },
          ...idleTransfigurationEffects('attacker'),
        ],
      },
    ],
  }),
})
