import type { BattleFighterTemplate } from '@/features/battle/types.ts'

const draftContentKey = 'ca-battle-content-draft-v1'
const publishedContentKey = 'ca-battle-content-published-v1'

export type BattleContentSetup = {
  playerTeamIds: string[]
  enemyTeamIds: string[]
}

export type BattleContentSnapshot = {
  roster: BattleFighterTemplate[]
  defaultSetup: BattleContentSetup
  updatedAt: number
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function cloneSnapshot(snapshot: BattleContentSnapshot): BattleContentSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as BattleContentSnapshot
}

function readStorage(key: string): BattleContentSnapshot | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as BattleContentSnapshot
  } catch {
    return null
  }
}

function writeStorage(key: string, snapshot: BattleContentSnapshot) {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot))
  } catch {
    // Ignore storage write failures in local tool mode.
  }
}

export function createContentSnapshot(roster: BattleFighterTemplate[], defaultSetup: BattleContentSetup): BattleContentSnapshot {
  return {
    roster: JSON.parse(JSON.stringify(roster)) as BattleFighterTemplate[],
    defaultSetup: {
      playerTeamIds: defaultSetup.playerTeamIds.slice(),
      enemyTeamIds: defaultSetup.enemyTeamIds.slice(),
    },
    updatedAt: Date.now(),
  }
}

export function readDraftBattleContent(fallback: BattleContentSnapshot) {
  return cloneSnapshot(readStorage(draftContentKey) ?? fallback)
}

export function saveDraftBattleContent(snapshot: BattleContentSnapshot) {
  const next = { ...cloneSnapshot(snapshot), updatedAt: Date.now() }
  writeStorage(draftContentKey, next)
  return next
}

export function clearDraftBattleContent() {
  if (!canUseLocalStorage()) return
  window.localStorage.removeItem(draftContentKey)
}

export function readPublishedBattleContent(fallback: BattleContentSnapshot) {
  return cloneSnapshot(readStorage(publishedContentKey) ?? fallback)
}

export function clearPublishedBattleContent() {
  if (!canUseLocalStorage()) return
  window.localStorage.removeItem(publishedContentKey)
}

export function savePublishedBattleContent(snapshot: BattleContentSnapshot) {
  const next = { ...cloneSnapshot(snapshot), updatedAt: Date.now() }
  writeStorage(publishedContentKey, next)
  return next
}
