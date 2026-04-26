import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

export const maki = fighter({
  id: 'maki',
  name: "Maki Zen'in",
  shortName: 'Maki',
  rarity: 'SR',
  role: 'Weapon Specialist',
  portraitFrame: { scale: 2.08, y: '-12%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'maki-weapon-mastery',
      trigger: 'onTakeDamage',
      conditions: [
        { type: 'selfHpBelow', threshold: 0.7 },
        { type: 'fighterFlag', key: 'maki_weapon_mastery_used', value: false },
      ],
      effects: [
        { type: 'setFlag', key: 'maki_weapon_mastery_used', value: true, target: 'self' },
        modifierEffect('Weapon Mastery', 'damageDealt', 5, 'permanent', 'self', ['weapon-mastery']),
      ],
      label: 'Weapon Mastery',
      description: 'When Maki is badly hurt, her weapon techniques sharpen for the rest of the game.',
      icon: { label: 'WM', tone: 'red' },
    }),
  ],
  abilities: [
    skill({
      id: 'maki-sweeping-polearm',
      name: 'Sweeping Polearm',
      description: 'Deals 10 damage to all enemies and another 5 damage next turn. Maki counters harmful attacks for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Physical', 'Melee', 'Action'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 10,
      effects: [
        { type: 'damage', power: 10, target: 'all-enemies' },
        { type: 'schedule', delay: 1, phase: 'roundStart', target: 'all-enemies', effects: [{ type: 'damage', power: 5, target: 'inherit' }] },
        { type: 'counter', duration: 1, counterDamage: 10, consumeOnTrigger: false, target: 'self' },
      ],
    }),
    skill({
      id: 'maki-close-quarters-combo',
      name: 'Close-Quarters Combo',
      description: 'Deals 15 damage to one enemy and another 15 damage next turn. Maki takes 10 less damage for 1 turn.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Action'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 15,
      effects: [
        { type: 'damage', power: 15, target: 'inherit' },
        { type: 'schedule', delay: 1, phase: 'roundStart', target: 'inherit', effects: [{ type: 'damage', power: 15, target: 'inherit' }] },
        modifierEffect('Close-Quarters Guard', 'damageTaken', -10, 1, 'self', ['close-quarters-combo']),
      ],
    }),
    skill({
      id: 'maki-playful-cloud-strike',
      name: 'Playful Cloud Strike',
      description: 'Deals 20 piercing damage to one enemy and another 20 damage next turn. Maki gains a stacking damage increase.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Action'],
      cooldown: 2,
      energyCost: { physical: 1, technique: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit', piercing: true },
        { type: 'schedule', delay: 1, phase: 'roundStart', target: 'inherit', effects: [{ type: 'damage', power: 20, target: 'inherit' }] },
        modifierEffect('Playful Cloud Momentum', 'damageDealt', 5, 'permanent', 'self', ['playful-cloud']),
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'maki-tactical-withdrawal',
    name: 'Tactical Withdrawal',
    description: 'Maki becomes invulnerable for 1 turn.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
  }),
})
