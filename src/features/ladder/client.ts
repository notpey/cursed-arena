import { fetchMyClan } from '@/features/clans/client'
import { mockClanLadder, mockSorcererLadder } from '@/features/ladder/mockData'
import type { ClanLadderEntry, SorcererLadderEntry } from '@/features/ladder/types'
import { fetchPlayerRankProfile } from '@/features/ranking/client'
import { getLevelForExperience, getLadderRankTitle } from '@/features/ranking/ladder'
import { getSupabaseClient } from '@/lib/supabase'

type Result<T> = Promise<{ data: T; error: string | null }>

type SorcererLadderRow = {
  player_id: string
  display_name: string
  avatar_url?: string | null
  experience: number
  wins: number
  losses: number
  win_streak: number
  best_streak: number
  clan_id?: string | null
  clan_name?: string | null
  clan_tag?: string | null
  clan_avatar_url?: string | null
}

type ClanLadderRow = {
  clan_id: string
  clan_name: string
  clan_tag: string
  clan_avatar_url?: string | null
  clan_score: number
  member_count: number
  active_member_count: number
  average_level: number
  ladder_rank: number
  top_player_id?: string | null
  top_display_name?: string | null
  top_avatar_url?: string | null
  top_experience?: number | null
  wins?: number | null
  losses?: number | null
}

function shouldUseMock(error?: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('relation') || message.includes('does not exist') || message.includes('schema cache')
}

function mapSorcererRow(row: SorcererLadderRow, index: number): SorcererLadderEntry {
  const ladderRank = index + 1 <= 1000 ? index + 1 : null
  const level = getLevelForExperience(row.experience)
  return {
    playerId: row.player_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? null,
    experience: row.experience,
    level,
    rankTitle: getLadderRankTitle({ level, ladderRank }),
    ladderRank,
    wins: row.wins,
    losses: row.losses,
    winRate: Math.round((row.wins / Math.max(1, row.wins + row.losses)) * 100),
    currentStreak: row.win_streak,
    clanId: row.clan_id ?? null,
    clanName: row.clan_name ?? null,
    clanTag: row.clan_tag ?? null,
    clanAvatarUrl: row.clan_avatar_url ?? null,
  }
}

function mapClanRow(row: ClanLadderRow): ClanLadderEntry {
  const topExperience = row.top_experience ?? 0
  const topLevel = getLevelForExperience(topExperience)
  return {
    clanId: row.clan_id,
    clanName: row.clan_name,
    clanTag: row.clan_tag,
    clanAvatarUrl: row.clan_avatar_url ?? null,
    clanScore: row.clan_score,
    ladderRank: row.ladder_rank,
    memberCount: row.member_count,
    activeMemberCount: row.active_member_count,
    averageLevel: row.average_level,
    topSorcerer: row.top_player_id
      ? {
          playerId: row.top_player_id,
          displayName: row.top_display_name ?? 'Sorcerer',
          avatarUrl: row.top_avatar_url ?? null,
          experience: topExperience,
          level: topLevel,
          rankTitle: getLadderRankTitle({ level: topLevel, ladderRank: null }),
          ladderRank: null,
        }
      : null,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    currentStreak: 0,
  }
}

export async function fetchSorcererLadder(limit = 100): Result<SorcererLadderEntry[]> {
  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client
      .from('sorcerer_ladder_view')
      .select('*')
      .order('experience', { ascending: false })
      .limit(limit)

    if (!error) return { data: ((data ?? []) as SorcererLadderRow[]).map(mapSorcererRow), error: null }
    if (!shouldUseMock(error)) return { data: [], error: error.message }
  }

  return { data: mockSorcererLadder.slice(0, limit), error: null }
}

export async function fetchMySorcererStanding(userId: string): Result<SorcererLadderEntry | null> {
  const client = getSupabaseClient()
  if (client) {
    const ladder = await fetchSorcererLadder(1000)
    const me = ladder.data.find((entry) => entry.playerId === userId)
    if (me) return { data: me, error: null }
  }

  const mock = mockSorcererLadder.find((entry) => entry.playerId === userId) ?? null
  try {
    const { data } = await fetchPlayerRankProfile(userId)
    if (!data) return { data: mock, error: null }
    return {
      data: {
        playerId: data.id,
        displayName: data.display_name,
        avatarUrl: null,
        experience: data.experience,
        level: data.level,
        rankTitle: data.rankTitle,
        ladderRank: data.ladderRank ?? null,
        wins: data.wins,
        losses: data.losses,
        winRate: Math.round((data.wins / Math.max(1, data.wins + data.losses)) * 100),
        currentStreak: data.win_streak,
      },
      error: null,
    }
  } catch {
    return { data: mock, error: null }
  }
}

export async function fetchClanLadder(limit = 100): Result<ClanLadderEntry[]> {
  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client
      .from('clan_ladder_view')
      .select('*')
      .order('clan_score', { ascending: false })
      .limit(limit)

    if (!error) return { data: ((data ?? []) as ClanLadderRow[]).map(mapClanRow), error: null }
    if (!shouldUseMock(error)) return { data: [], error: error.message }
  }

  return { data: mockClanLadder.slice(0, limit), error: null }
}

export async function fetchMyClanStanding(userId: string): Result<ClanLadderEntry | null> {
  const { data: clan } = await fetchMyClan(userId)
  if (!clan) return { data: null, error: null }
  const ladder = await fetchClanLadder(1000)
  return { data: ladder.data.find((entry) => entry.clanId === clan.clanId) ?? null, error: null }
}

export async function searchSorcererLadder(query: string): Result<SorcererLadderEntry[]> {
  const { data } = await fetchSorcererLadder(100)
  const needle = query.trim().toLowerCase()
  return { data: needle ? data.filter((entry) => entry.displayName.toLowerCase().includes(needle)) : data, error: null }
}

export async function searchClanLadder(query: string): Result<ClanLadderEntry[]> {
  const { data } = await fetchClanLadder(100)
  const needle = query.trim().toLowerCase()
  return { data: needle ? data.filter((entry) => `${entry.clanName} ${entry.clanTag}`.toLowerCase().includes(needle)) : data, error: null }
}
