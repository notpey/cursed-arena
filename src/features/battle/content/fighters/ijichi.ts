import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect, markerEffect } from './_helpers.ts'

export const ijichi = fighter({
  id: 'ijichi',
  name: 'Kiyotaka Ijichi',
  shortName: 'Ijichi',
  rarity: 'R',
  role: 'Barrier Support',
  portraitFrame: { scale: 1.98, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'ijichi-regulated-space',
      trigger: 'onRoundStart',
      effects: [
        { type: 'shield', amount: 5, label: 'Regulated Space', tags: ['regulated-space'], target: 'all-allies' },
        { type: 'damageFiltered', power: 5, requiresTag: 'barrier-tagging', target: 'all-enemies' },
      ],
      label: 'Regulated Space',
      description: 'Each turn, allies gain barrier reinforcement and tagged enemies take damage.',
      icon: { label: 'RS', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'ijichi-simple-barrier',
      name: 'Simple Barrier',
      description: 'One ally gains 25 destructible defense and takes 10 less damage for 2 turns.',
      kind: 'utility',
      targetRule: 'ally-single',
      classes: ['Strategic', 'Instant'],
      cooldown: 1,
      energyCost: { technique: 1 },
      effects: [
        { type: 'shield', amount: 25, label: 'Simple Barrier', tags: ['simple-barrier'], target: 'inherit' },
        modifierEffect('Simple Barrier', 'damageTaken', -10, 2, 'inherit', ['simple-barrier']),
      ],
    }),
    skill({
      id: 'ijichi-curtain',
      name: 'Curtain',
      description: 'All allies take 10 less damage and all enemies deal 5 less damage for 1 turn.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 3,
      energyCost: { technique: 2 },
      effects: [
        modifierEffect('Curtain', 'damageTaken', -10, 1, 'all-allies', ['curtain']),
        modifierEffect('Curtain', 'damageDealt', -5, 1, 'all-enemies', ['curtain']),
      ],
    }),
    skill({
      id: 'ijichi-barrier-tagging',
      name: 'Barrier Tagging',
      description: 'Tags one enemy for 2 turns. Tagged enemies take damage each turn and cannot reduce damage or become invulnerable.',
      kind: 'utility',
      targetRule: 'enemy-single',
      classes: ['Special', 'Ranged', 'Action'],
      cooldown: 3,
      energyCost: { technique: 2 },
      effects: [
        markerEffect('Barrier Tagging', 2, 'inherit', ['barrier-tagging']),
        modifierEffect('Barrier Tagging', 'canReduceDamageTaken', false, 2, 'inherit', ['barrier-tagging']),
        modifierEffect('Barrier Tagging', 'canGainInvulnerable', false, 2, 'inherit', ['barrier-tagging']),
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'ijichi-emergency-curtain',
    name: 'Emergency Curtain',
    description: 'Ijichi or one ally becomes invulnerable for 1 turn. All allies gain 10 destructible defense.',
    targetRule: 'ally-single',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'inherit' },
      { type: 'shield', amount: 10, label: 'Emergency Curtain', tags: ['emergency-curtain'], target: 'all-allies' },
    ],
  }),
})
