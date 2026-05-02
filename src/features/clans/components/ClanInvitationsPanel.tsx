import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanInvitation } from '@/features/clans/types'

export function ClanInvitationsPanel({ invitations, canAccept, onAccept, onDecline }: { invitations: ClanInvitation[]; canAccept: boolean; onAccept: (id: string) => void; onDecline: (id: string) => void }) {
  if (invitations.length === 0) return <p className="text-sm text-ca-text-3">No clan invitations found.</p>

  return (
    <div className="space-y-2">
      {invitations.map((invitation) => (
        <div key={invitation.invitationId} className="flex flex-wrap items-center gap-3 rounded-[8px] border border-white/8 bg-black/15 p-2">
          <SquareAvatar src={invitation.clanAvatarUrl} alt={`${invitation.clanName} emblem`} fallbackLabel={invitation.clanTag} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ca-text">{invitation.clanName} <span className="text-ca-teal">[{invitation.clanTag}]</span></p>
            <p className="ca-mono-label mt-1 text-[0.4rem] text-ca-text-3">Invited by {invitation.invitedByDisplayName ?? 'Unknown'}</p>
          </div>
          <button disabled={!canAccept} onClick={() => onAccept(invitation.invitationId)} className="ca-mono-label rounded-md border border-ca-teal/25 bg-ca-teal-wash px-3 py-2 text-[0.48rem] text-ca-teal disabled:opacity-45">Accept Invitation</button>
          <button onClick={() => onDecline(invitation.invitationId)} className="ca-mono-label rounded-md border border-white/10 px-3 py-2 text-[0.48rem] text-ca-text-2">Decline Invitation</button>
        </div>
      ))}
    </div>
  )
}
