import { useEffect, useMemo, useState } from 'react'
import { CharacterCard } from '@/components/ui/CharacterCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ownedRosterCharacters } from '@/data/characters'
import {
  formatMatchTimestamp,
  getFeaturedTeamIds,
  getModeLabel,
  readBattleProfileStats,
  readRecentMatchHistory,
  type MatchHistoryEntry,
} from '@/features/battle/matches'
import { usePlayerState } from '@/features/player/store'
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

const rosterById = Object.fromEntries(ownedRosterCharacters.map((character) => [character.id, character]))

export function ProfilePage() {
  const { profile } = usePlayerState()
  const { user } = useAuth()
  const localStats = useMemo(() => readBattleProfileStats(), [])
  const localMatches = useMemo(() => readRecentMatchHistory(), [])
  const currentSquad = useMemo(() => getFeaturedTeamIds(), [])

  const [dbProfile, setDbProfile] = useState<PlayerRankProfile | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [serverMatches, setServerMatches] = useState<MatchHistoryEntry[] | null>(null)

  useEffect(() => {
    if (!user) return
    fetchPlayerRankProfile(user.id).then(({ data }) => { if (data) setDbProfile(data) })
    fetchLeaderboard(10).then(({ data }) => { setLeaderboard(data) })
    fetchPlayerMatchHistory(user.id, 20).then(({ data }) => { if (data && data.length > 0) setServerMatches(data) })
  }, [user])

  // Prefer server history when available (cross-device); fall back to localStorage
  const recentMatches = serverMatches ?? localMatches

  // Prefer server experience/stats when the user is logged in
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
  const statBento = [
    { label: 'Total Wins', value: `${profileStats.wins}` },
    { label: 'Total Losses', value: `${profileStats.losses}` },
    { label: 'Win Rate', value: `${Math.round((profileStats.wins / Math.max(1, profileStats.matchesPlayed)) * 100)}%` },
    { label: 'Matches Played', value: `${profileStats.matchesPlayed}` },
    { label: 'Current Streak', value: `${profileStats.currentStreak}` },
    { label: 'Best Streak', value: `${profileStats.bestStreak}` },
  ]

  return (
    <section className="py-4 sm:py-6">
      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:gap-5">
        <div className="min-w-0 space-y-4">
          <div className="animate-ca-stagger-in" style={{ animationDelay: '0ms' }}>
            <ProfileHeaderCard profile={profile} />
          </div>
          <div className="animate-ca-stagger-in" style={{ animationDelay: '60ms' }}>
            <RankCard profileStats={profileStats} expPct={expPct} progress={progress} />
          </div>
          <div className="animate-ca-stagger-in" style={{ animationDelay: '120ms' }}>
            <StatsBento items={statBento} />
          </div>
          {leaderboard.length > 0 && (
            <div className="animate-ca-stagger-in" style={{ animationDelay: '180ms' }}>
              <LeaderboardCard leaderboard={leaderboard} currentUserId={user?.id} />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="animate-ca-stagger-in" style={{ animationDelay: '80ms' }}>
            <FeaturedTeamCard currentSquad={currentSquad} />
          </div>
          <div className="animate-ca-stagger-in" style={{ animationDelay: '160ms' }}>
            <MatchHistoryCard recentMatches={recentMatches} />
          </div>
        </div>
      </div>
    </section>
  )
}

function ProfileHeaderCard({
  profile,
}: {
  profile: ReturnType<typeof usePlayerState>['profile']
}) {
  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-sky-300/30 bg-[linear-gradient(145deg,rgba(96,165,250,0.12),rgba(20,20,28,0.3))]">
          <span className="ca-display text-2xl text-ca-text">{profile.avatarLabel}</span>
        </div>

        <div className="min-w-0">
          <h1 className="ca-display text-4xl text-ca-text sm:text-[2.6rem]">{profile.displayName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ca-mono-label rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[0.46rem] text-amber-300">
              {profile.title}
            </span>
            <span className="ca-mono-label text-[0.48rem] text-ca-text-disabled">{profile.playerId}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function RankCard({
  profileStats,
  expPct,
  progress,
}: {
  profileStats: ReturnType<typeof readBattleProfileStats>
  expPct: number
  progress: ReturnType<typeof getLevelProgress>
}) {
  const titleInitials = profileStats.rankTitle.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="grid h-16 w-16 place-items-center rounded-full border border-sky-300/30 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.14),transparent_46%),linear-gradient(145deg,rgba(96,165,250,0.14),rgba(31,41,55,0.3))] shadow-[0_0_20px_rgba(96,165,250,0.14)]">
          <span className="ca-display text-2xl text-sky-200">{titleInitials}</span>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ca-display text-3xl text-ca-text">
                Level {profileStats.level} — {profileStats.rankTitle}
              </p>
              <p className="ca-mono-label mt-1 text-[0.5rem] text-ca-text-disabled">{profileStats.season}</p>
            </div>
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">
              PEAK: Lv {profileStats.peakLevel} — {profileStats.peakRankTitle}
            </p>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="ca-mono-label text-[0.48rem] text-ca-text-3">EXPERIENCE PROGRESS</span>
              <span className="ca-mono-label text-[0.52rem] text-ca-text-2">
                {progress.experienceIntoLevel.toLocaleString()} / {progress.experienceNeededForNextLevel.toLocaleString()} XP
              </span>
            </div>
            <ProgressBar value={expPct} tone="teal" className="h-2 bg-ca-highlight/55" />
            <p className="mt-1.5 ca-mono-label text-[0.44rem] text-ca-text-3">
              {progress.experienceNeededForNextLevel - progress.experienceIntoLevel} XP to Level {profileStats.level + 1}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatsBento({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="ca-card border-white/8 bg-[rgba(14,15,20,0.14)] p-4 shadow-[0_8px_18px_rgba(0,0,0,0.12)]">
          <p className="ca-display text-3xl text-ca-text sm:text-[2.1rem]">{item.value}</p>
          <p className="ca-mono-label mt-2 text-[0.42rem] text-ca-text-disabled">{item.label}</p>
        </div>
      ))}
    </section>
  )
}

function LeaderboardCard({
  leaderboard,
  currentUserId,
}: {
  leaderboard: LeaderboardEntry[]
  currentUserId?: string
}) {
  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="mb-4">
        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Ranked Ladder</p>
        <p className="ca-display mt-2 text-3xl text-ca-text">Leaderboard</p>
      </div>

      <div className="space-y-1.5">
        {leaderboard.map((entry) => {
          const isMe = entry.id === currentUserId
          const wl = entry.wins + entry.losses
          const winRate = wl > 0 ? Math.round((entry.wins / wl) * 100) : 0
          const rank = entry.ladderRank

          return (
            <div
              key={entry.id}
              className={[
                'flex items-center gap-3 rounded-[8px] border px-3 py-2.5 transition duration-150',
                isMe
                  ? 'border-sky-400/20 bg-sky-400/6 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.08)]'
                  : 'border-white/6 bg-[rgba(16,17,22,0.14)] hover:border-white/10 hover:bg-[rgba(20,21,28,0.2)]',
              ].join(' ')}
            >
              <span className={[
                'ca-mono-label w-5 shrink-0 text-center text-[0.46rem]',
                rank === 1 ? 'text-amber-300' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-600' : 'text-ca-text-3',
              ].join(' ')}>
                {rank ?? '—'}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={['ca-mono-label text-[0.5rem]', isMe ? 'text-sky-300' : 'text-ca-text-2'].join(' ')}>
                    {entry.display_name}
                    {isMe ? ' (YOU)' : ''}
                  </span>
                  <span className="ca-mono-label text-[0.44rem] text-ca-text-3">
                    Lv {entry.level} — {entry.rankTitle}
                  </span>
                </div>
                <p className="ca-mono-label mt-0.5 text-[0.42rem] text-ca-text-3">
                  {entry.wins}W / {entry.losses}L — {winRate}%
                </p>
              </div>

              <span className="ca-mono-label shrink-0 text-[0.52rem] text-ca-teal">
                {entry.experience.toLocaleString()} EXP
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function FeaturedTeamCard({ currentSquad }: { currentSquad: string[] }) {
  const team = currentSquad.map((characterId) => rosterById[characterId]).filter((character) => Boolean(character))

  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Current Squad</p>
          <p className="ca-display mt-2 text-3xl text-ca-text">Featured Trio</p>
        </div>
        <span className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2 py-1 text-[0.46rem] text-ca-teal">MOST RECENT</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {team.map((character) => (
          <div key={character.id} className="min-w-0">
            <CharacterCard character={character} />
          </div>
        ))}
      </div>
    </section>
  )
}

function MatchHistoryCard({ recentMatches }: { recentMatches: MatchHistoryEntry[] }) {
  return (
    <section className="ca-card min-h-0 border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="mb-4">
        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Recent Matches</p>
        <p className="ca-display mt-2 text-3xl text-ca-text">Battle History</p>
      </div>

      <div className="space-y-2.5">
        {recentMatches.map((match) => (
          <MatchHistoryRow key={match.id} match={match} />
        ))}
      </div>
    </section>
  )
}

function MatchHistoryRow({ match }: { match: MatchHistoryEntry }) {
  const win = match.result === 'WIN'

  return (
    <div
      className="rounded-[10px] border border-white/7 bg-[rgba(16,17,22,0.16)] p-3 transition duration-150 hover:border-white/12 hover:bg-[rgba(20,21,28,0.22)]"
      style={{ boxShadow: `inset 2px 0 0 ${win ? 'rgba(34,197,94,0.28)' : 'rgba(250,39,66,0.22)'}` }}
    >
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: win ? 'rgb(34 197 94)' : 'rgb(250 39 66)',
              boxShadow: win ? '0 0 10px rgba(34,197,94,0.24)' : '0 0 10px rgba(250,39,66,0.22)',
            }}
          />
          <span className={`ca-mono-label text-[0.5rem] ${win ? 'text-emerald-300' : 'text-ca-red'}`}>{match.result}</span>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ca-mono-label text-[0.48rem] text-ca-text-2">{getModeLabel(match.mode)}</span>
            <span className="ca-mono-label text-[0.48rem] text-ca-text-2">VS {match.opponentName}</span>
            {match.opponentRankLabel ? <span className="ca-mono-label text-[0.44rem] text-ca-text-3">{match.opponentRankLabel}</span> : null}
            <span className="ca-mono-label text-[0.44rem] text-ca-text-3">{formatMatchTimestamp(match.timestamp)}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TinyTeamRow ids={match.yourTeam} label="YOU" />
            <span className="ca-mono-label text-[0.42rem] text-ca-text-3">VS</span>
            <TinyTeamRow ids={match.theirTeam} label="THEM" />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{match.rounds} ROUNDS</span>
            {match.mode === 'ranked' ? (
              <span className={`ca-mono-label text-[0.42rem] ${match.experienceDelta >= 0 ? 'text-ca-teal' : 'text-ca-red'}`}>
                {match.experienceDelta >= 0 ? `+${match.experienceDelta} XP` : `${match.experienceDelta} XP`}
              </span>
            ) : null}
            <span className="ca-mono-label text-[0.42rem] text-ca-text-3">
              Lv {match.levelBefore} → {match.levelAfter}
            </span>
          </div>
        </div>

        <span className="ca-mono-label text-[0.45rem] text-ca-text-3">{formatMatchTimestamp(match.timestamp)}</span>
      </div>
    </div>
  )
}

function TinyTeamRow({ ids, label }: { ids: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</span>
      <div className="flex items-center gap-1">
        {ids.map((id) => (
          <TinyPortrait key={`${label}-${id}`} characterId={id} />
        ))}
      </div>
    </div>
  )
}

function TinyPortrait({ characterId }: { characterId: string }) {
  const character = rosterById[characterId]
  if (!character?.renderSrc) {
    return (
      <div className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-[rgba(255,255,255,0.03)]">
        <span className="ca-mono-label text-[0.32rem] text-ca-text-3">?</span>
      </div>
    )
  }

  const frame = character.portraitFrame ?? {}
  const scale = (frame.scale ?? 1.6) * 0.92
  const x = frame.x ?? '0%'
  const y = frame.y ?? '10%'

  return (
    <div className="relative h-6 w-6 overflow-hidden rounded-full border border-white/10 bg-[rgba(255,255,255,0.03)]">
      <div
        className="absolute left-1/2 top-[6%] w-[96%]"
        style={{ transform: `translate(-50%, 0) translate(${x}, ${y}) scale(${scale})`, transformOrigin: 'top center' }}
      >
        <img src={character.renderSrc} alt={character.name} className="block h-auto w-full select-none" draggable={false} />
      </div>
    </div>
  )
}
