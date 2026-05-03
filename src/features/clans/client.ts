// Image customization is URL-only. Supabase Storage uploads are disabled.
import { mockClanDetails, mockClanInvitations } from '@/features/clans/mockData'
import { validateImageUrl } from '@/features/images/imageUrl'
import type { ClanDetail, ClanInvitation, ClanMember, ClanMemberRole, ClanSummary, CreateClanInput } from '@/features/clans/types'
import { getLevelForExperience, getLadderRankTitle } from '@/features/ranking/ladder'
import { getSupabaseClient } from '@/lib/supabase'

const mockMembershipStorageKey = 'ca-mock-clan-membership-v1'
const mockCreatedClansStorageKey = 'ca-mock-created-clans-v1'

type Result<T> = Promise<{ data: T; error: string | null }>

type ClanRow = {
  id: string
  name: string
  tag: string
  description: string | null
  leader_id: string
  visibility: ClanSummary['visibility']
  recruitment_status: ClanSummary['recruitmentStatus']
  avatar_url?: string | null
  style_preset?: string | null
  accent_color?: string | null
  created_at: string
}

type ClanMemberRow = {
  clan_id: string
  player_id: string
  role: ClanMemberRole
  joined_at: string
}

type ProfileRow = {
  id: string
  display_name?: string | null
  avatar_url?: string | null
  experience?: number | null
  lp?: number | null
  wins?: number | null
  losses?: number | null
}

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

function shouldUseMock(error?: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('relation') || message.includes('does not exist') || message.includes('schema cache')
}

function mapClanSummary(row: ClanRow, members: ClanMember[] = []): ClanSummary {
  const rankedMembers = members
    .filter((member) => member.ladderRank !== null || member.experience > 0)
    .sort((left, right) => right.experience - left.experience)
  const clanScore = rankedMembers.slice(0, 10).reduce((sum, member) => sum + member.experience, 0)
  const averageLevel = members.length > 0
    ? Math.round(members.reduce((sum, member) => sum + member.level, 0) / members.length)
    : 1
  const top = rankedMembers[0] ?? null

  return {
    clanId: row.id,
    name: row.name,
    tag: row.tag,
    description: row.description ?? '',
    visibility: row.visibility,
    recruitmentStatus: row.recruitment_status,
    leaderId: row.leader_id,
    memberCount: members.length,
    activeMemberCount: members.length,
    clanScore,
    ladderRank: null,
    averageLevel,
    avatarUrl: row.avatar_url ?? null,
    stylePreset: row.style_preset ?? null,
    accentColor: row.accent_color ?? null,
    topSorcerer: top
      ? {
          playerId: top.playerId,
          displayName: top.displayName,
          avatarUrl: top.avatarUrl ?? null,
          level: top.level,
          rankTitle: top.rankTitle,
          experience: top.experience,
          ladderRank: top.ladderRank,
        }
      : null,
    createdAt: row.created_at,
  }
}

function mapMember(row: ClanMemberRow, profile?: ProfileRow | null): ClanMember {
  const experience = profile?.experience && profile.experience > 0 ? profile.experience : profile?.lp ?? 0
  const level = getLevelForExperience(experience)
  return {
    playerId: row.player_id,
    displayName: profile?.display_name ?? 'Sorcerer',
    avatarUrl: profile?.avatar_url ?? null,
    role: row.role,
    level,
    rankTitle: getLadderRankTitle({ level, ladderRank: null }),
    experience,
    ladderRank: null,
    wins: profile?.wins ?? 0,
    losses: profile?.losses ?? 0,
    joinedAt: row.joined_at,
  }
}

async function fetchProfiles(playerIds: string[]): Promise<Record<string, ProfileRow>> {
  const client = getSupabaseClient()
  if (!client || playerIds.length === 0) return {}
  const { data } = await client
    .from('profiles')
    .select('id, display_name, avatar_url, experience, lp, wins, losses')
    .in('id', playerIds)
  return Object.fromEntries(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))
}

async function fetchMembersForClan(clanId: string): Result<ClanMember[]> {
  const client = getSupabaseClient()
  if (!client) return { data: [], error: null }
  const { data, error } = await client
    .from('clan_members')
    .select('*')
    .eq('clan_id', clanId)
    .order('joined_at', { ascending: true })

  if (error) return { data: [], error: error.message }
  const rows = (data ?? []) as ClanMemberRow[]
  const profiles = await fetchProfiles(rows.map((row) => row.player_id))
  return { data: rows.map((row) => mapMember(row, profiles[row.player_id])), error: null }
}

export async function fetchMyClan(userId: string): Result<ClanDetail | null> {
  if (!userId) return { data: null, error: null }
  const client = getSupabaseClient()
  if (client) {
    const { data: membership, error } = await client
      .from('clan_members')
      .select('*')
      .eq('player_id', userId)
      .maybeSingle()

    if (!error && membership) return fetchClanById((membership as ClanMemberRow).clan_id)
    if (error && !shouldUseMock(error)) return { data: null, error: error.message }
  }

  const membership = readMembership(userId)
  if (!membership) return { data: null, error: null }
  const clan = getAllClanDetails().find((item) => item.clanId === membership.clanId) ?? null
  return { data: clan, error: null }
}

export async function fetchClanDirectory(): Result<ClanSummary[]> {
  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client
      .from('clans')
      .select('*')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })

    if (!error) {
      const rows = (data ?? []) as ClanRow[]
      const details = await Promise.all(rows.map(async (row) => {
        const members = await fetchMembersForClan(row.id)
        return mapClanSummary(row, members.data)
      }))
      return { data: details, error: null }
    }
    if (!shouldUseMock(error)) return { data: [], error: error.message }
  }

  return { data: getAllClans(), error: null }
}

export async function fetchClanById(clanId: string): Result<ClanDetail | null> {
  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client
      .from('clans')
      .select('*')
      .eq('id', clanId)
      .maybeSingle()

    if (!error && data) {
      const members = await fetchMembersForClan(clanId)
      return { data: { ...mapClanSummary(data as ClanRow, members.data), members: members.data }, error: null }
    }
    if (error && !shouldUseMock(error)) return { data: null, error: error.message }
  }

  return { data: getAllClanDetails().find((clan) => clan.clanId === clanId) ?? null, error: null }
}

export async function createClan(input: CreateClanInput): Result<ClanDetail | null> {
  const client = getSupabaseClient()
  if (client) {
    const existing = await client.from('clan_members').select('clan_id').eq('player_id', input.leaderId).maybeSingle()
    if (existing.data) return { data: null, error: 'You are already in a clan. Leave your current clan before creating a new one.' }

    const tag = input.tag.trim().toUpperCase()
    const name = input.name.trim()
    const created = await client
      .from('clans')
      .insert({
        name,
        tag,
        description: input.description.trim(),
        visibility: input.visibility,
        recruitment_status: input.recruitmentStatus,
        leader_id: input.leaderId,
      })
      .select()
      .single()

    if (!created.error && created.data) {
      const member = await client
        .from('clan_members')
        .insert({ clan_id: (created.data as ClanRow).id, player_id: input.leaderId, role: 'leader' })
      if (member.error) return { data: null, error: member.error.message }
      return fetchClanById((created.data as ClanRow).id)
    }
    if (created.error && !shouldUseMock(created.error)) return { data: null, error: created.error.message }
  }

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
  const client = getSupabaseClient()
  if (client) {
    const existing = await client.from('clan_members').select('clan_id').eq('player_id', userId).maybeSingle()
    if (existing.data) return { data: null, error: 'Leave your current clan before joining another clan.' }
    const clan = await client.from('clans').select('*').eq('id', clanId).maybeSingle()
    if (clan.error && !shouldUseMock(clan.error)) return { data: null, error: clan.error.message }
    if (clan.data) {
      const row = clan.data as ClanRow
      if (row.recruitment_status !== 'open') return { data: null, error: 'This clan is not open for direct joins.' }
      const inserted = await client.from('clan_members').insert({ clan_id: clanId, player_id: userId, role: 'member' })
      if (inserted.error) return { data: null, error: inserted.error.message }
      return fetchClanById(clanId)
    }
  }

  if (readMembership(userId)) return { data: null, error: 'Leave your current clan before joining another clan.' }
  const clan = getAllClanDetails().find((item) => item.clanId === clanId) ?? null
  if (!clan) return { data: null, error: 'Clan not found.' }
  if (clan.recruitmentStatus !== 'open') return { data: null, error: 'This clan is not open for direct joins.' }
  writeMembership(userId, clanId, 'member')
  return { data: clan, error: null }
}

export async function leaveClan(clanId: string, userId: string): Result<boolean> {
  const client = getSupabaseClient()
  if (client) {
    const membership = await client.from('clan_members').select('*').eq('clan_id', clanId).eq('player_id', userId).maybeSingle()
    if (!membership.error && membership.data) {
      if ((membership.data as ClanMemberRow).role === 'leader') return { data: false, error: 'You must transfer leadership or disband the clan before leaving.' }
      const deleted = await client.from('clan_members').delete().eq('clan_id', clanId).eq('player_id', userId)
      return { data: !deleted.error, error: deleted.error?.message ?? null }
    }
    if (membership.error && !shouldUseMock(membership.error)) return { data: false, error: membership.error.message }
  }

  const membership = readMembership(userId)
  if (!membership || membership.clanId !== clanId) return { data: false, error: 'You are not a member of this clan.' }
  if (membership.role === 'leader') return { data: false, error: 'You must transfer leadership or disband the clan before leaving.' }
  removeMembership(userId)
  return { data: true, error: null }
}

export async function updateClan(clanId: string, input: Partial<ClanSummary>): Result<ClanDetail | null> {
  const client = getSupabaseClient()
  if (client) {
    const update: Partial<ClanRow> = {}
    if (input.name !== undefined) update.name = input.name
    if (input.tag !== undefined) update.tag = input.tag
    if (input.description !== undefined) update.description = input.description
    if (input.visibility !== undefined) update.visibility = input.visibility
    if (input.recruitmentStatus !== undefined) update.recruitment_status = input.recruitmentStatus
    if (input.avatarUrl !== undefined) update.avatar_url = input.avatarUrl
    if (input.stylePreset !== undefined) update.style_preset = input.stylePreset
    if (input.accentColor !== undefined) update.accent_color = input.accentColor
    const { error } = await client.from('clans').update({ ...update, updated_at: new Date().toISOString() }).eq('id', clanId)
    if (!error) return fetchClanById(clanId)
    if (!shouldUseMock(error)) return { data: null, error: error.message }
  }

  const created = getCreatedClans()
  const next = created.map((clan) => (clan.clanId === clanId ? { ...clan, ...input } : clan))
  writeJson(mockCreatedClansStorageKey, next)
  return { data: next.find((clan) => clan.clanId === clanId) ?? null, error: null }
}

export async function fetchClanMembers(clanId: string): Result<ClanMember[]> {
  const client = getSupabaseClient()
  if (client) {
    const members = await fetchMembersForClan(clanId)
    if (!members.error) return members
  }
  return { data: getAllClanDetails().find((clan) => clan.clanId === clanId)?.members ?? [], error: null }
}

export async function fetchClanInvitations(userId: string): Result<ClanInvitation[]> {
  if (!userId) return { data: [], error: null }
  const client = getSupabaseClient()
  if (client) {
    const { data, error } = await client
      .from('clan_invitations')
      .select('*, clans(name, tag, avatar_url)')
      .eq('invited_player_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (!error) {
      return {
        data: (data ?? []).map((row) => {
          const item = row as {
            id: string
            clan_id: string
            invited_player_id: string
            invited_by?: string | null
            status: ClanInvitation['status']
            created_at: string
            clans?: { name?: string | null; tag?: string | null; avatar_url?: string | null } | null
          }
          return {
            invitationId: item.id,
            clanId: item.clan_id,
            clanName: item.clans?.name ?? 'Clan',
            clanTag: item.clans?.tag ?? '',
            clanAvatarUrl: item.clans?.avatar_url ?? null,
            invitedPlayerId: item.invited_player_id,
            invitedByDisplayName: undefined,
            status: item.status,
            createdAt: item.created_at,
          }
        }),
        error: null,
      }
    }
    if (!shouldUseMock(error)) return { data: [], error: error.message }
  }

  return { data: mockClanInvitations.filter((invitation) => invitation.invitedPlayerId === userId), error: null }
}

export async function acceptClanInvitation(invitationId: string, userId: string): Result<boolean> {
  const client = getSupabaseClient()
  if (client) {
    const invitation = await client.from('clan_invitations').select('*').eq('id', invitationId).eq('invited_player_id', userId).eq('status', 'pending').maybeSingle()
    if (!invitation.error && invitation.data) {
      if ((await client.from('clan_members').select('clan_id').eq('player_id', userId).maybeSingle()).data) {
        return { data: false, error: 'Leave your current clan before accepting an invitation.' }
      }
      const row = invitation.data as { clan_id: string }
      const inserted = await client.from('clan_members').insert({ clan_id: row.clan_id, player_id: userId, role: 'member' })
      if (inserted.error) return { data: false, error: inserted.error.message }
      await client.from('clan_invitations').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', invitationId)
      return { data: true, error: null }
    }
    if (invitation.error && !shouldUseMock(invitation.error)) return { data: false, error: invitation.error.message }
  }

  if (readMembership(userId)) return { data: false, error: 'Leave your current clan before accepting an invitation.' }
  const invitation = mockClanInvitations.find((item) => item.invitationId === invitationId && item.invitedPlayerId === userId)
  if (!invitation) return { data: false, error: 'Invitation not found.' }
  writeMembership(userId, invitation.clanId, 'member')
  return { data: true, error: null }
}

export async function declineClanInvitation(invitationId: string): Result<boolean> {
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.from('clan_invitations').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', invitationId)
    if (!error) return { data: true, error: null }
    if (!shouldUseMock(error)) return { data: false, error: error.message }
  }
  return { data: true, error: null }
}

export async function updateClanAvatarUrl(clanId: string, avatarUrl: string | null): Result<boolean> {
  if (avatarUrl !== null) {
    const validation = validateImageUrl(avatarUrl, { allowEmpty: false })
    if (!validation.ok) return { data: false, error: validation.error }
  }
  const updated = await updateClan(clanId, { avatarUrl })
  return { data: Boolean(updated.data), error: updated.error }
}

export async function removeClanAvatar(clanId: string): Result<boolean> {
  const updated = await updateClan(clanId, { avatarUrl: null })
  return { data: Boolean(updated.data), error: updated.error }
}
