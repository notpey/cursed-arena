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
  clearPublishedBattleContent,
  createContentSnapshot,
  publishBattleContent,
  readDraftBattleContent,
  saveDraftBattleContent,
  type BattleContentSnapshot,
} from '@/features/battle/contentStore'
import { battleEnergyMeta, battleEnergyOrder, randomEnergyMeta, getAbilityEnergyCost } from '@/features/battle/energy'
import { validateBattleContent } from '@/features/battle/validation'
import type {
  BattleAbilityKind,
  BattleAbilityStateDelta,
  BattleAbilityTag,
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

const abilityKinds: BattleAbilityKind[] = ['attack', 'heal', 'defend', 'buff', 'debuff', 'utility', 'pass']
const targetRules: BattleTargetRule[] = ['none', 'self', 'enemy-single', 'enemy-all', 'ally-single', 'ally-all']
const passiveTriggers: PassiveTrigger[] = ['whileAlive', 'onRoundStart', 'onRoundEnd', 'onAbilityUse', 'onAbilityResolve', 'onDealDamage', 'onTakeDamage', 'onDefeat', 'onTargetBelow']
const tagOptions: BattleAbilityTag[] = ['ATK', 'HEAL', 'BUFF', 'DEBUFF', 'UTILITY', 'ULT']
const effectTypes: SkillEffect['type'][] = ['damage', 'heal', 'invulnerable', 'attackUp', 'stun', 'mark', 'burn', 'cooldownReduction', 'damageBoost', 'addModifier', 'removeModifier', 'modifyAbilityState', 'schedule', 'replaceAbility']
const effectTargets: SkillEffect['target'][] = ['inherit', 'self', 'all-allies', 'all-enemies']
const rarityOptions: BattleFighterTemplate['rarity'][] = ['R', 'SR', 'SSR', 'UR']
const modifierStats: BattleModifierStat[] = ['damageDealt', 'damageTaken', 'healDone', 'healTaken', 'cooldownTick', 'dotDamage', 'canAct', 'isInvulnerable']
const modifierModes: BattleModifierMode[] = ['flat', 'percentAdd', 'multiplier', 'set']
const modifierScopes: BattleModifierScope[] = ['fighter', 'team', 'battlefield']
const modifierStatusKinds: Array<BattleStatusKind | ''> = ['', 'stun', 'invincible', 'mark', 'burn', 'attackUp']
const modifierStackingOptions = ['max', 'replace', 'stack'] as const

type SkillBlueprintId =
  | 'single-strike'
  | 'pressure-burst'
  | 'execution-stun'
  | 'single-heal'
  | 'squad-heal'
  | 'guard-window'
  | 'team-rally'
  | 'mark-target'
  | 'burn-field'
  | 'tempo-shift'
  | 'ultimate-surge'

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
  addModifier: { label: 'Add Modifier', hint: 'Apply a generic runtime modifier bundle.' },
  removeModifier: { label: 'Remove Modifier', hint: 'Strip modifiers by filter instead of hardcoding dispels.' },
  modifyAbilityState: { label: 'Ability State', hint: 'Grant, lock, or replace abilities using the generalized runtime model.' },
  schedule: { label: 'Delayed Effect', hint: 'Queue nested effects for a future round start or end.' },
  replaceAbility: { label: 'Replace Ability', hint: 'Legacy sugar for a temporary slot replacement.' },
}

const skillBlueprintOptions: Array<{ id: SkillBlueprintId; label: string; hint: string }> = [
  { id: 'single-strike', label: 'Single-Target Strike', hint: 'Basic attack pattern for a front-line skill.' },
  { id: 'pressure-burst', label: 'AoE Pressure Burst', hint: 'Spread damage across the enemy team.' },
  { id: 'execution-stun', label: 'Execution / Stun', hint: 'Single-target hit with a control rider.' },
  { id: 'single-heal', label: 'Single-Target Heal', hint: 'Keep one ally standing.' },
  { id: 'squad-heal', label: 'Team Heal', hint: 'Stabilize the whole lineup.' },
  { id: 'guard-window', label: 'Guard Window', hint: 'Short defensive immunity on self or ally.' },
  { id: 'team-rally', label: 'Team Rally', hint: 'Buff the squad for a push turn.' },
  { id: 'mark-target', label: 'Focus Mark', hint: 'Prime a target for follow-up burst.' },
  { id: 'burn-field', label: 'Burn Field', hint: 'AoE pressure with damage over time.' },
  { id: 'tempo-shift', label: 'Tempo Shift', hint: 'Utility tool for cooldown acceleration.' },
  { id: 'ultimate-surge', label: 'Ultimate Surge', hint: 'High-impact finisher scaffold.' },
]
type PassiveBlueprintId = 'round-heal' | 'damage-aura' | 'execute-drive' | 'tempo-engine'

const passiveTriggerMeta: Record<PassiveTrigger, { label: string; hint: string }> = {
  onDealDamage: { label: 'On Deal Damage', hint: 'Fires after this fighter deals damage.' },
  onRoundStart: { label: 'Round Start', hint: 'Fires automatically at the start of each round.' },
  onRoundEnd: { label: 'Round End', hint: 'Fires before cooldowns and statuses tick down.' },
  onAbilityUse: { label: 'On Ability Use', hint: 'Fires immediately before the fighter resolves a technique.' },
  onAbilityResolve: { label: 'On Ability Resolve', hint: 'Fires after the selected technique finishes resolving.' },
  onTakeDamage: { label: 'On Take Damage', hint: 'Fires after this fighter is hit.' },
  onDefeat: { label: 'On Defeat', hint: 'Fires when this fighter is exorcised.' },
  whileAlive: { label: 'While Alive Aura', hint: 'Always active while the fighter remains alive.' },
  onTargetBelow: { label: 'Execute Window', hint: 'Legacy shorthand for target HP threshold reactions.' },
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
const battleProgressStorageKey = 'ca-battle-progress-v1'

type TaskStatus = 'pending' | 'in-progress' | 'done'

interface ProgressTask { id: string; label: string }
interface ProgressPhase { id: string; phase: string; label: string; tasks: ProgressTask[] }

const battleProgressPhases: ProgressPhase[] = [
  {
    id: 'phase-1',
    phase: 'Phase 1',
    label: 'Stabilize Architecture',
    tasks: [
      { id: 'p1-topbar', label: 'Extract BattleTopBar.tsx' },
      { id: 'p1-board', label: 'Extract BattleBoard.tsx' },
      { id: 'p1-portrait', label: 'Extract BattlePortraitSlot.tsx' },
      { id: 'p1-ability-strip', label: 'Extract BattleAbilityStrip.tsx' },
      { id: 'p1-info-panel', label: 'Extract BattleInfoPanel.tsx' },
      { id: 'p1-log-panel', label: 'Extract BattleLogPanel.tsx' },
      { id: 'p1-lane', label: 'Extract BattleLane.tsx' },
      { id: 'p1-row', label: 'Extract BattleRow.tsx' },
      { id: 'p1-ability-slot', label: 'Extract BattleAbilitySlot.tsx' },
      { id: 'p1-status-chips', label: 'Extract BattleStatusChips.tsx' },
      { id: 'p1-build', label: 'Confirm build and lint clean' },
    ],
  },
  {
    id: 'phase-2',
    phase: 'Phase 2',
    label: 'Add Missing Data',
    tasks: [
      { id: 'p2-portrait-src', label: 'Add portraitSrc field to fighter data' },
      { id: 'p2-bio', label: 'Add bio / flavor text field to fighter data' },
      { id: 'p2-icon-src', label: 'Add iconSrc to ability data' },
      { id: 'p2-affiliation', label: 'Add affiliationLabel and battleTitle to fighter data' },
      { id: 'p2-badge-meta', label: 'Add playerBadgeTitle / teamLabel top-bar metadata' },
      { id: 'p2-build', label: 'Confirm build and lint clean' },
    ],
  },
  {
    id: 'phase-3',
    phase: 'Phase 3',
    label: 'Replace Layout Skeleton',
    tasks: [
      { id: 'p3-top-strip', label: 'Implement BattleTopBar strip (72–88px)' },
      { id: 'p3-board-lanes', label: 'Implement BattleLane + BattleRow board layout' },
      { id: 'p3-bottom-band', label: 'Implement bottom utility band (info + log panels)' },
      { id: 'p3-remove-stage', label: 'Remove giant stage windows and footer table' },
    ],
  },
  {
    id: 'phase-4',
    phase: 'Phase 4',
    label: 'Reconnect UX',
    tasks: [
      { id: 'p4-selection', label: 'Reconnect fighter selection to board rows' },
      { id: 'p4-targeting', label: 'Reconnect targeting highlights' },
      { id: 'p4-queue', label: 'Reconnect queued state display on rows' },
      { id: 'p4-info-panel', label: 'Wire BattleInfoPanel to inspected fighter / ability' },
      { id: 'p4-log-panel', label: 'Make BattleLogPanel persistent (remove feed drawer)' },
      { id: 'p4-end-turn', label: 'Remove endTurn confirmation modal' },
    ],
  },
  {
    id: 'phase-5',
    phase: 'Phase 5',
    label: 'Cleanup',
    tasks: [
      { id: 'p5-dead-code', label: 'Remove dead components and layout helpers' },
      { id: 'p5-responsive', label: 'Responsive audit (tablet and mobile fallbacks)' },
      { id: 'p5-typography', label: 'Typography and contrast pass' },
      { id: 'p5-acceptance', label: 'Final acceptance criteria review' },
    ],
  },
]

const battleProgressDefaults: Record<string, TaskStatus> = {
  'p1-topbar': 'done',
  'p1-board': 'done',
  'p1-portrait': 'done',
  'p1-ability-strip': 'done',
  'p1-info-panel': 'done',
  'p1-log-panel': 'done',
}

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

function resolveAbilityTone(kind: BattleAbilityTemplate['kind'], tags: BattleAbilityTemplate['tags']) {
  if (tags.includes('ULT')) return 'gold' as const
  if (kind === 'heal' || tags.includes('HEAL')) return 'teal' as const
  if (kind === 'debuff' || tags.includes('DEBUFF')) return 'red' as const
  if (kind === 'buff' || kind === 'defend' || kind === 'utility' || tags.includes('UTILITY')) return 'teal' as const
  if (kind === 'pass') return 'frost' as const
  return 'red' as const
}

function syncAbilityPresentation(ability: BattleAbilityTemplate) {
  ability.icon = {
    src: ability.icon?.src,
    label: deriveAbilityLabel(ability.name),
    tone: resolveAbilityTone(ability.kind, ability.tags),
  }
}

let embeddedAbilityCounter = 1

function createTemporaryAbility(name = 'Temporary Technique'): BattleAbilityTemplate {
  return createBlankAbility(`temporary-technique-${embeddedAbilityCounter++}`, name, {
    kind: 'attack',
    targetRule: 'enemy-single',
    tags: ['ATK'],
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
  }
}

function applySkillBlueprint(ability: BattleAbilityTemplate, blueprintId: SkillBlueprintId, isUltimate: boolean) {
  const assign = (template: {
    kind: BattleAbilityKind
    targetRule: BattleTargetRule
    tags: BattleAbilityTag[]
    cooldown: number
    description: string
    effects: SkillEffect[]
  }) => {
    ability.kind = template.kind
    ability.targetRule = template.targetRule
    ability.cooldown = template.cooldown
    ability.description = template.description
    ability.tags = isUltimate
      ? Array.from(new Set([...template.tags.filter((tag) => tag !== 'ULT'), 'ULT']))
      : template.tags.filter((tag) => tag !== 'ULT')
    ability.effects = template.effects.map((effect) => JSON.parse(JSON.stringify(effect)) as SkillEffect)
    syncAbilityPresentation(ability)
  }

  switch (blueprintId) {
    case 'single-strike':
      assign({
        kind: 'attack',
        targetRule: 'enemy-single',
        tags: ['ATK'],
        cooldown: 1,
        description: 'Deal direct damage to one enemy.',
        effects: [{ type: 'damage', power: isUltimate ? 48 : 30, target: 'inherit' }],
      })
      return
    case 'pressure-burst':
      assign({
        kind: 'attack',
        targetRule: 'enemy-all',
        tags: ['ATK'],
        cooldown: isUltimate ? 4 : 2,
        description: 'Pressure the entire enemy team with an area attack.',
        effects: [{ type: 'damage', power: isUltimate ? 42 : 18, target: 'all-enemies' }],
      })
      return
    case 'execution-stun':
      assign({
        kind: 'debuff',
        targetRule: 'enemy-single',
        tags: ['ATK', 'DEBUFF'],
        cooldown: 2,
        description: 'Hit one enemy and lock them down for a turn.',
        effects: [
          { type: 'damage', power: isUltimate ? 40 : 24, target: 'inherit' },
          { type: 'stun', duration: 1, target: 'inherit' },
        ],
      })
      return
    case 'single-heal':
      assign({
        kind: 'heal',
        targetRule: 'ally-single',
        tags: ['HEAL'],
        cooldown: 2,
        description: 'Restore HP to one ally.',
        effects: [{ type: 'heal', power: isUltimate ? 40 : 24, target: 'inherit' }],
      })
      return
    case 'squad-heal':
      assign({
        kind: 'heal',
        targetRule: 'ally-all',
        tags: ['HEAL', 'UTILITY'],
        cooldown: isUltimate ? 4 : 3,
        description: 'Restore HP across the whole team.',
        effects: [{ type: 'heal', power: isUltimate ? 22 : 12, target: 'all-allies' }],
      })
      return
    case 'guard-window':
      assign({
        kind: 'defend',
        targetRule: 'self',
        tags: ['UTILITY'],
        cooldown: 3,
        description: 'Create a brief invulnerability window.',
        effects: [{ type: 'invulnerable', duration: isUltimate ? 2 : 1, target: 'self' }],
      })
      return
    case 'team-rally':
      assign({
        kind: 'buff',
        targetRule: 'ally-all',
        tags: ['BUFF', 'UTILITY'],
        cooldown: 3,
        description: 'Empower the whole team for a coordinated push.',
        effects: [{ type: 'attackUp', amount: isUltimate ? 18 : 10, duration: 2, target: 'all-allies' }],
      })
      return
    case 'mark-target':
      assign({
        kind: 'debuff',
        targetRule: 'enemy-single',
        tags: ['DEBUFF', 'UTILITY'],
        cooldown: 2,
        description: 'Expose one enemy so allies hit harder.',
        effects: [{ type: 'mark', bonus: isUltimate ? 24 : 15, duration: 2, target: 'inherit' }],
      })
      return
    case 'burn-field':
      assign({
        kind: 'debuff',
        targetRule: 'enemy-all',
        tags: ['DEBUFF'],
        cooldown: 3,
        description: 'Apply burning pressure across the enemy team.',
        effects: [{ type: 'burn', damage: isUltimate ? 14 : 8, duration: 2, target: 'all-enemies' }],
      })
      return
    case 'tempo-shift':
      assign({
        kind: 'utility',
        targetRule: 'self',
        tags: ['UTILITY', 'BUFF'],
        cooldown: 3,
        description: 'Accelerate your next rotation by reducing cooldowns.',
        effects: [{ type: 'cooldownReduction', amount: isUltimate ? 2 : 1, target: 'self' }],
      })
      return
    case 'ultimate-surge':
      assign({
        kind: 'attack',
        targetRule: 'enemy-all',
        tags: ['ATK'],
        cooldown: 5,
        description: 'Deliver a high-impact finishing sequence.',
        effects: [
          { type: 'damage', power: 54, target: 'all-enemies' },
          { type: 'mark', bonus: 18, duration: 2, target: 'all-enemies' },
        ],
      })
      return
  }
}

function formatEffectTarget(target: SkillEffect['target']) {
  if (target === 'inherit') return 'the skill target'
  if (target === 'self') return 'self'
  if (target === 'all-allies') return 'all allies'
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
    case 'abilityTag':
      return `ability has ${condition.tag}`
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
  if (ability.kind === 'pass') return 'Passive abilities are free.'
  if (ability.energyCost && Object.keys(ability.energyCost).length > 0) return 'This skill is using a manually authored cost override.'
  if (ability.tags.includes('ULT')) return 'Ultimates always cost CT 1 + VOW 1 + MEN 1.'
  if (ability.kind === 'heal') {
    return ability.targetRule === 'ally-all' ? 'Group healing adds CT on top of MEN.' : 'Single-target healing costs MEN 1.'
  }
  if (ability.kind === 'defend') return 'Defend skills cost CT 1.'
  if (ability.kind === 'buff') return 'Buff skills cost VOW 1.'
  if (ability.kind === 'debuff') return 'Debuffs cost VOW 1 + MEN 1.'
  if (ability.kind === 'utility') return 'Utility skills cost CT 1 + MEN 1.'
  if (ability.targetRule === 'enemy-all') return 'AoE attacks cost PHY 1 + CT 1.'
  if (ability.tags.includes('DEBUFF')) return 'Attack skills with DEBUFF tags cost PHY 1 + VOW 1.'
  return 'Standard attacks cost PHY 1.'
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
    tags: ['ATK'],
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
    role: 'Hybrid',
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
      createBlankAbility('fighter-' + index + '-skill-2', 'New Technique', { kind: 'utility', targetRule: 'self', tags: ['UTILITY'], effects: [createEffect('cooldownReduction')] }),
    ],
    ultimate: createBlankAbility('fighter-' + index + '-ultimate', 'New Ultimate', {
      kind: 'attack',
      targetRule: 'enemy-all',
      tags: ['ATK', 'ULT'],
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
  const [creatorView, setCreatorView] = useState<'edit' | 'preview'>('edit')
  const [editorTab, setEditorTab] = useState<'identity' | 'skills' | 'passives' | 'advanced'>('identity')
  const [statusFlash, setStatusFlash] = useState<string | null>(null)
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
    await publishBattleContent(draft)
    window.location.reload()
  }

  function handleRevertPublished() {
    clearPublishedBattleContent()
    clearDraftBattleContent()
    window.location.reload()
  }

  return (
    <section className="py-4 sm:py-6">
      <div className="space-y-4">
        <header className="rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
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

        <BattleProgressTracker />

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
                className="ca-display rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] px-4 py-2.5 text-[1rem] text-white"
              >
                Publish
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

        <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Fighters</p>
            <p className="ca-display mt-2 text-3xl text-ca-text">Registry</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleAddFighter} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">
                ADD FIGHTER
              </button>
              <button type="button" onClick={handleDuplicateFighter} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">
                DUPLICATE
              </button>
              <button type="button" onClick={handleDeleteFighter} disabled={!selectedFighter || draft.roster.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1.5 text-[0.42rem] text-ca-red disabled:opacity-50">
                DELETE
              </button>
            </div>
            <div className="mt-4 space-y-2 max-h-[44vh] overflow-y-auto pr-1">
              {draft.roster.map((fighter) => (
                <button
                  key={fighter.id}
                  type="button"
                  onClick={() => {
                    setSelectedFighterId(fighter.id)
                    setFighterJsonDraft(JSON.stringify(fighter, null, 2))
                  }}
                  className={[
                    'w-full rounded-[10px] border px-3 py-3 text-left transition',
                    selectedFighterId === fighter.id
                      ? 'border-ca-teal/28 bg-ca-teal-wash'
                      : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/15',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="ca-display text-[1.1rem] text-ca-text">{fighter.shortName}</p>
                      <p className="mt-1 text-xs text-ca-text-3">{fighter.role}</p>
                    </div>
                    <span className="ca-mono-label text-[0.38rem] text-ca-text-3">{fighter.id}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            {selectedFighter ? (
              <EditorCard title="Character Creator" subtitle={selectedFighter.shortName.toUpperCase()}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex gap-1 rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] p-1">
                    <button
                      type="button"
                      onClick={() => setCreatorView('edit')}
                      className={[
                        "ca-mono-label rounded px-3 py-1.5 text-[0.42rem] transition",
                        creatorView === "edit" ? "bg-ca-teal-wash text-ca-teal" : "text-ca-text-3 hover:text-ca-text-2",
                      ].join(' ')}
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatorView('preview')}
                      className={[
                        "ca-mono-label rounded px-3 py-1.5 text-[0.42rem] transition",
                        creatorView === "preview" ? "bg-ca-teal-wash text-ca-teal" : "text-ca-text-3 hover:text-ca-text-2",
                      ].join(' ')}
                    >
                      PREVIEW
                    </button>
                  </div>
                  {creatorView === "edit" ? (
                    <div className="inline-flex flex-wrap gap-1 rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] p-1">
                      {[
                        { id: "identity", label: "IDENTITY" },
                        { id: "skills", label: "SKILLS" },
                        { id: "passives", label: "PASSIVES" },
                        { id: "advanced", label: "ADVANCED" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setEditorTab(tab.id as "identity" | "skills" | "passives" | "advanced")}
                          className={[
                            "ca-mono-label rounded px-3 py-1.5 text-[0.42rem] transition",
                            editorTab === tab.id ? "border border-ca-red/25 bg-ca-red/18 text-ca-text" : "text-ca-text-3 hover:text-ca-text-2",
                          ].join(' ')}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4">
                  {creatorView === "preview" ? (
                    <FighterProfilePreview fighter={selectedFighter} />
                  ) : editorTab === "identity" ? (
                    <div className="space-y-5">
                      <div className="overflow-hidden rounded-[14px] border border-white/8 bg-[linear-gradient(135deg,rgba(250,39,66,0.12),rgba(250,39,66,0.02)_28%,rgba(5,216,189,0.08)_72%,rgba(255,255,255,0.03))] px-4 py-4 lg:px-5">
                        <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
                          <div className="space-y-3">
                            <div className="rounded-[12px] border border-white/10 bg-[rgba(8,9,14,0.8)] p-2 shadow-[0_18px_44px_rgba(0,0,0,0.26)]">
                              <PortraitPreview fighter={selectedFighter} />
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
                          <div className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <InputField label="Name" value={selectedFighter.name} onChange={(value) => updateSelectedFighter((fighter) => { fighter.name = value })} />
                              <InputField label="Short Name" value={selectedFighter.shortName} onChange={(value) => updateSelectedFighter((fighter) => { fighter.shortName = value })} />
                              <InputField label="Role" value={selectedFighter.role} onChange={(value) => updateSelectedFighter((fighter) => { fighter.role = value })} />
                              <SelectField label="Rarity" value={selectedFighter.rarity} options={rarityOptions.map((value) => ({ value, label: value }))} onChange={(value) => updateSelectedFighter((fighter) => { fighter.rarity = value as BattleFighterTemplate['rarity'] })} />
                              <InputField label="Affiliation" value={selectedFighter.affiliationLabel} onChange={(value) => updateSelectedFighter((fighter) => { fighter.affiliationLabel = value })} />
                              <NumberField label="Max HP" value={selectedFighter.maxHp} onChange={(value) => updateSelectedFighter((fighter) => { fighter.maxHp = value })} />
                              <InputField label="Battle Title" value={selectedFighter.battleTitle} onChange={(value) => updateSelectedFighter((fighter) => { fighter.battleTitle = value })} />
                              <SlugInputField label="Fighter ID" value={selectedFighter.id} onChange={handleUpdateFighterId} />
                            </div>
                            <TextAreaField label="Bio" value={selectedFighter.bio} onChange={(value) => updateSelectedFighter((fighter) => { fighter.bio = value })} rows={4} />
                            <details className="rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
                              <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Portrait Frame</summary>
                              <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <NumberField label="Scale" value={selectedFighter.boardPortraitFrame?.scale ?? 2.0} step={0.01} onChange={(value) => updateSelectedFighter((fighter) => { fighter.boardPortraitFrame = { ...(fighter.boardPortraitFrame ?? {}), scale: value } })} />
                                <InputField label="Offset X (%)" value={selectedFighter.boardPortraitFrame?.x ?? '0%'} onChange={(value) => updateSelectedFighter((fighter) => { fighter.boardPortraitFrame = { ...(fighter.boardPortraitFrame ?? {}), x: value } })} />
                                <InputField label="Offset Y (%)" value={selectedFighter.boardPortraitFrame?.y ?? '0%'} onChange={(value) => updateSelectedFighter((fighter) => { fighter.boardPortraitFrame = { ...(fighter.boardPortraitFrame ?? {}), y: value } })} />
                              </div>
                              <p className="mt-2 text-xs leading-5 text-ca-text-3">Controls position and zoom of URL-sourced portraits. Scale 2.0–2.6 is typical; Y offset -10% to -20% centers the subject in frame.</p>
                            </details>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : editorTab === "skills" ? (
                    <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
                      <div className="rounded-[12px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={handleAddAbility} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">ADD SKILL</button>
                          <button type="button" onClick={handleDuplicateAbility} disabled={!selectedAbility || selectedFighter.ultimate.id === selectedAbility.id} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">DUPLICATE</button>
                          <button type="button" onClick={handleDeleteAbility} disabled={!selectedAbility || selectedFighter.ultimate.id === selectedAbility.id || selectedFighter.abilities.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1.5 text-[0.42rem] text-ca-red disabled:opacity-50">DELETE</button>
                        </div>
                        <div className="mt-3 space-y-2">
                          {selectedFighter.abilities.concat(selectedFighter.ultimate).map((ability) => {
                            const isUltimate = selectedFighter.ultimate.id === ability.id
                            const active = selectedAbility?.id === ability.id
                            return (
                              <button
                                key={ability.id}
                                type="button"
                                onClick={() => setSelectedAbilityId(ability.id)}
                                className={[
                                  "w-full rounded-[10px] border px-3 py-3 text-left transition",
                                  active ? "border-ca-red/28 bg-[rgba(250,39,66,0.08)]" : "border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/14",
                                ].join(' ')}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="ca-display truncate text-[1rem] text-ca-text">{ability.name}</p>
                                    <p className="ca-mono-label mt-1 text-[0.36rem] text-ca-text-3">{isUltimate ? "ULTIMATE" : "SKILL"} - CD {ability.cooldown}</p>
                                  </div>
                                  <span className="ca-mono-label text-[0.36rem] text-ca-text-3">{ability.tags.join(' / ')}</span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div>
                        {selectedAbility ? (
                          <SkillEditorCard
                            key={selectedAbility.id}
                            ability={selectedAbility}
                            isUltimate={selectedFighter.ultimate.id === selectedAbility.id}
                            active
                            onSelect={() => setSelectedAbilityId(selectedAbility.id)}
                            onUpdate={(mutator) => updateAbilityById(selectedAbility.id, mutator)}
                            onUpdateEffects={(effects) => updateAbilityEffectsById(selectedAbility.id, effects)}
                            onImportIcon={(file) => handleImageImport((value) => updateAbilityById(selectedAbility.id, (current) => { current.icon.src = value }), file, "ABILITY ICON UPDATED", `ability-icons/${selectedAbility.id}`)}
                            onAdvancedEffectsJson={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateAbilityById(selectedAbility.id, (current) => { current.effects = parsed }), "ABILITY EFFECTS UPDATED")}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : editorTab === "passives" ? (
                    <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
                      <div className="space-y-3">
                        <div className="rounded-[12px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={handleAddPassive} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2 py-1 text-[0.42rem] text-ca-teal">ADD PASSIVE</button>
                            <button type="button" onClick={handleRemovePassive} disabled={!selectedPassive} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2 py-1 text-[0.42rem] text-ca-red disabled:opacity-50">REMOVE</button>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {passiveBlueprintOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updateSelectedPassive((passive) => { applyPassiveBlueprint(passive, option.id) })}
                                disabled={!selectedPassive}
                                className="rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-left transition hover:border-ca-teal/22 disabled:opacity-50"
                              >
                                <p className="ca-mono-label text-[0.38rem] text-ca-text">{option.label.toUpperCase()}</p>
                                <p className="mt-1 text-xs leading-5 text-ca-text-3">{option.hint}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[12px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
                          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">PASSIVE LIST</p>
                          <div className="mt-3 space-y-2">
                            {(selectedFighter.passiveEffects ?? []).length > 0 ? (
                              (selectedFighter.passiveEffects ?? []).map((passive, index) => (
                                <button
                                  key={passive.label + index}
                                  type="button"
                                  onClick={() => setSelectedPassiveIndex(index)}
                                  className={[
                                    "w-full rounded-[10px] border px-3 py-3 text-left transition",
                                    selectedPassiveIndexResolved === index ? "border-ca-teal/28 bg-ca-teal-wash" : "border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/14",
                                  ].join(" ")}
                                >
                                  <p className="ca-display text-[0.95rem] text-ca-text">{passive.label}</p>
                                  <p className="ca-mono-label mt-1 text-[0.36rem] text-ca-text-3">{formatPassiveTrigger(passive.trigger).toUpperCase()}</p>
                                </button>
                              ))
                            ) : (
                              <p className="text-sm text-ca-text-3">This fighter has no passive effects authored.</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        {selectedPassive ? (
                          <div className="space-y-3">
                            <div className="rounded-[12px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <InputField label="Label" value={selectedPassive.label} onChange={(value) => updateSelectedPassive((passive) => { passive.label = value })} />
                                <SelectField
                                  label="Trigger"
                                  value={selectedPassive.trigger}
                                  options={passiveTriggers.map((value) => ({ value, label: passiveTriggerMeta[value].label }))}
                                  onChange={(value) => updateSelectedPassive((passive) => { passive.trigger = value as PassiveTrigger })}
                                />
                                {selectedPassive.trigger === "onTargetBelow" ? (
                                  <NumberField
                                    label="Threshold (%)"
                                    value={Math.round((selectedPassive.threshold ?? 0.4) * 100)}
                                    onChange={(value) => updateSelectedPassive((passive) => { passive.threshold = value > 0 ? value / 100 : undefined })}
                                  />
                                ) : null}
                              </div>
                              <div className="mt-3 rounded-[8px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-2.5">
                                <p className="ca-mono-label text-[0.38rem] text-ca-teal">TRIGGER NOTES</p>
                                <p className="mt-1 text-sm leading-6 text-ca-text-2">{passiveTriggerMeta[selectedPassive.trigger].hint}</p>
                              </div>
                              <details className="mt-3 rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
                                <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Conditions JSON</summary>
                                <div className="mt-3">
                                  <TextAreaField
                                    label="Conditions"
                                    value={JSON.stringify(selectedPassive.conditions ?? [], null, 2)}
                                    onChange={(value) => updateJsonField<BattleReactionCondition[]>(value, (parsed) => updateSelectedPassive((passive) => { passive.conditions = parsed }), 'PASSIVE CONDITIONS UPDATED')}
                                    rows={6}
                                    mono
                                  />
                                </div>
                              </details>
                            </div>
                            <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                              <p className="ca-mono-label text-[0.4rem] text-ca-text-3">PASSIVE SUMMARY</p>
                              <p className="mt-2 text-sm leading-6 text-ca-text-2">{describePassive(selectedPassive)}</p>
                            </div>
                            <EffectListEditor
                              title="Reaction Results"
                              helper="These rows fire whenever the selected trigger condition is met."
                              effects={selectedPassive.effects}
                              onChange={(effects) => updateSelectedPassiveEffects(() => effects)}
                              advancedJson={JSON.stringify(selectedPassive.effects, null, 2)}
                              onAdvancedJsonChange={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateSelectedPassive((passive) => { passive.effects = parsed }), "PASSIVE EFFECTS UPDATED")}
                            />
                          </div>
                        ) : (
                          <div className="rounded-[12px] border border-dashed border-white/10 px-3 py-4 text-sm text-ca-text-3">Add or select a passive to begin editing reactions.</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={handleCopyFighterJson} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">COPY SELECTED JSON</button>
                        <button type="button" onClick={() => handleImportFighter('append')} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">IMPORT AS NEW</button>
                        <button type="button" onClick={() => handleImportFighter('replace')} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">REPLACE SELECTED</button>
                      </div>
                      <TextAreaField label="Fighter JSON" value={fighterJsonDraft} onChange={setFighterJsonDraft} rows={18} mono />
                    </div>
                  )}
                </div>
              </EditorCard>
            ) : null}
          </section>

          <section className="space-y-4 xl:sticky xl:top-4 self-start">
            {selectedFighter && selectedAbility ? (
              <SelectionPreviewPanel fighter={selectedFighter} ability={selectedAbility} passive={selectedPassive ?? null} />
            ) : null}
            <EditorCard title="Authoring Guide" subtitle="Images + Costs">
              <div className="space-y-3 text-sm leading-6 text-ca-text-2">
                <GuideRow label="Portrait" copy="Recommended 512x512. Preferred master 1024x1024. Square crop with face or upper torso centered." />
                <GuideRow label="Skill Icon" copy="Recommended 256x256. Preferred master 512x512. Keep the subject centered and avoid tiny embedded text." />
                <GuideRow label="Skill Cost" copy="You can now author cost manually. If manual cost is empty, the game falls back to the automatic cost rules." />
              </div>
            </EditorCard>

            <EditorCard title="Validation" subtitle={validationReport.errors.length > 0 ? 'Fix Before Publish' : 'Ready'}>
              <div className="space-y-2.5 max-h-[36vh] overflow-y-auto pr-1">
                {validationReport.errors.length > 0 ? (
                  validationReport.errors.map((error) => (
                    <div key={error} className="rounded-[10px] border border-ca-red/15 bg-ca-red-wash px-3 py-2 text-sm text-ca-text-2">
                      {error}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[10px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-3 text-sm text-ca-text-2">
                    Draft content passes validation.
                  </div>
                )}
              </div>
            </EditorCard>

            <EditorCard title="Mechanics Inventory" subtitle="Draft Coverage">
              <div className="space-y-4">
                <InventoryBlock title="Skill Effects" items={effectTypeCounts} />
                <InventoryBlock title="Passive Triggers" items={passiveTriggerCounts} />
              </div>
            </EditorCard>
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

function EditorCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">{title}</p>
          <p className="ca-display mt-2 text-3xl text-ca-text">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
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
  const portraitMode = Boolean(fighter.boardPortraitSrc?.startsWith('data:image'))
  const frame = portraitMode ? {} : fighter.boardPortraitFrame ?? {}
  const scale = frame.scale ?? 1
  const x = frame.x ?? '0%'
  const y = frame.y ?? '0%'
  const opacity = frame.opacity ?? 1
  const width = frame.maxWidth ?? '100%'
  const sizeClass = compact ? 'h-[5rem] w-[5rem]' : 'h-[8rem] w-[8rem]'

  return (
    <div className={`relative overflow-hidden rounded-[8px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))] ${sizeClass}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(5,216,189,0.08),transparent_70%)]" />
      {fighter.boardPortraitSrc ? (
        portraitMode ? (
          <img
            src={fighter.boardPortraitSrc}
            alt={fighter.name}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            style={{ opacity }}
            draggable={false}
          />
        ) : (
          <img
            src={fighter.boardPortraitSrc}
            alt={fighter.name}
            className="pointer-events-none absolute left-1/2 top-0 h-full max-w-none select-none object-cover"
            style={{
              width,
              opacity,
              transform: `translate(-50%, 0) translate(${x}, ${y}) scale(${scale})`,
              transformOrigin: 'top center',
            }}
            draggable={false}
          />
        )
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
            {ability.tags.map((tag) => (
              <StatusPill key={tag} label={tag} tone={tag === 'ULT' ? 'gold' : tag === 'DEBUFF' ? 'red' : 'teal'} />
            ))}
            <StatusPill label={targetLabel} tone="frost" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SelectionPreviewPanel({
  fighter,
  ability,
  passive,
}: {
  fighter: BattleFighterTemplate
  ability: BattleAbilityTemplate
  passive: PassiveEffect | null
}) {
  const costEntries = Object.entries(getAbilityEnergyCost(ability))
  const targetLabel = ability.targetRule.toUpperCase().replace(/-/g, ' ')
  const rarityTone: 'red' | 'teal' | 'frost' =
    fighter.rarity === 'SSR' || fighter.rarity === 'UR' ? 'red' : fighter.rarity === 'SR' ? 'teal' : 'frost'

  return (
    <EditorCard title="Selection Preview" subtitle={fighter.shortName.toUpperCase()}>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[12px] border border-white/10 bg-[linear-gradient(135deg,rgba(250,39,66,0.12),rgba(250,39,66,0.02)_35%,rgba(5,216,189,0.08)_78%,rgba(255,255,255,0.03))] p-3">
          <div className="grid gap-3 sm:grid-cols-[5rem_minmax(0,1fr)]">
            <PortraitPreview fighter={fighter} compact />
            <div className="min-w-0">
              <p className="ca-display text-[1.35rem] leading-none text-ca-text">{fighter.name}</p>
              <p className="ca-mono-label mt-1 text-[0.38rem] text-ca-text-3">{fighter.battleTitle?.toUpperCase() ?? fighter.role.toUpperCase()}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusPill label={fighter.rarity} tone={rarityTone} />
                <StatusPill label={fighter.role.toUpperCase()} tone="frost" />
                <StatusPill label={fighter.affiliationLabel.toUpperCase()} tone="teal" />
                <StatusPill label={"HP " + fighter.maxHp} tone="gold" />
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-white/10 bg-[rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[linear-gradient(90deg,rgba(250,39,66,0.9),rgba(179,22,43,0.92))] px-3 py-2.5">
            <div className="min-w-0">
              <p className="ca-display truncate text-[1.05rem] leading-none text-white">{ability.name || "Untitled Skill"}</p>
              <p className="ca-mono-label mt-1 text-[0.36rem] text-white/75">{ability.tags.includes("ULT") ? "ULTIMATE TECHNIQUE" : "ACTIVE SKILL"} - CD {ability.cooldown}</p>
            </div>
            <div className="flex flex-wrap gap-1">
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
          <div className="space-y-3 px-3 py-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <AbilityTilePreview ability={ability} large />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 text-ca-text-2">{ability.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ability.tags.map((tag) => (
                    <StatusPill key={tag} label={tag} tone={tag === "ULT" ? "gold" : tag === "DEBUFF" ? "red" : "teal"} />
                  ))}
                  <StatusPill label={targetLabel} tone="frost" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="ca-mono-label text-[0.4rem] text-ca-text-3">EFFECT BREAKDOWN</p>
              {(ability.effects ?? []).length > 0 ? (
                (ability.effects ?? []).map((effect, index) => (
                  <div key={ability.id + "-summary-" + index} className="rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2.5">
                    <p className="ca-mono-label text-[0.36rem] text-ca-text-3">EFFECT {index + 1}</p>
                    <p className="mt-1 text-sm leading-6 text-ca-text-2">{describeEffect(effect)}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[8px] border border-dashed border-white/10 px-3 py-2.5 text-sm text-ca-text-3">No effect rows authored for this skill yet.</div>
              )}
            </div>
          </div>
        </div>

        {passive ? (
          <div className="rounded-[12px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-3">
            <p className="ca-mono-label text-[0.4rem] text-ca-teal">ACTIVE PASSIVE</p>
            <p className="ca-display mt-2 text-[1rem] text-ca-text">{passive.label}</p>
            <p className="mt-2 text-sm leading-6 text-ca-text-2">{describePassive(passive)}</p>
          </div>
        ) : null}
      </div>
    </EditorCard>
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
          <p className="ca-mono-label mt-1 text-[0.38rem] text-white/75">{isUltimate ? 'ULTIMATE TECHNIQUE' : 'CORE SKILL'}</p>
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
            <InputField
              label="Tags (comma separated)"
              value={ability.tags.join(', ')}
              onChange={(value) => onUpdate((current) => {
                current.tags = value
                  .split(',')
                  .map((part) => part.trim().toUpperCase())
                  .filter((part): part is BattleAbilityTag => tagOptions.includes(part as BattleAbilityTag))
                syncAbilityPresentation(current)
              })}
            />
            <TextAreaField label="Skill Copy" value={ability.description} onChange={(value) => onUpdate((current) => { current.description = value })} rows={3} />
          </div>
        </div>

        <SkillBlueprintPanel
          key={ability.id}
          isUltimate={isUltimate}
          onApply={(blueprintId) => onUpdate((current) => { applySkillBlueprint(current, blueprintId, isUltimate) })}
        />

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

function SkillBlueprintPanel({
  isUltimate,
  onApply,
}: {
  isUltimate: boolean
  onApply: (blueprintId: SkillBlueprintId) => void
}) {
  const preferredDefault: SkillBlueprintId = isUltimate ? 'ultimate-surge' : 'single-strike'
  const [selectedBlueprint, setSelectedBlueprint] = useState<SkillBlueprintId>(preferredDefault)

  const activeBlueprint =
    skillBlueprintOptions.find((option) => option.id === selectedBlueprint) ??
    skillBlueprintOptions[0]

  return (
    <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="ca-mono-label text-[0.4rem] text-ca-text-3">SKILL BLUEPRINT</p>
          <p className="mt-1 text-sm leading-6 text-ca-text-2">Pick a logical starting pattern, then fine-tune the numbers and copy below.</p>
        </div>
        <button
          type="button"
          onClick={() => onApply(selectedBlueprint)}
          className="rounded-[8px] border border-ca-red/20 bg-ca-red px-3 py-2 ca-display text-[0.8rem] tracking-[0.06em] text-white transition hover:-translate-y-[1px]"
        >
          APPLY BLUEPRINT
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SelectField
          label="Technique Archetype"
          value={selectedBlueprint}
          options={skillBlueprintOptions.map((option) => ({ value: option.id, label: option.label }))}
          onChange={(value) => setSelectedBlueprint(value as SkillBlueprintId)}
        />
        <div className="rounded-[8px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-2.5">
          <p className="ca-mono-label text-[0.38rem] text-ca-teal">ARCHETYPE NOTES</p>
          <p className="mt-1 text-sm leading-6 text-ca-text-2">{activeBlueprint.hint}</p>
          <p className="mt-2 ca-mono-label text-[0.38rem] text-ca-text-3">{isUltimate ? 'ULTIMATE SKILLS KEEP THE ULT TAG WHEN APPLIED.' : 'STANDARD SKILLS STAY NON-ULT.'}</p>
        </div>
      </div>
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

function readProgressStatuses(): Record<string, TaskStatus> {
  try {
    const raw = window.localStorage.getItem(battleProgressStorageKey)
    if (!raw) return { ...battleProgressDefaults }
    return { ...battleProgressDefaults, ...JSON.parse(raw) as Record<string, TaskStatus> }
  } catch {
    return { ...battleProgressDefaults }
  }
}

function BattleProgressTracker() {
  const [statuses, setStatuses] = useState<Record<string, TaskStatus>>(readProgressStatuses)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.localStorage.setItem(battleProgressStorageKey, JSON.stringify(statuses))
  }, [statuses])

  function cycleStatus(taskId: string) {
    setStatuses((prev) => {
      const current = prev[taskId] ?? 'pending'
      const next: TaskStatus = current === 'pending' ? 'in-progress' : current === 'in-progress' ? 'done' : 'pending'
      return { ...prev, [taskId]: next }
    })
  }

  function togglePhase(phaseId: string) {
    setCollapsed((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }))
  }

  const allTasks = battleProgressPhases.flatMap((p) => p.tasks)
  const doneCount = allTasks.filter((t) => (statuses[t.id] ?? 'pending') === 'done').length
  const totalCount = allTasks.length
  const pct = Math.round((doneCount / totalCount) * 100)

  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Battle Board Refactor</p>
          <p className="ca-display mt-2 text-3xl text-ca-text">N-A Progress Tracker</p>
        </div>
        <div className="text-right">
          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">OVERALL</p>
          <p className="ca-display mt-1 text-4xl text-ca-teal">{pct}%</p>
          <p className="ca-mono-label text-[0.4rem] text-ca-text-3">{doneCount} / {totalCount} TASKS</p>
        </div>
      </div>

      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-ca-teal transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 space-y-2">
        {battleProgressPhases.map((phase) => {
          const phaseDone = phase.tasks.filter((t) => (statuses[t.id] ?? 'pending') === 'done').length
          const phaseTotal = phase.tasks.length
          const isCollapsed = collapsed[phase.id] ?? false
          const phaseComplete = phaseDone === phaseTotal

          return (
            <div key={phase.id} className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)]">
              <button
                type="button"
                onClick={() => togglePhase(phase.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      'ca-mono-label rounded-md border px-2 py-1 text-[0.38rem]',
                      phaseComplete
                        ? 'border-ca-teal/18 bg-ca-teal-wash text-ca-teal'
                        : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-3',
                    ].join(' ')}
                  >
                    {phase.phase.toUpperCase()}
                  </span>
                  <span className="ca-display text-[1.1rem] text-ca-text">{phase.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="ca-mono-label text-[0.4rem] text-ca-text-3">{phaseDone}/{phaseTotal}</span>
                  <span className="text-[0.6rem] text-ca-text-3">{isCollapsed ? '▶' : '▼'}</span>
                </div>
              </button>

              {!isCollapsed && (
                <div className="border-t border-white/6 px-4 pb-3 pt-2 space-y-1">
                  {phase.tasks.map((task) => {
                    const status = statuses[task.id] ?? 'pending'
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => cycleStatus(task.id)}
                        className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left transition hover:bg-white/4"
                      >
                        <span
                          className={[
                            'ca-mono-label shrink-0 rounded-md border px-2 py-1 text-[0.38rem]',
                            status === 'done'
                              ? 'border-ca-teal/18 bg-ca-teal-wash text-ca-teal'
                              : status === 'in-progress'
                                ? 'border-amber-400/18 bg-amber-400/10 text-amber-300'
                                : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-3',
                          ].join(' ')}
                        >
                          {status === 'done' ? 'DONE' : status === 'in-progress' ? 'IN PROGRESS' : 'PENDING'}
                        </span>
                        <span
                          className={[
                            'text-sm',
                            status === 'done' ? 'text-ca-text-3 line-through' : 'text-ca-text-2',
                          ].join(' ')}
                        >
                          {task.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 ca-mono-label text-[0.38rem] text-ca-text-3">CLICK ANY TASK TO CYCLE STATUS — PERSISTS IN LOCAL STORAGE</p>
    </section>
  )
}












