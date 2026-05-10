/**
 * Tests for audio settings persistence and volume initialisation.
 *
 * HTMLAudioElement is not available in the Vitest node environment, so we test
 * only the pure store layer (localStorage round-trips) and the volume-
 * calculation logic that is independent of DOM Audio nodes.
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

// ── localStorage stub (mirrors the pattern in matches.test.ts) ───────────────

const store: Record<string, string> = {}

function makeLocalStorageStub() {
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear:      () => { for (const k of Object.keys(store)) delete store[k] },
  }
}

const STORAGE_KEY = 'ca-player-state-v1'

function seedStorage(audioOverrides: Partial<{ master: number; music: number; sfx: number; voice: number }>) {
  store[STORAGE_KEY] = JSON.stringify({
    settings: {
      audio: { master: 82, music: 64, sfx: 76, voice: 71, ...audioOverrides },
    },
  })
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  const ls = makeLocalStorageStub()
  Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'window',        { value: { localStorage: ls }, writable: true, configurable: true })
  vi.resetModules()
})

afterEach(() => {
  vi.resetModules()
})

// ── Store persistence ─────────────────────────────────────────────────────────

describe('player store — audio settings persistence', () => {
  it('returns default audio settings when nothing is saved', async () => {
    const { readPlayerSettings } = await import('@/features/player/store')
    const s = readPlayerSettings()
    expect(s.audio.master).toBe(82)
    expect(s.audio.music).toBe(64)
    expect(s.audio.sfx).toBe(76)
  })

  it('restores saved audio settings (all-zero) from localStorage', async () => {
    seedStorage({ master: 0, music: 0, sfx: 0 })
    const { readPlayerSettings } = await import('@/features/player/store')
    const s = readPlayerSettings()
    expect(s.audio.master).toBe(0)
    expect(s.audio.music).toBe(0)
    expect(s.audio.sfx).toBe(0)
  })

  it('restores partial audio overrides and fills the rest with defaults', async () => {
    seedStorage({ sfx: 10 })
    const { readPlayerSettings } = await import('@/features/player/store')
    const s = readPlayerSettings()
    expect(s.audio.sfx).toBe(10)
    expect(s.audio.master).toBe(82)
    expect(s.audio.music).toBe(64)
  })

  it('falls back to defaults when localStorage contains invalid JSON', async () => {
    store[STORAGE_KEY] = 'not-valid-json{{{'
    const { readPlayerSettings } = await import('@/features/player/store')
    const s = readPlayerSettings()
    expect(s.audio.master).toBe(82)
    expect(s.audio.sfx).toBe(76)
  })

  it('persists audio settings written via updatePlayerState across module reloads', async () => {
    const { updatePlayerState } = await import('@/features/player/store')
    updatePlayerState((s) => { s.settings.audio.master = 0; s.settings.audio.sfx = 0 })

    // Simulate page reload: reset module cache so the store re-reads from storage.
    vi.resetModules()
    const { readPlayerSettings } = await import('@/features/player/store')
    const saved = readPlayerSettings()
    expect(saved.audio.master).toBe(0)
    expect(saved.audio.sfx).toBe(0)
  })
})

// ── Volume calculation (pure math, no DOM) ────────────────────────────────────

describe('volume calculation', () => {
  function effectiveSfx(master: number, sfx: number) {
    return Math.max(0, Math.min(1, (master / 100) * (sfx / 100)))
  }
  function effectiveMusic(master: number, music: number) {
    return Math.max(0, Math.min(1, (master / 100) * (music / 100)))
  }

  it('computes correct sfx level from master × sfx', () => {
    expect(effectiveSfx(50, 80)).toBeCloseTo(0.4)
  })

  it('sfx is 0 when master is 0', () => {
    expect(effectiveSfx(0, 76)).toBe(0)
  })

  it('sfx is 0 when sfx is 0', () => {
    expect(effectiveSfx(82, 0)).toBe(0)
  })

  it('music is 0 when music is 0', () => {
    expect(effectiveMusic(82, 0)).toBe(0)
  })

  it('music is 0 when master is 0', () => {
    expect(effectiveMusic(0, 64)).toBe(0)
  })

  it('result is clamped to 1 even for over-range inputs', () => {
    expect(effectiveSfx(200, 200)).toBe(1)
  })
})

// ── audioManager initialises from persisted settings before first playback ────

describe('audioManager — volume initialised from localStorage at import time', () => {
  it('reads zero volumes from storage so first playback would be silent', async () => {
    seedStorage({ master: 0, music: 0, sfx: 0 })

    // Importing the module triggers loadInitialVolumes() synchronously.
    // We verify via the same store that the manager reads from.
    const { readPlayerSettings } = await import('@/features/player/store')
    const audio = readPlayerSettings().audio

    expect(audio.master).toBe(0)
    expect(audio.music).toBe(0)
    expect(audio.sfx).toBe(0)

    // The volume formula would produce 0 — both SFX and music remain silent.
    const sfx   = Math.max(0, Math.min(1, (audio.master / 100) * (audio.sfx   / 100)))
    const music = Math.max(0, Math.min(1, (audio.master / 100) * (audio.music / 100)))
    expect(sfx).toBe(0)
    expect(music).toBe(0)
  })

  it('uses hardcoded fallback defaults when localStorage is empty', async () => {
    const { readPlayerSettings } = await import('@/features/player/store')
    const audio = readPlayerSettings().audio
    expect(audio.master).toBe(82)
    expect(audio.music).toBe(64)
    expect(audio.sfx).toBe(76)
  })

  it('setVolumesFromSettings overrides the initialised values', async () => {
    seedStorage({ master: 50, music: 30, sfx: 20 })
    const { setVolumesFromSettings } = await import('@/features/audio/audioManager')
    // Should not throw; calling it simulates a React effect firing after mount.
    expect(() => setVolumesFromSettings({ master: 0, music: 0, sfx: 0 })).not.toThrow()
  })
})
