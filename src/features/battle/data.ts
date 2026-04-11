import gojoRender from '@/assets/renders/Satoru_Gojo_Cursed_Clash.webp'
import yujiRender from '@/assets/renders/Yuji_Itadori_Cursed_Clash.webp'
import megumiRender from '@/assets/renders/Megumi_Fushiguro_Cursed_Clash.webp'
import nobaraRender from '@/assets/renders/Nobara_Kugisaki_Cursed_Clash.webp'
import jogoRender from '@/assets/renders/Jogo_Cursed_Clash.webp'
import nanamiRender from '@/assets/renders/Kento_Nanami_Cursed_Clash.webp'
import yutaRender from '@/assets/renders/Yuta_Okkotsu_Cursed_Clash.webp'
import todoRender from '@/assets/renders/Aoi_Todo_Cursed_Clash.webp'
import {
  damageSkill,
  debuffSkill,
  defineAbility,
  defineFighter,
  definePassive,
  defendSkill,
  healSkill,
  utilitySkill,
  type BattleFighterBoardMeta,
} from '@/features/battle/content'
import { createContentSnapshot, readPublishedBattleContent } from '@/features/battle/contentStore'
import { assertValidBattleContent, validateBattleContent } from '@/features/battle/validation'
import type { BattlefieldEffect, BattleFighterTemplate, BattleUserProfile } from '@/features/battle/types'


const fighterBoardMeta: Record<string, BattleFighterBoardMeta> = {
  gojo: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Honored One',
    bio: "Tokyo Jujutsu High's strongest teacher. Gojo controls pace through denial, displacement, and overwhelming burst.",
    boardPortraitFrame: { scale: 2.56, x: '4%', y: '-20%' },
  },
  megumi: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Ten Shadows User',
    bio: 'A tactical summoner who trades raw pressure for control, utility, and flexible ally support.',
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
    battleTitle: 'Battle Maniac',
    bio: 'Todo is a bruiser who thrives on rhythm, heavy hits, and tempo swings that crack open defenses.',
    boardPortraitFrame: { scale: 2.14, x: '4%', y: '-14%' },
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
  tags: ['UTILITY'],
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
    id: 'gojo',
    name: 'Satoru Gojo',
    shortName: 'Gojo',
    rarity: 'SSR',
    role: 'Blaster / Control',
    renderSrc: gojoRender,
    portraitFrame: { scale: 2.24, y: '-18%' },
    maxHp: 112,
    passiveEffects: [definePassive({
      trigger: 'whileAlive',
      effects: [{ type: 'cooldownReduction', amount: 1, target: 'self' }],
      label: 'Six Eyes',
    })],
    abilities: [
      defendSkill({
        id: 'gojo-infinity',
        name: 'Infinity',
        description: 'Negates incoming damage until the round ends.',
        targetRule: 'self',
        tags: ['UTILITY'],
        cooldown: 3,
        duration: 1,
      }),
      damageSkill({
        id: 'gojo-red',
        name: 'Red - Reversal',
        description: 'A compressed blast that deletes one target.',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 2,
        power: 58,
      }),
      skill({
        id: 'gojo-blue',
        name: 'Blue - Lapse',
        description: 'Pulls a target into point-blank pressure and stuns them.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK', 'DEBUFF'],
        cooldown: 3,
        power: 48,
        statusTurns: 1,
        effects: [
          { type: 'damage', power: 48, target: 'inherit' },
          { type: 'stun', duration: 1, target: 'inherit' },
        ],
      }),
    ],
    ultimate: skill({
      id: 'gojo-hollow-purple',
      name: 'Hollow Purple',
      description: 'Erases the entire enemy line with catastrophic force.',
      kind: 'attack',
      targetRule: 'enemy-all',
      tags: ['ATK', 'ULT'],
      cooldown: 5,
      power: 76,
      effects: [{ type: 'damage', power: 76, target: 'all-enemies' }],
    }),
  }),
  fighter({
    id: 'megumi',
    name: 'Megumi Fushiguro',
    shortName: 'Megumi',
    rarity: 'UR',
    role: 'Utility / Sustain',
    renderSrc: megumiRender,
    portraitFrame: { scale: 2.14, y: '-14%' },
    maxHp: 96,
    passiveEffects: [definePassive({
      trigger: 'whileAlive',
      effects: [{ type: 'damageBoost', amount: 0.08, target: 'self' }],
      label: 'Ten Shadows',
    })],
    abilities: [
      skill({
        id: 'megumi-dogs',
        name: 'Divine Dogs',
        description: 'A reliable strike that punishes exposed targets.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 1,
        power: 46,
        effects: [{ type: 'damage', power: 46, target: 'inherit' }],
      }),
      skill({
        id: 'megumi-nue',
        name: 'Nue',
        description: 'Electric dive that stuns a single enemy.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK', 'DEBUFF'],
        cooldown: 3,
        power: 42,
        statusTurns: 1,
        effects: [
          { type: 'damage', power: 42, target: 'inherit' },
          { type: 'stun', duration: 1, target: 'inherit' },
        ],
      }),
      healSkill({
        id: 'megumi-toad',
        name: 'Toad',
        description: 'Recovers HP across the allied team.',
        targetRule: 'ally-all',
        tags: ['HEAL', 'UTILITY'],
        cooldown: 3,
        healPower: 18,
      }),
    ],
    ultimate: utilitySkill({
      id: 'megumi-chimera',
      name: 'Chimera Shadow Garden',
      description: 'Floods the field, striking all enemies while restoring allies.',
      targetRule: 'enemy-all',
      tags: ['ATK', 'HEAL', 'ULT'],
      cooldown: 5,
      power: 58,
      healPower: 20,
      effects: [
        { type: 'damage', power: 58, target: 'all-enemies' },
        { type: 'heal', power: 20, target: 'all-allies' },
      ],
    }),
  }),
  fighter({
    id: 'jogo',
    name: 'Jogo',
    shortName: 'Jogo',
    rarity: 'R',
    role: 'Blaster / Burn',
    renderSrc: jogoRender,
    portraitFrame: { scale: 2.02, y: '-6%' },
    maxHp: 88,
    passiveEffects: [definePassive({
      trigger: 'onDealDamage',
      effects: [{ type: 'burn', damage: 7, duration: 2, target: 'inherit' }],
      label: 'Volcanic Core',
    })],
    abilities: [
      skill({
        id: 'jogo-embers',
        name: 'Ember Burst',
        description: 'A quick projectile into the frontline.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 1,
        power: 43,
        effects: [{ type: 'damage', power: 43, target: 'inherit' }],
      }),
      skill({
        id: 'jogo-lava',
        name: 'Lava Surge',
        description: 'Heavy blast that pressures a marked target.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 2,
        power: 52,
        effects: [{ type: 'damage', power: 52, target: 'inherit' }],
      }),
      skill({
        id: 'jogo-pillar',
        name: 'Magma Pillar',
        description: 'Scorches the entire enemy side.',
        kind: 'attack',
        targetRule: 'enemy-all',
        tags: ['ATK'],
        cooldown: 3,
        power: 39,
        effects: [{ type: 'damage', power: 39, target: 'all-enemies' }],
      }),
    ],
    ultimate: skill({
      id: 'jogo-meteor',
      name: 'Maximum: Meteor',
      description: 'Burns the full enemy field with an ultimate impact.',
      kind: 'attack',
      targetRule: 'enemy-all',
      tags: ['ATK', 'ULT'],
      cooldown: 5,
      power: 67,
      effects: [{ type: 'damage', power: 67, target: 'all-enemies' }],
    }),
  }),
  fighter({
    id: 'yuji',
    name: 'Yuji Itadori',
    shortName: 'Yuji',
    rarity: 'SSR',
    role: 'Striker',
    renderSrc: yujiRender,
    portraitFrame: { scale: 2.06, y: '-10%' },
    maxHp: 104,
    passiveEffects: [definePassive({
      trigger: 'onRoundStart',
      effects: [{ type: 'heal', power: 6, target: 'self' }],
      label: 'Vessel Body',
    })],
    abilities: [
      skill({
        id: 'yuji-divergent',
        name: 'Divergent Fist',
        description: 'A heavy strike with clean damage output.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 2,
        power: 52,
        effects: [{ type: 'damage', power: 52, target: 'inherit' }],
      }),
      damageSkill({
        id: 'yuji-kick',
        name: 'Manji Kick',
        description: 'Fast follow-up that keeps pressure high.',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 1,
        power: 46,
      }),
      skill({
        id: 'yuji-adrenaline',
        name: 'Adrenaline Rush',
        description: 'Surges damage output for the next round.',
        kind: 'buff',
        targetRule: 'self',
        tags: ['BUFF'],
        cooldown: 3,
        attackBuffAmount: 12,
        statusTurns: 1,
        effects: [{ type: 'attackUp', amount: 12, duration: 1, target: 'self' }],
      }),
    ],
    ultimate: skill({
      id: 'yuji-black-flash',
      name: 'Black Flash',
      description: 'Delivers a devastating single-target finisher.',
      kind: 'attack',
      targetRule: 'enemy-single',
      tags: ['ATK', 'ULT'],
      cooldown: 5,
      power: 86,
      effects: [{ type: 'damage', power: 86, target: 'inherit' }],
    }),
  }),
  fighter({
    id: 'nobara',
    name: 'Nobara Kugisaki',
    shortName: 'Nobara',
    rarity: 'SR',
    role: 'Debuff / Burst',
    renderSrc: nobaraRender,
    portraitFrame: { scale: 2.08, y: '-10%' },
    maxHp: 90,
    abilities: [
      skill({
        id: 'nobara-doll',
        name: 'Straw Doll',
        description: 'Baseline hit that opens the target up.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 1,
        power: 45,
        effects: [{ type: 'damage', power: 45, target: 'inherit' }],
      }),
      skill({
        id: 'nobara-hairpin',
        name: 'Hairpin',
        description: 'A heavier burst into one enemy.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 2,
        power: 54,
        effects: [{ type: 'damage', power: 54, target: 'inherit' }],
      }),
      debuffSkill({
        id: 'nobara-resonance',
        name: 'Resonance Link',
        description: 'Marks a target to amplify future damage.',
        targetRule: 'enemy-single',
        tags: ['DEBUFF', 'UTILITY'],
        cooldown: 3,
        statusTurns: 2,
        statusPower: 14,
        effects: [{ type: 'mark', bonus: 14, duration: 2, target: 'inherit' }],
      }),
    ],
    ultimate: skill({
      id: 'nobara-black-flash',
      name: 'Black Flash Hairpin',
      description: 'High burst against a single enemy.',
      kind: 'attack',
      targetRule: 'enemy-single',
      tags: ['ATK', 'ULT'],
      cooldown: 5,
      power: 79,
      effects: [{ type: 'damage', power: 79, target: 'inherit' }],
    }),
  }),
  fighter({
    id: 'nanami',
    name: 'Kento Nanami',
    shortName: 'Nanami',
    rarity: 'SR',
    role: 'Bruiser / Execute',
    renderSrc: nanamiRender,
    portraitFrame: { scale: 1.98, y: '-12%' },
    maxHp: 108,
    passiveEffects: [definePassive({
      trigger: 'onTargetBelow',
      threshold: 0.45,
      effects: [{ type: 'damageBoost', amount: 0.22, target: 'self' }],
      label: 'Ratio Technique',
    })],
    abilities: [
      skill({
        id: 'nanami-blade',
        name: 'Blunted Blade',
        description: 'Clean single-target damage.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 1,
        power: 49,
        effects: [{ type: 'damage', power: 49, target: 'inherit' }],
      }),
      skill({
        id: 'nanami-overtime',
        name: 'Overtime',
        description: 'Raises bonus damage before the exchange lands.',
        kind: 'buff',
        targetRule: 'self',
        tags: ['BUFF'],
        cooldown: 3,
        attackBuffAmount: 14,
        statusTurns: 1,
        effects: [{ type: 'attackUp', amount: 14, duration: 1, target: 'self' }],
      }),
      skill({
        id: 'nanami-collapse',
        name: 'Collapse Point',
        description: 'Single-target pressure tuned for closing out low HP enemies.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 2,
        power: 57,
        effects: [{ type: 'damage', power: 57, target: 'inherit' }],
      }),
    ],
    ultimate: skill({
      id: 'nanami-seven-three',
      name: 'Seven-Three Critical',
      description: 'A brutal finisher against one target.',
      kind: 'attack',
      targetRule: 'enemy-single',
      tags: ['ATK', 'ULT'],
      cooldown: 5,
      power: 83,
      effects: [{ type: 'damage', power: 83, target: 'inherit' }],
    }),
  }),
  fighter({
    id: 'yuta',
    name: 'Yuta Okkotsu',
    shortName: 'Yuta',
    rarity: 'SSR',
    role: 'Hybrid',
    renderSrc: yutaRender,
    portraitFrame: { scale: 2.1, y: '-12%' },
    maxHp: 102,
    abilities: [
      skill({
        id: 'yuta-slash',
        name: 'Rika Slash',
        description: 'Reliable damage into one enemy.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 1,
        power: 49,
        effects: [{ type: 'damage', power: 49, target: 'inherit' }],
      }),
      healSkill({
        id: 'yuta-restore',
        name: 'Reverse Cursed Technique',
        description: 'Recovers one ally under pressure.',
        targetRule: 'ally-single',
        tags: ['HEAL'],
        cooldown: 2,
        healPower: 28,
      }),
      skill({
        id: 'yuta-surge',
        name: 'Rika Surge',
        description: 'Raises his bonus damage before a punish turn.',
        kind: 'buff',
        targetRule: 'self',
        tags: ['BUFF'],
        cooldown: 3,
        attackBuffAmount: 10,
        statusTurns: 1,
        effects: [{ type: 'attackUp', amount: 10, duration: 1, target: 'self' }],
      }),
    ],
    ultimate: skill({
      id: 'yuta-true-love',
      name: 'True Love Beam',
      description: 'Wide beam attack through the full enemy line.',
      kind: 'attack',
      targetRule: 'enemy-all',
      tags: ['ATK', 'ULT'],
      cooldown: 5,
      power: 66,
      effects: [{ type: 'damage', power: 66, target: 'all-enemies' }],
    }),
  }),
  fighter({
    id: 'todo',
    name: 'Aoi Todo',
    shortName: 'Todo',
    rarity: 'SR',
    role: 'Bruiser / Utility',
    renderSrc: todoRender,
    portraitFrame: { scale: 2.0, y: '-10%' },
    maxHp: 110,
    abilities: [
      skill({
        id: 'todo-clap',
        name: 'Boogie Woogie',
        description: 'Repositions into a solid hit and tempo shift.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK', 'UTILITY'],
        cooldown: 1,
        power: 45,
        effects: [{ type: 'damage', power: 45, target: 'inherit' }],
      }),
      skill({
        id: 'todo-smash',
        name: 'Monster Smash',
        description: 'Heavy bruiser hit.',
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 2,
        power: 55,
        effects: [{ type: 'damage', power: 55, target: 'inherit' }],
      }),
      defendSkill({
        id: 'todo-focus',
        name: 'Rhythm Focus',
        description: 'Fortifies himself before the next clash.',
        targetRule: 'self',
        tags: ['UTILITY', 'BUFF'],
        cooldown: 3,
        duration: 1,
      }),
    ],
    ultimate: skill({
      id: 'todo-black-flash',
      name: 'Partnered Black Flash',
      description: 'Explosive single-target finisher.',
      kind: 'attack',
      targetRule: 'enemy-single',
      tags: ['ATK', 'ULT'],
      cooldown: 5,
      power: 77,
      effects: [{ type: 'damage', power: 77, target: 'inherit' }],
    }),
  }),
]

export const authoredDefaultBattleSetup = {
  playerTeamIds: ['gojo', 'megumi', 'jogo'],
  enemyTeamIds: ['yuji', 'nobara', 'nanami'],
}

assertValidBattleContent(authoredBattleRoster, authoredDefaultBattleSetup)

export const authoredBattleContent = createContentSnapshot(authoredBattleRoster, authoredDefaultBattleSetup)

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
