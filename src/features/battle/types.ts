import type { BattleEnergyPool, BattleEnergyCost } from '@/features/battle/energy'

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
  energyCost?: BattleEnergyCost
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
  boardPortraitSrc?: string
  portraitFrame?: BattlePortraitFrame
  boardPortraitFrame?: BattlePortraitFrame
  maxHp: number
  passiveEffects?: PassiveEffect[]
  abilities: BattleAbilityTemplate[]
  ultimate: BattleAbilityTemplate
}

export type BattleStatusKind = 'stun' | 'invincible' | 'mark' | 'burn' | 'attackUp'

export type BattleStatus =
  | { kind: 'stun'; duration: number }
  | { kind: 'invincible'; duration: number }
  | { kind: 'mark'; duration: number; bonus: number }
  | { kind: 'burn'; duration: number; damage: number }
  | { kind: 'attackUp'; duration: number; amount: number }

export type BattleStatuses = BattleStatus[]

export type BattleModifierScope = 'fighter' | 'team' | 'battlefield'

export type BattleModifierStat =
  | 'damageDealt'
  | 'damageTaken'
  | 'healDone'
  | 'healTaken'
  | 'cooldownTick'
  | 'dotDamage'
  | 'canAct'
  | 'isInvulnerable'

export type BattleModifierMode = 'flat' | 'percentAdd' | 'multiplier' | 'set'

export type BattleModifierStacking = 'max' | 'replace' | 'stack'

export type BattleModifierValue = number | boolean | string

export type BattleModifierDurationTemplate =
  | { kind: 'rounds'; rounds: number }
  | { kind: 'permanent' }
  | { kind: 'untilRemoved' }

export type BattleModifierDuration =
  | { kind: 'rounds'; remaining: number }
  | { kind: 'permanent' }
  | { kind: 'untilRemoved' }

export type BattleModifierTemplate = {
  label: string
  scope?: BattleModifierScope
  stat: BattleModifierStat
  mode: BattleModifierMode
  value: BattleModifierValue
  duration: BattleModifierDurationTemplate
  tags: string[]
  visible?: boolean
  stacking?: BattleModifierStacking
  statusKind?: BattleStatusKind
}

export type BattleModifierFilter = {
  label?: string
  scope?: BattleModifierScope
  stat?: BattleModifierStat
  tags?: string[]
  sourceAbilityId?: string
  sourceActorId?: string
  statusKind?: BattleStatusKind
}

export type BattleModifierInstance = {
  id: string
  label: string
  sourceActorId?: string
  sourceAbilityId?: string
  scope: BattleModifierScope
  targetId?: string
  stat: BattleModifierStat
  mode: BattleModifierMode
  value: BattleModifierValue
  duration: BattleModifierDuration
  tags: string[]
  visible: boolean
  stacking: BattleModifierStacking
  statusKind?: BattleStatusKind
}

export type BattleReactionCondition =
  | { type: 'selfHpBelow'; threshold: number }
  | { type: 'targetHpBelow'; threshold: number }
  | { type: 'actorHasStatus'; status: BattleStatusKind }
  | { type: 'targetHasStatus'; status: BattleStatusKind }
  | { type: 'abilityId'; abilityId: string }
  | { type: 'abilityTag'; tag: BattleAbilityTag }
  | { type: 'isUltimate' }

export type BattleScheduledPhase = 'roundStart' | 'roundEnd'

export type BattleAbilityStateDelta =
  | { mode: 'replace'; slotAbilityId: string; replacement: BattleAbilityTemplate; duration: number }
  | { mode: 'grant'; grantedAbility: BattleAbilityTemplate; duration: number }
  | { mode: 'lock'; slotAbilityId: string; duration: number }

export type BattleScheduledEffect = {
  id: string
  actorId: string
  targetIds: string[]
  abilityId?: string
  dueRound: number
  phase: BattleScheduledPhase
  effects: SkillEffect[]
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
  boardPortraitSrc?: string
  portraitFrame?: BattlePortraitFrame
  boardPortraitFrame?: BattlePortraitFrame
  maxHp: number
  hp: number
  passiveEffects?: PassiveEffect[]
  abilities: BattleAbilityTemplate[]
  ultimate: BattleAbilityTemplate
  cooldowns: Record<string, number>
  statuses: BattleStatuses
  modifiers: BattleModifierInstance[]
  abilityState: BattleAbilityStateDelta[]
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

export type BattleResourceKey = 'reserve' | 'physical' | 'technique' | 'vow' | 'mental'

export type BattleDamagePacket = {
  kind: 'damage'
  sourceActorId?: string
  targetId: string
  abilityId?: string
  baseAmount: number
  amount: number
  damageType: 'normal' | 'burn' | 'fatigue' | 'true'
  tags: string[]
  flags: {
    isUltimate?: boolean
    isStatusTick?: boolean
    ignoresInvulnerability?: boolean
  }
}

export type BattleHealPacket = {
  kind: 'heal'
  sourceActorId?: string
  targetId: string
  abilityId?: string
  baseAmount: number
  amount: number
  tags: string[]
  flags: {
    isRoundStart?: boolean
    isRegen?: boolean
  }
}

export type BattleResourcePacket = {
  kind: 'resource'
  sourceActorId?: string
  targetTeam: BattleTeamId
  abilityId?: string
  mode: 'gain' | 'spend' | 'refresh' | 'set'
  amounts: Partial<Record<BattleResourceKey, number>>
  tags: string[]
}

export type BattleRuntimePacket = BattleDamagePacket | BattleHealPacket | BattleResourcePacket

export type BattleRuntimeEventType =
  | 'round_started'
  | 'round_ended'
  | 'ability_used'
  | 'ability_resolved'
  | 'damage_would_apply'
  | 'damage_applied'
  | 'damage_blocked'
  | 'heal_would_apply'
  | 'heal_applied'
  | 'resource_changed'
  | 'modifier_applied'
  | 'modifier_removed'
  | 'fighter_defeated'
  | 'status_applied'
  | 'status_removed'
  | 'scheduled_effect_created'
  | 'scheduled_effect_resolved'

export type BattleRuntimeEvent = {
  id: string
  round: number
  type: BattleRuntimeEventType
  actorId?: string
  targetId?: string
  team?: BattleTeamId
  abilityId?: string
  amount?: number
  tags?: string[]
  packet?: BattleRuntimePacket
  meta?: Record<string, string | number | boolean | null>
}

export type BattleResolutionResult = {
  state: BattleState
  events: BattleEvent[]
  runtimeEvents: BattleRuntimeEvent[]
}

export type BattleTimelineStepKind = 'action' | 'roundEnd' | 'roundStart' | 'system'

export type BattleTimelineStep = {
  id: string
  kind: BattleTimelineStepKind
  round: number
  state: BattleState
  events: BattleEvent[]
  runtimeEvents: BattleRuntimeEvent[]
  actorId?: string
  targetId?: string
  team?: BattleTeamId
  abilityId?: string
}

export type BattleTimelineResult = {
  state: BattleState
  steps: BattleTimelineStep[]
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
  | { type: 'addModifier'; modifier: BattleModifierTemplate; target: EffectTarget }
  | { type: 'removeModifier'; filter: BattleModifierFilter; target: EffectTarget }
  | { type: 'modifyAbilityState'; delta: BattleAbilityStateDelta; target: EffectTarget }
  | { type: 'schedule'; delay: number; phase: BattleScheduledPhase; effects: SkillEffect[]; target: EffectTarget }
  | { type: 'replaceAbility'; duration: number; slotAbilityId: string; ability: BattleAbilityTemplate; target: EffectTarget }

export type PassiveTrigger =
  | 'onDealDamage'
  | 'onRoundStart'
  | 'onRoundEnd'
  | 'onAbilityUse'
  | 'onAbilityResolve'
  | 'onTakeDamage'
  | 'onDefeat'
  | 'whileAlive'
  | 'onTargetBelow'

export type PassiveEffect = {
  trigger: PassiveTrigger
  threshold?: number
  conditions?: BattleReactionCondition[]
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
  battleSeed: string
  round: number
  phase: TurnPhase
  firstPlayer: BattleTeamId
  activePlayer: BattleTeamId
  battlefield: BattlefieldEffect
  playerEnergy: BattleEnergyPool
  enemyEnergy: BattleEnergyPool
  playerTeam: BattleFighterState[]
  enemyTeam: BattleFighterState[]
  playerTeamModifiers: BattleModifierInstance[]
  enemyTeamModifiers: BattleModifierInstance[]
  battlefieldModifiers: BattleModifierInstance[]
  scheduledEffects: BattleScheduledEffect[]
  winner: BattleTeamId | null
}



