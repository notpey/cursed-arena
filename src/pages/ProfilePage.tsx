import { useEffect, useMemo, useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import {
  SitePanel,
  SitePanelHeader,
  SiteListRow,
  battlePrepRosterById,
} from '@/components/site/siteVisuals'
import {
  formatMatchTimestamp,
  getModeLabel,
  readBattleProfileStats,
  readRecentMatchHistory,
  type MatchHistoryEntry,
} from '@/features/battle/matches'
import { usePlayerState } from '@/features/player/store'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { useAuth } from '@/features/auth/useAuth'
import {
  fetchPlayerRankProfile,
  fetchLeaderboard,
  getLevelProgress,
  type PlayerRankProfile,
  type LeaderboardEntry,
} from '@/features/ranking/client'
import { fetchPlayerMatchHistory } from '@/features/multiplayer/client'
import { getLevelForExperience, getLadderRankTitle } from '@/features/ranking/ladder'

export function ProfilePage() {
  const { profile } = usePlayerState()
  const { user } = useAuth()
  const localStats = useMemo(() => readBattleProfileStats(), [])
  const localMatches = useMemo(() => readRecentMatchHistory(), [])

  const [dbProfile, setDbProfile] = useState<PlayerRankProfile | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [serverMatches, setServerMatches] = useState<MatchHistoryEntry[] | null>(null)

  useEffect(() => {
    if (!user) return
    fetchPlayerRankProfile(user.id).then(({ data }) => { if (data) setDbProfile(data) })
    fetchLeaderboard(10).then(({ data }) => { setLeaderboard(data) })
    fetchPlayerMatchHistory(user.id, 20).then(({ data }) => { if (data && data.length > 0) setServerMatches(data) })
  }, [user])

  const recentMatches = serverMatches ?? localMatches

  const profileStats = useMemo(() => {
    if (!dbProfile) return localStats
    const experience = dbProfile.experience
    const level = getLevelForExperience(experience)
    const progress = getLevelProgress(experience)
    const rankTitle = getLadderRankTitle({ level, ladderRank: dbProfile.ladderRank ?? null })
    const peakExperience = Math.max(localStats.peakExperience, experience)
    const peakLevel = getLevelForExperience(peakExperience)
    const peakRankTitle = getLadderRankTitle({ level: peakLevel, ladderRank: null })
    return {
      ...localStats,
      experience,
      level,
      rankTitle,
      experienceToNextLevel: progress.nextLevelExperience,
      peakExperience,
      peakLevel,
      peakRankTitle,
      ladderRank: dbProfile.ladderRank ?? null,
      wins: dbProfile.wins,
      losses: dbProfile.losses,
      matchesPlayed: dbProfile.wins + dbProfile.losses,
      currentStreak: dbProfile.win_streak,
      bestStreak: dbProfile.best_streak,
    }
  }, [dbProfile, localStats])

  const progress = getLevelProgress(profileStats.experience)
  const expPct = progress.progressPct
  const winRate = Math.round((profileStats.wins / Math.max(1, profileStats.matchesPlayed)) * 100)

  return (
    <div className="p-4 space-y-3">
      {/* Page header */}
      <div className="border-b border-dotted border-white/12 pb-3">
        <p className="ca-mono-label text-[0.44rem] text-ca-text-3 tracking-[0.1em]">PROFILE / IDENTITY</p>
        <h1 className="ca-display mt-1 text-[1.85rem] leading-none tracking-[0.05em] text-ca-text">
          {profile.displayName}
        </h1>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_14rem]">
        {/* Left: match history primary */}
        <div className="space-y-3 min-w-0">

          {/* Identity */}
          <SitePanel>
            <div className="p-4">
              <div className="flex items-center gap-4">
                <SquareAvatar
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  fallbackLabel={profile.avatarLabel}
                  size={56}
                  className="rounded-[6px] border-ca-red/35 shrink-0"
                />
                <div className="min-w-0">
                  <p className="ca-display text-[1.6rem] leading-none text-ca-text">{profile.displayName}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {profile.title ? (
                      <span className="ca-mono-label rounded-[4px] border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[0.4rem] text-amber-300">
                        {profile.title}
                      </span>
                    ) : null}
                    <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{profile.playerId}</span>
                  </div>
                  <p className="mt-1.5 ca-mono-label text-[0.42rem] text-ca-text-3">
                    Level {profileStats.level} — {profileStats.rankTitle}
                  </p>
                </div>
                {profileStats.ladderRank ? (
                  <div className="ml-auto shrink-0 text-right">
                    <p className="ca-mono-label text-[0.38rem] text-ca-text-3">Ladder Rank</p>
                    <p className="ca-display mt-0.5 text-[1.4rem] leading-none text-ca-teal">
                      #{profileStats.ladderRank}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* XP bar */}
              <div className="mt-4 border-t border-dotted border-white/10 pt-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="ca-mono-label text-[0.4rem] text-ca-text-3">EXPERIENCE PROGRESS</span>
                  <span className="ca-mono-label text-[0.42rem] text-ca-text-2">
                    {progress.experienceIntoLevel.toLocaleString()} / {progress.experienceNeededForNextLevel.toLocaleString()} XP
                  </span>
                </div>
                <ProgressBar value={expPct} tone="teal" className="h-1.5 bg-white/10" />
                <p className="mt-1 ca-mono-label text-[0.38rem] text-ca-text-3">
                  {(progress.experienceNeededForNextLevel - progress.experienceIntoLevel).toLocaleString()} XP to Level {profileStats.level + 1}
                </p>
              </div>
            </div>
          </SitePanel>

          {/* Match history */}
          <SitePanel>
            <SitePanelHeader eyebrow="Recent Matches" title="Battle History" />
            {recentMatches.length > 0 ? (
              <div className="divide-y divide-dotted divide-white/10">
                {recentMatches.map((match) => (
                  <MatchHistoryRow key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-ca-text-3">No matches recorded yet. Play a battle to get started.</p>
              </div>
            )}
          </SitePanel>
        </div>

        {/* Right: stats + leaderboard */}
        <div className="space-y-3">
          <SitePanel>
            <SitePanelHeader eyebrow="Statistics" title="Record" />
            <div className="divide-y divide-dotted divide-white/10">
              <SiteListRow label="Wins">{profileStats.wins}</SiteListRow>
              <SiteListRow label="Losses">{profileStats.losses}</SiteListRow>
              <SiteListRow label="Win Rate">{winRate}%</SiteListRow>
              <SiteListRow label="Matches">{profileStats.matchesPlayed}</SiteListRow>
              <SiteListRow label="Streak">{profileStats.currentStreak}</SiteListRow>
              <SiteListRow label="Best">{profileStats.bestStreak}</SiteListRow>
              <SiteListRow label="Season">{profileStats.season}</SiteListRow>
            </div>
          </SitePanel>

          {leaderboard.length > 0 && (
            <SitePanel>
              <SitePanelHeader eyebrow="Ranked Ladder" title="Leaderboard" />
              <div className="divide-y divide-dotted divide-white/10">
                {leaderboard.map((entry) => {
                  const isMe = entry.id === user?.id
                  return (
                    <div
                      key={entry.id}
                      className={[
                        'flex items-center gap-2.5 px-4 py-2.5',
                        isMe ? 'bg-ca-teal-wash' : '',
                      ].join(' ')}
                    >
                      <span className={[
                        'ca-mono-label w-5 shrink-0 text-center text-[0.42rem]',
                        entry.ladderRank === 1 ? 'text-amber-300' : entry.ladderRank === 2 ? 'text-slate-300' : entry.ladderRank === 3 ? 'text-amber-600' : 'text-ca-text-3',
                      ].join(' ')}>
                        {entry.ladderRank ?? '—'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={['ca-display truncate text-[0.9rem] leading-none', isMe ? 'text-ca-teal' : 'text-ca-text'].join(' ')}>
                          {entry.display_name}{isMe ? ' ★' : ''}
                        </p>
                        <p className="ca-mono-label mt-0.5 text-[0.36rem] text-ca-text-3">
                          Lv {entry.level} · {entry.wins}W {entry.losses}L
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SitePanel>
          )}
        </div>
      </div>
    </div>
  )
}

function MatchHistoryRow({ match }: { match: MatchHistoryEntry }) {
  const win = match.result === 'WIN'

  return (
    <div className="px-4 py-3 transition hover:bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
            style={{ background: win ? 'rgb(34 197 94)' : 'rgb(250 39 66)' }}
          />
          <span className={['ca-mono-label text-[0.44rem]', win ? 'text-emerald-400' : 'text-ca-red'].join(' ')}>
            {match.result}
          </span>
          <span className="ca-mono-label text-[0.42rem] text-ca-text-3">·</span>
          <span className="ca-mono-label text-[0.42rem] text-ca-text-2">{getModeLabel(match.mode)}</span>
          <span className="ca-mono-label text-[0.42rem] text-ca-text-3">vs {match.opponentName}</span>
        </div>
        <span className="ca-mono-label shrink-0 text-[0.38rem] text-ca-text-3">{formatMatchTimestamp(match.timestamp)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <TinyTeamRow ids={match.yourTeam} label="YOU" />
        <span className="ca-mono-label text-[0.38rem] text-ca-text-3">vs</span>
        <TinyTeamRow ids={match.theirTeam} label="OPP" />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <span className="ca-mono-label text-[0.38rem] text-ca-text-3">{match.rounds} rounds</span>
        {match.mode === 'ranked' ? (
          <span className={['ca-mono-label text-[0.38rem]', match.experienceDelta >= 0 ? 'text-ca-teal' : 'text-ca-red'].join(' ')}>
            {match.experienceDelta >= 0 ? `+${match.experienceDelta}` : match.experienceDelta} XP
          </span>
        ) : null}
      </div>
    </div>
  )
}

function TinyTeamRow({ ids, label }: { ids: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="ca-mono-label text-[0.36rem] text-ca-text-3">{label}</span>
      <div className="flex items-center gap-1">
        {ids.map((id) => {
          const entry = battlePrepRosterById[id]
          return (
            <div key={`${label}-${id}`} className="h-6 w-6 overflow-hidden rounded-[3px]">
              <CharacterFacePortrait
                characterId={id}
                name={entry?.name ?? id}
                src={entry?.facePortrait}
                rarity={entry?.rarity ?? 'R'}
                size="sm"
                className="h-full w-full"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
