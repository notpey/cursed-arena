import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import {
  authoredBattleContent,
  battleRoster,
  defaultBattleSetup,
} from '@/features/battle/data'
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
const passiveTriggers: PassiveTrigger[] = ['whileAlive', 'onRoundStart', 'onRoundEnd', 'onAbilityUse', 'onAbilityResolve', 'onDealDamage', 'onTakeDamage', 'onShieldBroken', 'onDefeat', 'onDefeatEnemy', 'onTargetBelow']
const effectTypes: SkillEffect['type'][] = ['damage', 'heal', 'invulnerable', 'attackUp', 'stun', 'mark', 'burn', 'cooldownReduction', 'damageBoost', 'shield', 'modifyAbilityCost', 'effectImmunity', 'setFlag', 'adjustCounter', 'addModifier', 'removeModifier', 'modifyAbilityState', 'schedule', 'replaceAbility']
const conditionTypes: BattleReactionCondition['type'][] = ['selfHpBelow', 'targetHpBelow', 'actorHasStatus', 'targetHasStatus', 'abilityId', 'abilityClass', 'fighterFlag', 'counterAtLeast', 'usedAbilityLastTurn', 'shieldActive', 'brokenShieldTag', 'isUltimate']
const effectTargets: SkillEffect['target'][] = ['inherit', 'self', 'all-allies', 'all-enemies']
const modifierStats: BattleModifierStat[] = ['damageDealt', 'damageTaken', 'healDone', 'healTaken', 'cooldownTick', 'dotDamage', 'canAct', 'isInvulnerable']
const modifierModes: BattleModifierMode[] = ['flat', 'percentAdd', 'multiplier', 'set']
const modifierScopes: BattleModifierScope[] = ['fighter', 'team', 'battlefield']
const modifierStatusKinds: Array<BattleStatusKind | ''> = ['', 'stun', 'invincible', 'mark', 'burn', 'attackUp']
const modifierStackingOptions = ['max', 'replace', 'stack'] as const
const costModifierModes = ['set', 'reduceTyped', 'reduceRandom'] as const

const effectTypeMeta: Record<SkillEffect['type'], { label: string; hint: string }> = {
  damage: { label: 'Direct Damage', hint: 'Immediate HP loss.' },
  heal: { label: 'Heal', hint: 'Restore HP to allies or self.' },
  invulnerable: { label: 'Invulnerable', hint: 'Ignore incoming damage for a duration.' },
  attackUp: { label: 'Attack Up', hint: 'Flat outgoing damage increase.' },
  stun: { label: 'Stun', hint: 'Force the target to lose actions.' },
  mark: { label: 'Mark', hint: 'Increase follow-up damage taken.' },
  burn: { label: 'Burn', hint: 'Damage over time each round.' },
  cooldownReduction: { label: 'Cooldown Reduction', hint: 'Accelerate ability cycling.' },
  damageBoost: { label: 'Damage Boost', hint: 'Percent-based damage multiplier.' },
  shield: { label: 'Shield', hint: 'Add destructible defense before HP is touched.' },
  modifyAbilityCost: { label: 'Cost Modifier', hint: 'Temporarily rewrite or reduce a technique cost.' },
  effectImmunity: { label: 'Effect Immunity', hint: 'Ignore selected non-damage effect types for a duration.' },
  setFlag: { label: 'Set Flag', hint: 'Flip a named fighter state flag on or off.' },
  adjustCounter: { label: 'Adjust Counter', hint: 'Increment or decrement a named fighter state counter.' },
  addModifier: { label: 'Add Modifier', hint: 'Apply a generic runtime modifier bundle.' },
  removeModifier: { label: 'Remove Modifier', hint: 'Strip modifiers by filter instead of hardcoding dispels.' },
  modifyAbilityState: { label: 'Ability State', hint: 'Grant, lock, or replace abilities using the generalized runtime model.' },
  schedule: { label: 'Delayed Effect', hint: 'Queue nested effects for a future round start or end.' },
  replaceAbility: { label: 'Replace Ability', hint: 'Legacy sugar for a temporary slot replacement.' },
  damageScaledByCounter: { label: 'Counter-Scaled Damage', hint: 'Deal damage multiplied by a named counter value, optionally consuming stacks.' },
  classStun: { label: 'Class Stun', hint: 'Seal abilities of specific skill classes for a duration.' },
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
  onShieldBroken: { label: 'On Shield Broken', hint: 'Fires when this fighter loses a destructible shield.' },
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
      return { type: 'damage', power: 20, target: 'inherit' }
    case 'heal':
      return { type: 'heal', power: 18, target: 'inherit' }
    case 'invulnerable':
      return { type: 'invulnerable', duration: 1, target: 'inherit' }
    case 'attackUp':
      return { type: 'attackUp', amount: 10, duration: 1, target: 'inherit' }
    case 'stun':
      return { type: 'stun', duration: 1, target: 'inherit' }
    case 'mark':
      return { type: 'mark', bonus: 15, duration: 1, target: 'inherit' }
    case 'burn':
      return { type: 'burn', damage: 8, duration: 2, target: 'inherit' }
    case 'cooldownReduction':
      return { type: 'cooldownReduction', amount: 1, target: 'inherit' }
    case 'damageBoost':
      return { type: 'damageBoost', amount: 0.2, target: 'inherit' }
    case 'shield':
      return { type: 'shield', amount: 20, label: 'Barrier', tags: [], target: 'inherit' }
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
    case 'setFlag':
      return { type: 'setFlag', key: 'state-flag', value: true, target: 'self' }
    case 'adjustCounter':
      return { type: 'adjustCounter', key: 'state-counter', amount: 1, target: 'self' }
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
    case 'replaceAbility':
      return {
        type: 'replaceAbility',
        duration: 2,
        slotAbilityId: 'replace-this-skill',
        target: 'self',
        ability: createTemporaryAbility(),
      }
    case 'damageScaledByCounter':
      return { type: 'damageScaledByCounter', counterKey: 'stack-counter', powerPerStack: 10, consumeStacks: true, target: 'inherit' }
    case 'classStun':
      return { type: 'classStun', duration: 1, blockedClasses: ['Physical', 'Melee'], target: 'inherit' }
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
    case 'abilityId':
      return { type: 'abilityId', abilityId: 'ability-id' }
    case 'abilityClass':
      return { type: 'abilityClass', class: 'Unique' }
    case 'fighterFlag':
      return { type: 'fighterFlag', key: 'state-flag', value: true }
    case 'counterAtLeast':
      return { type: 'counterAtLeast', key: 'state-counter', value: 1 }
    case 'targetCounterAtLeast':
      return { type: 'targetCounterAtLeast', key: 'state-counter', value: 1 }
    case 'usedAbilityLastTurn':
      return { type: 'usedAbilityLastTurn', abilityId: 'ability-id' }
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
    case 'abilityId':
      return `ability is ${condition.abilityId}`
    case 'abilityClass':
      return `ability has ${condition.class}`
    case 'fighterFlag':
      return `${condition.key} is ${condition.value ? 'true' : 'false'}`
    case 'counterAtLeast':
      return `${condition.key} >= ${condition.value}`
    case 'targetCounterAtLeast':
      return `target ${condition.key} >= ${condition.value}`
    case 'usedAbilityLastTurn':
      return `last ability was ${condition.abilityId}`
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
      return `Deals ${effect.power} damage to ${formatEffectTarget(effect.target)}.`
    case 'heal':
      return `Restores ${effect.power} HP to ${formatEffectTarget(effect.target)}.`
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
    case 'damageBoost':
      return `Boosts outgoing damage for ${formatEffectTarget(effect.target)} by ${Math.round(effect.amount * 100)}%.`
    case 'shield':
      return `Adds ${effect.amount} shield to ${formatEffectTarget(effect.target)}.`
    case 'modifyAbilityCost':
      return `${effect.modifier.label} changes costs for ${formatEffectTarget(effect.target)} using ${effect.modifier.mode}.`
    case 'effectImmunity':
      return `${formatEffectTarget(effect.target)} ignores ${effect.blocks.join(', ')} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'setFlag':
      return `Set ${effect.key} to ${effect.value ? 'true' : 'false'} on ${formatEffectTarget(effect.target)}.`
    case 'adjustCounter':
      return `Adjust ${effect.key} by ${effect.amount} on ${formatEffectTarget(effect.target)}.`
    case 'addModifier':
      return `Apply ${effect.modifier.label} to ${formatEffectTarget(effect.target)} using ${effect.modifier.stat} ${effect.modifier.mode}.`
    case 'removeModifier':
      return `Remove modifiers from ${formatEffectTarget(effect.target)} matching ${effect.filter.statusKind ?? effect.filter.stat ?? effect.filter.label ?? 'the authored filter'}.`
    case 'modifyAbilityState':
      return effect.delta.mode === 'replace'
        ? `Replace ${effect.delta.slotAbilityId} on ${formatEffectTarget(effect.target)} with ${effect.delta.replacement.name} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
        : effect.delta.mode === 'grant'
          ? `Grant ${effect.delta.grantedAbility.name} to ${formatEffectTarget(effect.target)} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
          : `Lock ${effect.delta.slotAbilityId} on ${formatEffectTarget(effect.target)} for ${effect.delta.duration} round${effect.delta.duration === 1 ? '' : 's'}.`
    case 'schedule':
      return `After ${effect.delay} round ${effect.phase === 'roundStart' ? 'start' : 'end'} trigger${effect.delay === 1 ? '' : 's'}, resolve ${effect.effects.length} nested effect row${effect.effects.length === 1 ? '' : 's'}.`
    case 'replaceAbility':
      return `Replace ${effect.slotAbilityId} on ${formatEffectTarget(effect.target)} with ${effect.ability.name} for ${effect.duration} round${effect.duration === 1 ? '' : 's'}.`
    case 'damageScaledByCounter':
      return `Deals ${effect.powerPerStack} damage per stack of ${effect.counterKey} to ${formatEffectTarget(effect.target)}${effect.consumeStacks ? ', consuming all stacks.' : '.'}`
    case 'classStun':
      return `Seals ${effect.blockedClasses.join('/')} techniques on ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
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
  const [showReference, setShowReference] = useState(false)
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
  const abilityCount = useMemo(
    () => draft.roster.reduce((total, fighter) => total + fighter.abilities.length + 1, 0),
    [draft.roster],
  )
  const passiveCount = useMemo(
    () => draft.roster.reduce((total, fighter) => total + (fighter.passiveEffects?.length ?? 0), 0),
    [draft.roster],
  )
  const effectTypeCounts = useMemo(
    () =>
      countEffectTypes(
        draft.roster.flatMap((fighter) => fighter.abilities.concat(fighter.ultimate).flatMap((ability) => ability.effects ?? [])),
      ),
    [draft.roster],
  )
  const passiveTriggerCounts = useMemo(
    () => countPassiveTriggers(draft.roster.flatMap((fighter) => fighter.passiveEffects ?? [])),
    [draft.roster],
  )
  const liveMatchesDraft = JSON.stringify(liveContent) === JSON.stringify(draft)

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
        // Upload to Supabase Storage → store CDN URL instead of base64
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${storageKey}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('game-assets')
          .upload(path, file, { upsert: true, contentType: file.type })

        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage.from('game-assets').getPublicUrl(path)
        // Append a cache-bust so re-uploads immediately reflect in the ACP preview
        apply(`${urlData.publicUrl}?t=${Date.now()}`)
      } else {
        // Supabase not configured — fall back to base64 data URL
        const dataUrl = await readFileAsDataUrl(file)
        apply(dataUrl)
      }

      setStatusFlash(successMessage)
    } catch {
      setStatusFlash('UPLOAD FAILED')
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

    writeAdminSelection({
      fighterId: selectedFighterId,
      abilityId: selectedAbilityId,
      passiveIndex: selectedPassiveIndex,
    })

    setIsPublishing(true)
    try {
      const result = await publishBattleContent(draft)
      setStatusFlash(result.mode === 'remote' ? 'PUBLISHED LIVE' : 'PUBLISHED LOCAL ONLY')
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
    await resetPublishedBattleContent(liveContent)
    window.location.reload()
  }

  return (
    <section className="py-4 sm:py-6">
      <div className="space-y-4">
        <header className="rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Internal Tools</p>
              <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">Admin Control Panel</h1>
              <p className="mt-2 max-w-3xl text-sm text-ca-text-3">
                Local draft editor for battle content. Drafts save to local storage, and publish applies them as the live
                battle content source on reload.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/settings"
                className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] px-4 py-2.5 text-[1rem] text-ca-text"
              >
                Back To Settings
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Fighters" value={`${draft.roster.length}`} tone="teal" />
          <MetricCard label="Abilities" value={`${abilityCount}`} tone="frost" />
          <MetricCard label="Passives" value={`${passiveCount}`} tone="gold" />
          <MetricCard label="Validation Issues" value={`${validationReport.errors.length}`} tone={validationReport.errors.length > 0 ? 'red' : 'teal'} />
        </section>

        <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Draft State</p>
              <p className="ca-display mt-2 text-3xl text-ca-text">Local Publish Flow</p>
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
                onClick={handleResetDraft}
                className="ca-display rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-2.5 text-[1rem] text-ca-text-2"
              >
                Reset Draft
              </button>
              <button
                type="button"
                onClick={handleRestoreAuthored}
                className="ca-display rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-2.5 text-[1rem] text-ca-text-2"
              >
                Restore Authored
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing}
                className="ca-display rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] px-4 py-2.5 text-[1rem] text-white"
              >
                {isPublishing ? 'Publishing...' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={handleRevertPublished}
                className="ca-display rounded-lg border border-ca-teal/22 bg-ca-teal-wash px-4 py-2.5 text-[1rem] text-ca-teal"
              >
                Revert Live
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill label={liveMatchesDraft ? 'MATCHES LIVE' : 'DRAFT CHANGED'} tone={liveMatchesDraft ? 'teal' : 'gold'} />
            <StatusPill label={validationReport.errors.length > 0 ? 'VALIDATION BLOCKED' : 'READY TO PUBLISH'} tone={validationReport.errors.length > 0 ? 'red' : 'teal'} />
            {statusFlash ? <StatusPill label={statusFlash} tone="frost" /> : null}
          </div>
        </section>

        {validationReport.errors.length > 0 ? (
          <section className="rounded-[10px] border border-ca-red/25 bg-ca-red-wash px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="ca-mono-label text-[0.5rem] text-ca-red">VALIDATION · {validationReport.errors.length} ISSUE{validationReport.errors.length === 1 ? '' : 'S'}</p>
              <span className="ca-mono-label text-[0.42rem] text-ca-text-3">FIX BEFORE PUBLISH</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-ca-text-2">
              {validationReport.errors.slice(0, 5).map((error) => (
                <li key={error}>· {error}</li>
              ))}
              {validationReport.errors.length > 5 ? (
                <li className="text-ca-text-3">· …and {validationReport.errors.length - 5} more</li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5 xl:sticky xl:top-4 self-start">
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Fighters</p>
            <p className="ca-display mt-2 text-3xl text-ca-text">Registry</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleAddFighter} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">
                ADD
              </button>
              <button type="button" onClick={handleDuplicateFighter} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">
                DUPE
              </button>
              <button type="button" onClick={handleDeleteFighter} disabled={!selectedFighter || draft.roster.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1.5 text-[0.42rem] text-ca-red disabled:opacity-50">
                DELETE
              </button>
            </div>
            <div className="mt-4 space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {draft.roster.map((fighter) => (
                <button
                  key={fighter.id}
                  type="button"
                  onClick={() => {
                    setSelectedFighterId(fighter.id)
                    setFighterJsonDraft(JSON.stringify(fighter, null, 2))
                  }}
                  className={[
                    'w-full rounded-[10px] border px-3 py-2 text-left transition',
                    selectedFighterId === fighter.id
                      ? 'border-ca-teal/28 bg-ca-teal-wash'
                      : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/15',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="ca-display truncate text-[1rem] text-ca-text">{fighter.shortName}</p>
                      <p className="mt-0.5 text-xs text-ca-text-3">{fighter.role} · {fighter.rarity}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            {selectedFighter ? (
              <>
                <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
                  <div className="grid gap-4 md:grid-cols-[8rem_minmax(0,1fr)]">
                    <div className="rounded-[12px] border border-white/10 bg-[rgba(8,9,14,0.8)] p-2">
                      <PortraitPreview fighter={selectedFighter} />
                    </div>
                    <div className="min-w-0 space-y-3">
                      <div>
                        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Editing</p>
                        <p className="ca-display mt-1 text-3xl text-ca-text">{selectedFighter.name || selectedFighter.shortName}</p>
                        <p className="mt-1 ca-mono-label text-[0.42rem] text-ca-text-3">{selectedFighter.rarity} · {selectedFighter.role.toUpperCase()} · HP {selectedFighter.maxHp}</p>
                      </div>
                      <AssetField
                        fieldId={`fighter-portrait-${selectedFighter.id}`}
                        label="Portrait Image"
                        value={selectedFighter.boardPortraitSrc ?? ''}
                        onChange={(value) => updateSelectedFighter((fighter) => { fighter.boardPortraitSrc = value })}
                        onImport={(file) => handleImageImport((value) => updateSelectedFighter((fighter) => { fighter.boardPortraitSrc = value }), file, "PORTRAIT UPDATED", `portraits/${selectedFighter.id}`)}
                        helper="Square crop. Recommended 512x512."
                      />
                    </div>
                  </div>
                </section>

                <CollapsibleSection title="Identity" subtitle="Name, role, HP, bio" defaultOpen>
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
                </CollapsibleSection>

                <CollapsibleSection
                  title="Skills"
                  subtitle={`${selectedFighter.abilities.length + 1} abilities · click a skill to expand`}
                  defaultOpen
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleAddAbility} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1 text-[0.42rem] text-ca-teal">ADD SKILL</button>
                      <button type="button" onClick={handleDuplicateAbility} disabled={!selectedAbility || selectedFighter.ultimate.id === selectedAbility.id} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[0.42rem] text-ca-text-2 disabled:opacity-50">DUPE</button>
                      <button type="button" onClick={handleDeleteAbility} disabled={!selectedAbility || selectedFighter.ultimate.id === selectedAbility.id || selectedFighter.abilities.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1 text-[0.42rem] text-ca-red disabled:opacity-50">DELETE</button>
                    </div>
                  }
                >
                  <div className="space-y-2">
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
                              <p className="ca-mono-label mt-1 text-[0.36rem] text-ca-text-3">{ability.classes.join(' · ') || 'NO CLASSES'}</p>
                            </div>
                            <span className="text-[0.7rem] text-ca-text-3">{expanded ? '▾' : '▸'}</span>
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
                                onImportIcon={(file) => handleImageImport((value) => updateAbilityById(ability.id, (current) => { current.icon.src = value }), file, "ABILITY ICON UPDATED", `ability-icons/${ability.id}`)}
                                onAdvancedEffectsJson={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateAbilityById(ability.id, (current) => { current.effects = parsed }), "ABILITY EFFECTS UPDATED")}
                              />
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </CollapsibleSection>

                <CollapsibleSection
                  title="Passives"
                  subtitle={`${(selectedFighter.passiveEffects ?? []).length} passive${(selectedFighter.passiveEffects ?? []).length === 1 ? '' : 's'}`}
                  defaultOpen={(selectedFighter.passiveEffects ?? []).length > 0}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleAddPassive} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1 text-[0.42rem] text-ca-teal">ADD PASSIVE</button>
                      <button type="button" onClick={handleRemovePassive} disabled={!selectedPassive} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1 text-[0.42rem] text-ca-red disabled:opacity-50">REMOVE</button>
                    </div>
                  }
                >
                  {(selectedFighter.passiveEffects ?? []).length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-white/10 px-3 py-4 text-sm text-ca-text-3">
                      No passives authored. Click ADD PASSIVE to start, or pick a blueprint below once one exists.
                    </div>
                  ) : null}
                  <div className="space-y-2">
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
                            <span className="text-[0.7rem] text-ca-text-3">{expanded ? '▾' : '▸'}</span>
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
                                {selectedPassive.trigger === "onTargetBelow" ? (
                                  <NumberField
                                    label="Threshold (%)"
                                    value={Math.round((selectedPassive.threshold ?? 0.4) * 100)}
                                    onChange={(value) => updateSelectedPassive((p) => { p.threshold = value > 0 ? value / 100 : undefined })}
                                  />
                                ) : null}
                              </div>
                              <div className="rounded-[8px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-2">
                                <p className="ca-mono-label text-[0.38rem] text-ca-teal">TRIGGER NOTES</p>
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
                                <p className="ca-mono-label text-[0.4rem] text-ca-text-3">PASSIVE SUMMARY</p>
                                <p className="mt-2 text-sm leading-6 text-ca-text-2">{describePassive(selectedPassive)}</p>
                              </div>
                              <EffectListEditor
                                title="Reaction Results"
                                helper="These rows fire whenever the selected trigger condition is met."
                                effects={selectedPassive.effects}
                                onChange={(effects) => updateSelectedPassiveEffects(() => effects)}
                                advancedJson={JSON.stringify(selectedPassive.effects, null, 2)}
                                onAdvancedJsonChange={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateSelectedPassive((p) => { p.effects = parsed }), "PASSIVE EFFECTS UPDATED")}
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
                </CollapsibleSection>

                <CollapsibleSection title="Live Preview" subtitle="How this fighter reads in-game">
                  <FighterProfilePreview fighter={selectedFighter} />
                </CollapsibleSection>

                <CollapsibleSection title="Advanced" subtitle="JSON import/export">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleCopyFighterJson} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">COPY SELECTED JSON</button>
                      <button type="button" onClick={() => handleImportFighter('append')} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">IMPORT AS NEW</button>
                      <button type="button" onClick={() => handleImportFighter('replace')} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">REPLACE SELECTED</button>
                    </div>
                    <TextAreaField label="Fighter JSON" value={fighterJsonDraft} onChange={setFighterJsonDraft} rows={18} mono />
                  </div>
                </CollapsibleSection>

                <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
                  <button
                    type="button"
                    onClick={() => setShowReference((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Reference</p>
                      <p className="ca-display mt-1 text-2xl text-ca-text">Authoring Guide &amp; Inventory</p>
                    </div>
                    <span className="text-[0.8rem] text-ca-text-3">{showReference ? '▾' : '▸'}</span>
                  </button>
                  {showReference ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="space-y-3 text-sm leading-6 text-ca-text-2">
                        <GuideRow label="Portrait" copy="Recommended 512x512. Preferred master 1024x1024. Square crop with face or upper torso centered." />
                        <GuideRow label="Skill Icon" copy="Recommended 256x256. Preferred master 512x512. Keep the subject centered." />
                        <GuideRow label="Skill Cost" copy="Manual cost overrides automatic cost rules when non-empty." />
                      </div>
                      <div className="space-y-4">
                        <InventoryBlock title="Skill Effects" items={effectTypeCounts} />
                        <InventoryBlock title="Passive Triggers" items={passiveTriggerCounts} />
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: 'teal' | 'red' | 'gold' | 'frost' }) {
  const toneClass =
    tone === 'teal'
      ? 'border-ca-teal/18 bg-ca-teal-wash text-ca-teal'
      : tone === 'red'
        ? 'border-ca-red/18 bg-ca-red-wash text-ca-red'
        : tone === 'gold'
          ? 'border-amber-400/18 bg-amber-400/10 text-amber-300'
          : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text'

  return (
    <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4">
      <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</p>
      <p className="ca-display mt-2 text-4xl text-ca-text">{value}</p>
      <span className={`mt-3 inline-flex rounded-md border px-2 py-1 ca-mono-label text-[0.4rem] ${toneClass}`}>{label.toUpperCase()}</span>
    </div>
  )
}

function CollapsibleSection({
  title,
  subtitle,
  actions,
  defaultOpen = false,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="text-[0.8rem] text-ca-text-3">{open ? '▾' : '▸'}</span>
          <div className="min-w-0">
            <p className="ca-display text-[1.3rem] leading-none text-ca-text">{title}</p>
            {subtitle ? <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-text-3">{subtitle}</p> : null}
          </div>
        </button>
        {actions ? <div onClick={(e) => e.stopPropagation()}>{actions}</div> : null}
      </div>
      {open ? <div className="border-t border-white/6 px-4 py-4 sm:px-5">{children}</div> : null}
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

function InventoryBlock({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  return (
    <div>
      <p className="ca-mono-label text-[0.44rem] text-ca-text-3">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.label}
            className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.4rem] text-ca-text-2"
          >
            {item.label} x{item.count}
          </span>
        ))}
      </div>
    </div>
  )
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

  return (
    <div className={`relative overflow-hidden rounded-[8px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))] ${sizeClass}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(5,216,189,0.08),transparent_70%)]" />
      {fighter.boardPortraitSrc ? (
        <img
          src={fighter.boardPortraitSrc}
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

  return (
    <div className={[
      'relative overflow-hidden rounded-[10px] border border-white/12 bg-[rgba(12,12,18,0.85)]',
      sizeClass,
    ].join(' ')}>
      {ability.icon.src ? <img src={ability.icon.src} alt={ability.name} className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.35))]" />
      <div className="absolute inset-0 grid place-items-center">
        {!ability.icon.src ? <span className="ca-mono-label text-[0.62rem] text-ca-text-2">{ability.icon.label}</span> : null}
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

      {(fighter.passiveEffects ?? []).map((passive, index) => (
        <div key={`${passive.label}-${index}`} className="rounded-[10px] border border-ca-teal/22 bg-ca-teal-wash px-3 py-3">
          <p className="ca-mono-label text-[0.42rem] text-ca-teal">PASSIVE - {passive.label.toUpperCase()}</p>
          <p className="mt-2 text-sm leading-6 text-ca-text-2">{describePassive(passive)}</p>
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
        {condition.type === 'abilityId' ? <InputField label="Ability ID" value={condition.abilityId} onChange={(value) => onChange({ ...condition, abilityId: value })} /> : null}
        {condition.type === 'abilityClass' ? <SelectField label="Ability Class" value={condition.class} options={battleSkillClassOptions.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...condition, class: value as BattleSkillClass })} /> : null}
        {condition.type === 'fighterFlag' ? <InputField label="Flag Key" value={condition.key} onChange={(value) => onChange({ ...condition, key: value })} /> : null}
        {condition.type === 'fighterFlag' ? <SelectField label="Value" value={String(condition.value)} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...condition, value: value === 'true' })} /> : null}
        {condition.type === 'counterAtLeast' ? <InputField label="Counter Key" value={condition.key} onChange={(value) => onChange({ ...condition, key: value })} /> : null}
        {condition.type === 'counterAtLeast' ? <NumberField label="At Least" value={condition.value} onChange={(value) => onChange({ ...condition, value })} /> : null}
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
        {effect.type === 'cooldownReduction' ? <NumberField label="Cooldowns Reduced" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'damageBoost' ? <NumberField label="Boost %" value={Math.round(effect.amount * 100)} onChange={(value) => onChange({ ...effect, amount: value / 100 })} /> : null}
        {effect.type === 'shield' ? <NumberField label="Shield" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'shield' ? <InputField label="Label" value={effect.label ?? ''} onChange={(value) => onChange({ ...effect, label: value || undefined })} /> : null}
        {effect.type === 'shield' ? <InputField label="Tags CSV" value={formatCsvList(effect.tags)} onChange={(value) => onChange({ ...effect, tags: parseCsvList(value) })} /> : null}
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
        {effect.type === 'effectImmunity' ? <InputField label="Label" value={effect.label} onChange={(value) => onChange({ ...effect, label: value })} /> : null}
        {effect.type === 'effectImmunity' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'effectImmunity' ? <InputField label="Blocks CSV" value={formatCsvList(effect.blocks)} onChange={(value) => onChange({ ...effect, blocks: parseCsvList(value) as typeof effect.blocks })} /> : null}
        {effect.type === 'setFlag' ? <InputField label="Key" value={effect.key} onChange={(value) => onChange({ ...effect, key: value })} /> : null}
        {effect.type === 'setFlag' ? <SelectField label="Value" value={String(effect.value)} options={[{ value: 'true', label: 'TRUE' }, { value: 'false', label: 'FALSE' }]} onChange={(value) => onChange({ ...effect, value: value === 'true' })} /> : null}
        {effect.type === 'adjustCounter' ? <InputField label="Key" value={effect.key} onChange={(value) => onChange({ ...effect, key: value })} /> : null}
        {effect.type === 'adjustCounter' ? <NumberField label="Amount" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
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

function GuideRow({ label, copy }: { label: string; copy: string }) {
  return (
    <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</p>
      <p className="mt-1 text-sm leading-6 text-ca-text-2">{copy}</p>
    </div>
  )
}

function countEffectTypes(effects: SkillEffect[]) {
  const counts = new Map<string, number>()
  effects.forEach((effect) => {
    counts.set(effect.type, (counts.get(effect.type) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label: label.toUpperCase(), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function countPassiveTriggers(passives: PassiveEffect[]) {
  const counts = new Map<string, number>()
  passives.forEach((passive) => {
    counts.set(passive.trigger, (counts.get(passive.trigger) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label: label.toUpperCase(), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}













