/**
 * Battle presentation preference.
 * Persisted to localStorage; affects only visual pacing, not battle logic.
 *
 * standard — brief action-name banner before state commits, active tray expands
 * minimal  — immediate state transitions, reduced visual emphasis
 */

export type BattlePresentationMode = 'standard' | 'minimal'

const STORAGE_KEY = 'ca-battle-presentation-mode'

export function readPresentationMode(): BattlePresentationMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'minimal') return 'minimal'
  } catch {
    // localStorage unavailable
  }
  return 'standard'
}

export function savePresentationMode(mode: BattlePresentationMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // localStorage unavailable
  }
}

export function togglePresentationMode(): BattlePresentationMode {
  const next = readPresentationMode() === 'standard' ? 'minimal' : 'standard'
  savePresentationMode(next)
  return next
}
