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
    <div className="p-4 space-y-3">
      {/* Page header */}
      <div className="border-b border-dotted border-white/12 pb-3">
        <p className="ca-mono-label text-[0.44rem] text-ca-text-3 tracking-[0.1em]">CLANS / DIRECTORY</p>
        <h1 className="ca-display mt-1 text-[1.85rem] leading-none tracking-[0.05em] text-ca-text">Clans</h1>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-[1.65] text-ca-text-2">
            {myClan ? (
              <>Your Clan: <Link className="text-ca-teal hover:underline" to={`/clans/${myClan.clanId}`}>{myClan.name} [{myClan.tag}]</Link></>
            ) : (
              'Create a clan or join an existing one to compete on the Clan Ladder.'
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            {myClan ? (
              <Link
                to="/clan-panel"
                className="ca-display rounded-[4px] border border-ca-teal/28 bg-ca-teal-wash px-4 py-2 text-[1rem] leading-none text-ca-teal transition hover:brightness-110"
              >
                Clan Panel
              </Link>
            ) : (
              <Link
                to="/clans/create"
                className="ca-display rounded-[4px] border border-ca-red/45 bg-ca-red px-4 py-2 text-[1rem] leading-none text-white transition hover:brightness-110"
              >
                Clan Register
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or tag…"
          className="min-w-0 flex-1 rounded-[4px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none placeholder:text-ca-text-3 focus:border-ca-teal/35"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-[4px] border border-white/10 bg-[rgba(18,16,26,0.90)] px-3 py-2 text-sm text-ca-text"
        >
          {['Open Recruitment', 'Invite Only', 'Top Ranked', 'Newest'].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      {message ? (
        <p className="rounded-[4px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text-2">{message}</p>
      ) : null}

      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="rounded-[5px] border border-white/10 bg-[rgba(18,16,26,0.90)] p-5 text-sm text-ca-text-2">
            No clans found.
          </div>
        ) : (
          filtered.map((clan) => (
            <ClanDirectoryCard
              key={clan.clanId}
              clan={clan}
              canJoin={!myClan && clan.leaderId !== userId}
              onJoin={(id) => { void handleJoin(id) }}
            />
          ))
        )}
      </div>
      <p className="sr-only">{profile.displayName}</p>
    </div>
  )
}
