import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect, markerEffect } from './_helpers.ts'

const MOON_DREGS_TAG = 'moon-dregs-injection'
const moonDregsMarker = (target: 'inherit' | 'attacker') =>
  markerEffect('Moon Dregs: Injection', 2, target, [MOON_DREGS_TAG])

const moonDregsReaction = (target: 'inherit' | 'attacker') => ({
  type: 'reaction' as const,
  label: 'Moon Dregs: Injection',
  trigger: 'onAbilityUse' as const,
  duration: 2,
  harmfulOnly: true,
  consumeOnTrigger: false,
  oncePerRound: true,
  target,
  effects: [{ type: 'damage' as const, power: 10, target: 'inherit' as const }],
})

const moonDregsScheduledDamage = [
  {
    type: 'schedule' as const,
    delay: 1,
    phase: 'roundStart' as const,
    target: 'inherit' as const,
    effects: [{ type: 'damage' as const, power: 10, target: 'inherit' as const }],
  },
  {
    type: 'schedule' as const,
    delay: 2,
    phase: 'roundStart' as const,
    target: 'inherit' as const,
    effects: [{ type: 'damage' as const, power: 10, target: 'inherit' as const }],
  },
]

export const junpei = fighter({
  id: 'junpei',
  name: 'Junpei Yoshino',
  shortName: 'Junpei',
  rarity: 'R',
  role: 'Affliction Control',
  portraitFrame: { scale: 2.0, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'junpei-weak-constitution',
      trigger: 'onRoundStart',
      effects: [modifierEffect('Weak Constitution', 'damageTaken', 5, 1, 'self', ['weak-constitution'])],
      label: 'Weak Constitution',
      description: 'Junpei Yoshino takes 5 additional damage from all sources. When Junpei deals affliction damage, he heals 5 health.',
      icon: { label: 'WC', tone: 'red' },
    }),
    definePassive({
      id: 'junpei-weak-constitution-heal',
      trigger: 'onDealDamage',
      conditions: [{ type: 'abilityClass', class: 'Affliction' }],
      effects: [{ type: 'heal', power: 5, target: 'self' }],
      label: 'Weak Constitution Heal',
      hidden: true,
    }),
  ],
  abilities: [
    skill({
      id: 'junpei-moon-dregs-injection',
      name: 'Moon Dregs: Injection',
      description: 'This skill targets one enemy, dealing 10 damage to them. For 2 rounds, the target will take 10 affliction damage at round start. During this time, the first time the target uses a harmful skill each round, they will take 10 additional affliction damage.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Affliction', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { vow: 1 },
      power: 10,
      effects: [
        { type: 'damage', power: 10, target: 'inherit' },
        moonDregsMarker('inherit'),
        ...moonDregsScheduledDamage,
        moonDregsReaction('inherit'),
      ],
    }),
    skill({
      id: 'junpei-paralytic-poison',
      name: 'Moon Dregs: Paralytic Poison',
      description: 'This skill targets one enemy. For 1 turn, the next time that enemy uses a skill, they will become stunned for 1 turn and take 15 affliction damage.',
      kind: 'debuff',
      targetRule: 'enemy-single',
      classes: ['Affliction', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { technique: 1 },
      effects: [
        {
          type: 'reaction',
          label: 'Paralytic Poison',
          trigger: 'onAbilityUse',
          duration: 1,
          consumeOnTrigger: true,
          target: 'inherit',
          effects: [
            { type: 'stun', duration: 1, target: 'inherit' },
            { type: 'damage', power: 15, target: 'inherit' },
          ],
        },
      ],
    }),
    skill({
      id: 'junpei-toxic-break',
      name: 'Toxic Break',
      description: 'This skill targets one enemy, dealing 20 damage to them. If the target is affected by Moon Dregs: Injection, this skill will deal 15 additional piercing damage and increase all affliction effects by 5 permanently on them.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Affliction', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { vow: 1, mental: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit' },
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'targetHasModifierTag', tag: MOON_DREGS_TAG }],
          effects: [
            { type: 'damage', power: 15, piercing: true, target: 'inherit' },
            modifierEffect('Toxic Break Toxicity', 'damageTaken', 5, 'permanent', 'inherit', ['toxic-break-toxicity'], { damageClass: 'Affliction' }),
          ],
        },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'junpei-moon-dregs-guard',
    name: 'Moon Dregs: Guard',
    description: 'For 1 turn, Junpei becomes invulnerable. During this time, the first enemy that targets Junpei with a harmful skill will take 15 affliction damage and become affected by the Moon Dregs marker and harmful-skill punishment.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { mental: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      {
        type: 'reaction',
        label: 'Moon Dregs: Guard',
        trigger: 'onBeingTargeted',
        duration: 1,
        harmfulOnly: true,
        consumeOnTrigger: true,
        target: 'self',
        effects: [
          { type: 'damage', power: 15, target: 'attacker' },
          moonDregsMarker('attacker'),
          moonDregsReaction('attacker'),
        ],
      },
    ],
  }),
})
