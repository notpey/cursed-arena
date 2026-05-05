import { getSupabaseClient } from '@/lib/supabase.ts'
import {
  CONTENT_SCHEMA_VERSION,
  createContentSnapshot,
  clearDraftBattleContent,
  clearPublishedBattleContent,
  isSnapshotCurrent,
  normalizeContentSnapshot,
  readDraftBattleContent,
  readPublishedBattleContent,
  saveDraftBattleContent,
  savePublishedBattleContent,
  type BattleContentSnapshot,
  type BattleContentSetup,
} from '@/features/battle/contentSnapshot.ts'

const supabaseContentKey = 'published_roster'

export type PublishBattleContentResult = {
  snapshot: BattleContentSnapshot
  mode: 'local' | 'remote'
}
export {
  createContentSnapshot,
  clearDraftBattleContent,
  clearPublishedBattleContent,
  readDraftBattleContent,
  readPublishedBattleContent,
  saveDraftBattleContent,
  savePublishedBattleContent,
  type BattleContentSnapshot,
  type BattleContentSetup,
}

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
 * snapshot into localStorage. When Supabase is unavailable, this falls back to
 * a local-only publish.
 */
export async function publishBattleContent(snapshot: BattleContentSnapshot): Promise<PublishBattleContentResult> {
  const published = clonePublishedSnapshot(snapshot)
  const client = getSupabaseClient()

  if (!client) {
    return {
      snapshot: savePublishedBattleContent(published),
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
    snapshot: savePublishedBattleContent(confirmed.content),
    mode: 'remote',
  }
}

/**
 * Overwrite the Supabase row (and localStorage) with the given snapshot.
 * Used by "Revert Live" to ensure the remote copy is replaced, not just local storage.
 */
export async function resetPublishedBattleContent(snapshot: BattleContentSnapshot): Promise<void> {
  clearDraftBattleContent()
  clearPublishedBattleContent()

  const client = getSupabaseClient()
  if (!client) return

  const published = { ...clonePublishedSnapshot(snapshot), updatedAt: Date.now() }
  await client
    .from('game_content')
    .upsert({ key: supabaseContentKey, content: published, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/**
 * Fetch the latest published content from Supabase and update localStorage.
 * Returns true if the local content was stale and got replaced (caller should
 * reload the page so data.ts picks up the fresh snapshot).
 */
export async function syncPublishedContentFromSupabase(fallback: BattleContentSnapshot): Promise<boolean> {
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

    // Reject remote snapshots that don't carry the current schema version.
    // They were published from an older app build and would re-introduce the
    // stale roster the moment we wrote them to localStorage.
    if (!isSnapshotCurrent(remote)) return false

    if (remoteWasNormalized) {
      await client
        .from('game_content')
        .upsert({ key: supabaseContentKey, content: remote, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }

    const local = readPublishedBattleContent(fallback)
    const remoteIsNewer = remote.updatedAt > local.updatedAt
    const remoteDiffersFromLocal = JSON.stringify(remote) !== JSON.stringify(local)
    if (!remoteIsNewer && !remoteDiffersFromLocal) {
      if (remoteWasNormalized) savePublishedBattleContent(remote)
      return false
    }

    // Remote is newer — update localStorage
    savePublishedBattleContent(remote)
    return true
  } catch {
    return false
  }
}
