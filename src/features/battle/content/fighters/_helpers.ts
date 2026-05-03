import {
  defineAbility,
  defineFighter,
  type BattleFighterBoardMeta,
} from '@/features/battle/content.ts'
import type {
  BattleFighterTemplate,
  BattleModifierStat,
  BattleSkillDamageType,
  EffectTarget,
  SkillEffect,
} from '@/features/battle/types.ts'

export const fighterBoardMeta: Record<string, BattleFighterBoardMeta> = {
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
  maki: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Weapon Specialist',
    bio: "Maki fights with expert mastery of cursed tools, relying on precision and discipline instead of cursed energy.",
    boardPortraitFrame: { scale: 2.08, x: '0%', y: '-12%' },
  },
  ijichi: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Barrier Specialist',
    bio: 'Kiyotaka Ijichi specializes in deploying barriers that regulate the battlefield, restricting enemies and reinforcing his allies.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  yaga: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Cursed Corpse Commander',
    bio: 'Masamichi Yaga creates cursed corpses to shield himself and his allies, controlling the pace of battle through careful positioning.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  mechamaru: {
    affiliationLabel: 'Kyoto Campus',
    battleTitle: 'Remote Artillery',
    bio: 'Kokichi Muta fights through Mechamaru, channeling cursed energy into long-range weaponry and battlefield-wide pressure.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  momo: {
    affiliationLabel: 'Kyoto Campus',
    battleTitle: 'Aerial Support',
    bio: 'Momo Nishimiya supports her allies from above, maintaining distance while coordinating attacks and disrupting enemy timing.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  noritoshi: {
    affiliationLabel: 'Kyoto Campus',
    battleTitle: 'Blood Technique',
    bio: 'Noritoshi Kamo uses precise blood techniques to control battle flow, rewarding discipline and timing over brute force.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  panda: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Three Cores',
    bio: 'Panda shifts between different combat styles, balancing his base form and overwhelming power when pushed into Gorilla Mode.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  sukuna: {
    affiliationLabel: 'King of Curses',
    battleTitle: "King's Vessel",
    bio: 'Ryomen Sukuna brings devastating cursed techniques that cut through enemies while sustaining himself through sheer dominance.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  shoko: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Reverse Cursed Technique',
    bio: 'Shoko Ieiri preserves damaged bodies and keeps allies functioning through injuries that should have ended the fight.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  toge: {
    affiliationLabel: 'Tokyo Campus',
    battleTitle: 'Cursed Speech',
    bio: 'Toge Inumaki commands opponents through Cursed Speech, balancing powerful control against the strain it places on his body.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  eso: {
    affiliationLabel: 'Cursed Womb',
    battleTitle: 'Rot Punisher',
    bio: 'Eso is one of the Cursed Womb: Death Paintings, fighting with refined blood techniques and cruel punishment effects. He applies Rot to key enemies, pressures opponents who act recklessly, and turns each stack of Rot into a growing threat.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
  kechizu: {
    affiliationLabel: 'Cursed Womb',
    battleTitle: 'Rot Protector',
    bio: 'Kechizu is one of the Cursed Womb: Death Paintings, fighting with unstable cursed blood and brutal close-range attacks. He spreads Rot across the enemy team, protects his allies through his bond with Eso, and punishes enemies who try to break through his defenses.',
    boardPortraitFrame: { scale: 2.0, x: '0%', y: '-10%' },
  },
}

export function fighter(
  template: Omit<
    BattleFighterTemplate,
    'affiliationLabel' | 'battleTitle' | 'bio' | 'boardPortraitSrc' | 'boardPortraitFrame'
  >,
): BattleFighterTemplate {
  return defineFighter(template, fighterBoardMeta[template.id])
}

export const skill = defineAbility

export function modifierEffect(
  label: string,
  stat: BattleModifierStat,
  value: number | boolean,
  rounds: number | 'permanent',
  target: EffectTarget,
  tags: string[] = [],
  options: { damageClass?: BattleSkillDamageType; excludedDamageClass?: BattleSkillDamageType } = {},
): SkillEffect {
  return {
    type: 'addModifier',
    target,
    modifier: {
      label,
      stat,
      mode: typeof value === 'boolean' ? 'set' : 'flat',
      value,
      duration: rounds === 'permanent' ? { kind: 'permanent' } : { kind: 'rounds', rounds },
      tags,
      visible: true,
      stacking: 'replace',
      damageClass: options.damageClass,
      excludedDamageClass: options.excludedDamageClass,
    },
  }
}

export function markerEffect(label: string, rounds: number | 'permanent', target: EffectTarget, tags: string[]): SkillEffect {
  return modifierEffect(label, 'cooldownTick', 0, rounds, target, tags)
}
