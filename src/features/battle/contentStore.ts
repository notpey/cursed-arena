import { getSupabaseClient } from '@/lib/supabase.ts'
import {
  createContentSnapshot,
  clearDraftBattleContent,
  clearPublishedBattleContent,
  readDraftBattleContent,
  readPublishedBattleContent,
  saveDraftBattleContent,
  savePublishedBattleContent,
  type BattleContentSnapshot,
  type BattleContentSetup,
} from '@/features/battle/contentSnapshot.ts'

const supabaseContentKey = 'published_roster'
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

/**
 * Publish content locally (localStorage) and to Supabase so all users see it.
 * The Supabase write is fire-and-forget from the caller's perspective — await it
 * if you need confirmation.
 */
export async function publishBattleContent(snapshot: BattleContentSnapshot): Promise<BattleContentSnapshot> {
  const published = savePublishedBattleContent(snapshot)

  // Always persist locally first so the ACP stays responsive
  // Push to Supabase
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client
      .from('game_content')
      .upsert({ key: supabaseContentKey, content: published, updated_at: new Date().toISOString() }, { onConflict: 'key' })

    if (error) {
      console.warn('[contentStore] Failed to push published content to Supabase:', error.message)
    }
  }

  return published
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

    const remote = data.content
    if (!remote || typeof remote.updatedAt !== 'number') return false

    const local = readPublishedBattleContent(fallback)
    if (remote.updatedAt <= local.updatedAt) return false

    // Remote is newer — update localStorage
    savePublishedBattleContent(remote)
    return true
  } catch {
    return false
  }
}
