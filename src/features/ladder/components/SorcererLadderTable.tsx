import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { SorcererLadderEntry } from '@/features/ladder/types'

export function SorcererLadderTable({ entries, currentUserId }: { entries: SorcererLadderEntry[]; currentUserId?: string }) {
  return (
    <section className="ca-card overflow-hidden">
      <div className="divide-y divide-white/6">
        {entries.map((entry) => {
          const isMe = entry.playerId === currentUserId
          return (
            <div key={entry.playerId} className={`grid gap-3 px-4 py-3 lg:grid-cols-[100px_.45fr_1fr_.9fr_.4fr_.7fr_.5fr_.5fr_.5fr] lg:items-center ${isMe ? 'bg-ca-teal-wash shadow-[inset_2px_0_0_var(--teal-primary)]' : ''}`}>
              <SquareAvatar src={entry.avatarUrl} alt={entry.displayName} fallbackLabel={entry.displayName} />
              <Cell label="Rank" value={entry.ladderRank ? `#${entry.ladderRank}` : 'Unranked'} accent={entry.ladderRank === 1 ? 'gold' : undefined} />
              <div className="min-w-0">
                <p className="font-semibold text-ca-text">{entry.displayName}{isMe ? ' (You)' : ''}</p>
                {entry.clanTag ? <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-teal">[{entry.clanTag}]</p> : null}
              </div>
              <Cell label="Rank Title" value={entry.rankTitle} />
              <Cell label="Level" value={`${entry.level}`} />
              <Cell label="Experience" value={`${entry.experience.toLocaleString()} EXP`} />
              <Cell label="Wins" value={`${entry.wins}`} />
              <Cell label="Losses" value={`${entry.losses}`} />
              <Cell label="Streak" value={`${entry.currentStreak}`} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: 'gold' }) {
  return <div className="min-w-0"><p className="ca-mono-label text-[0.38rem] text-ca-text-3 lg:hidden">{label}</p><p className={`truncate text-sm ${accent === 'gold' ? 'text-ca-gold' : 'text-ca-text-2'}`}>{value}</p></div>
}
