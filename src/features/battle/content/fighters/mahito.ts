import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect, markerEffect } from './_helpers.ts'

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
      effects: [markerEffect('Soul Read', 2, 'inherit', ['soul-read'])],
      label: 'Understanding the Soul',
      description: 'Mahito reads enemies he targets, setting them up for additional punishment.',
      icon: { label: 'US', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'mahito-idle-transfiguration',
      name: 'Idle Transfiguration',
      description: 'Deals 20 damage and warps the target, reducing their damage for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Mental', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { random: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit' },
        modifierEffect('Idle Transfiguration', 'damageDealt', -15, 1, 'inherit', ['idle-transfiguration']),
        markerEffect('Idle Transfiguration', 2, 'inherit', ['idle-transfiguration']),
      ],
    }),
    skill({
      id: 'mahito-soul-multiplicity',
      name: 'Soul Multiplicity',
      description: 'Deals 15 damage to one enemy and 15 damage to all other enemies. Transfigured targets take more damage.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Mental', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { random: 2 },
      power: 15,
      effects: [
        { type: 'damage', power: 15, target: 'inherit' },
        { type: 'damage', power: 15, target: 'other-enemies' },
        { type: 'damageFiltered', power: 10, requiresTag: 'idle-transfiguration', target: 'inherit' },
      ],
    }),
    skill({
      id: 'mahito-soul-experimentation',
      name: 'Soul Experimentation',
      description: 'Marks one enemy for 3 turns and makes them take 10 more damage from Mahito.',
      kind: 'utility',
      targetRule: 'enemy-single',
      classes: ['Mental', 'Melee', 'Action'],
      cooldown: 4,
      energyCost: { random: 1, technique: 1 },
      effects: [
        markerEffect('Soul Experimentation', 3, 'inherit', ['soul-experimentation']),
        modifierEffect('Soul Experimentation', 'damageTaken', 10, 3, 'inherit', ['soul-experimentation']),
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'mahito-self-embodiment',
    name: 'Self-Embodiment',
    description: 'Mahito becomes invulnerable for 1 turn and counters the next harmful skill.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'counter', duration: 1, counterDamage: 20, consumeOnTrigger: true, target: 'self' },
    ],
  }),
})
