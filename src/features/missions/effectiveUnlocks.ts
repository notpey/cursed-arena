/**
 * Authoritative unlock state that merges mission progress with admin overrides.
 *
 * Admin rules:
 *   granted=true  → character selectable even if mission not met
 *   granted=false → character blocked even if mission was completed
 *
 * Mission progress is now account-backed (see missionProgressStore.ts).
 * Pages pass the account-aware progress from useEffectiveMissionProgress.
 */

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import {
  STARTER_FIGHTER_IDS,
  UNLOCK_MISSION_DEFS,
} from '@/features/missions/unlocks'
import type { User } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type UnlockSource = 'starter' | 'mission' | 'admin-grant' | 'admin-revoke'

export type EffectiveUnlockState = {
  unlocked: boolean
  source: UnlockSource
}

/** Keyed by mission_id. Value is the granted column. */
export type AdminOverrideMap = Record<string, boolean>

// ── Pure helper ───────────────────────────────────────────────────────────────

/**
 * Derive the authoritative unlock state for every fighter in the roster.
 *
 * @param roster      - Array of fighter IDs to evaluate (typically the full roster).
 * @param playerUnlocks - localStorage-derived mission progress (from getAllUnlockMissionProgress).
 * @param adminOverrides - Map of mission_id → granted boolean from player_unlock_overrides.
 *
 * Priority: admin-grant / admin-revoke > starter > mission progress.
 */
export function getEffectiveCharacterUnlockState(
  roster: string[],
  playerUnlocks: Record<string, { completed: boolean }>,
  adminOverrides: AdminOverrideMap,
): Record<string, EffectiveUnlockState> {
  const missionByFighterId = new Map<string, string>()
  for (const def of UNLOCK_MISSION_DEFS) {
    missionByFighterId.set(def.reward.fighterId, def.id)
  }

  const result: Record<string, EffectiveUnlockState> = {}

  for (const fighterId of roster) {
    const missionId = missionByFighterId.get(fighterId)

    // Admin override takes precedence over everything.
    if (missionId !== undefined && missionId in adminOverrides) {
      const granted = adminOverrides[missionId]!
      result[fighterId] = {
        unlocked: granted,
        source: granted ? 'admin-grant' : 'admin-revoke',
      }
      continue
    }

    // Starters are always unlocked (unless explicitly admin-revoked above).
    if (STARTER_FIGHTER_IDS.includes(fighterId)) {
      result[fighterId] = { unlocked: true, source: 'starter' }
      continue
    }

    // Mission completion from localStorage.
    const missionProgress = missionId ? playerUnlocks[missionId] : undefined
    if (missionProgress?.completed) {
      result[fighterId] = { unlocked: true, source: 'mission' }
      continue
    }

    // Default locked.
    result[fighterId] = { unlocked: false, source: 'mission' }
  }

  return result
}

/** Build the effective unlock set from raw inputs — convenience wrapper. */
export function buildEffectiveUnlockedIds(
  roster: string[],
  playerUnlocks: Record<string, { completed: boolean }>,
  adminOverrides: AdminOverrideMap,
): Set<string> {
  const states = getEffectiveCharacterUnlockState(roster, playerUnlocks, adminOverrides)
  return new Set(Object.entries(states).filter(([, s]) => s.unlocked).map(([id]) => id))
}

// ── Supabase fetch ────────────────────────────────────────────────────────────

/**
 * Fetch admin overrides for the current authenticated user.
 * Returns an empty map when Supabase is unconfigured or the user is signed out.
 */
export async function fetchAdminUnlockOverrides(): Promise<AdminOverrideMap> {
  const client = getSupabaseClient()
  if (!client) return {}

  const { data, error } = await client
    .from('player_unlock_overrides')
    .select('mission_id, granted')

  if (error || !data) return {}

  const map: AdminOverrideMap = {}
  for (const row of data) {
    map[row.mission_id as string] = row.granted as boolean
  }
  return map
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Build the full effective unlock set for a roster.
 * @param missionProgress - account-aware progress from useEffectiveMissionProgress
 * @param adminOverrides  - from useAdminUnlockOverrides
 */
export function getEffectiveUnlockedSet(
  rosterIds: string[],
  missionProgress: Record<string, { completed: boolean }>,
  adminOverrides: AdminOverrideMap,
): Set<string> {
  return buildEffectiveUnlockedIds(rosterIds, missionProgress, adminOverrides)
}

/**
 * Fetch and subscribe to admin unlock overrides for the current user.
 * Returns {} before the fetch completes and whenever the user is signed out.
 */
export function useAdminUnlockOverrides(user: User | null): AdminOverrideMap {
  const [overrides, setOverrides] = useState<AdminOverrideMap>({})

  useEffect(() => {
    if (!user) {
      void Promise.resolve().then(() => setOverrides({}))
      return
    }
    fetchAdminUnlockOverrides().then(setOverrides)
  }, [user])

  return overrides
}
