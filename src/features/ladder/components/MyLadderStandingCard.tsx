import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanLadderEntry, SorcererLadderEntry } from '@/features/ladder/types'

export function MySorcererStandingCard({ entry }: { entry: SorcererLadderEntry | null }) {
  if (!entry) return <Empty text="You are not ranked yet. Play a ladder match to enter the Sorcerer Ladder." />
  return (
    <section className="rounded-[5px] border border-white/10 bg-[rgba(18,16,26,0.90)] p-4">
      <div className="flex items-center gap-3">
        <SquareAvatar src={entry.avatarUrl} alt={entry.displayName} fallbackLabel={entry.displayName} size={44} className="rounded-[5px] shrink-0" />
        <div className="min-w-0">
          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Your Standing</p>
          <p className="ca-display mt-0.5 truncate text-[1.25rem] leading-none text-ca-text">{entry.displayName}</p>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Ladder Rank</p>
          <p className="ca-display mt-0.5 text-[1.25rem] leading-none text-ca-teal">{entry.ladderRank ? `#${entry.ladderRank}` : 'Unranked'}</p>
        </div>
      </div>
      <Stats values={[
        ['Level', `${entry.level}`],
        ['Rank Title', entry.rankTitle],
        ['Experience', `${entry.experience.toLocaleString()} EXP`],
        ['Record', `${entry.wins}W ${entry.losses}L`],
        ['Win Rate', `${entry.winRate}%`],
        ['Streak', `${entry.currentStreak}`],
        ['Clan', entry.clanTag ? `[${entry.clanTag}]` : 'None'],
      ]} />
    </section>
  )
}

export function MyClanStandingCard({ entry }: { entry: ClanLadderEntry | null }) {
  if (!entry) return <Empty text="You are not in a clan. Join or create a clan to compete on the Clan Ladder." />
  return (
    <section className="rounded-[5px] border border-white/10 bg-[rgba(18,16,26,0.90)] p-4">
      <div className="flex items-center gap-3">
        <SquareAvatar src={entry.clanAvatarUrl} alt={`${entry.clanName} emblem`} fallbackLabel={entry.clanTag} size={44} className="rounded-[5px] shrink-0" />
        <div className="min-w-0">
          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Your Clan</p>
          <p className="ca-display mt-0.5 truncate text-[1.25rem] leading-none text-ca-text">{entry.clanName}</p>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Clan Rank</p>
          <p className="ca-display mt-0.5 text-[1.25rem] leading-none text-ca-teal">{entry.ladderRank ? `#${entry.ladderRank}` : 'Unranked'}</p>
        </div>
      </div>
      <Stats values={[
        ['Tag', entry.clanTag],
        ['Clan Score', entry.clanScore.toLocaleString()],
        ['Members', `${entry.memberCount}`],
        ['Active', `${entry.activeMemberCount}`],
        ['Top Sorcerer', entry.topSorcerer?.displayName ?? 'None'],
        ['Average Level', `${entry.averageLevel}`],
      ]} />
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <section className="rounded-[5px] border border-white/10 bg-[rgba(18,16,26,0.90)] p-4 text-sm text-ca-text-2">
      {text}
    </section>
  )
}

function Stats({ values }: { values: Array<[string, string]> }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
      {values.map(([label, value]) => (
        <div key={label} className="rounded-[4px] border border-white/8 bg-white/[0.02] px-2 py-2">
          <p className="ca-mono-label text-[0.36rem] text-ca-text-3">{label}</p>
          <p className="ca-display mt-1 truncate text-[0.82rem] leading-none text-ca-text">{value}</p>
        </div>
      ))}
    </div>
  )
}
