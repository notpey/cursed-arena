import { useMemo, useState } from 'react'
import { ClanLadderTable } from '@/features/ladder/components/ClanLadderTable'
import { LadderHeroCard } from '@/features/ladder/components/LadderHeroCard'
import { MyClanStandingCard } from '@/features/ladder/components/MyLadderStandingCard'
import type { ClanLadderEntry } from '@/features/ladder/types'

export function ClanLadderView({ entries, myStanding }: { entries: ClanLadderEntry[]; myStanding: ClanLadderEntry | null }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () => entries.filter((entry) => `${entry.clanName} ${entry.clanTag}`.toLowerCase().includes(query.toLowerCase())),
    [entries, query],
  )
  return (
    <div className="space-y-3">
      <LadderHeroCard
        title="Clan Ladder"
        subtitle="Ladders / International Clan Registry"
        description="The Clan Ladder ranks clans by competitive strength. A clan's score is based on the performance of its strongest active members, giving both elite clans and growing rosters a path to compete."
      />
      <MyClanStandingCard entry={myStanding} />
      <div className="flex gap-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clan…"
          className="min-w-0 flex-1 rounded-[4px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none placeholder:text-ca-text-3 focus:border-ca-teal/35"
        />
      </div>
      <ClanLadderTable entries={filtered} currentClanId={myStanding?.clanId} />
      <div className="rounded-[5px] border border-white/10 bg-[rgba(18,16,26,0.90)] p-3 text-sm text-ca-text-2">
        <b className="text-ca-teal">Clan Score:</b> Clan Score is calculated from the experience of a clan's top active ranked members. This prevents larger clans from winning by size alone.
      </div>
    </div>
  )
}
