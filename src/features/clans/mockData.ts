import type { ClanDetail, ClanInvitation, ClanMember, ClanSummary } from '@/features/clans/types'

const now = Date.now()

export const mockClanMembers: Record<string, ClanMember[]> = {
  'tokyo-shadow': [
    { playerId: 'mock-user-1', displayName: 'Fushiguro', role: 'leader', level: 47, rankTitle: 'The Strongest', experience: 52340, ladderRank: 1, wins: 311, losses: 91, joinedAt: new Date(now - 1000 * 60 * 60 * 24 * 90).toISOString() },
    { playerId: 'mock-user-2', displayName: 'Nail Resonance', role: 'officer', level: 38, rankTitle: 'Special Grade Sorcerer', experience: 30440, ladderRank: 22, wins: 201, losses: 88, joinedAt: new Date(now - 1000 * 60 * 60 * 24 * 80).toISOString() },
    { playerId: 'mock-user-3', displayName: 'Black Flash', role: 'member', level: 35, rankTitle: 'Special Grade Candidate', experience: 26420, ladderRank: 48, wins: 164, losses: 72, joinedAt: new Date(now - 1000 * 60 * 60 * 24 * 35).toISOString() },
  ],
  'curtain-zero': [
    { playerId: 'mock-user-4', displayName: 'Curtain Maker', role: 'leader', level: 41, rankTitle: 'Domain Expansion User', experience: 36520, ladderRank: 9, wins: 255, losses: 113, joinedAt: new Date(now - 1000 * 60 * 60 * 24 * 71).toISOString() },
    { playerId: 'mock-user-5', displayName: 'Binding Vow', role: 'member', level: 31, rankTitle: 'Special Grade Candidate', experience: 21980, ladderRank: 104, wins: 119, losses: 66, joinedAt: new Date(now - 1000 * 60 * 60 * 24 * 21).toISOString() },
  ],
  'hollow-wick': [
    { playerId: 'mock-user-6', displayName: 'Hollow Wick', role: 'leader', level: 28, rankTitle: 'Grade 1 Sorcerer', experience: 16620, ladderRank: 260, wins: 87, losses: 58, joinedAt: new Date(now - 1000 * 60 * 60 * 24 * 14).toISOString() },
  ],
}

function summarizeMembers(members: ClanMember[]) {
  const ranked = [...members].filter((member) => member.ladderRank !== null).sort((a, b) => b.experience - a.experience)
  const topTen = ranked.slice(0, 10)
  const clanScore = topTen.reduce((sum, member) => sum + member.experience, 0)
  const averageLevel = members.length ? Math.round(members.reduce((sum, member) => sum + member.level, 0) / members.length) : 0
  return { topSorcerer: ranked[0] ?? null, activeMemberCount: ranked.length, clanScore, averageLevel }
}

export function calculateClanScoreFromMembers(members: ClanMember[]) {
  return [...members]
    .filter((member) => member.ladderRank !== null)
    .sort((a, b) => b.experience - a.experience)
    .slice(0, 10)
    .reduce((sum, member) => sum + member.experience, 0)
}

const baseClans: Omit<ClanSummary, 'clanScore' | 'ladderRank' | 'activeMemberCount' | 'averageLevel' | 'topSorcerer'>[] = [
  { clanId: 'tokyo-shadow', name: 'Tokyo Shadow School', tag: 'TSS', description: 'A disciplined roster built around pressure, counters, and clean ladder sets.', visibility: 'public', recruitmentStatus: 'open', leaderId: 'mock-user-1', leaderDisplayName: 'Fushiguro', memberCount: 3, avatarUrl: null, stylePreset: 'red-frame', accentColor: '#fa2742', createdAt: new Date(now - 1000 * 60 * 60 * 24 * 94).toISOString() },
  { clanId: 'curtain-zero', name: 'Curtain Zero', tag: 'C0', description: 'Barrier specialists looking for consistent ranked players and tournament practice.', visibility: 'public', recruitmentStatus: 'invite-only', leaderId: 'mock-user-4', leaderDisplayName: 'Curtain Maker', memberCount: 2, avatarUrl: null, stylePreset: 'teal-frame', accentColor: '#05d8bd', createdAt: new Date(now - 1000 * 60 * 60 * 24 * 73).toISOString() },
  { clanId: 'hollow-wick', name: 'Hollow Wick', tag: 'HW', description: 'Small clan climbing through active sparring and ladder review.', visibility: 'public', recruitmentStatus: 'closed', leaderId: 'mock-user-6', leaderDisplayName: 'Hollow Wick', memberCount: 1, avatarUrl: null, stylePreset: 'gold-frame', accentColor: '#f5a623', createdAt: new Date(now - 1000 * 60 * 60 * 24 * 16).toISOString() },
]

export const mockClans: ClanSummary[] = baseClans
  .map((clan) => {
    const members = mockClanMembers[clan.clanId] ?? []
    const summary = summarizeMembers(members)
    return {
      ...clan,
      memberCount: members.length,
      activeMemberCount: summary.activeMemberCount,
      clanScore: summary.clanScore,
      averageLevel: summary.averageLevel,
      topSorcerer: summary.topSorcerer,
      ladderRank: null,
    }
  })
  .sort((a, b) => b.clanScore - a.clanScore)
  .map((clan, index) => ({ ...clan, ladderRank: index + 1 }))

export const mockClanDetails: ClanDetail[] = mockClans.map((clan) => ({
  ...clan,
  members: mockClanMembers[clan.clanId] ?? [],
}))

export const mockClanInvitations: ClanInvitation[] = [
  { invitationId: 'invite-curtain-zero', clanId: 'curtain-zero', clanName: 'Curtain Zero', clanTag: 'C0', clanAvatarUrl: null, invitedPlayerId: 'local-user', invitedByDisplayName: 'Curtain Maker', status: 'pending', createdAt: new Date(now - 1000 * 60 * 60 * 6).toISOString() },
]
