/**
 * Supabase DB operations for the LP / ranking system.
 */

import { getSupabaseClient } from '@/lib/supabase'

function db() {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase is not configured')
  return client
}

// ── settle_match_lp RPC ───────────────────────────────────────────────────────

export type LpSettleResult = {
  /** LP awarded to the winner (0 for non-ranked matches). */
  lp_gain: number
  /** LP deducted from the loser (0 for non-ranked matches). */
  lp_loss: number
  /** Winner's new LP total (null for non-ranked). */
  winner_lp: number | null
  /** Loser's new LP total (null for non-ranked). */
  loser_lp: number | null
  /** True when this match was already settled by the other client. */
  already_settled?: boolean
  /** Set if an error occurred. */
  error?: string
}

/**
 * Call the `settle_match_lp` Postgres function to atomically award LP.
 * Idempotent — safe to call from both clients; the second call is a no-op.
 */
export async function settleMatchLp(
  matchId: string,
): Promise<{ data: LpSettleResult | null; error: string | null }> {
  const { data, error } = await db().rpc('settle_match_lp', { p_match_id: matchId })
  if (error) return { data: null, error: error.message }
  return { data: data as LpSettleResult, error: null }
}

// ── Player rank profile ───────────────────────────────────────────────────────

export type PlayerRankProfile = {
  id: string
  display_name: string
  lp: number
  wins: number
  losses: number
  win_streak: number
  best_streak: number
}

/**
 * Fetch a single player's LP and match stats from the profiles table.
 */
export async function fetchPlayerRankProfile(
  userId: string,
): Promise<{ data: PlayerRankProfile | null; error: string | null }> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, display_name, lp, wins, losses, win_streak, best_streak')
    .eq('id', userId)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as PlayerRankProfile, error: null }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  id: string
  display_name: string
  lp: number
  wins: number
  losses: number
}

/**
 * Fetch the top players ordered by LP descending.
 */
export async function fetchLeaderboard(
  limit = 20,
): Promise<{ data: LeaderboardEntry[]; error: string | null }> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, display_name, lp, wins, losses')
    .order('lp', { ascending: false })
    .limit(limit)

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as LeaderboardEntry[], error: null }
}
