import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClanDirectoryCard } from '@/features/clans/components/ClanDirectoryCard'
import { fetchClanDirectory, fetchMyClan, joinClan } from '@/features/clans/client'
import type { ClanDetail, ClanSummary } from '@/features/clans/types'
import { useAuth } from '@/features/auth/useAuth'
import { usePlayerState } from '@/features/player/store'

export function ClansPage() {
  const { user } = useAuth()
  const { profile } = usePlayerState()
  const userId = user?.id ?? 'local-user'
  const [clans, setClans] = useState<ClanSummary[]>([])
  const [myClan, setMyClan] = useState<ClanDetail | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Open Recruitment')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void fetchClanDirectory().then(({ data }) => setClans(data))
    void fetchMyClan(userId).then(({ data }) => setMyClan(data))
  }, [userId])

  const filtered = useMemo(() => {
    let next = clans.filter((clan) => `${clan.name} ${clan.tag}`.toLowerCase().includes(query.toLowerCase()))
    if (filter === 'Open Recruitment') next = next.filter((clan) => clan.recruitmentStatus === 'open')
    if (filter === 'Invite Only') next = next.filter((clan) => clan.recruitmentStatus === 'invite-only')
    if (filter === 'Top Ranked') next = [...next].sort((a, b) => (a.ladderRank ?? 9999) - (b.ladderRank ?? 9999))
    if (filter === 'Newest') next = [...next].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    return next
  }, [clans, filter, query])

  async function handleJoin(clanId: string) {
    const result = await joinClan(clanId, userId)
    if (result.error) return setMessage(result.error)
    setMyClan(result.data)
    setMessage('Clan joined.')
  }

  return (
    <section className="space-y-4 py-4 sm:py-6">
      <header className="ca-card p-5">
        <p className="ca-mono-label text-[0.5rem] text-ca-teal">Clan Directory</p>
        <h1 className="ca-display mt-2 text-5xl text-ca-text">Clans</h1>
        <p className="mt-3 text-sm text-ca-text-2">{myClan ? <>Your Clan: <Link className="text-ca-teal" to={`/clans/${myClan.clanId}`}>{myClan.name} [{myClan.tag}]</Link></> : 'Create a clan or join an existing one to compete on the Clan Ladder.'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {myClan ? <Link to="/clan-panel" className="ca-display rounded-lg border border-ca-teal/25 bg-ca-teal-wash px-4 py-3 text-xl text-ca-teal">Clan Panel</Link> : <Link to="/clans/create" className="ca-display rounded-lg border border-ca-red/35 bg-ca-red px-4 py-3 text-xl text-white">Clan Register</Link>}
        </div>
      </header>
      <div className="ca-card flex flex-wrap gap-3 p-3">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clans by name or tag" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35" />
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-md border border-white/10 bg-ca-overlay px-3 py-2 text-sm text-ca-text">{['Open Recruitment', 'Invite Only', 'Top Ranked', 'Newest'].map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      {message ? <p className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text-2">{message}</p> : null}
      <div className="space-y-3">
        {filtered.length === 0 ? <p className="ca-card p-5 text-ca-text-2">No clans found.</p> : filtered.map((clan) => <ClanDirectoryCard key={clan.clanId} clan={clan} canJoin={!myClan && clan.leaderId !== userId} onJoin={(id) => { void handleJoin(id) }} />)}
      </div>
      <p className="sr-only">{profile.displayName}</p>
    </section>
  )
}
