import type { BattleFighterTemplate } from '@/features/battle/types.ts'

// Bump CONTENT_SCHEMA_VERSION whenever the authored roster shape changes in
// ways that make older published snapshots stale (kit redesigns, new
// fighters, breaking effect-shape changes). Snapshots without a matching
// version are treated as outdated and the runtime falls back to authored.
export const CONTENT_SCHEMA_VERSION = 6

const draftContentKey = `ca-battle-content-draft-v${CONTENT_SCHEMA_VERSION}`
const publishedContentKey = `ca-battle-content-published-v${CONTENT_SCHEMA_VERSION}`

export type BattleContentSetup = {
  playerTeamIds: string[]
  enemyTeamIds: string[]
}

export type BattleContentSnapshot = {
  roster: BattleFighterTemplate[]
  defaultSetup: BattleContentSetup
  updatedAt: number
  schemaVersion?: number
}

const validAbilityKinds = new Set(['attack', 'heal', 'defend', 'buff', 'debuff', 'utility', 'pass'])
const validTargetRules = new Set(['none', 'self', 'enemy-single', 'enemy-all', 'ally-single', 'ally-all'])
const validSkillClasses = new Set(['Melee', 'Ranged', 'Physical', 'Piercing', 'Energy', 'Affliction', 'Mental', 'Instant', 'Action', 'Control', 'Unique', 'Ultimate', 'Strategic', 'Special'])

function deriveAbilityLabel(name: string) {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

function resolveAbilityTone(kind: unknown, isUltimate: boolean) {
  if (isUltimate) return 'gold'
  if (kind === 'heal') return 'teal'
  if (kind === 'debuff') return 'red'
  if (kind === 'buff' || kind === 'defend' || kind === 'utility') return 'teal'
  if (kind === 'pass') return 'frost'
  return 'red'
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index)
}

function normalizeAssetSrc(value: unknown) {
  if (typeof value !== 'string') return undefined

  const src = value.trim()
  if (!src) return undefined

  return src.replace('/storage/v1/object/game-assets/', '/storage/v1/object/public/game-assets/')
}

function inferLegacyClasses(rawAbility: Record<string, unknown>, isUltimate: boolean) {
  const classes = Array.isArray(rawAbility.classes)
    ? rawAbility.classes.filter((value): value is string => typeof value === 'string' && validSkillClasses.has(value))
    : []

  if (classes.length > 0) {
    if (isUltimate && !classes.includes('Ultimate')) classes.push('Ultimate')
    return uniqueStrings(classes)
  }

  const kind = validAbilityKinds.has(String(rawAbility.kind)) ? String(rawAbility.kind) : 'attack'
  const targetRule = validTargetRules.has(String(rawAbility.targetRule)) ? String(rawAbility.targetRule) : 'enemy-single'
  const legacyTags = Array.isArray(rawAbility.tags)
    ? rawAbility.tags.filter((value): value is string => typeof value === 'string')
    : []

  if (kind === 'attack') {
    classes.push(targetRule === 'enemy-all' ? 'Ranged' : 'Melee')
    classes.push(legacyTags.includes('ULT') ? 'Energy' : 'Physical')
    classes.push('Action')
  } else if (kind === 'heal') {
    classes.push('Ranged', 'Energy', 'Instant')
  } else if (kind === 'debuff') {
    classes.push('Ranged', 'Mental', 'Control')
  } else if (kind === 'buff' || kind === 'utility' || kind === 'defend') {
    classes.push('Instant', kind === 'defend' ? 'Physical' : 'Energy')
  } else {
    classes.push('Instant')
  }

  if (isUltimate || legacyTags.includes('ULT')) classes.push('Ultimate')
  return uniqueStrings(classes)
}

function normalizeReactionCondition(rawCondition: unknown) {
  if (!rawCondition || typeof rawCondition !== 'object') return rawCondition

  const condition = rawCondition as Record<string, unknown>
  if (condition.type === 'abilityTag') {
    if (condition.tag === 'ULT') {
      return { type: 'isUltimate' as const }
    }
    return null
  }

  return rawCondition
}

function normalizePassive(rawPassive: unknown) {
  if (!rawPassive || typeof rawPassive !== 'object') return rawPassive

  const passive = rawPassive as Record<string, unknown>
  const conditions = Array.isArray(passive.conditions)
    ? passive.conditions
        .map((condition) => normalizeReactionCondition(condition))
        .filter((condition) => condition != null)
    : undefined

  const label = typeof passive.label === 'string' && passive.label.trim() ? passive.label : 'Passive'
  const id = typeof passive.id === 'string' && passive.id.trim()
    ? passive.id
    : label.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const rawIcon = passive.icon && typeof passive.icon === 'object' ? passive.icon as Record<string, unknown> : {}
  const icon = {
    src: normalizeAssetSrc(rawIcon.src),
    label: typeof rawIcon.label === 'string' && rawIcon.label.trim() ? rawIcon.label : deriveAbilityLabel(label),
    tone: 'teal',
  }

  return {
    ...passive,
    id,
    label,
    icon,
    effects: Array.isArray(passive.effects) ? passive.effects : [],
    conditions,
  }
}

function normalizeAbility(rawAbility: unknown, isUltimate: boolean) {
  if (!rawAbility || typeof rawAbility !== 'object') return rawAbility

  const ability = rawAbility as Record<string, unknown>
  const name = typeof ability.name === 'string' && ability.name.trim() ? ability.name : 'Unnamed Technique'
  const kind = validAbilityKinds.has(String(ability.kind)) ? String(ability.kind) : 'attack'
  const targetRule = validTargetRules.has(String(ability.targetRule)) ? String(ability.targetRule) : kind === 'pass' ? 'none' : 'enemy-single'
  const classes = inferLegacyClasses(ability, isUltimate)
  const icon = ability.icon && typeof ability.icon === 'object' ? ability.icon as Record<string, unknown> : {}

  return {
    ...ability,
    name,
    kind,
    targetRule,
    classes,
    cooldown: Number.isFinite(ability.cooldown) ? Number(ability.cooldown) : 0,
    effects: Array.isArray(ability.effects) ? ability.effects : [],
    icon: {
      src: normalizeAssetSrc(icon.src),
      label: typeof icon.label === 'string' && icon.label.trim() ? icon.label : deriveAbilityLabel(name),
      tone: resolveAbilityTone(kind, classes.includes('Ultimate')),
    },
  }
}

function normalizeFighter(rawFighter: unknown) {
  if (!rawFighter || typeof rawFighter !== 'object') return rawFighter

  const fighter = rawFighter as Record<string, unknown>
  const rawAbilities = Array.isArray(fighter.abilities) ? fighter.abilities : []
  const rawUltimate = fighter.ultimate

  return {
    ...fighter,
    boardPortraitSrc: normalizeAssetSrc(fighter.boardPortraitSrc),
    abilities: rawAbilities.map((ability) => normalizeAbility(ability, false)),
    ultimate: normalizeAbility(rawUltimate, false),
    passiveEffects: Array.isArray(fighter.passiveEffects)
      ? fighter.passiveEffects.map((passive) => normalizePassive(passive))
      : [],
  }
}

function normalizeSnapshot(rawSnapshot: unknown): BattleContentSnapshot | null {
  if (!rawSnapshot || typeof rawSnapshot !== 'object') return null

  const snapshot = rawSnapshot as Record<string, unknown>
  const defaultSetup = snapshot.defaultSetup && typeof snapshot.defaultSetup === 'object'
    ? snapshot.defaultSetup as Record<string, unknown>
    : {}

  return {
    roster: Array.isArray(snapshot.roster)
      ? snapshot.roster.map((fighter) => normalizeFighter(fighter) as BattleFighterTemplate)
      : [],
    defaultSetup: {
      playerTeamIds: Array.isArray(defaultSetup.playerTeamIds)
        ? defaultSetup.playerTeamIds.filter((id): id is string => typeof id === 'string')
        : [],
      enemyTeamIds: Array.isArray(defaultSetup.enemyTeamIds)
        ? defaultSetup.enemyTeamIds.filter((id): id is string => typeof id === 'string')
        : [],
    },
    updatedAt: typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : Date.now(),
    schemaVersion: typeof snapshot.schemaVersion === 'number' ? snapshot.schemaVersion : undefined,
  }
}

export function normalizeContentSnapshot(snapshot: unknown): BattleContentSnapshot | null {
  return normalizeSnapshot(snapshot)
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function cloneSnapshot(snapshot: BattleContentSnapshot): BattleContentSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as BattleContentSnapshot
}

function readStorage(key: string): BattleContentSnapshot | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return normalizeSnapshot(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeStorage(key: string, snapshot: BattleContentSnapshot) {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.setItem(key, JSON.stringify(normalizeSnapshot(snapshot) ?? snapshot))
  } catch {
    // Ignore storage write failures in local tool mode.
  }
}

export function createContentSnapshot(roster: BattleFighterTemplate[], defaultSetup: BattleContentSetup): BattleContentSnapshot {
  return {
    roster: JSON.parse(JSON.stringify(roster)) as BattleFighterTemplate[],
    defaultSetup: {
      playerTeamIds: defaultSetup.playerTeamIds.slice(),
      enemyTeamIds: defaultSetup.enemyTeamIds.slice(),
    },
    updatedAt: Date.now(),
    schemaVersion: CONTENT_SCHEMA_VERSION,
  }
}

export function isSnapshotCurrent(snapshot: BattleContentSnapshot | null | undefined): boolean {
  return Boolean(snapshot) && snapshot!.schemaVersion === CONTENT_SCHEMA_VERSION
}

export function readDraftBattleContent(fallback: BattleContentSnapshot) {
  return cloneSnapshot(readStorage(draftContentKey) ?? fallback)
}

export function saveDraftBattleContent(snapshot: BattleContentSnapshot) {
  const next = { ...(normalizeSnapshot(snapshot) ?? cloneSnapshot(snapshot)), updatedAt: Date.now() }
  writeStorage(draftContentKey, next)
  return next
}

export function clearDraftBattleContent() {
  if (!canUseLocalStorage()) return
  window.localStorage.removeItem(draftContentKey)
}

export function readPublishedBattleContent(fallback: BattleContentSnapshot) {
  const stored = readStorage(publishedContentKey)
  if (!isSnapshotCurrent(stored)) return cloneSnapshot(fallback)
  return cloneSnapshot(stored!)
}

export function clearPublishedBattleContent() {
  if (!canUseLocalStorage()) return
  window.localStorage.removeItem(publishedContentKey)
}

export function savePublishedBattleContent(snapshot: BattleContentSnapshot) {
  const next = normalizeSnapshot(snapshot) ?? cloneSnapshot(snapshot)
  next.updatedAt = typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : Date.now()
  next.schemaVersion = CONTENT_SCHEMA_VERSION
  writeStorage(publishedContentKey, next)
  return next
}
