const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const

const UNSAFE_SCHEMES = ['javascript:', 'data:', 'blob:', 'file:']

const LOCAL_PATH_PREFIXES = [
  '/assets/',
  '/images/',
  '/portraits/',
  '/ability-icons/',
  '/passive-icons/',
  '/mission-icons/',
  '/status-icons/',
]

// Matches a URL pathname that ends with an image extension, optionally followed by a query string.
function hasImageExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase().split('?')[0]
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export type ImageUrlValidationResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Normalize a stored image value for display.
 * - Returns undefined for empty, unsafe, or legacy non-public Supabase Storage URLs.
 * - Rewrites legacy missing-/public/ Supabase paths to the correct public form.
 * - Returns valid URLs and local paths as-is.
 */
export function normalizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const src = value.trim()
  if (!src) return undefined

  // Reject unsafe schemes
  const lower = src.toLowerCase()
  if (UNSAFE_SCHEMES.some((s) => lower.startsWith(s))) return undefined

  // Rewrite legacy non-public Supabase Storage paths (missing /public/ segment)
  // e.g. /storage/v1/object/game-assets/... → /storage/v1/object/public/game-assets/...
  const legacyPattern = /\/storage\/v1\/object\/(?!public\/)([^/]+)\//
  if (legacyPattern.test(src)) {
    const fixed = src.replace(legacyPattern, '/storage/v1/object/public/$1/')
    if (import.meta.env?.DEV) {
      console.warn('[imageUrl] rewrote legacy Supabase URL', { from: src, to: fixed })
    }
    return fixed
  }

  // Allow local paths
  if (src.startsWith('/')) return src

  // Allow http/https URLs
  try {
    const u = new URL(src)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
    return src
  } catch {
    return undefined
  }
}

/**
 * Validate a user-supplied image URL string.
 * Does not make network requests — deterministic, synchronous.
 */
export function validateImageUrl(
  value: string,
  options: {
    allowEmpty?: boolean
    allowLocalPaths?: boolean
    allowSupabasePublicUrls?: boolean
  } = {},
): ImageUrlValidationResult {
  const { allowEmpty = false, allowLocalPaths = true, allowSupabasePublicUrls = true } = options

  const src = value.trim()

  if (!src) {
    if (allowEmpty) return { ok: true, url: '' }
    return { ok: false, error: 'Paste a direct image URL.' }
  }

  // Reject unsafe schemes
  const lower = src.toLowerCase()
  for (const scheme of UNSAFE_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return { ok: false, error: 'That URL type is not allowed. Paste a direct https:// image URL.' }
    }
  }

  // Reject legacy non-public Supabase Storage URLs
  const legacyStoragePattern = /\/storage\/v1\/object\/(?!public\/)([^/]+)\//
  if (legacyStoragePattern.test(src)) {
    return {
      ok: false,
      error: 'This is a non-public Supabase Storage URL. Paste a direct public image URL instead.',
    }
  }

  // Allow local/repo paths
  if (src.startsWith('/')) {
    if (!allowLocalPaths) {
      return { ok: false, error: 'Local paths are not allowed here. Paste a direct https:// image URL.' }
    }
    const isKnownLocalPath = LOCAL_PATH_PREFIXES.some((prefix) => src.startsWith(prefix))
    if (!isKnownLocalPath && !hasImageExtension(src)) {
      return { ok: false, error: 'That local path does not look like an image. Check the URL and try again.' }
    }
    return { ok: true, url: src }
  }

  // Must be http/https from here
  let u: URL
  try {
    u = new URL(src)
  } catch {
    return { ok: false, error: 'That does not look like a valid URL. Paste a direct https:// image URL.' }
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'Only https:// image URLs are accepted.' }
  }

  // Reject normal Imgur page/album/gallery links — give specific guidance
  if (u.hostname === 'imgur.com') {
    return {
      ok: false,
      error:
        'Use the direct image URL from Imgur, usually starting with https://i.imgur.com/ and ending in .png, .jpg, .gif, or .webp. Open the image itself, then copy its address.',
    }
  }

  // Allow valid Supabase public object URLs
  if (allowSupabasePublicUrls && u.pathname.includes('/storage/v1/object/public/')) {
    return { ok: true, url: src }
  }

  // Reject non-public Supabase object URLs that survived the earlier pattern check
  if (u.pathname.includes('/storage/v1/object/')) {
    return {
      ok: false,
      error: 'This is a non-public Supabase Storage URL. Paste a direct public image URL instead.',
    }
  }

  // Require an image extension
  if (!hasImageExtension(u.pathname)) {
    return {
      ok: false,
      error:
        'The URL does not end in a recognizable image extension (.png, .jpg, .jpeg, .webp, .gif). Paste a direct image URL.',
    }
  }

  return { ok: true, url: src }
}

/**
 * Returns true if the value is a direct image URL or local image path that can
 * be used in an <img> src without further validation.
 */
export function isDirectImageUrl(url: string): boolean {
  return validateImageUrl(url, { allowEmpty: false, allowLocalPaths: true, allowSupabasePublicUrls: true }).ok
}
