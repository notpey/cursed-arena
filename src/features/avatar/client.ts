// Image customization is URL-only. Supabase Storage uploads are disabled.
// To set an avatar, paste a direct image URL (e.g. an i.imgur.com link).
import { getSupabaseClient } from '@/lib/supabase'
import { validateImageUrl } from '@/features/images/imageUrl'

type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string
  hint?: string
}

export async function updatePlayerAvatarUrl(userId: string, avatarUrl: string | null): Promise<{ error: string | null }> {
  if (avatarUrl !== null) {
    const validation = validateImageUrl(avatarUrl, { allowEmpty: false })
    if (!validation.ok) return { error: validation.error }
  }

  const client = getSupabaseClient()
  if (!client) return { error: null }

  const now = new Date().toISOString()

  const update = await client
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: now })
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (update.error) {
    logAvatarError('profile_update', update.error, { table: 'profiles' })
    return { error: `Profile avatar update failed: ${formatAvatarError(update.error)}` }
  }

  if (update.data) return { error: null }

  // Row didn't exist yet — upsert
  const insert = await client
    .from('profiles')
    .upsert(
      {
        id: userId,
        display_name: `Player ${userId.replace(/-/g, '').slice(0, 4).toUpperCase()}`,
        avatar_url: avatarUrl,
        updated_at: now,
      },
      { onConflict: 'id' },
    )

  if (insert.error) {
    logAvatarError('profile_upsert', insert.error, { table: 'profiles' })
    return { error: `Profile avatar persistence failed: ${formatAvatarError(insert.error)}` }
  }

  return { error: null }
}

export async function removePlayerAvatar(userId: string): Promise<{ error: string | null }> {
  return updatePlayerAvatarUrl(userId, null)
}

function formatAvatarError(error: SupabaseErrorLike) {
  const message = error.message?.trim() ?? 'unknown error'
  const code = error.code ? ` (${error.code})` : ''
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
