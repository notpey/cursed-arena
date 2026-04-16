import { getSupabaseClient } from '@/lib/supabase'
import type { BattleFighterTemplate } from '@/features/battle/types'

const draftContentKey = 'ca-battle-content-draft-v1'
const publishedContentKey = 'ca-battle-content-published-v1'
const supabaseContentKey = 'published_roster'

export type BattleContentSetup = {
  playerTeamIds: string[]
  enemyTeamIds: string[]
}

export type BattleContentSnapshot = {
  roster: BattleFighterTemplate[]
  defaultSetup: BattleContentSetup
  updatedAt: number
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function cloneSnapshot(snapshot: BattleContentSnapshot): BattleContentSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as BattleContentSnapshot
}

function readStorage(key: string): BattleContentSnapshot | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as BattleContentSnapshot
  } catch {
    return null
  }
}

function writeStorage(key: string, snapshot: BattleContentSnapshot) {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot))
  } catch {
    // Ignore storage write failures in local tool mode.
  }
}

export function createContentSnapshot(roster: BattleFighterTemplate[], defaultSetup: BattleContentSetup): BattleContentSnapshot {
  return {
    roster: JSON.parse(JSON.stringify(roster)) as BattleFighterTemplate[],
    defaultSetup: {
      playerTeamIds: defaultSetup.playerTeamIds.slice(),
      enemyTeamIds: defaultSetup.enemyTeamIds.slice(),
    },
    updatedAt: Date.now(),
  }
}

export function readDraftBattleContent(fallback: BattleContentSnapshot) {
  return cloneSnapshot(readStorage(draftContentKey) ?? fallback)
}

export function saveDraftBattleContent(snapshot: BattleContentSnapshot) {
  const next = { ...cloneSnapshot(snapshot), updatedAt: Date.now() }
  writeStorage(draftContentKey, next)
  return next
}

export function clearDraftBattleContent() {
  if (!canUseLocalStorage()) return
  window.localStorage.removeItem(draftContentKey)
}

export function readPublishedBattleContent(fallback: BattleContentSnapshot) {
  return cloneSnapshot(readStorage(publishedContentKey) ?? fallback)
}

/**
 * Publish content locally (localStorage) and to Supabase so all users see it.
 * The Supabase write is fire-and-forget from the caller's perspective — await it
 * if you need confirmation.
 */
export async function publishBattleContent(snapshot: BattleContentSnapshot): Promise<BattleContentSnapshot> {
  const next = { ...cloneSnapshot(snapshot), updatedAt: Date.now() }

  // Always persist locally first so the ACP stays responsive
  writeStorage(publishedContentKey, next)

  // Push to Supabase
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client
      .from('game_content')
      .upsert({ key: supabaseContentKey, content: next, updated_at: new Date().toISOString() }, { onConflict: 'key' })

    if (error) {
      console.warn('[contentStore] Failed to push published content to Supabase:', error.message)
    }
  }

  return next
}

export function clearPublishedBattleContent() {
  if (!canUseLocalStorage()) return
  window.localStorage.removeItem(publishedContentKey)
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

    const local = readStorage(publishedContentKey) ?? fallback
    if (remote.updatedAt <= local.updatedAt) return false

    // Remote is newer — update localStorage
    writeStorage(publishedContentKey, remote)
    return true
  } catch {
    return false
  }
}
