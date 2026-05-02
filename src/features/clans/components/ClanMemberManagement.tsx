import type { ClanMember } from '@/features/clans/types'

export function ClanMemberManagement({ members }: { members: ClanMember[] }) {
  return (
    <div className="space-y-2">
      {members.slice(0, 4).map((member) => (
        <div key={member.playerId} className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-black/15 px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-ca-text">{member.displayName}</p>
            <p className="ca-mono-label text-[0.4rem] text-ca-text-3">{member.role} / Level {member.level}</p>
          </div>
          <span className="ca-mono-label text-[0.42rem] text-ca-teal">{member.experience.toLocaleString()} EXP</span>
        </div>
      ))}
    </div>
  )
}
