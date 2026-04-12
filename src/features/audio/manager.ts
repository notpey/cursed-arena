import { readPlayerSettings } from '@/features/player/store'
import { SYNTH_SOUNDS, type SoundId } from './sounds'

class AudioManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null

  private musicSource: AudioBufferSourceNode | null = null
  private musicBuffer: AudioBuffer | null = null
  private pendingMusicSrc: string | null = null
  private loadedMusicSrc: string | null = null
  private musicPlaying = false

  // Lazily create the AudioContext on first use (satisfies browser autoplay policy).
  private initContext(): AudioContext {
    if (this.ctx) return this.ctx

    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.musicGain = this.ctx.createGain()
    this.sfxGain = this.ctx.createGain()

    this.musicGain.connect(this.masterGain)
    this.sfxGain.connect(this.masterGain)
    this.masterGain.connect(this.ctx.destination)

    this.applyVolumes()
    return this.ctx
  }

  private applyVolumes() {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return
    const { master, music, sfx } = readPlayerSettings().audio
    const t = this.ctx.currentTime
    this.masterGain.gain.setTargetAtTime(master / 100, t, 0.05)
    this.musicGain.gain.setTargetAtTime(music / 100, t, 0.05)
    this.sfxGain.gain.setTargetAtTime(sfx / 100, t, 0.05)
  }

  /** Call whenever player audio settings change. */
  syncVolumes() {
    this.applyVolumes()
  }

  /** Play a synthesized sound effect. Resumes a suspended context automatically. */
  playSound(id: SoundId) {
    try {
      const ctx = this.initContext()

      const doPlay = () => {
        // Start pending music now that we're inside a user-gesture call stack.
        if (!this.musicPlaying && this.musicBuffer) {
          this.startMusicSource()
        }
        SYNTH_SOUNDS[id]?.(ctx, this.sfxGain!)
      }

      if (ctx.state === 'suspended') {
        ctx.resume().then(doPlay).catch(() => undefined)
      } else {
        doPlay()
      }
    } catch {
      // Silently ignore missing Web Audio support.
    }
  }

  /**
   * Begin loading a music file. Call this from a useEffect so the buffer is
   * ready when the first user gesture triggers playback.
   */
  async preloadMusic(src: string): Promise<void> {
    if (src === this.loadedMusicSrc) return
    this.pendingMusicSrc = src
    try {
      const response = await fetch(src)
      if (!response.ok) return
      const ctx = this.initContext()
      const arrayBuffer = await response.arrayBuffer()
      // Only store if this is still the most-recently-requested track.
      if (src !== this.pendingMusicSrc) return
      this.musicBuffer = await ctx.decodeAudioData(arrayBuffer)
      this.loadedMusicSrc = src
    } catch {
      // File absent or decode error — music simply won't play.
    }
  }

  private startMusicSource() {
    if (!this.musicBuffer || !this.ctx || !this.musicGain || this.musicPlaying) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.musicBuffer
    src.loop = true
    src.connect(this.musicGain)
    src.start()
    this.musicSource = src
    this.musicPlaying = true
    src.onended = () => {
      this.musicPlaying = false
    }
  }

  stopMusic() {
    try {
      this.musicSource?.stop()
    } catch {
      // Already stopped.
    }
    this.musicSource = null
    this.musicPlaying = false
  }

  /** Release all audio resources. */
  dispose() {
    this.stopMusic()
    this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.masterGain = null
    this.musicGain = null
    this.sfxGain = null
    this.musicBuffer = null
    this.loadedMusicSrc = null
    this.pendingMusicSrc = null
  }
}

// Module-level singleton shared across the app.
export const audioManager = new AudioManager()
