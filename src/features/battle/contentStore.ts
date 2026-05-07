import { useSyncExternalStore } from 'react'
import { getSupabaseClient } from '@/lib/supabase.ts'
import {
  CONTENT_SCHEMA_VERSION,
  createContentSnapshot,
  clearDraftBattleContent,
  isSnapshotCurrent,
  normalizeContentSnapshot,
  notifyBattleContentChanged,
  readDraftBattleContent,
  readPublishedBattleContentWithAssetMigration,
  savePublishedBattleContent,
  saveDraftBattleContent,
  subscribeToBattleContentChangeEvent,
  type BattleContentSnapshot,
  type BattleContentSetup,
} from '@/features/battle/contentSnapshot.ts'
import { buildPrepRosterEntries, type BattlePrepRosterEntry } from '@/features/battle/prep.ts'

const supabaseContentKey = 'published_roster'

export type PublishBattleContentResult = {
  snapshot: BattleContentSnapshot
  mode: 'local' | 'remote'
}
export {
  createContentSnapshot,
  clearDraftBattleContent,
  readDraftBattleContent,
  saveDraftBattleContent,
  savePublishedBattleContent,
  type BattleContentSnapshot,
  type BattleContentSetup,
}

// ---------------------------------------------------------------------------
// Runtime store
// ---------------------------------------------------------------------------

let currentContent: BattleContentSnapshot | null = null
const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) {
    listener()
  }
}

export function getCurrentBattleContent(): BattleContentSnapshot | null {
  return currentContent
}

export function subscribeToBattleContent(listener: () => void): () => void {
  listeners.add(listener)
  const unsubscribeStorage = subscribeToBattleContentChangeEvent(listener)
  return () => {
    listeners.delete(listener)
    unsubscribeStorage()
  }
}

/**
 * Persist a new published snapshot and broadcast the change to all subscribers
 * so React components re-render without a page reload.
 */
export function saveAndBroadcastPublishedBattleContent(
  snapshot: BattleContentSnapshot,
): BattleContentSnapshot {
  const saved = savePublishedBattleContent(snapshot)
  currentContent = saved
  notifyListeners()
  notifyBattleContentChanged()
  return saved
}

export function initBattleContentStore(authored: BattleContentSnapshot) {
  if (currentContent !== null) return
  currentContent = readPublishedBattleContentWithAssetMigration(authored)
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

export function useBattleContent(): BattleContentSnapshot | null {
  return useSyncExternalStore(subscribeToBattleContent, getCurrentBattleContent, () => null)
}

export function useBattleRoster(): BattlePrepRosterEntry[] {
  const content = useBattleContent()
  if (!content) return []
  return buildPrepRosterEntries(content.roster)
}

export function useBattleRosterById(): Record<string, BattlePrepRosterEntry> {
  const roster = useBattleRoster()
  return Object.fromEntries(roster.map((entry) => [entry.id, entry]))
}

// ---------------------------------------------------------------------------
// Helpers (re-exported for callers that used to import from here)
// ---------------------------------------------------------------------------

function clonePublishedSnapshot(snapshot: BattleContentSnapshot): BattleContentSnapshot {
  const normalized = normalizeContentSnapshot(snapshot) ?? snapshot

  return {
    roster: JSON.parse(JSON.stringify(normalized.roster)) as BattleContentSnapshot['roster'],
    defaultSetup: {
      playerTeamIds: normalized.defaultSetup.playerTeamIds.slice(),
      enemyTeamIds: normalized.defaultSetup.enemyTeamIds.slice(),
    },
    updatedAt: Date.now(),
    schemaVersion: CONTENT_SCHEMA_VERSION,
  }
}

/**
 * Publish content to Supabase so all users see it, then mirror the confirmed
 * snapshot into localStorage and broadcast to reactive subscribers.
 * When Supabase is unavailable, this falls back to a local-only publish.
 */
export async function publishBattleContent(snapshot: BattleContentSnapshot): Promise<PublishBattleContentResult> {
  const published = clonePublishedSnapshot(snapshot)
  const client = getSupabaseClient()

  if (!client) {
    return {
      snapshot: saveAndBroadcastPublishedBattleContent(published),
      mode: 'local',
    }
  }

  const { error } = await client
    .from('game_content')
    .upsert({ key: supabaseContentKey, content: published, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) {
    throw new Error(error.message)
  }

  const { data: confirmed, error: confirmError } = await client
    .from('game_content')
    .select('content')
    .eq('key', supabaseContentKey)
    .maybeSingle<{ content: BattleContentSnapshot }>()

  if (confirmError) {
    throw new Error(confirmError.message)
  }

  if (!confirmed?.content || typeof confirmed.content.updatedAt !== 'number') {
    throw new Error('Published content could not be verified after the write.')
  }

  return {
    snapshot: saveAndBroadcastPublishedBattleContent(confirmed.content),
    mode: 'remote',
  }
}

/**
 * Overwrite the Supabase row (and localStorage) with the given snapshot.
 * Used by "Revert Live" to ensure the remote copy is replaced, not just local storage.
 */
export async function resetPublishedBattleContent(snapshot: BattleContentSnapshot): Promise<BattleContentSnapshot> {
  clearDraftBattleContent()

  const client = getSupabaseClient()
  if (!client) {
    return saveAndBroadcastPublishedBattleContent(snapshot)
  }

  const published = { ...clonePublishedSnapshot(snapshot), updatedAt: Date.now() }
  const { error } = await client
    .from('game_content')
    .upsert({ key: supabaseContentKey, content: published, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) {
    throw new Error(error.message)
  }

  return saveAndBroadcastPublishedBattleContent(published)
}

/**
 * Fetch the latest published content from Supabase and update the reactive
 * store. Returns true if the local content was stale and got replaced.
 * No page reload needed — subscribers re-render reactively.
 */
export async function syncPublishedContentFromSupabase(fallback: BattleContentSnapshot): Promise<boolean> {
  initBattleContentStore(fallback)

  const client = getSupabaseClient()
  if (!client) return false

  try {
    const { data, error } = await client
      .from('game_content')
      .select('content, updated_at')
      .eq('key', supabaseContentKey)
      .maybeSingle<{ content: BattleContentSnapshot; updated_at: string }>()

    if (error || !data) return false

    const remote = normalizeContentSnapshot(data.content)
    if (!remote || typeof remote.updatedAt !== 'number') return false
    const remoteWasNormalized = JSON.stringify(remote) !== JSON.stringify(data.content)

    if (!isSnapshotCurrent(remote)) return false

    if (remoteWasNormalized) {
      await client
        .from('game_content')
        .upsert({ key: supabaseContentKey, content: remote, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }

    const local = currentContent ?? fallback
    const remoteIsNewer = remote.updatedAt > local.updatedAt
    const remoteDiffersFromLocal = JSON.stringify(remote) !== JSON.stringify(local)
    if (!remoteIsNewer && !remoteDiffersFromLocal) {
      if (remoteWasNormalized) saveAndBroadcastPublishedBattleContent(remote)
      return false
    }

    saveAndBroadcastPublishedBattleContent(remote)
    return true
  } catch {
    return false
  }
}
