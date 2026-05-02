import { describe, expect, it } from 'vitest'
import { validateAvatarFile } from '@/features/avatar/validation'

function file(type: string, size: number) {
  return new File([new Uint8Array(size)], 'avatar.bin', { type })
}

describe('validateAvatarFile', () => {
  it('accepts PNG, JPEG, WebP, and GIF avatars', () => {
    expect(validateAvatarFile(file('image/png', 1024)).ok).toBe(true)
    expect(validateAvatarFile(file('image/jpeg', 1024)).ok).toBe(true)
    expect(validateAvatarFile(file('image/webp', 1024)).ok).toBe(true)
    expect(validateAvatarFile(file('image/gif', 1024)).ok).toBe(true)
  })

  it('rejects unsupported file types', () => {
    expect(validateAvatarFile(file('image/svg+xml', 1024)).ok).toBe(false)
  })

  it('rejects oversized image files', () => {
    expect(validateAvatarFile(file('image/png', 2 * 1024 * 1024 + 1)).ok).toBe(false)
    expect(validateAvatarFile(file('image/gif', 5 * 1024 * 1024 + 1)).ok).toBe(false)
  })
})
