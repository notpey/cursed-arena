import { useEffect, useMemo, useState } from 'react'
import { ClanPanelGrid } from '@/features/clans/components/ClanPanelGrid'
import { MyClanCard } from '@/features/clans/components/MyClanCard'
import { acceptClanInvitation, declineClanInvitation, fetchClanInvitations, fetchMyClan, leaveClan } from '@/features/clans/client'
import type { ClanDetail, ClanInvitation, ClanMemberRole } from '@/features/clans/types'
import { useAuth } from '@/features/auth/useAuth'

export function ClanPanelPage() {
  const { user } = useAuth()
  const userId = user?.id ?? 'local-user'
  const [clan, setClan] = useState<ClanDetail | null>(null)
  const [invitations, setInvitations] = useState<ClanInvitation[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void fetchMyClan(userId).then(({ data }) => setClan(data))
    void fetchClanInvitations(userId).then(({ data }) => setInvitations(data))
  }, [userId])

  const role = useMemo<ClanMemberRole | null>(() => clan?.members.find((member) => member.playerId === userId)?.role ?? (clan?.leaderId === userId ? 'leader' : clan ? 'member' : null), [clan, userId])

  async function handleLeave() {
    if (!clan) return
    const result = await leaveClan(clan.clanId, userId)
    if (result.error) return setMessage(result.error)
    setClan(null)
    setMessage('You left the clan.')
  }

  async function handleAccept(id: string) {
    const result = await acceptClanInvitation(id, userId)
    if (result.error) return setMessage(result.error)
    const next = await fetchMyClan(userId)
    setClan(next.data)
    setMessage('Invitation accepted.')
  }

  return (
    <section className="space-y-4 py-4 sm:py-6">
      <header className="ca-card p-5">
        <p className="ca-mono-label text-[0.5rem] text-ca-teal">Clan Panel</p>
        <h1 className="ca-display mt-2 text-5xl text-ca-text">Clan Panel</h1>
        {!clan ? <p className="mt-3 text-sm text-ca-text-2">You are currently clanless. Create a clan or accept an invitation to join one.</p> : null}
      </header>
      {message ? <p className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text-2">{message}</p> : null}
      {clan ? <MyClanCard clan={clan} role={role ?? 'member'} /> : null}
      <ClanPanelGrid
        clan={clan}
        role={role}
        invitations={invitations}
        onAvatarChange={(avatarUrl) => setClan((current) => current ? { ...current, avatarUrl } : current)}
        onAcceptInvitation={(id) => { void handleAccept(id) }}
        onDeclineInvitation={(id) => { void declineClanInvitation(id).then(() => setInvitations((current) => current.filter((item) => item.invitationId !== id))) }}
        onLeave={() => { void handleLeave() }}
      />
    </section>
  )
}
