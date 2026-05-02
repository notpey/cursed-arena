export type AvatarUploadResult = {
  url: string
  path: string
}

export const acceptedAvatarTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export type AvatarValidationResult = { ok: true } | { ok: false; error: string }

export function getAvatarFileExtension(file: File) {
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'bin'
}

export function validateAvatarFile(file: File): AvatarValidationResult {
  if (!acceptedAvatarTypes.includes(file.type as (typeof acceptedAvatarTypes)[number])) {
    return { ok: false, error: 'Upload a PNG, JPEG, WebP, or GIF avatar.' }
  }

  const maxBytes = file.type === 'image/gif' ? 5 * 1024 * 1024 : 2 * 1024 * 1024
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: file.type === 'image/gif' ? 'GIF avatars must be 5 MB or smaller.' : 'Avatars must be 2 MB or smaller.',
    }
  }

  return { ok: true }
}

export function buildAvatarStoragePath(ownerId: string, file: File) {
  const safeOwnerId = ownerId.replace(/[^a-zA-Z0-9-]/g, '')
  return `${safeOwnerId}/${Date.now()}.${getAvatarFileExtension(file)}`
}
