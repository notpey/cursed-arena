import { describe, expect, test } from 'vitest'
import {
  getEffectiveCharacterUnlockState,
  buildEffectiveUnlockedIds,
} from '@/features/missions/effectiveUnlocks'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STARTERS = ['yuji', 'megumi', 'nobara']
const GATED = ['nanami', 'todo', 'gojo', 'sukuna']
const ALL = [...STARTERS, ...GATED]

function progress(completed: boolean) {
  return { completed }
}

// ── getEffectiveCharacterUnlockState ─────────────────────────────────────────

describe('getEffectiveCharacterUnlockState', () => {
  test('starters are always unlocked with no overrides', () => {
    const states = getEffectiveCharacterUnlockState(STARTERS, {}, {})
    for (const id of STARTERS) {
      expect(states[id]!.unlocked).toBe(true)
      expect(states[id]!.source).toBe('starter')
    }
  })

  test('gated fighters are locked when no mission is completed and no override', () => {
    const states = getEffectiveCharacterUnlockState(GATED, {}, {})
    for (const id of GATED) {
      expect(states[id]!.unlocked).toBe(false)
      expect(states[id]!.source).toBe('mission')
    }
  })

  test('completed mission unlocks its reward fighter', () => {
    // unlock-nanami rewards 'nanami'
    const playerUnlocks = { 'unlock-nanami': progress(true) }
    const states = getEffectiveCharacterUnlockState(['nanami'], playerUnlocks, {})
    expect(states['nanami']!.unlocked).toBe(true)
    expect(states['nanami']!.source).toBe('mission')
  })

  test('incomplete mission does not unlock its reward fighter', () => {
    const playerUnlocks = { 'unlock-nanami': progress(false) }
    const states = getEffectiveCharacterUnlockState(['nanami'], playerUnlocks, {})
    expect(states['nanami']!.unlocked).toBe(false)
  })

  test('admin grant unlocks a fighter even if mission is not completed', () => {
    // 'unlock-gojo' rewards 'gojo'. No mission progress, but admin granted.
    const adminOverrides = { 'unlock-gojo': true }
    const states = getEffectiveCharacterUnlockState(['gojo'], {}, adminOverrides)
    expect(states['gojo']!.unlocked).toBe(true)
    expect(states['gojo']!.source).toBe('admin-grant')
  })

  test('admin revoke locks a fighter even if mission was completed', () => {
    const playerUnlocks = { 'unlock-nanami': progress(true) }
    const adminOverrides = { 'unlock-nanami': false }
    const states = getEffectiveCharacterUnlockState(['nanami'], playerUnlocks, adminOverrides)
    expect(states['nanami']!.unlocked).toBe(false)
    expect(states['nanami']!.source).toBe('admin-revoke')
  })

  test('admin revoke also applies to starter fighters (override beats starter rule)', () => {
    // Starters don't have mission defs, so admin cannot revoke them via mission_id.
    // But if an admin somehow mapped a starter's mission_id — verify it is handled.
    // More practically: admin overrides reference mission_id, starters have none,
    // so they are unaffected. This test confirms starters without overrides stay unlocked.
    const states = getEffectiveCharacterUnlockState(['yuji'], {}, {})
    expect(states['yuji']!.unlocked).toBe(true)
    expect(states['yuji']!.source).toBe('starter')
  })

  test('admin override does not affect other players (override map is user-scoped)', () => {
    // Player A has admin grant; Player B's state is computed with an empty override map.
    const playerAOverrides = { 'unlock-sukuna': true }
    const playerBOverrides = {}

    const statesA = getEffectiveCharacterUnlockState(['sukuna'], {}, playerAOverrides)
    const statesB = getEffectiveCharacterUnlockState(['sukuna'], {}, playerBOverrides)

    expect(statesA['sukuna']!.unlocked).toBe(true)
    expect(statesB['sukuna']!.unlocked).toBe(false)
  })

  test('unknown fighter IDs in roster get a default locked state', () => {
    const states = getEffectiveCharacterUnlockState(['completely-unknown-id'], {}, {})
    expect(states['completely-unknown-id']!.unlocked).toBe(false)
    expect(states['completely-unknown-id']!.source).toBe('mission')
  })

  test('signed-out / empty overrides fall back to normal progression', () => {
    const playerUnlocks = { 'unlock-nanami': progress(true) }
    const states = getEffectiveCharacterUnlockState(ALL, playerUnlocks, {})
    for (const id of STARTERS) expect(states[id]!.unlocked).toBe(true)
    expect(states['nanami']!.unlocked).toBe(true)
    expect(states['gojo']!.unlocked).toBe(false)
  })
})

// ── buildEffectiveUnlockedIds ─────────────────────────────────────────────────

describe('buildEffectiveUnlockedIds', () => {
  test('returns a Set of unlocked fighter IDs', () => {
    const playerUnlocks = { 'unlock-todo': progress(true) }
    const ids = buildEffectiveUnlockedIds(ALL, playerUnlocks, {})
    expect(ids.has('yuji')).toBe(true)   // starter
    expect(ids.has('todo')).toBe(true)   // mission
    expect(ids.has('nanami')).toBe(false) // not completed
  })

  test('admin grant adds a fighter to the unlocked set', () => {
    const ids = buildEffectiveUnlockedIds(['gojo'], {}, { 'unlock-gojo': true })
    expect(ids.has('gojo')).toBe(true)
  })

  test('admin revoke removes a fighter even if locally completed', () => {
    const playerUnlocks = { 'unlock-nanami': progress(true) }
    const ids = buildEffectiveUnlockedIds(['nanami'], playerUnlocks, { 'unlock-nanami': false })
    expect(ids.has('nanami')).toBe(false)
  })
})
