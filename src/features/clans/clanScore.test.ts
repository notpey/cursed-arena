import { describe, expect, it } from 'vitest'
import { calculateClanScoreFromMembers } from '@/features/clans/mockData'
import type { ClanMember } from '@/features/clans/types'

function member(index: number, experience: number, ranked = true): ClanMember {
  return {
    playerId: `p${index}`,
    displayName: `Player ${index}`,
    role: 'member',
    level: 10,
    rankTitle: 'Grade 4 Sorcerer',
    experience,
    ladderRank: ranked ? index : null,
    wins: 0,
    losses: 0,
    joinedAt: new Date(0).toISOString(),
  }
}

describe('calculateClanScoreFromMembers', () => {
  it('uses only the top 10 active ranked members', () => {
    const members = [
      ...Array.from({ length: 12 }, (_, index) => member(index + 1, 1000 - index)),
      member(99, 99999, false),
    ]

    expect(calculateClanScoreFromMembers(members)).toBe(9955)
  })
})
