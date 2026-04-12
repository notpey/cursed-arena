import { useEffect } from 'react'
import { usePlayerState } from '@/features/player/store'
import type { BattleEvent } from '@/features/battle/types'
import { audioManager } from './manager'
import type { SoundId } from './sounds'

/**
 * Path under /public where battle music should be placed.
 * Drop an MP3/OGG file at this path to enable looping background music.
 * The system degrades gracefully if the file is absent.
 */
const BATTLE_MUSIC_SRC = '/audio/music/battle-theme.mp3'

const KIND_TO_SOUND: Partial<Record<BattleEvent['kind'], SoundId>> = {
  action: 'attack',
  damage: 'damage',
  heal: 'heal',
  status: 'status-apply',
  defeat: 'defeat',
  victory: 'victory',
  phase: 'round-start',
}

/**
 * Manages background music lifecycle and exposes a handler for playing
 * sound effects in response to battle events.
 *
 * Usage: call inside BattlePage (or any battle-scoped component) once.
 */
export function useBattleAudio() {
  const playerState = usePlayerState()

  // Keep gain nodes in sync whenever the player changes audio settings.
  useEffect(() => {
    audioManager.syncVolumes()
  }, [playerState.settings.audio])

  // Preload music on mount so the buffer is ready for first user gesture.
  useEffect(() => {
    audioManager.preloadMusic(BATTLE_MUSIC_SRC)
    return () => {
      audioManager.stopMusic()
    }
  }, [])

  /**
   * Play sound effects for a batch of battle events produced by one round.
   * Each event kind fires at most once per call to avoid audio pile-up.
   */
  function handleBattleEvents(events: BattleEvent[]) {
    const played = new Set<SoundId>()

    for (const event of events) {
      if (event.kind === 'defeat' || event.kind === 'victory') {
        audioManager.stopMusic()
      }

      const sound = KIND_TO_SOUND[event.kind]
      if (sound && !played.has(sound)) {
        played.add(sound)
        audioManager.playSound(sound)
      }
    }
  }

  /** Play the coin-flip sound at the start of a battle. */
  function playCoinFlip() {
    audioManager.playSound('coin-flip')
  }

  return { handleBattleEvents, playCoinFlip }
}
