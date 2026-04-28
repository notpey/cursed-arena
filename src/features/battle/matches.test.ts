import { beforeEach, describe, expect, test } from 'vitest'
import {
  buildCompletionId,
  readBattleProfileStats,
  readLastBattleResult,
  readRecentMatchHistory,
  recordCompletedBattle,
} from '@/features/battle/matches'
import { getAllUnlockMissionProgress } from '@/features/missions/unlocks'

// ── localStorage stub ─────────────────────────────────────────────────────────
// vitest runs in jsdom/node; provide a minimal localStorage shim.

const store: Record<string, string> = {}

beforeEach(() => {
  // Clear the in-memory store before each test so tests are isolated.
  for (const key of Object.keys(store)) delete store[key]

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { for (const k of Object.keys(store)) delete store[k] },
    },
    writable: true,
    configurable: true,
  })

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: globalThis.localStorage },
    writable: true,
    configurable: true,
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(seed = 'test-seed') {
  return {
    mode: 'quick' as const,
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

function recordOnce(seed = 'test-seed') {
  return recordCompletedBattle({
    winner: 'player',
    rounds: 3,
    playerTeamIds: ['yuji', 'megumi', 'nobara'],
    enemyTeamIds: ['yuji', 'megumi', 'nobara'],
    session: makeSession(seed),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('match completion idempotency', () => {
  test('profile stats are incremented exactly once even if record is called twice', () => {
    const session = makeSession('seed-A')

    recordCompletedBattle({ winner: 'player', rounds: 3, playerTeamIds: ['yuji', 'megumi', 'nobara'], enemyTeamIds: ['yuji', 'megumi', 'nobara'], session })
    const afterFirst = readBattleProfileStats()

    // Call again with identical args (simulates remount / effect re-fire)
    recordCompletedBattle({ winner: 'player', rounds: 3, playerTeamIds: ['yuji', 'megumi', 'nobara'], enemyTeamIds: ['yuji', 'megumi', 'nobara'], session })
    const afterSecond = readBattleProfileStats()

    expect(afterSecond.wins).toBe(afterFirst.wins)
    expect(afterSecond.matchesPlayed).toBe(afterFirst.matchesPlayed)
    expect(afterSecond.currentStreak).toBe(afterFirst.currentStreak)
  })

  test('mission progress is incremented exactly once even if record is called twice', () => {
    const session = makeSession('seed-B')
    // The unlock-todo mission tracks wins with yuji
    const args = { winner: 'player' as const, rounds: 3, playerTeamIds: ['yuji', 'megumi', 'nobara'], enemyTeamIds: ['yuji', 'megumi', 'nobara'], session }

    recordCompletedBattle(args)
    const progressAfterFirst = getAllUnlockMissionProgress()['unlock-todo']?.progress ?? 0

    recordCompletedBattle(args)
    const progressAfterSecond = getAllUnlockMissionProgress()['unlock-todo']?.progress ?? 0

    expect(progressAfterSecond).toBe(progressAfterFirst)
  })

  test('match history has exactly one entry after duplicate record calls', () => {
    const session = makeSession('seed-C')
    const args = { winner: 'player' as const, rounds: 3, playerTeamIds: ['yuji', 'megumi', 'nobara'], enemyTeamIds: ['yuji', 'megumi', 'nobara'], session }

    recordCompletedBattle(args)
    const historyAfterFirst = readRecentMatchHistory()
    const completionId = buildCompletionId(session.battleSeed, session.mode, 'player')
    const matchingFirst = historyAfterFirst.filter((e) => e.completionId === completionId)
    expect(matchingFirst).toHaveLength(1)

    recordCompletedBattle(args)
    const historyAfterSecond = readRecentMatchHistory()
    const matchingSecond = historyAfterSecond.filter((e) => e.completionId === completionId)
    expect(matchingSecond).toHaveLength(1)
  })

  test('second call returns the same result object as the first', () => {
    const r1 = recordOnce('seed-D')
    const r2 = recordOnce('seed-D')
    expect(r2.id).toBe(r1.id)
    expect(r2.completionId).toBe(r1.completionId)
  })

  test('different battle seeds produce independent records', () => {
    recordOnce('seed-E1')
    recordOnce('seed-E2')
    const stats = readBattleProfileStats()
    // Two distinct matches: matchesPlayed should have incremented twice from seed stats
    const seedResult1 = readLastBattleResult()
    expect(seedResult1?.completionId).toBe(buildCompletionId('seed-E2', 'quick', 'player'))
    // History should contain two entries with distinct completionIds
    const history = readRecentMatchHistory()
    const cid1 = buildCompletionId('seed-E1', 'quick', 'player')
    const cid2 = buildCompletionId('seed-E2', 'quick', 'player')
    expect(history.some((e) => e.completionId === cid1)).toBe(true)
    expect(history.some((e) => e.completionId === cid2)).toBe(true)
    // Suppress unused-variable warning — we read stats to force a read but the real
    // assertion is the history check above.
    void stats
  })

  test('buildCompletionId is stable and order-independent of round count', () => {
    const id1 = buildCompletionId('my-seed', 'ranked', 'player')
    const id2 = buildCompletionId('my-seed', 'ranked', 'player')
    expect(id1).toBe(id2)
    expect(id1).toContain('my-seed')
    expect(id1).toContain('ranked')
    expect(id1).toContain('player')
  })
})
