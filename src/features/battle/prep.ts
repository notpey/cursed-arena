import { ownedRosterCharacters } from '@/data/characters'
import { defaultBattleSetup, battleRosterById } from '@/features/battle/data'
import {
  createStagedBattleSession,
  persistSelectedMatchMode,
  persistStagedBattleSession,
  readSelectedMatchMode,
  readStagedBattleSession,
  type BattleMatchMode,
} from '@/features/battle/matches'
import type { BattleFighterTemplate } from '@/features/battle/types'
import type { Archetype, CharacterRarity } from '@/types/characters'

const prepSelectionStorageKey = 'ca-battle-prep-selection-v1'
const savedTeamsStorageKey = 'ca-battle-prep-saved-v1'
const maxSavedTeams = 3

export type BattleLaunchSetup = {
  playerTeamIds: string[]
  enemyTeamIds: string[]
  battleSeed: string
}

export type SavedPrepTeam = {
  id: string
  name: string
  teamIds: string[]
  updatedAt: number
}

export type BattlePrepRosterEntry = {
  id: string
  name: string
  rarity: CharacterRarity
  archetypes: Archetype[]
  renderSrc?: string
  portraitFrame?: {
    scale?: number
    x?: string
    y?: string
    opacity?: number
  }
  gradeLabel: string
  role: string
  passiveLabel: string
  battleTemplate: BattleFighterTemplate
}

const rarityRank: Record<CharacterRarity, number> = {
  SSR: 3,
  SR: 2,
  R: 1,
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocalStorage<T>(key: string, fallback: T): T {
  if (!canUseLocalStorage()) return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocalStorage<T>(key: string, value: T) {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage write failures in mock mode.
  }
}

export const battlePrepRoster: BattlePrepRosterEntry[] = ownedRosterCharacters
  .filter((character) => Boolean(battleRosterById[character.id]))
  .map((character) => {
    const battleTemplate = battleRosterById[character.id]

    return {
      id: character.id,
      name: battleTemplate.name,
      rarity: character.rarity,
      archetypes: character.archetypes,
      renderSrc: character.renderSrc,
      portraitFrame: character.portraitFrame,
      gradeLabel: character.rarity === 'SSR' ? 'SPECIAL GRADE' : character.rarity === 'SR' ? 'GRADE 1' : 'GRADE 2',
      role: battleTemplate.role,
      passiveLabel: battleTemplate.passiveEffects?.[0]?.label ?? 'No passive loaded',
      battleTemplate,
    }
  })
  .sort((left, right) => {
    if (rarityRank[right.rarity] !== rarityRank[left.rarity]) return rarityRank[right.rarity] - rarityRank[left.rarity]
    return left.name.localeCompare(right.name)
  })

export const battlePrepRosterById = Object.fromEntries(
  battlePrepRoster.map((entry) => [entry.id, entry]),
) as Record<string, BattlePrepRosterEntry>

export const defaultPrepPlayerTeamIds = battlePrepRoster.slice(0, 3).map((entry) => entry.id)

function sanitizeIds(ids: Array<string | null | undefined>, fallbackIds: string[]) {
  const unique = ids.filter((value): value is string => Boolean(value && battlePrepRosterById[value]))
    .filter((value, index, list) => list.indexOf(value) === index)

  for (const fallbackId of fallbackIds) {
    if (unique.length >= 3) break
    if (!unique.includes(fallbackId) && battlePrepRosterById[fallbackId]) {
      unique.push(fallbackId)
    }
  }

  return unique.slice(0, 3)
}

export function sanitizePrepTeamIds(ids: Array<string | null | undefined>) {
  return sanitizeIds(ids, defaultPrepPlayerTeamIds)
}

function normalizePrepSelection(teamIds: Array<string | null | undefined>) {
  return Array.from({ length: 3 }, (_, index) => {
    const value = teamIds[index] ?? null
    return value && battlePrepRosterById[value] ? value : null
  })
}

export function readPrepSelection() {
  return normalizePrepSelection(readLocalStorage<Array<string | null | undefined>>(prepSelectionStorageKey, defaultPrepPlayerTeamIds))
}

export function persistPrepSelection(teamIds: Array<string | null | undefined>) {
  writeLocalStorage(prepSelectionStorageKey, normalizePrepSelection(teamIds))
}

export function createBattleLaunchSetup(playerTeamIds: Array<string | null | undefined>, mode: BattleMatchMode = readSelectedMatchMode()): BattleLaunchSetup {
  const sanitized = sanitizePrepTeamIds(playerTeamIds)
  const session = createStagedBattleSession(mode, sanitized)

  return {
    playerTeamIds: session.playerTeamIds,
    enemyTeamIds: session.enemyTeamIds,
    battleSeed: session.battleSeed,
  }
}

export function stageBattleLaunch(playerTeamIds: Array<string | null | undefined>, mode: BattleMatchMode) {
  const sanitized = sanitizePrepTeamIds(playerTeamIds)
  const session = createStagedBattleSession(mode, sanitized)
  persistPrepSelection(session.playerTeamIds)
  persistSelectedMatchMode(mode)
  persistStagedBattleSession(session)
  return {
    playerTeamIds: session.playerTeamIds,
    enemyTeamIds: session.enemyTeamIds,
    battleSeed: session.battleSeed,
  }
}

export function readStagedBattleLaunch() {
  const session = readStagedBattleSession()
  if (session) {
    return {
      playerTeamIds: sanitizePrepTeamIds(session.playerTeamIds),
      enemyTeamIds: (session.enemyTeamIds.length ? session.enemyTeamIds : defaultBattleSetup.enemyTeamIds).slice(),
      battleSeed: session.battleSeed,
    }
  }

  return createBattleLaunchSetup(readPrepSelection())
}

function createSavedTeamName(teamIds: string[]) {
  return teamIds
    .map((teamId) => battlePrepRosterById[teamId]?.battleTemplate.shortName ?? teamId.toUpperCase())
    .join(' / ')
}

export function readSavedPrepTeams() {
  const saved = readLocalStorage<SavedPrepTeam[]>(savedTeamsStorageKey, [])
  return saved
    .map((team) => ({
      ...team,
      teamIds: sanitizePrepTeamIds(team.teamIds),
    }))
    .filter((team) => team.teamIds.length === 3)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, maxSavedTeams)
}

export function savePrepTeam(teamIds: Array<string | null | undefined>, customName?: string) {
  const sanitized = sanitizePrepTeamIds(teamIds)
  const name = customName?.trim() || createSavedTeamName(sanitized)
  const current = readSavedPrepTeams().filter((team) => team.name !== name)
  const next: SavedPrepTeam[] = [
    {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      name,
      teamIds: sanitized,
      updatedAt: Date.now(),
    },
    ...current,
  ].slice(0, maxSavedTeams)

  writeLocalStorage(savedTeamsStorageKey, next)
  return next
}

export function deleteSavedPrepTeam(teamId: string) {
  const next = readSavedPrepTeams().filter((team) => team.id !== teamId)
  writeLocalStorage(savedTeamsStorageKey, next)
  return next
}

