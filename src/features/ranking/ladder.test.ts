import { describe, expect, test } from 'vitest'
import {
  LEVEL_XP_THRESHOLDS,
  LADDER_MAX_LEVEL,
  THE_STRONGEST_MIN_LEVEL,
  LADDER_TOP_RANK_LIMIT,
  getLevelForExperience,
  getExperienceForLevel,
  getLevelProgress,
  getRankTitleForLevel,
  calculateExperienceDelta,
  getLevelShift,
  normalizeExperience,
} from '@/features/ranking/ladder'

// ── LEVEL_XP_THRESHOLDS ────────────────────────────────────────────────────────

describe('LEVEL_XP_THRESHOLDS', () => {
  test('has 50 entries', () => {
    expect(LEVEL_XP_THRESHOLDS.length).toBe(50)
  })

  test('Level 1 = 0 XP', () => {
    expect(LEVEL_XP_THRESHOLDS[0]).toBe(0)
  })

  test('Level 2 = 200 XP', () => {
    expect(LEVEL_XP_THRESHOLDS[1]).toBe(200)
  })

  test('Level 50 = 50,000 XP', () => {
    expect(LEVEL_XP_THRESHOLDS[49]).toBe(50000)
  })

  test('thresholds are strictly increasing', () => {
    for (let i = 1; i < LEVEL_XP_THRESHOLDS.length; i++) {
      expect(LEVEL_XP_THRESHOLDS[i]).toBeGreaterThan(LEVEL_XP_THRESHOLDS[i - 1])
    }
  })
})

// ── getLevelForExperience ─────────────────────────────────────────────────────

describe('getLevelForExperience', () => {
  test('0 XP = Level 1', () => {
    expect(getLevelForExperience(0)).toBe(1)
  })

  test('199 XP = Level 1 (just under Level 2 threshold)', () => {
    expect(getLevelForExperience(199)).toBe(1)
  })

  test('200 XP = Level 2', () => {
    expect(getLevelForExperience(200)).toBe(2)
  })

  test('50,000 XP = Level 50', () => {
    expect(getLevelForExperience(50000)).toBe(50)
  })

  test('100,000 XP = Level 50 (capped at max level)', () => {
    expect(getLevelForExperience(100000)).toBe(50)
  })

  test('negative XP treated as 0 = Level 1', () => {
    expect(getLevelForExperience(-100)).toBe(1)
  })

  test('level never exceeds LADDER_MAX_LEVEL', () => {
    expect(getLevelForExperience(999999)).toBe(LADDER_MAX_LEVEL)
  })
})

// ── getExperienceForLevel ─────────────────────────────────────────────────────

describe('getExperienceForLevel', () => {
  test('Level 1 = 0 XP', () => {
    expect(getExperienceForLevel(1)).toBe(0)
  })

  test('Level 2 = 200 XP', () => {
    expect(getExperienceForLevel(2)).toBe(200)
  })

  test('Level 50 = 50,000 XP', () => {
    expect(getExperienceForLevel(50)).toBe(50000)
  })

  test('clamps below 1 to Level 1', () => {
    expect(getExperienceForLevel(0)).toBe(0)
  })

  test('clamps above 50 to Level 50', () => {
    expect(getExperienceForLevel(51)).toBe(50000)
  })
})

// ── getLevelProgress ──────────────────────────────────────────────────────────

describe('getLevelProgress', () => {
  test('at 0 XP: level 1, 0 progress into level', () => {
    const p = getLevelProgress(0)
    expect(p.level).toBe(1)
    expect(p.experienceIntoLevel).toBe(0)
    expect(p.progressPct).toBe(0)
  })

  test('at 50,000 XP: level 50, 100% progress', () => {
    const p = getLevelProgress(50000)
    expect(p.level).toBe(50)
    expect(p.progressPct).toBe(100)
  })

  test('halfway through a level gives ~50% progress', () => {
    const lvl5Start = LEVEL_XP_THRESHOLDS[4]
    const lvl6Start = LEVEL_XP_THRESHOLDS[5]
    const mid = Math.floor((lvl5Start + lvl6Start) / 2)
    const p = getLevelProgress(mid)
    expect(p.level).toBe(5)
    expect(p.progressPct).toBeGreaterThan(45)
    expect(p.progressPct).toBeLessThan(55)
  })
})

// ── getRankTitleForLevel ──────────────────────────────────────────────────────

describe('getRankTitleForLevel', () => {
  test('Level 1 = Jujutsu Student', () => {
    expect(getRankTitleForLevel(1)).toBe('Jujutsu Student')
  })

  test('Level 5 = Jujutsu Student', () => {
    expect(getRankTitleForLevel(5)).toBe('Jujutsu Student')
  })

  test('Level 6 = Grade 4 Sorcerer', () => {
    expect(getRankTitleForLevel(6)).toBe('Grade 4 Sorcerer')
  })

  test('Level 10 = Grade 4 Sorcerer', () => {
    expect(getRankTitleForLevel(10)).toBe('Grade 4 Sorcerer')
  })

  test('Level 26 = Grade 1 Sorcerer', () => {
    expect(getRankTitleForLevel(26)).toBe('Grade 1 Sorcerer')
  })

  test('Level 46 = Honored One by default', () => {
    expect(getRankTitleForLevel(46)).toBe('Honored One')
  })

  test('Level 50 = Honored One by default', () => {
    expect(getRankTitleForLevel(50)).toBe('Honored One')
  })

  test('Level 46 + Rank #1 = The Strongest', () => {
    expect(getRankTitleForLevel(46, { ladderRank: 1 })).toBe('The Strongest')
  })

  test('Level 50 + Rank #1 = The Strongest', () => {
    expect(getRankTitleForLevel(50, { ladderRank: 1 })).toBe('The Strongest')
  })

  test('Level 45 + Rank #1 does NOT give The Strongest', () => {
    expect(getRankTitleForLevel(45, { ladderRank: 1 })).not.toBe('The Strongest')
    expect(getRankTitleForLevel(45, { ladderRank: 1 })).toBe('Domain Expansion User')
  })

  test('Level 50 + Rank #2 = Honored One (not The Strongest)', () => {
    expect(getRankTitleForLevel(50, { ladderRank: 2 })).toBe('Honored One')
  })

  test('Level 50 + no ladder rank = Honored One', () => {
    expect(getRankTitleForLevel(50, { ladderRank: null })).toBe('Honored One')
  })

  test('rank titles change every five levels', () => {
    // Each band should have a different title than the previous
    const titles = [1, 6, 11, 16, 21, 26, 31, 36, 41, 46].map((l) => getRankTitleForLevel(l))
    const unique = new Set(titles)
    expect(unique.size).toBe(titles.length)
  })
})

// ── THE_STRONGEST_MIN_LEVEL ───────────────────────────────────────────────────

describe('THE_STRONGEST_MIN_LEVEL', () => {
  test('is 46', () => {
    expect(THE_STRONGEST_MIN_LEVEL).toBe(46)
  })
})

// ── LADDER_TOP_RANK_LIMIT ─────────────────────────────────────────────────────

describe('LADDER_TOP_RANK_LIMIT', () => {
  test('is 1000', () => {
    expect(LADDER_TOP_RANK_LIMIT).toBe(1000)
  })
})

// ── calculateExperienceDelta ──────────────────────────────────────────────────

describe('calculateExperienceDelta — wins', () => {
  test('win vs equal-level opponent gives ~75 XP', () => {
    const delta = calculateExperienceDelta({ playerExperience: 1000, opponentExperience: 1000, result: 'win' })
    expect(delta).toBe(75)
  })

  test('win vs higher-level opponent gives more XP than equal-level win', () => {
    const equalWin = calculateExperienceDelta({ playerExperience: 1000, opponentExperience: 1000, result: 'win' })
    const higherWin = calculateExperienceDelta({ playerExperience: 1000, opponentExperience: 9000, result: 'win' })
    expect(higherWin).toBeGreaterThan(equalWin)
  })

  test('win vs lower-level opponent gives less XP than equal-level win', () => {
    const equalWin = calculateExperienceDelta({ playerExperience: 9000, opponentExperience: 9000, result: 'win' })
    const lowerWin = calculateExperienceDelta({ playerExperience: 9000, opponentExperience: 200, result: 'win' })
    expect(lowerWin).toBeLessThan(equalWin)
  })

  test('win XP gain is at least 15 (minimum clamp)', () => {
    // Extreme: very high player vs level 1 opponent
    const delta = calculateExperienceDelta({ playerExperience: 50000, opponentExperience: 0, result: 'win' })
    expect(delta).toBeGreaterThanOrEqual(15)
  })

  test('win XP gain is at most 600 (maximum clamp)', () => {
    // Extreme: level 1 player vs level 50 opponent
    const delta = calculateExperienceDelta({ playerExperience: 0, opponentExperience: 50000, result: 'win' })
    expect(delta).toBeLessThanOrEqual(600)
  })

  test('draw returns 0', () => {
    const delta = calculateExperienceDelta({ playerExperience: 5000, opponentExperience: 5000, result: 'draw' })
    expect(delta).toBe(0)
  })
})

describe('calculateExperienceDelta — losses', () => {
  test('loss vs higher-level opponent loses less than loss vs equal-level', () => {
    const equalLoss = calculateExperienceDelta({ playerExperience: 5000, opponentExperience: 5000, result: 'loss' })
    const higherLoss = calculateExperienceDelta({ playerExperience: 5000, opponentExperience: 50000, result: 'loss' })
    expect(Math.abs(higherLoss)).toBeLessThan(Math.abs(equalLoss))
  })

  test('loss vs lower-level opponent loses more than loss vs equal-level', () => {
    const equalLoss = calculateExperienceDelta({ playerExperience: 5000, opponentExperience: 5000, result: 'loss' })
    const lowerLoss = calculateExperienceDelta({ playerExperience: 5000, opponentExperience: 0, result: 'loss' })
    expect(Math.abs(lowerLoss)).toBeGreaterThan(Math.abs(equalLoss))
  })

  test('loss delta is negative or zero', () => {
    const delta = calculateExperienceDelta({ playerExperience: 1000, opponentExperience: 1000, result: 'loss' })
    expect(delta).toBeLessThanOrEqual(0)
  })

  test('XP loss magnitude is clamped between 0 and 600', () => {
    const extremeLoss = calculateExperienceDelta({ playerExperience: 0, opponentExperience: 0, result: 'loss' })
    expect(Math.abs(extremeLoss)).toBeLessThanOrEqual(600)
    expect(Math.abs(extremeLoss)).toBeGreaterThanOrEqual(0)
  })

  test('Level 1–25 beginner protection reduces XP loss vs equal opponent', () => {
    // Level 1 player (0 XP) loses to equal-level opponent
    const beginnerLoss = calculateExperienceDelta({ playerExperience: 0, opponentExperience: 0, result: 'loss' })
    // Level 40+ player loses to equal-level opponent — no protection, full loss
    const xpForLv40 = LEVEL_XP_THRESHOLDS[39] // exact threshold for level 40
    const veteranLoss = calculateExperienceDelta({ playerExperience: xpForLv40, opponentExperience: xpForLv40, result: 'loss' })
    // Both are equal-level so level difference is 0, same rawLoss=55.
    // Beginner gets 50% protection: |beginnerLoss| = 28, |veteranLoss| = 55.
    expect(Math.abs(beginnerLoss)).toBeLessThan(Math.abs(veteranLoss))
  })
})

// ── getLevelShift ─────────────────────────────────────────────────────────────

describe('getLevelShift', () => {
  test('promoted when level increases', () => {
    expect(getLevelShift(5, 6)).toBe('promoted')
  })

  test('demoted when level decreases', () => {
    expect(getLevelShift(6, 5)).toBe('demoted')
  })

  test('steady when level unchanged', () => {
    expect(getLevelShift(10, 10)).toBe('steady')
  })
})

// ── normalizeExperience ───────────────────────────────────────────────────────

describe('normalizeExperience', () => {
  test('XP cannot go below 0', () => {
    expect(normalizeExperience(-100)).toBe(0)
  })

  test('positive XP passes through', () => {
    expect(normalizeExperience(500)).toBe(500)
  })

  test('rounds fractional XP', () => {
    expect(normalizeExperience(100.7)).toBe(101)
  })
})
