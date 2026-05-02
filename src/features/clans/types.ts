export type ClanRecruitmentStatus = 'open' | 'invite-only' | 'closed'
export type ClanVisibility = 'public' | 'private'
export type ClanMemberRole = 'leader' | 'officer' | 'member'

export type ClanSummary = {
  clanId: string
  name: string
  tag: string
  description: string
  visibility: ClanVisibility
  recruitmentStatus: ClanRecruitmentStatus
  leaderId: string
  leaderDisplayName?: string
  memberCount: number
  activeMemberCount?: number
  clanScore: number
  ladderRank: number | null
  averageLevel?: number
  avatarUrl?: string | null
  stylePreset?: string | null
  accentColor?: string | null
  topSorcerer?: {
    playerId: string
    displayName: string
    avatarUrl?: string | null
    level: number
    rankTitle: string
    experience: number
    ladderRank: number | null
  } | null
  createdAt: string
}

export type ClanMember = {
  playerId: string
  displayName: string
  avatarUrl?: string | null
  role: ClanMemberRole
  level: number
  rankTitle: string
  experience: number
  ladderRank: number | null
  wins: number
  losses: number
  joinedAt: string
}

export type ClanDetail = ClanSummary & {
  members: ClanMember[]
}

export type ClanInvitation = {
  invitationId: string
  clanId: string
  clanName: string
  clanTag: string
  clanAvatarUrl?: string | null
  invitedPlayerId: string
  invitedByDisplayName?: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: string
}

export type CreateClanInput = {
  name: string
  tag: string
  description: string
  visibility: ClanVisibility
  recruitmentStatus: ClanRecruitmentStatus
  leaderId: string
  leaderDisplayName?: string
}
