/**
 * Unlock Missions — permanent progression that gates fighter availability.
 * Distinct from daily/weekly Quests (store.ts) which reward Cursed Coins.
 *
 * Definitions live here client-side; no DB table needed.
 * Storage: localStorage key 'ca-unlock-missions-v1'.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type UnlockObjective =
  | { type: 'win_with_fighter'; fighterId: string; count: number }
  | { type: 'win_streak'; count: number }
  | { type: 'reach_lp'; lp: number }

export type UnlockMissionDef = {
  id: string
  name: string
  description: string
  /** Category grouping shown on the missions index page */
  section: string
  objective: UnlockObjective
  reward: { fighterId: string }
  /** Mission id that must be completed before this one is visible */
  requires?: string
}

export type UnlockMissionProgress = {
  progress: number
  completed: boolean
}

type UnlockStore = {
  version: 1
  missions: Record<string, UnlockMissionProgress>
}

// ── Starters — always unlocked, no mission needed ─────────────────────────────

export const STARTER_FIGHTER_IDS: readonly string[] = ['yuji', 'megumi', 'nobara']

// ── Mission Definitions ───────────────────────────────────────────────────────

export const UNLOCK_MISSION_DEFS: UnlockMissionDef[] = [
  {
    id: 'unlock-todo',
    name: 'Divergent Fist',
    description: 'Win 3 matches using Yuji Itadori. Todo only fights alongside someone worth his time.',
    section: 'Starter Missions',
    objective: { type: 'win_with_fighter', fighterId: 'yuji', count: 3 },
    reward: { fighterId: 'todo' },
  },
]

// ── Storage ───────────────────────────────────────────────────────────────────

const UNLOCK_STORE_KEY = 'ca-unlock-missions-v1'

function readRaw(): UnlockStore {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(UNLOCK_STORE_KEY) : null
    if (!raw) return createDefault()
    const parsed = JSON.parse(raw) as Partial<UnlockStore>
    if (parsed.version !== 1) return createDefault()
    return parsed as UnlockStore
  } catch {
    return createDefault()
  }
}

function writeRaw(data: UnlockStore): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(UNLOCK_STORE_KEY, JSON.stringify(data))
    }
  } catch {
    // ignore
  }
}

function createDefault(): UnlockStore {
  return { version: 1, missions: {} }
}

// ── Public read API ───────────────────────────────────────────────────────────

export function getUnlockMissionProgress(missionId: string): UnlockMissionProgress {
  const data = readRaw()
  return data.missions[missionId] ?? { progress: 0, completed: false }
}

export function getAllUnlockMissionProgress(): Record<string, UnlockMissionProgress> {
  return readRaw().missions
}

/** Fighter IDs the current player can use: starters + mission reward unlocks. */
export function getUnlockedFighterIds(): string[] {
  const data = readRaw()
  const unlocked = new Set<string>(STARTER_FIGHTER_IDS)
  for (const def of UNLOCK_MISSION_DEFS) {
    if (data.missions[def.id]?.completed) {
      unlocked.add(def.reward.fighterId)
    }
  }
  return [...unlocked]
}

/**
 * Returns the unlock mission that rewards a given fighter, or null if
 * the fighter is a starter or has no associated mission.
 */
export function getUnlockMissionForFighter(fighterId: string): UnlockMissionDef | null {
  if (STARTER_FIGHTER_IDS.includes(fighterId)) return null
  return UNLOCK_MISSION_DEFS.find((d) => d.reward.fighterId === fighterId) ?? null
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

export type BattleUnlockContext = {
  won: boolean
  teamIds: string[]
  lpAfter: number
  currentStreak: number
}

/**
 * Evaluate all incomplete missions against the result of a just-finished
 * battle. Returns the ids of any missions newly completed this match.
 * Called from matches.ts after settlement.
 */
export function evaluateUnlockMissions(ctx: BattleUnlockContext): string[] {
  const data = readRaw()
  const newlyCompleted: string[] = []

  for (const def of UNLOCK_MISSION_DEFS) {
    const current = data.missions[def.id] ?? { progress: 0, completed: false }
    if (current.completed) continue

    // Check prerequisite
    if (def.requires) {
      const prereq = data.missions[def.requires]
      if (!prereq?.completed) continue
    }

    let newProgress = current.progress
    let justCompleted = false

    switch (def.objective.type) {
      case 'win_with_fighter': {
        if (ctx.won && ctx.teamIds.includes(def.objective.fighterId)) {
          newProgress = Math.min(current.progress + 1, def.objective.count)
        }
        justCompleted = newProgress >= def.objective.count
        break
      }
      case 'win_streak': {
        // streak is evaluated live from the post-match snapshot, not incremented
        newProgress = ctx.currentStreak
        justCompleted = ctx.currentStreak >= def.objective.count
        break
      }
      case 'reach_lp': {
        newProgress = ctx.lpAfter
        justCompleted = ctx.lpAfter >= def.objective.lp
        break
      }
    }

    if (newProgress !== current.progress || justCompleted !== current.completed) {
      data.missions[def.id] = { progress: newProgress, completed: justCompleted }
      if (justCompleted) newlyCompleted.push(def.id)
    }
  }

  writeRaw(data)
  return newlyCompleted
}

// ── Progress label helpers ────────────────────────────────────────────────────

export function getObjectiveProgressLabel(def: UnlockMissionDef, progress: UnlockMissionProgress): string {
  switch (def.objective.type) {
    case 'win_with_fighter':
      return `${Math.min(progress.progress, def.objective.count)}/${def.objective.count} wins`
    case 'win_streak':
      return `${Math.min(progress.progress, def.objective.count)}/${def.objective.count} streak`
    case 'reach_lp':
      return `${progress.progress}/${def.objective.lp} LP`
  }
}

/** Human-readable mission goal line, e.g. "Win 3 matches with Yuji Itadori (3/3)" */
export function getObjectiveGoalLine(def: UnlockMissionDef, progress: UnlockMissionProgress): string {
  switch (def.objective.type) {
    case 'win_with_fighter': {
      const done = Math.min(progress.progress, def.objective.count)
      return `Win ${def.objective.count} matches with ${def.objective.fighterId.charAt(0).toUpperCase() + def.objective.fighterId.slice(1)} (${done}/${def.objective.count})`
    }
    case 'win_streak': {
      const done = Math.min(progress.progress, def.objective.count)
      return `Achieve a ${def.objective.count}-win streak (${done}/${def.objective.count})`
    }
    case 'reach_lp':
      return `Reach ${def.objective.lp} LP (${progress.progress}/${def.objective.lp})`
  }
}
