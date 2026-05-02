import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanMember } from '@/features/clans/types'

export function ClanRosterTable({ members }: { members: ClanMember[] }) {
  return (
    <section className="ca-card overflow-hidden">
      <div className="border-b border-white/8 px-4 py-4">
        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Member Roster</p>
      </div>
      <div className="divide-y divide-white/6">
        {members.map((member) => {
          const matches = member.wins + member.losses
          const winRate = Math.round((member.wins / Math.max(1, matches)) * 100)
          return (
            <div key={member.playerId} className="grid gap-3 px-4 py-3 md:grid-cols-[100px_1.2fr_.7fr_.7fr_.8fr_.7fr_.7fr] md:items-center">
              <SquareAvatar src={member.avatarUrl} alt={member.displayName} fallbackLabel={member.displayName} />
              <div>
                <p className="font-semibold text-ca-text">{member.displayName}</p>
                <p className="ca-mono-label mt-1 text-[0.44rem] text-ca-text-3">Joined {new Date(member.joinedAt).toLocaleDateString()}</p>
              </div>
              <Cell label="Role" value={member.role} />
              <Cell label="Level" value={`${member.level}`} />
              <Cell label="Rank Title" value={member.rankTitle} />
              <Cell label="Experience" value={`${member.experience.toLocaleString()} EXP`} />
              <Cell label="Record" value={`${member.wins}W ${member.losses}L ${winRate}%`} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="ca-mono-label text-[0.38rem] text-ca-text-3 md:hidden">{label}</p>
      <p className="truncate text-sm text-ca-text-2">{value}</p>
    </div>
  )
}
