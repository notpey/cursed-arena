import { beforeEach, describe, expect, test } from 'vitest'
import {
  mergeLocalAndAccountMissionProgress,
  fetchAccountMissionProgress,
  saveAccountMissionProgress,
  mergeAndSyncOnSignIn,
} from '@/features/missions/missionProgressStore'
import { getEffectiveCharacterUnlockState } from '@/features/missions/effectiveUnlocks'
import { STARTER_FIGHTER_IDS } from '@/features/missions/unlocks'

// ── localStorage stub ─────────────────────────────────────────────────────────

const store: Record<string, string> = {}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]

  const ls = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: ls }, writable: true, configurable: true })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function p(progress: number, completed = false) {
  return { progress, completed }
}

// ── mergeLocalAndAccountMissionProgress ──────────────────────────────────────

describe('mergeLocalAndAccountMissionProgress', () => {
  test('takes higher progress when neither is completed', () => {
    const merged = mergeLocalAndAccountMissionProgress(
      { 'unlock-nanami': p(2) },
      { 'unlock-nanami': p(1) },
    )
    expect(merged['unlock-nanami']!.progress).toBe(2)
    expect(merged['unlock-nanami']!.completed).toBe(false)
  })

  test('completed state wins over higher in-progress count', () => {
    const merged = mergeLocalAndAccountMissionProgress(
      { 'unlock-nanami': p(3, true) },
      { 'unlock-nanami': p(5) },
    )
    expect(merged['unlock-nanami']!.completed).toBe(true)
  })

  test('account completed wins over local in-progress', () => {
    const merged = mergeLocalAndAccountMissionProgress(
      { 'unlock-nanami': p(2) },
      { 'unlock-nanami': p(3, true) },
    )
    expect(merged['unlock-nanami']!.completed).toBe(true)
  })

  test('mission only in local is included', () => {
    const merged = mergeLocalAndAccountMissionProgress(
      { 'unlock-todo': p(1) },
      {},
    )
    expect(merged['unlock-todo']!.progress).toBe(1)
  })

  test('mission only in account is included', () => {
    const merged = mergeLocalAndAccountMissionProgress(
      {},
      { 'unlock-todo': p(2, true) },
    )
    expect(merged['unlock-todo']!.completed).toBe(true)
  })

  test('completed mission stays completed regardless of progress comparison', () => {
    const merged = mergeLocalAndAccountMissionProgress(
      { 'unlock-gojo': p(1500, true) },
      { 'unlock-gojo': p(1500, true) },
    )
    expect(merged['unlock-gojo']!.completed).toBe(true)
  })

  test('empty inputs produce empty output', () => {
    expect(mergeLocalAndAccountMissionProgress({}, {})).toEqual({})
  })

  test('unknown/future mission IDs are passed through without error', () => {
    const merged = mergeLocalAndAccountMissionProgress(
      { 'unlock-future-fighter': p(3) },
      {},
    )
    expect(merged['unlock-future-fighter']!.progress).toBe(3)
  })
})

// ── fetchAccountMissionProgress — Supabase unconfigured ──────────────────────

describe('fetchAccountMissionProgress — Supabase unconfigured', () => {
  test('returns empty map when Supabase client is null', async () => {
    // getSupabaseClient() returns null when env vars are missing (test env)
    const result = await fetchAccountMissionProgress()
    expect(result).toEqual({})
  })
})

// ── saveAccountMissionProgress — Supabase unconfigured ───────────────────────

describe('saveAccountMissionProgress — Supabase unconfigured', () => {
  test('does not throw when Supabase client is null', async () => {
    await expect(
      saveAccountMissionProgress({ 'unlock-nanami': p(3, true) }),
    ).resolves.toBeUndefined()
  })
})

// ── mergeAndSyncOnSignIn ──────────────────────────────────────────────────────

describe('mergeAndSyncOnSignIn', () => {
  test('returns local progress when Supabase is unconfigured', async () => {
    // Seed localStorage with some progress
    store['ca-unlock-missions-v1'] = JSON.stringify({
      version: 1,
      missions: { 'unlock-nanami': { progress: 3, completed: true } },
    })

    // No Supabase configured in test env → fetchAccountMissionProgress returns {}
    // merge(local, {}) == local
    const merged = await mergeAndSyncOnSignIn()
    expect(merged['unlock-nanami']?.completed).toBe(true)
  })

  test('merge produces union of local and account progress (pure logic test)', () => {
    // Test via mergeLocalAndAccountMissionProgress directly since Supabase is
    // unavailable in test env. The sync path delegates to this same function.
    const local = { 'unlock-nanami': p(3, true) }
    const account = { 'unlock-todo': p(1) }
    const merged = mergeLocalAndAccountMissionProgress(local, account)
    expect(merged['unlock-nanami']?.completed).toBe(true)
    expect(merged['unlock-todo']?.progress).toBe(1)
  })
})

// ── getEffectiveCharacterUnlockState + account progress ──────────────────────

describe('effective unlock state with account-backed progress', () => {
  test('account-completed mission unlocks its fighter', () => {
    const accountProgress = { 'unlock-nanami': p(3, true) }
    const states = getEffectiveCharacterUnlockState(['nanami'], accountProgress, {})
    expect(states['nanami']!.unlocked).toBe(true)
    expect(states['nanami']!.source).toBe('mission')
  })

  test('signed-out empty progress keeps fighter locked', () => {
    const states = getEffectiveCharacterUnlockState(['nanami'], {}, {})
    expect(states['nanami']!.unlocked).toBe(false)
  })

  test('admin override beats account mission progress', () => {
    const accountProgress = { 'unlock-nanami': p(3, true) }
    const states = getEffectiveCharacterUnlockState(['nanami'], accountProgress, { 'unlock-nanami': false })
    expect(states['nanami']!.unlocked).toBe(false)
    expect(states['nanami']!.source).toBe('admin-revoke')
  })

  test('admin grant beats missing account progress', () => {
    const states = getEffectiveCharacterUnlockState(['gojo'], {}, { 'unlock-gojo': true })
    expect(states['gojo']!.unlocked).toBe(true)
    expect(states['gojo']!.source).toBe('admin-grant')
  })

  test('starters are unlocked regardless of account progress', () => {
    for (const id of STARTER_FIGHTER_IDS) {
      const states = getEffectiveCharacterUnlockState([id], {}, {})
      expect(states[id]!.unlocked).toBe(true)
      expect(states[id]!.source).toBe('starter')
    }
  })

  test('failed Supabase fetch (empty map) falls back to locked for gated fighters', () => {
    // Simulate fetch failure: account returns {}, local has nothing
    const states = getEffectiveCharacterUnlockState(['sukuna'], {}, {})
    expect(states['sukuna']!.unlocked).toBe(false)
  })
})
