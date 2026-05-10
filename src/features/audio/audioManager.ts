/**
 * Singleton audio manager.
 * All Audio nodes are created once and reused to prevent overlapping loops and
 * garbage-collection churn.  Browser autoplay restrictions are handled by
 * catching the Promise rejection from .play() and failing silently.
 */

import { readPlayerSettings } from '@/features/player/store'

const SOUND_PATHS = {
  matchFound: '/audio/boogie-woogie.mp3',
  skillSelect: '/audio/button-click-sound.mp3',
  battleMusic: '/audio/dark-tension.mp3',
} as const

type SoundKey = keyof typeof SOUND_PATHS

// ── Internal state ────────────────────────────────────────────────────────────

// Bootstrap from persisted settings synchronously so the first playback call
// already uses the correct user-configured volumes rather than hardcoded defaults.
function loadInitialVolumes() {
  try {
    const audio = readPlayerSettings().audio
    return {
      master: audio.master / 100,
      music: audio.music / 100,
      sfx: audio.sfx / 100,
    }
  } catch {
    return { master: 0.82, music: 0.64, sfx: 0.76 }
  }
}

const initial = loadInitialVolumes()
let masterVol = initial.master
let musicVol  = initial.music
let sfxVol    = initial.sfx

const sfxNodes: Partial<Record<SoundKey, HTMLAudioElement>> = {}
let battleMusicNode: HTMLAudioElement | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n: number) { return Math.max(0, Math.min(1, n)) }

function effectiveMusic() { return clamp(masterVol * musicVol) }
function effectiveSfx()   { return clamp(masterVol * sfxVol) }

function getOrCreateSfx(key: SoundKey): HTMLAudioElement {
  if (!sfxNodes[key]) {
    const audio = new Audio(SOUND_PATHS[key])
    audio.preload = 'auto'
    sfxNodes[key] = audio
  }
  return sfxNodes[key]!
}

function getOrCreateBattleMusic(): HTMLAudioElement {
  if (!battleMusicNode) {
    battleMusicNode = new Audio(SOUND_PATHS.battleMusic)
    battleMusicNode.loop = true
    battleMusicNode.preload = 'auto'
  }
  return battleMusicNode
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call once after player settings load (values are 0–100). */
export function setVolumesFromSettings(settings: {
  master: number
  music: number
  sfx: number
}) {
  masterVol = settings.master / 100
  musicVol  = settings.music  / 100
  sfxVol    = settings.sfx    / 100

  // Update live nodes so changes are immediate without a remount.
  if (battleMusicNode) battleMusicNode.volume = effectiveMusic()
  for (const key of Object.keys(sfxNodes) as SoundKey[]) {
    const node = sfxNodes[key]
    if (node) node.volume = effectiveSfx()
  }
}

/** Play a one-shot SFX.  Fails silently if autoplay is blocked. */
export function playSoundEffect(key: 'matchFound' | 'skillSelect') {
  const vol = effectiveSfx()
  if (vol === 0) return

  const node = getOrCreateSfx(key)
  node.volume = vol
  // Rewind so rapid calls still fire from the start.
  node.currentTime = 0
  node.play().catch(() => { /* autoplay blocked — ignore */ })
}

/** Start looping battle music.  Idempotent — won't create duplicate loops. */
export function startBattleMusic() {
  const vol = effectiveMusic()
  const node = getOrCreateBattleMusic()
  node.volume = vol
  if (!node.paused) return
  if (vol === 0) return
  node.play().catch(() => { /* autoplay blocked — ignore */ })
}

/** Stop battle music without destroying the node. */
export function stopBattleMusic() {
  if (!battleMusicNode || battleMusicNode.paused) return
  battleMusicNode.pause()
  battleMusicNode.currentTime = 0
}

/**
 * Resume battle music after a settings change from muted → unmuted.
 * Call this after setVolumesFromSettings when music should be playing.
 */
export function resumeBattleMusicIfNeeded() {
  if (!battleMusicNode) return
  const vol = effectiveMusic()
  battleMusicNode.volume = vol
  if (vol > 0 && battleMusicNode.paused) {
    battleMusicNode.play().catch(() => { /* autoplay blocked */ })
  }
  if (vol === 0 && !battleMusicNode.paused) {
    battleMusicNode.pause()
  }
}
