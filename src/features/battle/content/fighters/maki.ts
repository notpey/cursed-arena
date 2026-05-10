import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, modifierEffect } from './_helpers.ts'

const MAKI_SKILL_USES_COUNTER = 'maki_skill_uses'
const MAKI_WEAPON_BONUS_COUNTER = 'maki_weapon_bonus'
const WEAPON_MASTERY_MODE = 'weapon_mastery'
const weaponMasteryCondition = { type: 'actorModeIs' as const, key: WEAPON_MASTERY_MODE, value: 'active' }

const makiWeaponBonusDamage = (target: 'inherit' | 'all-enemies') => ({
  type: 'damageScaledByCounter' as const,
  counterKey: MAKI_WEAPON_BONUS_COUNTER,
  counterSource: 'actor' as const,
  powerPerStack: 1,
  consumeStacks: false,
  target,
})

const resetMakiWeaponBonus = { type: 'resetCounter' as const, key: MAKI_WEAPON_BONUS_COUNTER, target: 'self' as const }

const makiMasteryCost = (abilityId: string) => ({
  type: 'modifyAbilityCost' as const,
  target: 'self' as const,
  modifier: {
    label: 'Weapon Mastery Cost',
    abilityId,
    mode: 'increaseRandom' as const,
    amount: 1,
    duration: 99,
  },
})

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
      id: 'maki-weapon-mastery-tracker',
      trigger: 'onAbilityResolve',
      effects: [{ type: 'adjustCounter', key: MAKI_SKILL_USES_COUNTER, amount: 1, target: 'self' }],
      label: 'Weapon Mastery Tracker',
      hidden: true,
    }),
    definePassive({
      id: 'maki-weapon-mastery',
      trigger: 'onTakeDamage',
      conditions: [
        { type: 'selfHpBelow', threshold: 0.7 },
        { type: 'counterAtLeast', key: MAKI_SKILL_USES_COUNTER, value: 3 },
        { type: 'fighterFlag', key: 'maki_weapon_mastery_used', value: false },
      ],
      effects: [
        { type: 'setFlag', key: 'maki_weapon_mastery_used', value: true, target: 'self' },
        { type: 'setMode', key: WEAPON_MASTERY_MODE, value: 'active', target: 'self' },
        makiMasteryCost('maki-sweeping-polearm'),
        makiMasteryCost('maki-close-quarters-combo'),
        makiMasteryCost('maki-playful-cloud-strike'),
      ],
      label: 'Weapon Mastery',
      description: 'When Maki reaches 70 or fewer health after using at least 3 skills, her delayed weapon damage becomes immediate and her damaging skills cost 1 additional random energy.',
      icon: { label: 'WM', tone: 'red' },
    }),
  ],
  abilities: [
    skill({
      id: 'maki-sweeping-polearm',
      name: 'Sweeping Polearm',
      description: 'This skill deals 10 damage to all enemies and 5 damage to them at the next round start. For 1 round, enemies that target Maki with harmful skills take 10 damage. During Weapon Mastery, the follow-up damage is dealt immediately instead.',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Physical', 'Melee', 'Action'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 10,
      effects: [
        { type: 'damage', power: 10, target: 'all-enemies' },
        makiWeaponBonusDamage('all-enemies'),
        {
          type: 'conditional',
          target: 'self',
          conditions: [weaponMasteryCondition],
          effects: [{ type: 'damage', power: 5, target: 'all-enemies' }],
          elseEffects: [{ type: 'schedule', delay: 1, phase: 'roundStart', target: 'all-enemies', effects: [{ type: 'damage', power: 5, target: 'inherit' }] }],
        },
        resetMakiWeaponBonus,
        {
          type: 'reaction',
          label: 'Sweeping Polearm',
          trigger: 'onBeingTargeted',
          duration: 1,
          harmfulOnly: true,
          consumeOnTrigger: false,
          target: 'self',
          effects: [{ type: 'damage', power: 10, target: 'attacker' }],
        },
      ],
    }),
    skill({
      id: 'maki-close-quarters-combo',
      name: 'Close-Quarters Combo',
      description: 'This skill deals 15 damage to one enemy and 15 damage to them at the next round start. Maki takes 10 less damage for 1 round. During Weapon Mastery, the follow-up damage is dealt immediately instead.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Action'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 15,
      effects: [
        { type: 'damage', power: 15, target: 'inherit' },
        makiWeaponBonusDamage('inherit'),
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [weaponMasteryCondition],
          effects: [{ type: 'damage', power: 15, target: 'inherit' }],
          elseEffects: [{ type: 'schedule', delay: 1, phase: 'roundStart', target: 'inherit', effects: [{ type: 'damage', power: 15, target: 'inherit' }] }],
        },
        resetMakiWeaponBonus,
        modifierEffect('Close-Quarters Guard', 'damageTaken', -10, 1, 'self', ['close-quarters-combo']),
      ],
    }),
    skill({
      id: 'maki-playful-cloud-strike',
      name: 'Playful Cloud Strike',
      description: 'This skill deals 20 damage to one enemy and 20 damage to them at the next round start, ignoring invulnerability. Maki gains +5 damage on her next damaging skill, stacking. During Weapon Mastery, the follow-up damage is dealt immediately instead.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Action'],
      cooldown: 2,
      energyCost: { physical: 1, technique: 1 },
      power: 20,
      effects: [
        { type: 'damage', power: 20, target: 'inherit', ignoresInvulnerability: true },
        makiWeaponBonusDamage('inherit'),
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [weaponMasteryCondition],
          effects: [{ type: 'damage', power: 20, target: 'inherit', ignoresInvulnerability: true }],
          elseEffects: [{ type: 'schedule', delay: 1, phase: 'roundStart', target: 'inherit', effects: [{ type: 'damage', power: 20, target: 'inherit', ignoresInvulnerability: true }] }],
        },
        resetMakiWeaponBonus,
        { type: 'adjustCounter', key: MAKI_WEAPON_BONUS_COUNTER, amount: 5, target: 'self' },
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
