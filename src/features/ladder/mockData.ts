import { mockClans } from '@/features/clans/mockData'
import type { ClanLadderEntry, SorcererLadderEntry } from '@/features/ladder/types'
import { getLadderRankTitle } from '@/features/ranking/ladder'

const rawSorcerers = [
  ['mock-user-1', 'Fushiguro', 52340, 47, 311, 91, 14, 'tokyo-shadow', 'Tokyo Shadow School', 'TSS'],
  ['mock-user-4', 'Curtain Maker', 36520, 41, 255, 113, 4, 'curtain-zero', 'Curtain Zero', 'C0'],
  ['mock-user-2', 'Nail Resonance', 30440, 38, 201, 88, 7, 'tokyo-shadow', 'Tokyo Shadow School', 'TSS'],
  ['mock-user-3', 'Black Flash', 26420, 35, 164, 72, 2, 'tokyo-shadow', 'Tokyo Shadow School', 'TSS'],
  ['mock-user-5', 'Binding Vow', 21980, 31, 119, 66, -1, 'curtain-zero', 'Curtain Zero', 'C0'],
  ['mock-user-6', 'Hollow Wick', 16620, 28, 87, 58, 5, 'hollow-wick', 'Hollow Wick', 'HW'],
] as const

export const mockSorcererLadder: SorcererLadderEntry[] = rawSorcerers.map((row, index) => {
  const [playerId, displayName, experience, level, wins, losses, currentStreak, clanId, clanName, clanTag] = row
  const ladderRank = index + 1
  return {
    playerId,
    displayName,
    avatarUrl: null,
    experience,
    level,
    rankTitle: getLadderRankTitle({ level, ladderRank }),
    ladderRank,
    wins,
    losses,
    winRate: Math.round((wins / Math.max(1, wins + losses)) * 100),
    currentStreak,
    clanId,
    clanName,
    clanTag,
    clanAvatarUrl: null,
  }
})

export const mockClanLadder: ClanLadderEntry[] = mockClans.map((clan) => ({
  clanId: clan.clanId,
  clanName: clan.name,
  clanTag: clan.tag,
  clanAvatarUrl: clan.avatarUrl,
  clanScore: clan.clanScore,
  ladderRank: clan.ladderRank,
  memberCount: clan.memberCount,
  activeMemberCount: clan.activeMemberCount ?? 0,
  averageLevel: clan.averageLevel ?? 0,
  topSorcerer: clan.topSorcerer ?? null,
  wins: clan.topSorcerer ? Math.round(clan.clanScore / 1000) : 0,
  losses: clan.topSorcerer ? Math.round(clan.clanScore / 2800) : 0,
  currentStreak: clan.ladderRank === 1 ? 8 : 2,
}))
