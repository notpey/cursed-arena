/**
 * Supabase DB operations for the experience / ranking system.
 *
 * The visible LP system has been replaced with experience + level + rank titles.
 * `profiles.experience` is the canonical server stat. `profiles.lp` remains a
 * compatibility mirror for older migrations and views.
 */

import { getSupabaseClient } from '@/lib/supabase'
import {
  getLevelForExperience,
  getLevelProgress,
  getLadderRankTitle,
} from '@/features/ranking/ladder'
import { LADDER_TOP_RANK_LIMIT } from '@/features/ranking/ladder'

function db() {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase is not configured')
  return client
}

// ── settle_match_lp RPC (compatibility layer) ─────────────────────────────────

/**
 * @deprecated Type alias for the existing RPC result. The lp_* fields are
 * treated as experience values until `settle_match_experience` RPC is created.
 * TODO: Replace with ExperienceSettleResult once the RPC is migrated.
 */
export type LpSettleResult = {
  lp_gain: number
  lp_loss: number
  winner_lp: number | null
  loser_lp: number | null
  already_settled?: boolean
  error?: string
}

export type ExperienceSettleResult = {
  experience_gain: number
  experience_loss: number
  winner_experience: number | null
  loser_experience: number | null
  already_settled?: boolean
  error?: string
}

/** Normalized result after treating LP values as experience. */
export type LadderSettleResult = {
  experienceGain: number
  experienceLoss: number
  winnerExperience: number | null
  loserExperience: number | null
  already_settled?: boolean
  error?: string
}

/**
 * Call the canonical `settle_match_experience` Postgres function.
 */
export async function settleMatchExperience(
  matchId: string,
): Promise<{ data: LadderSettleResult | null; error: string | null }> {
  const { data, error } = await db().rpc('settle_match_experience', { p_match_id: matchId })
  if (error) return { data: null, error: error.message }

  const raw = data as ExperienceSettleResult
  return {
    data: {
      experienceGain: raw.experience_gain,
      experienceLoss: raw.experience_loss,
      winnerExperience: raw.winner_experience,
      loserExperience: raw.loser_experience,
      already_settled: raw.already_settled,
      error: raw.error,
    },
    error: null,
  }
}

/** @deprecated Use settleMatchExperience. */
export const settleMatchLp = settleMatchExperience

// ── Player rank profile ───────────────────────────────────────────────────────

export type PlayerRankProfile = {
  id: string
  display_name: string
  /** Total experience. */
  experience: number
  level: number
  rankTitle: string
  wins: number
  losses: number
  win_streak: number
  best_streak: number
  ladderRank?: number | null
}

/**
 * Fetch a single player's experience and match stats from the profiles table.
 */
export async function fetchPlayerRankProfile(
  userId: string,
): Promise<{ data: PlayerRankProfile | null; error: string | null }> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, display_name, experience, lp, wins, losses, win_streak, best_streak')
    .eq('id', userId)
    .single()

  if (error) return { data: null, error: error.message }

  const raw = data as { id: string; display_name: string; experience?: number | null; lp: number; wins: number; losses: number; win_streak: number; best_streak: number }
  const experience = raw.experience && raw.experience > 0 ? raw.experience : raw.lp
  const level = getLevelForExperience(experience)
  const rankTitle = getLadderRankTitle({ level, ladderRank: null })

  return {
    data: {
      id: raw.id,
      display_name: raw.display_name,
      experience,
      level,
      rankTitle,
      wins: raw.wins,
      losses: raw.losses,
      win_streak: raw.win_streak,
      best_streak: raw.best_streak,
    },
    error: null,
  }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  id: string
  display_name: string
  /** Total experience. */
  avatar_url?: string | null
  experience: number
  level: number
  rankTitle: string
  wins: number
  losses: number
  /** Position on the leaderboard (1-based). Only set when rank <= LADDER_TOP_RANK_LIMIT. */
  ladderRank: number | null
}

/**
 * Fetch the top players ordered by experience descending.
 * Computes ladderRank from array position.
 * Only assigns a ladderRank to entries within the top LADDER_TOP_RANK_LIMIT.
 *
 * TODO: Naruto-Arena updates ladder ranks every 15 minutes via a batch job.
 * If live calculation becomes expensive, add a scheduled function that writes
 * ladder_rank into the profiles table and query that instead.
 */
export async function fetchLeaderboard(
  limit = 20,
): Promise<{ data: LeaderboardEntry[]; error: string | null }> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, display_name, avatar_url, experience, lp, wins, losses, win_streak, best_streak')
    .order('experience', { ascending: false })
    .limit(limit)

  if (error) return { data: [], error: error.message }

  const entries: LeaderboardEntry[] = (data ?? []).map((row, index) => {
    const raw = row as { id: string; display_name: string; avatar_url?: string | null; experience?: number | null; lp: number; wins: number; losses: number; win_streak?: number; best_streak?: number }
    const experience = raw.experience && raw.experience > 0 ? raw.experience : raw.lp
    const ladderRank = index + 1 <= LADDER_TOP_RANK_LIMIT ? index + 1 : null
    const level = getLevelForExperience(experience)
    const rankTitle = getLadderRankTitle({ level, ladderRank })

    return {
      id: raw.id,
      display_name: raw.display_name,
      avatar_url: raw.avatar_url ?? null,
      experience,
      level,
      rankTitle,
      wins: raw.wins,
      losses: raw.losses,
      win_streak: raw.win_streak ?? 0,
      best_streak: raw.best_streak ?? 0,
      ladderRank,
    }
  })

  return { data: entries, error: null }
}

// ── Re-export helpers used by ProfilePage ─────────────────────────────────────

export { getLevelProgress }
