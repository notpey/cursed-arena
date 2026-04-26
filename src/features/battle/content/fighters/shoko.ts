import { definePassive, defendSkill, healSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect, markerEffect } from './_helpers.ts'

export const shoko = fighter({
  id: 'shoko',
  name: 'Shoko Ieiri',
  shortName: 'Shoko',
  rarity: 'SR',
  role: 'Reverse Cursed Technique',
  portraitFrame: { scale: 2, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'shoko-corpse-examination',
      trigger: 'onDefeat',
      effects: [modifierEffect('Corpse Examination', 'healDone', 15, 1, 'self', ['corpse-examination'])],
      label: 'Corpse Examination',
      description: 'When an ally or enemy is killed, Shoko prepares stronger healing.',
      icon: { label: 'CE', tone: 'teal' },
    }),
  ],
  abilities: [
    healSkill({
      id: 'shoko-reverse-cursed-technique',
      name: 'Reverse Cursed Technique',
      description: 'Heals one ally for 20 health.',
      targetRule: 'ally-single',
      classes: ['Strategic', 'Instant'],
      cooldown: 1,
      energyCost: { mental: 1 },
      healPower: 20,
    }),
    skill({
      id: 'shoko-preserve-the-body',
      name: 'Preserve the Body',
      description: 'One ally cannot be defeated by affliction damage for 2 turns and will be healed when the effect ends.',
      kind: 'utility',
      targetRule: 'ally-single',
      classes: ['Strategic', 'Instant'],
      cooldown: 4,
      energyCost: { random: 1 },
      effects: [
        modifierEffect('Preserve the Body', 'isUndying', true, 2, 'inherit', ['preserve-the-body']),
        { type: 'schedule', delay: 2, phase: 'roundEnd', target: 'inherit', effects: [{ type: 'heal', power: 15, target: 'inherit' }] },
      ],
    }),
    skill({
      id: 'shoko-autopsy-report',
      name: 'Autopsy Report',
      description: 'One enemy takes 10 additional damage from affliction and mental skills for 2 turns.',
      kind: 'utility',
      targetRule: 'enemy-single',
      classes: ['Strategic', 'Instant'],
      cooldown: 2,
      energyCost: { technique: 2 },
      effects: [
        markerEffect('Autopsy Report', 2, 'inherit', ['autopsy-report']),
        modifierEffect('Autopsy Report', 'damageTaken', 10, 2, 'inherit', ['autopsy-report']),
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'shoko-emergency-treatment-room',
    name: 'Emergency Treatment Room',
    description: 'One ally becomes invulnerable for 1 turn and heals 10 health.',
    targetRule: 'ally-single',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'inherit' },
      { type: 'heal', power: 10, target: 'inherit' },
    ],
  }),
})
