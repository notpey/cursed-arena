import { useMemo, useState } from 'react'
import { ClanLadderTable } from '@/features/ladder/components/ClanLadderTable'
import { LadderHeroCard } from '@/features/ladder/components/LadderHeroCard'
import { LadderPodium } from '@/features/ladder/components/LadderPodium'
import { MyClanStandingCard } from '@/features/ladder/components/MyLadderStandingCard'
import type { ClanLadderEntry } from '@/features/ladder/types'

export function ClanLadderView({ entries, myStanding }: { entries: ClanLadderEntry[]; myStanding: ClanLadderEntry | null }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => entries.filter((entry) => `${entry.clanName} ${entry.clanTag}`.toLowerCase().includes(query.toLowerCase())), [entries, query])
  return (
    <div className="space-y-4">
      <LadderHeroCard title="Clan Ladder" subtitle="International Clan Registry" description="The Clan Ladder ranks clans by competitive strength. A clan's score is based on the performance of its strongest active members, giving both elite clans and growing rosters a path to compete." />
      <MyClanStandingCard entry={myStanding} />
      <LadderPodium entries={entries} type="clan" />
      <div className="ca-card flex flex-wrap gap-3 p-3"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clan" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35" /></div>
      <ClanLadderTable entries={filtered} currentClanId={myStanding?.clanId} />
      <p className="ca-card p-3 text-sm text-ca-text-2"><b className="text-ca-teal">Clan Score:</b> Clan Score is calculated from the experience of a clan's top active ranked members. This prevents larger clans from winning by size alone.</p>
    </div>
  )
}
