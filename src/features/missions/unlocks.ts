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
  // ── Starter Missions ─────────────────────────────────────────────────────────
  {
    id: 'unlock-todo',
    name: 'Divergent Fist',
    description: 'Win 3 matches using Yuji Itadori. Todo only fights alongside someone worth his time.',
    section: 'Starter Missions',
    objective: { type: 'win_with_fighter', fighterId: 'yuji', count: 3 },
    reward: { fighterId: 'todo' },
  },
  {
    id: 'unlock-junpei',
    name: 'Moon Dregs',
    description: 'Win 3 matches using Nobara Kugisaki. Junpei gravitated toward those who saw the world differently.',
    section: 'Starter Missions',
    objective: { type: 'win_with_fighter', fighterId: 'nobara', count: 3 },
    reward: { fighterId: 'junpei' },
  },
  {
    id: 'unlock-miwa',
    name: 'Simple Domain',
    description: 'Win 3 matches using Megumi Fushiguro. Miwa respects sorcerers who fight with what they have.',
    section: 'Starter Missions',
    objective: { type: 'win_with_fighter', fighterId: 'megumi', count: 3 },
    reward: { fighterId: 'miwa' },
  },

  // ── Tokyo Campus Missions ─────────────────────────────────────────────────────
  {
    id: 'unlock-nanami',
    name: '7:3 Ratio',
    description: 'Achieve a 3-win streak. Nanami only invests his time where the odds are in his favor.',
    section: 'Tokyo Campus Missions',
    objective: { type: 'win_streak', count: 3 },
    reward: { fighterId: 'nanami' },
  },
  {
    id: 'unlock-maki',
    name: 'No Cursed Energy Required',
    description: 'Win 5 matches using Megumi Fushiguro. Maki admires those who work around their limitations.',
    section: 'Tokyo Campus Missions',
    objective: { type: 'win_with_fighter', fighterId: 'megumi', count: 5 },
    reward: { fighterId: 'maki' },
    requires: 'unlock-miwa',
  },
  {
    id: 'unlock-toge',
    name: 'Cursed Speech',
    description: 'Win 5 matches using Yuji Itadori. Inumaki keeps his words for those who can keep up.',
    section: 'Tokyo Campus Missions',
    objective: { type: 'win_with_fighter', fighterId: 'yuji', count: 5 },
    reward: { fighterId: 'toge' },
    requires: 'unlock-todo',
  },
  {
    id: 'unlock-panda',
    name: 'Three Cores',
    description: 'Win 5 matches using Nobara Kugisaki. Panda respects grit above all else.',
    section: 'Tokyo Campus Missions',
    objective: { type: 'win_with_fighter', fighterId: 'nobara', count: 5 },
    reward: { fighterId: 'panda' },
    requires: 'unlock-junpei',
  },
  {
    id: 'unlock-shoko',
    name: 'Reverse Cursed Technique',
    description: 'Achieve a 5-win streak. Shoko only heals those who prove they can stay alive long enough.',
    section: 'Tokyo Campus Missions',
    objective: { type: 'win_streak', count: 5 },
    reward: { fighterId: 'shoko' },
    requires: 'unlock-nanami',
  },
  {
    id: 'unlock-yaga',
    name: 'Cursed Corpse Commander',
    description: 'Reach 500 LP. Yaga only opens his workshop to sorcerers who have proven themselves on the ranked ladder.',
    section: 'Tokyo Campus Missions',
    objective: { type: 'reach_lp', lp: 500 },
    reward: { fighterId: 'yaga' },
  },
  {
    id: 'unlock-ijichi',
    name: 'Curtain Call',
    description: 'Reach 800 LP. Ijichi maintains barriers for those who have demonstrated they deserve protection.',
    section: 'Tokyo Campus Missions',
    objective: { type: 'reach_lp', lp: 800 },
    reward: { fighterId: 'ijichi' },
    requires: 'unlock-yaga',
  },

  // ── Kyoto Campus Missions ─────────────────────────────────────────────────────
  {
    id: 'unlock-noritoshi',
    name: 'Piercing Blood',
    description: 'Win 5 matches using Todo. Noritoshi values precision and discipline in an ally.',
    section: 'Kyoto Campus Missions',
    objective: { type: 'win_with_fighter', fighterId: 'todo', count: 5 },
    reward: { fighterId: 'noritoshi' },
    requires: 'unlock-todo',
  },
  {
    id: 'unlock-momo',
    name: 'Aerial Support',
    description: 'Win 5 matches using Miwa. Momo fights for those who fight for their own reasons.',
    section: 'Kyoto Campus Missions',
    objective: { type: 'win_with_fighter', fighterId: 'miwa', count: 5 },
    reward: { fighterId: 'momo' },
    requires: 'unlock-miwa',
  },
  {
    id: 'unlock-mai',
    name: 'Reserved Fire',
    description: 'Win 5 matches using Maki. Mai would rather die than admit she was impressed — but she was.',
    section: 'Kyoto Campus Missions',
    objective: { type: 'win_with_fighter', fighterId: 'maki', count: 5 },
    reward: { fighterId: 'mai' },
    requires: 'unlock-maki',
  },
  {
    id: 'unlock-mechamaru',
    name: 'Remote Artillery',
    description: 'Achieve a 7-win streak. Mechamaru watched every match from afar. He has finally seen enough.',
    section: 'Kyoto Campus Missions',
    objective: { type: 'win_streak', count: 7 },
    reward: { fighterId: 'mechamaru' },
  },

  // ── Special Grade Missions ────────────────────────────────────────────────────
  {
    id: 'unlock-gojo',
    name: 'The Honored One',
    description: 'Reach 1500 LP. Gojo only acknowledges sorcerers who have genuinely climbed.',
    section: 'Special Grade Missions',
    objective: { type: 'reach_lp', lp: 1500 },
    reward: { fighterId: 'gojo' },
  },
  {
    id: 'unlock-sukuna',
    name: 'King of Curses',
    description: 'Reach 2500 LP. The King of Curses surfaces for no one — until you become someone worth consuming.',
    section: 'Special Grade Missions',
    objective: { type: 'reach_lp', lp: 2500 },
    reward: { fighterId: 'sukuna' },
    requires: 'unlock-gojo',
  },

  // ── Disaster Curse Missions ───────────────────────────────────────────────────
  {
    id: 'unlock-jogo',
    name: 'Volcanic Curse',
    description: 'Win 5 matches using Sukuna. Only those who carry the King\'s power earn Jogo\'s respect.',
    section: 'Disaster Curse Missions',
    objective: { type: 'win_with_fighter', fighterId: 'sukuna', count: 5 },
    reward: { fighterId: 'jogo' },
    requires: 'unlock-sukuna',
  },
  {
    id: 'unlock-hanami',
    name: 'Root and Branch',
    description: 'Achieve a 10-win streak. Hanami has been watching. The strong endure.',
    section: 'Disaster Curse Missions',
    objective: { type: 'win_streak', count: 10 },
    reward: { fighterId: 'hanami' },
  },
  {
    id: 'unlock-mahito',
    name: 'Idle Transfiguration',
    description: 'Reach 3500 LP. Mahito finds humans most interesting when they have truly suffered for something.',
    section: 'Disaster Curse Missions',
    objective: { type: 'reach_lp', lp: 3500 },
    reward: { fighterId: 'mahito' },
    requires: 'unlock-sukuna',
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

export function getAllUnlockMissionProgress(): Record<string, UnlockMissionProgress> {
  return readRaw().missions
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
  /** Total experience after the match — replaces lpAfter. */
  experienceAfter: number
  currentStreak: number
}

/**
 * Evaluate all incomplete missions against the result of a just-finished
 * battle. Returns the ids of any missions newly completed this match.
 * Called from matches.ts after settlement.
 */
function evaluateUnlockMissions(ctx: BattleUnlockContext): string[] {
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
        newProgress = ctx.experienceAfter
        justCompleted = ctx.experienceAfter >= def.objective.lp
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

export type EvaluateUnlockMissionsResult = {
  newlyCompletedIds: string[]
  updatedProgress: Record<string, UnlockMissionProgress>
}

/**
 * Like evaluateUnlockMissions but returns full updated progress alongside
 * newly completed IDs. Used by the Supabase sync path in matches.ts.
 */
export function evaluateAndGetUnlockMissions(ctx: BattleUnlockContext): EvaluateUnlockMissionsResult {
  const newlyCompletedIds = evaluateUnlockMissions(ctx)
  return { newlyCompletedIds, updatedProgress: readRaw().missions }
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

const FIGHTER_DISPLAY_NAMES: Record<string, string> = {
  yuji: 'Yuji Itadori',
  megumi: 'Megumi Fushiguro',
  nobara: 'Nobara Kugisaki',
  todo: 'Aoi Todo',
  nanami: 'Kento Nanami',
  maki: 'Maki Zen\'in',
  toge: 'Toge Inumaki',
  panda: 'Panda',
  shoko: 'Shoko Ieiri',
  yaga: 'Masamichi Yaga',
  ijichi: 'Kiyotaka Ijichi',
  miwa: 'Kasumi Miwa',
  momo: 'Momo Nishimiya',
  mai: 'Mai Zen\'in',
  noritoshi: 'Noritoshi Kamo',
  mechamaru: 'Mechamaru',
  junpei: 'Junpei Yoshino',
  gojo: 'Satoru Gojo',
  sukuna: 'Ryomen Sukuna',
  jogo: 'Jogo',
  hanami: 'Hanami',
  mahito: 'Mahito',
}

function fighterDisplayName(id: string): string {
  return FIGHTER_DISPLAY_NAMES[id] ?? (id.charAt(0).toUpperCase() + id.slice(1))
}

/** Human-readable mission goal line, e.g. "Win 3 matches with Yuji Itadori (3/3)" */
export function getObjectiveGoalLine(def: UnlockMissionDef, progress: UnlockMissionProgress): string {
  switch (def.objective.type) {
    case 'win_with_fighter': {
      const done = Math.min(progress.progress, def.objective.count)
      return `Win ${def.objective.count} matches with ${fighterDisplayName(def.objective.fighterId)} (${done}/${def.objective.count})`
    }
    case 'win_streak': {
      const done = Math.min(progress.progress, def.objective.count)
      return `Achieve a ${def.objective.count}-win streak (${done}/${def.objective.count})`
    }
    case 'reach_lp':
      return `Reach ${def.objective.lp} LP (${progress.progress}/${def.objective.lp})`
  }
}
