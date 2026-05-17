import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, modifierEffect, skill } from './_helpers.ts'

const yujiBlackFlash = skill({
  id: 'yuji-black-flash',
  name: 'Black Flash',
  description: 'This skill deals 20 damage to one enemy plus 1 additional damage for each Black Flash bonus Yuji has. If his Black Flash bonus is 20 or more, the target is stunned for 1 turn.',
  kind: 'attack',
  targetRule: 'enemy-single',
  requiredActorConditions: [{ type: 'actorModeIs', key: 'soul_charge', value: 'active' }],
  classes: ['Special', 'Melee', 'Instant'],
  cooldown: 1,
  energyCost: { vow: 1, random: 1 },
  power: 20,
  effects: [
    { type: 'damage', power: 20, target: 'inherit' },
    { type: 'damageScaledByCounter', counterKey: 'yuji_black_flash_bonus', counterSource: 'actor', powerPerStack: 1, consumeStacks: false, target: 'inherit' },
    {
      type: 'conditional',
      target: 'inherit',
      conditions: [{ type: 'counterAtLeast', key: 'yuji_black_flash_bonus', value: 20 }],
      effects: [{ type: 'stun', duration: 1, target: 'inherit' }],
    },
  ],
})

export const yuji = fighter({
  id: 'yuji',
  name: 'Yuji Itadori',
  shortName: 'Yuji',
  rarity: 'SSR',
  role: 'Beginner Brawler / Setup Payoff',
  portraitFrame: { scale: 2.06, y: '-10%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'yuji-sukuna-vessel',
      trigger: 'onTakeDamage',
      conditions: [
        { type: 'selfHpBelow', threshold: 0.5 },
        { type: 'fighterFlag', key: 'sukuna_vessel_used', value: false },
      ],
      effects: [
        { type: 'setFlag', key: 'sukuna_vessel_used', value: true, target: 'self' },
        {
          type: 'addModifier',
          target: 'self',
          intent: 'helpful',
          modifier: {
            label: "Sukuna's Vessel",
            stat: 'damageTaken',
            mode: 'percentAdd',
            value: -0.25,
            duration: { kind: 'permanent' },
            tags: ['sukuna-vessel'],
            visible: true,
            stacking: 'replace',
          },
        },
      ],
      label: "Sukuna's Vessel",
      description: 'When Yuji reaches 50 health for the first time, Sukuna awakens and Yuji permanently takes 25% less non-piercing damage.',
      icon: { label: 'SV', tone: 'red' },
    }),
  ],
  abilities: [
    skill({
      id: 'yuji-divergent-fist',
      name: 'Divergent Fist',
      description: 'This skill deals 20 damage to one enemy. During Soul Charge, it deals 5 additional damage and increases Black Flash damage by 5.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      cooldown: 0,
      energyCost: { physical: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit' },
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'actorModeIs', key: 'soul_charge', value: 'active' }],
          effects: [
            { type: 'damage', power: 5, target: 'inherit' },
            { type: 'adjustCounter', key: 'yuji_black_flash_bonus', amount: 5, target: 'self' },
          ],
        },
      ],
    }),
    yujiBlackFlash,
    skill({
      id: 'yuji-soul-charge',
      name: 'Soul Charge',
      description: 'For 4 turns, Divergent Fist is improved and Black Flash may be used. Yuji gains 10 damage reduction, and each time he is targeted by a harmful skill, his Black Flash bonus increases by 5.',
      kind: 'buff',
      targetRule: 'self',
      classes: ['Strategic', 'Instant'],
      cooldown: 3,
      energyCost: { random: 1 },
      effects: [
        { type: 'setMode', key: 'soul_charge', value: 'active', duration: 4, target: 'self' },
        modifierEffect('Soul Charge Guard', 'damageTaken', -10, 4, 'self', ['soul-charge'], { intent: 'helpful' }),
        modifierEffect('Soul Charge Suppression', 'canReduceDamageTaken', false, 4, 'all-enemies', ['soul-charge-suppression'], { intent: 'harmful' }),
        modifierEffect('Soul Charge Suppression', 'canGainInvulnerable', false, 4, 'all-enemies', ['soul-charge-suppression'], { intent: 'harmful' }),
        {
          type: 'reaction',
          target: 'self',
          label: 'Soul Charge Focus',
          trigger: 'onBeingTargeted',
          duration: 4,
          harmfulOnly: true,
          newSkillOnly: true,
          consumeOnTrigger: false,
          effects: [{ type: 'adjustCounter', key: 'yuji_black_flash_bonus', amount: 5, target: 'self' }],
        },
      ],
    }),
  ],
  ultimate: defendSkill({
    id: 'yuji-indomitable-spirit',
    name: 'Indomitable Spirit',
    description: 'Yuji becomes invulnerable for 1 turn.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
  }),
})
