import { defaultBattleSetup } from '@/features/battle/data'
import { createBattleSeed, pickSeededIndex } from '@/features/battle/random'
import type { BattleWinner } from '@/features/battle/types'
import { readPlayerProfile } from '@/features/player/store'
import { trackBattleCompleted } from '@/features/missions/store'
import { evaluateUnlockMissions } from '@/features/missions/unlocks'

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
export type BattleRankShift = 'promoted' | 'demoted' | 'steady'

export type BattleProfileStats = {
  playerName: string
  title: string
  playerId: string
  season: string
  rank: string
  peakRank: string
  lpCurrent: number
  lpToNext: number
  peakLp: number
  wins: number
  losses: number
  matchesPlayed: number
  currentStreak: number
  bestStreak: number
}

export type MatchHistoryEntry = {
  id: string
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
  lpDelta: number
  rankBefore: string
  rankAfter: string
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
  roomCode?: string | null
  practiceOptions?: PracticeOptions | null
}

export type LastBattleResult = {
  id: string
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
  lpDelta: number
  lpBefore: number
  lpAfter: number
  rankBefore: string
  rankAfter: string
  rankShift: BattleRankShift
  roomCode?: string | null
  timestamp: number
  profileSnapshot: BattleProfileStats
  newlyUnlockedMissionIds: string[]
}

type RankTier = {
  label: string
  min: number
  next?: number
}

type OpponentSeed = {
  opponentName: string
  opponentTitle: string
  enemyTeamIds: string[]
  opponentRankLabel?: string | null
  roomCode?: string | null
}

const rankTiers: RankTier[] = [
  { label: 'BRONZE III', min: 0, next: 400 },
  { label: 'BRONZE II', min: 400, next: 700 },
  { label: 'BRONZE I', min: 700, next: 1000 },
  { label: 'SILVER III', min: 1000, next: 1200 },
  { label: 'SILVER II', min: 1200, next: 1350 },
  { label: 'SILVER I', min: 1350, next: 1400 },
  { label: 'PLATINUM III', min: 1400, next: 1480 },
  { label: 'PLATINUM II', min: 1480, next: 1600 },
  { label: 'PLATINUM I', min: 1600, next: 1800 },
  { label: 'DIAMOND III', min: 1800, next: 2050 },
  { label: 'DIAMOND II', min: 2050, next: 2300 },
  { label: 'DIAMOND I', min: 2300 },
]

const rankedOpponentPool: OpponentSeed[] = [
  { opponentName: 'HEX_KING', opponentTitle: 'Ladder Hunter', opponentRankLabel: 'PLATINUM I', enemyTeamIds: ['yuji', 'nobara', 'megumi'] },
  { opponentName: 'DOMAINFRAME', opponentTitle: 'Barrier Technician', opponentRankLabel: 'PLATINUM II', enemyTeamIds: ['megumi', 'yuji', 'nobara'] },
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

export function getRankTier(lp: number) {
  return rankTiers.reduce((best, tier) => (lp >= tier.min ? tier : best), rankTiers[0])
}

function getRankTierIndex(label: string) {
  return Math.max(0, rankTiers.findIndex((tier) => tier.label === label))
}

function getRankShift(before: string, after: string): BattleRankShift {
  const beforeIndex = getRankTierIndex(before)
  const afterIndex = getRankTierIndex(after)

  if (afterIndex > beforeIndex) return 'promoted'
  if (afterIndex < beforeIndex) return 'demoted'
  return 'steady'
}

function createDefaultProfileStats(): BattleProfileStats {
  const tier = getRankTier(1480)
  const playerProfile = readPlayerProfile()

  return {
    playerName: playerProfile.displayName,
    title: playerProfile.title,
    playerId: playerProfile.playerId,
    season: 'SEASON 3',
    rank: tier.label,
    peakRank: 'DIAMOND I',
    lpCurrent: 1480,
    lpToNext: tier.next ?? 1480,
    peakLp: 2300,
    wins: 47,
    losses: 31,
    matchesPlayed: 78,
    currentStreak: 4,
    bestStreak: 11,
  }
}

function createDefaultHistorySeed(): MatchHistoryEntry[] {
  const now = Date.now()
  const hours = (count: number) => now - count * 60 * 60 * 1000
  const days = (count: number) => now - count * 24 * 60 * 60 * 1000

  return [
    {
      id: 'm1',
      result: 'WIN',
      mode: 'ranked',
      opponentName: 'HEX_KING',
      opponentTitle: 'Ladder Hunter',
      opponentRankLabel: 'PLATINUM I',
      yourTeam: ['yuji', 'nobara', 'megumi'],
      theirTeam: ['megumi', 'nobara', 'yuji'],
      timestamp: hours(2),
      rounds: 4,
      lpDelta: 24,
      rankBefore: 'PLATINUM III',
      rankAfter: 'PLATINUM II',
      roomCode: null,
    },
    {
      id: 'm2',
      result: 'LOSS',
      mode: 'ranked',
      opponentName: 'DOMAINFRAME',
      opponentTitle: 'Barrier Technician',
      opponentRankLabel: 'PLATINUM II',
      yourTeam: ['yuji', 'megumi', 'nobara'],
      theirTeam: ['nobara', 'yuji', 'megumi'],
      timestamp: hours(5),
      rounds: 5,
      lpDelta: -18,
      rankBefore: 'PLATINUM II',
      rankAfter: 'PLATINUM II',
      roomCode: null,
    },
    {
      id: 'm3',
      result: 'WIN',
      mode: 'quick',
      opponentName: 'VESSEL_17',
      opponentTitle: 'Open Lobby',
      yourTeam: ['yuji', 'nobara', 'megumi'],
      theirTeam: ['megumi', 'yuji', 'nobara'],
      timestamp: hours(9),
      rounds: 3,
      lpDelta: 0,
      rankBefore: 'PLATINUM II',
      rankAfter: 'PLATINUM II',
      roomCode: null,
    },
    {
      id: 'm4',
      result: 'WIN',
      mode: 'private',
      opponentName: 'SEALBREAKER',
      opponentTitle: 'Private Match',
      yourTeam: ['megumi', 'nobara', 'yuji'],
      theirTeam: ['yuji', 'megumi', 'nobara'],
      timestamp: days(1),
      rounds: 6,
      lpDelta: 0,
      rankBefore: 'PLATINUM II',
      rankAfter: 'PLATINUM II',
      roomCode: 'ROOM-188',
    },
    {
      id: 'm5',
      result: 'LOSS',
      mode: 'ranked',
      opponentName: 'MALVOLENT',
      opponentTitle: 'Ladder Hunter',
      opponentRankLabel: 'DIAMOND III',
      yourTeam: ['yuji', 'nobara', 'megumi'],
      theirTeam: ['megumi', 'yuji', 'nobara'],
      timestamp: days(1),
      rounds: 4,
      lpDelta: -18,
      rankBefore: 'PLATINUM II',
      rankAfter: 'PLATINUM III',
      roomCode: null,
    },
    {
      id: 'm6',
      result: 'WIN',
      mode: 'quick',
      opponentName: 'TOKYO_CURSE',
      opponentTitle: 'Quick Match',
      yourTeam: ['yuji', 'megumi', 'nobara'],
      theirTeam: ['nobara', 'megumi', 'yuji'],
      timestamp: days(2),
      rounds: 2,
      lpDelta: 0,
      rankBefore: 'PLATINUM III',
      rankAfter: 'PLATINUM III',
      roomCode: null,
    },
  ]
}

function normalizeHistoryEntry(entry: MatchHistoryEntry): MatchHistoryEntry {
  return {
    ...entry,
    rounds: entry.rounds ?? 0,
    lpDelta: entry.lpDelta ?? 0,
    rankBefore: entry.rankBefore ?? entry.rankAfter ?? 'PLACEMENT',
    rankAfter: entry.rankAfter ?? entry.rankBefore ?? 'PLACEMENT',
    roomCode: entry.roomCode ?? null,
  }
}

function normalizeHistory(entries: MatchHistoryEntry[]) {
  return [...entries]
    .map(normalizeHistoryEntry)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 20)
}

function normalizeLastResult(result: LastBattleResult | null) {
  if (!result) return null

  return {
    ...result,
    lpBefore: result.lpBefore ?? Math.max(0, (result.profileSnapshot?.lpCurrent ?? 0) - (result.lpDelta ?? 0)),
    lpAfter: result.lpAfter ?? result.profileSnapshot?.lpCurrent ?? 0,
    rankBefore: result.rankBefore ?? result.profileSnapshot?.rank ?? 'PLACEMENT',
    rankAfter: result.rankAfter ?? result.profileSnapshot?.rank ?? 'PLACEMENT',
    rankShift: result.rankShift ?? 'steady',
    roomCode: result.roomCode ?? null,
    newlyUnlockedMissionIds: result.newlyUnlockedMissionIds ?? [],
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

export function readBattleProfileStats() {
  const playerProfile = readPlayerProfile()
  const stored = readLocalStorage<BattleProfileStats>(battleProfileStatsKey, createDefaultProfileStats())

  return {
    ...stored,
    playerName: playerProfile.displayName,
    title: playerProfile.title,
    playerId: playerProfile.playerId,
  }
}

export function readRecentMatchHistory() {
  return normalizeHistory(readLocalStorage<MatchHistoryEntry[]>(battleMatchHistoryKey, createDefaultHistorySeed()))
}

export function readLastBattleResult() {
  return normalizeLastResult(readLocalStorage<LastBattleResult | null>(lastBattleResultKey, null))
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
  if (mode === 'ranked') return 'Ranked climb with LP gains and losses.'
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
 * Format: `battleSeed:mode:winner`
 */
export function buildCompletionId(battleSeed: string, mode: BattleMatchMode, winner: BattleWinner): string {
  return `${battleSeed}:${mode}:${winner}`
}

/**
 * Check whether a completion id has already been recorded in localStorage.
 * Returns the existing LastBattleResult if found, or null if this is new.
 */
function findExistingResult(completionId: string): LastBattleResult | null {
  const last = readLocalStorage<LastBattleResult | null>(lastBattleResultKey, null)
  if (last?.completionId === completionId) return normalizeLastResult(last)

  const history = readLocalStorage<MatchHistoryEntry[]>(battleMatchHistoryKey, [])
  const inHistory = history.some((e) => e.completionId === completionId)
  if (inHistory) return normalizeLastResult(last)

  return null
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
    roomCode: null,
  }

  const completionId = buildCompletionId(activeSession.battleSeed, activeSession.mode, winner)
  const existing = findExistingResult(completionId)
  if (existing) return existing

  const current = readBattleProfileStats()
  const won = winner === 'player'
  const draw = winner === 'draw'
  const lpDelta = activeSession.mode === 'ranked' && !draw ? (won ? 24 : -18) : 0
  const lpBefore = current.lpCurrent
  const rankBefore = current.rank
  const lpCurrent = Math.max(0, current.lpCurrent + lpDelta)
  const peakLp = Math.max(current.peakLp, lpCurrent)
  const rankTier = getRankTier(lpCurrent)
  const peakTier = getRankTier(peakLp)
  const nextStats: BattleProfileStats = {
    ...current,
    wins: current.wins + (won ? 1 : 0),
    losses: current.losses + (!won && !draw ? 1 : 0),
    matchesPlayed: current.matchesPlayed + 1,
    currentStreak: won ? current.currentStreak + 1 : draw ? current.currentStreak : 0,
    bestStreak: won ? Math.max(current.bestStreak, current.currentStreak + 1) : current.bestStreak,
    lpCurrent,
    lpToNext: rankTier.next ?? lpCurrent,
    rank: rankTier.label,
    peakLp,
    peakRank: peakTier.label,
  }
  const rankShift = getRankShift(rankBefore, nextStats.rank)

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
    lpDelta,
    rankBefore,
    rankAfter: nextStats.rank,
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
    lpDelta,
    lpBefore,
    lpAfter: nextStats.lpCurrent,
    rankBefore,
    rankAfter: nextStats.rank,
    rankShift,
    roomCode: activeSession.roomCode ?? null,
    timestamp: historyEntry.timestamp,
    profileSnapshot: nextStats,
    newlyUnlockedMissionIds: [],
  }

  writeLocalStorage(battleProfileStatsKey, nextStats)
  writeLocalStorage(battleMatchHistoryKey, history)

  if (activeSession.mode !== 'practice') {
    trackBattleCompleted(activeSession.mode, won)
    lastResult.newlyUnlockedMissionIds = evaluateUnlockMissions({
      won,
      teamIds: playerTeamIds,
      lpAfter: nextStats.lpCurrent,
      currentStreak: nextStats.currentStreak,
    })
  }

  writeLocalStorage(lastBattleResultKey, lastResult)

  return lastResult
}

/**
 * Record the outcome of a completed online match.
 * Unlike `recordCompletedBattle`, LP delta comes from the server RPC
 * rather than being computed locally.
 */
export function recordOnlineCompletedBattle({
  winner,
  rounds,
  playerTeamIds,
  enemyTeamIds,
  opponentName,
  mode,
  lpDelta,
  lpBefore,
  battleSeed,
}: {
  winner: BattleWinner
  rounds: number
  playerTeamIds: string[]
  enemyTeamIds: string[]
  opponentName: string
  mode: BattleMatchMode
  lpDelta: number
  lpBefore: number
  battleSeed?: string
}): LastBattleResult {
  const resolvedSeed = battleSeed ?? [mode, playerTeamIds.join('-'), enemyTeamIds.join('-'), opponentName].join(':')
  const completionId = buildCompletionId(resolvedSeed, mode, winner)
  const existing = findExistingResult(completionId)
  if (existing) return existing

  const current = readBattleProfileStats()
  const rankBefore = current.rank
  const won = winner === 'player'
  const draw = winner === 'draw'
  const lpCurrent = Math.max(0, lpBefore + lpDelta)
  const peakLp = Math.max(current.peakLp, lpCurrent)
  const rankTier = getRankTier(lpCurrent)
  const peakTier = getRankTier(peakLp)

  const nextStats: BattleProfileStats = {
    ...current,
    wins: current.wins + (won ? 1 : 0),
    losses: current.losses + (!won && !draw ? 1 : 0),
    matchesPlayed: current.matchesPlayed + 1,
    currentStreak: won ? current.currentStreak + 1 : draw ? current.currentStreak : 0,
    bestStreak: won ? Math.max(current.bestStreak, current.currentStreak + 1) : current.bestStreak,
    lpCurrent,
    lpToNext: rankTier.next ?? lpCurrent,
    rank: rankTier.label,
    peakLp,
    peakRank: peakTier.label,
  }

  const rankShift = getRankShift(rankBefore, nextStats.rank)

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
    lpDelta,
    rankBefore,
    rankAfter: nextStats.rank,
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
    lpDelta,
    lpBefore,
    lpAfter: nextStats.lpCurrent,
    rankBefore,
    rankAfter: nextStats.rank,
    rankShift,
    timestamp: historyEntry.timestamp,
    profileSnapshot: nextStats,
    newlyUnlockedMissionIds: [],
  }

  const history = normalizeHistory([historyEntry, ...readRecentMatchHistory()])
  writeLocalStorage(battleProfileStatsKey, nextStats)
  writeLocalStorage(battleMatchHistoryKey, history)

  if (mode !== 'practice') {
    trackBattleCompleted(mode, won)
    lastResult.newlyUnlockedMissionIds = evaluateUnlockMissions({
      won,
      teamIds: playerTeamIds,
      lpAfter: nextStats.lpCurrent,
      currentStreak: nextStats.currentStreak,
    })
  }

  writeLocalStorage(lastBattleResultKey, lastResult)

  return lastResult
}
