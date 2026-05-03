import { definePassive } from '@/features/battle/content.ts'
import { fighter, skill, markerEffect } from './_helpers.ts'

const rotDescription = 'If an enemy affected by Rot uses a new harmful skill, they will deal 5 less non-affliction damage for 1 turn. This skill stacks.'

const applyRot = (amount = 1) =>
  ({ type: 'adjustCounter' as const, key: 'rot', amount, min: 0, target: 'inherit' as const })

const impalingRushEffects = [
  { type: 'damage' as const, power: 10, piercing: true, target: 'inherit' as const },
  applyRot(1),
  { type: 'damageScaledByCounter' as const, counterKey: 'rot', powerPerStack: 5, consumeStacks: false, counterSource: 'target' as const, piercing: true, target: 'inherit' as const },
]

export const eso = fighter({
  id: 'eso',
  name: 'Eso',
  shortName: 'Eso',
  rarity: 'SR',
  role: 'Rot / Punish / Blood Technique',
  portraitFrame: { scale: 2.0, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'eso-shared-rot',
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
      id: 'eso-impaling-rush',
      name: 'Impaling Rush',
      description: 'This skill targets one enemy, dealing 10 piercing damage to them and applying 1 stack of Rot. For each stack of Rot on the target of this skill, it will deal 5 additional damage.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Piercing', 'Ranged', 'Instant'],
      intent: 'harmful',
      cooldown: 1,
      energyCost: { vow: 1 },
      power: 10,
      effects: impalingRushEffects,
    }),
    skill({
      id: 'eso-hostage-situation',
      name: 'Hostage Situation',
      description: 'This skill targets one enemy, stunning their harmful skills for 1 turn. The following turn, they will receive 15 piercing damage. During this time, each time a harmful skill is used on Eso, the target of Hostage Situation will receive an additional stack of Rot.',
      kind: 'debuff',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      intent: 'harmful',
      cooldown: 2,
      energyCost: { physical: 1 },
      effects: [
        { type: 'intentStun', intent: 'harmful', duration: 1, target: 'inherit' },
        { type: 'schedule', delay: 1, phase: 'roundStart', target: 'inherit', effects: [{ type: 'damage', power: 15, piercing: true, target: 'inherit' }] },
        {
          type: 'reaction',
          label: 'Hostage Situation',
          trigger: 'onBeingTargeted',
          duration: 1,
          harmfulOnly: true,
          consumeOnTrigger: false,
          target: 'self',
          effects: [{ type: 'adjustCounter', key: 'rot', amount: 1, min: 0, target: 'linked-target' }],
        },
      ],
    }),
    skill({
      id: 'eso-corrosive-blood',
      name: 'Corrosive Blood',
      description: 'This skill targets all enemies for 2 turns. On the first turn, any enemy who uses a new skill will have Impaling Rush activated on them; this effect is invisible. On the second turn, all enemies will receive 10 piercing damage for each stack of Rot on them, and removes all stacks of Rot afterwards.',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Special', 'Ranged', 'Instant', 'Action'],
      intent: 'harmful',
      cooldown: 3,
      energyCost: { vow: 1, random: 1 },
      effects: [
        {
          type: 'reaction',
          label: 'Corrosive Blood',
          trigger: 'onAbilityUse',
          duration: 1,
          newSkillOnly: true,
          visible: false,
          consumeOnTrigger: true,
          target: 'all-enemies',
          effects: impalingRushEffects,
        },
        {
          type: 'conditional',
          target: 'all-enemies',
          conditions: [{ type: 'fighterFlag', key: 'eso_blood_brothers', value: true }],
          effects: [{
            type: 'addModifier',
            target: 'inherit',
            modifier: {
              label: 'Blood Brothers',
              stat: 'cooldownTick',
              mode: 'flat',
              value: 0,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['corrosive-blood-preserve-rot'],
              visible: false,
              stacking: 'replace',
            },
          }],
        },
        {
          type: 'schedule',
          delay: 1,
          phase: 'roundStart',
          target: 'all-enemies',
          effects: [
            { type: 'damageScaledByCounter', counterKey: 'rot', powerPerStack: 10, consumeStacks: false, counterSource: 'target', piercing: true, target: 'inherit' },
            {
              type: 'conditional',
              target: 'inherit',
              conditions: [{ type: 'targetHasModifierTag', tag: 'corrosive-blood-preserve-rot' }],
              effects: [
                { type: 'removeModifier', filter: { tags: ['corrosive-blood-preserve-rot'] }, target: 'inherit' },
                { type: 'setFlag', key: 'eso_blood_brothers', value: false, target: 'self' },
              ],
              elseEffects: [{ type: 'resetCounter', key: 'rot', target: 'inherit' }],
            },
          ],
        },
      ],
    }),
  ],
  ultimate: skill({
    id: 'eso-blood-brothers',
    name: 'Blood Brothers',
    description: 'The next use of Corrosive Blood will no longer remove stacks of Rot. While this effect is active, each time a stack of Rot is applied to an enemy, Eso will gain 5 destructible defense; this effect stacks.',
    kind: 'utility',
    targetRule: 'self',
    classes: ['Strategic', 'Instant'],
    intent: 'helpful',
    cooldown: 4,
    energyCost: {},
    effects: [{ type: 'setFlag', key: 'eso_blood_brothers', value: true, target: 'self' }],
  }),
})
