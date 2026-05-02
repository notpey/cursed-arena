import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ClanHeroCard } from '@/features/clans/components/ClanHeroCard'
import { ClanRosterTable } from '@/features/clans/components/ClanRosterTable'
import { fetchClanById, fetchMyClan, joinClan } from '@/features/clans/client'
import type { ClanDetail } from '@/features/clans/types'
import { useAuth } from '@/features/auth/useAuth'

export function ClanProfilePage() {
  const { clanId = '' } = useParams()
  const { user } = useAuth()
  const userId = user?.id ?? 'local-user'
  const [clan, setClan] = useState<ClanDetail | null>(null)
  const [myClan, setMyClan] = useState<ClanDetail | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void fetchClanById(clanId).then(({ data }) => setClan(data))
    void fetchMyClan(userId).then(({ data }) => setMyClan(data))
  }, [clanId, userId])

  async function handleJoin() {
    const result = await joinClan(clanId, userId)
    if (result.error) return setMessage(result.error)
    setMyClan(result.data)
    setMessage('Clan joined.')
  }

  if (!clan) return <section className="py-6"><p className="ca-card p-5 text-ca-text-2">Clan not found.</p></section>

  const isMember = myClan?.clanId === clan.clanId

  return (
    <section className="space-y-4 py-4 sm:py-6">
      <ClanHeroCard clan={clan} />
      <div className="grid gap-3 md:grid-cols-6">
        <Stat label="Clan Ladder Rank" value={clan.ladderRank ? `#${clan.ladderRank}` : 'Unranked'} />
        <Stat label="Clan Score" value={clan.clanScore.toLocaleString()} />
        <Stat label="Members" value={`${clan.memberCount}`} />
        <Stat label="Active Members" value={`${clan.activeMemberCount ?? 0}`} />
        <Stat label="Average Level" value={`${clan.averageLevel ?? 0}`} />
        <Stat label="Top Sorcerer" value={clan.topSorcerer?.displayName ?? 'None'} />
      </div>
      <div className="ca-card flex flex-wrap items-center gap-2 p-4">
        {message ? <p className="mr-auto text-sm text-ca-text-2">{message}</p> : <p className="mr-auto text-sm text-ca-text-3">Visibility: {clan.visibility} / Recruitment: {clan.recruitmentStatus}</p>}
        {!myClan && clan.recruitmentStatus === 'open' ? <button onClick={() => { void handleJoin() }} className="ca-display rounded-lg border border-ca-teal/35 bg-ca-teal-wash px-4 py-3 text-xl text-ca-teal">Join Clan</button> : null}
        {isMember ? <Link to="/clan-panel" className="ca-display rounded-lg border border-ca-teal/35 bg-ca-teal-wash px-4 py-3 text-xl text-ca-teal">Go to Clan Panel</Link> : null}
      </div>
      <ClanRosterTable members={clan.members} />
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="ca-card p-3"><p className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</p><p className="mt-2 ca-display text-2xl text-ca-text">{value}</p></div>
}
