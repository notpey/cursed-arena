import type { BattleEnergyPool } from '@/features/battle/energy'

export type BattleTeamId = 'player' | 'enemy'

export type BattleBoardAccent = 'teal' | 'red' | 'gold' | 'frost'

export type BattleAbilityKind =
  | 'attack'
  | 'heal'
  | 'defend'
  | 'buff'
  | 'debuff'
  | 'utility'
  | 'pass'

export type BattleTargetRule =
  | 'none'
  | 'self'
  | 'enemy-single'
  | 'enemy-all'
  | 'ally-single'
  | 'ally-all'

export type BattleAbilityTag = 'ATK' | 'HEAL' | 'BUFF' | 'DEBUFF' | 'UTILITY' | 'ULT'

export type BattleAbilityIcon = {
  src?: string
  label: string
  tone: BattleBoardAccent
}

export type BattleAbilityTemplate = {
  id: string
  name: string
  description: string
  kind: BattleAbilityKind
  targetRule: BattleTargetRule
  tags: BattleAbilityTag[]
  icon: BattleAbilityIcon
  cooldown: number
  energyCost?: Partial<Record<'physical' | 'technique' | 'vow' | 'mental', number>>
  effects?: SkillEffect[]
  power?: number
  healPower?: number
  attackBuffAmount?: number
  statusTurns?: number
  statusPower?: number
}

export type BattlePortraitFrame = {
  scale?: number
  x?: string
  y?: string
  maxWidth?: string
  opacity?: number
}

export type BattleFighterTemplate = {
  id: string
  name: string
  shortName: string
  rarity: 'R' | 'SR' | 'SSR' | 'UR'
  role: string
  affiliationLabel: string
  battleTitle: string
  bio: string
  renderSrc: string
  boardPortraitSrc: string
  portraitFrame?: BattlePortraitFrame
  boardPortraitFrame?: BattlePortraitFrame
  maxHp: number
  passiveEffects?: PassiveEffect[]
  abilities: BattleAbilityTemplate[]
  ultimate: BattleAbilityTemplate
}

export type BattleStatuses = {
  stun: number
  invincible: number
  markTurns: number
  markBonus: number
  burnTurns: number
  burnDamage: number
  attackUpTurns: number
  attackUpAmount: number
}

export type BattleFighterState = {
  instanceId: string
  templateId: string
  team: BattleTeamId
  slot: number
  name: string
  shortName: string
  rarity: BattleFighterTemplate['rarity']
  role: string
  affiliationLabel: string
  battleTitle: string
  bio: string
  renderSrc: string
  boardPortraitSrc: string
  portraitFrame?: BattlePortraitFrame
  boardPortraitFrame?: BattlePortraitFrame
  maxHp: number
  hp: number
  passiveEffects?: PassiveEffect[]
  abilities: BattleAbilityTemplate[]
  ultimate: BattleAbilityTemplate
  cooldowns: Record<string, number>
  statuses: BattleStatuses
}

export type BattlefieldEffect = {
  id: string
  name: string
  label: string
  description: string
  potency: number
  ultimateDamageBoost: number
  fatigueStartsRound: number
}

export type BattleUserProfile = {
  username: string
  title: string
  initials: string
  accent: BattleBoardAccent
}

export type QueuedBattleAction = {
  actorId: string
  team: BattleTeamId
  abilityId: string
  targetId?: string | null
}

export type BattleEventKind =
  | 'phase'
  | 'action'
  | 'damage'
  | 'heal'
  | 'status'
  | 'system'
  | 'defeat'
  | 'victory'

export type BattleEventTone = 'red' | 'teal' | 'gold' | 'frost'

export type BattleEvent = {
  id: string
  round: number
  kind: BattleEventKind
  tone: BattleEventTone
  message: string
  actorId?: string
  targetId?: string
  abilityId?: string
  amount?: number
}

export type EffectTarget = 'inherit' | 'self' | 'all-allies' | 'all-enemies'

export type SkillEffect =
  | { type: 'damage'; power: number; target: EffectTarget }
  | { type: 'heal'; power: number; target: EffectTarget }
  | { type: 'invulnerable'; duration: number; target: EffectTarget }
  | { type: 'attackUp'; amount: number; duration: number; target: EffectTarget }
  | { type: 'stun'; duration: number; target: EffectTarget }
  | { type: 'mark'; bonus: number; duration: number; target: EffectTarget }
  | { type: 'burn'; damage: number; duration: number; target: EffectTarget }
  | { type: 'cooldownReduction'; amount: number; target: EffectTarget }
  | { type: 'damageBoost'; amount: number; target: EffectTarget }

export type PassiveTrigger = 'onDealDamage' | 'onRoundStart' | 'whileAlive' | 'onTargetBelow'

export type PassiveEffect = {
  trigger: PassiveTrigger
  threshold?: number
  effects: SkillEffect[]
  label: string
}

export type TurnPhase =
  | 'coinFlip'
  | 'firstPlayerCommand'
  | 'firstPlayerResolve'
  | 'secondPlayerCommand'
  | 'secondPlayerResolve'
  | 'roundEnd'
  | 'finished'

export type BattleState = {
  round: number
  phase: TurnPhase
  firstPlayer: BattleTeamId
  activePlayer: BattleTeamId
  battlefield: BattlefieldEffect
  playerEnergy: BattleEnergyPool
  enemyEnergy: BattleEnergyPool
  playerTeam: BattleFighterState[]
  enemyTeam: BattleFighterState[]
  winner: BattleTeamId | null
}
