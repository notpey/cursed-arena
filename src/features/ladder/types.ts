export type SorcererLadderEntry = {
  playerId: string
  displayName: string
  avatarUrl?: string | null
  experience: number
  level: number
  rankTitle: string
  ladderRank: number | null
  wins: number
  losses: number
  winRate: number
  currentStreak: number
  clanId?: string | null
  clanName?: string | null
  clanTag?: string | null
  clanAvatarUrl?: string | null
}

export type ClanLadderEntry = {
  clanId: string
  clanName: string
  clanTag: string
  clanAvatarUrl?: string | null
  clanScore: number
  ladderRank: number | null
  memberCount: number
  activeMemberCount: number
  averageLevel: number
  topSorcerer: {
    playerId: string
    displayName: string
    avatarUrl?: string | null
    experience: number
    level: number
    rankTitle: string
    ladderRank: number | null
  } | null
  wins?: number
  losses?: number
  currentStreak?: number
}
