import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { LiveOpsPanel } from '@/pages/admin/LiveOpsPanel'
import {
  authoredBattleContent,
  battleRoster,
  defaultBattleSetup,
} from '@/features/battle/data'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import {
  clearDraftBattleContent,
  createContentSnapshot,
  publishBattleContent,
  readDraftBattleContent,
  resetPublishedBattleContent,
  saveDraftBattleContent,
  type BattleContentSnapshot,
} from '@/features/battle/contentStore'
import { battleEnergyMeta, battleEnergyOrder, randomEnergyMeta, getAbilityEnergyCost } from '@/features/battle/energy'
import { validateBattleContent } from '@/features/battle/validation'
import type {
  BattleAbilityKind,
  BattleAbilityStateDelta,
  BattleSkillActionType,
  BattleSkillClass,
  BattleSkillDamageType,
  BattleSkillRange,
  BattleAbilityTemplate,
  BattleFighterTemplate,
  BattleModifierMode,
  BattleModifierScope,
  BattleModifierStat,
  BattleReactionCondition,
  BattleReactionTrigger,
  BattleScheduledPhase,
  BattleStatusKind,
  BattleTargetRule,
  PassiveEffect,
  PassiveTrigger,
  SkillEffect,
} from '@/features/battle/types'
import { battleSkillActionTypeValues, battleSkillDamageTypeValues, battleSkillRangeValues } from '@/features/battle/types'

const abilityKinds: BattleAbilityKind[] = ['attack', 'heal', 'defend', 'buff', 'debuff', 'utility', 'pass']
const targetRules: BattleTargetRule[] = ['none', 'self', 'enemy-single', 'enemy-all', 'ally-single', 'ally-all']
const passiveTriggers: PassiveTrigger[] = ['whileAlive', 'onRoundStart', 'onRoundEnd', 'onAbilityUse', 'onAbilityResolve', 'onDealDamage', 'onTakeDamage', 'onHeal', 'onShieldBroken', 'onShieldGain', 'onDefeat', 'onDefeatEnemy', 'onTargetBelow']
const effectTypes: SkillEffect['type'][] = ['damage', 'damageFiltered', 'damageEqualToActorShield', 'heal', 'setHpFromCounter', 'overhealToShield', 'invulnerable', 'adjustCounterByTriggerAmount', 'resetCounter', 'setCounter', 'attackUp', 'stun', 'intentStun', 'classStun', 'classStunScaledByCounter', 'mark', 'burn', 'cooldownReduction', 'cooldownAdjust', 'energyGain', 'energyDrain', 'energySteal', 'damageBoost', 'shield', 'shieldDamage', 'breakShield', 'counter', 'reflect', 'reaction', 'conditional', 'modifyAbilityCost', 'effectImmunity', 'removeEffectImmunity', 'setFlag', 'setMode', 'clearMode', 'adjustCounter', 'adjustSourceCounter', 'addModifier', 'removeModifier', 'modifyAbilityState', 'schedule', 'randomEnemyDamageOverTime', 'randomEnemyDamageTick', 'replaceAbility', 'damageScaledByCounter', 'replaceAbilities']
const conditionTypes: BattleReactionCondition['type'][] = ['selfHpBelow', 'targetHpBelow', 'actorHasStatus', 'targetHasStatus', 'actorHasModifierTag', 'targetHasModifierTag', 'abilityId', 'abilityClass', 'fighterFlag', 'actorModeIs', 'targetModeIs', 'counterAtLeast', 'targetCounterAtLeast', 'usedAbilityLastTurn', 'usedDifferentAbilityLastTurn', 'usedAbilityWithinRounds', 'usedAbilityOnTarget', 'shieldActive', 'brokenShieldTag', 'isUltimate']
const effectTargets: SkillEffect['target'][] = ['inherit', 'self', 'all-allies', 'all-enemies', 'other-enemies', 'attacker', 'linked-target', 'random-enemy']
const reactionTriggers: BattleReactionTrigger[] = ['onAbilityUse', 'onBeingTargeted', 'onDamageApplied', 'onDamageBlocked', 'onShieldBroken', 'onDefeat', 'onDefeatEnemy']
const modifierStats: BattleModifierStat[] = ['damageDealt', 'damageTaken', 'healDone', 'healTaken', 'cooldownTick', 'dotDamage', 'canAct', 'isInvulnerable']
const modifierModes: BattleModifierMode[] = ['flat', 'percentAdd', 'multiplier', 'set']
const modifierScopes: BattleModifierScope[] = ['fighter', 'team', 'battlefield']
const modifierStatusKinds: Array<BattleStatusKind | ''> = ['', 'stun', 'invincible', 'mark', 'burn', 'attackUp']
const modifierStackingOptions = ['max', 'replace', 'stack'] as const
const costModifierModes = ['set', 'reduceTyped', 'reduceRandom'] as const

type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string
  hint?: string
}

const effectTypeMeta: Record<SkillEffect['type'], { label: string; hint: string }> = {
  damage: { label: 'Direct Damage', hint: 'Immediate HP loss.' },
  damageFiltered: { label: 'Filtered Damage', hint: 'Deals damage only to targets that carry a specific modifier tag.' },
  heal: { label: 'Heal', hint: 'Restore HP to allies or self.' },
  setHpFromCounter: { label: 'Set HP From Counter', hint: 'Raise HP to a base amount plus a stored fighter counter.' },
  overhealToShield: { label: 'Overheal to Shield', hint: 'Heals up to max HP; any excess converts to destructible defense.' },
  damageEqualToActorShield: { label: 'Shield-Scaled Damage', hint: "Deals damage equal to the actor's current destructible defense." },
  invulnerable: { label: 'Invulnerable', hint: 'Ignore incoming damage for a duration.' },
  attackUp: { label: 'Attack Up', hint: 'Flat outgoing damage increase.' },
  stun: { label: 'Stun', hint: 'Force the target to lose actions.' },
  intentStun: { label: 'Intent Stun', hint: 'Seal hidden harmful or helpful skill intent without changing displayed classes.' },
  mark: { label: 'Mark', hint: 'Increase follow-up damage taken.' },
  burn: { label: 'Burn', hint: 'Damage over time each round.' },
  cooldownReduction: { label: 'Cooldown Reduction', hint: 'Accelerate ability cycling.' },
  cooldownAdjust: { label: 'Cooldown Adjust', hint: 'Increase or decrease cooldown values with optional scope.' },
  energyGain: { label: 'Energy Gain', hint: 'Grant typed or random cursed energy to a team.' },
  energyDrain: { label: 'Energy Drain', hint: 'Drain typed or random cursed energy from a team.' },
  energySteal: { label: 'Energy Steal', hint: 'Drain enemy cursed energy and transfer it to the caster team.' },
  damageBoost: { label: 'Damage Boost', hint: 'Percent-based damage multiplier.' },
  shield: { label: 'Shield', hint: 'Add destructible defense before HP is touched.' },
  shieldDamage: { label: 'Shield Damage', hint: 'Directly chip destructible defense by amount, optionally by tag.' },
  breakShield: { label: 'Break Shield', hint: 'Instantly shatter a target shield, optionally by tag.' },
  counter: { label: 'Counter Guard', hint: 'Sets a pre-damage counter reaction against harmful skills.' },
  reflect: { label: 'Reflect Guard', hint: 'Sets a pre-damage reflect reaction against harmful skills.' },
  reaction: { label: 'Event Reaction', hint: 'Sets a temporary trigger that resolves nested effects when a battle event occurs.' },
  modifyAbilityCost: { label: 'Cost Modifier', hint: 'Temporarily rewrite or reduce a technique cost.' },
  effectImmunity: { label: 'Effect Immunity', hint: 'Ignore selected non-damage effect types for a duration.' },
  removeEffectImmunity: { label: 'Remove Effect Immunity', hint: 'Strip an active effect immunity by label or tag.' },
  setFlag: { label: 'Set Flag', hint: 'Flip a named fighter state flag on or off.' },
  setMode: { label: 'Set Mode', hint: 'Set a named fighter form or mode.' },
  clearMode: { label: 'Clear Mode', hint: 'Clear a named fighter form or mode.' },
  adjustCounter: { label: 'Adjust Counter', hint: 'Increment or decrement a named fighter state counter.' },
  setCounter: { label: 'Set Counter', hint: 'Set a named fighter state counter to an exact value.' },
  adjustSourceCounter: { label: 'Adjust Source Counter', hint: 'Increment or decrement a named counter on a linked source fighter.' },
  adjustCounterByTriggerAmount: { label: 'Adjust Counter by Event Amount', hint: 'Increments a counter by the numeric amount of the triggering event (e.g. HP healed, shield gained).' },
  resetCounter: { label: 'Reset Counter', hint: 'Sets a named fighter state counter back to zero.' },
  addModifier: { label: 'Add Modifier', hint: 'Apply a generic runtime modifier bundle.' },
  removeModifier: { label: 'Remove Modifier', hint: 'Strip modifiers by filter instead of hardcoding dispels.' },
  modifyAbilityState: { label: 'Ability State', hint: 'Grant, lock, or replace abilities using the generalized runtime model.' },
  schedule: { label: 'Delayed Effect', hint: 'Queue nested effects for a future round start or end.' },
  conditional: { label: 'Conditional Effects', hint: 'Resolve nested effects only when authored conditions are met.' },
  randomEnemyDamageOverTime: { label: 'Random Enemy Damage Over Time', hint: 'Schedule repeated random enemy hits with repeat tracking.' },
  randomEnemyDamageTick: { label: 'Random Enemy Damage Tick', hint: 'Resolve one tracked random enemy hit.' },
  replaceAbility: { label: 'Replace Ability', hint: 'Legacy sugar for a temporary slot replacement.' },
  damageScaledByCounter: { label: 'Counter-Scaled Damage', hint: 'Deal damage multiplied by a named counter value, optionally consuming stacks.' },
  classStun: { label: 'Class Stun', hint: 'Seal abilities of specific skill classes for a duration.' },
  classStunScaledByCounter: { label: 'Counter-Scaled Class Stun', hint: 'Seal ability classes for a duration scaled by a named counter, optionally consuming stacks.' },
  replaceAbilities: { label: 'Replace Abilities (Batch)', hint: 'Swap multiple ability slots at once from a single effect.' },
}

type PassiveBlueprintId = 'round-heal' | 'damage-aura' | 'execute-drive' | 'tempo-engine'

const passiveTriggerMeta: Record<PassiveTrigger, { label: string; hint: string }> = {
  onDealDamage: { label: 'On Deal Damage', hint: 'Fires after this fighter deals damage.' },
  onRoundStart: { label: 'Round Start', hint: 'Fires automatically at the start of each round.' },
  onRoundEnd: { label: 'Round End', hint: 'Fires before cooldowns and statuses tick down.' },
  onAbilityUse: { label: 'On Ability Use', hint: 'Fires immediately before the fighter resolves a technique.' },
  onAbilityResolve: { label: 'On Ability Resolve', hint: 'Fires after the selected technique finishes resolving.' },
  onTakeDamage: { label: 'On Take Damage', hint: 'Fires after this fighter is hit.' },
  onHeal: { label: 'On Heal', hint: 'Fires when this fighter receives healing (amount > 0).' },
  onShieldBroken: { label: 'On Shield Broken', hint: 'Fires when this fighter loses a destructible shield.' },
  onShieldGain: { label: 'On Shield Gain', hint: 'Fires when this fighter gains destructible defense.' },
  onDefeat: { label: 'On Defeat', hint: 'Fires when this fighter is exorcised.' },
  onDefeatEnemy: { label: 'On Defeat Enemy', hint: 'Fires after this fighter defeats an enemy.' },
  whileAlive: { label: 'While Alive Aura', hint: 'Always active while the fighter remains alive.' },
  onTargetBelow: { label: 'Execute Window', hint: 'Legacy shorthand for target HP threshold reactions.' },
  onBeingTargeted: { label: 'On Being Targeted', hint: 'Fires after an enemy ability resolves against this fighter.' },
}

const passiveBlueprintOptions: Array<{ id: PassiveBlueprintId; label: string; hint: string }> = [
  { id: 'round-heal', label: 'Round Heal', hint: 'Simple regeneration or start-of-round sustain.' },
  { id: 'damage-aura', label: 'Damage Aura', hint: 'Always-on offensive pressure while alive.' },
  { id: 'execute-drive', label: 'Execute Drive', hint: 'Extra damage when enemies are low.' },
  { id: 'tempo-engine', label: 'Tempo Engine', hint: 'Self cooldown acceleration while alive.' },
]
const liveContent = createContentSnapshot(battleRoster, {
  playerTeamIds: defaultBattleSetup.playerTeamIds,
  enemyTeamIds: defaultBattleSetup.enemyTeamIds,
})

const adminSelectionStorageKey = 'ca-admin-selection-v1'

type AdminSelection = {
  fighterId: string
  abilityId: string | null
  passiveIndex: number
}

type EditorTabId = 'identity' | 'skills' | 'passives' | 'advanced' | 'livePreview'
type StudioSection = 'liveops' | 'content'

function readAdminSelection(): AdminSelection | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(adminSelectionStorageKey)
    if (!raw) return null
    return JSON.parse(raw) as AdminSelection
  } catch {
    return null
  }
}

function writeAdminSelection(selection: AdminSelection) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(adminSelectionStorageKey, JSON.stringify(selection))
  } catch {
    // ignore storage write failures
  }
}

function cloneSnapshot(snapshot: BattleContentSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as BattleContentSnapshot
}

function deriveAbilityLabel(name: string) {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

type AbilityClassSelection = {
  range: BattleSkillRange | ''
  damageType: BattleSkillDamageType | ''
  actionType: BattleSkillActionType | ''
  unique: boolean
  ultimate: boolean
}

function getAbilityClassSelection(classes: BattleSkillClass[]): AbilityClassSelection {
  return {
    range: battleSkillRangeValues.find((value) => classes.includes(value)) ?? '',
    damageType: battleSkillDamageTypeValues.find((value) => classes.includes(value)) ?? '',
    actionType: battleSkillActionTypeValues.find((value) => classes.includes(value)) ?? '',
    unique: classes.includes('Unique'),
    ultimate: classes.includes('Ultimate'),
  }
}

function buildAbilityClasses(selection: AbilityClassSelection): BattleSkillClass[] {
  return [
    selection.range,
    selection.damageType,
    selection.actionType,
    selection.unique ? 'Unique' : '',
    selection.ultimate ? 'Ultimate' : '',
  ].filter(Boolean) as BattleSkillClass[]
}

const battleSkillClassOptions: BattleSkillClass[] = [
  ...battleSkillRangeValues,
  ...battleSkillDamageTypeValues,
  ...battleSkillActionTypeValues,
  'Unique',
  'Ultimate',
]

function resolveAbilityTone(kind: BattleAbilityTemplate['kind'], isUltimate: boolean) {
  if (isUltimate) return 'gold' as const
  if (kind === 'heal') return 'teal' as const
  if (kind === 'debuff') return 'red' as const
  if (kind === 'buff' || kind === 'defend' || kind === 'utility') return 'teal' as const
  if (kind === 'pass') return 'frost' as const
  return 'red' as const
}

function syncAbilityPresentation(ability: BattleAbilityTemplate) {
  ability.icon = {
    src: ability.icon?.src,
    label: deriveAbilityLabel(ability.name),
    tone: resolveAbilityTone(ability.kind, ability.classes.includes('Ultimate')),
  }
}

let embeddedAbilityCounter = 1

function createTemporaryAbility(name = 'Temporary Technique'): BattleAbilityTemplate {
  return createBlankAbility(`temporary-technique-${embeddedAbilityCounter++}`, name, {
    kind: 'attack',
    targetRule: 'enemy-single',
    classes: ['Melee', 'Physical', 'Action'],
    cooldown: 1,
    effects: [{ type: 'damage', power: 28, target: 'inherit' }],
  })
}

function createEffect(type: SkillEffect['type'] = 'damage'): SkillEffect {
  switch (type) {
    case 'damage':
      return { type: 'damage', power: 20, target: 'inherit', piercing: false, cannotBeCountered: false, cannotBeReflected: false }
    case 'heal':
      return { type: 'heal', power: 18, target: 'inherit' }
    case 'setHpFromCounter':
      return { type: 'setHpFromCounter', base: 10, counterKey: 'state-counter', target: 'self' }
    case 'invulnerable':
      return { type: 'invulnerable', duration: 1, target: 'inherit' }
    case 'attackUp':
      return { type: 'attackUp', amount: 10, duration: 1, target: 'inherit' }
    case 'stun':
      return { type: 'stun', duration: 1, target: 'inherit' }
    case 'intentStun':
      return { type: 'intentStun', intent: 'harmful', duration: 1, target: 'inherit' }
    case 'mark':
      return { type: 'mark', bonus: 15, duration: 1, target: 'inherit' }
    case 'burn':
      return { type: 'burn', damage: 8, duration: 2, target: 'inherit' }
    case 'cooldownReduction':
      return { type: 'cooldownReduction', amount: 1, target: 'inherit' }
    case 'cooldownAdjust':
      return { type: 'cooldownAdjust', amount: 1, includeReady: false, target: 'inherit' }
    case 'energyGain':
      return { type: 'energyGain', amount: { technique: 1 }, target: 'self' }
    case 'energyDrain':
      return { type: 'energyDrain', amount: { technique: 1 }, target: 'inherit' }
    case 'energySteal':
      return { type: 'energySteal', amount: { technique: 1 }, target: 'inherit' }
    case 'damageBoost':
      return { type: 'damageBoost', amount: 0.2, target: 'inherit' }
    case 'shield':
      return { type: 'shield', amount: 20, label: 'Barrier', tags: [], target: 'inherit' }
    case 'shieldDamage':
      return { type: 'shieldDamage', amount: 20, target: 'inherit' }
    case 'breakShield':
      return { type: 'breakShield', target: 'inherit' }
    case 'counter':
      return { type: 'counter', duration: 1, counterDamage: 20, consumeOnTrigger: true, target: 'self' }
    case 'reflect':
      return { type: 'reflect', duration: 1, consumeOnTrigger: true, target: 'self' }
    case 'reaction':
      return {
        type: 'reaction',
        label: 'Event Reaction',
        trigger: 'onAbilityUse',
        duration: 1,
        consumeOnTrigger: true,
        target: 'inherit',
        effects: [{ type: 'damage', power: 10, target: 'inherit' }],
      }
    case 'modifyAbilityCost':
      return {
        type: 'modifyAbilityCost',
        target: 'self',
        modifier: {
          label: 'Cost Shift',
          mode: 'set',
          cost: {},
          duration: 1,
          uses: 1,
        },
      }
    case 'effectImmunity':
      return { type: 'effectImmunity', label: 'Ignore Non-Damage', blocks: ['nonDamage'], duration: 1, target: 'self' }
    case 'overhealToShield':
      return { type: 'overhealToShield', power: 25, shieldLabel: 'Overheal', shieldTags: [], target: 'self' }
    case 'damageEqualToActorShield':
      return { type: 'damageEqualToActorShield', target: 'inherit', piercing: false, cannotBeCountered: false, cannotBeReflected: false }
    case 'removeEffectImmunity':
      return { type: 'removeEffectImmunity', filter: { label: 'immunity-label' }, target: 'self' }
    case 'setFlag':
      return { type: 'setFlag', key: 'state-flag', value: true, target: 'self' }
    case 'setMode':
      return { type: 'setMode', key: 'form', value: 'active', target: 'self' }
    case 'clearMode':
      return { type: 'clearMode', key: 'form', target: 'self' }
    case 'adjustCounter':
      return { type: 'adjustCounter', key: 'state-counter', amount: 1, target: 'self' }
    case 'setCounter':
      return { type: 'setCounter', key: 'state-counter', value: 1, target: 'self' }
    case 'adjustSourceCounter':
      return { type: 'adjustSourceCounter', key: 'state-counter', amount: 1, target: 'inherit' }
    case 'adjustCounterByTriggerAmount':
      return { type: 'adjustCounterByTriggerAmount', key: 'state-counter', target: 'self' }
    case 'resetCounter':
      return { type: 'resetCounter', key: 'state-counter', target: 'self' }
    case 'addModifier':
      return {
        type: 'addModifier',
        target: 'inherit',
        modifier: {
          label: 'New Modifier',
          scope: 'fighter',
          stat: 'damageDealt',
          mode: 'flat',
          value: 10,
          duration: { kind: 'rounds', rounds: 1 },
          tags: [],
          visible: false,
          stacking: 'max',
        },
      }
    case 'removeModifier':
      return { type: 'removeModifier', target: 'inherit', filter: { statusKind: 'attackUp' } }
    case 'modifyAbilityState':
      return {
        type: 'modifyAbilityState',
        target: 'self',
        delta: {
          mode: 'grant',
          duration: 2,
          grantedAbility: createTemporaryAbility(),
        },
      }
    case 'schedule':
      return { type: 'schedule', delay: 1, phase: 'roundStart', target: 'inherit', effects: [{ type: 'damage', power: 12, target: 'inherit' }] }
    case 'conditional':
      return {
        type: 'conditional',
        target: 'inherit',
        conditions: [{ type: 'targetCounterAtLeast', key: 'state-counter', value: 1 }],
        effects: [{ type: 'damage', power: 10, target: 'inherit' }],
      }
    case 'randomEnemyDamageOverTime':
      return { type: 'randomEnemyDamageOverTime', power: 10, duration: 3, historyKey: 'random-hit', target: 'self' }
    case 'randomEnemyDamageTick':
      return { type: 'randomEnemyDamageTick', power: 10, historyKey: 'random-hit', target: 'self' }
    case 'replaceAbility':
      return {
        type: 'replaceAbility',
        duration: 2,
        slotAbilityId: 'replace-this-skill',
        target: 'self',
        ability: createTemporaryAbility(),
      }
    case 'damageScaledByCounter':
      return {
        type: 'damageScaledByCounter',
        counterKey: 'stack-counter',
        powerPerStack: 10,
        consumeStacks: true,
        target: 'inherit',
        piercing: false,
        cannotBeCountered: false,
        cannotBeReflected: false,
      }
    case 'classStun':
      return { type: 'classStun', duration: 1, blockedClasses: ['Physical', 'Melee'], target: 'inherit' }
    case 'damageFiltered':
      return { type: 'damageFiltered', power: 15, requiresTag: 'modifier-tag', target: 'inherit', piercing: false, cannotBeCountered: false, cannotBeReflected: false }
    case 'classStunScaledByCounter':
      return { type: 'classStunScaledByCounter', counterKey: 'state-counter', baseDuration: 1, durationPerStack: 1, consumeStacks: true, blockedClasses: ['Physical', 'Melee'], target: 'inherit' }
    case 'replaceAbilities':
      return {
        type: 'replaceAbilities',
        target: 'self',
        replacements: [{ slotAbilityId: 'replace-this-skill', duration: 2, ability: createTemporaryAbility() }],
      }
  }
}

function formatEffectTarget(target: SkillEffect['target']) {
  if (target === 'inherit') return 'the skill target'
  if (target === 'self') return 'self'
  if (target === 'all-allies') return 'all allies'
  if (target === 'attacker') return 'the attacker'
  if (target === 'other-enemies') return 'other enemies'
  if (target === 'random-enemy') return 'a random enemy'
  return 'all enemies'
}

function formatCsvList(values?: string[]) {
  return (values ?? []).join(', ')
}

function parseCsvList(value: string) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

function usesBooleanModifierValue(effect: Extract<SkillEffect, { type: 'addModifier' }>) {
  return effect.modifier.stat === 'canAct' || effect.modifier.stat === 'isInvulnerable' || typeof effect.modifier.value === 'boolean'
}

function createReactionCondition(type: BattleReactionCondition['type']): BattleReactionCondition {
  switch (type) {
    case 'selfHpBelow':
      return { type: 'selfHpBelow', threshold: 0.4 }
    case 'targetHpBelow':
      return { type: 'targetHpBelow', threshold: 0.4 }
    case 'actorHasStatus':
      return { type: 'actorHasStatus', status: 'stun' }
    case 'targetHasStatus':
      return { type: 'targetHasStatus', status: 'stun' }
    case 'actorHasModifierTag':
      return { type: 'actorHasModifierTag', tag: 'modifier-tag' }
    case 'targetHasModifierTag':
      return { type: 'targetHasModifierTag', tag: 'modifier-tag' }
    case 'abilityId':
      return { type: 'abilityId', abilityId: 'ability-id' }
    case 'abilityClass':
      return { type: 'abilityClass', class: 'Unique' }
    case 'fighterFlag':
      return { type: 'fighterFlag', key: 'state-flag', value: true }
    case 'actorModeIs':
      return { type: 'actorModeIs', key: 'form', value: 'active' }
    case 'targetModeIs':
      return { type: 'targetModeIs', key: 'form', value: 'active' }
    case 'counterAtLeast':
      return { type: 'counterAtLeast', key: 'state-counter', value: 1 }
    case 'targetCounterAtLeast':
      return { type: 'targetCounterAtLeast', key: 'state-counter', value: 1 }
    case 'usedAbilityLastTurn':
      return { type: 'usedAbilityLastTurn', abilityId: 'ability-id' }
    case 'usedDifferentAbilityLastTurn':
      return { type: 'usedDifferentAbilityLastTurn', abilityId: 'ability-id' }
    case 'usedAbilityWithinRounds':
      return { type: 'usedAbilityWithinRounds', abilityId: 'ability-id', rounds: 3 }
    case 'usedAbilityOnTarget':
      return { type: 'usedAbilityOnTarget', abilityId: 'ability-id' }
    case 'firstAbilityOnTarget':
      return { type: 'firstAbilityOnTarget' }
    case 'shieldActive':
      return { type: 'shieldActive', tag: 'shield-tag' }
    case 'brokenShieldTag':
      return { type: 'brokenShieldTag', tag: 'shield-tag' }
    case 'isUltimate':
      return { type: 'isUltimate' }
  }
}

function describeCondition(condition: BattleReactionCondition) {
  switch (condition.type) {
    case 'targetHpBelow':
      return `target below ${Math.round(condition.threshold * 100)}% HP`
    case 'selfHpBelow':
      return `self below ${Math.round(condition.threshold * 100)}% HP`
    case 'actorHasStatus':
      return `self has ${condition.status}`
    case 'targetHasStatus':
      return `target has ${condition.status}`
    case 'actorHasModifierTag':
      return `self has ${condition.tag}`
    case 'targetHasModifierTag':
      return `target has ${condition.tag}`
    case 'abilityId':
      return `ability is ${condition.abilityId}`
    case 'abilityClass':
      return `ability has ${condition.class}`
    case 'fighterFlag':
      return `${condition.key} is ${condition.value ? 'true' : 'false'}`
    case 'actorModeIs':
      return `self ${condition.key} is ${condition.value}`
    case 'targetModeIs':
      return `target ${condition.key} is ${condition.value}`
    case 'counterAtLeast':
      return `${condition.key} >= ${condition.value}`
    case 'targetCounterAtLeast':
      return `target ${condition.key} >= ${condition.value}`
    case 'usedAbilityLastTurn':
      return `last ability was ${condition.abilityId}`
    case 'usedDifferentAbilityLastTurn':
      return `last ability was not ${condition.abilityId}`
    case 'usedAbilityWithinRounds':
      return `used ${condition.abilityId} within ${condition.rounds} rounds`
    case 'usedAbilityOnTarget':
      return `used ${condition.abilityId} on this target`
    case 'firstAbilityOnTarget':
      return condition.abilityId ? `first time using ${condition.abilityId} on this target` : 'first ability on this target'
    case 'shieldActive':
      return condition.tag ? `shield ${condition.tag} active` : 'shield active'
    case 'brokenShieldTag':
      return `broken shield had ${condition.tag}`
    case 'isUltimate':
      return 'ability is an ultimate'
  }
}

function describeEffect(effect: SkillEffect) {
  switch (effect.type) {
    case 'damage':
      return `Deals ${effect.power} damage to ${formatEffectTarget(effect.target)}${effect.piercing ? ' (piercing)' : ''}${effect.cannotBeCountered ? ', cannot be countered' : ''}${effect.cannotBeReflected ? ', cannot be reflected' : ''}.`
    case 'heal':
      return `Restores ${effect.power} HP to ${formatEffectTarget(effect.target)}.`
    case 'setHpFromCounter':
      return `Sets ${formatEffectTarget(effect.target)} to at least ${effect.base} HP plus ${effect.counterKey}.`
    case 'invulnerable':
      return `Makes ${formatEffectTarget(effect.target)} invulnerable for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'attackUp':
      return `Adds ${effect.amount} bonus damage to ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'stun':
      return `Stuns ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'mark':
      return `Marks ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}; follow-up hits gain ${effect.bonus} bonus damage.`
    case 'burn':
      return `Burns ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}; each tick deals ${effect.damage} damage.`
    case 'cooldownReduction':
      return `Reduces cooldowns by ${effect.amount} for ${formatEffectTarget(effect.target)}.`
    case 'cooldownAdjust':
      return `${effect.amount < 0 ? 'Reduces' : 'Increases'} cooldowns by ${Math.abs(effect.amount)} for ${formatEffectTarget(effect.target)}${effect.abilityId ? ` on ${effect.abilityId}` : ''}${effect.includeReady ? ' (including ready skills)' : ''}.`
    case 'energyGain':
      return `Gains energy for ${formatEffectTarget(effect.target)} with payload ${JSON.stringify(effect.amount)}.`
    case 'energyDrain':
      return `Drains energy from ${formatEffectTarget(effect.target)} with payload ${JSON.stringify(effect.amount)}.`
    case 'energySteal':
      return `Steals energy from ${formatEffectTarget(effect.target)} with payload ${JSON.stringify(effect.amount)}.`
    case 'damageBoost':
      return `Boosts outgoing damage for ${formatEffectTarget(effect.target)} by ${Math.round(effect.amount * 100)}%.`
    case 'shield':
      return `Adds ${effect.amount} shield to ${formatEffectTarget(effect.target)}.`
    case 'shieldDamage':
      return effect.tag
        ? `Deals ${effect.amount} shield damage to ${formatEffectTarget(effect.target)} shield tagged "${effect.tag}".`
        : `Deals ${effect.amount} shield damage to ${formatEffectTarget(effect.target)}.`
    case 'breakShield':
      return effect.tag
        ? `Breaks ${formatEffectTarget(effect.target)} shield matching tag "${effect.tag}".`
        : `Breaks ${formatEffectTarget(effect.target)} shield.`
    case 'counter':
      return `Sets a counter guard on ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'} (counter damage ${effect.counterDamage}${effect.abilityClasses?.length ? `, classes: ${effect.abilityClasses.join('/')}` : ''}${effect.consumeOnTrigger === false ? ', triggers repeatedly' : ', first trigger only'}).`
    case 'reflect':
      return `Sets a reflect guard on ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}${effect.abilityClasses?.length ? ` for ${effect.abilityClasses.join('/')}` : ''}${effect.consumeOnTrigger === false ? ', triggers repeatedly' : ', first trigger only'}.`
    case 'reaction':
      return `Sets ${effect.label} on ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}; triggers ${effect.trigger} and resolves ${effect.effects.length} nested effect${effect.effects.length === 1 ? '' : 's'}.`
    case 'modifyAbilityCost':
      return `${effect.modifier.label} changes costs for ${formatEffectTarget(effect.target)} using ${effect.modifier.mode}.`
    case 'effectImmunity':
      return `${formatEffectTarget(effect.target)} ignores ${effect.blocks.join(', ')} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'overhealToShield':
      return `Heals ${formatEffectTarget(effect.target)} for up to ${effect.power} HP; any excess converts to ${effect.shieldLabel ?? 'Overheal'} shield.`
    case 'damageEqualToActorShield':
      return `Deals damage equal to the actor's current shield${effect.shieldTag ? ` tagged "${effect.shieldTag}"` : ''} to ${formatEffectTarget(effect.target)}${effect.piercing ? ' (piercing)' : ''}${effect.cannotBeCountered ? ', cannot be countered' : ''}${effect.cannotBeReflected ? ', cannot be reflected' : ''}.`
    case 'removeEffectImmunity':
      return `Remove effect immunity from ${formatEffectTarget(effect.target)} matching ${effect.filter.label ? `label "${effect.filter.label}"` : ''}${effect.filter.tag ? ` tag "${effect.filter.tag}"` : ''}.`
    case 'setFlag':
      return `Set ${effect.key} to ${effect.value ? 'true' : 'false'} on ${formatEffectTarget(effect.target)}.`
    case 'setMode':
      return `Set ${effect.key} to ${effect.value} on ${formatEffectTarget(effect.target)}.`
    case 'clearMode':
      return `Clear ${effect.key} on ${formatEffectTarget(effect.target)}.`
    case 'adjustCounter':
      return `Adjust ${effect.key} by ${effect.amount} on ${formatEffectTarget(effect.target)}.`
    case 'setCounter':
      return `Set ${effect.key} to ${effect.value} on ${formatEffectTarget(effect.target)}.`
    case 'adjustSourceCounter':
      return `Adjust ${effect.key} by ${effect.amount} on the linked source fighter.`
    case 'adjustCounterByTriggerAmount':
      return `Adjust ${effect.key} on ${formatEffectTarget(effect.target)} by the triggering event's amount (heal, shield, etc.).`
    case 'resetCounter':
      return `Reset ${effect.key} to 0 on ${formatEffectTarget(effect.target)}.`
    case 'addModifier':
      return `Apply ${effect.modifier.label} to ${formatEffectTarget(effect.target)} using ${effect.modifier.stat} ${effect.modifier.mode}.`
    case 'removeModifier':
      return `Remove modifiers from ${formatEffectTarget(effect.target)} matching ${effect.filter.statusKind ?? effect.filter.stat ?? effect.filter.label ?? 'the authored filter'}.`
    case 'conditional':
      return `If ${effect.conditions.length} condition${effect.conditions.length === 1 ? '' : 's'} pass, resolve ${effect.effects.length} nested effect${effect.effects.length === 1 ? '' : 's'}${effect.elseEffects?.length ? `; otherwise resolve ${effect.elseEffects.length}` : ''}.`
    case 'modifyAbilityState':
      return effect.delta.mode === 'replace'
        ? `Replace ${effect.delta.slotAbilityId} on ${formatEffectTarget(effect.target)} with ${effect.delta.replacement.name} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
        : effect.delta.mode === 'grant'
          ? `Grant ${effect.delta.grantedAbility.name} to ${formatEffectTarget(effect.target)} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
          : `Lock ${effect.delta.slotAbilityId} on ${formatEffectTarget(effect.target)} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
    case 'schedule':
      return `After ${effect.delay} round ${effect.phase === 'roundStart' ? 'start' : 'end'} trigger${effect.delay === 1 ? '' : 's'}, resolve ${effect.effects.length} nested effect row${effect.effects.length === 1 ? '' : 's'}.`
    case 'randomEnemyDamageOverTime':
      return `Schedules ${effect.duration} random enemy hit${effect.duration === 1 ? '' : 's'} for ${effect.power} damage.`
    case 'randomEnemyDamageTick':
      return `Deals ${effect.power} damage to a tracked random enemy.`
    case 'replaceAbility':
      return `Replace ${effect.slotAbilityId} on ${formatEffectTarget(effect.target)} with ${effect.ability.name} for ${effect.duration} round${effect.duration === 1 ? '' : 's'}.`
    case 'damageScaledByCounter':
      return `Deals ${effect.powerPerStack} damage per stack of ${effect.counterKey} to ${formatEffectTarget(effect.target)}${effect.consumeStacks ? ', consuming all stacks' : ''}${effect.piercing ? ', piercing' : ''}${effect.cannotBeCountered ? ', cannot be countered' : ''}${effect.cannotBeReflected ? ', cannot be reflected' : ''}.`
    case 'classStun':
      return `Seals ${effect.blockedClasses.join('/')} techniques on ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'damageFiltered':
      return `Deals ${effect.power} damage to ${formatEffectTarget(effect.target)} only if they carry the modifier tag "${effect.requiresTag}"${effect.piercing ? ' (piercing)' : ''}${effect.cannotBeCountered ? ', cannot be countered' : ''}${effect.cannotBeReflected ? ', cannot be reflected' : ''}.`
    case 'classStunScaledByCounter':
      return `Seals ${effect.blockedClasses.join('/')} on ${formatEffectTarget(effect.target)} for ${effect.baseDuration} + (${effect.durationPerStack} × ${effect.counterKey}) turns${effect.consumeStacks ? ', consuming all stacks' : ''}${effect.modifierTag ? `, removes "${effect.modifierTag}" modifiers` : ''}.`
    case 'replaceAbilities':
      return `Replaces ${effect.replacements.length} ability slot${effect.replacements.length === 1 ? '' : 's'} on ${formatEffectTarget(effect.target)}.`
  }
}

function formatPassiveTrigger(trigger: PassiveTrigger) {
  return passiveTriggerMeta[trigger].label
}

function applyPassiveBlueprint(passive: PassiveEffect, blueprintId: PassiveBlueprintId) {
  switch (blueprintId) {
    case 'round-heal':
      passive.label = 'Round Renewal'
      passive.trigger = 'onRoundStart'
      passive.threshold = undefined
      passive.conditions = undefined
      passive.effects = [{ type: 'heal', power: 10, target: 'self' }]
      return
    case 'damage-aura':
      passive.label = 'Battle Pressure'
      passive.trigger = 'whileAlive'
      passive.threshold = undefined
      passive.conditions = undefined
      passive.effects = [{ type: 'damageBoost', amount: 0.15, target: 'self' }]
      return
    case 'execute-drive':
      passive.label = 'Execution Drive'
      passive.trigger = 'whileAlive'
      passive.threshold = undefined
      passive.conditions = [{ type: 'targetHpBelow', threshold: 0.4 }]
      passive.effects = [{ type: 'damageBoost', amount: 0.25, target: 'self' }]
      return
    case 'tempo-engine':
      passive.label = 'Tempo Engine'
      passive.trigger = 'whileAlive'
      passive.threshold = undefined
      passive.conditions = undefined
      passive.effects = [{ type: 'cooldownReduction', amount: 1, target: 'self' }]
      return
  }
}

function groupNamedPassives(passiveEffects: PassiveEffect[]): PassiveEffect[] {
  const seen = new Set<string>()
  const result: PassiveEffect[] = []
  for (const p of passiveEffects) {
    if (p.hidden) continue
    const root = p.label.split(':')[0].trim()
    if (seen.has(root)) continue
    seen.add(root)
    result.push(passiveEffects.find((x) => x.label === root && !x.hidden) ?? p)
  }
  return result
}

function describePassive(passive: PassiveEffect) {
  const thresholdText =
    passive.trigger === 'onTargetBelow' && typeof passive.threshold === 'number'
      ? ` under ${Math.round(passive.threshold * 100)}% HP`
      : ''
  const conditionText = (passive.conditions ?? []).length > 0
    ? ` Conditions: ${(passive.conditions ?? []).map(describeCondition).join(', ')}.`
    : ''
  return `${passive.label}: ${formatPassiveTrigger(passive.trigger)}${thresholdText}.${conditionText}`.trim()
}
function explainCostRule(ability: BattleAbilityTemplate) {
  if (ability.energyCost && Object.keys(ability.energyCost).length > 0) return 'This skill is using a manually authored cost override.'
  return 'Automatic costs follow the live battle rules for this skill kind, target pattern, and ultimate state.'
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

function formatGameAssetUploadError(error: SupabaseErrorLike, fallback: string) {
  const message = error.message?.trim() || fallback
  const normalized = message.toLowerCase()
  const code = error.code ? ` (${error.code})` : ''

  if (normalized.includes('bucket')) return `GAME-ASSETS BUCKET ERROR${code}`
  if (normalized.includes('row-level security') || normalized.includes('permission denied') || normalized.includes('policy')) return `GAME-ASSETS RLS BLOCKED${code}`
  if (normalized.includes('payload') || normalized.includes('too large')) return `IMAGE TOO LARGE${code}`
  if (normalized.includes('mime') || normalized.includes('content type')) return `IMAGE TYPE BLOCKED${code}`
  return `UPLOAD FAILED${code}`
}

function logGameAssetUploadError(stage: string, error: SupabaseErrorLike, context: Record<string, string>) {
  if (typeof console === 'undefined') return
  console.error('[game-assets]', stage, {
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    ...context,
  })
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createBlankAbility(id: string, name: string, overrides: Partial<BattleAbilityTemplate> = {}): BattleAbilityTemplate {
  const ability: BattleAbilityTemplate = {
    id,
    name,
    description: 'Describe what this technique does in battle.',
    kind: 'attack',
    targetRule: 'enemy-single',
    classes: ['Melee', 'Physical', 'Action'],
    icon: { label: deriveAbilityLabel(name), tone: 'red' },
    cooldown: 1,
    effects: [{ type: 'damage', power: 30, target: 'inherit' }],
    ...overrides,
  }
  syncAbilityPresentation(ability)
  return ability
}

function createBlankFighter(index: number): BattleFighterTemplate {
  const shortName = 'Fighter ' + index
  return {
    id: 'fighter-' + index,
    name: 'New Fighter ' + index,
    shortName,
    rarity: 'SR',
    role: '',
    affiliationLabel: 'Custom',
    battleTitle: 'Arena Recruit',
    bio: 'New combatant awaiting authored battle identity.',
    boardPortraitSrc: '',
    maxHp: 100,
    passiveEffects: [
      {
        label: 'New Passive',
        trigger: 'whileAlive',
        effects: [{ type: 'damageBoost', amount: 0.1, target: 'self' }],
      },
    ],
    abilities: [
      createBlankAbility('fighter-' + index + '-skill-1', 'New Strike'),
      createBlankAbility('fighter-' + index + '-skill-2', 'New Technique', { kind: 'utility', targetRule: 'self', classes: ['Instant', 'Mental'], effects: [createEffect('cooldownReduction')] }),
    ],
    ultimate: createBlankAbility('fighter-' + index + '-ultimate', 'New Ultimate', {
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Ranged', 'Energy', 'Ultimate', 'Action'],
      cooldown: 5,
      effects: [{ type: 'damage', power: 60, target: 'all-enemies' }],
    }),
  }
}

function normalizeFighterImport(input: BattleFighterTemplate): BattleFighterTemplate {
  const fighter = JSON.parse(JSON.stringify(input)) as BattleFighterTemplate
  fighter.passiveEffects = fighter.passiveEffects ?? []
  fighter.abilities = fighter.abilities ?? []
  fighter.abilities.forEach(syncAbilityPresentation)
  syncAbilityPresentation(fighter.ultimate)
  return fighter
}

function sanitizeDefaultSetup(snapshot: BattleContentSnapshot) {
  const rosterIds = snapshot.roster.map((fighter) => fighter.id)
  if (rosterIds.length === 0) return

  const fillTeam = (teamIds: string[]) =>
    teamIds.map((id, index) => (rosterIds.includes(id) ? id : rosterIds[Math.min(index, rosterIds.length - 1)] ?? rosterIds[0]))

  snapshot.defaultSetup.playerTeamIds = fillTeam(snapshot.defaultSetup.playerTeamIds)
  snapshot.defaultSetup.enemyTeamIds = fillTeam(snapshot.defaultSetup.enemyTeamIds)
}

export function AdminControlPanelPage() {
  const [studioSection, setStudioSection] = useState<StudioSection>('liveops')
  const [draft, setDraft] = useState<BattleContentSnapshot>(() => readDraftBattleContent(liveContent))
  const [selectedFighterId, setSelectedFighterId] = useState(() => {
    const saved = readAdminSelection()
    if (saved && liveContent.roster.some((fighter) => fighter.id === saved.fighterId)) {
      return saved.fighterId
    }
    return liveContent.roster[0]?.id ?? ''
  })
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(() => readAdminSelection()?.abilityId ?? null)
  const [selectedPassiveIndex, setSelectedPassiveIndex] = useState(() => readAdminSelection()?.passiveIndex ?? 0)
  const [expandedAbilityIds, setExpandedAbilityIds] = useState<Set<string>>(new Set())
  const [expandedPassiveIndices, setExpandedPassiveIndices] = useState<Set<number>>(new Set([0]))
  const [editorTab, setEditorTab] = useState<EditorTabId>('identity')
  const [fighterSearch, setFighterSearch] = useState('')
  const [statusFlash, setStatusFlash] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [fighterJsonDraft, setFighterJsonDraft] = useState('')
  const draftRef = useRef(draft)

  const selectedFighter = draft.roster.find((fighter) => fighter.id === selectedFighterId) ?? draft.roster[0] ?? null
  const selectedAbilityIdResolved = selectedFighter
    ? selectedFighter.abilities.concat(selectedFighter.ultimate).map((ability) => ability.id).includes(selectedAbilityId ?? '')
      ? selectedAbilityId
      : selectedFighter.abilities[0]?.id ?? selectedFighter.ultimate.id
    : null
  const selectedAbility = selectedFighter
    ? selectedFighter.abilities.concat(selectedFighter.ultimate).find((ability) => ability.id === selectedAbilityIdResolved) ??
      selectedFighter.abilities[0] ??
      selectedFighter.ultimate
    : null
  const selectedPassiveIndexResolved = selectedFighter && (selectedFighter.passiveEffects?.length ?? 0) > selectedPassiveIndex ? selectedPassiveIndex : 0
  const selectedPassive = selectedFighter?.passiveEffects?.[selectedPassiveIndexResolved] ?? null

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    if (!statusFlash) return
    const timeout = window.setTimeout(() => setStatusFlash(null), 1800)
    return () => window.clearTimeout(timeout)
  }, [statusFlash])

  useEffect(() => {
    writeAdminSelection({
      fighterId: selectedFighterId,
      abilityId: selectedAbilityId,
      passiveIndex: selectedPassiveIndex,
    })
  }, [selectedFighterId, selectedAbilityId, selectedPassiveIndex])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      saveDraftBattleContent(draft)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [draft])

  useEffect(() => {
    const persistCurrentState = () => {
      saveDraftBattleContent(draftRef.current)
      writeAdminSelection({
        fighterId: selectedFighterId,
        abilityId: selectedAbilityId,
        passiveIndex: selectedPassiveIndex,
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      persistCurrentState()
    }

    window.addEventListener('beforeunload', persistCurrentState)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', persistCurrentState)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [selectedAbilityId, selectedFighterId, selectedPassiveIndex])

  const validationReport = useMemo(
    () => validateBattleContent(draft.roster, draft.defaultSetup),
    [draft],
  )
  const liveMatchesDraft = JSON.stringify(liveContent) === JSON.stringify(draft)
  const visibleRoster = useMemo(() => {
    const query = fighterSearch.trim().toLowerCase()
    if (!query) return draft.roster
    return draft.roster.filter((fighter) =>
      fighter.name.toLowerCase().includes(query)
      || fighter.shortName.toLowerCase().includes(query)
      || fighter.id.toLowerCase().includes(query),
    )
  }, [draft.roster, fighterSearch])

  function updateDraft(mutator: (next: BattleContentSnapshot) => void) {
    setDraft((current) => {
      const next = cloneSnapshot(current)
      mutator(next)
      next.updatedAt = Date.now()
      return next
    })
  }

  function updateSelectedFighter(mutator: (fighter: BattleFighterTemplate) => void) {
    if (!selectedFighter) return
    updateDraft((next) => {
      const fighter = next.roster.find((entry) => entry.id === selectedFighter.id)
      if (!fighter) return
      mutator(fighter)
    })
  }

  function updateAbilityById(abilityId: string, mutator: (ability: BattleAbilityTemplate) => void) {
    if (!selectedFighter) return
    updateSelectedFighter((fighter) => {
      if (fighter.ultimate.id === abilityId) {
        mutator(fighter.ultimate)
        syncAbilityPresentation(fighter.ultimate)
        return
      }
      const ability = fighter.abilities.find((entry) => entry.id === abilityId)
      if (ability) {
        mutator(ability)
        syncAbilityPresentation(ability)
      }
    })
  }

  function updateAbilityEffectsById(abilityId: string, effects: SkillEffect[]) {
    updateAbilityById(abilityId, (ability) => {
      ability.effects = effects.map((effect) => JSON.parse(JSON.stringify(effect)) as SkillEffect)
    })
  }

  function updateSelectedPassive(mutator: (passive: PassiveEffect) => void) {
    if (!selectedFighter || !selectedPassive) return
    updateSelectedFighter((fighter) => {
      const passive = fighter.passiveEffects?.[selectedPassiveIndexResolved]
      if (passive) mutator(passive)
    })
  }

  function updateSelectedPassiveEffects(mutator: (effects: SkillEffect[]) => SkillEffect[]) {
    updateSelectedPassive((passive) => {
      passive.effects = mutator((passive.effects ?? []).map((effect) => JSON.parse(JSON.stringify(effect)) as SkillEffect))
    })
  }

  async function handleImageImport(
    apply: (value: string) => void,
    file: File | null,
    successMessage: string,
    storageKey?: string,
  ) {
    if (!file) return

    try {
      const supabase = storageKey ? getSupabaseClient() : null

      if (supabase && storageKey) {
        // Upload to Supabase Storage -> store CDN URL instead of base64
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${storageKey}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('game-assets')
          .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || undefined })

        if (uploadErr) {
          logGameAssetUploadError('storage_upload', uploadErr, { bucket: 'game-assets', path, contentType: file.type || 'unknown' })
          setStatusFlash(formatGameAssetUploadError(uploadErr, 'upload blocked'))
          return
        }

        const { data: urlData } = supabase.storage.from('game-assets').getPublicUrl(path)
        if (!urlData.publicUrl) {
          const error = { message: 'Storage returned an empty public URL.' }
          logGameAssetUploadError('public_url', error, { bucket: 'game-assets', path })
          setStatusFlash('PUBLIC URL FAILED')
          return
        }
        // Append a cache-bust so re-uploads immediately reflect in the ACP preview
        apply(`${urlData.publicUrl}?t=${Date.now()}`)
      } else {
        // Supabase not configured - fall back to base64 data URL
        const dataUrl = await readFileAsDataUrl(file)
        apply(dataUrl)
      }

      setStatusFlash(successMessage)
    } catch (error) {
      logGameAssetUploadError('unexpected', error instanceof Error ? { message: error.message } : { message: String(error) }, { bucket: 'game-assets', storageKey: storageKey ?? 'local' })
      setStatusFlash(formatGameAssetUploadError(error instanceof Error ? { message: error.message } : { message: String(error) }, 'unexpected upload failure'))
    }
  }

  function handleAddPassive() {
    updateSelectedFighter((fighter) => {
      fighter.passiveEffects = [...(fighter.passiveEffects ?? []), { label: 'New Passive', trigger: 'whileAlive', effects: [createEffect('damageBoost')] }]
    })
    setSelectedPassiveIndex(selectedFighter?.passiveEffects?.length ?? 0)
    setStatusFlash('PASSIVE ADDED')
  }

  function handleRemovePassive() {
    if (!selectedFighter || !selectedPassive) return
    updateSelectedFighter((fighter) => {
      fighter.passiveEffects = (fighter.passiveEffects ?? []).filter((_, index) => index !== selectedPassiveIndexResolved)
    })
    setSelectedPassiveIndex(Math.max(0, selectedPassiveIndexResolved - 1))
    setStatusFlash('PASSIVE REMOVED')
  }

  function handleAddFighter() {
    const fighter = createBlankFighter(draft.roster.length + 1)
    updateDraft((next) => {
      next.roster.push(fighter)
      sanitizeDefaultSetup(next)
    })
    setSelectedFighterId(fighter.id)
    setSelectedAbilityId(fighter.abilities[0]?.id ?? fighter.ultimate.id)
    setSelectedPassiveIndex(0)
    setFighterJsonDraft(JSON.stringify(fighter, null, 2))
    setStatusFlash('FIGHTER ADDED')
  }

  function handleDuplicateFighter() {
    if (!selectedFighter) return
    const copy = normalizeFighterImport(selectedFighter)
    const baseId = slugify(copy.id || copy.shortName || copy.name) || 'fighter-copy'
    let nextId = baseId + '-copy'
    let suffix = 2
    while (draft.roster.some((fighter) => fighter.id === nextId)) {
      nextId = baseId + '-copy-' + suffix
      suffix += 1
    }
    copy.id = nextId
    copy.name = copy.name + ' Copy'
    copy.shortName = copy.shortName + ' Copy'
    copy.abilities = copy.abilities.map((ability, index) => createBlankAbility(nextId + '-skill-' + (index + 1), ability.name, { ...ability, id: nextId + '-skill-' + (index + 1) }))
    copy.ultimate = createBlankAbility(nextId + '-ultimate', copy.ultimate.name, { ...copy.ultimate, id: nextId + '-ultimate' })

    updateDraft((next) => {
      next.roster.push(copy)
      sanitizeDefaultSetup(next)
    })
    setSelectedFighterId(copy.id)
    setSelectedAbilityId(copy.abilities[0]?.id ?? copy.ultimate.id)
    setSelectedPassiveIndex(0)
    setFighterJsonDraft(JSON.stringify(copy, null, 2))
    setStatusFlash('FIGHTER DUPLICATED')
  }

  function handleDeleteFighter() {
    if (!selectedFighter || draft.roster.length <= 1) {
      setStatusFlash('KEEP ONE FIGHTER')
      return
    }

    const fallback = draft.roster.find((fighter) => fighter.id !== selectedFighter.id) ?? null
    updateDraft((next) => {
      next.roster = next.roster.filter((fighter) => fighter.id !== selectedFighter.id)
      sanitizeDefaultSetup(next)
    })
    setSelectedFighterId(fallback?.id ?? '')
    setSelectedAbilityId(fallback?.abilities[0]?.id ?? fallback?.ultimate.id ?? null)
    setSelectedPassiveIndex(0)
    setFighterJsonDraft('')
    setStatusFlash('FIGHTER DELETED')
  }

  function handleUpdateFighterId(newId: string) {
    if (!selectedFighter) return
    const oldId = selectedFighter.id
    if (oldId === newId || !newId.trim()) return
    if (draft.roster.some((f) => f.id !== oldId && f.id === newId)) {
      setStatusFlash('ID ALREADY TAKEN')
      return
    }
    updateDraft((next) => {
      const fighter = next.roster.find((entry) => entry.id === oldId)
      if (!fighter) return
      fighter.abilities = fighter.abilities.map((ability) => ({
        ...ability,
        id: ability.id.startsWith(oldId + '-') ? newId + '-' + ability.id.slice(oldId.length + 1) : ability.id,
      }))
      fighter.ultimate = {
        ...fighter.ultimate,
        id: fighter.ultimate.id.startsWith(oldId + '-') ? newId + '-' + fighter.ultimate.id.slice(oldId.length + 1) : fighter.ultimate.id,
      }
      fighter.id = newId
      next.defaultSetup.playerTeamIds = next.defaultSetup.playerTeamIds.map((id) => id === oldId ? newId : id)
      next.defaultSetup.enemyTeamIds = next.defaultSetup.enemyTeamIds.map((id) => id === oldId ? newId : id)
    })
    setSelectedFighterId(newId)
    if (selectedAbilityId?.startsWith(oldId + '-')) {
      setSelectedAbilityId(newId + '-' + selectedAbilityId.slice(oldId.length + 1))
    }
  }

  function handleCopyFighterJson() {
    if (!selectedFighter) return
    const payload = JSON.stringify(selectedFighter, null, 2)
    setFighterJsonDraft(payload)
    void navigator.clipboard.writeText(payload).then(
      () => setStatusFlash('FIGHTER JSON COPIED'),
      () => setStatusFlash('COPY FAILED'),
    )
  }

  function handleImportFighter(mode: 'append' | 'replace') {
    try {
      const parsed = normalizeFighterImport(JSON.parse(fighterJsonDraft) as BattleFighterTemplate)
      updateDraft((next) => {
        if (mode === 'replace' && selectedFighter) {
          next.roster = next.roster.map((fighter) => (fighter.id === selectedFighter.id ? parsed : fighter))
        } else {
          let nextId = parsed.id || slugify(parsed.shortName || parsed.name) || 'fighter-import'
          let suffix = 2
          while (next.roster.some((fighter) => fighter.id === nextId)) {
            nextId = (parsed.id || 'fighter-import') + '-' + suffix
            suffix += 1
          }
          parsed.id = nextId
          next.roster.push(parsed)
        }
        sanitizeDefaultSetup(next)
      })
      setSelectedFighterId(parsed.id)
      setSelectedAbilityId(parsed.abilities[0]?.id ?? parsed.ultimate.id)
      setSelectedPassiveIndex(0)
      setStatusFlash(mode === 'replace' ? 'FIGHTER REPLACED' : 'FIGHTER IMPORTED')
    } catch {
      setStatusFlash('INVALID FIGHTER JSON')
    }
  }

  function handleAddAbility() {
    if (!selectedFighter) return
    const ability = createBlankAbility(selectedFighter.id + '-skill-' + (selectedFighter.abilities.length + 1), 'New Ability')
    updateSelectedFighter((fighter) => {
      fighter.abilities.push(ability)
    })
    setSelectedAbilityId(ability.id)
    setStatusFlash('ABILITY ADDED')
  }

  function handleDuplicateAbility() {
    if (!selectedFighter || !selectedAbility) return
    if (selectedFighter.ultimate.id === selectedAbility.id) {
      setStatusFlash('DUPLICATE NORMAL SKILLS ONLY')
      return
    }

    const duplicate = createBlankAbility(selectedFighter.id + '-skill-' + (selectedFighter.abilities.length + 1), selectedAbility.name + ' Copy', { ...JSON.parse(JSON.stringify(selectedAbility)), id: selectedFighter.id + '-skill-' + (selectedFighter.abilities.length + 1) })
    updateSelectedFighter((fighter) => {
      fighter.abilities.push(duplicate)
    })
    setSelectedAbilityId(duplicate.id)
    setStatusFlash('ABILITY DUPLICATED')
  }

  function handleDeleteAbility() {
    if (!selectedFighter || !selectedAbility) return
    if (selectedFighter.ultimate.id === selectedAbility.id) {
      setStatusFlash('KEEP AN ULTIMATE')
      return
    }
    if (selectedFighter.abilities.length <= 1) {
      setStatusFlash('KEEP ONE SKILL')
      return
    }
    const fallback = selectedFighter.abilities.find((ability) => ability.id !== selectedAbility.id) ?? null
    updateSelectedFighter((fighter) => {
      fighter.abilities = fighter.abilities.filter((ability) => ability.id !== selectedAbility.id)
    })
    setSelectedAbilityId(fallback?.id ?? selectedFighter.ultimate.id)
    setStatusFlash('ABILITY REMOVED')
  }

  function updateJsonField<T>(raw: string, apply: (value: T) => void, successMessage: string) {
    try {
      const parsed = JSON.parse(raw) as T
      apply(parsed)
      setStatusFlash(successMessage)
    } catch {
      setStatusFlash('INVALID JSON')
    }
  }

  function handleSaveDraft() {
    const saved = saveDraftBattleContent(draft)
    setDraft(saved)
    setStatusFlash('DRAFT SAVED')
  }

  function handleResetDraft() {
    clearDraftBattleContent()
    setDraft(cloneSnapshot(liveContent))
    setStatusFlash('DRAFT RESET')
  }

  function handleRestoreAuthored() {
    clearDraftBattleContent()
    setDraft(cloneSnapshot(authoredBattleContent))
    setStatusFlash('AUTHORED RESTORED')
  }

  async function handlePublish() {
    if (validationReport.errors.length > 0) {
      setStatusFlash('FIX VALIDATION')
      return
    }

    if (!getSupabaseClient()) {
      setStatusFlash('SUPABASE REQUIRED FOR LIVE PUBLISH')
      return
    }

    writeAdminSelection({
      fighterId: selectedFighterId,
      abilityId: selectedAbilityId,
      passiveIndex: selectedPassiveIndex,
    })

    setIsPublishing(true)
    try {
      const result = await publishBattleContent(draft)
      if (result.mode !== 'remote') {
        setStatusFlash('SUPABASE REQUIRED FOR LIVE PUBLISH')
        return
      }
      setStatusFlash('PUBLISHED LIVE')
      window.location.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown publish error.'
      console.warn('[ACP] Publish failed:', message)
      setStatusFlash('PUBLISH FAILED')
    } finally {
      setIsPublishing(false)
    }
  }

  async function handleRevertPublished() {
    await resetPublishedBattleContent(authoredBattleContent)
    setDraft(cloneSnapshot(authoredBattleContent))
    window.location.reload()
  }

  const editorTabs: Array<{ id: EditorTabId; label: string; hint: string }> = [
    { id: 'identity', label: 'Identity', hint: 'Name, role, portrait, and bio.' },
    { id: 'skills', label: 'Skills', hint: 'Author active techniques and ultimates.' },
    { id: 'passives', label: 'Passives', hint: 'Configure reactions and conditions.' },
    { id: 'advanced', label: 'Advanced', hint: 'Import, export, and raw JSON edits.' },
    { id: 'livePreview', label: 'Live Preview', hint: 'Read this fighter exactly like players will.' },
  ]

  return (
    <section className="py-4 sm:py-6">
      <div className="space-y-4">
        <header className="rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Internal Tools</p>
              <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">Cursed Arena Studio</h1>
              <p className="mt-2 max-w-3xl text-sm text-ca-text-3">
                Admin and content workspace. Live Ops for user/match management; Content Studio for authoring fighters, skills, and passives.
              </p>
            </div>
            <Link
              to="/settings"
              className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] px-4 py-2.5 text-[1rem] text-ca-text"
            >
              Back To Settings
            </Link>
          </div>

          <div className="mt-4 flex gap-2">
            {([
              { id: 'liveops', label: 'Live Ops', hint: 'Users · Matches · Missions · Unlocks' },
              { id: 'content', label: 'Content Studio', hint: 'Fighters · Skills · Passives · Publish' },
            ] as const).map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setStudioSection(section.id)}
                className={[
                  'rounded-lg border px-4 py-2.5 text-left transition',
                  studioSection === section.id
                    ? 'border-ca-teal/28 bg-ca-teal-wash'
                    : 'border-white/10 bg-[rgba(255,255,255,0.03)] hover:border-white/18',
                ].join(' ')}
              >
                <p className="ca-display text-[1rem] text-ca-text">{section.label}</p>
                <p className="mt-0.5 text-[0.62rem] text-ca-text-3">{section.hint}</p>
              </button>
            ))}
          </div>
        </header>

        {studioSection === 'liveops' ? (
          <LiveOpsPanel />
        ) : null}

        {studioSection === 'content' ? (
        <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Workspace State</p>
              <div className="flex flex-wrap gap-2">
                <StatusPill label={liveMatchesDraft ? 'MATCHES LIVE' : 'DRAFT CHANGED'} tone={liveMatchesDraft ? 'teal' : 'gold'} />
                <StatusPill label={validationReport.errors.length > 0 ? 'VALIDATION BLOCKED' : 'READY TO PUBLISH'} tone={validationReport.errors.length > 0 ? 'red' : 'teal'} />
                {statusFlash ? <StatusPill label={statusFlash} tone="frost" /> : null}
              </div>
              {validationReport.errors.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {validationReport.errors.map((err, i) => (
                    <li key={i} className="ca-mono-label text-[0.48rem] text-ca-red">
                      {'› '}{err}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] px-4 py-2.5 text-[1rem] text-ca-text"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing}
                className="ca-display rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] px-4 py-2.5 text-[1rem] text-white disabled:opacity-70"
              >
                {isPublishing ? 'Publishing...' : 'Publish'}
              </button>
              <details className="group rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-2">
                <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">More Actions</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleResetDraft}
                    className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2"
                  >
                    Reset Draft
                  </button>
                  <button
                    type="button"
                    onClick={handleRestoreAuthored}
                    className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2"
                  >
                    Restore Authored
                  </button>
                  <button
                    type="button"
                    onClick={handleRevertPublished}
                    className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal"
                  >
                    Revert Live
                  </button>
                </div>
              </details>
            </div>
          </div>
        </section>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5 xl:sticky xl:top-4 self-start">
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Fighters</p>
            <p className="ca-display mt-2 text-3xl text-ca-text">Registry</p>
            <div className="mt-3">
              <input
                type="text"
                value={fighterSearch}
                onChange={(event) => setFighterSearch(event.target.value)}
                placeholder="Search by name or id"
                className="w-full rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleAddFighter} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">
                Add
              </button>
              <button type="button" onClick={handleDuplicateFighter} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">
                Duplicate
              </button>
              <button type="button" onClick={handleDeleteFighter} disabled={!selectedFighter || draft.roster.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1.5 text-[0.42rem] text-ca-red disabled:opacity-50">
                Delete
              </button>
            </div>
            <div className="mt-4 space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {visibleRoster.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-white/10 px-3 py-4 text-sm text-ca-text-3">
                  No fighters match this search.
                </div>
              ) : null}
              {visibleRoster.map((fighter) => (
                <button
                  key={fighter.id}
                  type="button"
                  onClick={() => {
                    setSelectedFighterId(fighter.id)
                    setSelectedAbilityId(fighter.abilities[0]?.id ?? fighter.ultimate.id)
                    setSelectedPassiveIndex(0)
                    setFighterJsonDraft(JSON.stringify(fighter, null, 2))
                  }}
                  className={[
                    'w-full rounded-[10px] border px-3 py-2 text-left transition',
                    selectedFighterId === fighter.id
                      ? 'border-ca-teal/28 bg-ca-teal-wash'
                      : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/15',
                  ].join(' ')}
                >
                  <p className="ca-display truncate text-[1rem] text-ca-text">{fighter.shortName || fighter.name}</p>
                  <p className="mt-0.5 text-xs text-ca-text-3">{fighter.role} | {fighter.rarity}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4 min-w-0">
            {selectedFighter ? (
              <>
                <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
                  <div className="grid items-start gap-4 md:grid-cols-[8rem_minmax(0,1fr)]">
                    <div className="self-start rounded-[12px] border border-white/10 bg-[rgba(8,9,14,0.8)] p-2">
                      <PortraitPreview fighter={selectedFighter} />
                    </div>
                    <div className="min-w-0 space-y-3">
                      <div>
                        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Editing</p>
                        <p className="ca-display mt-1 text-3xl text-ca-text">{selectedFighter.name || selectedFighter.shortName}</p>
                        <p className="mt-1 ca-mono-label text-[0.42rem] text-ca-text-3">{selectedFighter.rarity} | {selectedFighter.role.toUpperCase()} | HP {selectedFighter.maxHp}</p>
                      </div>
                      <AssetField
                        fieldId={`fighter-portrait-${selectedFighter.id}`}
                        label="Portrait Image"
                        value={selectedFighter.boardPortraitSrc ?? ''}
                        onChange={(value) => updateSelectedFighter((fighter) => { fighter.boardPortraitSrc = value })}
                        onImport={(file) => handleImageImport((value) => updateSelectedFighter((fighter) => { fighter.boardPortraitSrc = value }), file, 'PORTRAIT UPDATED', `portraits/${selectedFighter.id}`)}
                        helper="Square crop. Recommended 512x512."
                      />
                    </div>
                  </div>
                </section>

                <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-3 sm:p-4">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {editorTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setEditorTab(tab.id)}
                        className={[
                          'rounded-lg border px-3 py-2 text-left transition',
                          editorTab === tab.id
                            ? 'border-ca-teal/28 bg-ca-teal-wash'
                            : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/15',
                        ].join(' ')}
                      >
                        <p className="ca-display text-[0.95rem] text-ca-text">{tab.label}</p>
                        <p className="mt-1 text-[0.68rem] leading-5 text-ca-text-3">{tab.hint}</p>
                      </button>
                    ))}
                  </div>
                </section>

                {editorTab === 'identity' ? (
                  <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <InputField label="Name" value={selectedFighter.name} onChange={(value) => updateSelectedFighter((fighter) => { fighter.name = value })} />
                      <InputField label="Short Name" value={selectedFighter.shortName} onChange={(value) => updateSelectedFighter((fighter) => { fighter.shortName = value })} />
                      <InputField label="Affiliation" value={selectedFighter.affiliationLabel} onChange={(value) => updateSelectedFighter((fighter) => { fighter.affiliationLabel = value })} />
                      <NumberField label="Max HP" value={selectedFighter.maxHp} onChange={(value) => updateSelectedFighter((fighter) => { fighter.maxHp = value })} />
                      <InputField label="Battle Title" value={selectedFighter.battleTitle} onChange={(value) => updateSelectedFighter((fighter) => { fighter.battleTitle = value })} />
                      <SlugInputField label="Fighter ID" value={selectedFighter.id} onChange={handleUpdateFighterId} />
                    </div>
                    <div className="mt-3">
                      <TextAreaField label="Bio" value={selectedFighter.bio} onChange={(value) => updateSelectedFighter((fighter) => { fighter.bio = value })} rows={3} />
                    </div>
                  </section>
                ) : null}

                {editorTab === 'skills' ? (
                  <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Skills</p>
                        <p className="ca-display mt-1 text-2xl text-ca-text">{selectedFighter.abilities.length + 1} total techniques</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleAddAbility} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1 text-[0.42rem] text-ca-teal">Add Skill</button>
                        <button type="button" onClick={handleDuplicateAbility} disabled={!selectedAbility || selectedFighter.ultimate.id === selectedAbility.id} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[0.42rem] text-ca-text-2 disabled:opacity-50">Duplicate</button>
                        <button type="button" onClick={handleDeleteAbility} disabled={!selectedAbility || selectedFighter.ultimate.id === selectedAbility.id || selectedFighter.abilities.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1 text-[0.42rem] text-ca-red disabled:opacity-50">Delete</button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {selectedFighter.abilities.concat(selectedFighter.ultimate).map((ability) => {
                        const isUltimate = selectedFighter.ultimate.id === ability.id
                        const expanded = expandedAbilityIds.has(ability.id)
                        return (
                          <div
                            key={ability.id}
                            className={[
                              'rounded-[10px] border',
                              isUltimate ? 'border-amber-400/22 bg-[rgba(250,180,60,0.04)]' : 'border-white/8 bg-[rgba(255,255,255,0.03)]',
                            ].join(' ')}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAbilityId(ability.id)
                                setExpandedAbilityIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(ability.id)) next.delete(ability.id)
                                  else next.add(ability.id)
                                  return next
                                })
                              }}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`ca-mono-label rounded-md border px-1.5 py-0.5 text-[0.36rem] ${isUltimate ? 'border-amber-400/22 bg-amber-400/10 text-amber-300' : 'border-white/12 bg-[rgba(255,255,255,0.03)] text-ca-text-3'}`}>
                                    {isUltimate ? 'ULTIMATE' : 'SKILL'}
                                  </span>
                                  <span className="ca-display truncate text-[1rem] text-ca-text">{ability.name || 'Untitled'}</span>
                                  <span className="ca-mono-label text-[0.36rem] text-ca-text-3">CD {ability.cooldown}</span>
                                </div>
                                <p className="ca-mono-label mt-1 text-[0.36rem] text-ca-text-3">{ability.classes.join(' | ') || 'NO CLASSES'}</p>
                              </div>
                              <span className="text-[0.7rem] text-ca-text-3">{expanded ? 'v' : '>'}</span>
                            </button>
                            {expanded ? (
                              <div className="border-t border-white/6 px-3 py-3">
                                <SkillEditorCard
                                  key={ability.id}
                                  ability={ability}
                                  isUltimate={isUltimate}
                                  active
                                  onSelect={() => setSelectedAbilityId(ability.id)}
                                  onUpdate={(mutator) => updateAbilityById(ability.id, mutator)}
                                  onUpdateEffects={(effects) => updateAbilityEffectsById(ability.id, effects)}
                                  onImportIcon={(file) => handleImageImport((value) => updateAbilityById(ability.id, (current) => { current.icon.src = value }), file, 'ABILITY ICON UPDATED', `ability-icons/${ability.id}`)}
                                  onAdvancedEffectsJson={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateAbilityById(ability.id, (current) => { current.effects = parsed }), 'ABILITY EFFECTS UPDATED')}
                                />
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ) : null}

                {editorTab === 'passives' ? (
                  <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Passives</p>
                        <p className="ca-display mt-1 text-2xl text-ca-text">{(selectedFighter.passiveEffects ?? []).length} total reactions</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleAddPassive} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1 text-[0.42rem] text-ca-teal">Add Passive</button>
                        <button type="button" onClick={handleRemovePassive} disabled={!selectedPassive} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1 text-[0.42rem] text-ca-red disabled:opacity-50">Remove</button>
                      </div>
                    </div>

                    {(selectedFighter.passiveEffects ?? []).length === 0 ? (
                      <div className="mt-4 rounded-[10px] border border-dashed border-white/10 px-3 py-4 text-sm text-ca-text-3">
                        No passives authored yet. Add one to begin configuring triggers and reactions.
                      </div>
                    ) : null}

                    <div className="mt-4 space-y-2">
                      {(selectedFighter.passiveEffects ?? []).map((passive, index) => {
                        const expanded = expandedPassiveIndices.has(index)
                        return (
                          <div key={passive.label + index} className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)]">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPassiveIndex(index)
                                setExpandedPassiveIndices((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(index)) next.delete(index)
                                  else next.add(index)
                                  return next
                                })
                              }}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="ca-display truncate text-[0.95rem] text-ca-text">{passive.label}</p>
                                <p className="ca-mono-label mt-1 text-[0.36rem] text-ca-text-3">{formatPassiveTrigger(passive.trigger).toUpperCase()}</p>
                              </div>
                              <span className="text-[0.7rem] text-ca-text-3">{expanded ? 'v' : '>'}</span>
                            </button>
                            {expanded && selectedPassiveIndexResolved === index && selectedPassive ? (
                              <div className="border-t border-white/6 px-3 py-3 space-y-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <InputField label="Label" value={selectedPassive.label} onChange={(value) => updateSelectedPassive((p) => { p.label = value })} />
                                  <SelectField
                                    label="Trigger"
                                    value={selectedPassive.trigger}
                                    options={passiveTriggers.map((value) => ({ value, label: passiveTriggerMeta[value].label }))}
                                    onChange={(value) => updateSelectedPassive((p) => { p.trigger = value as PassiveTrigger })}
                                  />
                                  {selectedPassive.trigger === 'onTargetBelow' ? (
                                    <NumberField
                                      label="Threshold (%)"
                                      value={Math.round((selectedPassive.threshold ?? 0.4) * 100)}
                                      onChange={(value) => updateSelectedPassive((p) => { p.threshold = value > 0 ? value / 100 : undefined })}
                                    />
                                  ) : null}
                                </div>
                                <div className="grid gap-3 md:grid-cols-[1fr_1fr] items-start">
                                  <AssetField
                                    fieldId={`passive-icon-${index}`}
                                    label="Passive Icon"
                                    value={selectedPassive.icon?.src ?? ''}
                                    onChange={(value) => updateSelectedPassive((p) => {
                                      const current = p.icon ?? { label: (p.label?.slice(0, 2) || 'P').toUpperCase(), tone: 'teal' as const }
                                      p.icon = { ...current, src: value || undefined }
                                    })}
                                    onImport={(file) => handleImageImport((value) => updateSelectedPassive((p) => {
                                      const current = p.icon ?? { label: (p.label?.slice(0, 2) || 'P').toUpperCase(), tone: 'teal' as const }
                                      p.icon = { ...current, src: value || undefined }
                                    }), file, 'PASSIVE ICON UPDATED', `passive-icons/${selectedFighter?.id ?? 'passive'}-${index}`)}
                                    helper="Square. Recommended 256x256. Leave empty to borrow from a linked skill below."
                                  />
                                  <SelectField
                                    label="Borrow Icon From Skill"
                                    value={selectedPassive.iconFromAbilityId ?? ''}
                                    options={[
                                      { value: '', label: 'NONE' },
                                      ...[...(selectedFighter?.abilities ?? []), selectedFighter?.ultimate]
                                        .filter((ability): ability is BattleAbilityTemplate => Boolean(ability))
                                        .map((ability) => ({ value: ability.id, label: ability.name.toUpperCase() })),
                                    ]}
                                    onChange={(value) => updateSelectedPassive((p) => { p.iconFromAbilityId = value || undefined })}
                                  />
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 items-start">
                                  <label className="flex items-center gap-2 rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.55)] px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selectedPassive.hidden)}
                                      onChange={(event) => updateSelectedPassive((p) => { p.hidden = event.target.checked ? true : undefined })}
                                    />
                                    <div className="min-w-0">
                                      <p className="ca-mono-label text-[0.42rem] text-ca-text-3">HIDDEN (SUB-EFFECT)</p>
                                      <p className="mt-1 text-xs leading-5 text-ca-text-3">Runs in the engine but doesn't render as its own passive card. Use for rules already covered by a skill's copy.</p>
                                    </div>
                                  </label>
                                  <InputField
                                    label="Counter Key"
                                    value={selectedPassive.counterKey ?? ''}
                                    onChange={(value) => updateSelectedPassive((p) => { p.counterKey = value.trim() || undefined })}
                                  />
                                </div>
                                <div className="rounded-[8px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-2">
                                  <p className="ca-mono-label text-[0.38rem] text-ca-teal">Trigger Notes</p>
                                  <p className="mt-1 text-sm leading-6 text-ca-text-2">{passiveTriggerMeta[selectedPassive.trigger].hint}</p>
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  {passiveBlueprintOptions.map((option) => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => updateSelectedPassive((p) => { applyPassiveBlueprint(p, option.id) })}
                                      className="rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-left transition hover:border-ca-teal/22"
                                    >
                                      <p className="ca-mono-label text-[0.38rem] text-ca-text">{option.label.toUpperCase()}</p>
                                      <p className="mt-1 text-xs leading-5 text-ca-text-3">{option.hint}</p>
                                    </button>
                                  ))}
                                </div>
                                <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-2">
                                  <p className="ca-mono-label text-[0.4rem] text-ca-text-3">Passive Summary</p>
                                  <p className="mt-2 text-sm leading-6 text-ca-text-2">{describePassive(selectedPassive)}</p>
                                </div>
                                <EffectListEditor
                                  title="Reaction Results"
                                  helper="These rows fire whenever the selected trigger condition is met."
                                  effects={selectedPassive.effects}
                                  onChange={(effects) => updateSelectedPassiveEffects(() => effects)}
                                  advancedJson={JSON.stringify(selectedPassive.effects, null, 2)}
                                  onAdvancedJsonChange={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateSelectedPassive((p) => { p.effects = parsed }), 'PASSIVE EFFECTS UPDATED')}
                                />
                                <ConditionListEditor
                                  conditions={selectedPassive.conditions ?? []}
                                  onChange={(conditions) => updateSelectedPassive((p) => { p.conditions = conditions.length > 0 ? conditions : undefined })}
                                />
                                <details className="rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
                                  <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Conditions JSON</summary>
                                  <div className="mt-3">
                                    <TextAreaField
                                      label="Conditions"
                                      value={JSON.stringify(selectedPassive.conditions ?? [], null, 2)}
                                      onChange={(value) => updateJsonField<BattleReactionCondition[]>(value, (parsed) => updateSelectedPassive((p) => { p.conditions = parsed }), 'PASSIVE CONDITIONS UPDATED')}
                                      rows={6}
                                      mono
                                    />
                                  </div>
                                </details>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ) : null}

                {editorTab === 'advanced' ? (
                  <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleCopyFighterJson} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">Copy Selected JSON</button>
                        <button type="button" onClick={() => handleImportFighter('append')} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">Import As New</button>
                        <button type="button" onClick={() => handleImportFighter('replace')} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">Replace Selected</button>
                      </div>
                      <TextAreaField label="Fighter JSON" value={fighterJsonDraft} onChange={setFighterJsonDraft} rows={18} mono />
                    </div>
                  </section>
                ) : null}

                {editorTab === 'livePreview' ? (
                  <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
                    <FighterProfilePreview fighter={selectedFighter} />
                  </section>
                ) : null}
              </>
            ) : (
              <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-6 text-sm text-ca-text-3">
                Select a fighter from the registry to begin editing.
              </section>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
      />
    </label>
  )
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
  mono = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
  mono?: boolean
}) {
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={[
          'mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function SlugInputField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [raw, setRaw] = useState(value)
  useEffect(() => { setRaw(value) }, [value])
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <input
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        onBlur={() => {
          const slugged = slugify(raw) || value
          setRaw(slugged)
          onChange(slugged)
        }}
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 font-mono text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
      />
    </label>
  )
}

function StatusPill({ label, tone }: { label: string; tone: 'teal' | 'red' | 'gold' | 'frost' }) {
  const className =
    tone === 'teal'
      ? 'border-ca-teal/18 bg-ca-teal-wash text-ca-teal'
      : tone === 'red'
        ? 'border-ca-red/18 bg-ca-red-wash text-ca-red'
        : tone === 'gold'
          ? 'border-amber-400/18 bg-amber-400/10 text-amber-300'
          : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2'

  return <span className={`ca-mono-label rounded-md border px-2 py-1 text-[0.42rem] ${className}`}>{label}</span>
}

function AssetField({
  fieldId,
  label,
  value,
  onChange,
  onImport,
  helper,
}: {
  fieldId: string
  label: string
  value: string
  onChange: (value: string) => void
  onImport: (file: File | null) => void
  helper: string
}) {
  return (
    <div>
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste an image URL or data URI"
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition placeholder:text-ca-text-3 focus:border-ca-teal/35"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <label htmlFor={fieldId} className="ca-mono-label cursor-pointer rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">
          Upload Image
        </label>
        <input
          id={fieldId}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void onImport(event.target.files?.[0] ?? null)
            event.currentTarget.value = ''
          }}
        />
        <button type="button" onClick={() => onChange('')} className="ca-mono-label rounded-md border border-white/10 px-2.5 py-1.5 text-[0.42rem] text-ca-text-2">
          Clear
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-ca-text-3">{helper}</p>
    </div>
  )
}

function PortraitPreview({ fighter, compact = false }: { fighter: BattleFighterTemplate; compact?: boolean }) {
  const initial = fighter.shortName[0]?.toUpperCase() ?? '?'
  const sizeClass = compact ? 'h-[5rem] w-[5rem]' : 'h-[8rem] w-[8rem]'
  const portraitSrc = normalizeBattleAssetSrc(fighter.boardPortraitSrc)

  return (
    <div className={`relative overflow-hidden rounded-[8px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))] ${sizeClass}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(5,216,189,0.08),transparent_70%)]" />
      {portraitSrc ? (
        <img
          src={portraitSrc}
          alt={fighter.name}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span className="ca-display text-[2rem] text-white/35">{initial}</span>
        </div>
      )}
    </div>
  )
}

function AbilityTilePreview({ ability, large = false }: { ability: BattleAbilityTemplate; large?: boolean }) {
  const sizeClass = large ? 'h-[7.5rem] w-[7.5rem]' : 'h-[6rem] w-[6rem]'
  const iconSrc = normalizeBattleAssetSrc(ability.icon.src)

  return (
    <div className={[
      'relative overflow-hidden rounded-[10px] border border-white/12 bg-[rgba(12,12,18,0.85)]',
      sizeClass,
    ].join(' ')}>
      {iconSrc ? <img src={iconSrc} alt={ability.name} className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.35))]" />
      <div className="absolute inset-0 grid place-items-center">
        {!iconSrc ? <span className="ca-mono-label text-[0.62rem] text-ca-text-2">{ability.icon.label}</span> : null}
      </div>
      <div className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-black/55 px-1.5 py-0.5">
        <span className="ca-mono-label text-[0.36rem] text-white">{ability.icon.label}</span>
      </div>
    </div>
  )
}

function FighterProfilePreview({ fighter }: { fighter: BattleFighterTemplate }) {
  const rarityTone: 'red' | 'teal' | 'frost' =
    fighter.rarity === 'SSR' || fighter.rarity === 'UR' ? 'red' : fighter.rarity === 'SR' ? 'teal' : 'frost'

  return (
    <div className="space-y-3">
      <div className="grid gap-4 rounded-[12px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,15,20,0.65),rgba(14,15,20,0.4))] px-4 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_6rem]">
        <div className="flex justify-center sm:justify-start">
          <PortraitPreview fighter={fighter} />
        </div>
        <div className="min-w-0">
          <p className="ca-display text-[1.8rem] leading-none text-ca-text sm:text-[2.1rem]">{fighter.name}</p>
          <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-text-3">{fighter.battleTitle?.toUpperCase() ?? fighter.role.toUpperCase()}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusPill label={fighter.rarity} tone={rarityTone} />
            <StatusPill label={fighter.role.toUpperCase()} tone="frost" />
            <StatusPill label={fighter.affiliationLabel.toUpperCase()} tone="teal" />
          </div>
          <p className="mt-3 text-sm leading-6 text-ca-text-2">{fighter.bio}</p>
        </div>
        <div className="flex items-start justify-end">
          <div className="rounded-[10px] border border-white/10 bg-[rgba(8,9,14,0.6)] px-3 py-2 text-right">
            <p className="ca-mono-label text-[0.42rem] text-ca-text-3">HP POOL</p>
            <p className="ca-display mt-1 text-3xl text-ca-text">{fighter.maxHp}</p>
          </div>
        </div>
      </div>

      {groupNamedPassives(fighter.passiveEffects ?? []).map((passive) => (
        <div key={passive.label} className="rounded-[10px] border border-ca-teal/22 bg-ca-teal-wash px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-ca-teal/20 bg-[rgba(5,216,189,0.08)]">
              {normalizeBattleAssetSrc(passive.icon?.src) ? (
                <img src={normalizeBattleAssetSrc(passive.icon?.src)} alt={passive.label} className="h-full w-full object-cover" />
              ) : (
                <span className="ca-mono-label text-[0.45rem] text-ca-teal">{passive.icon?.label ?? 'P'}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="ca-mono-label text-[0.42rem] text-ca-teal">PASSIVE</p>
              <p className="font-[var(--font-display-alt)] text-[0.92rem] font-bold text-ca-text">{passive.label}</p>
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-ca-text-2">
            {passive.description ?? describePassive(passive)}
          </p>
        </div>
      ))}

      <div className="grid gap-2 xl:grid-cols-2">
        {fighter.abilities.concat(fighter.ultimate).map((ability) => (
          <SkillProfileRow key={ability.id} ability={ability} isUltimate={fighter.ultimate.id === ability.id} />
        ))}
      </div>
    </div>
  )
}

function SkillProfileRow({ ability, isUltimate }: { ability: BattleAbilityTemplate; isUltimate: boolean }) {
  const costEntries = Object.entries(getAbilityEnergyCost(ability))
  const targetLabel = ability.targetRule.toUpperCase().replace(/-/g, ' ')

  return (
    <div
      className={[
        'overflow-hidden rounded-[10px] border',
        isUltimate ? 'border-amber-400/25 bg-[rgba(250,180,60,0.05)]' : 'border-white/10 bg-[rgba(255,255,255,0.03)]',
      ].join(' ')}
    >
      <div
        className={[
          'flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2',
          isUltimate
            ? 'bg-[linear-gradient(90deg,rgba(218,160,55,0.85),rgba(150,100,25,0.88))]'
            : 'bg-[linear-gradient(90deg,rgba(250,39,66,0.85),rgba(179,22,43,0.9))]',
        ].join(' ')}
      >
        <div className="min-w-0">
          <p className="ca-display truncate text-[1rem] leading-none text-white">{ability.name || 'Untitled Skill'}</p>
          <p className="ca-mono-label mt-1 text-[0.36rem] text-white/75">
            {isUltimate ? 'ULTIMATE TECHNIQUE' : 'CORE SKILL'} - CD {ability.cooldown}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-1">
          {costEntries.length > 0 ? (
            costEntries.map(([type, value]) => {
              const meta = type === 'random' ? randomEnergyMeta : battleEnergyMeta[type as keyof typeof battleEnergyMeta]
              return (
                <span key={type} className="ca-mono-label rounded-md border border-white/25 bg-black/30 px-1.5 py-0.5 text-[0.36rem] text-white">
                  {meta.short} {value}
                </span>
              )
            })
          ) : (
            <span className="ca-mono-label rounded-md border border-white/25 bg-black/30 px-1.5 py-0.5 text-[0.36rem] text-white">FREE</span>
          )}
        </div>
      </div>
      <div className="flex gap-3 px-3 py-2.5">
        <div className="flex-shrink-0">
          <AbilityTilePreview ability={ability} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-ca-text-2">{ability.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {ability.classes.map((skillClass) => (
              <StatusPill key={skillClass} label={skillClass} tone={skillClass === 'Ultimate' ? 'gold' : skillClass === 'Control' || skillClass === 'Affliction' || skillClass === 'Mental' ? 'red' : 'teal'} />
            ))}
            <StatusPill label={targetLabel} tone="frost" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SkillEditorCard({
  ability,
  isUltimate,
  active,
  onSelect,
  onUpdate,
  onUpdateEffects,
  onImportIcon,
  onAdvancedEffectsJson,
}: {
  ability: BattleAbilityTemplate
  isUltimate: boolean
  active: boolean
  onSelect: () => void
  onUpdate: (mutator: (ability: BattleAbilityTemplate) => void) => void
  onUpdateEffects: (effects: SkillEffect[]) => void
  onImportIcon: (file: File | null) => void
  onAdvancedEffectsJson: (value: string) => void
}) {
  return (
    <div
      onFocus={onSelect}
      className={[
        'rounded-[14px] border transition',
        active
          ? 'border-ca-red/28 bg-[rgba(250,39,66,0.08)] shadow-[0_16px_38px_rgba(0,0,0,0.24)]'
          : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/14',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-3 rounded-t-[14px] border-b border-white/8 bg-[linear-gradient(90deg,rgba(250,39,66,0.9),rgba(179,22,43,0.92))] px-3 py-2.5 text-left"
      >
        <div>
          <p className="ca-display text-[1.1rem] leading-none text-white">{ability.name || 'Untitled Skill'}</p>
          <p className="ca-mono-label mt-1 text-[0.38rem] text-white/75">{isUltimate ? 'FOURTH SKILL SLOT' : 'CORE SKILL'}</p>
        </div>
        <span className="ca-mono-label rounded-md border border-white/18 bg-black/20 px-2 py-1 text-[0.38rem] text-white">CD {ability.cooldown}</span>
      </button>
      <div className="space-y-3 px-3 py-3 sm:px-4">
        <div className="grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="flex justify-center md:justify-start">
            <AbilityTilePreview ability={ability} large />
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <InputField label="Skill Name" value={ability.name} onChange={(value) => onUpdate((current) => { current.name = value; syncAbilityPresentation(current) })} />
              <NumberField label="Cooldown" value={ability.cooldown} onChange={(value) => onUpdate((current) => { current.cooldown = value })} />
              <SelectField
                label="Skill Logic"
                value={ability.kind}
                options={abilityKinds.map((value) => ({ value, label: value.toUpperCase() }))}
                onChange={(value) => onUpdate((current) => { current.kind = value as BattleAbilityKind; syncAbilityPresentation(current) })}
              />
              <SelectField
                label="Targeting"
                value={ability.targetRule}
                options={targetRules.map((value) => ({ value, label: value.toUpperCase() }))}
                onChange={(value) => onUpdate((current) => { current.targetRule = value as BattleTargetRule })}
              />
            </div>
            <SkillClassEditor ability={ability} isUltimate={isUltimate} onUpdate={onUpdate} />
            <TextAreaField label="Skill Copy" value={ability.description} onChange={(value) => onUpdate((current) => { current.description = value })} rows={3} />
          </div>
        </div>

        <AssetField
          fieldId={`ability-icon-${ability.id}`}
          label="Skill Icon"
          value={ability.icon.src ?? ''}
          onChange={(value) => onUpdate((current) => { current.icon.src = value || undefined })}
          onImport={onImportIcon}
          helper="Square icon. Recommended 256x256."
        />

        <SkillCostPanel ability={ability} onUpdate={onUpdate} />

        <EffectListEditor
          title="Technique Results"
          helper="Use effect rows to describe the real in-battle outcome of this skill."
          effects={ability.effects ?? []}
          onChange={onUpdateEffects}
          advancedJson={JSON.stringify(ability.effects ?? [], null, 2)}
          onAdvancedJsonChange={onAdvancedEffectsJson}
        />
      </div>
    </div>
  )
}

function SkillClassEditor({
  ability,
  isUltimate,
  onUpdate,
}: {
  ability: BattleAbilityTemplate
  isUltimate: boolean
  onUpdate: (mutator: (ability: BattleAbilityTemplate) => void) => void
}) {
  const selection = getAbilityClassSelection(ability.classes)

  return (
    <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <div>
        <p className="ca-mono-label text-[0.4rem] text-ca-text-3">SKILL CLASSES</p>
        <p className="mt-1 text-sm leading-6 text-ca-text-2">Classes are descriptive metadata for reactions and future rules. The fourth slot does not need to be a true ultimate unless you give it the Ultimate class.</p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <SelectField
          label="Range"
          value={selection.range}
          options={[{ value: '', label: 'NONE' }, ...battleSkillRangeValues.map((value) => ({ value, label: value.toUpperCase() }))]}
          onChange={(value) => onUpdate((current) => {
            const next = getAbilityClassSelection(current.classes)
            next.range = value as BattleSkillRange | ''
            current.classes = buildAbilityClasses(next)
            syncAbilityPresentation(current)
          })}
        />
        <SelectField
          label="Damage Type"
          value={selection.damageType}
          options={[{ value: '', label: 'NONE' }, ...battleSkillDamageTypeValues.map((value) => ({ value, label: value.toUpperCase() }))]}
          onChange={(value) => onUpdate((current) => {
            const next = getAbilityClassSelection(current.classes)
            next.damageType = value as BattleSkillDamageType | ''
            current.classes = buildAbilityClasses(next)
            syncAbilityPresentation(current)
          })}
        />
        <SelectField
          label="Action Type"
          value={selection.actionType}
          options={[{ value: '', label: 'NONE' }, ...battleSkillActionTypeValues.map((value) => ({ value, label: value.toUpperCase() }))]}
          onChange={(value) => onUpdate((current) => {
            const next = getAbilityClassSelection(current.classes)
            next.actionType = value as BattleSkillActionType | ''
            current.classes = buildAbilityClasses(next)
            syncAbilityPresentation(current)
          })}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onUpdate((current) => {
            const next = getAbilityClassSelection(current.classes)
            next.unique = !next.unique
            current.classes = buildAbilityClasses(next)
            syncAbilityPresentation(current)
          })}
          className={[
            'ca-mono-label rounded-md border px-2.5 py-1 text-[0.38rem] transition',
            selection.unique ? 'border-ca-teal/22 bg-ca-teal-wash text-ca-teal' : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2',
          ].join(' ')}
        >
          UNIQUE
        </button>
        <button
          type="button"
          onClick={() => onUpdate((current) => {
            const next = getAbilityClassSelection(current.classes)
            next.ultimate = !next.ultimate
            current.classes = buildAbilityClasses(next)
            syncAbilityPresentation(current)
          })}
          disabled={isUltimate}
          className={[
            'ca-mono-label rounded-md border px-2.5 py-1 text-[0.38rem] transition disabled:opacity-45',
            selection.ultimate ? 'border-amber-400/22 bg-amber-400/10 text-amber-300' : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2',
          ].join(' ')}
        >
          ULTIMATE
        </button>
      </div>
      {isUltimate ? (
        <p className="mt-2 text-sm leading-6 text-ca-text-3">Use Ultimate only when you want this fourth slot to behave as a true ultimate.</p>
      ) : null}
    </div>
  )
}

function SkillCostPanel({
  ability,
  onUpdate,
}: {
  ability: BattleAbilityTemplate
  onUpdate: (mutator: (ability: BattleAbilityTemplate) => void) => void
}) {
  const manual = Boolean(ability.energyCost)
  const costEntries = Object.entries(getAbilityEnergyCost(ability))

  return (
    <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="ca-mono-label text-[0.4rem] text-ca-text-3">SKILL COST</p>
        <button
          type="button"
          onClick={() => onUpdate((current) => { current.energyCost = current.energyCost ? undefined : {} })}
          className={[
            'ca-mono-label rounded-md border px-2 py-1 text-[0.38rem] transition',
            manual
              ? 'border-ca-teal/22 bg-ca-teal-wash text-ca-teal'
              : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2',
          ].join(' ')}
        >
          {manual ? 'MANUAL' : 'AUTO'}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {costEntries.length > 0 ? (
          costEntries.map(([type, value]) => {
            const meta = type === 'random' ? randomEnergyMeta : battleEnergyMeta[type as keyof typeof battleEnergyMeta]
            return (
              <span key={type} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.38rem] text-ca-text-2">
                {meta.short} {value}
              </span>
            )
          })
        ) : (
          <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.38rem] text-ca-text-2">FREE</span>
        )}
      </div>
      {manual ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {battleEnergyOrder.map((type) => (
            <NumberField
              key={`${ability.id}-${type}`}
              label={battleEnergyMeta[type].short}
              value={ability.energyCost?.[type] ?? 0}
              onChange={(value) => onUpdate((current) => {
                const next = { ...(current.energyCost ?? {}) }
                const sanitized = Math.max(0, Math.floor(value))
                if (sanitized === 0) { delete next[type] } else { next[type] = sanitized }
                current.energyCost = Object.keys(next).length > 0 ? next : {}
              })}
            />
          ))}
          <NumberField
            key={`${ability.id}-random`}
            label={randomEnergyMeta.short}
            value={ability.energyCost?.random ?? 0}
            onChange={(value) => onUpdate((current) => {
              const next = { ...(current.energyCost ?? {}) }
              const sanitized = Math.max(0, Math.floor(value))
              if (sanitized === 0) { delete next.random } else { next.random = sanitized }
              current.energyCost = Object.keys(next).length > 0 ? next : {}
            })}
          />
        </div>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-ca-text-2">{manual ? 'Manual costs are authoritative here. Enter any combination you want and the ACP will preserve it.' : explainCostRule(ability)}</p>
    </div>
  )
}

function EffectListEditor({
  title,
  helper,
  effects,
  onChange,
  advancedJson,
  onAdvancedJsonChange,
}: {
  title: string
  helper: string
  effects: SkillEffect[]
  onChange: (effects: SkillEffect[]) => void
  advancedJson: string
  onAdvancedJsonChange: (value: string) => void
}) {
  function addEffect(type: SkillEffect['type']) {
    onChange([...effects, createEffect(type)])
  }

  function updateEffect(index: number, effect: SkillEffect) {
    onChange(effects.map((entry, entryIndex) => (entryIndex === index ? effect : entry)))
  }

  function removeEffect(index: number) {
    onChange(effects.filter((_, entryIndex) => entryIndex !== index))
  }

  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
      <div>
        <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{title}</p>
        <p className="mt-1 text-xs leading-5 text-ca-text-2">{helper}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {effectTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addEffect(type)}
            className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.38rem] text-ca-text-2 hover:border-ca-teal/25 hover:text-ca-teal"
            title={effectTypeMeta[type].hint}
          >
            ADD {effectTypeMeta[type].label.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {effects.length > 0 ? (
          effects.map((effect, index) => (
            <EffectRowEditor key={`${effect.type}-${index}`} effect={effect} index={index} onChange={(next) => updateEffect(index, next)} onRemove={() => removeEffect(index)} />
          ))
        ) : (
          <div className="rounded-[8px] border border-dashed border-white/10 px-3 py-3 text-sm text-ca-text-3">No effect rows yet. Use the add buttons above.</div>
        )}
      </div>
      <details className="mt-3 rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
        <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Advanced JSON</summary>
        <div className="mt-3">
          <TextAreaField label="Effects JSON" value={advancedJson} onChange={onAdvancedJsonChange} rows={8} mono />
        </div>
      </details>
    </div>
  )
}

function ConditionListEditor({
  conditions,
  onChange,
}: {
  conditions: BattleReactionCondition[]
  onChange: (conditions: BattleReactionCondition[]) => void
}) {
  function addCondition(type: BattleReactionCondition['type']) {
    onChange([...conditions, createReactionCondition(type)])
  }

  function updateCondition(index: number, condition: BattleReactionCondition) {
    onChange(conditions.map((entry, entryIndex) => (entryIndex === index ? condition : entry)))
  }

  function removeCondition(index: number) {
    onChange(conditions.filter((_, entryIndex) => entryIndex !== index))
  }

  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
      <div>
        <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Conditions</p>
        <p className="mt-1 text-xs leading-5 text-ca-text-2">Gate passive triggers with HP, ability use, flags, counters, or shield context.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {conditionTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addCondition(type)}
            className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.38rem] text-ca-text-2 hover:border-ca-teal/25 hover:text-ca-teal"
          >
            ADD {type.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {conditions.length > 0 ? (
          conditions.map((condition, index) => (
            <ConditionRowEditor
              key={`${condition.type}-${index}`}
              condition={condition}
              index={index}
              onChange={(next) => updateCondition(index, next)}
              onRemove={() => removeCondition(index)}
            />
          ))
        ) : (
          <div className="rounded-[8px] border border-dashed border-white/10 px-3 py-3 text-sm text-ca-text-3">No conditions yet. Leave empty for an unconditional trigger.</div>
        )}
      </div>
    </div>
  )
}

function ConditionRowEditor({
  condition,
  index,
  onChange,
  onRemove,
}: {
  condition: BattleReactionCondition
  index: number
  onChange: (condition: BattleReactionCondition) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(11,11,18,0.72)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Condition {index + 1}</p>
        <button type="button" onClick={onRemove} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2 py-1 text-[0.38rem] text-ca-red">REMOVE</button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SelectField
          label="Type"
          value={condition.type}
          options={conditionTypes.map((value) => ({ value, label: value.toUpperCase() }))}
          onChange={(value) => onChange(createReactionCondition(value as BattleReactionCondition['type']))}
        />
        {(condition.type === 'selfHpBelow' || condition.type === 'targetHpBelow') ? (
          <NumberField label="Threshold %" value={Math.round(condition.threshold * 100)} onChange={(value) => onChange({ ...condition, threshold: value / 100 })} />
        ) : null}
        {(condition.type === 'actorHasStatus' || condition.type === 'targetHasStatus') ? (
          <SelectField label="Status" value={condition.status} options={modifierStatusKinds.filter(Boolean).map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...condition, status: value as BattleStatusKind })} />
        ) : null}
        {(condition.type === 'actorHasModifierTag' || condition.type === 'targetHasModifierTag') ? (
          <InputField label="Modifier Tag" value={condition.tag} onChange={(value) => onChange({ ...condition, tag: value })} />
        ) : null}
        {condition.type === 'abilityId' ? <InputField label="Ability ID" value={condition.abilityId} onChange={(value) => onChange({ ...condition, abilityId: value })} /> : null}
        {condition.type === 'abilityClass' ? <SelectField label="Ability Class" value={condition.class} options={battleSkillClassOptions.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...condition, class: value as BattleSkillClass })} /> : null}
        {condition.type === 'fighterFlag' ? <InputField label="Flag Key" value={condition.key} onChange={(value) => onChange({ ...condition, key: value })} /> : null}
        {condition.type === 'fighterFlag' ? <SelectField label="Value" value={String(condition.value)} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...condition, value: value === 'true' })} /> : null}
        {condition.type === 'counterAtLeast' ? <InputField label="Counter Key" value={condition.key} onChange={(value) => onChange({ ...condition, key: value })} /> : null}
        {condition.type === 'counterAtLeast' ? <NumberField label="At Least" value={condition.value} onChange={(value) => onChange({ ...condition, value })} /> : null}
        {condition.type === 'targetCounterAtLeast' ? <InputField label="Counter Key" value={condition.key} onChange={(value) => onChange({ ...condition, key: value })} /> : null}
        {condition.type === 'targetCounterAtLeast' ? <NumberField label="At Least" value={condition.value} onChange={(value) => onChange({ ...condition, value })} /> : null}
        {condition.type === 'usedAbilityLastTurn' ? <InputField label="Ability ID" value={condition.abilityId} onChange={(value) => onChange({ ...condition, abilityId: value })} /> : null}
        {condition.type === 'shieldActive' ? <InputField label="Shield Tag" value={condition.tag ?? ''} onChange={(value) => onChange({ ...condition, tag: value || undefined })} /> : null}
        {condition.type === 'brokenShieldTag' ? <InputField label="Shield Tag" value={condition.tag} onChange={(value) => onChange({ ...condition, tag: value })} /> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-ca-text-2">{describeCondition(condition)}</p>
    </div>
  )
}

function EffectRowEditor({
  effect,
  index,
  onChange,
  onRemove,
}: {
  effect: SkillEffect
  index: number
  onChange: (effect: SkillEffect) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(11,11,18,0.72)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Effect {index + 1}</p>
        <button type="button" onClick={onRemove} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2 py-1 text-[0.38rem] text-ca-red">REMOVE</button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SelectField label="Type" value={effect.type} options={effectTypes.map((value) => ({ value, label: effectTypeMeta[value].label }))} onChange={(value) => onChange({ ...createEffect(value as SkillEffect['type']), target: effect.target })} />
        <SelectField label="Target" value={effect.target} options={effectTargets.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...effect, target: value as SkillEffect['target'] })} />
        {effect.type === 'damage' || effect.type === 'heal' ? <NumberField label={effect.type === 'damage' ? 'Damage' : 'Healing'} value={effect.power} onChange={(value) => onChange({ ...effect, power: value })} /> : null}
        {effect.type === 'invulnerable' || effect.type === 'stun' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'attackUp' ? <NumberField label="Damage Bonus" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'attackUp' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'mark' ? <NumberField label="Bonus Damage" value={effect.bonus} onChange={(value) => onChange({ ...effect, bonus: value })} /> : null}
        {effect.type === 'mark' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'burn' ? <NumberField label="Tick Damage" value={effect.damage} onChange={(value) => onChange({ ...effect, damage: value })} /> : null}
        {effect.type === 'burn' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'counter' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'counter' ? <NumberField label="Counter Damage" value={effect.counterDamage} onChange={(value) => onChange({ ...effect, counterDamage: value })} /> : null}
        {effect.type === 'counter' ? <InputField label="Class Filter CSV" value={formatCsvList(effect.abilityClasses)} onChange={(value) => { const parsed = parseCsvList(value) as BattleSkillClass[]; onChange({ ...effect, abilityClasses: parsed.length > 0 ? parsed : undefined }) }} /> : null}
        {effect.type === 'counter' ? <SelectField label="Consume On Trigger" value={effect.consumeOnTrigger === false ? 'false' : 'true'} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, consumeOnTrigger: value === 'true' })} /> : null}
        {effect.type === 'reflect' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'reflect' ? <InputField label="Class Filter CSV" value={formatCsvList(effect.abilityClasses)} onChange={(value) => { const parsed = parseCsvList(value) as BattleSkillClass[]; onChange({ ...effect, abilityClasses: parsed.length > 0 ? parsed : undefined }) }} /> : null}
        {effect.type === 'reflect' ? <SelectField label="Consume On Trigger" value={effect.consumeOnTrigger === false ? 'false' : 'true'} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, consumeOnTrigger: value === 'true' })} /> : null}
        {effect.type === 'reaction' ? <InputField label="Label" value={effect.label} onChange={(value) => onChange({ ...effect, label: value })} /> : null}
        {effect.type === 'reaction' ? <SelectField label="Trigger" value={effect.trigger} options={reactionTriggers.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...effect, trigger: value as BattleReactionTrigger })} /> : null}
        {effect.type === 'reaction' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'reaction' ? <InputField label="Class Filter CSV" value={formatCsvList(effect.abilityClasses)} onChange={(value) => { const parsed = parseCsvList(value) as BattleSkillClass[]; onChange({ ...effect, abilityClasses: parsed.length > 0 ? parsed : undefined }) }} /> : null}
        {effect.type === 'reaction' ? <SelectField label="Harmful Only" value={effect.harmfulOnly ? 'true' : 'false'} options={[{ value: 'false', label: 'FALSE' }, { value: 'true', label: 'TRUE' }]} onChange={(value) => onChange({ ...effect, harmfulOnly: value === 'true' })} /> : null}
        {effect.type === 'reaction' ? <SelectField label="Consume On Trigger" value={effect.consumeOnTrigger === false ? 'false' : 'true'} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, consumeOnTrigger: value === 'true' })} /> : null}
        {effect.type === 'reaction' ? <SelectField label="Once Per Round" value={effect.oncePerRound ? 'true' : 'false'} options={[{ value: 'false', label: 'FALSE' }, { value: 'true', label: 'TRUE' }]} onChange={(value) => onChange({ ...effect, oncePerRound: value === 'true' })} /> : null}
        {effect.type === 'cooldownReduction' ? <NumberField label="Cooldowns Reduced" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'cooldownAdjust' ? <NumberField label="Cooldown Delta" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'cooldownAdjust' ? <InputField label="Ability ID (Optional)" value={effect.abilityId ?? ''} onChange={(value) => onChange({ ...effect, abilityId: value || undefined })} /> : null}
        {effect.type === 'cooldownAdjust' ? <SelectField label="Include Ready" value={effect.includeReady ? 'true' : 'false'} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, includeReady: value === 'true' })} /> : null}
        {(effect.type === 'energyGain' || effect.type === 'energyDrain' || effect.type === 'energySteal') ? battleEnergyOrder.map((type) => (
          <NumberField
            key={`${effect.type}-${type}`}
            label={`${battleEnergyMeta[type].short} Amount`}
            value={effect.amount[type] ?? 0}
            onChange={(value) => onChange({ ...effect, amount: { ...effect.amount, [type]: Math.max(0, value) } })}
          />
        )) : null}
        {(effect.type === 'energyGain' || effect.type === 'energyDrain' || effect.type === 'energySteal') ? (
          <NumberField
            label="Random Amount"
            value={effect.amount.random ?? 0}
            onChange={(value) => onChange({ ...effect, amount: { ...effect.amount, random: Math.max(0, value) } })}
          />
        ) : null}
        {effect.type === 'damageBoost' ? <NumberField label="Boost %" value={Math.round(effect.amount * 100)} onChange={(value) => onChange({ ...effect, amount: value / 100 })} /> : null}
        {effect.type === 'shield' ? <NumberField label="Shield" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'shield' ? <InputField label="Label" value={effect.label ?? ''} onChange={(value) => onChange({ ...effect, label: value || undefined })} /> : null}
        {effect.type === 'shield' ? <InputField label="Tags CSV" value={formatCsvList(effect.tags)} onChange={(value) => onChange({ ...effect, tags: parseCsvList(value) })} /> : null}
        {effect.type === 'shieldDamage' ? <NumberField label="Shield Damage" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'shieldDamage' ? <InputField label="Required Tag (Optional)" value={effect.tag ?? ''} onChange={(value) => onChange({ ...effect, tag: value || undefined })} /> : null}
        {effect.type === 'modifyAbilityCost' ? (
          <InputField label="Label" value={effect.modifier.label} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, label: value } })} />
        ) : null}
        {effect.type === 'modifyAbilityCost' ? (
          <SelectField label="Mode" value={effect.modifier.mode} options={costModifierModes.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, mode: value as typeof costModifierModes[number], cost: value === 'set' ? (effect.modifier.cost ?? {}) : undefined, amount: value === 'set' ? undefined : (effect.modifier.amount ?? 1) } })} />
        ) : null}
        {effect.type === 'modifyAbilityCost' ? (
          <InputField label="Ability ID" value={effect.modifier.abilityId ?? ''} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, abilityId: value || undefined } })} />
        ) : null}
        {effect.type === 'modifyAbilityCost' ? (
          <SelectField label="Ability Class" value={effect.modifier.abilityClass ?? ''} options={[{ value: '', label: 'ANY' }, ...battleSkillClassOptions.map((value) => ({ value, label: value.toUpperCase() }))]} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, abilityClass: value ? value as BattleSkillClass : undefined } })} />
        ) : null}
        {effect.type === 'modifyAbilityCost' && effect.modifier.mode !== 'set' ? (
          <NumberField label="Amount" value={effect.modifier.amount ?? 0} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, amount: value } })} />
        ) : null}
        {effect.type === 'modifyAbilityCost' ? (
          <NumberField label="Duration" value={effect.modifier.duration} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, duration: value } })} />
        ) : null}
        {effect.type === 'modifyAbilityCost' ? (
          <NumberField label="Uses" value={effect.modifier.uses ?? 0} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, uses: value > 0 ? value : undefined } })} />
        ) : null}
        {effect.type === 'modifyAbilityCost' && effect.modifier.mode === 'set' ? (
          <InputField label="Set Cost JSON" value={JSON.stringify(effect.modifier.cost ?? {})} onChange={(value) => { try { onChange({ ...effect, modifier: { ...effect.modifier, cost: JSON.parse(value) } }) } catch { /* ignore */ } }} />
        ) : null}
        {effect.type === 'overhealToShield' ? <NumberField label="Healing / Overheal" value={effect.power} onChange={(value) => onChange({ ...effect, power: value })} /> : null}
        {effect.type === 'overhealToShield' ? <InputField label="Shield Label" value={effect.shieldLabel ?? 'Overheal'} onChange={(value) => onChange({ ...effect, shieldLabel: value || undefined })} /> : null}
        {effect.type === 'overhealToShield' ? <InputField label="Shield Tags CSV" value={formatCsvList(effect.shieldTags)} onChange={(value) => onChange({ ...effect, shieldTags: parseCsvList(value) })} /> : null}
        {effect.type === 'effectImmunity' ? <InputField label="Label" value={effect.label} onChange={(value) => onChange({ ...effect, label: value })} /> : null}
        {effect.type === 'effectImmunity' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'effectImmunity' ? <InputField label="Blocks CSV" value={formatCsvList(effect.blocks)} onChange={(value) => onChange({ ...effect, blocks: parseCsvList(value) as typeof effect.blocks })} /> : null}
        {effect.type === 'effectImmunity' ? <InputField label="Tags CSV (Optional)" value={formatCsvList(effect.tags)} onChange={(value) => onChange({ ...effect, tags: parseCsvList(value).length > 0 ? parseCsvList(value) : undefined })} /> : null}
        {effect.type === 'removeEffectImmunity' ? <InputField label="Filter Label (Optional)" value={effect.filter.label ?? ''} onChange={(value) => onChange({ ...effect, filter: { ...effect.filter, label: value || undefined } })} /> : null}
        {effect.type === 'removeEffectImmunity' ? <InputField label="Filter Tag (Optional)" value={effect.filter.tag ?? ''} onChange={(value) => onChange({ ...effect, filter: { ...effect.filter, tag: value || undefined } })} /> : null}
        {effect.type === 'setFlag' ? <InputField label="Key" value={effect.key} onChange={(value) => onChange({ ...effect, key: value })} /> : null}
        {effect.type === 'setFlag' ? <SelectField label="Value" value={String(effect.value)} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, value: value === 'true' })} /> : null}
        {effect.type === 'adjustCounter' ? <InputField label="Key" value={effect.key} onChange={(value) => onChange({ ...effect, key: value })} /> : null}
        {effect.type === 'adjustCounter' ? <NumberField label="Amount" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'adjustCounter' ? <NumberField label="Min Clamp" value={effect.min ?? 0} onChange={(value) => onChange({ ...effect, min: value })} /> : null}
        {effect.type === 'adjustCounter' ? <NumberField label="Max Clamp" value={effect.max ?? 0} onChange={(value) => onChange({ ...effect, max: value > 0 ? value : undefined })} /> : null}
        {effect.type === 'setCounter' ? <InputField label="Key" value={effect.key} onChange={(value) => onChange({ ...effect, key: value })} /> : null}
        {effect.type === 'setCounter' ? <NumberField label="Value" value={effect.value} onChange={(value) => onChange({ ...effect, value })} /> : null}
        {effect.type === 'adjustCounterByTriggerAmount' ? <InputField label="Key" value={effect.key} onChange={(value) => onChange({ ...effect, key: value })} /> : null}
        {effect.type === 'resetCounter' ? <InputField label="Key" value={effect.key} onChange={(value) => onChange({ ...effect, key: value })} /> : null}
        {effect.type === 'addModifier' ? <InputField label="Modifier Label" value={effect.modifier.label} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, label: value } })} /> : null}
        {effect.type === 'addModifier' ? <SelectField label="Scope" value={effect.modifier.scope ?? 'fighter'} options={modifierScopes.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, scope: value as BattleModifierScope } })} /> : null}
        {effect.type === 'addModifier' ? <SelectField label="Stat" value={effect.modifier.stat} options={modifierStats.map((value) => ({ value, label: value }))} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, stat: value as BattleModifierStat } })} /> : null}
        {effect.type === 'addModifier' ? <SelectField label="Mode" value={effect.modifier.mode} options={modifierModes.map((value) => ({ value, label: value }))} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, mode: value as BattleModifierMode } })} /> : null}
        {effect.type === 'addModifier' && usesBooleanModifierValue(effect) ? <SelectField label="Value" value={String(effect.modifier.value)} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, value: value === 'true' } })} /> : null}
        {effect.type === 'addModifier' && !usesBooleanModifierValue(effect) ? <NumberField label="Value" value={typeof effect.modifier.value === 'number' ? effect.modifier.value : 0} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, value } })} /> : null}
        {effect.type === 'addModifier' ? <SelectField label="Duration" value={effect.modifier.duration.kind} options={[{ value: 'rounds', label: 'ROUNDS' }, { value: 'permanent', label: 'PERMANENT' }, { value: 'untilRemoved', label: 'UNTIL REMOVED' }]} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, duration: value === 'rounds' ? { kind: 'rounds', rounds: 1 } : value === 'permanent' ? { kind: 'permanent' } : { kind: 'untilRemoved' } } })} /> : null}
        {effect.type === 'addModifier' && effect.modifier.duration.kind === 'rounds' ? <NumberField label="Rounds" value={effect.modifier.duration.rounds} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, duration: { kind: 'rounds', rounds: value } } })} /> : null}
        {effect.type === 'addModifier' ? <InputField label="Tags CSV" value={formatCsvList(effect.modifier.tags)} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, tags: parseCsvList(value) } })} /> : null}
        {effect.type === 'addModifier' ? <SelectField label="Visible" value={effect.modifier.visible === false ? 'false' : 'true'} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, visible: value === 'true' } })} /> : null}
        {effect.type === 'addModifier' ? <SelectField label="Status Kind" value={effect.modifier.statusKind ?? ''} options={modifierStatusKinds.map((value) => ({ value, label: value ? value.toUpperCase() : 'NONE' }))} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, statusKind: value ? value as BattleStatusKind : undefined } })} /> : null}
        {effect.type === 'addModifier' ? <SelectField label="Stacking" value={effect.modifier.stacking ?? 'max'} options={modifierStackingOptions.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...effect, modifier: { ...effect.modifier, stacking: value as 'max' | 'replace' | 'stack' } })} /> : null}
        {effect.type === 'removeModifier' ? <InputField label="Filter Label" value={effect.filter.label ?? ''} onChange={(value) => onChange({ ...effect, filter: { ...effect.filter, label: value || undefined } })} /> : null}
        {effect.type === 'removeModifier' ? <SelectField label="Filter Stat" value={effect.filter.stat ?? ''} options={[{ value: '', label: 'ANY' }, ...modifierStats.map((value) => ({ value, label: value }))]} onChange={(value) => onChange({ ...effect, filter: { ...effect.filter, stat: value ? value as BattleModifierStat : undefined } })} /> : null}
        {effect.type === 'removeModifier' ? <SelectField label="Filter Scope" value={effect.filter.scope ?? ''} options={[{ value: '', label: 'ANY' }, ...modifierScopes.map((value) => ({ value, label: value.toUpperCase() }))]} onChange={(value) => onChange({ ...effect, filter: { ...effect.filter, scope: value ? value as BattleModifierScope : undefined } })} /> : null}
        {effect.type === 'removeModifier' ? <SelectField label="Status Kind" value={effect.filter.statusKind ?? ''} options={modifierStatusKinds.map((value) => ({ value, label: value ? value.toUpperCase() : 'ANY' }))} onChange={(value) => onChange({ ...effect, filter: { ...effect.filter, statusKind: value ? value as BattleStatusKind : undefined } })} /> : null}
        {effect.type === 'removeModifier' ? <InputField label="Tags CSV" value={formatCsvList(effect.filter.tags)} onChange={(value) => onChange({ ...effect, filter: { ...effect.filter, tags: parseCsvList(value) } })} /> : null}
        {effect.type === 'modifyAbilityState' ? (
          <SelectField
            label="Mode"
            value={effect.delta.mode}
            options={[{ value: 'replace', label: 'REPLACE' }, { value: 'grant', label: 'GRANT' }, { value: 'lock', label: 'LOCK' }]}
            onChange={(value) => {
              const duration = effect.delta.duration
              const slotId = effect.delta.mode !== 'grant' ? effect.delta.slotAbilityId : 'target-ability-id'
              const next: BattleAbilityStateDelta =
                value === 'replace' ? { mode: 'replace', slotAbilityId: slotId, replacement: createTemporaryAbility(), duration }
                : value === 'grant' ? { mode: 'grant', grantedAbility: createTemporaryAbility(), duration }
                : { mode: 'lock', slotAbilityId: slotId, duration }
              onChange({ ...effect, delta: next })
            }}
          />
        ) : null}
        {effect.type === 'modifyAbilityState' && (effect.delta.mode === 'replace' || effect.delta.mode === 'lock') ? (
          <InputField label="Slot Ability ID" value={effect.delta.slotAbilityId} onChange={(value) => {
            const delta = effect.delta
            if (delta.mode === 'replace') onChange({ ...effect, delta: { ...delta, slotAbilityId: value } })
            else if (delta.mode === 'lock') onChange({ ...effect, delta: { ...delta, slotAbilityId: value } })
          }} />
        ) : null}
        {effect.type === 'modifyAbilityState' ? (
          <NumberField label="Duration (rounds)" value={effect.delta.duration} onChange={(value) => {
            onChange({ ...effect, delta: { ...effect.delta, duration: value } as BattleAbilityStateDelta })
          }} />
        ) : null}
        {effect.type === 'schedule' ? <NumberField label="Delay (rounds)" value={effect.delay} onChange={(value) => onChange({ ...effect, delay: value })} /> : null}
        {effect.type === 'schedule' ? (
          <SelectField
            label="Phase"
            value={effect.phase}
            options={[{ value: 'roundStart', label: 'ROUND START' }, { value: 'roundEnd', label: 'ROUND END' }]}
            onChange={(value) => onChange({ ...effect, phase: value as BattleScheduledPhase })}
          />
        ) : null}
        {effect.type === 'replaceAbility' ? <InputField label="Slot Ability ID" value={effect.slotAbilityId} onChange={(value) => onChange({ ...effect, slotAbilityId: value })} /> : null}
        {effect.type === 'replaceAbility' ? <NumberField label="Duration (rounds)" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'damageEqualToActorShield' ? <InputField label="Shield Tag Filter (Optional)" value={effect.shieldTag ?? ''} onChange={(value) => onChange({ ...effect, shieldTag: value || undefined })} /> : null}
        {effect.type === 'damageEqualToActorShield' ? <SelectField label="Piercing" value={effect.piercing ? 'true' : 'false'} options={[{ value: 'false', label: 'FALSE' }, { value: 'true', label: 'TRUE' }]} onChange={(value) => onChange({ ...effect, piercing: value === 'true' })} /> : null}
        {effect.type === 'damageEqualToActorShield' ? <SelectField label="Cannot Be Countered" value={effect.cannotBeCountered ? 'true' : 'false'} options={[{ value: 'false', label: 'FALSE' }, { value: 'true', label: 'TRUE' }]} onChange={(value) => onChange({ ...effect, cannotBeCountered: value === 'true' })} /> : null}
        {effect.type === 'damageFiltered' ? <NumberField label="Damage" value={effect.power} onChange={(value) => onChange({ ...effect, power: value })} /> : null}
        {effect.type === 'damageFiltered' ? <InputField label="Requires Modifier Tag" value={effect.requiresTag} onChange={(value) => onChange({ ...effect, requiresTag: value })} /> : null}
        {effect.type === 'damageFiltered' ? <SelectField label="Piercing" value={effect.piercing ? 'true' : 'false'} options={[{ value: 'false', label: 'FALSE' }, { value: 'true', label: 'TRUE' }]} onChange={(value) => onChange({ ...effect, piercing: value === 'true' })} /> : null}
        {effect.type === 'damageFiltered' ? <SelectField label="Cannot Be Countered" value={effect.cannotBeCountered ? 'true' : 'false'} options={[{ value: 'false', label: 'FALSE' }, { value: 'true', label: 'TRUE' }]} onChange={(value) => onChange({ ...effect, cannotBeCountered: value === 'true' })} /> : null}
        {effect.type === 'classStunScaledByCounter' ? <InputField label="Counter Key" value={effect.counterKey} onChange={(value) => onChange({ ...effect, counterKey: value })} /> : null}
        {effect.type === 'classStunScaledByCounter' ? <NumberField label="Base Duration" value={effect.baseDuration} onChange={(value) => onChange({ ...effect, baseDuration: value })} /> : null}
        {effect.type === 'classStunScaledByCounter' ? <NumberField label="Duration Per Stack" value={effect.durationPerStack} onChange={(value) => onChange({ ...effect, durationPerStack: value })} /> : null}
        {effect.type === 'classStunScaledByCounter' ? <SelectField label="Consume Stacks" value={effect.consumeStacks ? 'true' : 'false'} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, consumeStacks: value === 'true' })} /> : null}
        {effect.type === 'classStunScaledByCounter' ? <InputField label="Modifier Tag (Optional)" value={effect.modifierTag ?? ''} onChange={(value) => onChange({ ...effect, modifierTag: value || undefined })} /> : null}
        {effect.type === 'classStunScaledByCounter' ? <InputField label="Blocked Classes CSV" value={formatCsvList(effect.blockedClasses)} onChange={(value) => onChange({ ...effect, blockedClasses: parseCsvList(value) as BattleSkillClass[] })} /> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-ca-text-2">{describeEffect(effect)}</p>
      {effect.type === 'modifyAbilityState' && effect.delta.mode === 'replace' ? (
        <details className="mt-2 rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
          <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Replacement Ability JSON</summary>
          <div className="mt-3">
            <TextAreaField label="Ability JSON" value={JSON.stringify(effect.delta.replacement, null, 2)} onChange={(value) => { try { const parsed = JSON.parse(value) as BattleAbilityTemplate; const d = effect.delta; if (d.mode === 'replace') onChange({ ...effect, delta: { mode: 'replace', slotAbilityId: d.slotAbilityId, replacement: parsed, duration: d.duration } }) } catch { /* ignore */ } }} rows={8} mono />
          </div>
        </details>
      ) : null}
      {effect.type === 'modifyAbilityState' && effect.delta.mode === 'grant' ? (
        <details className="mt-2 rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
          <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Granted Ability JSON</summary>
          <div className="mt-3">
            <TextAreaField label="Ability JSON" value={JSON.stringify(effect.delta.grantedAbility, null, 2)} onChange={(value) => { try { const parsed = JSON.parse(value) as BattleAbilityTemplate; const d = effect.delta; if (d.mode === 'grant') onChange({ ...effect, delta: { mode: 'grant', grantedAbility: parsed, duration: d.duration } }) } catch { /* ignore */ } }} rows={8} mono />
          </div>
        </details>
      ) : null}
      {effect.type === 'schedule' ? (
        <details className="mt-2 rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
          <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Nested Effects JSON ({effect.effects.length} effect{effect.effects.length === 1 ? '' : 's'})</summary>
          <div className="mt-3">
            <TextAreaField label="Effects JSON" value={JSON.stringify(effect.effects, null, 2)} onChange={(value) => { try { const parsed = JSON.parse(value) as SkillEffect[]; onChange({ ...effect, effects: parsed }) } catch { /* ignore */ } }} rows={8} mono />
          </div>
        </details>
      ) : null}
      {effect.type === 'replaceAbility' ? (
        <details className="mt-2 rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
          <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Replacement Ability JSON</summary>
          <div className="mt-3">
            <TextAreaField label="Ability JSON" value={JSON.stringify(effect.ability, null, 2)} onChange={(value) => { try { const parsed = JSON.parse(value) as BattleAbilityTemplate; onChange({ ...effect, ability: parsed }) } catch { /* ignore */ } }} rows={8} mono />
          </div>
        </details>
      ) : null}
    </div>
  )
}

