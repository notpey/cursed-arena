/**
 * Centralized ladder logic: experience, levels, rank titles, and XP delta math.
 *
 * This replaces the LP / Bronze-Diamond tier system with a Naruto-Arena-style
 * experience-and-level system with JJK-themed rank titles.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const LADDER_MAX_LEVEL = 50
export const LADDER_TOP_RANK_LIMIT = 1000
export const THE_STRONGEST_MIN_LEVEL = 46

// ── Level XP thresholds ───────────────────────────────────────────────────────

/**
 * LEVEL_XP_THRESHOLDS[i] is the total XP required to be at level (i + 1).
 * Index 0 = Level 1 = 0 XP.
 * Index 49 = Level 50 = 50,000 XP.
 *
 * Curve uses: threshold(L) = round(50000 * ((L-1)/49)^exponent)
 * Exponent ~2.32 puts level 2 at ~200 XP, then we clamp the endpoints.
 */
export const LEVEL_XP_THRESHOLDS: readonly number[] = (() => {
  const MAX_XP = 50000
  const LEVELS = 50
  // Derived exponent: 50000 * (1/49)^exp = 200 => exp = log(200/50000) / log(1/49)
  const exponent = Math.log(200 / MAX_XP) / Math.log(1 / 49)

  const thresholds: number[] = []
  for (let level = 1; level <= LEVELS; level++) {
    if (level === 1) {
      thresholds.push(0)
    } else if (level === 2) {
      thresholds.push(200)
    } else if (level === LEVELS) {
      thresholds.push(MAX_XP)
    } else {
      const raw = MAX_XP * Math.pow((level - 1) / (LEVELS - 1), exponent)
      thresholds.push(Math.round(raw))
    }
  }

  // Ensure strictly increasing
  for (let i = 1; i < thresholds.length; i++) {
    if (thresholds[i] <= thresholds[i - 1]) {
      thresholds[i] = thresholds[i - 1] + 1
    }
  }

  return thresholds
})()

// ── Level / XP helpers ────────────────────────────────────────────────────────

/** Return the level (1–50) for a given total experience value. */
export function getLevelForExperience(experience: number): number {
  const xp = Math.max(0, experience)
  let level = 1
  for (let i = LADDER_MAX_LEVEL - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]) {
      level = i + 1
      break
    }
  }
  return Math.min(level, LADDER_MAX_LEVEL)
}

/** Return the minimum XP required to reach the given level (1–50). */
export function getExperienceForLevel(level: number): number {
  const clamped = Math.max(1, Math.min(level, LADDER_MAX_LEVEL))
  return LEVEL_XP_THRESHOLDS[clamped - 1]
}

/** Return the XP threshold that starts the next level, or MAX_XP if at cap. */
export function getNextLevelExperience(level: number): number {
  if (level >= LADDER_MAX_LEVEL) return LEVEL_XP_THRESHOLDS[LADDER_MAX_LEVEL - 1]
  return LEVEL_XP_THRESHOLDS[level] // level is 1-based, index is 0-based, so index = level
}

/** Return a detailed breakdown of progress through the current level. */
export function getLevelProgress(experience: number): {
  level: number
  currentLevelExperience: number
  nextLevelExperience: number
  experienceIntoLevel: number
  experienceNeededForNextLevel: number
  progressPct: number
} {
  const xp = Math.max(0, experience)
  const level = getLevelForExperience(xp)
  const currentLevelExperience = getExperienceForLevel(level)
  const nextLevelExperience = getNextLevelExperience(level)
  const experienceIntoLevel = xp - currentLevelExperience
  const experienceNeededForNextLevel = nextLevelExperience - currentLevelExperience
  const progressPct =
    level >= LADDER_MAX_LEVEL
      ? 100
      : Math.min(100, Math.round((experienceIntoLevel / Math.max(1, experienceNeededForNextLevel)) * 100))

  return {
    level,
    currentLevelExperience,
    nextLevelExperience,
    experienceIntoLevel,
    experienceNeededForNextLevel,
    progressPct,
  }
}

// ── Rank titles ───────────────────────────────────────────────────────────────

export type LadderTitleBand = {
  minLevel: number
  maxLevel: number
  title: string
}

const TITLE_BANDS: readonly LadderTitleBand[] = [
  { minLevel: 1,  maxLevel: 5,  title: 'Jujutsu Student' },
  { minLevel: 6,  maxLevel: 10, title: 'Grade 4 Sorcerer' },
  { minLevel: 11, maxLevel: 15, title: 'Grade 3 Sorcerer' },
  { minLevel: 16, maxLevel: 20, title: 'Grade 2 Sorcerer' },
  { minLevel: 21, maxLevel: 25, title: 'Semi-Grade 1 Sorcerer' },
  { minLevel: 26, maxLevel: 30, title: 'Grade 1 Sorcerer' },
  { minLevel: 31, maxLevel: 35, title: 'Special Grade Candidate' },
  { minLevel: 36, maxLevel: 40, title: 'Special Grade Sorcerer' },
  { minLevel: 41, maxLevel: 45, title: 'Domain Expansion User' },
  { minLevel: 46, maxLevel: 50, title: 'Honored One' },
]

/**
 * Return the rank title for a level.
 * If ladderRank is 1 and level >= THE_STRONGEST_MIN_LEVEL, returns "The Strongest".
 */
export function getRankTitleForLevel(
  level: number,
  options?: { ladderRank?: number | null },
): string {
  const clamped = Math.max(1, Math.min(level, LADDER_MAX_LEVEL))

  if (clamped >= THE_STRONGEST_MIN_LEVEL && options?.ladderRank === 1) {
    return 'The Strongest'
  }

  const band = TITLE_BANDS.find((b) => clamped >= b.minLevel && clamped <= b.maxLevel)
  return band?.title ?? 'Jujutsu Student'
}

/** Convenience alias — same as getRankTitleForLevel. */
export function getLadderRankTitle({
  level,
  ladderRank,
}: {
  level: number
  ladderRank?: number | null
}): string {
  return getRankTitleForLevel(level, { ladderRank })
}

// ── Experience delta ──────────────────────────────────────────────────────────

export type ExperienceDeltaInput = {
  playerExperience: number
  opponentExperience: number
  result: 'win' | 'loss' | 'draw'
}

/**
 * Calculate the XP change after a ranked match.
 *
 * Win  : baseWin=75, +12 per level the opponent is above you, min 15, max 600.
 * Loss : baseLoss=55, -12 per level the opponent is above you (smaller loss vs
 *        stronger opponents), clamped 0–600. Players at level ≤25 take only 50%
 *        of the computed loss (beginner protection).
 * Draw : no change.
 *
 * Returns a signed delta (positive for wins, negative or zero for losses/draws).
 */
export function calculateExperienceDelta(input: ExperienceDeltaInput): number {
  const { playerExperience, opponentExperience, result } = input

  if (result === 'draw') return 0

  const playerLevel = getLevelForExperience(playerExperience)
  const opponentLevel = getLevelForExperience(opponentExperience)
  const levelDifference = opponentLevel - playerLevel

  if (result === 'win') {
    const baseWin = 75
    const modifier = levelDifference * 12
    return clamp(baseWin + modifier, 15, 600)
  }

  // result === 'loss'
  const baseLoss = 55
  const modifier = -levelDifference * 12
  const rawLoss = clamp(baseLoss + modifier, 0, 600)
  const protectedLoss = playerLevel <= 25 ? Math.round(rawLoss * 0.5) : rawLoss
  return -protectedLoss
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ── Normalizers ───────────────────────────────────────────────────────────────

/** Clamp experience to [0, ∞). XP can never go below zero. */
export function normalizeExperience(value: number): number {
  return Math.max(0, Math.round(value))
}

/** Classify whether a level change represents a promotion, demotion, or no change. */
export function getLevelShift(
  beforeLevel: number,
  afterLevel: number,
): 'promoted' | 'demoted' | 'steady' {
  if (afterLevel > beforeLevel) return 'promoted'
  if (afterLevel < beforeLevel) return 'demoted'
  return 'steady'
}
