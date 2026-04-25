import type { BattleEnergyPool, BattleEnergyCost, BattleEnergyType } from '@/features/battle/energy.ts'

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

export type BattleSkillRange = 'Melee' | 'Ranged'
export type BattleSkillDamageType = 'Physical' | 'Energy' | 'Affliction' | 'Mental'
export type BattleSkillActionType = 'Instant' | 'Action' | 'Control'
export type BattleSkillClass =
  | BattleSkillRange
  | BattleSkillDamageType
  | BattleSkillActionType
  | 'Unique'
  | 'Ultimate'
  | 'Strategic'
  | 'Special'

export const battleSkillRangeValues: BattleSkillRange[] = ['Melee', 'Ranged']
export const battleSkillDamageTypeValues: BattleSkillDamageType[] = ['Physical', 'Energy', 'Affliction', 'Mental']
export const battleSkillActionTypeValues: BattleSkillActionType[] = ['Instant', 'Action', 'Control']

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
  classes: BattleSkillClass[]
  icon: BattleAbilityIcon
  cooldown: number
  cannotBeCountered?: boolean
  cannotBeReflected?: boolean
  requiredTargetTags?: string[]
  energyCost?: BattleEnergyCost
  effects?: SkillEffect[]
  power?: number
  healPower?: number
  attackBuffAmount?: number
  statusTurns?: number
  statusPower?: number
}

export type BattleCostModifierMode = 'set' | 'reduceTyped' | 'reduceRandom' | 'increaseRandom' | 'increaseTyped'

export type BattleCostModifierTemplate = {
  label: string
  abilityId?: string
  abilityClass?: BattleSkillClass
  mode: BattleCostModifierMode
  cost?: BattleEnergyCost
  amount?: number
  duration: number
  uses?: number
}

export type BattleCostModifierState = BattleCostModifierTemplate & {
  id: string
  remainingRounds: number
  remainingUses: number | null
  sourceActorId?: string
  sourceAbilityId?: string
}

export type BattleEffectImmunityBlock =
  | 'damage'
  | 'damageScaledByCounter'
  | 'shieldDamage'
  | 'energyGain'
  | 'energyDrain'
  | 'energySteal'
  | 'cooldownAdjust'
  | 'breakShield'
  | 'heal'
  | 'invulnerable'
  | 'attackUp'
  | 'stun'
  | 'classStun'
  | 'mark'
  | 'burn'
  | 'cooldownReduction'
  | 'damageBoost'
  | 'addModifier'
  | 'removeModifier'
  | 'modifyAbilityState'
  | 'replaceAbilities'
  | 'schedule'
  | 'replaceAbility'
  | 'shield'
  | 'modifyAbilityCost'
  | 'effectImmunity'
  | 'setFlag'
  | 'adjustCounter'
  | 'counter'
  | 'reflect'
  | 'nonDamage'

export type BattleEffectImmunityState = {
  id: string
  label: string
  blocks: BattleEffectImmunityBlock[]
  remainingRounds: number
  tags?: string[]
  sourceActorId?: string
  sourceAbilityId?: string
}

export type BattleShieldState = {
  amount: number
  label: string
  sourceActorId?: string
  sourceAbilityId?: string
  tags: string[]
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
  initialStateCounters?: Record<string, number>
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
  | 'isUndying'
  | 'canGainInvulnerable'
  | 'canReduceDamageTaken'

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
  /** When set on damageTaken modifiers, only applies to damage from abilities with this class */
  damageClass?: BattleSkillDamageType
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
  // Round in which this modifier was applied. Used to skip the first
  // end-of-round tick for disabling statuses (stun) so their duration
  // measures victim turns, not applier turns.
  appliedInRound?: number
  /** When set on damageTaken modifiers, only applies to damage from abilities with this class */
  damageClass?: BattleSkillDamageType
}

export type BattleClassStunState = {
  id: string
  label: string
  blockedClasses: BattleSkillClass[]
  remainingRounds: number
  // Round in which this class-stun was applied. The end-of-round tick for
  // that same round is skipped so "duration: N" always means N victim turns.
  appliedInRound?: number
  sourceActorId?: string
  sourceAbilityId?: string
}

export type BattleReactionGuardKind = 'counter' | 'reflect' | 'effect'

export type BattleReactionTrigger =
  | 'onAbilityUse'
  | 'onBeingTargeted'
  | 'onDamageApplied'
  | 'onDamageBlocked'
  | 'onShieldBroken'
  | 'onDefeat'
  | 'onDefeatEnemy'

export type BattleReactionGuardState = {
  id: string
  kind: BattleReactionGuardKind
  label: string
  remainingRounds: number
  appliedInRound?: number
  counterDamage?: number
  abilityClasses?: BattleSkillClass[]
  consumeOnTrigger: boolean
  trigger?: BattleReactionTrigger
  harmfulOnly?: boolean
  oncePerRound?: boolean
  triggeredRounds?: number[]
  effects?: SkillEffect[]
  sourceActorId?: string
  sourceAbilityId?: string
}

export type BattleReactionCondition =
  | { type: 'selfHpBelow'; threshold: number }
  | { type: 'targetHpBelow'; threshold: number }
  | { type: 'actorHasStatus'; status: BattleStatusKind }
  | { type: 'targetHasStatus'; status: BattleStatusKind }
  | { type: 'actorHasModifierTag'; tag: string }
  | { type: 'targetHasModifierTag'; tag: string }
  | { type: 'abilityId'; abilityId: string }
  | { type: 'abilityClass'; class: BattleSkillClass }
  | { type: 'fighterFlag'; key: string; value: boolean }
  | { type: 'counterAtLeast'; key: string; value: number }
  | { type: 'targetCounterAtLeast'; key: string; value: number }
  | { type: 'usedAbilityLastTurn'; abilityId: string }
  | { type: 'shieldActive'; tag?: string }
  | { type: 'brokenShieldTag'; tag: string }
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
  shield: BattleShieldState | null
  costModifiers: BattleCostModifierState[]
  effectImmunities: BattleEffectImmunityState[]
  stateFlags: Record<string, boolean>
  stateCounters: Record<string, number>
  lastUsedAbilityId: string | null
  classStuns: BattleClassStunState[]
  reactionGuards: BattleReactionGuardState[]
  lastAttackerId: string | null
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
  randomCostAllocation?: Partial<Record<BattleEnergyType, number>>
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
    isPiercing?: boolean
    cannotBeCountered?: boolean
    cannotBeReflected?: boolean
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
  | 'shield_applied'
  | 'shield_damaged'
  | 'shield_broken'
  | 'ability_cost_modified'
  | 'fighter_flag_changed'
  | 'counter_changed'
  | 'effect_ignored'
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

export type EffectTarget = 'inherit' | 'self' | 'all-allies' | 'all-enemies' | 'other-enemies' | 'attacker' | 'random-enemy'

export type SkillEffect =
  | { type: 'damage'; power: number; target: EffectTarget; piercing?: boolean; cannotBeCountered?: boolean; cannotBeReflected?: boolean }
  | { type: 'damageFiltered'; power: number; requiresTag: string; target: EffectTarget; piercing?: boolean; cannotBeCountered?: boolean; cannotBeReflected?: boolean }
  | { type: 'damageScaledByCounter'; counterKey: string; powerPerStack: number; consumeStacks: boolean; modifierTag?: string; requiresTag?: string; target: EffectTarget; piercing?: boolean; cannotBeCountered?: boolean; cannotBeReflected?: boolean; counterSource?: 'actor' | 'target' }
  | { type: 'shieldDamage'; amount: number; tag?: string; target: EffectTarget }
  | { type: 'energyGain'; amount: BattleEnergyCost; target: EffectTarget }
  | { type: 'energyDrain'; amount: BattleEnergyCost; target: EffectTarget }
  | { type: 'energySteal'; amount: BattleEnergyCost; target: EffectTarget }
  | { type: 'cooldownAdjust'; amount: number; abilityId?: string; includeReady?: boolean; target: EffectTarget }
  | { type: 'heal'; power: number; target: EffectTarget }
  | { type: 'setHpFromCounter'; base: number; counterKey: string; target: EffectTarget }
  | { type: 'invulnerable'; duration: number; target: EffectTarget }
  | { type: 'attackUp'; amount: number; duration: number; target: EffectTarget }
  | { type: 'stun'; duration: number; target: EffectTarget }
  | { type: 'classStun'; duration: number; blockedClasses: BattleSkillClass[]; target: EffectTarget }
  | { type: 'classStunScaledByCounter'; counterKey: string; baseDuration: number; durationPerStack: number; consumeStacks: boolean; modifierTag?: string; blockedClasses: BattleSkillClass[]; target: EffectTarget }
  | { type: 'mark'; bonus: number; duration: number; target: EffectTarget }
  | { type: 'burn'; damage: number; duration: number; target: EffectTarget }
  | { type: 'cooldownReduction'; amount: number; target: EffectTarget }
  | { type: 'damageBoost'; amount: number; target: EffectTarget }
  | { type: 'shield'; amount: number; label?: string; tags?: string[]; target: EffectTarget }
  | { type: 'modifyAbilityCost'; modifier: BattleCostModifierTemplate; target: EffectTarget }
  | { type: 'effectImmunity'; label: string; blocks: BattleEffectImmunityBlock[]; duration: number; tags?: string[]; target: EffectTarget }
  | { type: 'removeEffectImmunity'; filter: { label?: string; tag?: string }; target: EffectTarget }
  | { type: 'setFlag'; key: string; value: boolean; target: EffectTarget }
  | { type: 'adjustCounter'; key: string; amount: number; requiresTag?: string; min?: number; max?: number; target: EffectTarget }
  | { type: 'setCounter'; key: string; value: number; target: EffectTarget }
  | { type: 'adjustSourceCounter'; key: string; amount: number; target: EffectTarget }
  | { type: 'adjustCounterByTriggerAmount'; key: string; target: EffectTarget }
  | { type: 'resetCounter'; key: string; target: EffectTarget }
  | { type: 'addModifier'; modifier: BattleModifierTemplate; target: EffectTarget }
  | { type: 'removeModifier'; filter: BattleModifierFilter; target: EffectTarget }
  | { type: 'modifyAbilityState'; delta: BattleAbilityStateDelta; target: EffectTarget }
  | { type: 'replaceAbilities'; replacements: Array<{ slotAbilityId: string; ability: BattleAbilityTemplate; duration: number }>; target: EffectTarget }
  | { type: 'schedule'; delay: number; phase: BattleScheduledPhase; effects: SkillEffect[]; target: EffectTarget }
  | { type: 'conditional'; conditions: BattleReactionCondition[]; effects: SkillEffect[]; elseEffects?: SkillEffect[]; target: EffectTarget }
  | { type: 'randomEnemyDamageOverTime'; power: number; duration: number; historyKey: string; repeatCounterKey?: string; repeatCounterAmount?: number; target: EffectTarget }
  | { type: 'randomEnemyDamageTick'; power: number; historyKey: string; repeatCounterKey?: string; repeatCounterAmount?: number; target: EffectTarget }
  | { type: 'replaceAbility'; duration: number; slotAbilityId: string; ability: BattleAbilityTemplate; target: EffectTarget }
  | { type: 'breakShield'; tag?: string; target: EffectTarget }
  | { type: 'counter'; duration: number; counterDamage: number; abilityClasses?: BattleSkillClass[]; consumeOnTrigger?: boolean; target: EffectTarget }
  | { type: 'reflect'; duration: number; abilityClasses?: BattleSkillClass[]; consumeOnTrigger?: boolean; target: EffectTarget }
  | { type: 'reaction'; label: string; trigger: BattleReactionTrigger; duration: number; effects: SkillEffect[]; abilityClasses?: BattleSkillClass[]; harmfulOnly?: boolean; consumeOnTrigger?: boolean; oncePerRound?: boolean; target: EffectTarget }
  | { type: 'overhealToShield'; power: number; shieldLabel?: string; shieldTags?: string[]; target: EffectTarget }
  | { type: 'damageEqualToActorShield'; shieldTag?: string; piercing?: boolean; cannotBeCountered?: boolean; cannotBeReflected?: boolean; target: EffectTarget }

export type PassiveTrigger =
  | 'onDealDamage'
  | 'onRoundStart'
  | 'onRoundEnd'
  | 'onAbilityUse'
  | 'onAbilityResolve'
  | 'onTakeDamage'
  | 'onShieldBroken'
  | 'onHeal'
  | 'onShieldGain'
  | 'onDefeat'
  | 'onDefeatEnemy'
  | 'whileAlive'
  | 'onTargetBelow'
  | 'onBeingTargeted'

export type PassiveEffect = {
  id?: string
  trigger: PassiveTrigger
  threshold?: number
  conditions?: BattleReactionCondition[]
  effects: SkillEffect[]
  label: string
  description?: string
  icon?: BattleAbilityIcon
  // When true, this passive runs in the engine but is omitted from static
  // passive lists (detail page, ACP live preview, battle board baseline).
  // Use for rules already described in skill copy.
  hidden?: boolean
  // Declares that this passive is the visible "home" for a fighter counter
  // (e.g. 'shikigami'). The live count is rendered on this passive's pip.
  counterKey?: string
  // Optional: reuse another ability's icon for this passive's pip. Useful
  // when a passive is conceptually a sub-effect of a named skill.
  iconFromAbilityId?: string
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



