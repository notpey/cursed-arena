import { describe, expect, test } from 'vitest'
import { fetchClanInvitations } from '@/features/clans/client'

describe('fetchClanInvitations mock fallback', () => {
  test('returns no invitations for empty user id', async () => {
    const { data } = await fetchClanInvitations('')
    expect(data).toEqual([])
  })

  test('only returns invitations for the requested user', async () => {
    const { data } = await fetchClanInvitations('local-user')
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((invitation) => invitation.invitedPlayerId === 'local-user')).toBe(true)
  })
})
