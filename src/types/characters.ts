import type { BattleEnergyCost } from '@/features/battle/energy'

export type CharacterRarity = 'R' | 'SR' | 'SSR'

export type Archetype =
  | 'STRIKER'
  | 'BLASTER'
  | 'GUARDIAN'
  | 'AMPLIFIER'
  | 'DISRUPTOR'
  | 'RESTORER'

export type CharacterRosterCard = {
  id: string
  name: string
  rarity: CharacterRarity
  archetypes: Archetype[]
  owned: boolean
  renderSrc?: string
  portraitFrame?: {
    scale?: number
    x?: string
    y?: string
    opacity?: number
  }
}

export type CharacterSkill = {
  id: string
  name: string
  type: 'ATK' | 'DEF' | 'STN' | 'SUP'
  ceCost: number
  energyCost?: BattleEnergyCost
  description: string
  cooldown?: number
  targetLabel?: string
  classes?: string[]
  basePower?: number
}

export type CharacterUltimate = CharacterSkill & {
  tag: 'ULTIMATE'
}

export type CharacterPassive = {
  label: string
  description: string
  triggerLabel?: string
}

export type CharacterDetailProfile = CharacterRosterCard & {
  gradeLabel: string
  hp: number
  role?: string
  skills: CharacterSkill[]
  ultimate: CharacterUltimate
  passive: CharacterPassive
  lore: {
    backstory: string[]
    voiceLines: Array<{ id: string; title: string; text: string }>
  }
  detailRenderFrame?: {
    scale?: number
    x?: string
    y?: string
    maxWidth?: string
    nameOffsetX?: string
    nameOffsetY?: string
  }
}
