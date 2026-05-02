/**
 * Supabase DB operations for multiplayer.
 *
 * All functions return { data, error } shaped results so callers can handle
 * failures without try/catch at every call site.
 */

import { getSupabaseClient } from '@/lib/supabase'
import type { BattleState, BattleTeamId, BattleTimelineStep, QueuedBattleAction } from '@/features/battle/types'
import type { BattleMatchMode, MatchHistoryEntry } from '@/features/battle/matches'
import type { SubmitMatchTurnRequest, SubmitMatchTurnResponse } from '@/features/multiplayer/protocol'
import type { MatchRow, QueueRow, MultiplayerRole } from '@/features/multiplayer/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function db() {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase is not configured')
  return client
}

// ── Matchmaking queue ─────────────────────────────────────────────────────────

export async function joinMatchmakingQueue({
  playerId,
  mode,
  teamIds,
  displayName,
  experience,
}: {
  playerId: string
  mode: BattleMatchMode
  teamIds: string[]
  displayName: string
  /** Player's total experience, used for matchmaking and XP delta calculations. */
  experience: number
}) {
  // TODO: Once migration 012 adds matchmaking_queue.experience, write to that column instead of lp.
  const { error } = await db()
    .from('matchmaking_queue')
    .upsert(
      { player_id: playerId, mode, team_ids: teamIds, display_name: displayName, lp: experience },
      { onConflict: 'player_id' },
    )

  return { error: error?.message ?? null }
}

export async function leaveMatchmakingQueue(playerId: string) {
  const { error } = await db()
    .from('matchmaking_queue')
    .delete()
    .eq('player_id', playerId)

  return { error: error?.message ?? null }
}

/**
 * Find the oldest other player in the queue for the same mode and pair them.
 * Returns the created match row if pairing succeeded, null if no opponent found.
 */
export async function findAndCreateQueuedMatch({
  playerId,
  mode,
  teamIds,
  displayName,
  buildInitialState,
  seed,
}: {
  playerId: string
  mode: BattleMatchMode
  teamIds: string[]
  displayName: string
  /** Called with (playerATeam, playerBTeam, seed) once an opponent is found. */
  buildInitialState: (playerATeam: string[], playerBTeam: string[], seed: string) => BattleState
  seed: string
}): Promise<{ data: MatchRow | null; error: string | null }> {
  const supabase = db()

  // Find oldest opponent in queue (not ourselves)
  const { data: opponents, error: qErr } = await supabase
    .from('matchmaking_queue')
    .select('*')
    .eq('mode', mode)
    .neq('player_id', playerId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (qErr) return { data: null, error: qErr.message }
  if (!opponents || opponents.length === 0) return { data: null, error: null }

  const opponent = opponents[0] as QueueRow
  const initialBattleState = buildInitialState(teamIds, opponent.team_ids, seed)

  // Create the match
  const { data: match, error: mErr } = await supabase
    .from('matches')
    .insert({
      mode,
      status: 'in_progress',
      seed,
      player_a_id: playerId,
      player_b_id: opponent.player_id,
      player_a_display_name: displayName,
      player_b_display_name: opponent.display_name,
      player_a_team: teamIds,
      player_b_team: opponent.team_ids,
      battle_state: initialBattleState,
      current_phase: initialBattleState.phase,
      current_round: initialBattleState.round,
      active_player: initialBattleState.activePlayer,
      winner: null,
    })
    .select()
    .single()

  if (mErr) return { data: null, error: mErr.message }

  // Remove both players from the queue
  await supabase
    .from('matchmaking_queue')
    .delete()
    .in('player_id', [playerId, opponent.player_id])

  return { data: match as MatchRow, error: null }
}

// ── Username lookup ────────────────────────────────────────────────────────────

export type ProfileSearchResult = {
  id: string
  display_name: string
}

/**
 * Search for players by display name (case-insensitive prefix match).
 * Requires the profiles table to have a read policy for authenticated users.
 */
export async function searchPlayersByName(
  query: string,
  excludeId?: string,
): Promise<{ data: ProfileSearchResult[]; error: string | null }> {
  if (!query.trim()) return { data: [], error: null }

  let req = db()
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', `%${query.trim()}%`)
    .limit(6)

  if (excludeId) req = req.neq('id', excludeId)

  const { data, error } = await req

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as ProfileSearchResult[], error: null }
}

// ── Private challenge (username-based) ────────────────────────────────────────

/**
 * Challenge a specific player by their user ID.
 * Creates a 'waiting' match with both player IDs set.
 * Player B receives a Realtime INSERT notification.
 */
export async function createChallenge({
  playerAId,
  playerADisplayName,
  playerBId,
  playerBDisplayName,
  teamIds,
  seed,
}: {
  playerAId: string
  playerADisplayName: string
  playerBId: string
  playerBDisplayName: string
  teamIds: string[]
  seed: string
}): Promise<{ data: MatchRow | null; error: string | null }> {
  const { data, error } = await db()
    .from('matches')
    .insert({
      mode: 'private',
      status: 'waiting',
      seed,
      player_a_id: playerAId,
      player_b_id: playerBId,
      player_a_display_name: playerADisplayName,
      player_b_display_name: playerBDisplayName,
      player_a_team: teamIds,
      player_b_team: [],
      battle_state: null,
      current_phase: 'coinFlip',
      current_round: 1,
      active_player: 'player',
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as MatchRow, error: null }
}

/**
 * Accept an incoming challenge.
 * Player B selects their team, builds the initial BattleState, and starts the match.
 */
export async function acceptChallenge({
  matchId,
  displayName,
  teamIds,
  buildInitialState,
}: {
  matchId: string
  displayName: string
  teamIds: string[]
  buildInitialState: (playerATeam: string[], playerBTeam: string[], seed: string) => BattleState
}): Promise<{ data: MatchRow | null; error: string | null }> {
  const supabase = db()

  const { data: existing, error: fetchErr } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .eq('status', 'waiting')
    .single()

  if (fetchErr || !existing) return { data: null, error: fetchErr?.message ?? 'Challenge not found or already started.' }
  const lobby = existing as MatchRow

  const initialState = buildInitialState(lobby.player_a_team, teamIds, lobby.seed)

  const { data: updated, error: updateErr } = await supabase
    .from('matches')
    .update({
      status: 'in_progress',
      player_b_display_name: displayName,
      player_b_team: teamIds,
      battle_state: initialState,
      current_phase: initialState.phase,
      current_round: initialState.round,
      active_player: initialState.activePlayer,
    })
    .eq('id', matchId)
    .select()
    .single()

  if (updateErr) return { data: null, error: updateErr.message }
  return { data: updated as MatchRow, error: null }
}

/**
 * Decline / cancel a pending challenge.
 */
export async function declineChallenge(matchId: string): Promise<{ error: string | null }> {
  const { error } = await db()
    .from('matches')
    .update({ status: 'abandoned' })
    .eq('id', matchId)
    .eq('status', 'waiting')

  return { error: error?.message ?? null }
}

// ── In-game state operations ──────────────────────────────────────────────────

export async function fetchMatch(matchId: string): Promise<{ data: MatchRow | null; error: string | null }> {
  const { data, error } = await db()
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as MatchRow, error: null }
}

/**
 * The active player writes their resolved BattleState after running the engine.
 */
export async function commitMatchState({
  matchId,
  newState,
  resolutionId,
  resolutionSteps,
}: {
  matchId: string
  newState: BattleState
  resolutionId?: string | null
  resolutionSteps?: BattleTimelineStep[] | null
}): Promise<{ error: string | null }> {
  const { error } = await db()
    .from('matches')
    .update({
      battle_state: newState,
      current_phase: newState.phase,
      current_round: newState.round,
      active_player: newState.activePlayer ?? 'player',
      winner: newState.winner ?? null,
      status: newState.phase === 'finished' ? 'finished' : 'in_progress',
      resolution_id: resolutionId ?? null,
      resolution_steps: resolutionSteps ?? null,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', matchId)

  return { error: error?.message ?? null }
}

/**
 * Record a player's raw commands (for audit / desync detection).
 * Called before running the engine, so there's a record even if the client crashes.
 */
export async function submitCommandRecord({
  matchId,
  playerId,
  submissionId,
  round,
  phase,
  commands,
  actionOrder,
  commandSource = 'client',
}: {
  matchId: string
  playerId: string
  submissionId: string
  round: number
  phase: 'firstPlayerCommand' | 'secondPlayerCommand'
  commands: Record<string, QueuedBattleAction>
  actionOrder?: string[] | null
  commandSource?: string
}): Promise<{ error: string | null }> {
  const { error } = await db()
    .from('match_commands')
    .upsert(
      {
        match_id: matchId,
        player_id: playerId,
        submission_id: submissionId,
        round,
        phase,
        commands,
        action_order: actionOrder ?? null,
        command_source: commandSource,
      },
      { onConflict: 'match_id,submission_id' },
    )

  return { error: error?.message ?? null }
}

export async function submitAuthoritativeMatchTurn(
  request: SubmitMatchTurnRequest,
): Promise<{ data: SubmitMatchTurnResponse | null; error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }

  const { data, error } = await client.functions.invoke<SubmitMatchTurnResponse>('submit-match-turn', {
    body: request,
  })

  if (error) return { data: null, error: error.message }
  return { data: data ?? null, error: null }
}

// ── Realtime subscriptions ────────────────────────────────────────────────────

/**
 * Subscribe to all UPDATE events on a match row.
 * Returns an unsubscribe function.
 */
export function subscribeToMatch(
  matchId: string,
  onUpdate: (row: MatchRow) => void,
): () => void {
  const supabase = db()

  const channel = supabase
    .channel(`match:${matchId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${matchId}`,
      },
      (payload) => {
        onUpdate(payload.new as MatchRow)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Subscribe to incoming challenges for a player.
 * Fires when a new 'waiting' match is created with this player as player_b.
 * Returns an unsubscribe function.
 */
export function subscribeToIncomingChallenges(
  playerId: string,
  onChallenge: (row: MatchRow) => void,
): () => void {
  const supabase = db()

  const channel = supabase
    .channel(`incoming-challenges:${playerId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'matches',
        filter: `player_b_id=eq.${playerId}`,
      },
      (payload) => {
        const row = payload.new as MatchRow
        if (row.status === 'waiting') {
          onChallenge(row)
        }
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/** Matches inactive longer than this are considered stale and will not block queueing. */
export const STALE_MATCH_CUTOFF_MS = 60 * 60 * 1000 // 60 minutes

/** ISO timestamp for the staleness cutoff relative to now. */
export function staleCutoffIso(nowMs = Date.now()): string {
  return new Date(nowMs - STALE_MATCH_CUTOFF_MS).toISOString()
}

/**
 * Look up any active match the current player is already in
 * (handles page refresh mid-game).
 * Only returns matches active within the last 60 minutes — stale
 * in_progress rows from crashed or abandoned sessions are ignored.
 */
export async function fetchActiveMatch(playerId: string): Promise<{ data: MatchRow | null; error: string | null }> {
  const { data, error } = await db()
    .from('matches')
    .select('*')
    .eq('status', 'in_progress')
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
    .gte('last_activity_at', staleCutoffIso())
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: data as MatchRow | null, error: null }
}

/**
 * Mark all stale in_progress matches involving this player as 'abandoned'.
 * Called before queueing so zombie matches cannot block new ladder games.
 * Sets no winner — abandoned matches do not trigger LP, missions, or profile updates.
 */
export async function abandonStaleMatches(playerId: string): Promise<{ error: string | null }> {
  const { error } = await db()
    .from('matches')
    .update({
      status: 'abandoned',
      last_activity_at: new Date().toISOString(),
    })
    .eq('status', 'in_progress')
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
    .lt('last_activity_at', staleCutoffIso())

  return { error: error?.message ?? null }
}

/**
 * Determine this player's role in a match row.
 */
export function getMyRole(match: MatchRow, playerId: string): MultiplayerRole | null {
  if (match.player_a_id === playerId) return 'a'
  if (match.player_b_id === playerId) return 'b'
  return null
}

/**
 * Surrender / abandon a match.
 */
export async function abandonMatch(matchId: string, losingTeam: BattleTeamId): Promise<{ error: string | null }> {
  const winner: BattleTeamId = losingTeam === 'player' ? 'enemy' : 'player'
  const { error } = await db()
    .from('matches')
    .update({ status: 'abandoned', winner })
    .eq('id', matchId)

  return { error: error?.message ?? null }
}

/**
 * Claim victory because the opponent appears to have disconnected.
 * Only updates matches still in_progress — safe to call speculatively.
 */
export async function claimVictoryDueToDisconnect(
  matchId: string,
  claimingRole: MultiplayerRole,
): Promise<{ error: string | null }> {
  // Canonical: role 'a' = 'player', role 'b' = 'enemy'
  const winner: BattleTeamId = claimingRole === 'a' ? 'player' : 'enemy'
  const { error } = await db()
    .from('matches')
    .update({ status: 'abandoned', winner, last_activity_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('status', 'in_progress')

  return { error: error?.message ?? null }
}

// ── Match history ─────────────────────────────────────────────────────────────

/**
 * Persist a completed match result to the server-side match_history table.
 * Fire-and-forget: callers don't need to await this for the game to continue.
 */
export async function saveMatchHistory(
  playerId: string,
  entry: MatchHistoryEntry,
): Promise<{ error: string | null }> {
  const { error } = await db()
    .from('match_history')
    .upsert(
      {
        id: entry.id,
        player_id: playerId,
        result: entry.result,
        mode: entry.mode,
        opponent_name: entry.opponentName,
        opponent_title: entry.opponentTitle,
        opponent_rank_label: entry.opponentRankLabel ?? null,
        your_team: entry.yourTeam,
        their_team: entry.theirTeam,
        rounds: entry.rounds,
        lp_delta: entry.experienceDelta,
        rank_before: entry.rankTitleBefore,
        rank_after: entry.rankTitleAfter,
        room_code: entry.roomCode ?? null,
        played_at: new Date(entry.timestamp).toISOString(),
      },
      { onConflict: 'id' },
    )

  return { error: error?.message ?? null }
}

/**
 * Fetch a player's recent match history from the server.
 * Returns null on error so the caller can fall back to localStorage.
 */
export async function fetchPlayerMatchHistory(
  playerId: string,
  limit = 20,
): Promise<{ data: MatchHistoryEntry[] | null; error: string | null }> {
  const { data, error } = await db()
    .from('match_history')
    .select('*')
    .eq('player_id', playerId)
    .order('played_at', { ascending: false })
    .limit(limit)

  if (error) return { data: null, error: error.message }

  const entries: MatchHistoryEntry[] = (data ?? []).map((row) => {
    const experienceDelta = typeof row.experience_delta === 'number'
      ? row.experience_delta
      : (row.lp_delta as number) ?? 0
    return {
      id: row.id as string,
      result: row.result as 'WIN' | 'LOSS',
      mode: row.mode as BattleMatchMode,
      opponentName: row.opponent_name as string,
      opponentTitle: row.opponent_title as string,
      opponentRankLabel: (row.opponent_rank_label as string | null) ?? null,
      yourTeam: row.your_team as string[],
      theirTeam: row.their_team as string[],
      timestamp: new Date(row.played_at as string).getTime(),
      rounds: row.rounds as number,
      experienceDelta,
      experienceBefore: 0,
      experienceAfter: 0,
      levelBefore: 0,
      levelAfter: 0,
      rankTitleBefore: (row.rank_before as string) ?? '',
      rankTitleAfter: (row.rank_after as string) ?? '',
      ladderRankBefore: null,
      ladderRankAfter: null,
      roomCode: (row.room_code as string | null) ?? null,
    }
  })

  return { data: entries, error: null }
}
