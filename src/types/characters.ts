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
  level: number
  levelProgress: number
  limitBreak: number
  owned: boolean
  renderSrc?: string
  portraitFrame?: {
    scale?: number
    x?: string
    y?: string
    opacity?: number
  }
}

export type CharacterStats = {
  hp: number
  atk: number
  def: number
  ceMax: number
  ct: number
}

export type CharacterSkill = {
  id: string
  name: string
  type: 'ATK' | 'DEF' | 'STN' | 'SUP'
  ceCost: number
  description: string
  cooldown?: number
}

export type CharacterUltimate = CharacterSkill & {
  tag: 'ULTIMATE'
}

export type BindingVow = {
  id: string
  name: string
  condition: string
  sacrifice: string
  reward: string
}

export type EquipmentSlotKey = 'CROWN SEAL' | 'CORE SEAL' | 'GRASP SEAL' | 'RELIC'

export type EquipmentSealSlot = {
  slot: EquipmentSlotKey
  equipped: boolean
  itemName?: string
  mainStat?: string
  subStats?: string[]
  setName?: string
}

export type InscriptionSlot = {
  equipped: boolean
  name?: string
  passive?: string
  level?: number
}

export type CharacterDetailProfile = CharacterRosterCard & {
  gradeLabel: string
  levelCap: number
  xpCurrent: number
  xpToNext: number
  stats: CharacterStats
  statMax: CharacterStats
  skills: CharacterSkill[]
  ultimate: CharacterUltimate
  bindingVow: BindingVow
  equipmentSlots: EquipmentSealSlot[]
  inscription: InscriptionSlot
  setBonus: string
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

