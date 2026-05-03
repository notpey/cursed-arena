import { buildAvatarStoragePath, validateAvatarFile, type AvatarUploadResult } from '@/features/avatar/validation'
import { getSupabaseClient } from '@/lib/supabase'

type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string
  hint?: string
}

function localObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

export async function uploadPlayerAvatar(userId: string, file: File): Promise<{ data: AvatarUploadResult | null; error: string | null }> {
  const validation = validateAvatarFile(file)
  if (!validation.ok) return { data: null, error: validation.error }

  const path = buildAvatarStoragePath(userId, file)
  const client = getSupabaseClient()

  if (!client) {
    // Local/dev fallback only. Logged-in Supabase mode must persist to Storage.
    return { data: { url: localObjectUrl(file), path }, error: null }
  }

  const { error } = await client.storage.from('player-avatars').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  })
  if (error) {
    logAvatarError('storage_upload', error, { bucket: 'player-avatars', path })
    if (isMissingStorageBucketError(error.message)) {
      return { data: null, error: 'Storage bucket player-avatars was not found. Run the avatar storage migration before uploading.' }
    }

    return { data: null, error: `Avatar upload failed: ${formatAvatarError(error, 'upload blocked')}` }
  }

  const { data } = client.storage.from('player-avatars').getPublicUrl(path)
  if (!data.publicUrl) {
    logAvatarError('public_url', { message: 'Storage returned an empty public URL.' }, { bucket: 'player-avatars', path })
    return { data: null, error: 'Avatar upload failed: storage did not return a public avatar URL.' }
  }

  const update = await updatePlayerAvatarUrl(userId, data.publicUrl)
  if (update.error) return { data: null, error: update.error }
  return { data: { url: data.publicUrl, path }, error: null }
}

export async function updatePlayerAvatarUrl(userId: string, avatarUrl: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { error: null }
  if (avatarUrl.startsWith('blob:')) return { error: 'Local preview URLs cannot be persisted as profile avatars.' }

  const now = new Date().toISOString()
  const update = await client
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: now })
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (update.error) {
    logAvatarError('profile_update', update.error, { table: 'profiles', columns: 'id, avatar_url, updated_at' })
    return { error: `Profile avatar update failed: ${formatAvatarError(update.error, 'profile update blocked')}` }
  }

  if (update.data) return { error: null }

  const insert = await client
    .from('profiles')
    .upsert({
      id: userId,
      display_name: `Player ${userId.replace(/-/g, '').slice(0, 4).toUpperCase()}`,
      avatar_url: avatarUrl,
      updated_at: now,
    }, { onConflict: 'id' })

  if (insert.error) {
    logAvatarError('profile_upsert', insert.error, { table: 'profiles', columns: 'id, display_name, avatar_url, updated_at' })
    return { error: `Profile avatar persistence failed: ${formatAvatarError(insert.error, 'profile schema or RLS mismatch')}` }
  }

  return { error: null }
}

export async function removePlayerAvatar(userId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { error: null }

  const { error } = await client.from('profiles').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('id', userId)
  if (error) {
    logAvatarError('profile_remove_avatar', error, { table: 'profiles', columns: 'id, avatar_url, updated_at' })
  }
  return { error: error ? `Profile avatar removal failed: ${formatAvatarError(error, 'profile update blocked')}` : null }
}

function isMissingStorageBucketError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('bucket not found') || normalized.includes('storage bucket') || normalized.includes('bucket')
}

function formatAvatarError(error: SupabaseErrorLike, fallback: string) {
  const message = error.message?.trim() || fallback
  const normalized = message.toLowerCase()
  const code = error.code ? ` (${error.code})` : ''

  if (normalized.includes('profiles') && normalized.includes('schema')) return `profiles schema mismatch${code}: ${message}`
  if (normalized.includes('avatar_url')) return `profiles.avatar_url column is missing or inaccessible${code}: ${message}`
  if (normalized.includes('updated_at')) return `profiles.updated_at column is missing or inaccessible${code}: ${message}`
  if (normalized.includes('relation') && normalized.includes('profiles')) return `profiles table is missing or inaccessible${code}: ${message}`
  if (normalized.includes('row-level security') || normalized.includes('permission denied') || normalized.includes('policy')) return `Supabase RLS blocked the avatar operation${code}: ${message}`
  if (isMissingStorageBucketError(message)) return `storage bucket player-avatars is missing${code}: ${message}`

  return `${message}${code}`
}

function logAvatarError(stage: string, error: SupabaseErrorLike, context: Record<string, string>) {
  if (typeof console === 'undefined') return
  console.error('[avatar]', stage, {
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    ...context,
  })
}
