import {
  defineAbility,
  defineFighter,
  definePassive,
  defendSkill,
  healSkill,
  type BattleFighterBoardMeta,
} from '@/features/battle/content.ts'
import { createContentSnapshot, readPublishedBattleContent } from '@/features/battle/contentSnapshot.ts'
import { assertValidBattleContent, validateBattleContent } from '@/features/battle/validation.ts'
import type { BattlefieldEffect, BattleFighterTemplate, BattleUserProfile } from '@/features/battle/types.ts'


const fighterBoardMeta: Record<string, BattleFighterBoardMeta> = {
  gojo: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Honored One',
    bio: "Tokyo Jujutsu High's strongest teacher. Gojo controls pace through denial, displacement, and overwhelming burst.",
    boardPortraitFrame: { scale: 2.56, x: '4%', y: '-20%' },
  },
  megumi: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Ten Shadows Strategist',
    bio: 'A tactical summoner who builds Shikigami pressure, then spends it for stronger control, sustain, and rescue plays.',
    boardPortraitFrame: { scale: 2.36, x: '-4%', y: '-18%' },
  },
  jogo: {
    affiliationLabel: 'Disaster Curses',
    battleTitle: 'Volcanic Curse',
    bio: 'A volatile blaster built around burn pressure, field-wide damage, and punishing slow teams.',
    boardPortraitFrame: { scale: 2.18, x: '0%', y: '-10%' },
  },
  yuji: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Vessel Striker',
    bio: 'Yuji wins exchanges through direct force, fast tempo, and explosive single-target finishers.',
    boardPortraitFrame: { scale: 2.28, x: '0%', y: '-14%' },
  },
  nobara: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Resonance Specialist',
    bio: 'Nobara converts steady chip into burst windows by tagging enemies and detonating those openings.',
    boardPortraitFrame: { scale: 2.28, x: '1%', y: '-14%' },
  },
  nanami: {
    affiliationLabel: 'Independent Sorcerer',
    battleTitle: 'Ratio Enforcer',
    bio: 'A durable precision fighter who becomes lethal once a target drops into execution range.',
    boardPortraitFrame: { scale: 2.16, x: '0%', y: '-16%' },
  },
  yuta: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Special Grade Prodigy',
    bio: 'Yuta flexes between healing, pressure, and late-round threat spikes with Rika in reserve.',
    boardPortraitFrame: { scale: 2.22, x: '0%', y: '-16%' },
  },
  todo: {
    affiliationLabel: 'Kyoto Campus',
    battleTitle: 'Best Friend',
    bio: 'Todo combines overwhelming physical strength with Boogie Woogie. By clapping his hands, he can instantly swap positions, disrupting enemies and creating openings for devastating attacks.',
    boardPortraitFrame: { scale: 2.14, x: '4%', y: '-14%' },
  },
  hanami: {
    affiliationLabel: 'Disaster Curses',
    battleTitle: 'Cursed Spirit',
    bio: 'A cursed spirit embodying the fear of nature, Hanami uses plant-based techniques to suppress enemies and endure prolonged combat.',
    boardPortraitFrame: { scale: 2.06, x: '0%', y: '-12%' },
  },
  junpei: {
    affiliationLabel: 'Independent Sorcerer',
    battleTitle: 'Moon Dregs Tactician',
    bio: 'Junpei fights with Moon Dregs, a jellyfish shikigami that injects poison. His attacks punish reckless action rather than overwhelm directly.',
    boardPortraitFrame: { scale: 2.04, x: '0%', y: '-10%' },
  },
  mahito: {
    affiliationLabel: 'Disaster Curses',
    battleTitle: 'Soul Sculptor',
    bio: 'Mahito reshapes the soul through direct contact. Each interaction deepens his understanding of his opponent, making him more dangerous as the fight drags on.',
    boardPortraitFrame: { scale: 2.08, x: '0%', y: '-12%' },
  },
  miwa: {
    affiliationLabel: 'Kyoto Campus',
    battleTitle: 'Simple Domain',
    bio: 'Kasumi Miwa is a disciplined swordswoman who uses Simple Domain to neutralize techniques and force straightforward, honest combat.',
    boardPortraitFrame: { scale: 2.14, x: '0%', y: '-14%' },
  },
  mai: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Reserved Fire',
    bio: 'Mai fights with a cursed revolver, creating bullets through her technique at great cost. Every shot has to count.',
    boardPortraitFrame: { scale: 2.06, x: '0%', y: '-12%' },
  },
  ijichi: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Barrier Specialist',
    bio: 'Kiyotaka Ijichi specializes in deploying barriers that regulate the battlefield, restricting enemies and reinforcing his allies.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
}

function fighter(
  template: Omit<
    BattleFighterTemplate,
    'affiliationLabel' | 'battleTitle' | 'bio' | 'boardPortraitSrc' | 'boardPortraitFrame'
  >,
): BattleFighterTemplate {
  return defineFighter(template, fighterBoardMeta[template.id])
}

const skill = defineAbility

export const PASS_ABILITY_ID = 'pass'

export const battleBoardProfiles: Record<'player' | 'enemy', BattleUserProfile> = {
  player: {
    username: 'JEREMY',
    title: 'Tokyo Student',
    initials: 'JE',
    accent: 'teal',
  },
  enemy: {
    username: 'APAAP',
    title: 'Academy Student',
    initials: 'AA',
    accent: 'red',
  },
}

export const battlePassAbility = defineAbility({
  id: PASS_ABILITY_ID,
  name: 'Hold Position',
  description: 'Spend this slot to conserve cursed energy and wait for a cleaner opening.',
  kind: 'pass',
  targetRule: 'none',
  classes: ['Instant', 'Unique'],
  icon: { label: 'PA', tone: 'frost' },
  cooldown: 0,
})

export const battlefieldEffect: BattlefieldEffect = {
  id: 'domain-temple',
  name: 'Domain Expansion',
  label: 'Temple Barrier',
  description:
    'Ultimate techniques surge with the barrier. Once the fight drags on, the arena starts crushing both teams with fatigue damage.',
  potency: 67,
  ultimateDamageBoost: 0.12,
  fatigueStartsRound: 7,
}

export const authoredBattleRoster: BattleFighterTemplate[] = [
  fighter({
    id: 'yuji',
    name: 'Yuji Itadori',
    shortName: 'Yuji',
    rarity: 'SSR',
    role: 'Striker / Transformation',
    portraitFrame: { scale: 2.06, y: '-10%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'yuji-sukuna-vessel',
        trigger: 'onTakeDamage',
        conditions: [
          { type: 'selfHpBelow', threshold: 0.1 },
          { type: 'fighterFlag', key: 'sukuna_vessel_used', value: false },
        ],
        effects: [
          { type: 'setFlag', key: 'sukuna_vessel_used', value: true, target: 'self' },
          { type: 'setHpFromCounter', base: 10, counterKey: 'sukuna_bonus_hp', target: 'self' },
          {
            type: 'addModifier',
            target: 'self',
            modifier: {
              label: 'Sukuna Manifested',
              stat: 'isUndying',
              mode: 'set',
              value: true,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['sukuna-vessel'],
              visible: true,
              stacking: 'replace',
            },
          },
          {
            type: 'replaceAbilities',
            target: 'self',
            replacements: [
              {
                slotAbilityId: 'yuji-divergent-fist',
                duration: 1,
                ability: skill({
                  id: 'yuji-sukuna-cleave',
                  name: 'Sukuna: Cleave',
                  description: 'Sukuna tears through one enemy for overwhelming damage.',
                  kind: 'attack',
                  targetRule: 'enemy-single',
                  classes: ['Melee', 'Physical', 'Instant'],
                  cooldown: 0,
                  energyCost: {},
                  power: 45,
                  effects: [{ type: 'damage', power: 45, target: 'inherit', cannotBeCountered: true, cannotBeReflected: true }],
                  cannotBeCountered: true,
                  cannotBeReflected: true,
                }),
              },
              {
                slotAbilityId: 'yuji-cursed-rush',
                duration: 1,
                ability: skill({
                  id: 'yuji-sukuna-dismantle',
                  name: 'Sukuna: Dismantle',
                  description: 'Sukuna cuts across every enemy.',
                  kind: 'attack',
                  targetRule: 'enemy-all',
                  classes: ['Ranged', 'Physical', 'Instant'],
                  cooldown: 0,
                  energyCost: {},
                  power: 30,
                  effects: [{ type: 'damage', power: 30, target: 'all-enemies', cannotBeCountered: true, cannotBeReflected: true }],
                  cannotBeCountered: true,
                  cannotBeReflected: true,
                }),
              },
              {
                slotAbilityId: 'yuji-black-flash',
                duration: 1,
                ability: skill({
                  id: 'yuji-sukuna-domain-cut',
                  name: 'Sukuna: Domain Cut',
                  description: 'Sukuna finishes one enemy with a decisive slash.',
                  kind: 'attack',
                  targetRule: 'enemy-single',
                  classes: ['Melee', 'Physical', 'Instant'],
                  cooldown: 0,
                  energyCost: {},
                  power: 60,
                  effects: [{ type: 'damage', power: 60, target: 'inherit', cannotBeCountered: true, cannotBeReflected: true }],
                  cannotBeCountered: true,
                  cannotBeReflected: true,
                }),
              },
            ],
          },
        ],
        label: "Sukuna's Vessel",
        description: "The first time Yuji drops below 10 health, Sukuna manifests for one turn, Yuji cannot be defeated, and his health becomes 10 plus all accumulated transformation bonuses.",
        icon: { label: 'SV', tone: 'red' },
        counterKey: 'sukuna_bonus_hp',
      }),
    ],
    abilities: [
      skill({
        id: 'yuji-divergent-fist',
        name: 'Divergent Fist',
        description: "Targets one enemy, dealing 25 damage and increasing Yuji's transformation health gain by 5. This effect stacks.",
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Melee', 'Instant'],
        cooldown: 1,
        energyCost: { random: 1 },
        power: 25,
        effects: [
          { type: 'damage', power: 25, target: 'inherit' },
          { type: 'adjustCounter', key: 'sukuna_bonus_hp', amount: 5, target: 'self' },
        ],
      }),
      skill({
        id: 'yuji-cursed-rush',
        name: 'Cursed Rush',
        description: "Deals 10 damage to one random enemy each turn for 3 turns. If an enemy is struck twice from a single use, Yuji's transformation health gain increases by 5. This effect stacks.",
        kind: 'attack',
        targetRule: 'self',
        classes: ['Physical', 'Melee', 'Action'],
        cooldown: 5,
        energyCost: { random: 2 },
        effects: [{ type: 'randomEnemyDamageOverTime', power: 10, duration: 3, historyKey: 'cursed-rush', repeatCounterKey: 'sukuna_bonus_hp', repeatCounterAmount: 5, target: 'self' }],
      }),
      skill({
        id: 'yuji-black-flash',
        name: 'Black Flash',
        description: "Targets one enemy, dealing 20 damage to them and 5 damage to all other enemies. For one turn, if the main target uses a harmful skill, Yuji's transformation health gain increases by 5. This effect stacks.",
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Melee', 'Instant'],
        cooldown: 1,
        energyCost: { random: 2 },
        power: 20,
        effects: [
          { type: 'damage', power: 20, target: 'inherit' },
          { type: 'damage', power: 5, target: 'other-enemies' },
          {
            type: 'addModifier',
            target: 'inherit',
            modifier: {
              label: 'Black Flash Pressure',
              stat: 'cooldownTick',
              mode: 'flat',
              value: 0,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['yuji-sukuna-bonus-on-harmful-skill'],
              visible: true,
              stacking: 'stack',
            },
          },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'yuji-brink-control',
      name: 'Brink Control',
      description: "Yuji becomes invulnerable for 1 turn. If Yuji takes damage while invulnerable, his transformation health gain increases by 5. This effect stacks.",
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      energyCost: { random: 1 },
      effects: [
        { type: 'invulnerable', duration: 1, target: 'self' },
        {
          type: 'addModifier',
          target: 'self',
          modifier: {
            label: 'Brink Control Bonus',
            stat: 'cooldownTick',
            mode: 'flat',
            value: 0,
            duration: { kind: 'rounds', rounds: 1 },
            tags: ['yuji-sukuna-bonus-on-blocked-damage'],
            visible: true,
            stacking: 'replace',
          },
        },
      ],
    }),
  }),
  fighter({
    id: 'nobara',
    name: 'Nobara Kugisaki',
    shortName: 'Nobara',
    rarity: 'SR',
    role: 'Debuff / Punish',
    portraitFrame: { scale: 2.08, y: '-10%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'nobara-straw-doll-ritual-loop',
        trigger: 'onRoundStart',
        conditions: [{ type: 'fighterFlag', key: 'straw_doll_ritual_active', value: true }],
        effects: [
          { type: 'damage', power: 5, target: 'all-enemies' },
          { type: 'adjustCounter', key: 'straw_doll_damage_taken', amount: 1, target: 'all-enemies' },
          { type: 'shield', amount: 5, label: 'Straw Doll Guard', tags: ['straw-doll-ritual'], target: 'self' },
        ],
        label: 'Straw Doll Ritual Loop',
        hidden: true,
      }),
      definePassive({
        id: 'nobara-hairpin-opening',
        trigger: 'onBeingTargeted',
        conditions: [{ type: 'fighterFlag', key: 'straw_doll_ritual_active', value: true }],
        effects: [
          {
            type: 'addModifier',
            target: 'attacker',
            modifier: {
              label: 'Hairpin Opening',
              stat: 'cooldownTick',
              mode: 'flat',
              value: 0,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['nobara-hairpin-targetable'],
              visible: true,
              stacking: 'replace',
            },
          },
        ],
        label: 'Hairpin Opening',
        hidden: true,
      }),
      definePassive({
        id: 'nobara-straw-effigy',
        trigger: 'onDealDamage',
        conditions: [{ type: 'abilityClass', class: 'Physical' }],
        effects: [
          {
            type: 'addModifier',
            target: 'inherit',
            modifier: {
              label: 'Straw Effigy',
              stat: 'cooldownTick',
              mode: 'flat',
              value: 0,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['nobara-straw-effigy'],
              visible: true,
              stacking: 'replace',
            },
          },
        ],
        label: 'Straw Effigy',
        description: 'Whenever an enemy takes damage from Nobara skills, they gain Straw Effigy for 1 turn. If an enemy with Straw Effigy uses a skill, they receive 5 damage.',
        icon: { label: 'SE', tone: 'red' },
      }),
    ],
    abilities: [
      skill({
        id: 'nobara-straw-doll-ritual',
        name: 'Straw Doll Ritual',
        description: 'For the rest of the game, each turn all enemies take 5 damage and receive 5 less healing. Nobara gains 5 destructible defense each turn. While active, enemies who use a skill on Nobara can be targeted by Hairpin for 1 turn.',
        kind: 'utility',
        targetRule: 'self',
        classes: ['Special', 'Ranged', 'Instant'],
        cooldown: 4,
        energyCost: { physical: 1, mental: 1 },
        effects: [
          { type: 'setFlag', key: 'straw_doll_ritual_active', value: true, target: 'self' },
          {
            type: 'addModifier',
            target: 'all-enemies',
            modifier: {
              label: 'Straw Doll Ritual Healing Curse',
              stat: 'healTaken',
              mode: 'flat',
              value: -5,
              duration: { kind: 'permanent' },
              tags: ['straw-doll-ritual'],
              visible: true,
              stacking: 'replace',
            },
          },
        ],
      }),
      skill({
        id: 'nobara-hammer-and-nails',
        name: 'Hammer & Nails',
        description: 'Targets one enemy, dealing 20 damage. For the next two turns, they receive an additional 5 damage from Straw Doll Ritual. During this time, Hairpin can be used on them.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Ranged', 'Instant'],
        cooldown: 1,
        energyCost: { technique: 1 },
        power: 20,
        effects: [
          { type: 'damage', power: 20, target: 'inherit' },
          { type: 'adjustCounter', key: 'straw_doll_damage_taken', amount: 1, target: 'inherit' },
          {
            type: 'addModifier',
            target: 'inherit',
            modifier: {
              label: 'Hairpin Opening',
              stat: 'cooldownTick',
              mode: 'flat',
              value: 0,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['nobara-hairpin-targetable'],
              visible: true,
              stacking: 'replace',
            },
          },
        ],
      }),
      skill({
        id: 'nobara-hairpin',
        name: 'Hairpin',
        description: 'Deals 15 damage to all applicable enemies and increases the damage they receive from Straw Doll Ritual permanently by 5.',
        kind: 'attack',
        targetRule: 'enemy-all',
        classes: ['Physical', 'Ranged', 'Instant'],
        cooldown: 1,
        energyCost: {},
        power: 15,
        effects: [
          { type: 'damageFiltered', power: 15, requiresTag: 'nobara-hairpin-targetable', target: 'all-enemies' },
          { type: 'damageScaledByCounter', counterKey: 'straw_doll_damage_taken', counterSource: 'target', powerPerStack: 5, consumeStacks: false, requiresTag: 'nobara-hairpin-targetable', target: 'all-enemies' },
          { type: 'adjustCounter', key: 'straw_doll_damage_taken', amount: 1, requiresTag: 'nobara-hairpin-targetable', target: 'all-enemies' },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'nobara-straw-guard',
      name: 'Straw Guard',
      description: 'Nobara becomes invulnerable for 1 turn.',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      energyCost: { random: 1 },
    }),
  }),
  fighter({
    id: 'megumi',
    name: 'Megumi Fushiguro',
    shortName: 'Megumi',
    rarity: 'SSR',
    role: 'Controller / Setup',
    portraitFrame: { scale: 2.14, y: '-14%' },
    maxHp: 96,
    passiveEffects: [
      definePassive({
        id: 'megumi-ten-shadows-strategist',
        trigger: 'onRoundStart',
        effects: [{ type: 'adjustCounter', key: 'shikigami', amount: 1, target: 'self' }],
        label: 'Ten Shadows Strategist',
        description: 'At the start of each turn, Megumi gains 1 Shikigami. His Divine Dogs, Nue, and Shadow Recall skills empower or consume Shikigami when used at 3 or more stacks.',
        icon: { label: 'TS', tone: 'teal' },
        counterKey: 'shikigami',
      }),
      definePassive({
        id: 'megumi-divine-dogs-pack',
        trigger: 'onAbilityResolve',
        conditions: [
          { type: 'abilityId', abilityId: 'megumi-dogs' },
          { type: 'counterAtLeast', key: 'shikigami', value: 4 },
        ],
        effects: [
          { type: 'damage', power: 15, target: 'inherit' },
          { type: 'classStun', duration: 1, blockedClasses: ['Physical'], target: 'inherit' },
          { type: 'adjustCounter', key: 'shikigami', amount: -2, target: 'self' },
        ],
        label: 'Divine Dogs Pack Hunt',
        description: 'With more than 3 Shikigami, Divine Dogs also seals Physical skills for 1 turn and consumes 2 Shikigami.',
        hidden: true,
      }),
      definePassive({
        id: 'megumi-nue-overhead-drop',
        trigger: 'onAbilityResolve',
        conditions: [
          { type: 'abilityId', abilityId: 'megumi-nue' },
          { type: 'counterAtLeast', key: 'shikigami', value: 4 },
        ],
        effects: [
          { type: 'damage', power: 10, target: 'inherit' },
          { type: 'stun', duration: 1, target: 'inherit' },
          { type: 'adjustCounter', key: 'shikigami', amount: -3, target: 'self' },
        ],
        label: 'Nue Overhead Drop',
        description: 'With more than 3 Shikigami, Nue deals 10 additional damage, fully stuns the target for 1 turn, and consumes 3 Shikigami.',
        hidden: true,
      }),
      definePassive({
        id: 'megumi-shadow-recall-surge',
        trigger: 'onAbilityResolve',
        conditions: [
          { type: 'abilityId', abilityId: 'megumi-shadow-recall' },
          { type: 'counterAtLeast', key: 'shikigami', value: 3 },
        ],
        effects: [
          { type: 'heal', power: 10, target: 'self' },
          { type: 'adjustCounter', key: 'shikigami', amount: -3, target: 'self' },
        ],
        label: 'Shadow Recall Surge',
        description: 'If Megumi has 3 or more Shikigami, Shadow Recall heals 10 additional health and consumes 3 Shikigami.',
        hidden: true,
      }),
    ],
    abilities: [
      skill({
        id: 'megumi-dogs',
        name: 'Divine Dogs: Pursuit',
        description: 'Deals 5 damage to one enemy. If Megumi has more than 3 Shikigami, this skill deals 15 additional damage, seals Physical skills for 1 turn, and consumes 2 Shikigami.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Melee', 'Physical', 'Instant'],
        cooldown: 0,
        energyCost: { physical: 1 },
        power: 5,
        effects: [{ type: 'damage', power: 5, target: 'inherit' }],
      }),
      skill({
        id: 'megumi-nue',
        name: 'Nue: Electric Drop',
        description: 'Deals 25 damage to one enemy and seals their non-Mental skills for 1 turn. If Megumi has more than 3 Shikigami, this skill deals 10 additional damage, fully stuns the target for 1 turn, and consumes 3 Shikigami.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Ranged', 'Energy', 'Instant'],
        cooldown: 2,
        energyCost: { technique: 1, random: 1 },
        power: 25,
        effects: [
          { type: 'damage', power: 25, target: 'inherit' },
          { type: 'classStun', duration: 1, blockedClasses: ['Physical', 'Energy', 'Affliction', 'Melee', 'Ranged', 'Unique'], target: 'inherit' },
        ],
      }),
      healSkill({
        id: 'megumi-shadow-recall',
        name: 'Shadow Recall',
        description: 'Megumi recovers 15 health. If Megumi has 3 or more Shikigami, he heals 10 additional health and consumes 3 Shikigami.',
        targetRule: 'self',
        classes: ['Unique', 'Mental', 'Instant'],
        cooldown: 0,
        energyCost: { random: 1 },
        healPower: 15,
      }),
    ],
    ultimate: defendSkill({
      id: 'megumi-toad',
      name: 'Toad: Shadow Rescue',
      description: 'Makes Megumi or one ally invulnerable for 1 turn. Megumi gains 1 Shikigami.',
      targetRule: 'ally-single',
      classes: ['Unique', 'Mental', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      energyCost: { random: 1 },
      effects: [
        { type: 'invulnerable', duration: 1, target: 'inherit' },
        { type: 'adjustCounter', key: 'shikigami', amount: 1, target: 'self' },
      ],
    }),
  }),
]

export const authoredDefaultBattleSetup = {
  playerTeamIds: ['yuji', 'nobara', 'megumi'],
  enemyTeamIds: ['yuji', 'nobara', 'megumi'],
}

assertValidBattleContent(authoredBattleRoster, authoredDefaultBattleSetup)

export const authoredBattleContent: ReturnType<typeof createContentSnapshot> = {
  ...createContentSnapshot(authoredBattleRoster, authoredDefaultBattleSetup),
  updatedAt: 0,
}

const publishedBattleContent = readPublishedBattleContent(authoredBattleContent)
const publishedBattleValidation = validateBattleContent(
  publishedBattleContent.roster,
  publishedBattleContent.defaultSetup,
)

if (publishedBattleValidation.errors.length > 0 && typeof console !== 'undefined') {
  console.warn('Ignoring invalid published battle content.', publishedBattleValidation.errors)
}

const runtimeBattleContent =
  publishedBattleValidation.errors.length === 0 ? publishedBattleContent : authoredBattleContent

export const battleRoster: BattleFighterTemplate[] = runtimeBattleContent.roster

export const battleRosterById = Object.fromEntries(
  battleRoster.map((fighterData) => [fighterData.id, fighterData]),
) as Record<string, BattleFighterTemplate>

export const defaultBattleSetup = {
  battlefield: battlefieldEffect,
  playerTeamIds: runtimeBattleContent.defaultSetup.playerTeamIds,
  enemyTeamIds: runtimeBattleContent.defaultSetup.enemyTeamIds,
}

