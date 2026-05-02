import { uploadPlayerAvatar } from '@/features/avatar/client'
import type { AvatarUploadResult } from '@/features/avatar/validation'
import { mockClanDetails, mockClanInvitations } from '@/features/clans/mockData'
import type { ClanDetail, ClanInvitation, ClanMember, ClanSummary, CreateClanInput } from '@/features/clans/types'
import { getSupabaseClient } from '@/lib/supabase'

const mockMembershipStorageKey = 'ca-mock-clan-membership-v1'
const mockCreatedClansStorageKey = 'ca-mock-created-clans-v1'

type Result<T> = Promise<{ data: T; error: string | null }>

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function getCreatedClans() {
  return readJson<ClanDetail[]>(mockCreatedClansStorageKey, [])
}

function getAllClanDetails() {
  return [...getCreatedClans(), ...mockClanDetails]
}

function getAllClans() {
  return getAllClanDetails().map(({ members, ...summary }) => ({ ...summary, memberCount: members.length }))
}

function readMembership(userId: string) {
  const map = readJson<Record<string, { clanId: string; role: ClanMember['role'] }>>(mockMembershipStorageKey, {})
  return map[userId] ?? null
}

function writeMembership(userId: string, clanId: string, role: ClanMember['role']) {
  const map = readJson<Record<string, { clanId: string; role: ClanMember['role'] }>>(mockMembershipStorageKey, {})
  map[userId] = { clanId, role }
  writeJson(mockMembershipStorageKey, map)
}

function removeMembership(userId: string) {
  const map = readJson<Record<string, { clanId: string; role: ClanMember['role'] }>>(mockMembershipStorageKey, {})
  delete map[userId]
  writeJson(mockMembershipStorageKey, map)
}

export async function fetchMyClan(userId: string): Result<ClanDetail | null> {
  const client = getSupabaseClient()
  if (client) {
    // TODO: Query clans joined through clan_members once Supabase tables/RLS are migrated.
  }

  const membership = readMembership(userId)
  if (!membership) return { data: null, error: null }
  const clan = getAllClanDetails().find((item) => item.clanId === membership.clanId) ?? null
  return { data: clan, error: null }
}

export async function fetchClanDirectory(): Result<ClanSummary[]> {
  return { data: getAllClans(), error: null }
}

export async function fetchClanById(clanId: string): Result<ClanDetail | null> {
  return { data: getAllClanDetails().find((clan) => clan.clanId === clanId) ?? null, error: null }
}

export async function createClan(input: CreateClanInput): Result<ClanDetail | null> {
  const existingMembership = readMembership(input.leaderId)
  if (existingMembership) return { data: null, error: 'You are already in a clan. Leave your current clan before creating a new one.' }

  const all = getAllClanDetails()
  const tag = input.tag.trim().toUpperCase()
  const name = input.name.trim()
  if (all.some((clan) => clan.tag.toUpperCase() === tag)) return { data: null, error: 'That clan tag is already registered.' }
  if (all.some((clan) => clan.name.toLowerCase() === name.toLowerCase())) return { data: null, error: 'That clan name is already registered.' }

  const clanId = `clan-${tag.toLowerCase()}-${Date.now()}`
  const member: ClanMember = {
    playerId: input.leaderId,
    displayName: input.leaderDisplayName ?? 'You',
    role: 'leader',
    level: 1,
    rankTitle: 'Jujutsu Student',
    experience: 0,
    ladderRank: null,
    wins: 0,
    losses: 0,
    joinedAt: new Date().toISOString(),
  }
  const clan: ClanDetail = {
    clanId,
    name,
    tag,
    description: input.description.trim(),
    visibility: input.visibility,
    recruitmentStatus: input.recruitmentStatus,
    leaderId: input.leaderId,
    leaderDisplayName: member.displayName,
    memberCount: 1,
    activeMemberCount: 0,
    clanScore: 0,
    ladderRank: null,
    averageLevel: 1,
    avatarUrl: null,
    stylePreset: null,
    accentColor: null,
    topSorcerer: null,
    createdAt: new Date().toISOString(),
    members: [member],
  }

  writeJson(mockCreatedClansStorageKey, [clan, ...getCreatedClans()])
  writeMembership(input.leaderId, clanId, 'leader')
  return { data: clan, error: null }
}

export async function joinClan(clanId: string, userId: string): Result<ClanDetail | null> {
  if (readMembership(userId)) return { data: null, error: 'Leave your current clan before joining another clan.' }
  const clan = getAllClanDetails().find((item) => item.clanId === clanId) ?? null
  if (!clan) return { data: null, error: 'Clan not found.' }
  if (clan.recruitmentStatus !== 'open') return { data: null, error: 'This clan is not open for direct joins.' }
  writeMembership(userId, clanId, 'member')
  return { data: clan, error: null }
}

export async function leaveClan(clanId: string, userId: string): Result<boolean> {
  const membership = readMembership(userId)
  if (!membership || membership.clanId !== clanId) return { data: false, error: 'You are not a member of this clan.' }
  if (membership.role === 'leader') return { data: false, error: 'You must transfer leadership or disband the clan before leaving.' }
  removeMembership(userId)
  return { data: true, error: null }
}

export async function updateClan(clanId: string, input: Partial<ClanSummary>): Result<ClanDetail | null> {
  const created = getCreatedClans()
  const next = created.map((clan) => (clan.clanId === clanId ? { ...clan, ...input } : clan))
  writeJson(mockCreatedClansStorageKey, next)
  return { data: next.find((clan) => clan.clanId === clanId) ?? null, error: null }
}

export async function fetchClanMembers(clanId: string): Result<ClanMember[]> {
  return { data: getAllClanDetails().find((clan) => clan.clanId === clanId)?.members ?? [], error: null }
}

export async function fetchClanInvitations(userId: string): Result<ClanInvitation[]> {
  return { data: mockClanInvitations.filter((invitation) => invitation.invitedPlayerId === userId || userId !== ''), error: null }
}

export async function acceptClanInvitation(invitationId: string, userId: string): Result<boolean> {
  if (readMembership(userId)) return { data: false, error: 'Leave your current clan before accepting an invitation.' }
  const invitation = mockClanInvitations.find((item) => item.invitationId === invitationId)
  if (!invitation) return { data: false, error: 'Invitation not found.' }
  writeMembership(userId, invitation.clanId, 'member')
  return { data: true, error: null }
}

export async function declineClanInvitation(_invitationId: string): Result<boolean> {
  void _invitationId
  return { data: true, error: null }
}

export async function uploadClanAvatar(clanId: string, file: File): Promise<{ data: AvatarUploadResult | null; error: string | null }> {
  // TODO: Use Supabase Storage bucket `clan-avatars` with clan role RLS once ready.
  return uploadPlayerAvatar(clanId, file)
}

export async function updateClanAvatarUrl(clanId: string, avatarUrl: string): Result<boolean> {
  await updateClan(clanId, { avatarUrl })
  return { data: true, error: null }
}

export async function removeClanAvatar(clanId: string): Result<boolean> {
  await updateClan(clanId, { avatarUrl: null })
  return { data: true, error: null }
}
