import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AbilityChip,
  FighterPortrait,
  FighterStrip,
  IllustratedSiteCard,
  LadderSnapshotCard,
  ManualEntryCard,
  MissionSpotlightCard,
  ReadoutTile,
  RecentBattleRow,
  SiteSectionHeader,
  StylizedPortraitPlaceholder,
  battlePrepRoster,
  battlePrepRosterById,
  homeBgBase,
  siteArtBackgroundStyle,
  sukunaHome,
} from '@/components/site/siteVisuals'
import {
  readBattleProfileStats,
  readRecentMatchHistory,
} from '@/features/battle/matches'
import { useAuth } from '@/features/auth/useAuth'
import { getMissionsWithProgress, getMissionCoins } from '@/features/missions/store'
import { UNLOCK_MISSION_DEFS } from '@/features/missions/unlocks'
import { fetchPlayerRankProfile, getLevelProgress, type PlayerRankProfile } from '@/features/ranking/client'
import { getLadderRankTitle, getLevelForExperience } from '@/features/ranking/ladder'
import { usePlayerState } from '@/features/player/store'

const manualEntries = [
  { title: 'The Basics', label: '01', body: 'Win by defeating all enemy fighters. Every round is a compact exchange of committed techniques.', tone: 'teal' as const },
  { title: 'Cursed Energy', label: 'CE', body: 'Energy types shape what skills can be paid for, held, or exchanged during battle.', tone: 'gold' as const },
  { title: 'Battle Flow', label: 'BF', body: 'Queue skills, assign targets, confirm action order, then resolve the round timeline.', tone: 'red' as const },
  { title: 'Skill Classes', label: 'SC', body: 'Melee, ranged, piercing, control, instant, unique, and ultimate classes drive counters and locks.', tone: 'frost' as const },
]

export function HomePage() {
  const navigate = useNavigate()
  const { profile } = usePlayerState()
  const { user } = useAuth()
  const localStats = useMemo(() => readBattleProfileStats(), [])
  const recentMatches = useMemo(() => readRecentMatchHistory().slice(0, 4), [])
  const missions = useMemo(() => getMissionsWithProgress(), [])
  const missionCoins = useMemo(() => getMissionCoins(), [])
  const [dbProfile, setDbProfile] = useState<PlayerRankProfile | null>(null)

  useEffect(() => {
    if (!user) return
    void fetchPlayerRankProfile(user.id).then(({ data }) => {
      if (data) setDbProfile(data)
    })
  }, [user])

  const profileStats = useMemo(() => {
    if (!dbProfile) return localStats
    const experience = dbProfile.experience
    const level = getLevelForExperience(experience)
    const progress = getLevelProgress(experience)
    return {
      ...localStats,
      experience,
      level,
      rankTitle: getLadderRankTitle({ level, ladderRank: dbProfile.ladderRank ?? null }),
      experienceToNextLevel: progress.nextLevelExperience,
      wins: dbProfile.wins,
      losses: dbProfile.losses,
      currentStreak: dbProfile.win_streak,
      bestStreak: dbProfile.best_streak,
      matchesPlayed: dbProfile.wins + dbProfile.losses,
    }
  }, [dbProfile, localStats])

  const missionSpotlight = missions.find((mission) => !mission.complete) ?? missions[0] ?? null
  const completedMissions = missions.filter((mission) => mission.complete).length
  const winRate = Math.round((profileStats.wins / Math.max(1, profileStats.matchesPlayed)) * 100)
  const featuredFighters = ['yuji', 'megumi', 'nobara', 'gojo', 'todo', 'nanami']
    .map((id) => battlePrepRosterById[id])
    .filter(Boolean)
  const heroFighter = battlePrepRosterById.sukuna ?? battlePrepRoster[0]
  const rewardEntry =
    battlePrepRosterById[UNLOCK_MISSION_DEFS[0]?.reward.fighterId ?? 'gojo'] ??
    battlePrepRosterById.gojo ??
    battlePrepRoster[0]

  return (
    <div className="space-y-4">
      <HomeHero onStart={() => navigate('/battle/prep')} fighter={heroFighter} />

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <HomeStartPlayingCard onStart={() => navigate('/battle/prep')} fighter={battlePrepRosterById.yuji ?? featuredFighters[0]} />
        <HomeRecentMatches matches={recentMatches} />
      </div>

      <IllustratedSiteCard>
        <div className="p-4">
          <SiteSectionHeader
            eyebrow="Characters & Skills"
            title="Roster Archive"
            action={<Link to="/characters" className="ca-mono-label text-[0.46rem] text-ca-teal">VIEW ARCHIVE</Link>}
          />
          <FighterStrip entries={featuredFighters} />
        </div>
      </IllustratedSiteCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <IllustratedSiteCard>
          <div className="p-4">
            <SiteSectionHeader
              eyebrow="Game Manual"
              title="Battle Reference"
              action={<Link to="/manual" className="ca-mono-label text-[0.46rem] text-ca-teal">OPEN MANUAL</Link>}
            />
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {manualEntries.map((entry) => (
                <ManualEntryCard key={entry.title} {...entry} />
              ))}
            </div>
          </div>
        </IllustratedSiteCard>

        <HomeAccountSummary
          avatarLabel={profile.avatarLabel}
          playerName={profileStats.playerName}
          rankTitle={profileStats.rankTitle}
          level={profileStats.level}
          wins={profileStats.wins}
          losses={profileStats.losses}
          winRate={winRate}
          missionCoins={missionCoins}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MissionSpotlightCard
          mission={missionSpotlight}
          rewardEntry={rewardEntry}
          completed={completedMissions}
          total={missions.length}
        />
        <LadderSnapshotCard
          level={profileStats.level}
          rankTitle={profileStats.rankTitle}
          wins={profileStats.wins}
          losses={profileStats.losses}
          winRate={winRate}
          entries={featuredFighters}
        />
      </div>
    </div>
  )
}

function HomeHero({ onStart, fighter }: { onStart: () => void; fighter?: (typeof battlePrepRoster)[number] }) {
  return (
    <section className="relative min-h-[22rem] overflow-hidden rounded-[10px] border border-white/10 bg-[linear-gradient(135deg,rgba(28,24,34,0.9),rgba(14,13,19,0.92))] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.24)]">
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35" style={siteArtBackgroundStyle(homeBgBase)} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_10%_20%,rgba(250,39,66,0.2),transparent_58%),radial-gradient(64%_110%_at_90%_10%,rgba(5,216,189,0.14),transparent_62%),linear-gradient(90deg,rgba(13,12,17,0.92)_0%,rgba(13,12,17,0.72)_48%,rgba(13,12,17,0.28)_100%)]" />
      <div className="pointer-events-none absolute bottom-[-3.5rem] right-[-1rem] hidden h-[28rem] w-[22rem] md:block">
        <img src={sukunaHome} alt="" className="h-full w-full object-contain object-bottom opacity-95 drop-shadow-[0_26px_42px_rgba(0,0,0,0.55)]" draggable={false} />
      </div>

      <div className="relative grid min-h-[19rem] gap-5 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-end">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="teal">LATEST UPDATE</Tag>
            <Tag tone="red">CURSED ARCHIVE</Tag>
            <span className="ca-mono-label text-[0.48rem] text-ca-text-3">SITE HUB ONLINE</span>
          </div>
          <h1 className="ca-display mt-4 max-w-3xl text-[3.4rem] leading-[0.9] tracking-[0.05em] text-ca-text sm:text-[4.7rem]">
            Enter The Cursed Arena
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-ca-text-2">
            Study fighter kits, unlock new techniques through missions, then enter the focused 3v3 battle client. Cursed-Arena now behaves like a game website first and a match client when it is time to fight.
          </p>
          {fighter ? (
            <div className="mt-4 grid max-w-xl gap-2 sm:grid-cols-3">
              <ReadoutTile label="Featured" value={fighter.battleTemplate.shortName} />
              <ReadoutTile label="Role" value={fighter.role.split('/')[0] ?? fighter.role} />
              <ReadoutTile label="Grade" value={fighter.gradeLabel.replace('SPECIAL ', 'S. ')} />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onStart}
          className="ca-display rounded-[9px] border border-ca-red/55 bg-[linear-gradient(180deg,rgba(250,39,66,0.98),rgba(196,29,51,0.96))] px-5 py-4 text-center text-[2rem] leading-none text-white shadow-[0_16px_36px_rgba(250,39,66,0.22)] transition duration-150 hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Start Playing
        </button>
      </div>
    </section>
  )
}

function HomeStartPlayingCard({ onStart, fighter }: { onStart: () => void; fighter?: (typeof battlePrepRoster)[number] }) {
  return (
    <IllustratedSiteCard className="border-ca-red/28">
      <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-[5rem_minmax(0,1fr)]">
          {fighter ? <FighterPortrait entry={fighter} className="aspect-square" /> : <StylizedPortraitPlaceholder label="CA" tone="red" className="aspect-square" />}
          <div className="min-w-0">
            <p className="ca-mono-label text-[0.48rem] text-ca-red">GAME CLIENT</p>
            <h2 className="ca-display mt-2 text-[2rem] leading-none text-ca-text">Ready Room</h2>
            <p className="mt-2 text-sm leading-5 text-ca-text-2">Select a trio and enter matchmaking.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="ca-display mt-4 w-full rounded-[8px] border border-ca-red/45 bg-ca-red px-4 py-3 text-[1.45rem] leading-none text-white transition duration-150 hover:brightness-110 active:scale-[0.98]"
        >
          Start Playing
        </button>
      </div>
    </IllustratedSiteCard>
  )
}

function HomeAccountSummary({
  avatarLabel,
  playerName,
  rankTitle,
  level,
  wins,
  losses,
  winRate,
  missionCoins,
}: {
  avatarLabel: string
  playerName: string
  rankTitle: string
  level: number
  wins: number
  losses: number
  winRate: number
  missionCoins: number
}) {
  return (
    <IllustratedSiteCard>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <StylizedPortraitPlaceholder label={avatarLabel} tone="red" className="h-12 w-12 rounded-full" />
          <div className="min-w-0">
            <p className="ca-display truncate text-[1.75rem] leading-none text-ca-text">{playerName}</p>
            <p className="ca-mono-label mt-1 text-[0.45rem] text-ca-text-3">LV {level} / {rankTitle}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <ReadoutTile label="W" value={wins} />
          <ReadoutTile label="L" value={losses} />
          <ReadoutTile label="WR" value={`${winRate}%`} />
          <ReadoutTile label="CC" value={missionCoins} />
        </div>
      </div>
    </IllustratedSiteCard>
  )
}

function HomeRecentMatches({ matches }: { matches: ReturnType<typeof readRecentMatchHistory> }) {
  const fallbackEntries = battlePrepRoster.slice(0, 3)

  return (
    <IllustratedSiteCard>
      <div className="p-4">
        <SiteSectionHeader
          eyebrow="Recent Battles"
          title="Battle Log"
          action={<Link to="/battle/results" className="ca-mono-label text-[0.46rem] text-ca-teal">RESULTS</Link>}
        />
        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
          {matches.length > 0 ? (
            matches.map((match) => (
              <RecentBattleRow
                key={match.id}
                match={match}
                entries={match.yourTeam.map((id) => battlePrepRosterById[id]).filter(Boolean)}
              />
            ))
          ) : (
            <div className="rounded-[8px] border border-white/8 bg-white/[0.025] p-3">
              <div className="flex -space-x-2">
                {fallbackEntries.map((entry) => (
                  <FighterPortrait key={entry.id} entry={entry} className="h-10 w-10 rounded-full" imgClassName="top-[13%] w-[110%]" />
                ))}
              </div>
              <p className="mt-3 text-sm text-ca-text-3">Your recent battle log will appear here after your first match.</p>
            </div>
          )}
        </div>
      </div>
    </IllustratedSiteCard>
  )
}

function Tag({ tone, children }: { tone: 'red' | 'teal'; children: string }) {
  return (
    <span className={['ca-mono-label rounded-[5px] border px-2 py-1 text-[0.45rem]', tone === 'red' ? 'border-ca-red/25 bg-ca-red-wash text-ca-red' : 'border-ca-teal/25 bg-ca-teal-wash text-ca-teal'].join(' ')}>
      {children}
    </span>
  )
}

export function HomeAbilityPreview({ fighter }: { fighter: (typeof battlePrepRoster)[number] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fighter.battleTemplate.abilities.slice(0, 2).map((ability) => (
        <AbilityChip key={ability.id} ability={ability} />
      ))}
    </div>
  )
}
