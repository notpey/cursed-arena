import {
  damageSkill,
  debuffSkill,
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
    id: 'gojo',
    name: 'Satoru Gojo',
    shortName: 'Gojo',
    rarity: 'SSR',
    role: 'Blaster / Control',
    portraitFrame: { scale: 2.24, y: '-18%' },
    maxHp: 112,
    passiveEffects: [definePassive({
      id: 'gojo-six-eyes',
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
        classes: ['Instant', 'Unique'],
        cooldown: 3,
        duration: 1,
      }),
      damageSkill({
        id: 'gojo-red',
        name: 'Red - Reversal',
        description: 'A compressed blast that deletes one target.',
        targetRule: 'enemy-single',
        classes: ['Ranged', 'Energy', 'Action'],
        cooldown: 2,
        power: 58,
      }),
      skill({
        id: 'gojo-blue',
        name: 'Blue - Lapse',
        description: 'Pulls a target into point-blank pressure and stuns them.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Ranged', 'Energy', 'Control'],
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
      classes: ['Ranged', 'Energy', 'Ultimate', 'Action'],
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
          { type: 'classStun', duration: 1, blockedClasses: ['Physical'], target: 'inherit' },
          { type: 'adjustCounter', key: 'shikigami', amount: -2, target: 'self' },
        ],
        label: 'Divine Dogs Pack Hunt',
        description: 'With 4 or more Shikigami, Divine Dogs: Pursuit also seals Physical skills for 1 turn and consumes 2 Shikigami.',
        icon: { label: 'DD', tone: 'red' },
        hidden: true,
        iconFromAbilityId: 'megumi-dogs',
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
        description: 'With more than 3 Shikigami, Nue: Electric Drop deals 10 additional damage, fully stuns the target for 1 turn, and consumes 3 Shikigami.',
        icon: { label: 'NO', tone: 'gold' },
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
        icon: { label: 'SR', tone: 'teal' },
        hidden: true,
      }),
      definePassive({
        id: 'megumi-desperate-dismissal',
        trigger: 'onTakeDamage',
        conditions: [
          { type: 'selfHpBelow', threshold: 0.3 },
          { type: 'counterAtLeast', key: 'shikigami', value: 3 },
          { type: 'fighterFlag', key: 'desperate_dismissal_used', value: false },
        ],
        effects: [
          { type: 'adjustCounter', key: 'shikigami', amount: -3, target: 'self' },
          { type: 'setFlag', key: 'desperate_dismissal_used', value: true, target: 'self' },
        ],
        label: 'Desperate Dismissal',
        description: 'The first time Megumi falls below 30 health, he loses 3 Shikigami.',
        icon: { label: 'DD', tone: 'frost' },
        hidden: true,
      }),
    ],
    abilities: [
      skill({
        id: 'megumi-dogs',
        name: 'Divine Dogs: Pursuit',
        description: 'Deals 5 damage to one enemy, plus 5 damage per Shikigami stack. At 4 or more Shikigami, also seals the target\'s Physical skills for 1 turn and consumes 2 Shikigami.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Melee', 'Physical', 'Instant'],
        cooldown: 0,
        energyCost: { physical: 1 },
        power: 5,
        effects: [
          { type: 'damage', power: 5, target: 'inherit' },
          { type: 'damageScaledByCounter', counterKey: 'shikigami', counterSource: 'actor', powerPerStack: 5, consumeStacks: false, target: 'inherit' },
        ],
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
        description: 'Megumi dismisses nearby Shikigami to recover 15 health. If Megumi has 3 or more Shikigami, he heals 10 additional health and consumes 3 Shikigami.',
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
  fighter({
    id: 'jogo',
    name: 'Jogo',
    shortName: 'Jogo',
    rarity: 'R',
    role: 'Blaster / Burn',
    portraitFrame: { scale: 2.02, y: '-6%' },
    maxHp: 88,
    passiveEffects: [definePassive({
      id: 'jogo-volcanic-core',
      trigger: 'onDealDamage',
      effects: [{ type: 'burn', damage: 7, duration: 2, target: 'inherit' }],
      label: 'Volcanic Core',
      icon: { label: 'VC', tone: 'red' },
    })],
    abilities: [
      skill({
        id: 'jogo-embers',
        name: 'Ember Burst',
        description: 'A quick projectile into the frontline.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Ranged', 'Energy', 'Instant'],
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
        classes: ['Ranged', 'Energy', 'Action'],
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
        classes: ['Ranged', 'Energy', 'Action'],
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
      classes: ['Ranged', 'Energy', 'Ultimate', 'Action'],
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
    portraitFrame: { scale: 2.06, y: '-10%' },
    maxHp: 104,
    passiveEffects: [definePassive({
      id: 'yuji-vessel-body',
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
        classes: ['Melee', 'Physical', 'Action'],
        cooldown: 2,
        power: 52,
        effects: [{ type: 'damage', power: 52, target: 'inherit' }],
      }),
      damageSkill({
        id: 'yuji-kick',
        name: 'Manji Kick',
        description: 'Fast follow-up that keeps pressure high.',
        targetRule: 'enemy-single',
        classes: ['Melee', 'Physical', 'Instant'],
        cooldown: 1,
        power: 46,
      }),
      skill({
        id: 'yuji-adrenaline',
        name: 'Adrenaline Rush',
        description: 'Surges damage output for the next round.',
        kind: 'buff',
        targetRule: 'self',
        classes: ['Instant', 'Physical'],
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
      classes: ['Melee', 'Physical', 'Ultimate', 'Action'],
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
    portraitFrame: { scale: 2.08, y: '-10%' },
    maxHp: 90,
    abilities: [
      skill({
        id: 'nobara-doll',
        name: 'Straw Doll',
        description: 'Baseline hit that opens the target up.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Ranged', 'Physical', 'Instant'],
        cooldown: 1,
        power: 45,
        effects: [{ type: 'damage', power: 45, target: 'inherit' }],
      }),
      skill({
        id: 'nobara-hairpin',
        name: 'Hairpin',
        description: 'A heavier burst that primes the target for Cursed Nails.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Ranged', 'Physical', 'Action'],
        cooldown: 2,
        power: 54,
        effects: [
          { type: 'damage', power: 54, target: 'inherit' },
          {
            type: 'addModifier',
            target: 'inherit',
            modifier: {
              label: 'If this character uses a harmful skill, Cursed Nails is applied for 1 turn.',
              stat: 'cooldownTick',
              mode: 'flat',
              value: 0,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['nobara-cursed-nails-pending'],
              visible: true,
              stacking: 'replace',
            },
          },
        ],
      }),
      debuffSkill({
        id: 'nobara-resonance',
        name: 'Resonance Link',
        description: 'Marks a target to amplify future damage.',
        targetRule: 'enemy-single',
        classes: ['Ranged', 'Affliction', 'Control'],
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
      classes: ['Ranged', 'Physical', 'Ultimate', 'Action'],
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
    portraitFrame: { scale: 1.98, y: '-12%' },
    maxHp: 108,
    passiveEffects: [definePassive({
      id: 'nanami-ratio-technique',
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
        classes: ['Melee', 'Physical', 'Instant'],
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
        classes: ['Instant', 'Mental'],
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
        classes: ['Melee', 'Physical', 'Action'],
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
      classes: ['Melee', 'Physical', 'Ultimate', 'Action'],
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
    portraitFrame: { scale: 2.1, y: '-12%' },
    maxHp: 102,
    abilities: [
      skill({
        id: 'yuta-slash',
        name: 'Rika Slash',
        description: 'Reliable damage into one enemy.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Melee', 'Energy', 'Action'],
        cooldown: 1,
        power: 49,
        effects: [{ type: 'damage', power: 49, target: 'inherit' }],
      }),
      healSkill({
        id: 'yuta-restore',
        name: 'Reverse Cursed Technique',
        description: 'Recovers one ally under pressure.',
        targetRule: 'ally-single',
        classes: ['Ranged', 'Energy', 'Instant'],
        cooldown: 2,
        healPower: 28,
      }),
      skill({
        id: 'yuta-surge',
        name: 'Rika Surge',
        description: 'Raises his bonus damage before a punish turn.',
        kind: 'buff',
        targetRule: 'self',
        classes: ['Instant', 'Energy'],
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
      classes: ['Ranged', 'Energy', 'Ultimate', 'Action'],
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
    portraitFrame: { scale: 2.0, y: '-10%' },
    maxHp: 110,
    abilities: [
      skill({
        id: 'todo-clap',
        name: 'Boogie Woogie',
        description: 'Repositions into a solid hit and tempo shift.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Melee', 'Physical', 'Unique'],
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
        classes: ['Melee', 'Physical', 'Action'],
        cooldown: 2,
        power: 55,
        effects: [{ type: 'damage', power: 55, target: 'inherit' }],
      }),
      defendSkill({
        id: 'todo-focus',
        name: 'Rhythm Focus',
        description: 'Fortifies himself before the next clash.',
        targetRule: 'self',
        classes: ['Instant', 'Mental'],
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
      classes: ['Melee', 'Physical', 'Ultimate', 'Action'],
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

