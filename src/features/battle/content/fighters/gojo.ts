import { definePassive, defendSkill } from '@/features/battle/content.ts'
import { fighter, skill, markerEffect } from './_helpers.ts'

const RECENT_BLUE_MODE = 'recent_blue'
const RECENT_RED_MODE = 'recent_red'
const BLUE_RED_ALIGNED_MODE = 'blue_red_aligned'
const INFINITY_COLLAPSED_MODE = 'infinity_collapsed'
const INFINITY_GUARDED_MODE = 'infinity_guarded'

export const gojo = fighter({
  id: 'gojo',
  name: 'Satoru Gojo',
  shortName: 'Gojo',
  rarity: 'SSR',
  role: 'Denial-Control / Limitless Setup Payoff',
  portraitFrame: { scale: 2.08, y: '-12%' },
  maxHp: 100,
  passiveEffects: [
    definePassive({
      id: 'gojo-infinity',
      trigger: 'onRoundStart',
      effects: [{
        type: 'conditional',
        target: 'self',
        conditions: [{ type: 'actorModeIs', key: INFINITY_COLLAPSED_MODE, value: 'active' }],
        effects: [markerEffect('Infinity Collapsed', 1, 'self', ['infinity-collapsed'])],
        elseEffects: [
          { type: 'effectImmunity', label: 'Infinity', blocks: ['nonDamage'], duration: 1, tags: ['infinity'], target: 'self' },
          { type: 'invulnerable', duration: 1, target: 'self' },
          {
            type: 'reaction',
            label: 'Infinity Collapse',
            trigger: 'onBeingTargeted',
            duration: 1,
            harmfulOnly: true,
            consumeOnTrigger: true,
            target: 'self',
            effects: [{
              type: 'conditional',
              target: 'self',
              conditions: [{ type: 'actorModeIs', key: INFINITY_GUARDED_MODE, value: 'active' }],
              effects: [{ type: 'clearMode', key: INFINITY_GUARDED_MODE, target: 'self' }],
              elseEffects: [
                { type: 'setMode', key: INFINITY_COLLAPSED_MODE, value: 'active', duration: 1, target: 'self' },
                { type: 'removeModifier', filter: { statusKind: 'invincible' }, target: 'self' },
                { type: 'removeEffectImmunity', filter: { tag: 'infinity' }, target: 'self' },
              ],
            }],
          },
        ],
      }],
      label: 'Infinity',
      description: 'At round start, Gojo becomes invulnerable and ignores non-damage effects unless Infinity is collapsed. Harmful targeting collapses Infinity for the next round unless Six Eyes Focus is guarding it.',
      icon: { label: 'IN', tone: 'teal' },
    }),
  ],
  abilities: [
    skill({
      id: 'gojo-lapse-blue',
      name: 'Lapse: Blue',
      description: 'This skill targets one enemy, dealing 20 damage and applying Pulled for 2 turns. If the target is already Pulled, this skill deals 25 damage and refreshes Pulled.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Energy', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { mental: 1 },
      power: 20,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'targetHasModifierTag', tag: 'pulled' }],
          effects: [{ type: 'damage', power: 25, target: 'inherit' }],
          elseEffects: [{ type: 'damage', power: 20, target: 'inherit' }],
        },
        markerEffect('Pulled', 2, 'inherit', ['pulled']),
        { type: 'setMode', key: RECENT_BLUE_MODE, value: 'active', duration: 3, target: 'self' },
      ],
    }),
    skill({
      id: 'gojo-reversal-red',
      name: 'Reversal: Red',
      description: 'This skill targets one enemy, dealing 25 damage. If the target is Pulled, it deals 40 damage instead, stuns them for 1 turn, removes Pulled, and aligns Hollow Purple.',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Energy', 'Ranged', 'Instant'],
      cooldown: 1,
      energyCost: { physical: 1 },
      power: 25,
      effects: [
        {
          type: 'conditional',
          target: 'inherit',
          conditions: [{ type: 'targetHasModifierTag', tag: 'pulled' }],
          effects: [
            { type: 'damage', power: 40, target: 'inherit' },
            { type: 'stun', duration: 1, target: 'inherit' },
            { type: 'removeModifier', filter: { tags: ['pulled'] }, target: 'inherit' },
            { type: 'setMode', key: BLUE_RED_ALIGNED_MODE, value: 'active', duration: 3, target: 'self' },
          ],
          elseEffects: [{ type: 'damage', power: 25, target: 'inherit' }],
        },
        { type: 'setMode', key: RECENT_RED_MODE, value: 'active', duration: 3, target: 'self' },
      ],
    }),
    skill({
      id: 'gojo-hollow-purple',
      name: 'Hollow Purple',
      description: 'This skill can only be used after recent Lapse: Blue and Reversal: Red setup. It deals 30 piercing damage to all enemies, or 45 piercing damage if Red consumed Pulled.',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Energy', 'Ranged', 'Instant'],
      cooldown: 3,
      energyCost: { physical: 1, mental: 1, technique: 1 },
      power: 30,
      requiredActorConditions: [
        { type: 'actorModeIs', key: RECENT_BLUE_MODE, value: 'active' },
        { type: 'actorModeIs', key: RECENT_RED_MODE, value: 'active' },
      ],
      effects: [{
        type: 'conditional',
        target: 'self',
        conditions: [{ type: 'actorModeIs', key: BLUE_RED_ALIGNED_MODE, value: 'active' }],
        effects: [{ type: 'damage', power: 45, target: 'all-enemies', piercing: true, ignoresInvulnerability: true, ignoresShield: true }],
        elseEffects: [{ type: 'damage', power: 30, target: 'all-enemies', piercing: true }],
      }],
    }),
  ],
  ultimate: defendSkill({
    id: 'gojo-six-eyes-focus',
    name: 'Six Eyes Focus',
    description: 'Gojo becomes invulnerable for 1 turn. His next skill costs no energy, and the next harmful targeting will not collapse Infinity.',
    targetRule: 'self',
    classes: ['Strategic', 'Instant', 'Ultimate'],
    cooldown: 4,
    duration: 1,
    energyCost: { random: 1 },
    effects: [
      { type: 'invulnerable', duration: 1, target: 'self' },
      { type: 'modifyAbilityCost', target: 'self', modifier: { mode: 'set', cost: {}, duration: 2, uses: 1, label: 'Six Eyes Focus' } },
      { type: 'setMode', key: INFINITY_GUARDED_MODE, value: 'active', duration: 2, target: 'self' },
    ],
  }),
})
