import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanLadderEntry, SorcererLadderEntry } from '@/features/ladder/types'

export function MySorcererStandingCard({ entry }: { entry: SorcererLadderEntry | null }) {
  if (!entry) return <Empty text="You are not ranked yet. Play a ladder match to enter the Sorcerer Ladder." />
  return (
    <section className="ca-card p-4">
      <div className="grid gap-4 sm:grid-cols-[100px_minmax(0,1fr)] sm:items-center">
        <SquareAvatar src={entry.avatarUrl} alt={entry.displayName} fallbackLabel={entry.displayName} />
        <div>
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Current Standing</p>
          <h2 className="ca-display mt-2 text-4xl text-ca-text">{entry.displayName}</h2>
          <Stats values={[
            ['Ladder Rank', entry.ladderRank ? `#${entry.ladderRank}` : 'Unranked'],
            ['Level', `${entry.level}`],
            ['Rank Title', entry.rankTitle],
            ['Experience', `${entry.experience.toLocaleString()} EXP`],
            ['Record', `${entry.wins}W ${entry.losses}L`],
            ['Win Rate', `${entry.winRate}%`],
            ['Streak', `${entry.currentStreak}`],
            ['Clan', entry.clanTag ? `[${entry.clanTag}]` : 'None'],
          ]} />
        </div>
      </div>
    </section>
  )
}

export function MyClanStandingCard({ entry }: { entry: ClanLadderEntry | null }) {
  if (!entry) return <Empty text="You are not in a clan. Join or create a clan to compete on the Clan Ladder." />
  return (
    <section className="ca-card p-4">
      <div className="grid gap-4 sm:grid-cols-[100px_minmax(0,1fr)] sm:items-center">
        <SquareAvatar src={entry.clanAvatarUrl} alt={`${entry.clanName} emblem`} fallbackLabel={entry.clanTag} />
        <div>
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Current Clan Standing</p>
          <h2 className="ca-display mt-2 text-4xl text-ca-text">{entry.clanName}</h2>
          <Stats values={[
            ['Tag', entry.clanTag],
            ['Clan Rank', entry.ladderRank ? `#${entry.ladderRank}` : 'Unranked'],
            ['Clan Score', entry.clanScore.toLocaleString()],
            ['Members', `${entry.memberCount}`],
            ['Active', `${entry.activeMemberCount}`],
            ['Top Sorcerer', entry.topSorcerer?.displayName ?? 'None'],
            ['Average Level', `${entry.averageLevel}`],
          ]} />
        </div>
      </div>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <section className="ca-card p-4 text-sm text-ca-text-2">{text}</section>
}

function Stats({ values }: { values: Array<[string, string]> }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
      {values.map(([label, value]) => (
        <div key={label} className="rounded-md border border-white/8 bg-black/15 px-2 py-2">
          <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-ca-text">{value}</p>
        </div>
      ))}
    </div>
  )
}
