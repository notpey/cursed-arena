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
    rarity: 'SR',
    role: 'Affliction / Setup',
    portraitFrame: { scale: 2.02, y: '-6%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'jogo-disaster-heat',
        trigger: 'onRoundStart',
        // Each turn, every enemy with Scorched stacks takes 5 affliction
        // damage per stack. The "every 25 hp lost triggers Ember Insects"
        // half is not currently expressible — left descriptive.
        effects: [
          {
            type: 'damageScaledByCounter',
            counterKey: 'scorched',
            powerPerStack: 5,
            consumeStacks: false,
            target: 'all-enemies',
          },
        ],
        label: 'Disaster Heat',
        description: 'At the start of each turn, every enemy affected by Scorched takes 5 affliction damage per stack. Whenever Jogo loses 25 health, Ember Insects triggers on all enemies.',
        icon: { label: 'DH', tone: 'red' },
        counterKey: 'scorched',
      }),
      definePassive({
        // Hidden engine effect: when Jogo's shield from Ember Insects breaks,
        // re-apply Scorched 5/5 to the attacker.
        id: 'jogo-molten-rebound',
        trigger: 'onShieldBroken',
        conditions: [{ type: 'brokenShieldTag', tag: 'molten-husk' }],
        effects: [
          { type: 'adjustCounter', key: 'scorched', amount: 5, target: 'attacker' },
          { type: 'burn', damage: 5, duration: 5, target: 'attacker' },
        ],
        label: 'Molten Rebound',
        hidden: true,
        iconFromAbilityId: 'jogo-ember-insects',
      }),
    ],
    abilities: [
      skill({
        id: 'jogo-ember-insects',
        name: 'Ember Insects',
        description: 'Jogo gains 10 destructible defense for 1 turn and applies Scorched (5 stacks, 5 turns) to one enemy. If the defense is broken, the attacker is also Scorched.',
        kind: 'utility',
        targetRule: 'enemy-single',
        classes: ['Affliction', 'Ranged', 'Instant'],
        cooldown: 1,
        energyCost: { technique: 1 },
        power: 0,
        effects: [
          { type: 'shield', amount: 10, label: 'Molten Husk', tags: ['molten-husk'], target: 'self' },
          { type: 'adjustCounter', key: 'scorched', amount: 5, target: 'inherit' },
          { type: 'burn', damage: 5, duration: 5, target: 'inherit' },
        ],
      }),
      skill({
        id: 'jogo-volcanic-infestation',
        name: 'Volcanic Infestation',
        description: 'Targets all enemies. For 1 turn, every enemy that uses a new harmful skill is Scorched (5 stacks, 5 turns). This skill is invisible.',
        kind: 'utility',
        targetRule: 'enemy-all',
        classes: ['Affliction', 'Ranged', 'Instant'],
        cooldown: 1,
        energyCost: { technique: 2 },
        power: 0,
        // NOTE: Engine doesn't track "first harmful skill use this turn", so
        // we approximate by applying Scorched 5/5 to all enemies immediately.
        effects: [
          { type: 'adjustCounter', key: 'scorched', amount: 5, target: 'all-enemies' },
          { type: 'burn', damage: 5, duration: 5, target: 'all-enemies' },
        ],
      }),
      skill({
        id: 'jogo-cataclysmic-eruption',
        name: 'Cataclysmic Eruption',
        description: 'Deals 5 affliction damage to all enemies for each stack of Scorched they have. Removes all Scorched stacks.',
        kind: 'attack',
        targetRule: 'enemy-all',
        classes: ['Affliction', 'Ranged', 'Instant'],
        cooldown: 2,
        energyCost: { technique: 3 },
        power: 0,
        effects: [
          {
            type: 'damageScaledByCounter',
            counterKey: 'scorched',
            powerPerStack: 5,
            consumeStacks: true,
            target: 'all-enemies',
          },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'jogo-molten-husk',
      name: 'Molten Husk',
      description: 'Jogo becomes invulnerable for 1 turn. While invulnerable, every enemy that targets him gains 1 stack of Scorched.',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      energyCost: { random: 1 },
      effects: [
        { type: 'invulnerable', duration: 1, target: 'inherit' },
      ],
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
    role: 'Striker / Execute',
    portraitFrame: { scale: 1.98, y: '-12%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'nanami-overtime',
        trigger: 'onTakeDamage',
        // First time HP drops below 60, enter Overtime: +10 damage and an
        // extra random energy each round for 3 rounds.
        conditions: [
          { type: 'selfHpBelow', threshold: 0.6 },
          { type: 'fighterFlag', key: 'overtime_entered', value: false },
        ],
        effects: [
          { type: 'attackUp', amount: 10, duration: 3, target: 'self' },
          { type: 'setFlag', key: 'overtime_entered', value: true, target: 'self' },
        ],
        label: 'Overtime',
        description: 'Nanami begins outside Overtime. The first time he drops below 60 health, he enters Overtime for 3 turns: his skills deal +10 damage and he gains 1 additional random Energy each round.',
        icon: { label: 'OT', tone: 'gold' },
      }),
    ],
    abilities: [
      skill({
        id: 'nanami-ratio-technique',
        name: 'Ratio Technique',
        description: 'Nanami gains 10 permanent destructible defense. The next use of 7:3 Execution will deal 20 additional damage to its target.',
        kind: 'buff',
        targetRule: 'self',
        classes: ['Strategic', 'Instant'],
        cooldown: 1,
        power: 0,
        effects: [
          { type: 'shield', amount: 10, label: 'Ratio Guard', tags: ['ratio-guard'], target: 'self' },
          { type: 'setFlag', key: 'ratio_charged', value: true, target: 'self' },
        ],
      }),
      skill({
        id: 'nanami-seven-three',
        name: '7:3 Execution',
        description: 'Deals 20 piercing damage to one enemy and reduces their non-affliction damage by 5 for 1 turn. If Ratio Technique was used the previous turn, this skill deals 20 additional damage.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Melee', 'Physical', 'Instant'],
        cooldown: 1,
        energyCost: { physical: 1, random: 1 },
        power: 20,
        effects: [
          { type: 'damage', power: 20, target: 'inherit', piercing: true },
          // Non-affliction damage reduction: target deals -5 to non-affliction
          // skills for 1 turn. Engine has damageDealt modifiers but no clean
          // "non-affliction" filter — use plain damageDealt -5 for now.
          {
            type: 'addModifier',
            modifier: {
              label: 'Pressure Reading',
              stat: 'damageDealt',
              mode: 'flat',
              value: -5,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['debuff'],
              visible: true,
            },
            target: 'inherit',
          },
        ],
      }),
      skill({
        id: 'nanami-collapse',
        name: 'Collapse Point',
        description: 'Deals 5 piercing damage to one enemy. For the rest of the match, every time the target uses a new harmful skill, they take 5 additional damage from 7:3 Execution.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Melee', 'Physical', 'Instant'],
        cooldown: 1,
        energyCost: { physical: 1 },
        power: 5,
        effects: [
          { type: 'damage', power: 5, target: 'inherit', piercing: true },
          // Permanent mark: bonus +5 damage when struck. The "from 7:3
          // Execution" filter is not currently enforced by the engine; the
          // bonus applies on any incoming hit.
          { type: 'mark', bonus: 5, duration: 99, target: 'inherit' },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'nanami-professional-guard',
      name: 'Professional Guard',
      description: 'Nanami becomes invulnerable for 1 turn.',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
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
    role: 'Bruiser / Setup',
    portraitFrame: { scale: 2.0, y: '-10%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'todo-besto-friendo',
        trigger: 'onAbilityUse',
        // When Todo uses any skill on an enemy, mark them as his "Type" for
        // 2 turns. Anything Todo lands on a marked target deals +5. Stun
        // synergy ("if Type is stunned, take +5 from all sources for 1
        // turn") is approximated by the simple bonus damage flag below.
        conditions: [{ type: 'abilityClass', class: 'Melee' }],
        effects: [
          { type: 'mark', bonus: 5, duration: 2, target: 'inherit' },
        ],
        label: 'Besto Friendo',
        description: 'When Todo targets an enemy, he marks them as his "Type" for 2 turns. His skills deal +5 damage to his Type. If his Type is stunned, they take 5 additional damage from all sources for 1 turn.',
        icon: { label: 'BF', tone: 'red' },
      }),
    ],
    abilities: [
      skill({
        id: 'todo-brutal-swing',
        name: 'Brutal Swing',
        description: 'Deals 30 damage to one enemy. If the target is affected by Boogie Woogie, this skill deals 10 additional damage.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Melee', 'Instant'],
        cooldown: 1,
        energyCost: { physical: 1 },
        power: 30,
        effects: [
          { type: 'damage', power: 30, target: 'inherit' },
          { type: 'damageFiltered', power: 10, requiresTag: 'boogie-woogie', target: 'inherit' },
        ],
      }),
      skill({
        id: 'todo-boogie-woogie',
        name: 'Boogie Woogie',
        description: "Targets one enemy. Their skills deal 10 less damage and they cannot become invulnerable. For 1 turn, if Todo is targeted by a harmful skill, he becomes invulnerable and reflects 10 damage to the attacker.",
        kind: 'debuff',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Ranged', 'Instant'],
        cooldown: 2,
        energyCost: {},
        power: 0,
        effects: [
          {
            type: 'addModifier',
            modifier: {
              label: 'Boogie Woogie',
              stat: 'damageDealt',
              mode: 'flat',
              value: -10,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['boogie-woogie', 'debuff'],
              visible: true,
            },
            target: 'inherit',
          },
          {
            type: 'addModifier',
            modifier: {
              label: 'Cannot Become Invulnerable',
              stat: 'canGainInvulnerable',
              mode: 'set',
              value: false,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['boogie-woogie', 'debuff'],
              visible: true,
            },
            target: 'inherit',
          },
          {
            type: 'counter',
            duration: 1,
            counterDamage: 10,
            consumeOnTrigger: true,
            target: 'self',
          },
          { type: 'invulnerable', duration: 1, target: 'self' },
        ],
      }),
      skill({
        id: 'todo-follow-up',
        name: 'Follow-Up Assault',
        description: 'Deals 20 damage to one enemy. If the target is affected by Boogie Woogie, this skill deals 15 additional damage and seals their Physical skills for 1 turn.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Melee', 'Instant'],
        cooldown: 2,
        energyCost: { physical: 1, random: 1 },
        power: 20,
        effects: [
          { type: 'damage', power: 20, target: 'inherit' },
          { type: 'damageFiltered', power: 15, requiresTag: 'boogie-woogie', target: 'inherit' },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'todo-unshakable-confidence',
      name: 'Unshakable Confidence',
      description: 'Todo becomes invulnerable for 1 turn. For 1 turn, his skills deal 10 additional damage.',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      effects: [
        { type: 'invulnerable', duration: 1, target: 'inherit' },
        { type: 'attackUp', amount: 10, duration: 1, target: 'self' },
      ],
    }),
  }),
  fighter({
    id: 'hanami',
    name: 'Hanami',
    shortName: 'Hanami',
    rarity: 'SR',
    role: 'Tank / Sustain',
    portraitFrame: { scale: 2.06, y: '-12%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'hanami-natural-body',
        trigger: 'onRoundStart',
        effects: [
          { type: 'shield', amount: 10, label: 'Natural Body', tags: ['natural-body'], target: 'self' },
          // While the destructible defense is active, Hanami takes -5 from
          // all sources. Modeled here as a 1-round damage reduction that
          // refreshes alongside the shield each round.
          {
            type: 'addModifier',
            modifier: {
              label: 'Natural Body',
              stat: 'damageTaken',
              mode: 'flat',
              value: -5,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['natural-body'],
              visible: true,
            },
            target: 'self',
          },
        ],
        label: 'Natural Body',
        description: 'At the start of each turn, Hanami gains 10 destructible defense that refreshes. While the defense is active, he takes 5 less damage from all sources.',
        icon: { label: 'NB', tone: 'teal' },
      }),
    ],
    abilities: [
      skill({
        id: 'hanami-root-snare',
        name: 'Root Snare',
        description: 'Deals 15 damage to one enemy. For 1 turn, the target deals 15 less damage and cannot reduce or prevent damage.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Ranged', 'Instant'],
        cooldown: 1,
        energyCost: { random: 1 },
        power: 15,
        effects: [
          { type: 'damage', power: 15, target: 'inherit' },
          {
            type: 'addModifier',
            modifier: {
              label: 'Root Snare',
              stat: 'damageDealt',
              mode: 'flat',
              value: -15,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['root-snare', 'debuff'],
              visible: true,
            },
            target: 'inherit',
          },
          {
            type: 'addModifier',
            modifier: {
              label: 'No Damage Reduction',
              stat: 'canReduceDamageTaken',
              mode: 'set',
              value: false,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['root-snare', 'debuff'],
              visible: true,
            },
            target: 'inherit',
          },
        ],
      }),
      skill({
        id: 'hanami-cursed-bud',
        name: 'Cursed Bud Growth',
        description: "Deals 20 damage to one enemy. The next time that enemy uses a skill, they take 15 damage and Hanami heals 15 health.",
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Ranged', 'Instant'],
        cooldown: 2,
        energyCost: { random: 2 },
        power: 20,
        // NOTE: The "next time the enemy uses a skill" trigger isn't
        // currently expressible. Approximated as a delayed effect that
        // resolves at the start of the next round.
        effects: [
          { type: 'damage', power: 20, target: 'inherit' },
          {
            type: 'schedule',
            delay: 1,
            phase: 'roundStart',
            target: 'inherit',
            effects: [
              { type: 'damage', power: 15, target: 'inherit' },
              { type: 'heal', power: 15, target: 'self' },
            ],
          },
        ],
      }),
      skill({
        id: 'hanami-forest-expansion',
        name: 'Forest Expansion',
        description: 'Deals 15 damage to all enemies. For 2 turns, enemies take 5 additional damage from all sources and deal 5 less damage.',
        kind: 'attack',
        targetRule: 'enemy-all',
        classes: ['Physical', 'Ranged', 'Instant'],
        cooldown: 3,
        energyCost: { random: 2 },
        power: 15,
        effects: [
          { type: 'damage', power: 15, target: 'all-enemies' },
          {
            type: 'addModifier',
            modifier: {
              label: 'Forest Expansion',
              stat: 'damageTaken',
              mode: 'flat',
              value: 5,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['forest-expansion', 'debuff'],
              visible: true,
            },
            target: 'all-enemies',
          },
          {
            type: 'addModifier',
            modifier: {
              label: 'Forest Expansion',
              stat: 'damageDealt',
              mode: 'flat',
              value: -5,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['forest-expansion', 'debuff'],
              visible: true,
            },
            target: 'all-enemies',
          },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'hanami-natures-resilience',
      name: "Nature's Resilience",
      description: 'Hanami becomes invulnerable for 1 turn. During this turn, every time he is targeted by a harmful skill, all enemies take 10 damage.',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      effects: [
        { type: 'invulnerable', duration: 1, target: 'inherit' },
        // NOTE: True "AOE retaliation when targeted" needs an engine extension
        // to reactionGuards (target-all-enemies). For now we apply 10 dmg up-
        // front to all enemies as a punishment burst.
        { type: 'damage', power: 10, target: 'all-enemies' },
      ],
    }),
  }),
  fighter({
    id: 'junpei',
    name: 'Junpei Yoshino',
    shortName: 'Junpei',
    rarity: 'R',
    role: 'Affliction / Punisher',
    portraitFrame: { scale: 2.04, y: '-10%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'junpei-weak-constitution',
        trigger: 'whileAlive',
        effects: [
          {
            type: 'addModifier',
            modifier: {
              label: 'Weak Constitution',
              stat: 'damageTaken',
              mode: 'flat',
              value: 5,
              duration: { kind: 'permanent' },
              tags: ['weak-constitution'],
              visible: true,
            },
            target: 'self',
          },
        ],
        label: 'Weak Constitution',
        description: 'Junpei takes 5 additional damage from all sources. When an enemy takes affliction damage, Junpei heals 5 health.',
        icon: { label: 'WC', tone: 'red' },
      }),
      definePassive({
        id: 'junpei-affliction-feedback',
        trigger: 'onDealDamage',
        // Affliction-feedback heal: when Junpei deals affliction damage to
        // an enemy, he heals 5. The "any enemy taking affliction damage"
        // trigger isn't fully expressible — we anchor on Junpei dealing it.
        conditions: [{ type: 'abilityClass', class: 'Affliction' }],
        effects: [{ type: 'heal', power: 5, target: 'self' }],
        label: 'Affliction Feedback',
        hidden: true,
      }),
    ],
    abilities: [
      skill({
        id: 'junpei-injection',
        name: 'Moon Dregs: Injection',
        description: 'Deals 10 damage to one enemy. For 2 turns, the target takes 10 affliction damage at the start of each turn. During this time, the first time the target uses a harmful skill each turn, they take 10 additional affliction damage.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Affliction', 'Ranged', 'Instant'],
        cooldown: 1,
        energyCost: { technique: 1 },
        power: 10,
        effects: [
          { type: 'damage', power: 10, target: 'inherit' },
          { type: 'burn', damage: 10, duration: 2, target: 'inherit' },
          // Tag the target so Toxic Break and Guard can detect the injection.
          {
            type: 'addModifier',
            modifier: {
              label: 'Moon Dregs: Injection',
              stat: 'damageTaken',
              mode: 'flat',
              value: 0,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['moon-dregs'],
              visible: true,
            },
            target: 'inherit',
          },
        ],
      }),
      skill({
        id: 'junpei-paralytic',
        name: 'Moon Dregs: Paralytic Poison',
        description: 'For 1 turn, the next time the target uses a skill, they will become stunned for 1 turn and take 15 affliction damage.',
        kind: 'debuff',
        targetRule: 'enemy-single',
        classes: ['Affliction', 'Ranged', 'Instant'],
        cooldown: 2,
        energyCost: { physical: 1 },
        power: 0,
        // NOTE: "next time the target uses a skill" trigger not modeled.
        // Approximated as a delayed stun + damage at the next round-start.
        effects: [
          {
            type: 'schedule',
            delay: 1,
            phase: 'roundStart',
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
        description: 'Deals 20 damage to one enemy. If the target is affected by Moon Dregs: Injection, this skill deals 15 additional piercing damage and increases all affliction effects on them by 5 permanently.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Affliction', 'Ranged', 'Instant'],
        cooldown: 2,
        energyCost: { technique: 1, random: 1 },
        power: 20,
        effects: [
          { type: 'damage', power: 20, target: 'inherit' },
          { type: 'damageFiltered', power: 15, requiresTag: 'moon-dregs', target: 'inherit', piercing: true },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'junpei-guard',
      name: 'Moon Dregs: Guard',
      description: 'Junpei becomes invulnerable for 1 turn. During this time, the first enemy that uses a harmful skill on him takes 15 affliction damage and has Moon Dregs: Injection applied to them.',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      effects: [
        { type: 'invulnerable', duration: 1, target: 'inherit' },
        {
          type: 'counter',
          duration: 1,
          counterDamage: 15,
          consumeOnTrigger: true,
          target: 'self',
        },
      ],
    }),
  }),
  fighter({
    id: 'miwa',
    name: 'Kasumi Miwa',
    shortName: 'Miwa',
    rarity: 'R',
    role: 'Defender / Counter',
    portraitFrame: { scale: 2.14, y: '-14%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'miwa-steady-discipline',
        trigger: 'whileAlive',
        // Approximation: Miwa always takes 5 less damage. The condition
        // "while not affected by non-damage effects" needs a passive
        // gating system the engine doesn't have yet.
        effects: [
          {
            type: 'addModifier',
            modifier: {
              label: 'Steady Discipline',
              stat: 'damageTaken',
              mode: 'flat',
              value: -5,
              duration: { kind: 'permanent' },
              tags: ['steady-discipline'],
              visible: true,
            },
            target: 'self',
          },
        ],
        label: 'Steady Discipline',
        description: 'While Miwa is not affected by any non-damage effects, she takes 5 less damage from all sources.',
        icon: { label: 'SD', tone: 'teal' },
      }),
    ],
    abilities: [
      skill({
        id: 'miwa-simple-domain',
        name: 'Simple Domain',
        description: "For 2 turns, Miwa ignores all non-damage effects from enemy skills and reduces all damage she takes by 10. During this time, enemies cannot ignore her damage reduction or become invulnerable.",
        kind: 'buff',
        targetRule: 'self',
        classes: ['Strategic', 'Instant'],
        cooldown: 4,
        energyCost: { physical: 1, random: 1 },
        power: 0,
        effects: [
          {
            type: 'effectImmunity',
            label: 'Simple Domain',
            blocks: [{ kind: 'all' }],
            duration: 2,
            tags: ['simple-domain'],
            target: 'self',
          },
          {
            type: 'addModifier',
            modifier: {
              label: 'Simple Domain',
              stat: 'damageTaken',
              mode: 'flat',
              value: -10,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['simple-domain'],
              visible: true,
            },
            target: 'self',
          },
        ],
      }),
      skill({
        id: 'miwa-quick-draw',
        name: 'Quick Draw',
        description: 'Deals 15 damage to one enemy. If Simple Domain is active, this skill deals 30 damage and ignores destructible defense.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Melee', 'Instant'],
        cooldown: 1,
        energyCost: { physical: 1 },
        power: 15,
        // NOTE: actor-side "if Simple Domain active" check needs a new
        // condition. Approximated as flat 15 base; the bonus and piercing
        // could be authored via a hidden onAbilityResolve passive once we
        // gain an `actorHasModifier` reaction condition.
        effects: [
          { type: 'damage', power: 15, target: 'inherit' },
        ],
      }),
      skill({
        id: 'miwa-counter-slash',
        name: 'Counter Slash',
        description: 'For 1 turn, Miwa counters the next harmful skill used on her. The attacker takes 25 damage and is stunned for 1 turn. If Simple Domain is active, this skill counters all harmful skills used on her during this turn.',
        kind: 'defend',
        targetRule: 'self',
        classes: ['Physical', 'Melee', 'Instant'],
        cooldown: 2,
        energyCost: { physical: 1 },
        power: 0,
        effects: [
          {
            type: 'counter',
            duration: 1,
            counterDamage: 25,
            consumeOnTrigger: true,
            target: 'self',
          },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'miwa-defensive-stance',
      name: 'Defensive Stance',
      description: "Miwa becomes invulnerable for 1 turn. If she uses Simple Domain on the following turn, its cooldown will be reduced by 1.",
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
    }),
  }),
  fighter({
    id: 'mai',
    name: "Mai Zen'in",
    shortName: 'Mai',
    rarity: 'R',
    role: 'Marksman / Resource',
    portraitFrame: { scale: 2.06, y: '-12%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'mai-reserved-fire',
        trigger: 'onRoundStart',
        // Initialize 2 bullets on the first round only.
        conditions: [{ type: 'fighterFlag', key: 'mai_initialized', value: false }],
        effects: [
          { type: 'adjustCounter', key: 'cursed-bullets', amount: 2, target: 'self' },
          { type: 'setFlag', key: 'mai_initialized', value: true, target: 'self' },
        ],
        label: 'Reserved Fire',
        description: 'Mai begins the match with 2 uses of Cursed Bullet. Her maximum number of uses is 3.',
        icon: { label: 'RF', tone: 'gold' },
        counterKey: 'cursed-bullets',
      }),
    ],
    abilities: [
      skill({
        id: 'mai-cursed-bullet',
        name: 'Cursed Bullet',
        description: 'Deals 30 damage to one enemy. This skill has 2 uses. When Mai has no uses remaining, this skill deals 15 damage instead.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Ranged', 'Instant'],
        cooldown: 1,
        energyCost: { physical: 1, random: 1 },
        power: 30,
        // NOTE: Conditional damage based on actor counter not yet supported
        // as a single-effect primitive. Authored as the high-damage version;
        // the "0 bullets → 15" fallback should be wired with an actor-side
        // counter condition once available.
        effects: [
          { type: 'damage', power: 30, target: 'inherit' },
          { type: 'adjustCounter', key: 'cursed-bullets', amount: -1, target: 'self' },
        ],
      }),
      skill({
        id: 'mai-steady-aim',
        name: 'Steady Aim',
        description: 'Mai gains 1 use of Cursed Bullet and her next skill deals 10 additional damage. If Mai does not use Cursed Bullet on the following turn, she gains 1 additional use.',
        kind: 'buff',
        targetRule: 'self',
        classes: ['Strategic', 'Instant'],
        cooldown: 1,
        power: 0,
        effects: [
          { type: 'adjustCounter', key: 'cursed-bullets', amount: 1, target: 'self' },
          { type: 'attackUp', amount: 10, duration: 1, target: 'self' },
        ],
      }),
      skill({
        id: 'mai-suppressing-fire',
        name: 'Suppressing Fire',
        description: 'Deals 15 damage to one enemy. For 1 turn, that enemy will deal 10 less damage. If Mai has no uses of Cursed Bullet remaining, this skill instead deals 25 damage and stuns the target for 1 turn.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Physical', 'Ranged', 'Instant'],
        cooldown: 1,
        energyCost: { physical: 1 },
        power: 15,
        effects: [
          { type: 'damage', power: 15, target: 'inherit' },
          {
            type: 'addModifier',
            modifier: {
              label: 'Suppressing Fire',
              stat: 'damageDealt',
              mode: 'flat',
              value: -10,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['suppressing-fire', 'debuff'],
              visible: true,
            },
            target: 'inherit',
          },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'mai-emergency-cover',
      name: 'Emergency Cover',
      description: "Mai becomes invulnerable for 1 turn. After this turn, Mai gains 1 use of Cursed Bullet.",
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      effects: [
        { type: 'invulnerable', duration: 1, target: 'inherit' },
        {
          type: 'schedule',
          delay: 1,
          phase: 'roundStart',
          target: 'self',
          effects: [{ type: 'adjustCounter', key: 'cursed-bullets', amount: 1, target: 'self' }],
        },
      ],
    }),
  }),
  fighter({
    id: 'ijichi',
    name: 'Kiyotaka Ijichi',
    shortName: 'Ijichi',
    rarity: 'R',
    role: 'Support / Barrier',
    portraitFrame: { scale: 2.0, y: '-10%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'ijichi-regulated-space',
        trigger: 'onRoundStart',
        // The "allies with destructible defense gain +5" half is approximated
        // as a flat 5 shield to Ijichi himself each round. Cross-team ally
        // shielding through a passive needs a gating condition we don't
        // currently have.
        effects: [
          { type: 'shield', amount: 5, label: 'Regulated Space', tags: ['regulated-space'], target: 'self' },
        ],
        label: 'Regulated Space',
        description: 'At the start of each turn, allies with destructible defense gain 5 additional defense and enemies affected by Barrier Tagging take 5 damage.',
        icon: { label: 'RS', tone: 'teal' },
      }),
    ],
    abilities: [
      skill({
        id: 'ijichi-simple-barrier',
        name: 'Simple Barrier',
        description: 'Targets one ally. The target gains 25 destructible defense for 2 turns. While active, the first harmful skill used on them each turn deals 10 less damage. If this defense is destroyed, the attacker takes 10 additional damage from all skills for 1 turn.',
        kind: 'buff',
        targetRule: 'ally-single',
        classes: ['Strategic', 'Instant'],
        cooldown: 1,
        energyCost: { random: 1 },
        power: 0,
        effects: [
          { type: 'shield', amount: 25, label: 'Simple Barrier', tags: ['simple-barrier'], target: 'inherit' },
        ],
      }),
      skill({
        id: 'ijichi-curtain',
        name: 'Curtain',
        description: 'Targets all characters for 1 turn. All allies take 10 less damage and enemies will deal 5 less damage with their skills. During this time, enemies\' non-damaging skill costs will be increased by 1 additional random Energy.',
        kind: 'utility',
        targetRule: 'enemy-all',
        classes: ['Strategic', 'Instant'],
        cooldown: 3,
        energyCost: { random: 2 },
        power: 0,
        effects: [
          {
            type: 'addModifier',
            modifier: {
              label: 'Curtain (Ally)',
              stat: 'damageTaken',
              mode: 'flat',
              value: -10,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['curtain'],
              visible: true,
            },
            target: 'all-allies',
          },
          {
            type: 'addModifier',
            modifier: {
              label: 'Curtain',
              stat: 'damageDealt',
              mode: 'flat',
              value: -5,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['curtain', 'debuff'],
              visible: true,
            },
            target: 'all-enemies',
          },
        ],
      }),
      skill({
        id: 'ijichi-barrier-tagging',
        name: 'Barrier Tagging',
        description: 'Targets one enemy. For 2 turns, the first time they use a skill each turn, they take 10 damage. During this time, they cannot reduce damage or become invulnerable.',
        kind: 'debuff',
        targetRule: 'enemy-single',
        classes: ['Special', 'Ranged', 'Action'],
        cooldown: 3,
        energyCost: { random: 2 },
        power: 0,
        effects: [
          {
            type: 'addModifier',
            modifier: {
              label: 'Barrier Tagging',
              stat: 'canReduceDamageTaken',
              mode: 'set',
              value: false,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['barrier-tagging'],
              visible: true,
            },
            target: 'inherit',
          },
          {
            type: 'addModifier',
            modifier: {
              label: 'Barrier Tagging',
              stat: 'canGainInvulnerable',
              mode: 'set',
              value: false,
              duration: { kind: 'rounds', rounds: 2 },
              tags: ['barrier-tagging'],
              visible: true,
            },
            target: 'inherit',
          },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'ijichi-emergency-curtain',
      name: 'Emergency Curtain',
      description: 'Makes Kiyotaka Ijichi or one ally invulnerable for 1 turn. All allies gain 10 permanent destructible defense.',
      targetRule: 'ally-single',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      effects: [
        { type: 'invulnerable', duration: 1, target: 'inherit' },
        { type: 'shield', amount: 10, label: 'Emergency Curtain', tags: ['emergency-curtain'], target: 'all-allies' },
      ],
    }),
  }),
  fighter({
    id: 'mahito',
    name: 'Mahito',
    shortName: 'Mahito',
    rarity: 'SSR',
    role: 'Adaptive / Mental',
    portraitFrame: { scale: 2.08, y: '-12%' },
    maxHp: 100,
    passiveEffects: [
      definePassive({
        id: 'mahito-understanding-the-soul',
        trigger: 'onAbilityUse',
        // The first time Mahito uses a skill on each enemy, mark them.
        // Mark gives +10 bonus to the next strike against the target.
        effects: [
          { type: 'mark', bonus: 10, duration: 1, target: 'inherit' },
        ],
        label: 'Understanding the Soul',
        description: 'The first time Mahito uses a skill on each enemy, his next skill against that same target will deal 10 additional damage.',
        icon: { label: 'US', tone: 'red' },
      }),
    ],
    abilities: [
      skill({
        id: 'mahito-idle-transfiguration',
        name: 'Idle Transfiguration',
        description: 'Deals 20 damage to one enemy. One of the following effects will be applied at random: the target is stunned for 1 turn, the target deals 15 less damage for 1 turn, or the target takes 15 additional damage the next time they use a skill.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Mental', 'Melee', 'Instant'],
        cooldown: 1,
        energyCost: { mental: 1 },
        power: 20,
        // NOTE: Engine doesn't have a `randomOutcome` effect type yet. We
        // pick the middle outcome (target deals 15 less) deterministically
        // until that primitive is added.
        effects: [
          { type: 'damage', power: 20, target: 'inherit' },
          {
            type: 'addModifier',
            modifier: {
              label: 'Idle Transfiguration',
              stat: 'damageDealt',
              mode: 'flat',
              value: -15,
              duration: { kind: 'rounds', rounds: 1 },
              tags: ['idle-transfiguration', 'debuff'],
              visible: true,
            },
            target: 'inherit',
          },
        ],
      }),
      skill({
        id: 'mahito-soul-multiplicity',
        name: 'Soul Multiplicity',
        description: 'Deals 15 damage to one enemy and 15 damage to all other enemies. If Mahito has used Idle Transfiguration on the main target, this skill deals 25 damage to all enemies instead.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Mental', 'Ranged', 'Instant'],
        cooldown: 2,
        energyCost: { mental: 1, random: 1 },
        power: 15,
        effects: [
          { type: 'damage', power: 15, target: 'inherit' },
          { type: 'damage', power: 15, target: 'all-enemies' },
          { type: 'damageFiltered', power: 10, requiresTag: 'idle-transfiguration', target: 'inherit' },
        ],
      }),
      skill({
        id: 'mahito-soul-experimentation',
        name: 'Soul Experimentation',
        description: 'For 3 turns, each time Mahito uses a skill on the target, one of the following effects occurs at random: he deals 10 additional damage, the target deals 10 less damage for 1 turn, or 10 damage is dealt to all enemies. If the target is defeated while this effect is active, Mahito gains 10 permanent damage increase.',
        kind: 'buff',
        targetRule: 'enemy-single',
        classes: ['Mental', 'Melee', 'Action'],
        cooldown: 4,
        energyCost: { mental: 2 },
        power: 0,
        // NOTE: Random outcome and "if defeated while active" trigger not
        // modeled. Approximated as a 3-turn +10 damage modifier on the actor.
        effects: [
          { type: 'attackUp', amount: 10, duration: 3, target: 'self' },
        ],
      }),
    ],
    ultimate: defendSkill({
      id: 'mahito-self-embodiment',
      name: 'Self-Embodiment',
      description: 'Mahito becomes invulnerable for 1 turn. During this turn, the first enemy that uses a harmful skill will have that skill negated, receive 20 damage, and be affected by Idle Transfiguration.',
      targetRule: 'self',
      classes: ['Strategic', 'Instant', 'Ultimate'],
      cooldown: 4,
      duration: 1,
      effects: [
        { type: 'invulnerable', duration: 1, target: 'inherit' },
        {
          type: 'counter',
          duration: 1,
          counterDamage: 20,
          consumeOnTrigger: true,
          target: 'self',
        },
      ],
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

