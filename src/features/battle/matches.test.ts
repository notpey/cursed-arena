import { beforeEach, describe, expect, test } from 'vitest'
import {
  buildCompletionId,
  cacheLastBattleResult,
  cacheMatchHistoryEntry,
  lastBattleResultFromHistoryEntry,
  readBattleProfileStats,
  readLastBattleResult,
  readRecentMatchHistory,
  recordCompletedBattle,
  recordOnlineCompletedBattle,
} from '@/features/battle/matches'
import { getAllUnlockMissionProgress } from '@/features/missions/unlocks'

// ── localStorage stub ─────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(seed = 'test-seed', mode: 'quick' | 'ranked' = 'quick') {
  return {
    mode,
    battleSeed: seed,
    playerTeamIds: ['yuji', 'megumi', 'nobara'],
    enemyTeamIds: ['yuji', 'megumi', 'nobara'],
    opponentName: 'SPAR_PARTNER',
    opponentTitle: 'Quick Match',
    opponentRankLabel: null,
    opponentExperience: null,
    roomCode: null,
    practiceOptions: null,
  }
}

function recordLocal(seed = 'test-seed', winner: 'player' | 'enemy' = 'player') {
  return recordCompletedBattle({
    winner,
    rounds: 3,
    playerTeamIds: ['yuji', 'megumi', 'nobara'],
    enemyTeamIds: ['yuji', 'megumi', 'nobara'],
    session: makeSession(seed),
  })
}

function recordOnline(seed = 'online-seed') {
  return recordOnlineCompletedBattle({
    winner: 'player',
    rounds: 3,
    playerTeamIds: ['yuji', 'megumi', 'nobara'],
    enemyTeamIds: ['yuji', 'megumi', 'nobara'],
    opponentName: 'OPPONENT',
    mode: 'quick',
    lpDelta: 0,
    lpBefore: 0,
    battleSeed: seed,
  })
}

// ── buildCompletionId ─────────────────────────────────────────────────────────

describe('buildCompletionId', () => {
  test('format is battleSeed:mode — winner is excluded', () => {
    const id = buildCompletionId('my-seed', 'ranked')
    expect(id).toBe('my-seed:ranked')
    expect(id).not.toContain('player')
    expect(id).not.toContain('enemy')
  })

  test('is stable across calls with same inputs', () => {
    expect(buildCompletionId('s', 'quick')).toBe(buildCompletionId('s', 'quick'))
  })

  test('differs by seed', () => {
    expect(buildCompletionId('seed-a', 'quick')).not.toBe(buildCompletionId('seed-b', 'quick'))
  })

  test('differs by mode', () => {
    expect(buildCompletionId('seed', 'ranked')).not.toBe(buildCompletionId('seed', 'quick'))
  })
})

describe('server-authoritative match history', () => {
  test('converts a server match_history row into the current player result shape', () => {
    const entry = {
      id: 'match-1:user-1',
      matchId: 'match-1',
      completionId: 'match-1',
      result: 'LOSS' as const,
      mode: 'ranked' as const,
      opponentName: 'WINNER',
      opponentTitle: 'Online Match',
      opponentRankLabel: null,
      yourTeam: ['yuji', 'megumi', 'nobara'],
      theirTeam: ['gojo', 'yuji', 'nobara'],
      timestamp: 1_700_000_000_000,
      rounds: 4,
      experienceDelta: -20,
      experienceBefore: 500,
      experienceAfter: 480,
      levelBefore: 3,
      levelAfter: 3,
      rankTitleBefore: 'Jujutsu Student',
      rankTitleAfter: 'Jujutsu Student',
      ladderRankBefore: null,
      ladderRankAfter: null,
      finishReason: 'surrender',
      roomCode: null,
    }

    const result = lastBattleResultFromHistoryEntry(entry)

    expect(result.matchId).toBe('match-1')
    expect(result.result).toBe('LOSS')
    expect(result.winner).toBe('enemy')
    expect(result.experienceDelta).toBe(-20)
    expect(result.finishReason).toBe('surrender')
  })

  test('server result cache is readable by the results page fallback APIs', () => {
    const entry = {
      id: 'match-2:user-1',
      matchId: 'match-2',
      completionId: 'match-2',
      result: 'WIN' as const,
      mode: 'ranked' as const,
      opponentName: 'LOSER',
      opponentTitle: 'Online Match',
      opponentRankLabel: null,
      yourTeam: ['yuji'],
      theirTeam: ['megumi'],
      timestamp: 1_700_000_000_001,
      rounds: 2,
      experienceDelta: 25,
      experienceBefore: 500,
      experienceAfter: 525,
      levelBefore: 3,
      levelAfter: 3,
      rankTitleBefore: 'Jujutsu Student',
      rankTitleAfter: 'Jujutsu Student',
      ladderRankBefore: null,
      ladderRankAfter: null,
      finishReason: 'ko',
      roomCode: null,
    }

    cacheMatchHistoryEntry(entry)
    cacheLastBattleResult(lastBattleResultFromHistoryEntry(entry))

    expect(readRecentMatchHistory()[0]?.matchId).toBe('match-2')
    expect(readLastBattleResult()?.matchId).toBe('match-2')
  })
})

// ── Local match idempotency ───────────────────────────────────────────────────

describe('recordCompletedBattle — idempotency', () => {
  test('profile stats increment exactly once on duplicate call', () => {
    const session = makeSession('seed-A')
    const args = { winner: 'player' as const, rounds: 3, playerTeamIds: ['yuji', 'megumi', 'nobara'], enemyTeamIds: ['yuji', 'megumi', 'nobara'], session }

    recordCompletedBattle(args)
    const after1 = readBattleProfileStats()

    recordCompletedBattle(args)
    const after2 = readBattleProfileStats()

    expect(after2.wins).toBe(after1.wins)
    expect(after2.matchesPlayed).toBe(after1.matchesPlayed)
    expect(after2.currentStreak).toBe(after1.currentStreak)
  })

  test('mission progress increments exactly once on duplicate call', () => {
    const session = makeSession('seed-B')
    const args = { winner: 'player' as const, rounds: 3, playerTeamIds: ['yuji', 'megumi', 'nobara'], enemyTeamIds: ['yuji', 'megumi', 'nobara'], session }

    recordCompletedBattle(args)
    const progress1 = getAllUnlockMissionProgress()['unlock-todo']?.progress ?? 0

    recordCompletedBattle(args)
    const progress2 = getAllUnlockMissionProgress()['unlock-todo']?.progress ?? 0

    expect(progress2).toBe(progress1)
  })

  test('history has exactly one entry for a duplicated call', () => {
    const session = makeSession('seed-C')
    const args = { winner: 'player' as const, rounds: 3, playerTeamIds: ['yuji', 'megumi', 'nobara'], enemyTeamIds: ['yuji', 'megumi', 'nobara'], session }
    const cid = buildCompletionId(session.battleSeed, session.mode)

    recordCompletedBattle(args)
    recordCompletedBattle(args)

    const matches = readRecentMatchHistory().filter((e) => e.completionId === cid)
    expect(matches).toHaveLength(1)
  })

  test('second call returns the same result as the first', () => {
    const r1 = recordLocal('seed-D')
    const r2 = recordLocal('seed-D')
    expect(r2.id).toBe(r1.id)
    expect(r2.completionId).toBe(r1.completionId)
  })

  test('different seeds produce independent records', () => {
    recordLocal('seed-E1')
    recordLocal('seed-E2')

    const history = readRecentMatchHistory()
    const cid1 = buildCompletionId('seed-E1', 'quick')
    const cid2 = buildCompletionId('seed-E2', 'quick')
    expect(history.some((e) => e.completionId === cid1)).toBe(true)
    expect(history.some((e) => e.completionId === cid2)).toBe(true)
  })

  test('winner is not part of completionId — same seed with different winner is same match', () => {
    // Record a win
    recordLocal('seed-F', 'player')
    const statsAfterWin = readBattleProfileStats()

    // Attempt to record the same session as a loss — should be blocked
    recordLocal('seed-F', 'enemy')
    const statsAfterSecond = readBattleProfileStats()

    expect(statsAfterSecond.matchesPlayed).toBe(statsAfterWin.matchesPlayed)
    expect(statsAfterSecond.losses).toBe(statsAfterWin.losses)
  })
})

// ── Cross-match history-branch bug ────────────────────────────────────────────

describe('recordCompletedBattle — cross-match history branch', () => {
  test('re-recording match A after match B does not overwrite B as lastBattleResult', () => {
    // Record match A
    recordLocal('seed-match-A')
    const cidA = buildCompletionId('seed-match-A', 'quick')

    // Record match B — this overwrites lastBattleResult
    recordLocal('seed-match-B')
    const resultB = readLastBattleResult()
    expect(resultB?.completionId).toBe(buildCompletionId('seed-match-B', 'quick'))

    // Attempt to re-record match A
    recordLocal('seed-match-A')

    // lastBattleResult must still be match B
    const lastAfter = readLastBattleResult()
    expect(lastAfter?.completionId).toBe(buildCompletionId('seed-match-B', 'quick'))

    // Match A still appears once in history
    const history = readRecentMatchHistory()
    expect(history.filter((e) => e.completionId === cidA)).toHaveLength(1)
  })

  test('stats are not incremented when re-recording match A after match B', () => {
    recordLocal('seed-G1')
    recordLocal('seed-G2')
    const statsBeforeRetry = readBattleProfileStats()

    recordLocal('seed-G1') // retry of first match
    const statsAfterRetry = readBattleProfileStats()

    expect(statsAfterRetry.matchesPlayed).toBe(statsBeforeRetry.matchesPlayed)
    expect(statsAfterRetry.wins).toBe(statsBeforeRetry.wins)
  })
})

// ── Online match idempotency ──────────────────────────────────────────────────

describe('recordOnlineCompletedBattle — idempotency', () => {
  test('profile stats increment exactly once on duplicate call', () => {
    recordOnline('online-seed-A')
    const after1 = readBattleProfileStats()

    recordOnline('online-seed-A')
    const after2 = readBattleProfileStats()

    expect(after2.matchesPlayed).toBe(after1.matchesPlayed)
    expect(after2.wins).toBe(after1.wins)
  })

  test('experience is applied exactly once on duplicate call', () => {
    recordOnlineCompletedBattle({
      winner: 'player',
      rounds: 3,
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['yuji', 'megumi', 'nobara'],
      opponentName: 'OPP',
      mode: 'ranked',
      lpDelta: 75,
      lpBefore: 0,
      battleSeed: 'xp-seed',
    })
    const after1 = readBattleProfileStats()

    recordOnlineCompletedBattle({
      winner: 'player',
      rounds: 3,
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['yuji', 'megumi', 'nobara'],
      opponentName: 'OPP',
      mode: 'ranked',
      lpDelta: 75,
      lpBefore: 0,
      battleSeed: 'xp-seed',
    })
    const after2 = readBattleProfileStats()

    expect(after2.experience).toBe(after1.experience)
    expect(after2.matchesPlayed).toBe(after1.matchesPlayed)
  })

  test('history has exactly one entry on duplicate online call', () => {
    recordOnline('online-seed-B')
    recordOnline('online-seed-B')

    const cid = buildCompletionId('online-seed-B', 'quick')
    const matches = readRecentMatchHistory().filter((e) => e.completionId === cid)
    expect(matches).toHaveLength(1)
  })

  test('different online seeds produce independent records', () => {
    recordOnline('online-seed-C1')
    recordOnline('online-seed-C2')

    const history = readRecentMatchHistory()
    expect(history.some((e) => e.completionId === buildCompletionId('online-seed-C1', 'quick'))).toBe(true)
    expect(history.some((e) => e.completionId === buildCompletionId('online-seed-C2', 'quick'))).toBe(true)
  })
})

// ── Experience fields on recorded result ──────────────────────────────────────

describe('recordCompletedBattle — experience fields', () => {
  test('ranked win result has positive experienceDelta', () => {
    const session = makeSession('xp-win-test', 'ranked')
    const result = recordCompletedBattle({
      winner: 'player',
      rounds: 3,
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['yuji', 'megumi', 'nobara'],
      session,
    })
    expect(result.experienceDelta).toBeGreaterThan(0)
  })

  test('ranked loss result has non-positive experienceDelta', () => {
    const session = makeSession('xp-loss-test', 'ranked')
    const result = recordCompletedBattle({
      winner: 'enemy',
      rounds: 3,
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['yuji', 'megumi', 'nobara'],
      session,
    })
    expect(result.experienceDelta).toBeLessThanOrEqual(0)
  })

  test('quick match has 0 experienceDelta', () => {
    const session = makeSession('xp-quick-test', 'quick')
    const result = recordCompletedBattle({
      winner: 'player',
      rounds: 3,
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['yuji', 'megumi', 'nobara'],
      session,
    })
    expect(result.experienceDelta).toBe(0)
  })

  test('result has levelBefore and levelAfter', () => {
    const result = recordLocal('xp-level-check')
    expect(typeof result.levelBefore).toBe('number')
    expect(typeof result.levelAfter).toBe('number')
    expect(result.levelBefore).toBeGreaterThanOrEqual(1)
    expect(result.levelAfter).toBeGreaterThanOrEqual(1)
  })

  test('profile snapshot has experience and rankTitle fields', () => {
    const result = recordLocal('xp-snapshot-check')
    expect(typeof result.profileSnapshot.experience).toBe('number')
    expect(typeof result.profileSnapshot.level).toBe('number')
    expect(typeof result.profileSnapshot.rankTitle).toBe('string')
    expect(result.profileSnapshot.rankTitle.length).toBeGreaterThan(0)
  })

  test('experienceAfter cannot go below 0', () => {
    // New player has 0 XP — a loss should not produce negative experienceAfter
    const session = makeSession('xp-floor-test', 'ranked')
    const result = recordCompletedBattle({
      winner: 'enemy',
      rounds: 3,
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['yuji', 'megumi', 'nobara'],
      session,
    })
    expect(result.experienceAfter).toBeGreaterThanOrEqual(0)
    expect(result.profileSnapshot.experience).toBeGreaterThanOrEqual(0)
  })
})

// ── Old localStorage LP data migration ───────────────────────────────────────

describe('old LP data migration', () => {
  test('existing localStorage with lpCurrent but no experience does not crash', () => {
    const legacyStats = {
      playerName: 'TEST',
      title: 'T',
      playerId: '#0001',
      season: 'SEASON 3',
      lpCurrent: 1480,
      lpToNext: 1600,
      peakLp: 2300,
      rank: 'PLATINUM II',
      peakRank: 'DIAMOND I',
      wins: 10,
      losses: 5,
      matchesPlayed: 15,
      currentStreak: 2,
      bestStreak: 7,
    }
    store['ca-battle-profile-stats-v1'] = JSON.stringify(legacyStats)

    // Should not throw, and should have experience mapped from lpCurrent
    const stats = readBattleProfileStats()
    expect(stats.experience).toBe(1480)
    expect(stats.level).toBeGreaterThanOrEqual(1)
    expect(typeof stats.rankTitle).toBe('string')
  })
})
