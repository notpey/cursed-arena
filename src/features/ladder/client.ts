import { fetchMyClan } from '@/features/clans/client'
import { mockClanLadder, mockSorcererLadder } from '@/features/ladder/mockData'
import type { ClanLadderEntry, SorcererLadderEntry } from '@/features/ladder/types'
import { fetchLeaderboard, fetchPlayerRankProfile } from '@/features/ranking/client'

type Result<T> = Promise<{ data: T; error: string | null }>

export async function fetchSorcererLadder(limit = 100): Result<SorcererLadderEntry[]> {
  try {
    const { data, error } = await fetchLeaderboard(limit)
    if (error || data.length === 0) return { data: mockSorcererLadder.slice(0, limit), error: null }
    return {
      data: data.map((entry) => ({
        playerId: entry.id,
        displayName: entry.display_name,
        avatarUrl: null,
        experience: entry.experience,
        level: entry.level,
        rankTitle: entry.rankTitle,
        ladderRank: entry.ladderRank,
        wins: entry.wins,
        losses: entry.losses,
        winRate: Math.round((entry.wins / Math.max(1, entry.wins + entry.losses)) * 100),
        currentStreak: 0,
      })),
      error: null,
    }
  } catch {
    return { data: mockSorcererLadder.slice(0, limit), error: null }
  }
}

export async function fetchMySorcererStanding(userId: string): Result<SorcererLadderEntry | null> {
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
  return { data: mockClanLadder.slice(0, limit), error: null }
}

export async function fetchMyClanStanding(userId: string): Result<ClanLadderEntry | null> {
  const { data: clan } = await fetchMyClan(userId)
  if (!clan) return { data: null, error: null }
  return { data: mockClanLadder.find((entry) => entry.clanId === clan.clanId) ?? null, error: null }
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
