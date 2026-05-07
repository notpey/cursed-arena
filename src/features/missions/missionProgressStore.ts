/**
 * Account-backed mission progress store.
 *
 * Source-of-truth priority:
 *   signed in + Supabase configured → account progress (Supabase)
 *   signed out OR Supabase unconfigured → localStorage progress
 *
 * On sign-in the local and account progress are merged (take-highest per
 * mission). The merged result is saved back to both stores so they stay
 * in sync. Supabase failures are silent — localStorage remains the safe
 * fallback so the game never crashes.
 */

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase'
import {
  getAllUnlockMissionProgress,
  type UnlockMissionProgress,
} from '@/features/missions/unlocks'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MissionProgressMap = Record<string, UnlockMissionProgress>

// ── Merge logic ───────────────────────────────────────────────────────────────

/**
 * Merge two mission progress maps, taking the higher state per mission.
 * Completed always beats in-progress; higher numeric progress wins otherwise.
 * Pure function — no side effects.
 */
export function mergeLocalAndAccountMissionProgress(
  local: MissionProgressMap,
  account: MissionProgressMap,
): MissionProgressMap {
  const allIds = new Set([...Object.keys(local), ...Object.keys(account)])
  const result: MissionProgressMap = {}

  for (const id of allIds) {
    const l = local[id] ?? { progress: 0, completed: false }
    const a = account[id] ?? { progress: 0, completed: false }

    if (l.completed || a.completed) {
      result[id] = { progress: Math.max(l.progress, a.progress), completed: true }
    } else {
      result[id] = { progress: Math.max(l.progress, a.progress), completed: false }
    }
  }

  return result
}

// ── Supabase fetch ────────────────────────────────────────────────────────────

/**
 * Fetch mission progress rows for the current authenticated user.
 * Returns an empty map when Supabase is unconfigured or the user is signed out.
 */
export async function fetchAccountMissionProgress(): Promise<MissionProgressMap> {
  const client = getSupabaseClient()
  if (!client) return {}

  const { data, error } = await client
    .from('player_mission_progress')
    .select('mission_id, progress, completed')

  if (error || !data) return {}

  const map: MissionProgressMap = {}
  for (const row of data) {
    map[row.mission_id as string] = {
      progress: row.progress as number,
      completed: row.completed as boolean,
    }
  }
  return map
}

// ── Supabase write ────────────────────────────────────────────────────────────

/**
 * Upsert a set of mission progress rows for the current authenticated user.
 * Fire-and-forget safe — failures are swallowed.
 */
export async function saveAccountMissionProgress(
  progressMap: MissionProgressMap,
): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return

  const { data: userData } = await client.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return

  const rows = Object.entries(progressMap).map(([missionId, p]) => ({
    player_id: userId,
    mission_id: missionId,
    progress: p.progress,
    completed: p.completed,
    completed_at: p.completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length === 0) return

  try {
    await client
      .from('player_mission_progress')
      .upsert(rows, { onConflict: 'player_id,mission_id' })
  } catch {
    // Swallow — localStorage path is still valid
  }
}

/**
 * Upsert a single mission's progress to Supabase.
 * Fire-and-forget safe.
 */
export async function saveOneMissionProgress(
  missionId: string,
  progress: UnlockMissionProgress,
): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return

  const { data: userData } = await client.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return

  try {
    await client.from('player_mission_progress').upsert(
      {
        player_id: userId,
        mission_id: missionId,
        progress: progress.progress,
        completed: progress.completed,
        completed_at: progress.completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,mission_id' },
    )
  } catch {
    // Swallow
  }
}

// ── Sign-in merge ─────────────────────────────────────────────────────────────

/**
 * On sign-in: merge localStorage progress with account progress, save merged
 * result back to Supabase, and return the merged map.
 *
 * Called once per session when `user` becomes non-null.
 */
export async function mergeAndSyncOnSignIn(): Promise<MissionProgressMap> {
  const local = getAllUnlockMissionProgress()
  const account = await fetchAccountMissionProgress()
  const merged = mergeLocalAndAccountMissionProgress(local, account)

  const changedEntries = Object.entries(merged).filter(([id, m]) => {
    const a = account[id]
    return !a || a.progress !== m.progress || a.completed !== m.completed
  })

  if (changedEntries.length > 0) {
    void saveAccountMissionProgress(Object.fromEntries(changedEntries))
  }

  return merged
}

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * Returns the effective mission progress map for the current user:
 *   - signed in: fetches account progress, merges with localStorage, syncs back
 *   - signed out / unconfigured: returns localStorage progress
 *
 * Initial render always returns the fast localStorage snapshot so UI is
 * never blank while the fetch completes.
 */
export function useEffectiveMissionProgress(user: User | null): MissionProgressMap {
  const [progress, setProgress] = useState<MissionProgressMap>(
    () => getAllUnlockMissionProgress(),
  )

  useEffect(() => {
    if (!user) {
      void Promise.resolve().then(() => setProgress(getAllUnlockMissionProgress()))
      return
    }

    mergeAndSyncOnSignIn().then(setProgress)
  }, [user])

  return progress
}
