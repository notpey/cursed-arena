/**
 * Mission system — daily/weekly missions with Cursed Coin rewards.
 * Progress is tracked in localStorage with automatic date-based resets.
 */

export type MissionTrack =
  | 'battle_complete'  // any match finished
  | 'battle_win'       // any win
  | 'ranked_battle'    // ranked match finished
  | 'ranked_win'       // ranked win

export type MissionDef = {
  id: string
  type: 'daily' | 'weekly'
  label: string
  goal: number
  reward: number
  track: MissionTrack
}

export type MissionWithProgress = MissionDef & {
  progress: number
  complete: boolean
  claimed: boolean
  progressLabel: string
}

// ── Mission Definitions ───────────────────────────────────────────────────────

export const MISSION_DEFS: MissionDef[] = [
  // Daily
  { id: 'd1', type: 'daily', label: 'Complete 1 Battle', goal: 1, reward: 10, track: 'battle_complete' },
  { id: 'd2', type: 'daily', label: 'Win 1 Battle', goal: 1, reward: 15, track: 'battle_win' },
  { id: 'd3', type: 'daily', label: 'Complete 1 Ranked Match', goal: 1, reward: 20, track: 'ranked_battle' },
  // Weekly
  { id: 'w1', type: 'weekly', label: 'Complete 10 Battles', goal: 10, reward: 50, track: 'battle_complete' },
  { id: 'w2', type: 'weekly', label: 'Win 5 Battles', goal: 5, reward: 60, track: 'battle_win' },
  { id: 'w3', type: 'weekly', label: 'Win 3 Ranked Matches', goal: 3, reward: 75, track: 'ranked_win' },
]

// ── Storage schema ────────────────────────────────────────────────────────────

const MISSIONS_KEY = 'ca-missions-v2'

type PeriodState = {
  date: string           // 'YYYY-MM-DD' — reset anchor
  progress: Record<string, number>
  claimed: string[]      // claimed mission ids
}

type MissionStoreData = {
  version: 2
  coins: number
  daily: PeriodState
  weekly: PeriodState
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function thisWeekMondayStr(): string {
  const d = new Date()
  const day = d.getDay() // 0=Sun, 1=Mon…
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function readRaw(): MissionStoreData {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(MISSIONS_KEY) : null
    if (!raw) return createDefault()
    const parsed = JSON.parse(raw) as Partial<MissionStoreData>
    if (parsed.version !== 2) return createDefault()
    return parsed as MissionStoreData
  } catch {
    return createDefault()
  }
}

function writeRaw(data: MissionStoreData) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MISSIONS_KEY, JSON.stringify(data))
    }
  } catch {
    // ignore
  }
}

function createDefault(): MissionStoreData {
  return {
    version: 2,
    coins: 0,
    daily: { date: todayStr(), progress: {}, claimed: [] },
    weekly: { date: thisWeekMondayStr(), progress: {}, claimed: [] },
  }
}

/** Read data with automatic reset of stale periods. */
function readWithReset(): MissionStoreData {
  const data = readRaw()
  let dirty = false

  if (data.daily.date !== todayStr()) {
    data.daily = { date: todayStr(), progress: {}, claimed: [] }
    dirty = true
  }

  if (data.weekly.date !== thisWeekMondayStr()) {
    data.weekly = { date: thisWeekMondayStr(), progress: {}, claimed: [] }
    dirty = true
  }

  if (dirty) writeRaw(data)
  return data
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Current Cursed Coin balance. */
export function getMissionCoins(): number {
  return readWithReset().coins
}

/** All missions with live progress. */
export function getMissionsWithProgress(): MissionWithProgress[] {
  const data = readWithReset()

  return MISSION_DEFS.map((def) => {
    const period = def.type === 'daily' ? data.daily : data.weekly
    const progress = Math.min(def.goal, period.progress[def.id] ?? 0)
    const complete = progress >= def.goal
    const claimed = period.claimed.includes(def.id)
    return {
      ...def,
      progress,
      complete,
      claimed,
      progressLabel: `${progress}/${def.goal}`,
    }
  })
}

/**
 * Track a battle completion event.
 * - mode: 'ranked' | 'quick' | 'private'
 * - won: whether this player won
 */
export function trackBattleCompleted(mode: 'ranked' | 'quick' | 'private', won: boolean) {
  const data = readWithReset()

  const tracks: MissionTrack[] = ['battle_complete']
  if (won) tracks.push('battle_win')
  if (mode === 'ranked') tracks.push('ranked_battle')
  if (mode === 'ranked' && won) tracks.push('ranked_win')

  let coinsEarned = 0

  for (const def of MISSION_DEFS) {
    if (!tracks.includes(def.track)) continue

    const period = def.type === 'daily' ? data.daily : data.weekly
    const current = period.progress[def.id] ?? 0

    // Auto-claim when goal is reached for the first time
    if (current < def.goal) {
      period.progress[def.id] = current + 1
      const newProgress = current + 1
      if (newProgress >= def.goal && !period.claimed.includes(def.id)) {
        period.claimed.push(def.id)
        coinsEarned += def.reward
      }
    }
  }

  data.coins += coinsEarned
  writeRaw(data)

  return coinsEarned
}

/** Manually claim a completed mission reward. */
export function claimMission(missionId: string): number {
  const def = MISSION_DEFS.find((d) => d.id === missionId)
  if (!def) return 0

  const data = readWithReset()
  const period = def.type === 'daily' ? data.daily : data.weekly
  const progress = period.progress[def.id] ?? 0

  if (progress < def.goal) return 0
  if (period.claimed.includes(def.id)) return 0

  period.claimed.push(def.id)
  data.coins += def.reward
  writeRaw(data)
  return def.reward
}
