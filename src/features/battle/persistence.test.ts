import { beforeEach, describe, expect, test } from 'vitest'
import {
  localHistoryIsNewer,
  readBattleProfileStatsFromSupabase,
  readMatchHistoryFromSupabase,
  readLastBattleResultFromSupabase,
  syncBattleProfileToSupabase,
  syncMatchHistoryEntryToSupabase,
  syncLastBattleResultToSupabase,
} from '@/features/battle/persistence'
import type { BattleProfileStats, LastBattleResult, MatchHistoryEntry } from '@/features/battle/matches'

// ── localStorage stub (mirrors matches.test.ts setup) ────────────────────────

const store: Record<string, string> = {}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]

  const ls = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: ls }, writable: true, configurable: true })
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockStats: BattleProfileStats = {
  playerName: 'TESTER',
  title: 'DOMAIN MASTER',
  playerId: '#0001',
  season: 'SEASON 3',
  rank: 'PLATINUM II',
  peakRank: 'DIAMOND I',
  lpCurrent: 1500,
  lpToNext: 1600,
  peakLp: 2300,
  wins: 10,
  losses: 5,
  matchesPlayed: 15,
  currentStreak: 2,
  bestStreak: 7,
}

const mockEntry: MatchHistoryEntry = {
  id: 'test-entry-1',
  completionId: 'test-seed:quick',
  result: 'WIN',
  mode: 'quick',
  opponentName: 'SPAR_PARTNER',
  opponentTitle: 'Quick Match',
  opponentRankLabel: null,
  yourTeam: ['yuji', 'megumi', 'nobara'],
  theirTeam: ['yuji', 'megumi', 'nobara'],
  timestamp: Date.now(),
  rounds: 3,
  lpDelta: 0,
  rankBefore: 'PLATINUM II',
  rankAfter: 'PLATINUM II',
  roomCode: null,
}

const mockLastResult: LastBattleResult = {
  id: 'test-entry-1',
  completionId: 'test-seed:quick',
  result: 'WIN',
  mode: 'quick',
  winner: 'player',
  rounds: 3,
  opponentName: 'SPAR_PARTNER',
  opponentTitle: 'Quick Match',
  opponentRankLabel: null,
  yourTeam: ['yuji', 'megumi', 'nobara'],
  theirTeam: ['yuji', 'megumi', 'nobara'],
  lpDelta: 0,
  lpBefore: 1500,
  lpAfter: 1500,
  rankBefore: 'PLATINUM II',
  rankAfter: 'PLATINUM II',
  rankShift: 'steady',
  roomCode: null,
  timestamp: Date.now(),
  profileSnapshot: mockStats,
  newlyUnlockedMissionIds: [],
  coinsEarned: 0,
  newlyCompletedQuestIds: [],
  streakBefore: 1,
  matchesPlayedDelta: 1,
}

// ── Supabase not configured — fallback behavior ───────────────────────────────

describe('persistence — Supabase not configured (no env vars)', () => {
  test('readBattleProfileStatsFromSupabase returns local fallback', async () => {
    const result = await readBattleProfileStatsFromSupabase(mockStats)
    expect(result).toBe(mockStats)
  })

  test('readMatchHistoryFromSupabase returns local fallback', async () => {
    const result = await readMatchHistoryFromSupabase([mockEntry])
    expect(result).toEqual([mockEntry])
  })

  test('readLastBattleResultFromSupabase returns local fallback', async () => {
    const result = await readLastBattleResultFromSupabase(mockLastResult)
    expect(result).toBe(mockLastResult)
  })

  test('readLastBattleResultFromSupabase returns null fallback when no local result', async () => {
    const result = await readLastBattleResultFromSupabase(null)
    expect(result).toBeNull()
  })

  test('syncBattleProfileToSupabase resolves without throwing', async () => {
    await expect(syncBattleProfileToSupabase(mockStats)).resolves.toBeUndefined()
  })

  test('syncMatchHistoryEntryToSupabase resolves without throwing', async () => {
    await expect(syncMatchHistoryEntryToSupabase(mockEntry)).resolves.toBeUndefined()
  })

  test('syncLastBattleResultToSupabase resolves without throwing', async () => {
    await expect(syncLastBattleResultToSupabase(mockLastResult)).resolves.toBeUndefined()
  })

  test('sync functions are no-ops when completionId is missing', async () => {
    const entryWithoutId = { ...mockEntry, completionId: undefined }
    await expect(syncMatchHistoryEntryToSupabase(entryWithoutId)).resolves.toBeUndefined()
  })
})

// ── Local recording still works with Supabase sync wired in ──────────────────

describe('persistence — local recording unaffected by Supabase sync', () => {
  test('readBattleProfileStatsFromSupabase with empty fallback returns the empty fallback', async () => {
    const empty: BattleProfileStats = { ...mockStats, wins: 0, losses: 0, matchesPlayed: 0 }
    const result = await readBattleProfileStatsFromSupabase(empty)
    expect(result.wins).toBe(0)
    expect(result.matchesPlayed).toBe(0)
  })

  test('readMatchHistoryFromSupabase with empty fallback returns empty array', async () => {
    const result = await readMatchHistoryFromSupabase([])
    expect(result).toEqual([])
  })

  test('multiple sync calls do not throw', async () => {
    await syncBattleProfileToSupabase(mockStats)
    await syncBattleProfileToSupabase({ ...mockStats, wins: 11 })
    // No assertions needed — just verify no unhandled rejections
  })
})

// ── localHistoryIsNewer — freshness guard ─────────────────────────────────────

describe('localHistoryIsNewer', () => {
  const remoteTs = new Date('2025-01-01T12:00:00Z')
  const remoteIso = remoteTs.toISOString()
  const remoteMs = remoteTs.getTime()

  test('returns true when local newest is more recent than remote newest', () => {
    const localEntry = { ...mockEntry, timestamp: remoteMs + 5000 }
    expect(localHistoryIsNewer([localEntry], remoteIso)).toBe(true)
  })

  test('returns false when remote newest equals local newest', () => {
    const localEntry = { ...mockEntry, timestamp: remoteMs }
    expect(localHistoryIsNewer([localEntry], remoteIso)).toBe(false)
  })

  test('returns false when remote newest is more recent than local newest', () => {
    const localEntry = { ...mockEntry, timestamp: remoteMs - 5000 }
    expect(localHistoryIsNewer([localEntry], remoteIso)).toBe(false)
  })

  test('returns false when local history is empty (no local newest)', () => {
    expect(localHistoryIsNewer([], remoteIso)).toBe(false)
  })

  test('returns true when local has a match but remote iso is far in the past', () => {
    const localEntry = { ...mockEntry, timestamp: Date.now() }
    expect(localHistoryIsNewer([localEntry], new Date('2020-01-01').toISOString())).toBe(true)
  })
})
