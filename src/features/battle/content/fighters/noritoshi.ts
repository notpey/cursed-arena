import { definePassive, defendSkill } from '@/features/battle/content.ts'
import type { SkillEffect } from '@/features/battle/types.ts'
import { fighter, skill, markerEffect, modifierEffect } from './_helpers.ts'

const KAMO_REFINED_BONUS = 'kamo_refined_bonus'

function refinedBonusDamage(): SkillEffect {
  return {
    type: 'damageScaledByCounter',
    counterKey: KAMO_REFINED_BONUS,
    counterSource: 'actor',
    powerPerStack: 10,
    consumeStacks: true,
    target: 'inherit',
  }
}

function prepareRefinedBonus(currentAbilityId: string): SkillEffect {
  return {
    type: 'conditional',
    target: 'self',
    conditions: [{ type: 'usedDifferentAbilityLastTurn', abilityId: currentAbilityId }],
    effects: [{ type: 'setCounter', key: KAMO_REFINED_BONUS, value: 1, target: 'self' }],
  }
}

export const noritoshi = fighter({
  id: 'noritoshi',
  name: 'Noritoshi Kamo',
  shortName: 'Kamo',
  rarity: 'SR',
  role: 'Sequencing Precision / Blood Technique',
  portraitFrame: { scale: 2, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'noritoshi-refined-technique',
      trigger: 'onRoundStart',
      conditions: [{ type: 'counterAtLeast', key: '__never_kamo_display_only', value: 1 }],
      effects: [markerEffect('Refined Technique', 'permanent', 'self', ['refined-technique'])],
      label: 'Refined Technique',
      description: 'When Kamo uses a different skill than his previous skill, his next damaging skill deals 10 additional damage.',
      icon: { label: 'RT', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'noritoshi-blood-draw',
      name: 'Blood Draw',
      description: 'Kamo loses 10 health and gains 1 random energy. For 1 turn, his cooldowns tick down rapidly.',
      kind: 'utility',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Affliction'],
      cooldown: 2,
      energyCost: {},
      effects: [
        { type: 'damage', power: 10, target: 'self', piercing: true, ignoresShield: true, ignoresInvulnerability: true },
        { type: 'energyGain', amount: { random: 1 }, target: 'self' },
        modifierEffect('Blood Draw Tempo', 'cooldownTick', 99, 1, 'self', ['blood-draw'], { intent: 'helpful' }),
        prepareRefinedBonus('noritoshi-blood-draw'),
      ],
    }),
    skill({
      id: 'noritoshi-piercing-blood',
      name: 'Piercing Blood',
      description: 'This skill targets one enemy, dealing 20 damage. If used immediately after Blood Draw, it deals 35 piercing damage instead. The Refined Technique damage bonus applies to this skill.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 20,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'usedAbilityLastTurn', abilityId: 'noritoshi-blood-draw' }],
          effects: [{ type: 'damage', power: 35, target: 'inherit', piercing: true }],
          elseEffects: [{ type: 'damage', power: 20, target: 'inherit' }],
        },
        refinedBonusDamage(),
        prepareRefinedBonus('noritoshi-piercing-blood'),
      ],
    }),
    skill({
      id: 'noritoshi-crimson-binding',
      name: 'Crimson Binding',
      description: 'This skill targets one enemy, dealing 15 damage and sealing non-Strategic skills for 1 turn. If used immediately after Piercing Blood, it stuns all skills for 1 turn instead.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Ranged', 'Instant'],
      cooldown: 2,
      energyCost: { mental: 1 },
      power: 15,
      effects: [
        { type: 'damage', power: 15, target: 'inherit' },
        refinedBonusDamage(),
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'usedAbilityLastTurn', abilityId: 'noritoshi-piercing-blood' }],
          effects: [{ type: 'stun', duration: 1, target: 'inherit' }],
          elseEffects: [
            { type: 'classStun', duration: 1, blockedClasses: ['Physical', 'Energy', 'Affliction', 'Melee', 'Ranged', 'Mental', 'Special', 'Control', 'Piercing'], target: 'inherit' },
          ],
        },
        prepareRefinedBonus('noritoshi-crimson-binding'),
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'noritoshi-flowing-red-scale',
    name: 'Flowing Red Scale',
    description: 'Kamo becomes invulnerable for 1 turn. His next skill costs no energy.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'modifyAbilityCost', target: 'self', modifier: { mode: 'set', cost: {}, duration: 2, uses: 1, label: 'Flowing Red Scale' } },
    ],
  }),
})
