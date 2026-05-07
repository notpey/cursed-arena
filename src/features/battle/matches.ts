import { defaultBattleSetup } from '@/features/battle/data'
import { createBattleSeed, pickSeededIndex } from '@/features/battle/random'
import type { BattleWinner } from '@/features/battle/types'
import { readPlayerProfile } from '@/features/player/store'
import { trackBattleCompleted } from '@/features/missions/store'
import { evaluateAndGetUnlockMissions } from '@/features/missions/unlocks'
import { saveAccountMissionProgress } from '@/features/missions/missionProgressStore'
import {
  syncBattleProfileToSupabase,
  syncMatchHistoryEntryToSupabase,
  syncLastBattleResultToSupabase,
} from '@/features/battle/persistence'
import {
  calculateExperienceDelta,
  getLevelForExperience,
  getLevelProgress,
  getLevelShift,
  getLadderRankTitle,
  normalizeExperience,
} from '@/features/ranking/ladder'

const selectedMatchModeKey = 'ca-battle-match-mode-v1'
const stagedBattleSessionKey = 'ca-battle-staged-session-v1'
const battleProfileStatsKey = 'ca-battle-profile-stats-v1'
const battleMatchHistoryKey = 'ca-battle-history-v1'
const lastBattleResultKey = 'ca-battle-last-result-v1'

export const battleMatchModes = ['ranked', 'quick', 'private', 'practice'] as const
export type BattleMatchMode = (typeof battleMatchModes)[number]

export type PracticeOptions = {
  aiEnabled: boolean
  enemyTeamIds: string[]
}
export type BattleMatchResult = 'WIN' | 'LOSS' | 'DRAW'
/** @deprecated Use getLevelShift instead. Kept for UI compatibility. */
export type BattleRankShift = 'promoted' | 'demoted' | 'steady'

export type BattleProfileStats = {
  playerName: string
  title: string
  playerId: string
  season: string
  // ── New experience/level fields ──
  experience: number
  level: number
  rankTitle: string
  experienceToNextLevel: number
  peakExperience: number
  peakLevel: number
  peakRankTitle: string
  ladderRank?: number | null
  // ── Match stats ──
  wins: number
  losses: number
  matchesPlayed: number
  currentStreak: number
  bestStreak: number
}

export type MatchHistoryEntry = {
  id: string
  matchId?: string | null
  /** Stable key used to prevent double-recording: `battleSeed:mode:winner` */
  completionId?: string
  result: BattleMatchResult
  mode: BattleMatchMode
  opponentName: string
  opponentTitle: string
  opponentRankLabel?: string | null
  yourTeam: string[]
  theirTeam: string[]
  timestamp: number
  rounds: number
  // ── New experience fields ──
  experienceDelta: number
  experienceBefore: number
  experienceAfter: number
  levelBefore: number
  levelAfter: number
  rankTitleBefore: string
  rankTitleAfter: string
  ladderRankBefore?: number | null
  ladderRankAfter?: number | null
  finishReason?: string | null
  roomCode?: string | null
}

export type StagedBattleSession = {
  mode: BattleMatchMode
  battleSeed: string
  playerTeamIds: string[]
  enemyTeamIds: string[]
  opponentName: string
  opponentTitle: string
  opponentRankLabel?: string | null
  /** Opponent's experience for delta calculation. Populated from queue/match row for online matches. */
  opponentExperience?: number | null
  roomCode?: string | null
  practiceOptions?: PracticeOptions | null
}

export type LastBattleResult = {
  id: string
  matchId?: string | null
  /** Stable key used to prevent double-recording: `battleSeed:mode:winner` */
  completionId?: string
  result: BattleMatchResult
  mode: BattleMatchMode
  winner: BattleWinner
  rounds: number
  opponentName: string
  opponentTitle: string
  opponentRankLabel?: string | null
  yourTeam: string[]
  theirTeam: string[]
  // ── New experience fields ──
  experienceDelta: number
  experienceBefore: number
  experienceAfter: number
  levelBefore: number
  levelAfter: number
  rankTitleBefore: string
  rankTitleAfter: string
  rankShift: BattleRankShift
  ladderRankBefore?: number | null
  ladderRankAfter?: number | null
  finishReason?: string | null
  roomCode?: string | null
  timestamp: number
  profileSnapshot: BattleProfileStats
  newlyUnlockedMissionIds: string[]
  /** Cursed Coins auto-claimed from daily/weekly missions this match */
  coinsEarned: number
  /** IDs of daily/weekly missions that were newly completed this match */
  newlyCompletedQuestIds: string[]
  /** Streak before this match — lets the UI show streak change without re-reading profile */
  streakBefore: number
  matchesPlayedDelta: number
}

type OpponentSeed = {
  opponentName: string
  opponentTitle: string
  enemyTeamIds: string[]
  opponentRankLabel?: string | null
  /** Approximate experience for this seeded opponent, used for XP delta calculation. */
  opponentExperience?: number
  roomCode?: string | null
}

const rankedOpponentPool: OpponentSeed[] = [
  { opponentName: 'HEX_KING', opponentTitle: 'Ladder Hunter', opponentRankLabel: 'Grade 1 Sorcerer', opponentExperience: 8500, enemyTeamIds: ['yuji', 'nobara', 'megumi'] },
  { opponentName: 'DOMAINFRAME', opponentTitle: 'Barrier Technician', opponentRankLabel: 'Grade 1 Sorcerer', opponentExperience: 9200, enemyTeamIds: ['megumi', 'yuji', 'nobara'] },
]

const quickOpponentPool: OpponentSeed[] = [
  { opponentName: 'SCRIM_01', opponentTitle: 'Quick Match', enemyTeamIds: ['yuji', 'nobara', 'megumi'] },
  { opponentName: 'SPAR_PARTNER', opponentTitle: 'Open Lobby', enemyTeamIds: ['megumi', 'nobara', 'yuji'] },
]

const privateOpponentPool: OpponentSeed[] = [
  { opponentName: 'ROOM_GUEST', opponentTitle: 'Private Match', enemyTeamIds: ['yuji', 'nobara', 'megumi'], roomCode: 'ROOM-742' },
  { opponentName: 'FRIEND_SLOT', opponentTitle: 'Private Match', enemyTeamIds: ['megumi', 'yuji', 'nobara'], roomCode: 'ROOM-188' },
]

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
    // Ignore storage write failures in local mock mode.
  }
}

function removeLocalStorage(key: string) {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage failures in local mock mode.
  }
}

export function clearStagedBattleSession() {
  removeLocalStorage(stagedBattleSessionKey)
}

export function clearOnlineMatchmakingLocalState() {
  clearStagedBattleSession()
}

/**
 * Migrate a raw stored object from the old LP-based schema to the new
 * experience-based BattleProfileStats shape. Safe to call on already-migrated data.
 */
function migrateProfileStats(raw: Record<string, unknown>): BattleProfileStats {
  // Prefer experience; fall back to lpCurrent for cross-version compat.
  const experience = typeof raw.experience === 'number'
    ? raw.experience
    : typeof raw.lpCurrent === 'number'
      ? raw.lpCurrent
      : 0

  const level = getLevelForExperience(experience)
  const progress = getLevelProgress(experience)
  const rankTitle = getLadderRankTitle({ level, ladderRank: (raw.ladderRank as number | null | undefined) ?? null })

  const peakExperience = typeof raw.peakExperience === 'number'
    ? raw.peakExperience
    : typeof raw.peakLp === 'number'
      ? raw.peakLp
      : experience

  const peakLevel = getLevelForExperience(peakExperience)
  const peakRankTitle = getLadderRankTitle({ level: peakLevel, ladderRank: null })

  return {
    playerName: (raw.playerName as string) ?? '',
    title: (raw.title as string) ?? '',
    playerId: (raw.playerId as string) ?? '',
    season: (raw.season as string) ?? 'SEASON 3',
    experience,
    level,
    rankTitle,
    experienceToNextLevel: progress.nextLevelExperience,
    peakExperience,
    peakLevel,
    peakRankTitle,
    ladderRank: (raw.ladderRank as number | null | undefined) ?? null,
    wins: (raw.wins as number) ?? 0,
    losses: (raw.losses as number) ?? 0,
    matchesPlayed: (raw.matchesPlayed as number) ?? 0,
    currentStreak: (raw.currentStreak as number) ?? 0,
    bestStreak: (raw.bestStreak as number) ?? 0,
  }
}

function createDefaultProfileStats(): BattleProfileStats {
  const playerProfile = readPlayerProfile()
  const experience = 0
  const level = getLevelForExperience(experience)
  const progress = getLevelProgress(experience)
  const rankTitle = getLadderRankTitle({ level, ladderRank: null })

  return {
    playerName: playerProfile.displayName,
    title: playerProfile.title,
    playerId: playerProfile.playerId,
    season: 'SEASON 3',
    experience,
    level,
    rankTitle,
    experienceToNextLevel: progress.nextLevelExperience,
    peakExperience: experience,
    peakLevel: level,
    peakRankTitle: rankTitle,
    ladderRank: null,
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    currentStreak: 0,
    bestStreak: 0,
  }
}

/**
 * Migrate a raw MatchHistoryEntry from old LP-based fields to experience-based.
 */
function migrateHistoryEntry(raw: Record<string, unknown>): MatchHistoryEntry {
  const experienceDelta = typeof raw.experienceDelta === 'number'
    ? raw.experienceDelta
    : typeof raw.lpDelta === 'number'
      ? raw.lpDelta
      : 0

  const experienceBefore = typeof raw.experienceBefore === 'number'
    ? raw.experienceBefore
    : typeof raw.lpBefore === 'number'
      ? raw.lpBefore
      : 0

  const experienceAfter = typeof raw.experienceAfter === 'number'
    ? raw.experienceAfter
    : typeof raw.lpAfter === 'number'
      ? raw.lpAfter
      : Math.max(0, experienceBefore + experienceDelta)

  const levelBefore = typeof raw.levelBefore === 'number' ? raw.levelBefore : getLevelForExperience(experienceBefore)
  const levelAfter = typeof raw.levelAfter === 'number' ? raw.levelAfter : getLevelForExperience(experienceAfter)

  const rankTitleBefore = typeof raw.rankTitleBefore === 'string'
    ? raw.rankTitleBefore
    : getLadderRankTitle({ level: levelBefore, ladderRank: null })

  const rankTitleAfter = typeof raw.rankTitleAfter === 'string'
    ? raw.rankTitleAfter
    : getLadderRankTitle({ level: levelAfter, ladderRank: null })

  return {
    id: (raw.id as string) ?? `migrated-${Date.now()}`,
    matchId: (raw.matchId as string | null | undefined) ?? null,
    completionId: raw.completionId as string | undefined,
    result: (raw.result as BattleMatchResult) ?? 'LOSS',
    mode: (raw.mode as BattleMatchMode) ?? 'quick',
    opponentName: (raw.opponentName as string) ?? 'Unknown',
    opponentTitle: (raw.opponentTitle as string) ?? '',
    opponentRankLabel: (raw.opponentRankLabel as string | null | undefined) ?? null,
    yourTeam: (raw.yourTeam as string[]) ?? [],
    theirTeam: (raw.theirTeam as string[]) ?? [],
    timestamp: (raw.timestamp as number) ?? Date.now(),
    rounds: (raw.rounds as number) ?? 0,
    experienceDelta,
    experienceBefore,
    experienceAfter,
    levelBefore,
    levelAfter,
    rankTitleBefore,
    rankTitleAfter,
    ladderRankBefore: (raw.ladderRankBefore as number | null | undefined) ?? null,
    ladderRankAfter: (raw.ladderRankAfter as number | null | undefined) ?? null,
    finishReason: (raw.finishReason as string | null | undefined) ?? null,
    roomCode: (raw.roomCode as string | null | undefined) ?? null,
  }
}

function normalizeHistoryEntry(entry: MatchHistoryEntry): MatchHistoryEntry {
  return {
    ...entry,
    rounds: entry.rounds ?? 0,
    experienceDelta: entry.experienceDelta ?? 0,
    experienceBefore: entry.experienceBefore ?? 0,
    experienceAfter: entry.experienceAfter ?? 0,
    levelBefore: entry.levelBefore ?? 1,
    levelAfter: entry.levelAfter ?? 1,
    rankTitleBefore: entry.rankTitleBefore ?? entry.rankTitleAfter ?? 'Jujutsu Student',
    rankTitleAfter: entry.rankTitleAfter ?? entry.rankTitleBefore ?? 'Jujutsu Student',
    finishReason: entry.finishReason ?? null,
    roomCode: entry.roomCode ?? null,
  }
}

function normalizeHistory(entries: MatchHistoryEntry[]) {
  return [...entries]
    .map((e) => normalizeHistoryEntry(migrateHistoryEntry(e as unknown as Record<string, unknown>)))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 20)
}

function normalizeLastResult(result: LastBattleResult | null) {
  if (!result) return null

  const snapshot = result.profileSnapshot
    ? migrateProfileStats(result.profileSnapshot as unknown as Record<string, unknown>)
    : null

  const experienceBefore = result.experienceBefore
    ?? (result as unknown as Record<string, unknown>).lpBefore as number
    ?? Math.max(0, ((snapshot?.experience ?? 0) - (result.experienceDelta ?? 0)))

  const experienceAfter = result.experienceAfter
    ?? (result as unknown as Record<string, unknown>).lpAfter as number
    ?? (snapshot?.experience ?? 0)

  const levelBefore = result.levelBefore ?? getLevelForExperience(experienceBefore)
  const levelAfter = result.levelAfter ?? getLevelForExperience(experienceAfter)

  return {
    ...result,
    experienceDelta: result.experienceDelta ?? (result as unknown as Record<string, unknown>).lpDelta as number ?? 0,
    experienceBefore,
    experienceAfter,
    levelBefore,
    levelAfter,
    rankTitleBefore: result.rankTitleBefore
      ?? (result as unknown as Record<string, unknown>).rankBefore as string
      ?? getLadderRankTitle({ level: levelBefore, ladderRank: null }),
    rankTitleAfter: result.rankTitleAfter
      ?? (result as unknown as Record<string, unknown>).rankAfter as string
      ?? getLadderRankTitle({ level: levelAfter, ladderRank: null }),
    rankShift: result.rankShift ?? 'steady',
    finishReason: result.finishReason ?? null,
    roomCode: result.roomCode ?? null,
    newlyUnlockedMissionIds: result.newlyUnlockedMissionIds ?? [],
    coinsEarned: result.coinsEarned ?? 0,
    newlyCompletedQuestIds: result.newlyCompletedQuestIds ?? [],
    streakBefore: result.streakBefore ?? 0,
    matchesPlayedDelta: result.matchesPlayedDelta ?? 1,
    profileSnapshot: snapshot ?? result.profileSnapshot,
  }
}

function pickPoolEntry<T>(pool: T[], seed: string) {
  return pool[pickSeededIndex(pool.length, seed)]
}

function normalizeStagedBattleSession(session: StagedBattleSession | null) {
  if (!session) return null

  const battleSeed =
    session.battleSeed ||
    [session.mode, session.playerTeamIds.join('-'), session.enemyTeamIds.join('-'), session.opponentName].join(':')

  return {
    ...session,
    battleSeed,
    playerTeamIds: session.playerTeamIds.slice(),
    enemyTeamIds: session.enemyTeamIds.slice(),
    opponentRankLabel: session.opponentRankLabel ?? null,
    opponentExperience: session.opponentExperience ?? null,
    roomCode: session.roomCode ?? null,
    practiceOptions: session.practiceOptions ?? null,
  }
}

export function readSelectedMatchMode(): BattleMatchMode {
  const mode = readLocalStorage<BattleMatchMode>(selectedMatchModeKey, 'ranked')
  return battleMatchModes.includes(mode) ? mode : 'ranked'
}

export function persistSelectedMatchMode(mode: BattleMatchMode) {
  writeLocalStorage(selectedMatchModeKey, mode)
}

export function createStagedBattleSession(mode: BattleMatchMode, playerTeamIds: string[]): StagedBattleSession {
  const battleSeed = createBattleSeed(mode, playerTeamIds)
  const pool = mode === 'ranked' ? rankedOpponentPool : mode === 'quick' ? quickOpponentPool : privateOpponentPool
  const picked = pickPoolEntry(pool, `${battleSeed}:opponent`)

  return {
    mode,
    battleSeed,
    playerTeamIds: playerTeamIds.slice(),
    enemyTeamIds: picked.enemyTeamIds.slice(),
    opponentName: picked.opponentName,
    opponentTitle: picked.opponentTitle,
    opponentRankLabel: picked.opponentRankLabel ?? null,
    opponentExperience: picked.opponentExperience ?? null,
    roomCode: picked.roomCode ?? null,
    practiceOptions: null,
  }
}

export function createPracticeSession(playerTeamIds: string[], options: PracticeOptions): StagedBattleSession {
  const battleSeed = createBattleSeed('practice', playerTeamIds)
  return {
    mode: 'practice',
    battleSeed,
    playerTeamIds: playerTeamIds.slice(),
    enemyTeamIds: options.enemyTeamIds.slice(),
    opponentName: 'TRAINING_DUMMY',
    opponentTitle: 'Practice Match',
    opponentRankLabel: null,
    opponentExperience: null,
    roomCode: null,
    practiceOptions: { ...options },
  }
}

export function persistStagedBattleSession(session: StagedBattleSession) {
  writeLocalStorage(stagedBattleSessionKey, normalizeStagedBattleSession(session))
}

export function readStagedBattleSession(): StagedBattleSession | null {
  return normalizeStagedBattleSession(readLocalStorage<StagedBattleSession | null>(stagedBattleSessionKey, null))
}

export function readBattleProfileStats(): BattleProfileStats {
  const playerProfile = readPlayerProfile()
  const raw = readLocalStorage<Record<string, unknown>>(battleProfileStatsKey, {})
  const hasData = Object.keys(raw).length > 0
  const stored = hasData ? migrateProfileStats(raw) : createDefaultProfileStats()

  return {
    ...stored,
    playerName: playerProfile.displayName,
    title: playerProfile.title,
    playerId: playerProfile.playerId,
  }
}

export function readRecentMatchHistory() {
  const raw = readLocalStorage<unknown[]>(battleMatchHistoryKey, [])
  if (raw.length === 0) return []
  return normalizeHistory(raw as MatchHistoryEntry[])
}

export function readLastBattleResult() {
  return normalizeLastResult(readLocalStorage<LastBattleResult | null>(lastBattleResultKey, null))
}

export function cacheLastBattleResult(result: LastBattleResult) {
  const normalized = normalizeLastResult(result)
  if (!normalized) return null
  writeLocalStorage(lastBattleResultKey, normalized)
  return normalized
}

export function cacheMatchHistoryEntry(entry: MatchHistoryEntry) {
  const history = normalizeHistory([entry, ...readRecentMatchHistory()])
  writeLocalStorage(battleMatchHistoryKey, history)
  return history
}

export function lastBattleResultFromHistoryEntry(entry: MatchHistoryEntry): LastBattleResult {
  const normalizedEntry = normalizeHistoryEntry(entry)
  const current = readBattleProfileStats()
  const won = normalizedEntry.result === 'WIN'
  const draw = normalizedEntry.result === 'DRAW'
  const profileSnapshot: BattleProfileStats = {
    ...current,
    experience: normalizedEntry.experienceAfter,
    level: normalizedEntry.levelAfter,
    rankTitle: normalizedEntry.rankTitleAfter,
    wins: current.wins + (won ? 1 : 0),
    losses: current.losses + (!won && !draw ? 1 : 0),
    matchesPlayed: current.matchesPlayed + 1,
    currentStreak: won ? current.currentStreak + 1 : draw ? current.currentStreak : 0,
    bestStreak: won ? Math.max(current.bestStreak, current.currentStreak + 1) : current.bestStreak,
  }

  return {
    id: normalizedEntry.id,
    matchId: normalizedEntry.matchId ?? null,
    completionId: normalizedEntry.completionId ?? normalizedEntry.matchId ?? normalizedEntry.id,
    result: normalizedEntry.result,
    mode: normalizedEntry.mode,
    winner: draw ? 'draw' : won ? 'player' : 'enemy',
    rounds: normalizedEntry.rounds,
    opponentName: normalizedEntry.opponentName,
    opponentTitle: normalizedEntry.opponentTitle,
    opponentRankLabel: normalizedEntry.opponentRankLabel ?? null,
    yourTeam: normalizedEntry.yourTeam.slice(),
    theirTeam: normalizedEntry.theirTeam.slice(),
    experienceDelta: normalizedEntry.experienceDelta,
    experienceBefore: normalizedEntry.experienceBefore,
    experienceAfter: normalizedEntry.experienceAfter,
    levelBefore: normalizedEntry.levelBefore,
    levelAfter: normalizedEntry.levelAfter,
    rankTitleBefore: normalizedEntry.rankTitleBefore,
    rankTitleAfter: normalizedEntry.rankTitleAfter,
    rankShift: getLevelShift(normalizedEntry.levelBefore, normalizedEntry.levelAfter),
    ladderRankBefore: normalizedEntry.ladderRankBefore ?? null,
    ladderRankAfter: normalizedEntry.ladderRankAfter ?? null,
    finishReason: normalizedEntry.finishReason ?? null,
    roomCode: normalizedEntry.roomCode ?? null,
    timestamp: normalizedEntry.timestamp,
    profileSnapshot,
    newlyUnlockedMissionIds: [],
    coinsEarned: 0,
    newlyCompletedQuestIds: [],
    streakBefore: current.currentStreak,
    matchesPlayedDelta: 1,
  }
}

export function formatMatchTimestamp(timestamp: number) {
  const deltaMs = Date.now() - timestamp
  const minutes = Math.max(1, Math.floor(deltaMs / 60000))
  if (minutes < 60) return `${minutes} MIN AGO`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} HOURS AGO`
  const days = Math.floor(hours / 24)
  return `${days} DAYS AGO`
}

export function getModeLabel(mode: BattleMatchMode) {
  if (mode === 'ranked') return 'LADDER'
  if (mode === 'quick') return 'QUICK'
  if (mode === 'practice') return 'PRACTICE'
  return 'PRIVATE'
}

export function getModeDescription(mode: BattleMatchMode) {
  if (mode === 'ranked') return 'Ranked climb with experience gains and losses.'
  if (mode === 'quick') return 'Fast unranked matches for testing teams.'
  return 'Private-room rules with no ranked stakes.'
}

export function getModeButtonLabel(mode: BattleMatchMode) {
  if (mode === 'ranked') return 'Start Ladder Game'
  if (mode === 'quick') return 'Start Quick Game'
  if (mode === 'practice') return 'Start Practice'
  return 'Start Private Game'
}

export function getFeaturedTeamIds() {
  return readRecentMatchHistory()[0]?.yourTeam ?? defaultBattleSetup.playerTeamIds.slice()
}

/**
 * Stable identifier for a completed match, safe to recompute across remounts.
 * battleSeed is already a unique nonce per session; winner is excluded so the
 * key doesn't vary if winner is evaluated at different call sites.
 * Format: `battleSeed:mode`
 */
export function buildCompletionId(battleSeed: string, mode: BattleMatchMode): string {
  return `${battleSeed}:${mode}`
}

type CompletionLookup =
  | { status: 'new' }
  | { status: 'found'; result: LastBattleResult }
  | { status: 'already-recorded' }

/**
 * Check whether a completionId has already been written to localStorage.
 */
function findExistingResult(completionId: string): CompletionLookup {
  const last = readLocalStorage<LastBattleResult | null>(lastBattleResultKey, null)
  if (last?.completionId === completionId) {
    const normalized = normalizeLastResult(last)
    return normalized ? { status: 'found', result: normalized } : { status: 'already-recorded' }
  }

  const history = readLocalStorage<MatchHistoryEntry[]>(battleMatchHistoryKey, [])
  if (history.some((e) => e.completionId === completionId)) {
    return { status: 'already-recorded' }
  }

  return { status: 'new' }
}

export function recordCompletedBattle({
  winner,
  rounds,
  playerTeamIds,
  enemyTeamIds,
  session,
}: {
  winner: BattleWinner
  rounds: number
  playerTeamIds: string[]
  enemyTeamIds: string[]
  session: StagedBattleSession | null
}) {
  const activeSession = session ?? {
    mode: readSelectedMatchMode(),
    battleSeed: createBattleSeed(readSelectedMatchMode(), playerTeamIds),
    playerTeamIds,
    enemyTeamIds,
    opponentName: 'SPAR_PARTNER',
    opponentTitle: 'Quick Match',
    opponentRankLabel: null,
    opponentExperience: null,
    roomCode: null,
  }

  const completionId = buildCompletionId(activeSession.battleSeed, activeSession.mode)
  const lookup = findExistingResult(completionId)
  if (lookup.status === 'found') return lookup.result
  if (lookup.status === 'already-recorded') return readLastBattleResult()!

  const current = readBattleProfileStats()
  const won = winner === 'player'
  const draw = winner === 'draw'
  const isRanked = activeSession.mode === 'ranked'

  // Use opponent XP from session when available; otherwise seed a reasonable value
  // TODO: For online matches, opponent XP should come from the match row / RPC response
  const opponentExperience = activeSession.opponentExperience
    ?? current.experience // Treat unknown opponents as same-level

  const experienceDelta = isRanked && !draw
    ? calculateExperienceDelta({
        playerExperience: current.experience,
        opponentExperience,
        result: won ? 'win' : 'loss',
      })
    : 0

  const experienceBefore = current.experience
  const levelBefore = current.level
  const rankTitleBefore = current.rankTitle

  const experienceAfter = normalizeExperience(current.experience + experienceDelta)
  const levelAfter = getLevelForExperience(experienceAfter)
  const progress = getLevelProgress(experienceAfter)
  const peakExperience = Math.max(current.peakExperience, experienceAfter)
  const peakLevel = getLevelForExperience(peakExperience)
  const peakRankTitle = getLadderRankTitle({ level: peakLevel, ladderRank: null })
  const rankTitleAfter = getLadderRankTitle({ level: levelAfter, ladderRank: current.ladderRank ?? null })
  const levelShift = getLevelShift(levelBefore, levelAfter)

  const nextStats: BattleProfileStats = {
    ...current,
    wins: current.wins + (won ? 1 : 0),
    losses: current.losses + (!won && !draw ? 1 : 0),
    matchesPlayed: current.matchesPlayed + 1,
    currentStreak: won ? current.currentStreak + 1 : draw ? current.currentStreak : 0,
    bestStreak: won ? Math.max(current.bestStreak, current.currentStreak + 1) : current.bestStreak,
    experience: experienceAfter,
    level: levelAfter,
    rankTitle: rankTitleAfter,
    experienceToNextLevel: progress.nextLevelExperience,
    peakExperience,
    peakLevel,
    peakRankTitle,
  }

  const historyEntry: MatchHistoryEntry = {
    id: `match-${Date.now()}`,
    completionId,
    result: draw ? 'DRAW' : won ? 'WIN' : 'LOSS',
    mode: activeSession.mode,
    opponentName: activeSession.opponentName,
    opponentTitle: activeSession.opponentTitle,
    opponentRankLabel: activeSession.opponentRankLabel ?? null,
    yourTeam: playerTeamIds.slice(),
    theirTeam: enemyTeamIds.slice(),
    timestamp: Date.now(),
    rounds,
    experienceDelta,
    experienceBefore,
    experienceAfter,
    levelBefore,
    levelAfter,
    rankTitleBefore,
    rankTitleAfter,
    ladderRankBefore: current.ladderRank ?? null,
    ladderRankAfter: current.ladderRank ?? null,
    roomCode: activeSession.roomCode ?? null,
  }

  const history = normalizeHistory([historyEntry, ...readRecentMatchHistory()])
  const lastResult: LastBattleResult = {
    id: historyEntry.id,
    completionId,
    result: historyEntry.result,
    mode: historyEntry.mode,
    winner,
    rounds,
    opponentName: activeSession.opponentName,
    opponentTitle: activeSession.opponentTitle,
    opponentRankLabel: activeSession.opponentRankLabel ?? null,
    yourTeam: playerTeamIds.slice(),
    theirTeam: enemyTeamIds.slice(),
    experienceDelta,
    experienceBefore,
    experienceAfter,
    levelBefore,
    levelAfter,
    rankTitleBefore,
    rankTitleAfter,
    rankShift: levelShift,
    ladderRankBefore: current.ladderRank ?? null,
    ladderRankAfter: current.ladderRank ?? null,
    roomCode: activeSession.roomCode ?? null,
    timestamp: historyEntry.timestamp,
    profileSnapshot: nextStats,
    newlyUnlockedMissionIds: [],
    coinsEarned: 0,
    newlyCompletedQuestIds: [],
    streakBefore: current.currentStreak,
    matchesPlayedDelta: 1,
  }

  writeLocalStorage(battleProfileStatsKey, nextStats)
  writeLocalStorage(battleMatchHistoryKey, history)

  if (activeSession.mode !== 'practice') {
    const tracked = trackBattleCompleted(activeSession.mode, won)
    lastResult.coinsEarned = tracked.coinsEarned
    lastResult.newlyCompletedQuestIds = tracked.newlyCompletedQuestIds
    const { newlyCompletedIds, updatedProgress } = evaluateAndGetUnlockMissions({
      won,
      teamIds: playerTeamIds,
      experienceAfter: nextStats.experience,
      currentStreak: nextStats.currentStreak,
    })
    lastResult.newlyUnlockedMissionIds = newlyCompletedIds
    void saveAccountMissionProgress(updatedProgress)
  }

  writeLocalStorage(lastBattleResultKey, lastResult)

  // Fire-and-forget — localStorage is already updated; Supabase failure is silent
  void syncBattleProfileToSupabase(nextStats)
  void syncMatchHistoryEntryToSupabase(historyEntry)
  void syncLastBattleResultToSupabase(lastResult)

  return lastResult
}

/**
 * Record the outcome of a completed online match.
 * Unlike `recordCompletedBattle`, experience delta comes from the server RPC
 * rather than being computed locally.
 *
 * Local fallback for online results if the server result row cannot be loaded.
 * Normal logged-in online matches should use settle_match_experience and then
 * fetch the server-created match_history row for the current player.
 */
export function recordOnlineCompletedBattle({
  winner,
  rounds,
  playerTeamIds,
  enemyTeamIds,
  opponentName,
  mode,
  lpDelta: experienceDelta,
  lpBefore: experienceBefore,
  battleSeed,
}: {
  winner: BattleWinner
  rounds: number
  playerTeamIds: string[]
  enemyTeamIds: string[]
  opponentName: string
  mode: BattleMatchMode
  /** @deprecated Renamed to experienceDelta — treated as XP until RPC migration. */
  lpDelta: number
  /** @deprecated Renamed to experienceBefore — treated as XP until RPC migration. */
  lpBefore: number
  battleSeed: string
}): LastBattleResult {
  const completionId = buildCompletionId(battleSeed, mode)
  const lookup = findExistingResult(completionId)
  if (lookup.status === 'found') return lookup.result
  if (lookup.status === 'already-recorded') return readLastBattleResult()!

  const current = readBattleProfileStats()
  const won = winner === 'player'
  const draw = winner === 'draw'

  const levelBefore = getLevelForExperience(experienceBefore)
  const rankTitleBefore = getLadderRankTitle({ level: levelBefore, ladderRank: current.ladderRank ?? null })

  const experienceAfter = normalizeExperience(experienceBefore + experienceDelta)
  const levelAfter = getLevelForExperience(experienceAfter)
  const progress = getLevelProgress(experienceAfter)
  const peakExperience = Math.max(current.peakExperience, experienceAfter)
  const peakLevel = getLevelForExperience(peakExperience)
  const peakRankTitle = getLadderRankTitle({ level: peakLevel, ladderRank: null })
  const rankTitleAfter = getLadderRankTitle({ level: levelAfter, ladderRank: current.ladderRank ?? null })
  const levelShift = getLevelShift(levelBefore, levelAfter)

  const nextStats: BattleProfileStats = {
    ...current,
    wins: current.wins + (won ? 1 : 0),
    losses: current.losses + (!won && !draw ? 1 : 0),
    matchesPlayed: current.matchesPlayed + 1,
    currentStreak: won ? current.currentStreak + 1 : draw ? current.currentStreak : 0,
    bestStreak: won ? Math.max(current.bestStreak, current.currentStreak + 1) : current.bestStreak,
    experience: experienceAfter,
    level: levelAfter,
    rankTitle: rankTitleAfter,
    experienceToNextLevel: progress.nextLevelExperience,
    peakExperience,
    peakLevel,
    peakRankTitle,
  }

  const historyEntry: MatchHistoryEntry = {
    id: `match-online-${Date.now()}`,
    completionId,
    result: draw ? 'DRAW' : won ? 'WIN' : 'LOSS',
    mode,
    opponentName,
    opponentTitle: 'Online Match',
    yourTeam: playerTeamIds.slice(),
    theirTeam: enemyTeamIds.slice(),
    timestamp: Date.now(),
    rounds,
    experienceDelta,
    experienceBefore,
    experienceAfter,
    levelBefore,
    levelAfter,
    rankTitleBefore,
    rankTitleAfter,
    ladderRankBefore: current.ladderRank ?? null,
    ladderRankAfter: current.ladderRank ?? null,
  }

  const lastResult: LastBattleResult = {
    id: historyEntry.id,
    completionId,
    result: historyEntry.result,
    mode,
    winner,
    rounds,
    opponentName,
    opponentTitle: 'Online Match',
    yourTeam: playerTeamIds.slice(),
    theirTeam: enemyTeamIds.slice(),
    experienceDelta,
    experienceBefore,
    experienceAfter,
    levelBefore,
    levelAfter,
    rankTitleBefore,
    rankTitleAfter,
    rankShift: levelShift,
    ladderRankBefore: current.ladderRank ?? null,
    ladderRankAfter: current.ladderRank ?? null,
    timestamp: historyEntry.timestamp,
    profileSnapshot: nextStats,
    newlyUnlockedMissionIds: [],
    coinsEarned: 0,
    newlyCompletedQuestIds: [],
    streakBefore: current.currentStreak,
    matchesPlayedDelta: 1,
  }

  const history = normalizeHistory([historyEntry, ...readRecentMatchHistory()])
  writeLocalStorage(battleProfileStatsKey, nextStats)
  writeLocalStorage(battleMatchHistoryKey, history)

  if (mode !== 'practice') {
    const tracked = trackBattleCompleted(mode, won)
    lastResult.coinsEarned = tracked.coinsEarned
    lastResult.newlyCompletedQuestIds = tracked.newlyCompletedQuestIds
    const { newlyCompletedIds, updatedProgress } = evaluateAndGetUnlockMissions({
      won,
      teamIds: playerTeamIds,
      experienceAfter: nextStats.experience,
      currentStreak: nextStats.currentStreak,
    })
    lastResult.newlyUnlockedMissionIds = newlyCompletedIds
    void saveAccountMissionProgress(updatedProgress)
  }

  writeLocalStorage(lastBattleResultKey, lastResult)

  // Fire-and-forget — localStorage is already updated; Supabase failure is silent
  void syncBattleProfileToSupabase(nextStats)
  void syncMatchHistoryEntryToSupabase(historyEntry)
  void syncLastBattleResultToSupabase(lastResult)

  return lastResult
}
