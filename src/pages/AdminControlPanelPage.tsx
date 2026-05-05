import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import { LiveOpsPanel } from '@/pages/admin/LiveOpsPanel'
import {
  authoredBattleContent,
  battleRoster,
  defaultBattleSetup,
} from '@/features/battle/data'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import { validateImageUrl } from '@/features/images/imageUrl'
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

type StudioSection = 'liveops' | 'content'

type SelectedSection = 'identity' | 'passive' | 'skill-0' | 'skill-1' | 'skill-2' | 'ultimate' | 'assets' | 'qa' | 'advanced'

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
    facePortrait: '',
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
  const [selectedSection, setSelectedSection] = useState<SelectedSection>('identity')
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

    // Reject any image URL fields that contain unsafe or non-public values
    for (const fighter of draft.roster) {
      if (fighter.boardPortraitSrc) {
        const v = validateImageUrl(fighter.boardPortraitSrc, { allowEmpty: true, allowLocalPaths: true })
        if (!v.ok) {
          setStatusFlash(`BAD PORTRAIT URL (${fighter.shortName}): ${v.error}`)
          return
        }
      }
      if (fighter.facePortrait) {
        const v = validateImageUrl(fighter.facePortrait, { allowEmpty: true, allowLocalPaths: true })
        if (!v.ok) {
          setStatusFlash(`BAD FACE URL (${fighter.shortName}): ${v.error}`)
          return
        }
      }
      for (const ability of [...(fighter.abilities ?? []), fighter.ultimate].filter(Boolean)) {
        if (ability.icon.src) {
          const v = validateImageUrl(ability.icon.src, { allowEmpty: true, allowLocalPaths: true })
          if (!v.ok) {
            setStatusFlash(`BAD ICON URL (${ability.name}): ${v.error}`)
            return
          }
        }
      }
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

  const skillSections: SelectedSection[] = ['skill-0', 'skill-1', 'skill-2', 'ultimate']

  function getAbilityForSection(section: SelectedSection): BattleAbilityTemplate | null {
    if (!selectedFighter) return null
    if (section === 'skill-0') return selectedFighter.abilities[0] ?? null
    if (section === 'skill-1') return selectedFighter.abilities[1] ?? null
    if (section === 'skill-2') return selectedFighter.abilities[2] ?? null
    if (section === 'ultimate') return selectedFighter.ultimate
    return null
  }

  const inspectorAbility = skillSections.includes(selectedSection) ? getAbilityForSection(selectedSection) : null

  const inspectorOpen = selectedFighter !== null && selectedSection !== null

  return (
    <div className="py-4 sm:py-6 space-y-3">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="ca-mono-label text-[0.4rem] text-ca-text-3 tracking-wider">CURSED ARENA STUDIO</p>
            {studioSection === 'content' && selectedFighter ? (
              <p className="ca-display mt-0.5 truncate text-[1.1rem] text-ca-text">{selectedFighter.name}</p>
            ) : (
              <p className="ca-display mt-0.5 text-[1.1rem] text-ca-text">{studioSection === 'liveops' ? 'Live Ops' : 'Character Studio'}</p>
            )}
          </div>
          <div className="flex gap-1">
            {([
              { id: 'liveops', label: 'Live Ops' },
              { id: 'content', label: 'Content' },
            ] as const).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStudioSection(s.id)}
                className={[
                  'ca-mono-label rounded-[5px] border px-2.5 py-1 text-[0.38rem] transition',
                  studioSection === s.id
                    ? 'border-white/18 bg-[rgba(255,255,255,0.06)] text-ca-text'
                    : 'border-transparent text-ca-text-3 hover:text-ca-text-2',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {studioSection === 'content' ? (
          <div className="flex items-center gap-2 shrink-0">
            {statusFlash ? <span className="ca-mono-label text-[0.38rem] text-ca-text-3">{statusFlash}</span> : null}
            <span className={`ca-mono-label text-[0.38rem] ${liveMatchesDraft ? 'text-ca-text-3' : 'text-amber-400'}`}>
              {liveMatchesDraft ? 'saved' : 'unsaved'}
            </span>
            {validationReport.errors.length > 0 ? (
              <span className="ca-mono-label text-[0.38rem] text-ca-red">{validationReport.errors.length} error{validationReport.errors.length === 1 ? '' : 's'}</span>
            ) : null}
            <button type="button" onClick={handleSaveDraft} className="ca-mono-label rounded-[5px] border border-white/12 bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[0.38rem] text-ca-text-2 hover:border-white/20 transition">Save</button>
            <button type="button" onClick={handlePublish} disabled={isPublishing} className="ca-mono-label rounded-[5px] border border-ca-red/40 bg-[rgba(220,30,55,0.14)] px-2.5 py-1 text-[0.38rem] text-ca-red hover:bg-[rgba(220,30,55,0.22)] transition disabled:opacity-50">{isPublishing ? 'Publishing…' : 'Publish'}</button>
            <details className="relative">
              <summary className="ca-mono-label cursor-pointer border-0 text-[0.38rem] text-ca-text-3 list-none hover:text-ca-text-2 transition">···</summary>
              <div className="absolute right-0 top-full z-20 mt-1 flex flex-col gap-1 rounded-[8px] border border-white/10 bg-[rgba(14,15,20,0.97)] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.5)]">
                <button type="button" onClick={handleResetDraft} className="ca-mono-label rounded-[5px] px-3 py-1.5 text-left text-[0.38rem] text-ca-text-2 hover:bg-[rgba(255,255,255,0.04)] whitespace-nowrap transition">Reset Draft</button>
                <button type="button" onClick={handleRestoreAuthored} className="ca-mono-label rounded-[5px] px-3 py-1.5 text-left text-[0.38rem] text-ca-text-2 hover:bg-[rgba(255,255,255,0.04)] whitespace-nowrap transition">Restore Authored</button>
                <button type="button" onClick={handleRevertPublished} className="ca-mono-label rounded-[5px] px-3 py-1.5 text-left text-[0.38rem] text-ca-teal hover:bg-[rgba(255,255,255,0.04)] whitespace-nowrap transition">Revert Live</button>
              </div>
            </details>
            <Link to="/settings" className="ca-mono-label text-[0.38rem] text-ca-text-3 hover:text-ca-text-2 transition">← Back</Link>
          </div>
        ) : (
          <Link to="/settings" className="ca-mono-label text-[0.38rem] text-ca-text-3 hover:text-ca-text-2 transition">← Back</Link>
        )}
      </div>

      {studioSection === 'liveops' ? <LiveOpsPanel /> : null}

      {studioSection === 'content' ? (
        <div className="flex gap-3 items-start">

          {/* ── Roster Rail ── */}
          <aside className="w-[11rem] shrink-0 sticky top-4 self-start">
            <div className="space-y-px">
              <div className="px-1 pb-1.5">
                <input
                  type="text"
                  value={fighterSearch}
                  onChange={(e) => setFighterSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-[5px] border border-white/8 bg-transparent px-2 py-1 text-[0.7rem] text-ca-text outline-none placeholder:text-ca-text-3 focus:border-white/18"
                />
              </div>
              {visibleRoster.length === 0 ? (
                <p className="px-2 py-2 text-[0.65rem] text-ca-text-3">No matches.</p>
              ) : null}
              {visibleRoster.map((fighter) => {
                const hasErrors = validationReport.errors.some((e) => e.toLowerCase().includes(fighter.id))
                const isSelected = selectedFighterId === fighter.id
                return (
                  <button
                    key={fighter.id}
                    type="button"
                    onClick={() => {
                      setSelectedFighterId(fighter.id)
                      setSelectedAbilityId(fighter.abilities[0]?.id ?? fighter.ultimate.id)
                      setSelectedPassiveIndex(0)
                      setFighterJsonDraft(JSON.stringify(fighter, null, 2))
                      setSelectedSection('identity')
                    }}
                    className={[
                      'w-full rounded-[5px] px-2 py-1.5 text-left transition',
                      isSelected
                        ? 'bg-[rgba(255,255,255,0.06)] text-ca-text'
                        : 'text-ca-text-2 hover:bg-[rgba(255,255,255,0.03)] hover:text-ca-text',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[0.72rem] font-medium">{fighter.shortName || fighter.name}</span>
                      {hasErrors ? <span className="shrink-0 text-[0.55rem] text-ca-red">!</span> : null}
                    </div>
                    <p className="mt-0.5 text-[0.55rem] text-ca-text-3">{fighter.rarity}</p>
                  </button>
                )
              })}
              <div className="border-t border-white/6 pt-1.5 mt-1.5 px-1 flex gap-1">
                <button type="button" onClick={handleAddFighter} className="ca-mono-label rounded-[4px] border border-white/8 px-2 py-1 text-[0.36rem] text-ca-text-3 hover:border-ca-teal/22 hover:text-ca-teal transition">+ Add</button>
                <button type="button" onClick={handleDuplicateFighter} disabled={!selectedFighter} className="ca-mono-label rounded-[4px] border border-white/8 px-2 py-1 text-[0.36rem] text-ca-text-3 hover:border-white/18 transition disabled:opacity-40">Dup</button>
                <button type="button" onClick={handleDeleteFighter} disabled={!selectedFighter || draft.roster.length <= 1} className="ca-mono-label rounded-[4px] border border-white/8 px-2 py-1 text-[0.36rem] text-ca-text-3 hover:border-ca-red/22 hover:text-ca-red transition disabled:opacity-40">Del</button>
              </div>
            </div>
          </aside>

          {/* ── Main canvas + bottom inspector ── */}
          <div className="min-w-0 flex-1 space-y-3">

            {/* Manual preview */}
            {selectedFighter ? (
              <CharacterManualPreview
                fighter={selectedFighter}
                selectedSection={selectedSection}
                onSelectSection={(s) => setSelectedSection(s === selectedSection ? selectedSection : s)}
                validationErrors={validationReport.errors.filter((e) => e.toLowerCase().includes(selectedFighter.id))}
              />
            ) : (
              <div className="rounded-[10px] border border-dashed border-white/8 px-6 py-16 text-center">
                <p className="ca-mono-label text-[0.44rem] text-ca-text-3">Select a fighter from the registry</p>
              </div>
            )}

            {/* Bottom inspector drawer */}
            {inspectorOpen && selectedFighter ? (
              <CharacterInspectorPanel
                fighter={selectedFighter}
                selectedSection={selectedSection}
                onSelectSection={setSelectedSection}
                inspectorAbility={inspectorAbility}
                selectedPassiveIndex={selectedPassiveIndexResolved}
                selectedPassive={selectedPassive}
                validationErrors={validationReport.errors}
                statusFlash={statusFlash}
                fighterJsonDraft={fighterJsonDraft}
                setFighterJsonDraft={setFighterJsonDraft}
                onUpdateFighter={updateSelectedFighter}
                onUpdateFighterId={handleUpdateFighterId}
                onUpdateAbility={(mutator) => {
                  if (inspectorAbility) updateAbilityById(inspectorAbility.id, mutator)
                }}
                onUpdateAbilityEffects={(effects) => {
                  if (inspectorAbility) updateAbilityEffectsById(inspectorAbility.id, effects)
                }}
                onAdvancedEffectsJson={(value) => {
                  if (inspectorAbility) {
                    updateJsonField<SkillEffect[]>(value, (parsed) => updateAbilityById(inspectorAbility.id, (a) => { a.effects = parsed }), 'EFFECTS UPDATED')
                  }
                }}
                onUpdatePassive={updateSelectedPassive}
                onUpdatePassiveEffects={(mutator) => updateSelectedPassiveEffects(mutator)}
                onAdvancedPassiveJson={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateSelectedPassive((p) => { p.effects = parsed }), 'PASSIVE EFFECTS UPDATED')}
                onAdvancedPassiveConditionsJson={(value) => updateJsonField<BattleReactionCondition[]>(value, (parsed) => updateSelectedPassive((p) => { p.conditions = parsed }), 'PASSIVE CONDITIONS UPDATED')}
                onAddPassive={handleAddPassive}
                onRemovePassive={handleRemovePassive}
                onSelectPassiveIndex={setSelectedPassiveIndex}
                onAddAbility={handleAddAbility}
                onDeleteAbility={handleDeleteAbility}
                onImportFighter={handleImportFighter}
                onCopyFighterJson={handleCopyFighterJson}
              />
            ) : null}

          </div>
        </div>
      ) : null}

    </div>
  )
}

// ─── Character Manual Preview ────────────────────────────────────────────────

function CharacterManualPreview({
  fighter,
  selectedSection,
  onSelectSection,
  validationErrors,
}: {
  fighter: BattleFighterTemplate
  selectedSection: SelectedSection
  onSelectSection: (s: SelectedSection) => void
  validationErrors: string[]
}) {
  const passives = groupNamedPassives(fighter.passiveEffects ?? [])
  const allAbilities = [fighter.abilities[0], fighter.abilities[1], fighter.abilities[2], fighter.ultimate].filter((a): a is BattleAbilityTemplate => Boolean(a))
  const skillSectionMap: Array<{ section: SelectedSection; ability: BattleAbilityTemplate; isUltimate: boolean }> = [
    { section: 'skill-0', ability: allAbilities[0] ?? fighter.ultimate, isUltimate: false },
    { section: 'skill-1', ability: allAbilities[1] ?? fighter.ultimate, isUltimate: false },
    { section: 'skill-2', ability: allAbilities[2] ?? fighter.ultimate, isUltimate: false },
    { section: 'ultimate', ability: fighter.ultimate, isUltimate: true },
  ]

  return (
    <div className="overflow-hidden rounded-[10px] border border-white/10 bg-[rgba(9,10,15,0.92)]">
      {/* Document header */}
      <div className="border-b border-white/6 px-5 py-2">
        <p className="ca-mono-label text-[0.38rem] tracking-[0.18em] text-ca-text-3">CHARACTER MANUAL · CURSED ARENA</p>
      </div>

      <div className="divide-y divide-white/6">

        {/* ── Character Intro ── */}
        <button
          type="button"
          onClick={() => onSelectSection('identity')}
          className={[
            'relative w-full text-left px-5 py-5 transition-colors',
            selectedSection === 'identity'
              ? 'bg-[rgba(5,216,189,0.04)]'
              : 'hover:bg-[rgba(255,255,255,0.012)]',
          ].join(' ')}
        >
          {selectedSection === 'identity' && (
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-ca-teal/50 rounded-r-full" />
          )}
          <div className="flex gap-4">
            <div className="shrink-0">
              <PortraitPreview fighter={fighter} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="ca-display text-[1.65rem] leading-none text-ca-text">{fighter.name || '—'}</p>
              <p className="ca-mono-label mt-1 text-[0.38rem] tracking-wider text-ca-text-3">
                {fighter.battleTitle?.toUpperCase() || fighter.role.toUpperCase()} · {fighter.rarity} · {fighter.maxHp} HP
              </p>
              <p className="mt-2.5 text-[0.78rem] leading-relaxed text-ca-text-2">{fighter.bio || 'No biography authored.'}</p>
              <p className="mt-2 text-[0.68rem] text-ca-text-3">
                <span className="ca-mono-label text-[0.36rem] mr-1 text-ca-text-3">UNLOCK:</span>
                {fighter.affiliationLabel || 'Available by default'}
              </p>
            </div>
          </div>
        </button>

        {/* ── Passive ── */}
        <button
          type="button"
          onClick={() => onSelectSection('passive')}
          className={[
            'relative w-full text-left px-5 py-3.5 transition-colors',
            selectedSection === 'passive'
              ? 'bg-[rgba(5,216,189,0.04)]'
              : 'hover:bg-[rgba(255,255,255,0.012)]',
          ].join(' ')}
        >
          {selectedSection === 'passive' && (
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-ca-teal/50 rounded-r-full" />
          )}
          {passives.length > 0 ? passives.map((passive, i) => (
            <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-white/6' : ''}>
              <div className="flex items-center gap-2">
                <div className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-[3px] border border-ca-teal/18 bg-[rgba(5,216,189,0.07)]">
                  {normalizeBattleAssetSrc(passive.icon?.src)
                    ? <img src={normalizeBattleAssetSrc(passive.icon?.src)} alt={passive.label} className="h-full w-full object-cover" />
                    : <span className="ca-mono-label text-[0.36rem] text-ca-teal">{passive.icon?.label ?? 'P'}</span>
                  }
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="ca-mono-label text-[0.36rem] text-ca-teal">PASSIVE</span>
                  <span className="font-[var(--font-display-alt)] text-[0.82rem] font-semibold text-ca-text">{passive.label}</span>
                </div>
              </div>
              <p className="mt-1 pl-7 text-[0.73rem] leading-[1.55] text-ca-text-2">{passive.description ?? describePassive(passive)}</p>
            </div>
          )) : (
            <p className="ca-mono-label text-[0.38rem] text-ca-text-3">PASSIVE: none authored</p>
          )}
        </button>

        {/* ── Skills ── */}
        <div className="grid grid-cols-2">
          {skillSectionMap.map(({ section, ability, isUltimate }, index) => (
            <CharacterSkillManualBlock
              key={section}
              ability={ability}
              isUltimate={isUltimate}
              isSelected={selectedSection === section}
              hasError={validationErrors.some((e) => e.toLowerCase().includes(ability.id))}
              position={index}
              onClick={() => onSelectSection(section)}
            />
          ))}
        </div>

        {/* ── Package Readiness ── */}
        <button
          type="button"
          onClick={() => onSelectSection('qa')}
          className={[
            'relative w-full text-left px-5 py-3 transition-colors',
            selectedSection === 'qa'
              ? 'bg-[rgba(5,216,189,0.04)]'
              : 'hover:bg-[rgba(255,255,255,0.012)]',
          ].join(' ')}
        >
          {selectedSection === 'qa' && (
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-ca-teal/50 rounded-r-full" />
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="ca-mono-label text-[0.36rem] text-ca-text-3">PACKAGE READINESS</p>
            <PackageReadinessSummary fighter={fighter} validationErrors={validationErrors} />
          </div>
        </button>

      </div>
    </div>
  )
}

// ─── Skill Manual Block ───────────────────────────────────────────────────────

function CharacterSkillManualBlock({
  ability,
  isUltimate,
  isSelected,
  hasError,
  position,
  onClick,
}: {
  ability: BattleAbilityTemplate
  isUltimate: boolean
  isSelected: boolean
  hasError: boolean
  position: number
  onClick: () => void
}) {
  const cost = getAbilityEnergyCost(ability)
  const costEntries = Object.entries(cost) as Array<[string, number]>
  const iconSrc = normalizeBattleAssetSrc(ability.icon.src)
  const isRight = position % 2 === 1
  const isBottom = position >= 2

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative w-full text-left transition-colors px-4 py-3.5',
        isRight ? 'border-l border-white/6' : '',
        isBottom ? 'border-t border-white/6' : '',
        isSelected
          ? isUltimate
            ? 'bg-[rgba(218,160,55,0.05)]'
            : 'bg-[rgba(5,216,189,0.04)]'
          : 'hover:bg-[rgba(255,255,255,0.012)]',
      ].join(' ')}
    >
      {/* Selected accent bar */}
      {isSelected && (
        <div className={[
          'absolute top-0 bottom-0 w-[2px] rounded-full',
          isRight ? 'left-0' : 'left-0',
          isUltimate ? 'bg-amber-400/55' : 'bg-ca-teal/50',
        ].join(' ')} />
      )}

      {/* Label row */}
      <div className="flex items-start justify-between gap-1 mb-2">
        <div className="min-w-0">
          <p className="ca-mono-label text-[0.35rem] text-ca-text-3">{isUltimate ? 'ULTIMATE' : 'SKILL'}</p>
          <p className="ca-display text-[0.9rem] leading-tight text-ca-text mt-0.5">{ability.name || 'Untitled'}</p>
        </div>
        {hasError ? <span className="shrink-0 text-[0.55rem] text-ca-red mt-0.5">!</span> : null}
      </div>

      {/* Icon + description */}
      <div className="flex gap-2.5">
        <div className={[
          'shrink-0 rounded-[5px] border overflow-hidden',
          isUltimate ? 'border-amber-400/18 bg-[rgba(218,160,55,0.06)]' : 'border-white/8 bg-[rgba(255,255,255,0.03)]',
          'h-[3.2rem] w-[3.2rem]',
        ].join(' ')}>
          {iconSrc
            ? <img src={iconSrc} alt={ability.name} className="h-full w-full object-cover" />
            : <div className="h-full w-full grid place-items-center"><span className="ca-mono-label text-[0.44rem] text-ca-text-3">{ability.icon.label}</span></div>
          }
        </div>
        <p className="text-[0.7rem] leading-[1.5] text-ca-text-2 line-clamp-4 min-w-0">
          {ability.description || 'No description authored.'}
        </p>
      </div>

      {/* Stats row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="ca-mono-label text-[0.34rem] text-ca-text-3">
          CD {ability.cooldown === 0 ? '—' : ability.cooldown}
        </span>
        <div className="flex items-center gap-0.5 flex-wrap">
          {costEntries.length > 0 ? costEntries.map(([type, value]) => {
            const meta = type === 'random' ? randomEnergyMeta : battleEnergyMeta[type as keyof typeof battleEnergyMeta]
            return (
              <span key={type} style={{ color: meta.color }} className="ca-mono-label text-[0.34rem]">
                {meta.short}{value}
              </span>
            )
          }) : <span className="ca-mono-label text-[0.34rem] text-ca-text-3">free</span>}
        </div>
        <div className="flex flex-wrap gap-0.5">
          {ability.classes.map((cls) => (
            <span
              key={cls}
              className={[
                'ca-mono-label text-[0.3rem]',
                cls === 'Ultimate' ? 'text-amber-400/70'
                : cls === 'Unique' ? 'text-ca-teal/70'
                : 'text-ca-text-3',
              ].join(' ')}
            >
              {cls}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

// ─── Package Readiness Summary ────────────────────────────────────────────────

function PackageReadinessSummary({ fighter, validationErrors }: { fighter: BattleFighterTemplate; validationErrors: string[] }) {
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: 'Name', ok: Boolean(fighter.name.trim()) },
    { label: 'Bio', ok: Boolean(fighter.bio?.trim()) },
    { label: 'Portrait', ok: Boolean(fighter.boardPortraitSrc?.trim()) },
    { label: '3 Skills', ok: fighter.abilities.length >= 3 },
    { label: 'Ultimate', ok: Boolean(fighter.ultimate.id) },
    { label: 'Passive', ok: (fighter.passiveEffects ?? []).length > 0 },
    { label: 'Skill Icons', ok: fighter.abilities.concat(fighter.ultimate).every((a) => Boolean(a.icon?.src)) },
    { label: 'No Errors', ok: validationErrors.length === 0 },
  ]
  const passCount = checks.filter((c) => c.ok).length

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`ca-mono-label rounded-[4px] border px-2 py-0.5 text-[0.36rem] ${passCount === checks.length ? 'border-ca-teal/22 text-ca-teal bg-ca-teal-wash' : 'border-amber-400/22 text-amber-300 bg-amber-400/8'}`}>
        {passCount}/{checks.length}
      </span>
      {checks.map((c) => (
        <span
          key={c.label}
          className={[
            'ca-mono-label rounded-[4px] border px-2 py-0.5 text-[0.34rem]',
            c.ok
              ? 'border-white/8 bg-[rgba(255,255,255,0.03)] text-ca-text-3'
              : 'border-amber-400/18 bg-amber-400/6 text-amber-300',
          ].join(' ')}
        >
          {c.ok ? '✓' : '○'} {c.label}
        </span>
      ))}
    </div>
  )
}

// ─── Character Inspector Panel ────────────────────────────────────────────────

function CharacterInspectorPanel({
  fighter,
  selectedSection,
  onSelectSection,
  inspectorAbility,
  selectedPassiveIndex,
  selectedPassive,
  validationErrors,
  fighterJsonDraft,
  setFighterJsonDraft,
  onUpdateFighter,
  onUpdateFighterId,
  onUpdateAbility,
  onUpdateAbilityEffects,
  onAdvancedEffectsJson,
  onUpdatePassive,
  onUpdatePassiveEffects,
  onAdvancedPassiveJson,
  onAdvancedPassiveConditionsJson,
  onAddPassive,
  onRemovePassive,
  onSelectPassiveIndex,
  onAddAbility,
  onDeleteAbility,
  onImportFighter,
  onCopyFighterJson,
}: {
  fighter: BattleFighterTemplate
  selectedSection: SelectedSection
  onSelectSection: (s: SelectedSection) => void
  inspectorAbility: BattleAbilityTemplate | null
  selectedPassiveIndex: number
  selectedPassive: PassiveEffect | null
  validationErrors: string[]
  statusFlash: string | null
  fighterJsonDraft: string
  setFighterJsonDraft: (v: string) => void
  onUpdateFighter: (mutator: (f: BattleFighterTemplate) => void) => void
  onUpdateFighterId: (id: string) => void
  onUpdateAbility: (mutator: (a: BattleAbilityTemplate) => void) => void
  onUpdateAbilityEffects: (effects: SkillEffect[]) => void
  onAdvancedEffectsJson: (value: string) => void
  onUpdatePassive: (mutator: (p: PassiveEffect) => void) => void
  onUpdatePassiveEffects: (mutator: (effects: SkillEffect[]) => SkillEffect[]) => void
  onAdvancedPassiveJson: (value: string) => void
  onAdvancedPassiveConditionsJson: (value: string) => void
  onAddPassive: () => void
  onRemovePassive: () => void
  onSelectPassiveIndex: (i: number) => void
  onAddAbility: () => void
  onDeleteAbility: () => void
  onImportFighter: (mode: 'append' | 'replace') => void
  onCopyFighterJson: () => void
}) {
  const sectionLabel =
    selectedSection === 'identity' ? 'Character Identity' :
    selectedSection === 'passive' ? 'Passive' :
    selectedSection === 'skill-0' ? 'Skill 1' :
    selectedSection === 'skill-1' ? 'Skill 2' :
    selectedSection === 'skill-2' ? 'Skill 3' :
    selectedSection === 'ultimate' ? 'Ultimate' :
    selectedSection === 'assets' ? 'Assets' :
    selectedSection === 'qa' ? 'Package Readiness' :
    'Advanced'

  const navSections: Array<{ id: SelectedSection; label: string }> = [
    { id: 'identity', label: 'Identity' },
    { id: 'passive', label: 'Passive' },
    { id: 'skill-0', label: 'Skill 1' },
    { id: 'skill-1', label: 'Skill 2' },
    { id: 'skill-2', label: 'Skill 3' },
    { id: 'ultimate', label: 'Ultimate' },
    { id: 'assets', label: 'Assets' },
    { id: 'qa', label: 'QA' },
    { id: 'advanced', label: 'Advanced' },
  ]

  return (
    <div className="rounded-[10px] border border-white/10 bg-[rgba(9,10,15,0.95)] overflow-hidden">
      {/* Inspector header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div>
            <p className="ca-mono-label text-[0.36rem] text-ca-text-3">EDITING</p>
            <p className="ca-display text-[0.95rem] text-ca-text">{sectionLabel}</p>
          </div>
          <div className="flex gap-0.5 flex-wrap">
            {navSections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSection(s.id)}
                className={[
                  'ca-mono-label rounded-[4px] px-2 py-1 text-[0.36rem] transition',
                  selectedSection === s.id
                    ? 'bg-[rgba(255,255,255,0.08)] text-ca-text'
                    : 'text-ca-text-3 hover:text-ca-text-2 hover:bg-[rgba(255,255,255,0.04)]',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-h-[32rem] overflow-y-auto p-4 space-y-3">

        {/* Identity */}
        {selectedSection === 'identity' ? (
          <div className="space-y-3">
            <p className="ca-mono-label text-[0.44rem] text-ca-text-3">Identity</p>
            <div className="grid gap-2.5 grid-cols-2">
              <InputField label="Name" value={fighter.name} onChange={(v) => onUpdateFighter((f) => { f.name = v })} />
              <InputField label="Short Name" value={fighter.shortName} onChange={(v) => onUpdateFighter((f) => { f.shortName = v })} />
              <InputField label="Battle Title" value={fighter.battleTitle} onChange={(v) => onUpdateFighter((f) => { f.battleTitle = v })} />
              <InputField label="Affiliation" value={fighter.affiliationLabel} onChange={(v) => onUpdateFighter((f) => { f.affiliationLabel = v })} />
              <NumberField label="Max HP" value={fighter.maxHp} onChange={(v) => onUpdateFighter((f) => { f.maxHp = v })} />
              <SelectField label="Rarity" value={fighter.rarity} options={[{ value: 'R', label: 'R' }, { value: 'SR', label: 'SR' }, { value: 'SSR', label: 'SSR' }]} onChange={(v) => onUpdateFighter((f) => { f.rarity = v as BattleFighterTemplate['rarity'] })} />
              <div className="col-span-2">
                <SlugInputField label="Fighter ID" value={fighter.id} onChange={onUpdateFighterId} />
              </div>
            </div>
            <TextAreaField label="Bio" value={fighter.bio} onChange={(v) => onUpdateFighter((f) => { f.bio = v })} rows={4} />
            <AssetField
              label="Portrait Image URL"
              value={fighter.boardPortraitSrc ?? ''}
              onChange={(v) => onUpdateFighter((f) => { f.boardPortraitSrc = v })}
              helper="Battle/client render image URL. This can be a full-body or board render; it is not used for site face thumbnails."
            />
          </div>
        ) : null}

        {/* Assets */}
        {selectedSection === 'assets' ? (
          <div className="space-y-3">
            <p className="ca-mono-label text-[0.44rem] text-ca-text-3">Assets</p>
            <FacePortraitAssetEditor
              fighter={fighter}
              onChange={(value) => onUpdateFighter((f) => { f.facePortrait = value || undefined })}
            />
            <AssetField
              label="Battle / Board Portrait URL"
              value={fighter.boardPortraitSrc ?? ''}
              onChange={(v) => onUpdateFighter((f) => { f.boardPortraitSrc = v })}
              helper="Full-body or board render used by battle/client surfaces. Do not use this as a face portrait fallback."
            />
          </div>
        ) : null}

        {/* Passive */}
        {selectedSection === 'passive' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="ca-mono-label text-[0.44rem] text-ca-text-3">Passive ({(fighter.passiveEffects ?? []).length})</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={onAddPassive} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2 py-1 text-[0.38rem] text-ca-teal">Add</button>
                <button type="button" onClick={onRemovePassive} disabled={!selectedPassive} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2 py-1 text-[0.38rem] text-ca-red disabled:opacity-50">Remove</button>
              </div>
            </div>
            {(fighter.passiveEffects ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {(fighter.passiveEffects ?? []).map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelectPassiveIndex(i)}
                    className={[
                      'ca-mono-label rounded-[5px] border px-2 py-1 text-[0.38rem] transition',
                      selectedPassiveIndex === i
                        ? 'border-ca-teal/28 bg-ca-teal-wash text-ca-teal'
                        : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2',
                    ].join(' ')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
            {selectedPassive ? (
              <div className="space-y-2.5">
                <div className="grid gap-2.5 grid-cols-2">
                  <InputField label="Label" value={selectedPassive.label} onChange={(v) => onUpdatePassive((p) => { p.label = v })} />
                  <SelectField
                    label="Trigger"
                    value={selectedPassive.trigger}
                    options={passiveTriggers.map((v) => ({ value: v, label: passiveTriggerMeta[v].label }))}
                    onChange={(v) => onUpdatePassive((p) => { p.trigger = v as PassiveTrigger })}
                  />
                  {selectedPassive.trigger === 'onTargetBelow' ? (
                    <NumberField
                      label="Threshold (%)"
                      value={Math.round((selectedPassive.threshold ?? 0.4) * 100)}
                      onChange={(v) => onUpdatePassive((p) => { p.threshold = v > 0 ? v / 100 : undefined })}
                    />
                  ) : null}
                  <InputField
                    label="Counter Key"
                    value={selectedPassive.counterKey ?? ''}
                    onChange={(v) => onUpdatePassive((p) => { p.counterKey = v.trim() || undefined })}
                  />
                </div>
                <TextAreaField
                  label="Player-Facing Description"
                  value={selectedPassive.description ?? ''}
                  onChange={(v) => onUpdatePassive((p) => { p.description = v || undefined })}
                  rows={3}
                />
                <div className="rounded-[6px] border border-white/8 bg-[rgba(11,11,18,0.55)] px-3 py-2">
                  <p className="ca-mono-label text-[0.38rem] text-ca-text-3">Engine Summary</p>
                  <p className="mt-1 text-[0.72rem] leading-[1.5] text-ca-text-2">{describePassive(selectedPassive)}</p>
                </div>
                <div className="rounded-[6px] border border-ca-teal/15 bg-ca-teal-wash px-3 py-2">
                  <p className="ca-mono-label text-[0.36rem] text-ca-teal">Trigger: {passiveTriggerMeta[selectedPassive.trigger].hint}</p>
                </div>
                <AssetField
                  label="Passive Icon URL"
                  value={selectedPassive.icon?.src ?? ''}
                  onChange={(v) => onUpdatePassive((p) => {
                    const cur = p.icon ?? { label: (p.label?.slice(0, 2) || 'P').toUpperCase(), tone: 'teal' as const }
                    p.icon = { ...cur, src: v || undefined }
                  })}
                  helper="Square icon. Recommended 256×256."
                />
                <details className="rounded-[6px] border border-white/8">
                  <summary className="ca-mono-label cursor-pointer px-3 py-2 text-[0.4rem] text-ca-text-3">Blueprints</summary>
                  <div className="grid gap-1.5 grid-cols-2 px-3 pb-2">
                    {passiveBlueprintOptions.map((opt) => (
                      <button key={opt.id} type="button" onClick={() => onUpdatePassive((p) => { applyPassiveBlueprint(p, opt.id) })} className="rounded-[6px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-2 py-1.5 text-left transition hover:border-ca-teal/22">
                        <p className="ca-mono-label text-[0.36rem] text-ca-text">{opt.label.toUpperCase()}</p>
                        <p className="mt-0.5 text-[0.65rem] leading-[1.4] text-ca-text-3">{opt.hint}</p>
                      </button>
                    ))}
                  </div>
                </details>
                <EffectListEditor
                  title="Reaction Results"
                  helper="Effects that fire when the trigger fires."
                  effects={selectedPassive.effects}
                  onChange={(effects) => onUpdatePassiveEffects(() => effects)}
                  advancedJson={JSON.stringify(selectedPassive.effects, null, 2)}
                  onAdvancedJsonChange={onAdvancedPassiveJson}
                />
                <ConditionListEditor
                  conditions={selectedPassive.conditions ?? []}
                  onChange={(conditions) => onUpdatePassive((p) => { p.conditions = conditions.length > 0 ? conditions : undefined })}
                />
                <details className="rounded-[6px] border border-white/8">
                  <summary className="ca-mono-label cursor-pointer px-3 py-2 text-[0.4rem] text-ca-text-3">Conditions JSON</summary>
                  <div className="px-3 pb-2">
                    <TextAreaField label="Conditions" value={JSON.stringify(selectedPassive.conditions ?? [], null, 2)} onChange={onAdvancedPassiveConditionsJson} rows={6} mono />
                  </div>
                </details>
              </div>
            ) : (
              <div className="rounded-[8px] border border-dashed border-white/10 px-3 py-4 text-xs text-ca-text-3">No passives authored yet. Add one above.</div>
            )}
          </div>
        ) : null}

        {/* Skill inspector */}
        {(['skill-0', 'skill-1', 'skill-2', 'ultimate'] as SelectedSection[]).includes(selectedSection) && inspectorAbility ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="ca-mono-label text-[0.44rem] text-ca-text-3">
                {selectedSection === 'ultimate' ? 'Ultimate' : `Skill ${selectedSection.replace('skill-', '')}` }
              </p>
              {selectedSection !== 'ultimate' ? (
                <div className="flex gap-1.5">
                  <button type="button" onClick={onAddAbility} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2 py-1 text-[0.38rem] text-ca-teal">Add Skill</button>
                  <button type="button" onClick={onDeleteAbility} disabled={fighter.abilities.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2 py-1 text-[0.38rem] text-ca-red disabled:opacity-50">Delete</button>
                </div>
              ) : null}
            </div>
            <SkillEditorCard
              key={inspectorAbility.id}
              ability={inspectorAbility}
              isUltimate={selectedSection === 'ultimate'}
              active
              onSelect={() => {}}
              onUpdate={onUpdateAbility}
              onUpdateEffects={onUpdateAbilityEffects}
              onAdvancedEffectsJson={onAdvancedEffectsJson}
            />
          </div>
        ) : null}

        {/* QA */}
        {selectedSection === 'qa' ? (
          <div className="space-y-3">
            <p className="ca-mono-label text-[0.44rem] text-ca-text-3">Package QA</p>
            <QaReadinessPanel fighter={fighter} validationErrors={validationErrors} />
          </div>
        ) : null}

        {/* Advanced */}
        {selectedSection === 'advanced' ? (
          <div className="space-y-2.5">
            <p className="ca-mono-label text-[0.44rem] text-ca-text-3">Advanced — JSON</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={onCopyFighterJson} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2">Copy JSON</button>
              <button type="button" onClick={() => onImportFighter('append')} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">Import New</button>
              <button type="button" onClick={() => onImportFighter('replace')} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2">Replace</button>
            </div>
            <TextAreaField label="Fighter JSON" value={fighterJsonDraft} onChange={setFighterJsonDraft} rows={18} mono />
          </div>
        ) : null}

      </div>
    </div>
  )
}

// ─── QA Readiness Panel ────────────────────────────────────────────────────────

function QaReadinessPanel({ fighter, validationErrors }: { fighter: BattleFighterTemplate; validationErrors: string[] }) {
  const allAbilities = fighter.abilities.concat(fighter.ultimate)

  const checks: Array<{ label: string; ok: boolean; detail?: string }> = [
    { label: 'Name authored', ok: Boolean(fighter.name.trim()) },
    { label: 'Bio authored', ok: Boolean(fighter.bio?.trim()) },
    { label: 'Portrait set', ok: Boolean(fighter.boardPortraitSrc?.trim()) },
    { label: '3 standard skills', ok: fighter.abilities.length >= 3, detail: `${fighter.abilities.length} authored` },
    { label: 'Ultimate present', ok: Boolean(fighter.ultimate.id) },
    { label: 'Passive(s) authored', ok: (fighter.passiveEffects ?? []).length > 0, detail: `${(fighter.passiveEffects ?? []).length} entries` },
    { label: 'All skill icons set', ok: allAbilities.every((a) => Boolean(a.icon?.src)), detail: `${allAbilities.filter((a) => Boolean(a.icon?.src)).length}/${allAbilities.length}` },
    { label: 'All descriptions set', ok: allAbilities.every((a) => Boolean(a.description?.trim())) },
    { label: 'No validation errors', ok: validationErrors.length === 0, detail: validationErrors.length > 0 ? `${validationErrors.length} error(s)` : undefined },
  ]

  return (
    <div className="space-y-2">
      {checks.map((c) => (
        <div key={c.label} className={[
          'flex items-center justify-between gap-2 rounded-[6px] border px-3 py-2',
          c.ok ? 'border-white/6 bg-[rgba(255,255,255,0.02)]' : 'border-amber-400/15 bg-amber-400/5',
        ].join(' ')}>
          <div className="flex items-center gap-2">
            <span className={c.ok ? 'text-ca-teal text-xs' : 'text-amber-300 text-xs'}>{c.ok ? '✓' : '○'}</span>
            <p className="text-[0.72rem] text-ca-text-2">{c.label}</p>
          </div>
          {c.detail ? <p className="ca-mono-label text-[0.36rem] text-ca-text-3">{c.detail}</p> : null}
        </div>
      ))}
      {validationErrors.length > 0 ? (
        <div className="rounded-[6px] border border-ca-red/18 bg-ca-red-wash p-2.5 mt-2">
          <p className="ca-mono-label text-[0.4rem] text-ca-red mb-1.5">Validation Errors</p>
          <ul className="space-y-1">
            {validationErrors.map((e, i) => (
              <li key={i} className="ca-mono-label text-[0.38rem] text-ca-red">› {e}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

// ─── Form Field Components ─────────────────────────────────────────────────────

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

function FacePortraitAssetEditor({
  fighter,
  onChange,
}: {
  fighter: BattleFighterTemplate
  onChange: (value: string) => void
}) {
  const value = fighter.facePortrait ?? ''
  const validation = validateImageUrl(value, { allowEmpty: true, allowLocalPaths: true })
  const warning = value.trim()
    ? validation.ok
      ? 'Face portrait URL will be saved with this character.'
      : validation.error
    : 'No face portrait set. Site thumbnails will use the intentional initials placeholder.'

  return (
    <section className="rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.62)] p-3">
      <div className="grid gap-3 md:grid-cols-[5rem_minmax(0,1fr)]">
        <CharacterFacePortrait
          characterId={fighter.id}
          name={fighter.name}
          src={value || undefined}
          rarity={fighter.rarity}
          size="lg"
        />
        <div className="min-w-0">
          <p className="ca-display text-[1.1rem] leading-none text-ca-text">Face Portrait</p>
          <p className="mt-1 text-xs leading-5 text-ca-text-3">
            Square/headshot image used for site thumbnails, manual pages, and roster archive. Do not use full-body renders here.
          </p>
          <div className="mt-3">
            <AssetField
              label="Face Portrait URL"
              value={value}
              onChange={onChange}
              helper="Paste a direct square/headshot image URL. Empty is allowed and will show the placeholder fallback."
            />
          </div>
          <p className={['mt-2 text-xs leading-5', validation.ok ? 'text-ca-text-3' : 'text-amber-300'].join(' ')}>
            {warning}
          </p>
        </div>
      </div>
    </section>
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

function AssetField({
  label,
  value,
  onChange,
  helper,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  helper: string
}) {
  return (
    <div>
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <input
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://i.imgur.com/example.png"
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition placeholder:text-ca-text-3 focus:border-ca-teal/35"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange('')} className="ca-mono-label rounded-md border border-white/10 px-2.5 py-1.5 text-[0.42rem] text-ca-text-2">
          Clear
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-ca-text-3">{helper}</p>
    </div>
  )
}

function PortraitPreview({ fighter, compact = false }: { fighter: BattleFighterTemplate; compact?: boolean }) {
  return (
    <CharacterFacePortrait
      characterId={fighter.id}
      name={fighter.name}
      src={fighter.facePortrait}
      rarity={fighter.rarity}
      size={compact ? 'lg' : 'lg'}
      className={compact ? 'h-[5rem] w-[5rem]' : 'h-[8rem] w-[8rem]'}
    />
  )
}

function AbilityTilePreview({ ability, large = false }: { ability: BattleAbilityTemplate; large?: boolean }) {
  const sizeClass = large ? 'h-[7.5rem] w-[7.5rem]' : 'h-[6rem] w-[6rem]'
  const iconSrc = normalizeBattleAssetSrc(ability.icon.src)

  return (
    <div className={['relative overflow-hidden rounded-[10px] border border-white/12 bg-[rgba(12,12,18,0.85)]', sizeClass].join(' ')}>
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

function SkillEditorCard({
  ability,
  isUltimate,
  active,
  onSelect,
  onUpdate,
  onUpdateEffects,
  onAdvancedEffectsJson,
}: {
  ability: BattleAbilityTemplate
  isUltimate: boolean
  active: boolean
  onSelect: () => void
  onUpdate: (mutator: (ability: BattleAbilityTemplate) => void) => void
  onUpdateEffects: (effects: SkillEffect[]) => void
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
          label="Skill Icon"
          value={ability.icon.src ?? ''}
          onChange={(value) => onUpdate((current) => { current.icon.src = value || undefined })}
          helper="Paste a direct image URL, such as an i.imgur.com PNG/JPG/GIF/WebP link. Square icon. Recommended 256x256."
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

