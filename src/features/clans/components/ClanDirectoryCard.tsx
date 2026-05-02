import { Link } from 'react-router-dom'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanSummary } from '@/features/clans/types'

type ClanDirectoryCardProps = {
  clan: ClanSummary
  canJoin: boolean
  onJoin: (clanId: string) => void
}

export function ClanDirectoryCard({ clan, canJoin, onJoin }: ClanDirectoryCardProps) {
  return (
    <article className="ca-card ca-card-hover p-4">
      <div className="grid gap-4 sm:grid-cols-[100px_minmax(0,1fr)_auto]">
        <SquareAvatar src={clan.avatarUrl} alt={`${clan.name} emblem`} fallbackLabel={clan.tag} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="ca-display text-3xl text-ca-text">{clan.name}</h2>
            <span className="ca-mono-label rounded-md border border-ca-teal/25 bg-ca-teal-wash px-2 py-1 text-[0.48rem] text-ca-teal">{clan.tag}</span>
            <span className="ca-mono-label rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.46rem] text-ca-text-2">{clan.recruitmentStatus}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-ca-text-2">{clan.description}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MiniStat label="Rank" value={clan.ladderRank ? `#${clan.ladderRank}` : 'Unranked'} />
            <MiniStat label="Clan Score" value={clan.clanScore.toLocaleString()} />
            <MiniStat label="Members" value={`${clan.memberCount}`} />
            <MiniStat label="Active" value={`${clan.activeMemberCount ?? 0}`} />
            <MiniStat label="Top Sorcerer" value={clan.topSorcerer?.displayName ?? 'None'} />
          </div>
        </div>
        <div className="flex flex-row gap-2 sm:flex-col">
          <Link to={`/clans/${clan.clanId}`} className="ca-display rounded-lg border border-white/10 bg-ca-overlay px-4 py-3 text-center text-xl text-ca-text transition hover:border-ca-teal/25">
            View Clan
          </Link>
          {clan.recruitmentStatus === 'open' ? (
            <button
              type="button"
              disabled={!canJoin}
              onClick={() => onJoin(clan.clanId)}
              className="ca-display rounded-lg border border-ca-teal/35 bg-ca-teal-wash px-4 py-3 text-xl text-ca-teal transition disabled:cursor-not-allowed disabled:opacity-45"
            >
              Join Clan
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/8 bg-black/15 px-2 py-2">
      <p className="ca-mono-label text-[0.4rem] text-ca-text-3">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ca-text">{value}</p>
    </div>
  )
}
