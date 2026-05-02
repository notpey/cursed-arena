import { describe, expect, it } from 'vitest'
import { isPlayableActiveMatch, queueStaleCutoffIso, QUEUE_STALE_MS } from '@/features/multiplayer/client'
import type { BattleState } from '@/features/battle/types'
import type { MatchRow } from '@/features/multiplayer/types'

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
