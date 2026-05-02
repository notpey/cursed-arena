import type { BattleState, BattleTeamId, BattleTimelineStep, BattleWinner, QueuedBattleAction } from '@/features/battle/types'
import type { BattleMatchMode } from '@/features/battle/matches'

// ── Roles ────────────────────────────────────────────────────────────────────
// 'a' = player_a in DB → 'player' team in canonical BattleState
// 'b' = player_b in DB → 'enemy'  team in canonical BattleState
export type MultiplayerRole = 'a' | 'b'

// Maps a role to its BattleTeamId in the canonical (server-stored) state.
export function roleToTeam(role: MultiplayerRole): BattleTeamId {
  return role === 'a' ? 'player' : 'enemy'
}

// ── DB row shapes (match what Supabase returns) ───────────────────────────────
export type MatchRow = {
  id: string
  mode: BattleMatchMode
  status: 'waiting' | 'in_progress' | 'finished' | 'abandoned'
  seed: string
  player_a_id: string
  player_b_id: string | null
  player_a_display_name: string
  player_b_display_name: string
  player_a_team: string[]
  player_b_team: string[]
  battle_state: BattleState | null
  current_phase: string
  current_round: number
  active_player: BattleTeamId
  winner: BattleWinner | null
  match_revision: number
  resolution_id: string | null
  resolution_steps: BattleTimelineStep[] | null
  last_submission_id: string | null
  last_submission_player_id: string | null
  room_code: string | null
  last_activity_at: string
  created_at: string
  updated_at: string
}

export type MultiplayerResolutionReplay = {
  id: string
  steps: BattleTimelineStep[]
  source: 'local' | 'remote'
}

export type MatchCommandRow = {
  id: string
  match_id: string
  player_id: string
  submission_id: string
  round: number
  phase: 'firstPlayerCommand' | 'secondPlayerCommand'
  // canonical perspective (a=player, b=enemy)
  commands: Record<string, QueuedBattleAction>
  action_order: string[] | null
  command_source: string
  created_at: string
}

export type QueueRow = {
  id: string
  player_id: string
  mode: BattleMatchMode
  team_ids: string[]
  display_name: string
  lp: number
  created_at: string
  updated_at?: string | null
}

// ── High-level match info used to initialise the battle hook ─────────────────
export type MultiplayerMatchInfo = {
  matchId: string
  myRole: MultiplayerRole
  opponentDisplayName: string
  mode: BattleMatchMode
  roomCode: string | null
}

// ── Status the hook exposes to the UI ────────────────────────────────────────
export type MultiplayerStatus =
  | 'loading'          // fetching initial match row
  | 'waiting_for_opponent' // we joined, waiting for player_b to fill
  | 'my_turn'          // it is this client's command phase
  | 'opponent_turn'    // watching opponent take their turn
  | 'finished'         // match over
  | 'abandoned'        // match was canceled/expired and must not be playable
  | 'error'            // unrecoverable

// ── Payload written to match_commands ────────────────────────────────────────
export type CommandPayload = {
  // canonical-perspective commands (a=player, b=enemy)
  commands: Record<string, QueuedBattleAction>
}
