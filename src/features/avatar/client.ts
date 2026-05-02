import { buildAvatarStoragePath, validateAvatarFile, type AvatarUploadResult } from '@/features/avatar/validation'
import { getSupabaseClient } from '@/lib/supabase'

function localObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

export async function uploadPlayerAvatar(userId: string, file: File): Promise<{ data: AvatarUploadResult | null; error: string | null }> {
  const validation = validateAvatarFile(file)
  if (!validation.ok) return { data: null, error: validation.error }

  const path = buildAvatarStoragePath(userId, file)
  const client = getSupabaseClient()

  if (!client) {
    // TODO: Replace mock object URL with Supabase Storage bucket `player-avatars`.
    return { data: { url: localObjectUrl(file), path }, error: null }
  }

  const { error } = await client.storage.from('player-avatars').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  })
  if (error) {
    if (isMissingStorageBucketError(error.message)) {
      // TODO: Create Supabase Storage bucket `player-avatars`; this mock URL keeps avatar UI usable until then.
      return { data: { url: localObjectUrl(file), path: `mock:${path}` }, error: null }
    }

    return { data: null, error: error.message }
  }

  const { data } = client.storage.from('player-avatars').getPublicUrl(path)
  return { data: { url: data.publicUrl, path }, error: null }
}

export async function updatePlayerAvatarUrl(userId: string, avatarUrl: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { error: null }
  if (avatarUrl.startsWith('blob:')) return { error: null }

  // TODO: Add profiles.avatar_url migration/RLS in Supabase if not present.
  const { error } = await client.from('profiles').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', userId)
  return { error: error?.message ?? null }
}

export async function removePlayerAvatar(userId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { error: null }

  const { error } = await client.from('profiles').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('id', userId)
  return { error: error?.message ?? null }
}

function isMissingStorageBucketError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('bucket not found') || normalized.includes('storage bucket') || normalized.includes('bucket')
}
