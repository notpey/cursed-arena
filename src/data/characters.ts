import type {
  Archetype,
  CharacterDetailProfile,
  CharacterRarity,
  CharacterRosterCard,
  CharacterSkill,
  EquipmentSealSlot,
} from '@/types/characters'
import aoiTodoRender from '@/assets/renders/Aoi_Todo_Cursed_Clash.webp'
import chosoRender from '@/assets/renders/Choso_Cursed_Clash.webp'
import kasumiMiwaRender from '@/assets/renders/Kasumi_Miwa_Cursed_Clash.webp'
import kentoNanamiRender from '@/assets/renders/Kento_Nanami_Cursed_Clash.webp'
import maiZeninRender from '@/assets/renders/Mai_Zenin_Cursed_Clash.webp'
import makiZeninRender from '@/assets/renders/Maki_Zenin_Cursed_Clash.webp'
import noritoshiKamoRender from '@/assets/renders/Noritoshi_Kamo_Cursed_Clash.webp'
import pandaRender from '@/assets/renders/Panda_29.webp'
import satoruGojoRender from '@/assets/renders/Satoru_Gojo_Cursed_Clash.webp'
import togeInumakiRender from '@/assets/renders/Toge_Inumaki_Cursed_Clash.webp'
import yujiItadoriRender from '@/assets/renders/Yuji_Itadori_Cursed_Clash.webp'
import yutaOkkotsuRender from '@/assets/renders/Yuta_Okkotsu_Cursed_Clash.webp'

export const TOTAL_CHARACTER_CAP = 40

type BaseCharacterSeed = {
  id: string
  name: string
  rarity: CharacterRarity
  archetypes: Archetype[]
  level: number
  levelProgress: number
  limitBreak: number
  renderSrc: string
  obtainedOrder: number
  portraitFrame?: CharacterRosterCard['portraitFrame']
  detailRenderFrame?: CharacterDetailProfile['detailRenderFrame']
}

const baseOwnedCharacterSeeds: BaseCharacterSeed[] = [
  {
    id: 'gojo',
    name: 'Satoru Gojo',
    rarity: 'SSR',
    archetypes: ['BLASTER', 'AMPLIFIER'],
    level: 80,
    levelProgress: 72,
    limitBreak: 5,
    renderSrc: satoruGojoRender,
    obtainedOrder: 11,
    portraitFrame: { scale: 1.8, y: '14%' },
    detailRenderFrame: { scale: 0.94, x: '4%', y: '2%', maxWidth: '34.5rem' },
  },
  {
    id: 'yuji',
    name: 'Yuji Itadori',
    rarity: 'SSR',
    archetypes: ['STRIKER'],
    level: 76,
    levelProgress: 48,
    limitBreak: 4,
    renderSrc: yujiItadoriRender,
    obtainedOrder: 10,
    portraitFrame: { scale: 1.74, y: '13%' },
    detailRenderFrame: { scale: 1, x: '2%', y: '4%', maxWidth: '37rem' },
  },
  {
    id: 'yuta',
    name: 'Yuta Okkotsu',
    rarity: 'SSR',
    archetypes: ['AMPLIFIER', 'STRIKER'],
    level: 73,
    levelProgress: 41,
    limitBreak: 3,
    renderSrc: yutaOkkotsuRender,
    obtainedOrder: 9,
    portraitFrame: { scale: 1.72, y: '12%' },
    detailRenderFrame: { scale: 0.98, x: '2%', y: '4%', maxWidth: '35rem' },
  },
  {
    id: 'nanami',
    name: 'Kento Nanami',
    rarity: 'SR',
    archetypes: ['GUARDIAN', 'STRIKER'],
    level: 68,
    levelProgress: 64,
    limitBreak: 3,
    renderSrc: kentoNanamiRender,
    obtainedOrder: 8,
    portraitFrame: { scale: 1.64, y: '13%' },
    detailRenderFrame: { scale: 0.96, x: '2%', y: '6%', maxWidth: '34rem' },
  },
  {
    id: 'todo',
    name: 'Aoi Todo',
    rarity: 'SR',
    archetypes: ['STRIKER', 'DISRUPTOR'],
    level: 65,
    levelProgress: 22,
    limitBreak: 2,
    renderSrc: aoiTodoRender,
    obtainedOrder: 7,
    portraitFrame: { scale: 1.62, y: '11%' },
    detailRenderFrame: { scale: 0.94, x: '3%', y: '5%', maxWidth: '36rem' },
  },
  {
    id: 'inumaki',
    name: 'Toge Inumaki',
    rarity: 'SR',
    archetypes: ['DISRUPTOR', 'AMPLIFIER'],
    level: 62,
    levelProgress: 87,
    limitBreak: 2,
    renderSrc: togeInumakiRender,
    obtainedOrder: 6,
    portraitFrame: { scale: 1.68, y: '14%' },
    detailRenderFrame: { scale: 0.96, x: '1%', y: '6%', maxWidth: '33rem' },
  },
  {
    id: 'choso',
    name: 'Choso',
    rarity: 'SR',
    archetypes: ['BLASTER', 'DISRUPTOR'],
    level: 60,
    levelProgress: 30,
    limitBreak: 1,
    renderSrc: chosoRender,
    obtainedOrder: 5,
    portraitFrame: { scale: 1.62, y: '12%' },
    detailRenderFrame: { scale: 0.95, x: '3%', y: '5%', maxWidth: '35rem' },
  },
  {
    id: 'maki',
    name: 'Maki Zenin',
    rarity: 'SR',
    archetypes: ['STRIKER', 'GUARDIAN'],
    level: 57,
    levelProgress: 53,
    limitBreak: 2,
    renderSrc: makiZeninRender,
    obtainedOrder: 4,
    portraitFrame: { scale: 1.68, y: '13%' },
    detailRenderFrame: { scale: 0.95, x: '2%', y: '4%', maxWidth: '33rem' },
  },
  {
    id: 'mai',
    name: 'Mai Zenin',
    rarity: 'R',
    archetypes: ['BLASTER'],
    level: 44,
    levelProgress: 18,
    limitBreak: 1,
    renderSrc: maiZeninRender,
    obtainedOrder: 3,
    portraitFrame: { scale: 1.62, y: '13%' },
    detailRenderFrame: { scale: 0.92, x: '1%', y: '6%', maxWidth: '31rem' },
  },
  {
    id: 'miwa',
    name: 'Kasumi Miwa',
    rarity: 'R',
    archetypes: ['GUARDIAN', 'RESTORER'],
    level: 41,
    levelProgress: 69,
    limitBreak: 0,
    renderSrc: kasumiMiwaRender,
    obtainedOrder: 2,
    portraitFrame: { scale: 1.72, y: '13%' },
    detailRenderFrame: { scale: 0.92, x: '2%', y: '6%', maxWidth: '30rem' },
  },
  {
    id: 'kamo',
    name: 'Noritoshi Kamo',
    rarity: 'R',
    archetypes: ['BLASTER', 'DISRUPTOR'],
    level: 38,
    levelProgress: 27,
    limitBreak: 0,
    renderSrc: noritoshiKamoRender,
    obtainedOrder: 1,
    portraitFrame: { scale: 1.68, y: '10%' },
    detailRenderFrame: { scale: 0.94, x: '2%', y: '4%', maxWidth: '35rem' },
  },
  {
    id: 'panda',
    name: 'Panda',
    rarity: 'R',
    archetypes: ['GUARDIAN'],
    level: 35,
    levelProgress: 45,
    limitBreak: 1,
    renderSrc: pandaRender,
    obtainedOrder: 0,
    portraitFrame: { scale: 1.8, y: '14%' },
    detailRenderFrame: { scale: 0.94, x: '4%', y: '6%', maxWidth: '34rem' },
  },
]

export type RosterCharacter = CharacterRosterCard & {
  archetypes: Archetype[]
  obtainedOrder: number
}

export const ownedRosterCharacters: RosterCharacter[] = baseOwnedCharacterSeeds.map((seed) => ({
  id: seed.id,
  name: seed.name,
  rarity: seed.rarity,
  archetypes: seed.archetypes,
  level: seed.level,
  levelProgress: seed.levelProgress,
  limitBreak: seed.limitBreak,
  owned: true,
  renderSrc: seed.renderSrc,
  obtainedOrder: seed.obtainedOrder,
  portraitFrame: seed.portraitFrame,
}))

function buildStats(seed: BaseCharacterSeed) {
  const rarityMultiplier = seed.rarity === 'SSR' ? 1.18 : seed.rarity === 'SR' ? 1.04 : 0.92
  const hp = Math.round((850 + seed.level * 28) * rarityMultiplier)
  const atk = Math.round((140 + seed.level * 7.2) * rarityMultiplier)
  const def = Math.round((110 + seed.level * 5.8) * rarityMultiplier)
  const ceMax = Math.round((90 + seed.level * 4.5) * rarityMultiplier)
  const ct = Math.round((70 + seed.level * 4.8) * rarityMultiplier)

  return {
    current: { hp, atk, def, ceMax, ct },
    max: {
      hp: Math.round(hp * 1.25),
      atk: Math.round(atk * 1.2),
      def: Math.round(def * 1.18),
      ceMax: Math.round(ceMax * 1.22),
      ct: Math.round(ct * 1.24),
    },
  }
}

function defaultSkills(seed: BaseCharacterSeed): CharacterSkill[] {
  return [
    {
      id: `${seed.id}-skill-1`,
      name: `${seed.name.split(' ')[0]} Strike`,
      type: 'ATK',
      ceCost: 2,
      description: 'Deals targeted damage and applies a short pressure debuff to the enemy frontline.',
      cooldown: 1,
    },
    {
      id: `${seed.id}-skill-2`,
      name: 'Cursed Flow',
      type: 'SUP',
      ceCost: 3,
      description: 'Stabilizes CE output, granting turn-meter acceleration and minor shield value.',
      cooldown: 2,
    },
    {
      id: `${seed.id}-skill-3`,
      name: 'Zone Break',
      type: 'STN',
      ceCost: 4,
      description: 'Pressures a guarded target and has a chance to inflict stagger for 1 turn.',
      cooldown: 3,
    },
    {
      id: `${seed.id}-skill-4`,
      name: 'Guard Pulse',
      type: 'DEF',
      ceCost: 2,
      description: 'Raises defense and redirects a portion of incoming damage for the next exchange.',
      cooldown: 2,
    },
  ]
}

function defaultEquipmentSlots(seed: BaseCharacterSeed): EquipmentSealSlot[] {
  const equippedNames = [
    `${seed.name.split(' ')[0]} Crown Sigil`,
    `${seed.name.split(' ')[0]} Core Matrix`,
  ]

  return [
    {
      slot: 'CROWN SEAL',
      equipped: true,
      itemName: equippedNames[0],
      mainStat: '+12% Crit Rate',
      subStats: ['+4% ATK', '+18 CE', '+6 SPD'],
      setName: 'Exorcist Regalia',
    },
    {
      slot: 'CORE SEAL',
      equipped: true,
      itemName: equippedNames[1],
      mainStat: '+10% Skill Damage',
      subStats: ['+7% HP', '+8 DEF', '+5% CT'],
      setName: 'Exorcist Regalia',
    },
    {
      slot: 'GRASP SEAL',
      equipped: false,
    },
    {
      slot: 'RELIC',
      equipped: false,
    },
  ]
}

function gradeLabelFromRarity(rarity: CharacterRarity) {
  if (rarity === 'SSR') return 'SPECIAL GRADE'
  if (rarity === 'SR') return 'GRADE 1'
  return 'GRADE 2'
}

function profileLore(seed: BaseCharacterSeed) {
  return {
    backstory: [
      `${seed.name} is a combat-ready sorcerer whose style emphasizes ${seed.archetypes
        .join(' / ')
        .toLowerCase()} patterns in team compositions.`,
      'Within the Cursed Arena system, this profile tracks progression, equipment optimization, and tactical role fit across PvP and story content.',
      'A prized roster unit should feel like a maintained weapon: tuned, upgraded, and clearly understood before deployment.',
    ],
    voiceLines: [
      { id: `${seed.id}-voice-1`, title: 'Lobby Greeting', text: 'Ready when you are. Do not waste the opening.' },
      { id: `${seed.id}-voice-2`, title: 'Skill Cast', text: 'Focus your cursed energy. Commit.' },
      { id: `${seed.id}-voice-3`, title: 'Victory', text: 'The result was decided the moment we took control.' },
    ],
  }
}

export const characterProfiles: CharacterDetailProfile[] = baseOwnedCharacterSeeds.map((seed) => {
  const { current, max } = buildStats(seed)
  const levelCap = seed.rarity === 'SSR' ? 80 : seed.rarity === 'SR' ? 70 : 60
  const xpToNext = 1000
  const xpCurrent = Math.round((seed.levelProgress / 100) * xpToNext)

  return {
    id: seed.id,
    name: seed.name,
    rarity: seed.rarity,
    archetypes: seed.archetypes,
    level: seed.level,
    levelProgress: seed.levelProgress,
    limitBreak: seed.limitBreak,
    owned: true,
    renderSrc: seed.renderSrc,
    portraitFrame: seed.portraitFrame,
    detailRenderFrame: seed.detailRenderFrame,
    gradeLabel: gradeLabelFromRarity(seed.rarity),
    levelCap,
    xpCurrent,
    xpToNext,
    stats: current,
    statMax: max,
    skills: defaultSkills(seed),
    ultimate: {
      id: `${seed.id}-ultimate`,
      name: 'Domain Break: Final Exchange',
      type: 'ATK',
      ceCost: 8,
      description:
        'Unleashes a high-impact finishing technique that scales with missing CE and applies a control effect on hit.',
      cooldown: 4,
      tag: 'ULTIMATE',
    },
    bindingVow: {
      id: `${seed.id}-vow`,
      name: 'Measured Sacrifice',
      condition: 'Trigger below 50% HP at the start of turn.',
      sacrifice: 'Lose 20% current CE and disable Guard Pulse for 1 turn.',
      reward: 'Gain +25% ATK and +20% CT potency for 2 turns.',
    },
    equipmentSlots: defaultEquipmentSlots(seed),
    inscription: {
      equipped: true,
      name: 'Edge of Resolve',
      passive: 'After using a 3+ CE skill, gain 8% damage reduction for 1 turn.',
      level: 4,
    },
    setBonus: '2-PIECE: +15% Skill Damage',
    lore: profileLore(seed),
  }
})

export const characterProfilesById = Object.fromEntries(
  characterProfiles.map((profile) => [profile.id, profile]),
) as Record<string, CharacterDetailProfile>

export function getCharacterProfileById(characterId: string) {
  return characterProfilesById[characterId] ?? null
}
