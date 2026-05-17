import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill } from './_helpers.ts'

const SCORCHED_COUNTER = 'scorched'
const JOGO_DAMAGE_TAKEN_COUNTER = 'jogo_damage_taken'
const applyScorched = (target: 'inherit' | 'all-enemies' | 'attacker') => ({
  type: 'adjustCounter' as const,
  key: SCORCHED_COUNTER,
  amount: 1,
  target,
  intent: 'harmful' as const,
})

export const jogo = fighter({
  id: 'jogo',
  name: 'Jogo',
  shortName: 'Jogo',
  rarity: 'SSR',
  role: 'Affliction / Field Damage',
  portraitFrame: { scale: 2.1, y: '-10%' },
  maxHp: 100,
  initialStateCounters: { [JOGO_DAMAGE_TAKEN_COUNTER]: 0 },
  passiveEffects: [
    definePassive({
      id: 'jogo-disaster-heat',
      trigger: 'onRoundStart',
      effects: [{ type: 'damageScaledByCounter', counterKey: SCORCHED_COUNTER, powerPerStack: 5, consumeStacks: false, target: 'all-enemies' }],
      label: 'Disaster Heat',
      description: 'At round start, enemies take 5 damage per Scorched stack they have. When Jogo accumulates 25 damage taken, all enemies gain 1 Scorched stack; excess damage carries toward the next threshold.',
      icon: { label: 'DH', tone: 'red' },
    }),
    definePassive({
      id: 'jogo-disaster-heat-trigger',
      trigger: 'onTakeDamage',
      effects: [
        { type: 'adjustCounterByTriggerAmount', key: JOGO_DAMAGE_TAKEN_COUNTER, target: 'self' },
        {
          type: 'conditional',
          target: 'self',
          conditions: [{ type: 'counterAtLeast', key: JOGO_DAMAGE_TAKEN_COUNTER, value: 25 }],
          effects: [
            { type: 'adjustCounter', key: JOGO_DAMAGE_TAKEN_COUNTER, amount: -25, min: 0, target: 'self' },
            applyScorched('all-enemies'),
          ],
        },
      ],
      label: 'Disaster Heat Trigger',
      hidden: true,
    }),
  ],
  abilities: [
    skill({
      id: 'jogo-ember-insects',
      name: 'Ember Insects',
      description: 'This skill grants Jogo 10 destructible defense and applies 1 Scorched stack to one enemy. If this defense is broken this round, the attacker gains 1 Scorched stack.',
      kind: 'utility',
      targetRule: 'enemy-single',
      classes: ['Affliction', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { random: 1 },
      effects: [
        { type: 'shield', amount: 10, label: 'Ember Insects', tags: ['ember-insects'], target: 'self' },
        {
          type: 'reaction',
          label: 'Ember Insects',
          trigger: 'onShieldBroken',
          duration: 1,
          consumeOnTrigger: true,
          target: 'self',
          effects: [
            applyScorched('attacker'),
          ],
        },
        applyScorched('inherit'),
      ],
    }),
    skill({
      id: 'jogo-volcanic-infestation',
      name: 'Volcanic Infestation',
      description: 'This skill targets all enemies. For 1 round, each enemy that uses a new harmful skill gains 1 Scorched stack.',
      kind: 'utility',
      targetRule: 'enemy-all',
      classes: ['Affliction', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { random: 2 },
      effects: [
        {
          type: 'reaction',
          label: 'Volcanic Infestation',
          trigger: 'onAbilityUse',
          duration: 1,
          harmfulOnly: true,
          newSkillOnly: true,
          consumeOnTrigger: false,
          target: 'all-enemies',
          effects: [
            applyScorched('inherit'),
          ],
        },
      ],
    }),
    skill({
      id: 'jogo-cataclysmic-eruption',
      name: 'Cataclysmic Eruption',
      description: 'This skill targets all enemies, dealing 5 damage per Scorched stack on each target, then removing all Scorched stacks from them.',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Affliction', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { random: 3 },
      effects: [
        { type: 'damageScaledByCounter', counterKey: SCORCHED_COUNTER, powerPerStack: 5, consumeStacks: true, target: 'all-enemies' },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'jogo-molten-husk',
    name: 'Molten Husk',
    description: 'This skill makes Jogo invulnerable for 1 turn. During this time, whenever Jogo is targeted by a skill, all enemies gain 1 Scorched stack.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      {
        type: 'reaction',
        label: 'Molten Husk',
        trigger: 'onBeingTargeted',
        duration: 1,
        harmfulOnly: false,
        consumeOnTrigger: false,
        target: 'self',
        effects: [
          applyScorched('all-enemies'),
        ],
      },
    ],
  }),
})
