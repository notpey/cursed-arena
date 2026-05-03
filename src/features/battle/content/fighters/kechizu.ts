import { definePassive } from '@/features/battle/content.ts'
import { fighter, skill, markerEffect } from './_helpers.ts'

const rotDescription = 'If an enemy affected by Rot uses a new harmful skill, they will deal 5 less non-affliction damage for 1 turn. This skill stacks.'

const acidicSpitTick = [
  {
    type: 'conditional' as const,
    target: 'inherit' as const,
    conditions: [{ type: 'targetCounterAtLeast' as const, key: 'rot', value: 1 }],
    effects: [{ type: 'burn' as const, damage: 5, duration: 2, target: 'inherit' as const }],
  },
  { type: 'adjustCounter' as const, key: 'rot', amount: 1, min: 0, target: 'inherit' as const },
]

const acidicSpitInitial = acidicSpitTick.map((effect) => ({ ...effect, target: 'all-enemies' as const }))

export const kechizu = fighter({
  id: 'kechizu',
  name: 'Kechizu',
  shortName: 'Kechizu',
  rarity: 'SR',
  role: 'Rot / Protector / Disruptor',
  portraitFrame: { scale: 2.0, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'kechizu-shared-rot',
      trigger: 'onAbilityUse',
      conditions: [{ type: 'counterAtLeast', key: '__never_rot_display_only', value: 1 }],
      effects: [markerEffect('Rot', 'permanent', 'self', ['rot'])],
      label: 'Rot',
      description: rotDescription,
      counterKey: 'rot',
      icon: { label: 'RT', tone: 'red' },
    }),
  ],
  abilities: [
    skill({
      id: 'kechizu-acidic-spit',
      name: 'Acidic Spit',
      description: 'This skill targets all enemies, applying 1 stack of Rot to them each turn for 2 turns. If Rot is already active on them when a new stack is applied, they will receive 5 affliction damage each turn for 2 turns.',
      kind: 'debuff',
      targetRule: 'enemy-all',
      classes: ['Affliction', 'Ranged', 'Instant'],
      intent: 'harmful',
      cooldown: 2,
      energyCost: { vow: 1 },
      effects: [
        ...acidicSpitInitial,
        { type: 'schedule', delay: 1, phase: 'roundStart', target: 'all-enemies', effects: acidicSpitTick },
      ],
    }),
    skill({
      id: 'kechizu-connected-souls',
      name: 'Connected Souls',
      description: 'This skill targets 1 ally. For 2 turns, the first harmful enemy skill used on them will be intercepted by Kechizu. The ally will ignore that skill, the enemy who used it will gain 2 stacks of Rot, and Kechizu will receive 10 affliction damage.',
      kind: 'utility',
      targetRule: 'ally-single',
      classes: ['Strategic', 'Instant', 'Affliction'],
      intent: 'mixed',
      cooldown: 2,
      energyCost: { mental: 1 },
      effects: [
        {
          type: 'reaction',
          label: 'Connected Souls',
          trigger: 'onBeingTargeted',
          duration: 2,
          harmfulOnly: true,
          consumeOnTrigger: true,
          target: 'inherit',
          effects: [
            { type: 'invulnerable', duration: 1, target: 'inherit' },
            { type: 'adjustCounter', key: 'rot', amount: 2, min: 0, target: 'attacker' },
            { type: 'damage', power: 10, piercing: true, target: 'self' },
          ],
        },
      ],
    }),
    skill({
      id: 'kechizu-chomp',
      name: 'Chomp',
      description: 'This skill targets one enemy, stunning their helpful skills for 1 turn. The following turn, they will receive 15 damage. During this time, each time a helpful skill is used on the target, the user will gain 1 stack of Rot.',
      kind: 'debuff',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      intent: 'harmful',
      cooldown: 2,
      energyCost: { vow: 1 },
      effects: [
        { type: 'intentStun', intent: 'helpful', duration: 1, target: 'inherit' },
        { type: 'schedule', delay: 1, phase: 'roundStart', target: 'inherit', effects: [{ type: 'damage', power: 15, target: 'inherit' }] },
        {
          type: 'reaction',
          label: 'Chomp',
          trigger: 'onBeingTargeted',
          duration: 1,
          helpfulOnly: true,
          consumeOnTrigger: false,
          target: 'inherit',
          effects: [{ type: 'adjustCounter', key: 'rot', amount: 1, min: 0, target: 'attacker' }],
        },
      ],
    }),
  ],
  ultimate: skill({
    id: 'kechizu-blood-brothers',
    name: 'Blood Brothers',
    description: 'This skill makes Kechizu and 1 ally invulnerable for 1 turn.',
    kind: 'defend',
    targetRule: 'ally-single',
    classes: ['Strategic', 'Instant'],
    intent: 'helpful',
    cooldown: 4,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'invulnerable', duration: 1, target: 'inherit' },
    ],
  }),
})
