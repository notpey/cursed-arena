import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanDetail, ClanSummary } from '@/features/clans/types'

export function ClanHeroCard({ clan }: { clan: ClanSummary | ClanDetail }) {
  return (
    <section className="ca-card overflow-hidden border-white/8 bg-[radial-gradient(70%_90%_at_0%_20%,rgba(250,39,66,0.08),transparent_60%),radial-gradient(70%_90%_at_100%_10%,rgba(5,216,189,0.08),transparent_62%),rgba(14,15,20,0.2)] p-5">
      <div className="grid gap-4 md:grid-cols-[100px_minmax(0,1fr)_auto] md:items-center">
        <SquareAvatar src={clan.avatarUrl} alt={`${clan.name} emblem`} fallbackLabel={clan.tag} />
        <div className="min-w-0">
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Clan Registry</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="ca-display text-5xl text-ca-text">{clan.name}</h1>
            <span className="ca-mono-label rounded-md border border-ca-teal/25 bg-ca-teal-wash px-2 py-1 text-[0.5rem] text-ca-teal">{clan.tag}</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm text-ca-text-2">{clan.description || 'No clan description registered.'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:w-64">
          <Stat label="Clan Rank" value={clan.ladderRank ? `#${clan.ladderRank}` : 'Unranked'} />
          <Stat label="Clan Score" value={clan.clanScore.toLocaleString()} />
          <Stat label="Members" value={`${clan.memberCount}`} />
          <Stat label="Created" value={new Date(clan.createdAt).toLocaleDateString()} />
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/8 bg-black/18 p-3">
      <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</p>
      <p className="mt-1 ca-display text-2xl text-ca-text">{value}</p>
    </div>
  )
}
