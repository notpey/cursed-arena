import { describe, it, expect } from 'vitest'
import { validateImageUrl, normalizeImageUrl, isDirectImageUrl } from './imageUrl'

const PROJECT = 'https://mzpfwxrdituexjpwqlqz.supabase.co'

describe('validateImageUrl', () => {
  describe('accepted URLs', () => {
    it('accepts direct imgur image URLs', () => {
      expect(validateImageUrl('https://i.imgur.com/example.png').ok).toBe(true)
      expect(validateImageUrl('https://i.imgur.com/example.jpg').ok).toBe(true)
      expect(validateImageUrl('https://i.imgur.com/example.jpeg').ok).toBe(true)
      expect(validateImageUrl('https://i.imgur.com/example.gif').ok).toBe(true)
      expect(validateImageUrl('https://i.imgur.com/example.webp').ok).toBe(true)
    })

    it('accepts direct image URLs with query strings', () => {
      expect(validateImageUrl('https://example.com/path/image.png?width=100').ok).toBe(true)
      expect(validateImageUrl('https://example.com/path/image.webp?v=2').ok).toBe(true)
    })

    it('accepts known local asset paths', () => {
      expect(validateImageUrl('/assets/portraits/yuji.png').ok).toBe(true)
      expect(validateImageUrl('/portraits/yuji.png').ok).toBe(true)
      expect(validateImageUrl('/ability-icons/yuji-punch.png').ok).toBe(true)
      expect(validateImageUrl('/images/bg.jpg').ok).toBe(true)
      expect(validateImageUrl('/mission-icons/storm.png').ok).toBe(true)
    })

    it('accepts valid public Supabase object URLs', () => {
      expect(validateImageUrl(`${PROJECT}/storage/v1/object/public/game-assets/portraits/yuji.png`).ok).toBe(true)
    })

    it('returns the normalized url in ok result', () => {
      const result = validateImageUrl('https://i.imgur.com/abc.png')
      expect(result).toEqual({ ok: true, url: 'https://i.imgur.com/abc.png' })
    })

    it('accepts empty string when allowEmpty is true', () => {
      expect(validateImageUrl('', { allowEmpty: true }).ok).toBe(true)
    })
  })

  describe('rejected URLs', () => {
    it('rejects normal imgur page links', () => {
      const r = validateImageUrl('https://imgur.com/example')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/i\.imgur\.com/)
    })

    it('rejects imgur album links', () => {
      expect(validateImageUrl('https://imgur.com/a/example').ok).toBe(false)
    })

    it('rejects imgur gallery links', () => {
      expect(validateImageUrl('https://imgur.com/gallery/example').ok).toBe(false)
    })

    it('rejects legacy non-public Supabase storage URLs', () => {
      expect(validateImageUrl('/storage/v1/object/game-assets/portraits/yuji.png').ok).toBe(false)
      expect(validateImageUrl(`${PROJECT}/storage/v1/object/game-assets/portraits/yuji.png`).ok).toBe(false)
      expect(validateImageUrl('/storage/v1/object/player-avatars/user/abc.png').ok).toBe(false)
      expect(validateImageUrl('/storage/v1/object/clan-avatars/clan/abc.png').ok).toBe(false)
    })

    it('rejects blob: URLs', () => {
      expect(validateImageUrl('blob:http://localhost/abc').ok).toBe(false)
    })

    it('rejects data: URLs', () => {
      expect(validateImageUrl('data:image/png;base64,abc').ok).toBe(false)
    })

    it('rejects javascript: URLs', () => {
      expect(validateImageUrl('javascript:alert(1)').ok).toBe(false)
    })

    it('rejects file: URLs', () => {
      expect(validateImageUrl('file:///Users/test/image.png').ok).toBe(false)
    })

    it('rejects obvious non-image URLs (no image extension)', () => {
      expect(validateImageUrl('https://example.com/not-an-image-page').ok).toBe(false)
      expect(validateImageUrl('https://example.com').ok).toBe(false)
    })

    it('rejects PDF and other non-image file URLs', () => {
      expect(validateImageUrl('https://example.com/file.pdf').ok).toBe(false)
    })

    it('rejects empty string when allowEmpty is false', () => {
      expect(validateImageUrl('').ok).toBe(false)
      expect(validateImageUrl('   ').ok).toBe(false)
    })
  })

  describe('error messages', () => {
    it('gives imgur-specific guidance for imgur page links', () => {
      const r = validateImageUrl('https://imgur.com/abc')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain('i.imgur.com')
    })

    it('gives Supabase-specific guidance for non-public storage URLs', () => {
      const r = validateImageUrl(`${PROJECT}/storage/v1/object/game-assets/portraits/yuji.png`)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/non-public Supabase/i)
    })
  })
})

describe('normalizeImageUrl', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(normalizeImageUrl('')).toBeUndefined()
    expect(normalizeImageUrl(null)).toBeUndefined()
    expect(normalizeImageUrl(undefined)).toBeUndefined()
    expect(normalizeImageUrl(42)).toBeUndefined()
  })

  it('returns undefined for unsafe schemes', () => {
    expect(normalizeImageUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeImageUrl('data:image/png;base64,abc')).toBeUndefined()
    expect(normalizeImageUrl('blob:http://localhost/abc')).toBeUndefined()
    expect(normalizeImageUrl('file:///image.png')).toBeUndefined()
  })

  it('rewrites legacy non-public Supabase URLs to public form', () => {
    expect(normalizeImageUrl('/storage/v1/object/game-assets/portraits/yuji.png')).toBe(
      '/storage/v1/object/public/game-assets/portraits/yuji.png',
    )
    expect(
      normalizeImageUrl(`${PROJECT}/storage/v1/object/player-avatars/user/abc.png`),
    ).toBe(`${PROJECT}/storage/v1/object/public/player-avatars/user/abc.png`)
  })

  it('returns valid public Supabase URLs as-is', () => {
    const url = `${PROJECT}/storage/v1/object/public/game-assets/portraits/yuji.png`
    expect(normalizeImageUrl(url)).toBe(url)
  })

  it('returns local paths as-is', () => {
    expect(normalizeImageUrl('/portraits/yuji.png')).toBe('/portraits/yuji.png')
    expect(normalizeImageUrl('/assets/bg.jpg')).toBe('/assets/bg.jpg')
  })

  it('returns valid https URLs as-is', () => {
    expect(normalizeImageUrl('https://i.imgur.com/abc.png')).toBe('https://i.imgur.com/abc.png')
  })

  it('trims whitespace', () => {
    expect(normalizeImageUrl('  https://i.imgur.com/abc.png  ')).toBe('https://i.imgur.com/abc.png')
  })
})

describe('isDirectImageUrl', () => {
  it('returns true for valid URLs', () => {
    expect(isDirectImageUrl('https://i.imgur.com/abc.png')).toBe(true)
    expect(isDirectImageUrl('/portraits/yuji.png')).toBe(true)
  })

  it('returns false for invalid URLs', () => {
    expect(isDirectImageUrl('https://imgur.com/abc')).toBe(false)
    expect(isDirectImageUrl('blob:http://localhost/abc')).toBe(false)
    expect(isDirectImageUrl('')).toBe(false)
  })
})
