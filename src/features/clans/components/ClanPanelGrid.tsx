import { Link } from 'react-router-dom'
import { ClanAvatarUploader } from '@/features/clans/components/ClanAvatarUploader'
import { ClanInvitationsPanel } from '@/features/clans/components/ClanInvitationsPanel'
import { ClanMemberManagement } from '@/features/clans/components/ClanMemberManagement'
import { ClanPanelCard } from '@/features/clans/components/ClanPanelCard'
import type { ClanDetail, ClanInvitation, ClanMemberRole } from '@/features/clans/types'

export function ClanPanelGrid({
  clan,
  role,
  invitations,
  onAvatarChange,
  onAcceptInvitation,
  onDeclineInvitation,
  onLeave,
}: {
  clan: ClanDetail | null
  role: ClanMemberRole | null
  invitations: ClanInvitation[]
  onAvatarChange: (avatarUrl: string | null) => void
  onAcceptInvitation: (id: string) => void
  onDeclineInvitation: (id: string) => void
  onLeave: () => void
}) {
  const isLeader = role === 'leader'
  const canManage = role === 'leader' || role === 'officer'
  const hasClan = Boolean(clan)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {hasClan ? (
        <>
          <ClanPanelCard title="Clan Recruitment" description="Manage recruitment, invite new sorcerers, and review players who want to join your clan." actions={['Invite Player', 'Review Join Requests', 'Set Recruitment Status']} access={canManage ? 'full' : 'readonly'} />
          <ClanPanelCard title="Clan Info" description="Edit your clan's name, tag, description, visibility, and recruitment status." actions={['Edit Clan Info']} access={isLeader ? 'full' : 'readonly'} />
          <ClanPanelCard title="Clan Styles" description="Customize the visual style of your clan profile and member identity." actions={['Choose Accent', 'Choose Card Frame', 'Choose Banner Style']} access={canManage ? 'full' : 'locked'} />
          <ClanPanelCard title="Clan Management" description="Maintain your roster, assign roles, and remove inactive members." actions={['Manage Members', 'Promote/Demote', 'Remove Member']} access={canManage ? 'full' : 'locked'}>
            {clan ? <ClanMemberManagement members={clan.members} /> : null}
          </ClanPanelCard>
          <ClanPanelCard title="Clan Emblem" description="Upload the 100x100 avatar shown on your clan profile, ladder row, and clan panel." actions={[]} access={canManage ? 'full' : 'locked'}>
            {clan ? <ClanAvatarUploader clan={clan} canEdit={canManage} onChange={onAvatarChange} /> : null}
          </ClanPanelCard>
        </>
      ) : null}

      <ClanPanelCard title="Clan Invitations" description="View clan invitations you have received. Accepting an invitation lets you join that clan." actions={[]} access="full">
        <ClanInvitationsPanel invitations={invitations} canAccept={!hasClan} onAccept={onAcceptInvitation} onDecline={onDeclineInvitation} />
      </ClanPanelCard>

      <ClanPanelCard title="Clan Register" description="Create a clan of your own. You can only create a clan when you are currently clanless." actions={[]} access={hasClan ? 'locked' : 'full'}>
        <Link to="/clans/create" className={`ca-display inline-block rounded-lg border px-4 py-3 text-xl ${hasClan ? 'pointer-events-none border-white/10 text-ca-text-disabled' : 'border-ca-red/35 bg-ca-red text-white'}`}>Create Clan</Link>
      </ClanPanelCard>

      <ClanPanelCard title="Leave Clan" description="Leave your current clan. If you are the clan leader, you must transfer leadership or disband the clan first." actions={[]} access={!hasClan || isLeader ? 'locked' : 'full'}>
        <button type="button" disabled={!hasClan || isLeader} onClick={onLeave} className="ca-mono-label rounded-lg border border-ca-red/25 px-4 py-3 text-[0.5rem] text-ca-red disabled:cursor-not-allowed disabled:opacity-45">Leave Clan</button>
        {isLeader ? <p className="mt-2 text-sm text-ca-red">You must transfer leadership or disband the clan before leaving.</p> : null}
      </ClanPanelCard>
    </div>
  )
}
