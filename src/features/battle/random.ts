let fallbackSeedCounter = 0

export function hashSeed(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function createSeededRandom(seed: string) {
  let state = hashSeed(seed) || 0x6d2b79f5

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function pickSeededIndex(length: number, seed: string) {
  if (length <= 0) return 0
  return Math.floor(createSeededRandom(seed)() * length) % length
}

function createSeedNonce() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(2)
    crypto.getRandomValues(buffer)
    return Array.from(buffer, (value) => value.toString(36)).join('-')
  }

  fallbackSeedCounter += 1
  return `${Date.now().toString(36)}-${fallbackSeedCounter.toString(36)}`
}

export function createBattleSeed(mode: string, playerTeamIds: string[]) {
  return [mode, playerTeamIds.join('-'), createSeedNonce()].join(':')
}
