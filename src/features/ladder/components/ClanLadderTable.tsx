import { Link } from 'react-router-dom'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanLadderEntry } from '@/features/ladder/types'

export function ClanLadderTable({ entries, currentClanId }: { entries: ClanLadderEntry[]; currentClanId?: string | null }) {
  return (
    <section className="ca-card overflow-hidden">
      <div className="divide-y divide-white/6">
        {entries.map((entry) => {
          const isMine = entry.clanId === currentClanId
          return (
            <div key={entry.clanId} className={`grid gap-3 px-4 py-3 lg:grid-cols-[100px_.45fr_1.2fr_.75fr_.55fr_.55fr_.65fr_1fr] lg:items-center ${isMine ? 'bg-ca-teal-wash shadow-[inset_2px_0_0_var(--teal-primary)]' : ''}`}>
              <SquareAvatar src={entry.clanAvatarUrl} alt={`${entry.clanName} emblem`} fallbackLabel={entry.clanTag} />
              <Cell label="Rank" value={entry.ladderRank ? `#${entry.ladderRank}` : 'Unranked'} />
              <div className="min-w-0">
                <Link to={`/clans/${entry.clanId}`} className="font-semibold text-ca-text hover:text-ca-teal">{entry.clanName}{isMine ? ' (Your Clan)' : ''}</Link>
                <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-teal">[{entry.clanTag}]</p>
              </div>
              <Cell label="Clan Score" value={entry.clanScore.toLocaleString()} />
              <Cell label="Members" value={`${entry.memberCount}`} />
              <Cell label="Active" value={`${entry.activeMemberCount}`} />
              <Cell label="Avg Level" value={`${entry.averageLevel}`} />
              <Cell label="Top Sorcerer" value={entry.topSorcerer ? `${entry.topSorcerer.displayName} / Lv ${entry.topSorcerer.level}` : 'None'} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="ca-mono-label text-[0.38rem] text-ca-text-3 lg:hidden">{label}</p><p className="truncate text-sm text-ca-text-2">{value}</p></div>
}
