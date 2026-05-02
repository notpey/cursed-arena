/**
 * Supabase persistence layer for battle data.
 *
 * All functions are async and safe to call without await — failures are
 * swallowed so the caller's localStorage path is never blocked.
 *
 * Required Supabase tables (see supabase/migrations/ for SQL):
 *
 *   player_battle_profiles
 *     player_id      uuid  references auth.users NOT NULL PRIMARY KEY
 *     experience     int   NOT NULL DEFAULT 0          ← new (migration 012)
 *     peak_experience int  NOT NULL DEFAULT 0          ← new (migration 012)
 *     lp_current     int   NOT NULL DEFAULT 0          ← legacy compat column
 *     peak_lp        int   NOT NULL DEFAULT 0          ← legacy compat column
 *     wins           int   NOT NULL DEFAULT 0
 *     losses         int   NOT NULL DEFAULT 0
 *     current_streak int   NOT NULL DEFAULT 0
 *     best_streak    int   NOT NULL DEFAULT 0
 *     matches_played int   NOT NULL DEFAULT 0
 *     updated_at     timestamptz NOT NULL DEFAULT now()
 *
 *   battle_match_history
 *     id               uuid  PRIMARY KEY DEFAULT gen_random_uuid()
 *     player_id        uuid  references auth.users NOT NULL
 *     completion_id    text  NOT NULL
 *     result           text  NOT NULL  -- 'WIN' | 'LOSS' | 'DRAW'
 *     mode             text  NOT NULL
 *     opponent_name    text  NOT NULL
 *     opponent_title   text  NOT NULL DEFAULT ''
 *     opponent_rank_label text
 *     your_team        text[] NOT NULL
 *     their_team       text[] NOT NULL
 *     experience_delta int   NOT NULL DEFAULT 0        ← new (migration 012)
 *     lp_delta         int   NOT NULL DEFAULT 0        ← legacy compat column
 *     rank_before      text  NOT NULL DEFAULT ''       ← legacy compat column
 *     rank_after       text  NOT NULL DEFAULT ''       ← legacy compat column
 *     rounds           int   NOT NULL DEFAULT 0
 *     room_code        text
 *     played_at        timestamptz NOT NULL DEFAULT now()
 *     UNIQUE(player_id, completion_id)  -- idempotency constraint
 *
 *   battle_last_results
 *     player_id             uuid  references auth.users NOT NULL PRIMARY KEY
 *     completion_id         text  NOT NULL
 *     result_json           jsonb NOT NULL  -- full LastBattleResult blob
 *     updated_at            timestamptz NOT NULL DEFAULT now()
 *
 * RLS: all three tables should have policies allowing authenticated users
 * to SELECT/INSERT/UPDATE their own rows (player_id = auth.uid()).
 */

import { getSupabaseClient } from '@/lib/supabase'
import { getLevelForExperience, getLadderRankTitle, getLevelProgress } from '@/features/ranking/ladder'
import type { BattleProfileStats, LastBattleResult, MatchHistoryEntry } from '@/features/battle/matches'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  const client = getSupabaseClient()
  if (!client) return null
  const { data } = await client.auth.getUser()
  return data.user?.id ?? null
}

function client() {
  return getSupabaseClient()
}

// ── Write: profile stats ──────────────────────────────────────────────────────

export async function syncBattleProfileToSupabase(stats: BattleProfileStats): Promise<void> {
  const db = client()
  if (!db) return

  const userId = await getCurrentUserId()
  if (!userId) return

  try {
    await db.from('player_battle_profiles').upsert(
      {
        player_id: userId,
        // New experience columns (migration 012). Also write lp_current/peak_lp as
        // compatibility fallback in case the migration hasn't run yet.
        // TODO: Remove lp_current and peak_lp writes once migration 012 is deployed everywhere.
        experience: stats.experience,
        peak_experience: stats.peakExperience,
        lp_current: stats.experience,
        peak_lp: stats.peakExperience,
        wins: stats.wins,
        losses: stats.losses,
        current_streak: stats.currentStreak,
        best_streak: stats.bestStreak,
        matches_played: stats.matchesPlayed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' },
    )
  } catch {
    // Swallow — localStorage is the source of truth when Supabase fails
  }
}

// ── Write: match history entry ────────────────────────────────────────────────

export async function syncMatchHistoryEntryToSupabase(entry: MatchHistoryEntry): Promise<void> {
  const db = client()
  if (!db) return

  const userId = await getCurrentUserId()
  if (!userId) return

  if (!entry.completionId) return

  try {
    // INSERT ... ON CONFLICT DO NOTHING — server enforces idempotency via unique constraint
    await db.from('battle_match_history').upsert(
      {
        player_id: userId,
        completion_id: entry.completionId,
        result: entry.result,
        mode: entry.mode,
        opponent_name: entry.opponentName,
        opponent_title: entry.opponentTitle ?? '',
        opponent_rank_label: entry.opponentRankLabel ?? null,
        your_team: entry.yourTeam,
        their_team: entry.theirTeam,
        // New experience column (migration 012). Also write lp_delta as compat fallback.
        // TODO: Remove lp_delta write once migration 012 is deployed everywhere.
        experience_delta: entry.experienceDelta,
        lp_delta: entry.experienceDelta,
        rank_before: entry.rankTitleBefore,
        rank_after: entry.rankTitleAfter,
        rounds: entry.rounds,
        room_code: entry.roomCode ?? null,
        played_at: new Date(entry.timestamp).toISOString(),
      },
      {
        onConflict: 'player_id,completion_id',
        ignoreDuplicates: true,
      },
    )
  } catch {
    // Swallow
  }
}

// ── Write: last battle result ─────────────────────────────────────────────────

export async function syncLastBattleResultToSupabase(result: LastBattleResult): Promise<void> {
  const db = client()
  if (!db) return

  const userId = await getCurrentUserId()
  if (!userId) return

  try {
    await db.from('battle_last_results').upsert(
      {
        player_id: userId,
        completion_id: result.completionId ?? result.id,
        result_json: result,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' },
    )
  } catch {
    // Swallow
  }
}

// ── Read: battle profile stats ────────────────────────────────────────────────

export async function readBattleProfileStatsFromSupabase(
  localFallback: BattleProfileStats,
): Promise<BattleProfileStats> {
  const db = client()
  if (!db) return localFallback

  const userId = await getCurrentUserId()
  if (!userId) return localFallback

  try {
    // Select both new and legacy columns; prefer experience when present.
    // TODO: Once migration 012 is fully deployed, drop lp_current/peak_lp from this select.
    const { data, error } = await db
      .from('player_battle_profiles')
      .select('experience, peak_experience, lp_current, peak_lp, wins, losses, current_streak, best_streak, matches_played')
      .eq('player_id', userId)
      .maybeSingle()

    if (error || !data) return localFallback

    // Prefer the new experience columns; fall back to lp_current if experience column
    // doesn't exist yet (will be null before migration 012 runs).
    const experience = typeof data.experience === 'number' ? data.experience
      : typeof data.lp_current === 'number' ? data.lp_current
      : localFallback.experience

    const peakExperience = typeof data.peak_experience === 'number' ? data.peak_experience
      : typeof data.peak_lp === 'number' ? data.peak_lp
      : localFallback.peakExperience

    const level = getLevelForExperience(experience)
    const progress = getLevelProgress(experience)
    const rankTitle = getLadderRankTitle({ level, ladderRank: localFallback.ladderRank ?? null })
    const peakLevel = getLevelForExperience(peakExperience)
    const peakRankTitle = getLadderRankTitle({ level: peakLevel, ladderRank: null })

    return {
      ...localFallback,
      experience,
      level,
      rankTitle,
      experienceToNextLevel: progress.nextLevelExperience,
      peakExperience,
      peakLevel,
      peakRankTitle,
      wins: data.wins as number,
      losses: data.losses as number,
      currentStreak: data.current_streak as number,
      bestStreak: data.best_streak as number,
      matchesPlayed: data.matches_played as number,
    }
  } catch {
    return localFallback
  }
}

// ── Freshness guard ───────────────────────────────────────────────────────────

/**
 * Returns true when local history is newer than the most recent remote row.
 * Used to prevent fire-and-forget sync lag from hiding a just-completed match.
 * Exported for unit testing without a live Supabase connection.
 */
export function localHistoryIsNewer(
  localFallback: MatchHistoryEntry[],
  remoteNewestPlayedAt: string,
): boolean {
  const localNewest = localFallback[0]?.timestamp ?? 0
  const remoteNewest = new Date(remoteNewestPlayedAt).getTime()
  return localNewest > remoteNewest
}

// ── Read: match history ───────────────────────────────────────────────────────

export async function readMatchHistoryFromSupabase(
  localFallback: MatchHistoryEntry[],
  limit = 20,
): Promise<MatchHistoryEntry[]> {
  const db = client()
  if (!db) return localFallback

  const userId = await getCurrentUserId()
  if (!userId) return localFallback

  try {
    const { data, error } = await db
      .from('battle_match_history')
      .select('*')
      .eq('player_id', userId)
      .order('played_at', { ascending: false })
      .limit(limit)

    if (error || !data || data.length === 0) return localFallback

    if (localHistoryIsNewer(localFallback, data[0].played_at as string)) return localFallback

    const entries: MatchHistoryEntry[] = data.map((row) => {
      // Prefer experience_delta; fall back to lp_delta for pre-migration rows.
      const experienceDelta = typeof row.experience_delta === 'number'
        ? row.experience_delta
        : (row.lp_delta as number) ?? 0

      return {
        id: row.id as string,
        completionId: row.completion_id as string,
        result: row.result as 'WIN' | 'LOSS' | 'DRAW',
        mode: row.mode as MatchHistoryEntry['mode'],
        opponentName: row.opponent_name as string,
        opponentTitle: row.opponent_title as string,
        opponentRankLabel: (row.opponent_rank_label as string | null) ?? null,
        yourTeam: row.your_team as string[],
        theirTeam: row.their_team as string[],
        timestamp: new Date(row.played_at as string).getTime(),
        rounds: row.rounds as number,
        experienceDelta,
        experienceBefore: 0, // Not stored in DB; client recomputes if needed
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

    return entries
  } catch {
    return localFallback
  }
}

// ── Read: last battle result ──────────────────────────────────────────────────

export async function readLastBattleResultFromSupabase(
  localFallback: LastBattleResult | null,
): Promise<LastBattleResult | null> {
  const db = client()
  if (!db) return localFallback

  const userId = await getCurrentUserId()
  if (!userId) return localFallback

  try {
    const { data, error } = await db
      .from('battle_last_results')
      .select('result_json')
      .eq('player_id', userId)
      .maybeSingle()

    if (error || !data) return localFallback

    return (data.result_json as LastBattleResult) ?? localFallback
  } catch {
    return localFallback
  }
}
