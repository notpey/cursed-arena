import { useMemo, useState } from 'react'
import { LadderHeroCard } from '@/features/ladder/components/LadderHeroCard'
import { LadderPodium } from '@/features/ladder/components/LadderPodium'
import { MySorcererStandingCard } from '@/features/ladder/components/MyLadderStandingCard'
import { SorcererLadderTable } from '@/features/ladder/components/SorcererLadderTable'
import type { SorcererLadderEntry } from '@/features/ladder/types'

export function SorcererLadderView({ entries, myStanding, currentUserId }: { entries: SorcererLadderEntry[]; myStanding: SorcererLadderEntry | null; currentUserId?: string }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Top 100')
  const filtered = useMemo(() => {
    let next = entries.filter((entry) => entry.displayName.toLowerCase().includes(query.toLowerCase()))
    if (filter === 'Top 100') next = next.filter((entry) => (entry.ladderRank ?? 9999) <= 100)
    if (filter === 'Top 1,000') next = next.filter((entry) => (entry.ladderRank ?? 9999) <= 1000)
    if (filter === 'My Clan' && myStanding?.clanId) next = next.filter((entry) => entry.clanId === myStanding.clanId)
    if (filter === 'Near Me' && myStanding?.ladderRank) next = next.filter((entry) => Math.abs((entry.ladderRank ?? 9999) - myStanding.ladderRank!) <= 50)
    return next
  }, [entries, filter, myStanding, query])

  return (
    <div className="space-y-4">
      <LadderHeroCard title="Sorcerer Ladder" subtitle="International Ranking Registry" description="The Sorcerer Ladder is the primary competitive ladder of Cursed-Arena. Every player enters automatically after completing a ladder match. Experience determines your level, rank title, and position among other sorcerers." />
      <MySorcererStandingCard entry={myStanding} />
      <LadderPodium entries={entries} type="sorcerer" />
      <Controls query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} />
      <SorcererLadderTable entries={filtered} currentUserId={currentUserId} />
      <Helper />
    </div>
  )
}

function Controls({ query, setQuery, filter, setFilter }: { query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void }) {
  return <div className="ca-card flex flex-wrap gap-3 p-3"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-md border border-white/10 bg-ca-overlay px-3 py-2 text-sm text-ca-text">{['Top 100', 'Top 1,000', 'Near Me', 'My Clan'].map((item) => <option key={item}>{item}</option>)}</select></div>
}

function Helper() {
  return <section className="grid gap-3 md:grid-cols-3"><p className="ca-card p-3 text-sm text-ca-text-2"><b className="text-ca-teal">Experience:</b> Experience increases when you defeat ladder opponents and may decrease when you lose. The amount gained or lost depends on the level difference between you and your opponent.</p><p className="ca-card p-3 text-sm text-ca-text-2"><b className="text-ca-teal">Ladder Rank:</b> Ladder Rank is your position among all ranked players. Only the top 1,000 sorcerers receive an official ladder rank.</p><p className="ca-card p-3 text-sm text-ca-text-2"><b className="text-ca-gold">The Strongest:</b> The Strongest is reserved for the Rank #1 sorcerer once they have reached Level 46 or higher.</p></section>
}
