import type {
  Archetype,
  CharacterDetailProfile,
  CharacterPassive,
  CharacterRarity,
  CharacterRosterCard,
  CharacterSkill,
  CharacterUltimate,
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
import { battleRosterById } from '@/features/battle/data'
import { countEnergyCost, getAbilityEnergyCost } from '@/features/battle/energy'
import { describeReactionCondition } from '@/features/battle/reactions'
import type { BattleAbilityTemplate, BattleFighterTemplate, PassiveEffect, SkillEffect } from '@/features/battle/types'

type BaseCharacterSeed = {
  id: string
  name: string
  rarity: CharacterRarity
  archetypes: Archetype[]
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

function mapBattleRarity(rarity: BattleFighterTemplate['rarity']): CharacterRarity {
  if (rarity === 'UR') return 'SSR'
  return rarity
}

function gradeLabelFromRarity(rarity: CharacterRarity) {
  if (rarity === 'SSR') return 'SPECIAL GRADE'
  if (rarity === 'SR') return 'GRADE 1'
  return 'GRADE 2'
}

function getAbilityTargetLabel(ability: BattleAbilityTemplate) {
  switch (ability.targetRule) {
    case 'enemy-single':
      return 'ENEMY'
    case 'enemy-all':
      return 'ENEMY ALL'
    case 'ally-single':
      return 'ALLY'
    case 'ally-all':
      return 'ALLY ALL'
    case 'self':
      return 'SELF'
    default:
      return 'FIELD'
  }
}

function getAbilityClasses(ability: BattleAbilityTemplate) {
  return Array.from(new Set([ability.kind.toUpperCase(), ...ability.classes]))
}

function mapAbilityType(ability: BattleAbilityTemplate): CharacterSkill['type'] {
  if (ability.kind === 'defend') return 'DEF'
  if (ability.kind === 'debuff') return 'STN'
  if (ability.kind === 'heal' || ability.kind === 'buff' || ability.kind === 'utility') {
    return 'SUP'
  }
  return 'ATK'
}

function deriveArchetypes(seed: BaseCharacterSeed, battleTemplate?: BattleFighterTemplate): Archetype[] {
  if (!battleTemplate) return seed.archetypes

  const tags = new Set<Archetype>()
  const roleParts = battleTemplate.role.split('/').map((part) => part.trim().toLowerCase())

  roleParts.forEach((part) => {
    if (part.includes('blaster')) tags.add('BLASTER')
    if (part.includes('striker') || part.includes('bruiser') || part.includes('execute') || part.includes('burst')) tags.add('STRIKER')
    if (part.includes('control') || part.includes('debuff')) tags.add('DISRUPTOR')
    if (part.includes('utility') || part.includes('hybrid')) tags.add('AMPLIFIER')
    if (part.includes('sustain') || part.includes('heal')) tags.add('RESTORER')
  })

  const allAbilities = battleTemplate.abilities.concat(battleTemplate.ultimate)
  if (battleTemplate.maxHp >= 108 || allAbilities.some((ability) => ability.kind === 'defend')) tags.add('GUARDIAN')
  if (allAbilities.some((ability) => ability.kind === 'heal')) tags.add('RESTORER')
  if (allAbilities.some((ability) => ability.kind === 'buff' || ability.kind === 'utility')) tags.add('AMPLIFIER')
  if (allAbilities.some((ability) => ability.kind === 'debuff')) tags.add('DISRUPTOR')
  if (allAbilities.some((ability) => ability.kind === 'attack' && ability.targetRule === 'enemy-all')) tags.add('BLASTER')
  if (allAbilities.some((ability) => ability.kind === 'attack' && ability.targetRule === 'enemy-single')) tags.add('STRIKER')

  return Array.from(tags).slice(0, 2)
}

function describeSkillEffect(effect: SkillEffect) {
  switch (effect.type) {
    case 'damage':
      return `deal ${effect.power} damage`
    case 'heal':
      return `restore ${effect.power} HP`
    case 'stun':
      return `stun for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'invulnerable':
      return `become invulnerable for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'attackUp':
      return `gain +${effect.amount} bonus damage for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'mark':
      return `mark for +${effect.bonus} damage for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'burn':
      return `burn for ${effect.damage} across ${effect.duration} turn${effect.duration === 1 ? '' : 's'}`
    case 'cooldownReduction':
      return `reduce cooldowns by ${effect.amount} extra each round`
    case 'damageBoost':
      return `gain ${Math.round(effect.amount * 100)}% bonus damage`
    case 'schedule':
      return `schedule ${effect.effects.length} delayed effect row${effect.effects.length === 1 ? '' : 's'} for ${effect.delay} ${effect.phase === 'roundStart' ? 'round start' : 'round end'}`
    case 'replaceAbility':
      return `replace ${effect.slotAbilityId} with ${effect.ability.name} for ${effect.duration} round${effect.duration === 1 ? '' : 's'}`
  }
}

function describePassive(passive: PassiveEffect): CharacterPassive {
  const triggerLabelMap: Record<PassiveEffect['trigger'], string> = {
    whileAlive: 'While Alive',
    onRoundStart: 'Round Start',
    onRoundEnd: 'Round End',
    onAbilityUse: 'On Ability Use',
    onAbilityResolve: 'On Ability Resolve',
    onDealDamage: 'On Deal Damage',
    onTakeDamage: 'On Take Damage',
    onDefeat: 'On Defeat',
    onTargetBelow: 'Execute Window',
  }

  const prefixMap: Record<PassiveEffect['trigger'], string> = {
    whileAlive: 'While alive, ',
    onRoundStart: 'At the start of each round, ',
    onRoundEnd: 'At round end, ',
    onAbilityUse: 'Before using an ability, ',
    onAbilityResolve: 'After resolving an ability, ',
    onDealDamage: 'After dealing damage, ',
    onTakeDamage: 'After taking damage, ',
    onDefeat: 'On defeat, ',
    onTargetBelow: '',
  }

  const thresholdPrefix =
    passive.trigger === 'onTargetBelow' && passive.threshold != null
      ? `Against targets below ${Math.round(passive.threshold * 100)}% HP, `
      : prefixMap[passive.trigger]

  const conditionPrefix = (passive.conditions ?? []).length > 0
    ? `${(passive.conditions ?? []).map(describeReactionCondition).join(', ')}, `
    : ''
  const effectText = passive.effects.map(describeSkillEffect).join(', ')

  return {
    label: passive.label,
    description: `${thresholdPrefix}${conditionPrefix}${effectText}.`.replace(/^./, (letter) => letter.toUpperCase()),
    triggerLabel: triggerLabelMap[passive.trigger],
  }
}


function getBasePower(ability: BattleAbilityTemplate) {
  const damageEffect = ability.effects?.find((effect): effect is Extract<SkillEffect, { type: 'damage' }> => effect.type === 'damage')
  const healEffect = ability.effects?.find((effect): effect is Extract<SkillEffect, { type: 'heal' }> => effect.type === 'heal')
  return damageEffect?.power ?? healEffect?.power ?? ability.power ?? ability.healPower
}

function mapBattleAbilityToSkill(ability: BattleAbilityTemplate): CharacterSkill {
  const energyCost = getAbilityEnergyCost(ability)

  return {
    id: ability.id,
    name: ability.name,
    type: mapAbilityType(ability),
    ceCost: countEnergyCost(energyCost),
    energyCost,
    description: ability.description,
    cooldown: ability.cooldown,
    targetLabel: getAbilityTargetLabel(ability),
    classes: getAbilityClasses(ability),
    basePower: getBasePower(ability),
  }
}

function createFallbackUltimate(seed: BaseCharacterSeed): CharacterUltimate {
  return {
    id: `${seed.id}-ultimate`,
    name: 'Domain Break: Final Exchange',
    type: 'ATK',
    ceCost: 3,
    description: 'Unleashes a high-impact finishing technique that closes a single target.',
    cooldown: 4,
    targetLabel: 'ENEMY',
    classes: ['ATTACK', 'ULT'],
    tag: 'ULTIMATE',
    basePower: 60,
  }
}

function createFallbackPassive(): CharacterPassive {
  return {
    label: 'Edge of Resolve',
    description: 'After using a high-cost skill, gain bonus damage for the next exchange.',
    triggerLabel: 'Loadout Trait',
  }
}

function defaultSkills(seed: BaseCharacterSeed): CharacterSkill[] {
  return [
    {
      id: `${seed.id}-skill-1`,
      name: `${seed.name.split(' ')[0]} Strike`,
      type: 'ATK',
      ceCost: 1,
      description: 'Deals direct single-target damage.',
      cooldown: 1,
      targetLabel: 'ENEMY',
      classes: ['ATTACK'],
      basePower: 30,
    },
    {
      id: `${seed.id}-skill-2`,
      name: 'Cursed Flow',
      type: 'SUP',
      ceCost: 1,
      description: 'Stabilizes the next exchange and grants a utility effect.',
      cooldown: 2,
      targetLabel: 'SELF',
      classes: ['UTILITY', 'BUFF'],
    },
    {
      id: `${seed.id}-skill-3`,
      name: 'Zone Break',
      type: 'STN',
      ceCost: 2,
      description: 'Pressures a guarded target and can disrupt their next turn.',
      cooldown: 3,
      targetLabel: 'ENEMY',
      classes: ['DEBUFF'],
    },
  ]
}

function profileLore(seed: BaseCharacterSeed, battleTemplate?: BattleFighterTemplate, passive?: CharacterPassive) {
  const battleLine = battleTemplate
    ? `${seed.name} fills a ${battleTemplate.role.toLowerCase()} role in arena combat, with ${passive?.label ?? 'signature passives'} shaping their timing windows.`
    : `${seed.name} is a combat-ready sorcerer whose style emphasizes ${seed.archetypes.join(' / ').toLowerCase()} patterns in team compositions.`

  return {
    backstory: [
      battleLine,
      'Within Cursed Arena, this profile exists to explain the fighter kit clearly before a match starts.',
      'The focus is tactical readability: HP pool, passive identity, and the exact techniques that define the character.',
    ],
    voiceLines: [
      { id: `${seed.id}-voice-1`, title: 'Lobby Greeting', text: 'Ready when you are. Do not waste the opening.' },
      { id: `${seed.id}-voice-2`, title: 'Skill Cast', text: 'Focus your cursed energy. Commit.' },
      { id: `${seed.id}-voice-3`, title: 'Victory', text: 'The result was decided the moment we took control.' },
    ],
  }
}

export const ownedRosterCharacters: RosterCharacter[] = baseOwnedCharacterSeeds.map((seed) => {
  const battleTemplate = battleRosterById[seed.id]
  const rarity = battleTemplate ? mapBattleRarity(battleTemplate.rarity) : seed.rarity

  return {
    id: seed.id,
    name: battleTemplate?.name ?? seed.name,
    rarity,
    archetypes: deriveArchetypes(seed, battleTemplate),
    owned: true,
    renderSrc: seed.renderSrc,
    obtainedOrder: seed.obtainedOrder,
    portraitFrame: seed.portraitFrame,
  }
})

export const characterProfiles: CharacterDetailProfile[] = baseOwnedCharacterSeeds.map((seed) => {
  const battleTemplate = battleRosterById[seed.id]
  const rarity = battleTemplate ? mapBattleRarity(battleTemplate.rarity) : seed.rarity
  const archetypes = deriveArchetypes(seed, battleTemplate)
  const passive = battleTemplate?.passiveEffects?.[0] ? describePassive(battleTemplate.passiveEffects[0]) : createFallbackPassive()
  const skills = battleTemplate ? battleTemplate.abilities.map(mapBattleAbilityToSkill) : defaultSkills(seed)
  const ultimate = battleTemplate
    ? ({ ...mapBattleAbilityToSkill(battleTemplate.ultimate), tag: 'ULTIMATE' } satisfies CharacterUltimate)
    : createFallbackUltimate(seed)

  return {
    id: seed.id,
    name: battleTemplate?.name ?? seed.name,
    rarity,
    archetypes,
    owned: true,
    renderSrc: seed.renderSrc,
    portraitFrame: seed.portraitFrame,
    detailRenderFrame: seed.detailRenderFrame,
    gradeLabel: gradeLabelFromRarity(rarity),
    hp: battleTemplate?.maxHp ?? 100,
    role: battleTemplate?.role,
    skills,
    ultimate,
    passive,
    lore: profileLore(seed, battleTemplate, passive),
  }
})

export const characterProfilesById = Object.fromEntries(
  characterProfiles.map((profile) => [profile.id, profile]),
) as Record<string, CharacterDetailProfile>

export function getCharacterProfileById(characterId: string) {
  return characterProfilesById[characterId] ?? null
}
