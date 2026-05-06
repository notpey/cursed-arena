import { useMemo, useState } from 'react'
import { LadderHeroCard } from '@/features/ladder/components/LadderHeroCard'
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
    <div className="space-y-3">
      <LadderHeroCard
        title="Sorcerer Ladder"
        subtitle="Ladders / International Ranking Registry"
        description="Every player enters automatically after completing a ladder match. Experience determines your level, rank title, and position among other sorcerers."
      />
      <MySorcererStandingCard entry={myStanding} />
      <Controls query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} />
      <SorcererLadderTable entries={filtered} currentUserId={currentUserId} />
      <Helper />
    </div>
  )
}

function Controls({ query, setQuery, filter, setFilter }: { query: string; setQuery: (v: string) => void; filter: string; setFilter: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search player…"
        className="min-w-0 flex-1 rounded-[4px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none placeholder:text-ca-text-3 focus:border-ca-teal/35"
      />
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="rounded-[4px] border border-white/10 bg-[rgba(18,16,26,0.90)] px-3 py-2 text-sm text-ca-text"
      >
        {['Top 100', 'Top 1,000', 'Near Me', 'My Clan'].map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
    </div>
  )
}

function Helper() {
  return (
    <div className="grid gap-2.5 md:grid-cols-3">
      {[
        { label: 'Experience', color: 'text-ca-teal', body: 'Experience increases when you defeat ladder opponents and may decrease when you lose. The amount depends on the level difference between you and your opponent.' },
        { label: 'Ladder Rank', color: 'text-ca-teal', body: 'Ladder Rank is your position among all ranked players. Only the top 1,000 sorcerers receive an official ladder rank.' },
        { label: 'The Strongest', color: 'text-ca-gold', body: 'The Strongest is reserved for the Rank #1 sorcerer once they have reached Level 46 or higher.' },
      ].map(({ label, color, body }) => (
        <div key={label} className="rounded-[5px] border border-white/10 bg-[rgba(18,16,26,0.90)] p-3 text-sm text-ca-text-2">
          <b className={color}>{label}:</b> {body}
        </div>
      ))}
    </div>
  )
}
