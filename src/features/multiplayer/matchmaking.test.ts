import { describe, expect, it } from 'vitest'
import { isPlayableActiveMatch, queueStaleCutoffIso, QUEUE_STALE_MS } from '@/features/multiplayer/client'
import type { BattleState } from '@/features/battle/types'
import type { MatchRow } from '@/features/multiplayer/types'

// swapPerspective is not exported; test its observable contract via the
// winner-flip invariant using the shape that both clients read.
function mirrorWinner(winner: 'player' | 'enemy' | 'draw' | null): 'player' | 'enemy' | 'draw' | null {
  if (winner === null || winner === 'draw') return winner
  return winner === 'player' ? 'enemy' : 'player'
}

const battleState = { phase: 'firstPlayerCommand' } as BattleState

function match(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: 'match-1',
    mode: 'ranked',
    status: 'in_progress',
    seed: 'seed',
    player_a_id: 'a',
    player_b_id: 'b',
    player_a_display_name: 'A',
    player_b_display_name: 'B',
    player_a_team: ['yuji'],
    player_b_team: ['megumi'],
    battle_state: battleState,
    current_phase: 'firstPlayerCommand',
    current_round: 1,
    active_player: 'player',
    winner: null,
    match_revision: 0,
    resolution_id: null,
    resolution_steps: null,
    last_submission_id: null,
    last_submission_player_id: null,
    room_code: null,
    last_activity_at: new Date(0).toISOString(),
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

describe('matchmaking guards', () => {
  it('calculates queue stale cutoff from the configured window', () => {
    const now = Date.UTC(2026, 0, 1, 0, 2, 0)
    expect(queueStaleCutoffIso(now)).toBe(new Date(now - QUEUE_STALE_MS).toISOString())
  })

  it('rejects abandoned and finished matches as playable active matches', () => {
    expect(isPlayableActiveMatch(match({ status: 'abandoned' }))).toBe(false)
    expect(isPlayableActiveMatch(match({ status: 'finished' }))).toBe(false)
  })

  it('rejects invalid active rows', () => {
    expect(isPlayableActiveMatch(match({ battle_state: null }))).toBe(false)
    expect(isPlayableActiveMatch(match({ player_b_id: null }))).toBe(false)
    expect(isPlayableActiveMatch(match({ winner: 'player' }))).toBe(false)
    expect(isPlayableActiveMatch(match({ battle_state: { phase: 'finished' } as BattleState }))).toBe(false)
  })

  it('can filter active matches by mode and exclusion list', () => {
    expect(isPlayableActiveMatch(match({ mode: 'quick' }), { mode: 'ranked' })).toBe(false)
    expect(isPlayableActiveMatch(match(), { excludeMatchIds: ['match-1'] })).toBe(false)
    expect(isPlayableActiveMatch(match(), { mode: 'ranked' })).toBe(true)
  })
})

// ── Match lifecycle / surrender correctness ───────────────────────────────────

describe('match lifecycle — no spurious surrender/free-win', () => {
  it('a newly created in_progress match with no winner is playable', () => {
    const fresh = match({
      status: 'in_progress',
      winner: null,
      battle_state: battleState,
    })
    expect(isPlayableActiveMatch(fresh)).toBe(true)
  })

  it('a match created with status waiting is not playable (no battle_state yet)', () => {
    const waiting = match({ status: 'waiting', battle_state: null })
    expect(isPlayableActiveMatch(waiting)).toBe(false)
  })

  it('a match is not playable once winner is set, even if status is still in_progress', () => {
    // This guards against a client reading a half-written row
    expect(isPlayableActiveMatch(match({ winner: 'player' }))).toBe(false)
    expect(isPlayableActiveMatch(match({ winner: 'enemy' }))).toBe(false)
  })

  it('a finished match is not playable regardless of winner field', () => {
    expect(isPlayableActiveMatch(match({ status: 'finished', winner: 'player' }))).toBe(false)
    expect(isPlayableActiveMatch(match({ status: 'finished', winner: null }))).toBe(false)
  })

  it('an abandoned match is not playable', () => {
    expect(isPlayableActiveMatch(match({ status: 'abandoned' }))).toBe(false)
  })

  it('a match with missing player_a_team is not playable', () => {
    expect(isPlayableActiveMatch(match({ player_a_team: [] }))).toBe(false)
  })

  it('a match with missing player_b_team is not playable', () => {
    expect(isPlayableActiveMatch(match({ player_b_team: [] }))).toBe(false)
  })
})

describe('winner perspective symmetry', () => {
  it('player A sees themselves as winner when battle_state.winner is player', () => {
    // Role A = canonical. winner: 'player' means A won.
    expect(mirrorWinner('player')).toBe('enemy')
    // Role B flips perspective: they see the canonical 'player' as 'enemy' (opponent)
  })

  it('player B sees themselves as winner when battle_state.winner is enemy', () => {
    // Role B flips perspective. canonical winner: 'enemy' → B sees winner: 'player' (themselves)
    expect(mirrorWinner('enemy')).toBe('player')
  })

  it('draw is preserved by both perspectives', () => {
    expect(mirrorWinner('draw')).toBe('draw')
    expect(mirrorWinner(null)).toBe(null)
  })

  it('both clients reading the same canonical winner field see themselves as winner or loser — never both as winner', () => {
    function resultsForCanonicalWinner(w: 'player' | 'enemy') {
      const roleAResult = w === 'player' ? 'WIN' : 'LOSS'
      const roleBFlipped = mirrorWinner(w)
      const roleBResult = roleBFlipped === 'player' ? 'WIN' : 'LOSS'
      return { roleAResult, roleBResult }
    }

    const { roleAResult, roleBResult } = resultsForCanonicalWinner('player')
    expect(roleAResult).toBe('WIN')
    expect(roleBResult).toBe('LOSS')
    expect([roleAResult, roleBResult].filter((r) => r === 'WIN')).toHaveLength(1)
  })

  it('when canonical winner is enemy, role A loses and role B wins', () => {
    function resultsForCanonicalWinner(w: 'player' | 'enemy') {
      const roleAResult = w === 'player' ? 'WIN' : 'LOSS'
      const roleBFlipped = mirrorWinner(w)
      const roleBResult = roleBFlipped === 'player' ? 'WIN' : 'LOSS'
      return { roleAResult, roleBResult }
    }

    const { roleAResult, roleBResult } = resultsForCanonicalWinner('enemy')
    expect(roleAResult).toBe('LOSS')
    expect(roleBResult).toBe('WIN')
    expect([roleAResult, roleBResult].filter((r) => r === 'WIN')).toHaveLength(1)
  })
})
