import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, markerEffect, skill } from './_helpers.ts'

const STRAW_DOLL_TAG = 'straw-doll-ritual'

export const nobara = fighter({
  id: 'nobara',
  name: 'Nobara Kugisaki',
  shortName: 'Nobara',
  rarity: 'SR',
  role: 'Stacking Mark / Payoff',
  portraitFrame: { scale: 2.08, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'nobara-straw-doll-ritual',
      trigger: 'onRoundStart',
      effects: [
        {
          type: 'damageScaledByCounter',
          counterKey: 'straw_doll_ritual_stacks',
          counterSource: 'target',
          powerPerStack: 2,
          consumeStacks: false,
          piercing: true,
          target: 'all-enemies',
        },
      ],
      label: 'Straw Doll Ritual',
      description: 'Enemies marked by Nobara take 2 piercing damage per Straw Doll stack at the start of each round while Nobara is alive.',
      icon: { label: 'SD', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'nobara-hammer-and-nails',
      name: 'Hammer & Nails',
      description: 'This skill targets one enemy, dealing 10 piercing damage and applying 1 Straw Doll stack. For 1 turn, Soul Resonance costs 1 less random energy.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 0,
      energyCost: { random: 1 },
      power: 10,
      effects: [
        { type: 'damage', power: 10, piercing: true, target: 'inherit' },
        { type: 'adjustCounter', key: 'straw_doll_ritual_stacks', amount: 1, target: 'inherit' },
        markerEffect('Straw Doll Ritual', 'permanent', 'inherit', [STRAW_DOLL_TAG]),
        {
          type: 'modifyAbilityCost',
          target: 'self',
          modifier: {
            label: 'Soul Resonance Discount',
            abilityId: 'nobara-soul-resonance',
            mode: 'reduceRandom',
            amount: 1,
            duration: 2,
            uses: 1,
          },
        },
      ],
    }),
    skill({
      id: 'nobara-soul-resonance',
      name: 'Soul Resonance',
      description: 'This skill targets one enemy with Straw Doll stacks, dealing 5 piercing damage for each stack. This does not consume Straw Doll stacks.',
      kind: 'attack',
      targetRule: 'enemy-single',
      requiredTargetTags: [STRAW_DOLL_TAG],
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 1,
      energyCost: { mental: 1, random: 1 },
      effects: [
        {
          type: 'damageScaledByCounter',
          counterKey: 'straw_doll_ritual_stacks',
          counterSource: 'target',
          powerPerStack: 5,
          consumeStacks: false,
          piercing: true,
          requiresTag: STRAW_DOLL_TAG,
          target: 'inherit',
        },
      ],
    }),
    skill({
      id: 'nobara-hairpin',
      name: 'Hairpin',
      description: 'This skill targets one enemy with Straw Doll stacks, dealing 30 damage. For 1 turn, Hammer & Nails costs 0 energy.',
      kind: 'attack',
      targetRule: 'enemy-single',
      requiredTargetTags: [STRAW_DOLL_TAG],
      classes: ['Special', 'Ranged', 'Instant'],
      cooldown: 0,
      energyCost: { mental: 1 },
      power: 30,
      effects: [
        { type: 'damage', power: 30, target: 'inherit' },
        {
          type: 'modifyAbilityCost',
          target: 'self',
          modifier: {
            label: 'Hairpin Opening',
            abilityId: 'nobara-hammer-and-nails',
            mode: 'set',
            cost: {},
            duration: 2,
            uses: 1,
          },
        },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'nobara-straw-doll-decoy',
    name: 'Straw Doll Decoy',
    description: 'This skill makes Nobara Kugisaki invulnerable for 1 turn.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
  }),
})
