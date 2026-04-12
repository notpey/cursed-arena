export type SoundId =
  | 'attack'
  | 'damage'
  | 'heal'
  | 'status-apply'
  | 'defeat'
  | 'victory'
  | 'round-start'
  | 'coin-flip'

type SynthFn = (ctx: AudioContext, destination: AudioNode) => void

// Linear ramp envelope on a GainNode
function envelope(
  gain: GainNode,
  ctx: AudioContext,
  attack: number,
  hold: number,
  release: number,
  peak = 0.5,
) {
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peak, now + attack)
  gain.gain.setValueAtTime(peak, now + attack + hold)
  gain.gain.linearRampToValueAtTime(0, now + attack + hold + release)
}

export const SYNTH_SOUNDS: Record<SoundId, SynthFn> = {
  // Short punchy hit — sawtooth sweeping down from 200 → 60 Hz
  attack(ctx, dest) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(dest)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(200, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.18)
    envelope(gain, ctx, 0.005, 0.02, 0.14, 0.45)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.22)
  },

  // Heavy thud — band-passed noise
  damage(ctx, dest) {
    const bufferSize = Math.floor(ctx.sampleRate * 0.25)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2)
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 160
    filter.Q.value = 0.8
    const gain = ctx.createGain()
    src.connect(filter)
    filter.connect(gain)
    gain.connect(dest)
    envelope(gain, ctx, 0.003, 0.04, 0.18, 0.55)
    src.start(ctx.currentTime)
  },

  // Rising C-major arpeggio (C5 E5 G5 C6)
  heal(ctx, dest) {
    const freqs = [523.25, 659.25, 784, 1046.5]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(dest)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.09
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.22, t + 0.04)
      gain.gain.linearRampToValueAtTime(0, t + 0.38)
      osc.start(t)
      osc.stop(t + 0.42)
    })
  },

  // Wavering shimmer — vibrato sine
  'status-apply'(ctx, dest) {
    const osc = ctx.createOscillator()
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    const gain = ctx.createGain()
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    osc.connect(gain)
    gain.connect(dest)
    osc.type = 'sine'
    osc.frequency.value = 660
    lfo.type = 'sine'
    lfo.frequency.value = 7
    lfoGain.gain.value = 40
    envelope(gain, ctx, 0.015, 0.1, 0.28, 0.28)
    lfo.start(ctx.currentTime)
    osc.start(ctx.currentTime)
    lfo.stop(ctx.currentTime + 0.45)
    osc.stop(ctx.currentTime + 0.45)
  },

  // Descending dramatic fall — staggered sawtooth notes
  defeat(ctx, dest) {
    const freqs = [440, 330, 220, 147]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(dest)
      osc.type = 'sawtooth'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.22
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.3, t + 0.03)
      gain.gain.linearRampToValueAtTime(0, t + 0.42)
      osc.start(t)
      osc.stop(t + 0.46)
    })
  },

  // Ascending fanfare — staggered triangle notes (C4 E4 G4 C5 E5)
  victory(ctx, dest) {
    const freqs = [261.63, 329.63, 392, 523.25, 659.25]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(dest)
      osc.type = 'triangle'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.13
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.32, t + 0.04)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.28)
      gain.gain.linearRampToValueAtTime(0, t + 0.55)
      osc.start(t)
      osc.stop(t + 0.58)
    })
  },

  // Sharp metallic ping
  'round-start'(ctx, dest) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(dest)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1200, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.15)
    envelope(gain, ctx, 0.003, 0.01, 0.22, 0.38)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
  },

  // Metallic ringing coin
  'coin-flip'(ctx, dest) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(dest)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1400, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.35)
    envelope(gain, ctx, 0.004, 0.05, 0.32, 0.42)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.42)
  },
}
