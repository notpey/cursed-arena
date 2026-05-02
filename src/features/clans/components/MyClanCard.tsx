import { Link } from 'react-router-dom'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanDetail } from '@/features/clans/types'

export function MyClanCard({ clan, role }: { clan: ClanDetail; role: string }) {
  return (
    <section className="ca-card p-5">
      <div className="grid gap-4 md:grid-cols-[100px_minmax(0,1fr)_auto] md:items-center">
        <SquareAvatar src={clan.avatarUrl} alt={`${clan.name} emblem`} fallbackLabel={clan.tag} />
        <div>
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Your Clan</p>
          <h1 className="ca-display mt-2 text-5xl text-ca-text">{clan.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{clan.tag}</Badge>
            <Badge>Your Role: {role}</Badge>
            <Badge>Clan Rank: {clan.ladderRank ? `#${clan.ladderRank}` : 'Unranked'}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:w-56">
          <Stat label="Clan Score" value={clan.clanScore.toLocaleString()} />
          <Stat label="Members" value={`${clan.memberCount}`} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/clans/${clan.clanId}`} className="ca-display rounded-lg border border-white/10 bg-ca-overlay px-4 py-3 text-xl text-ca-text">View Profile</Link>
        <Link to="/ladders" className="ca-display rounded-lg border border-ca-teal/25 bg-ca-teal-wash px-4 py-3 text-xl text-ca-teal">Clan Ladder</Link>
      </div>
    </section>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2 py-1 text-[0.46rem] text-ca-teal">{children}</span>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[8px] border border-white/8 bg-black/18 p-3"><p className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</p><p className="mt-1 ca-display text-2xl text-ca-text">{value}</p></div>
}
