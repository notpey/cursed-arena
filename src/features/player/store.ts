import { useSyncExternalStore } from 'react'

const playerStateStorageKey = 'ca-player-state-v1'

export type QualityPreset = 'LOW' | 'MEDIUM' | 'HIGH'
export type AnimationSpeed = '1x' | '1.5x' | '2x'
export type AutoBattleSpeed = 'NORMAL (1x)' | 'FAST (1.5x)' | 'MAX (2x)'
export type PlayerRole = 'player' | 'tester' | 'admin'

export type PlayerProfile = {
  displayName: string
  playerId: string
  title: string
  avatarLabel: string
  role: PlayerRole
}

export type PlayerEconomy = {
  gems: number
  gold: number
}

export type PlayerSettings = {
  accountLinks: {
    google: boolean
    apple: boolean
    email: boolean
  }
  audio: {
    master: number
    music: number
    sfx: number
    voice: number
  }
  graphics: {
    qualityPreset: QualityPreset
    animationSpeed: AnimationSpeed
    skipUltimates: boolean
    reduceParticles: boolean
  }
  notifications: {
    push: boolean
    energyRefill: boolean
    bannerReminder: boolean
  }
  gameplay: {
    autoBattleDefaultSpeed: AutoBattleSpeed
    confirmBeforeSpendingGems: boolean
    showDamageNumbers: boolean
  }
}

export type PlayerState = {
  profile: PlayerProfile
  economy: PlayerEconomy
  settings: PlayerSettings
}

export const defaultPlayerState: PlayerState = {
  profile: {
    displayName: 'PLAYER_NAME',
    playerId: '#7742',
    title: 'DOMAIN MASTER',
    avatarLabel: 'PN',
    role: 'tester',
  },
  economy: {
    gems: 6920,
    gold: 148200,
  },
  settings: {
    accountLinks: {
      google: true,
      apple: false,
      email: true,
    },
    audio: {
      master: 82,
      music: 64,
      sfx: 76,
      voice: 71,
    },
    graphics: {
      qualityPreset: 'HIGH',
      animationSpeed: '1x',
      skipUltimates: false,
      reduceParticles: false,
    },
    notifications: {
      push: true,
      energyRefill: true,
      bannerReminder: true,
    },
    gameplay: {
      autoBattleDefaultSpeed: 'FAST (1.5x)',
      confirmBeforeSpendingGems: true,
      showDamageNumbers: true,
    },
  },
}

const listeners = new Set<() => void>()
let cachedPlayerState: PlayerState | null = null
let storageListenerBound = false

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function normalizeAvatarLabel(value: string | null | undefined, displayName: string) {
  const cleaned = (value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 2)
  if (cleaned.length > 0) return cleaned

  return (
    displayName
      .split(/\s+|_+/)
      .map((part) => part[0] ?? '')
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 2) || defaultPlayerState.profile.avatarLabel
  )
}

function normalizePlayerRole(role?: string | null): PlayerRole {
  if (role === 'admin' || role === 'tester' || role === 'player') return role
  return defaultPlayerState.profile.role
}

function normalizePlayerState(state?: Partial<PlayerState> | null): PlayerState {
  const displayName = state?.profile?.displayName?.trim() || defaultPlayerState.profile.displayName

  return {
    profile: {
      displayName,
      playerId: state?.profile?.playerId?.trim() || defaultPlayerState.profile.playerId,
      title: state?.profile?.title?.trim() || defaultPlayerState.profile.title,
      avatarLabel: normalizeAvatarLabel(state?.profile?.avatarLabel, displayName),
      role: normalizePlayerRole(state?.profile?.role),
    },
    economy: {
      gems: Number.isFinite(state?.economy?.gems)
        ? Math.max(0, Math.floor(state!.economy!.gems))
        : defaultPlayerState.economy.gems,
      gold: Number.isFinite(state?.economy?.gold)
        ? Math.max(0, Math.floor(state!.economy!.gold))
        : defaultPlayerState.economy.gold,
    },
    settings: {
      accountLinks: {
        ...defaultPlayerState.settings.accountLinks,
        ...(state?.settings?.accountLinks ?? {}),
      },
      audio: {
        ...defaultPlayerState.settings.audio,
        ...(state?.settings?.audio ?? {}),
      },
      graphics: {
        ...defaultPlayerState.settings.graphics,
        ...(state?.settings?.graphics ?? {}),
      },
      notifications: {
        ...defaultPlayerState.settings.notifications,
        ...(state?.settings?.notifications ?? {}),
      },
      gameplay: {
        ...defaultPlayerState.settings.gameplay,
        ...(state?.settings?.gameplay ?? {}),
      },
    },
  }
}

function emitChange() {
  listeners.forEach((listener) => listener())
}

function readPlayerStateFromStorage() {
  if (!canUseLocalStorage()) return cloneState(defaultPlayerState)

  try {
    const raw = window.localStorage.getItem(playerStateStorageKey)
    if (!raw) return cloneState(defaultPlayerState)
    return normalizePlayerState(JSON.parse(raw) as Partial<PlayerState>)
  } catch {
    return cloneState(defaultPlayerState)
  }
}

function ensureStorageListener() {
  if (storageListenerBound || typeof window === 'undefined') return

  window.addEventListener('storage', (event) => {
    if (event.key !== playerStateStorageKey) return
    cachedPlayerState = readPlayerStateFromStorage()
    emitChange()
  })

  storageListenerBound = true
}

export function readPlayerState() {
  if (!cachedPlayerState) {
    cachedPlayerState = readPlayerStateFromStorage()
  }

  return cachedPlayerState
}

function writePlayerState(state: PlayerState) {
  const next = normalizePlayerState(state)

  if (canUseLocalStorage()) {
    try {
      window.localStorage.setItem(playerStateStorageKey, JSON.stringify(next))
    } catch {
      // Ignore storage write failures in local mock mode.
    }
  }

  cachedPlayerState = next
  emitChange()
  return next
}

export function savePlayerState(state: PlayerState) {
  return writePlayerState(state)
}

export function updatePlayerState(mutator: (state: PlayerState) => void) {
  const next = cloneState(readPlayerState())
  mutator(next)
  return writePlayerState(next)
}

function subscribe(listener: () => void) {
  ensureStorageListener()
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function usePlayerState() {
  return useSyncExternalStore(subscribe, readPlayerState, () => defaultPlayerState)
}

export function readPlayerProfile() {
  return readPlayerState().profile
}

export function readPlayerEconomy() {
  return readPlayerState().economy
}

export function readPlayerSettings() {
  return readPlayerState().settings
}

export function formatPremiumCurrency(value: number) {
  return Math.max(0, Math.floor(value)).toLocaleString()
}

export function formatSoftCurrency(value: number) {
  return `$${Math.max(0, Math.floor(value)).toLocaleString()}`
}
