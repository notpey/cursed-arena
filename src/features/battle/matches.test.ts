import { beforeEach, describe, expect, test } from 'vitest'
import {
  buildCompletionId,
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
    lpBefore: 1480,
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

  test('LP is applied exactly once on duplicate call', () => {
    recordOnlineCompletedBattle({
      winner: 'player',
      rounds: 3,
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['yuji', 'megumi', 'nobara'],
      opponentName: 'OPP',
      mode: 'ranked',
      lpDelta: 24,
      lpBefore: 1480,
      battleSeed: 'lp-seed',
    })
    const after1 = readBattleProfileStats()

    recordOnlineCompletedBattle({
      winner: 'player',
      rounds: 3,
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['yuji', 'megumi', 'nobara'],
      opponentName: 'OPP',
      mode: 'ranked',
      lpDelta: 24,
      lpBefore: 1480,
      battleSeed: 'lp-seed',
    })
    const after2 = readBattleProfileStats()

    expect(after2.lpCurrent).toBe(after1.lpCurrent)
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
