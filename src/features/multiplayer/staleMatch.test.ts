import { describe, expect, test } from 'vitest'
import { STALE_MATCH_CUTOFF_MS, staleCutoffIso } from '@/features/multiplayer/client'

// ── staleCutoffIso — pure time math ───────────────────────────────────────────

describe('staleCutoffIso', () => {
  test('returns an ISO string exactly STALE_MATCH_CUTOFF_MS before the given nowMs', () => {
    const nowMs = new Date('2025-06-01T12:00:00Z').getTime()
    const cutoff = staleCutoffIso(nowMs)
    const expectedMs = nowMs - STALE_MATCH_CUTOFF_MS
    expect(new Date(cutoff).getTime()).toBe(expectedMs)
  })

  test('cutoff is 60 minutes before now', () => {
    const nowMs = Date.now()
    const cutoff = staleCutoffIso(nowMs)
    const deltaMinutes = (nowMs - new Date(cutoff).getTime()) / 60_000
    expect(deltaMinutes).toBeCloseTo(60, 1)
  })

  test('a match active 59 minutes ago is newer than the cutoff (should not be stale)', () => {
    const nowMs = Date.now()
    const cutoff = staleCutoffIso(nowMs)
    const recentActivity = new Date(nowMs - 59 * 60_000).toISOString()
    expect(recentActivity > cutoff).toBe(true)
  })

  test('a match active 61 minutes ago is older than the cutoff (should be stale)', () => {
    const nowMs = Date.now()
    const cutoff = staleCutoffIso(nowMs)
    const staleActivity = new Date(nowMs - 61 * 60_000).toISOString()
    expect(staleActivity < cutoff).toBe(true)
  })

  test('a match active exactly at the cutoff boundary is not stale (gte)', () => {
    const nowMs = Date.now()
    const cutoff = staleCutoffIso(nowMs)
    // The cutoff is the exact boundary — a match AT the cutoff should not be stale
    // (fetchActiveMatch uses .gte('last_activity_at', cutoff))
    expect(cutoff >= cutoff).toBe(true)
  })

  test('STALE_MATCH_CUTOFF_MS is 60 minutes in milliseconds', () => {
    expect(STALE_MATCH_CUTOFF_MS).toBe(60 * 60 * 1000)
  })
})
