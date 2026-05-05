import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import {
  FighterStrip,
  IllustratedSiteCard,
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
} from '@/components/site/siteVisuals'
import { readBattleProfileStats, readRecentMatchHistory } from '@/features/battle/matches'
import { useAuth } from '@/features/auth/useAuth'
import { getMissionCoins, getMissionsWithProgress } from '@/features/missions/store'
import { UNLOCK_MISSION_DEFS } from '@/features/missions/unlocks'
import { fetchPlayerRankProfile, getLevelProgress, type PlayerRankProfile } from '@/features/ranking/client'
import { getLadderRankTitle, getLevelForExperience } from '@/features/ranking/ladder'
import { usePlayerState } from '@/features/player/store'

const manualEntries = [
  { title: 'The Basics', label: '01', body: 'Rounds, teams, health, targeting, and the win condition for 3v3 arena play.', tone: 'teal' as const },
  { title: 'Characters & Skills', label: 'CS', body: 'Read fighter roles, cooldowns, costs, classes, passives, and ultimate rules.', tone: 'red' as const },
  { title: 'Cursed Energy', label: 'CE', body: 'Energy pips determine which techniques can be committed each round.', tone: 'gold' as const },
  { title: 'Ladders & Missions', label: 'LM', body: 'Track ranked progress and unlock fighters through compact mission goals.', tone: 'frost' as const },
]

export function HomePage() {
  const navigate = useNavigate()
  const { profile } = usePlayerState()
  const { user } = useAuth()
  const localStats = useMemo(() => readBattleProfileStats(), [])
  const recentMatches = useMemo(() => readRecentMatchHistory().slice(0, 5), [])
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
  const rewardEntry =
    battlePrepRosterById[UNLOCK_MISSION_DEFS[0]?.reward.fighterId ?? 'gojo'] ??
    battlePrepRosterById.gojo ??
    battlePrepRoster[0]

  return (
    <div className="space-y-3">
      <HomePageHeader onStart={() => navigate('/battle/prep')} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <LatestUpdateNews fighters={featuredFighters.slice(0, 4)} />
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

      <IllustratedSiteCard>
        <div className="p-3">
          <SiteSectionHeader
            eyebrow="Characters & Skills"
            title="New / Reworked Fighters"
            action={<Link to="/characters" className="ca-mono-label text-[0.44rem] text-ca-teal">VIEW ARCHIVE</Link>}
          />
          <FighterStrip entries={featuredFighters} />
        </div>
      </IllustratedSiteCard>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <IllustratedSiteCard>
          <div className="p-3">
            <SiteSectionHeader
              eyebrow="Game Manual"
              title="Player Reference"
              action={<Link to="/manual" className="ca-mono-label text-[0.44rem] text-ca-teal">OPEN MANUAL</Link>}
            />
            <div className="grid gap-2 md:grid-cols-2">
              {manualEntries.map((entry) => (
                <ManualEntryCard key={entry.title} {...entry} />
              ))}
            </div>
          </div>
        </IllustratedSiteCard>

        <MissionSpotlightCard
          mission={missionSpotlight}
          rewardEntry={rewardEntry}
          completed={completedMissions}
          total={missions.length}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <HomeRecentMatches matches={recentMatches} />
        <LadderMiniTable
          level={profileStats.level}
          rankTitle={profileStats.rankTitle}
          wins={profileStats.wins}
          losses={profileStats.losses}
          winRate={winRate}
        />
      </div>
    </div>
  )
}

function HomePageHeader({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-[7px] border border-white/10 bg-[rgba(30,28,36,0.58)] px-4 py-3">
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-18" style={siteArtBackgroundStyle(homeBgBase)} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(13,12,17,0.96),rgba(13,12,17,0.75)),radial-gradient(72%_140%_at_90%_0%,rgba(5,216,189,0.12),transparent_58%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ca-mono-label text-[0.46rem] text-ca-teal">STARTPAGE / NEWS</p>
          <h1 className="ca-display mt-1 text-[2.35rem] leading-none tracking-[0.06em] text-ca-text">Cursed-Arena</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ca-text-2">
            Study fighter files, unlock roster goals, check the ladder, then enter the focused 3v3 match client.
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="ca-display rounded-[7px] border border-ca-red/45 bg-ca-red px-5 py-3 text-[1.4rem] leading-none text-white shadow-[0_10px_24px_rgba(250,39,66,0.16)] transition duration-150 hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Start Playing
        </button>
      </div>
    </section>
  )
}

function LatestUpdateNews({ fighters }: { fighters: (typeof battlePrepRoster)[number][] }) {
  return (
    <IllustratedSiteCard>
      <article className="p-3">
        <SiteSectionHeader
          eyebrow="Latest Update"
          title="Archive Site Pass Online"
          action={<span className="ca-mono-label text-[0.42rem] text-ca-text-3">PATCH 01B</span>}
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
          <div>
            <p className="text-sm leading-6 text-ca-text-2">
              Cursed-Arena now presents the site like a compact battle archive: navigation, account, recent activity, fighter files, missions, and manual entries live around the startpage instead of a launcher dashboard.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <NewsBullet title="Start Playing" body="Team selection remains the primary entrance into the match client." />
              <NewsBullet title="Roster Archive" body="Character thumbnails and skill previews move the site toward a Naruto-Arena-style reference hub." />
            </div>
          </div>
          <div className="rounded-[7px] border border-white/8 bg-black/18 p-2">
            <p className="ca-mono-label mb-2 text-[0.42rem] text-ca-text-3">FEATURED FILES</p>
            <div className="grid grid-cols-2 gap-2">
              {fighters.map((entry) => (
                <Link key={entry.id} to="/characters" className="group">
                  <CharacterFacePortrait
                    characterId={entry.id}
                    name={entry.name}
                    src={entry.facePortrait}
                    rarity={entry.rarity}
                    size="lg"
                    className="h-auto w-full aspect-square"
                  />
                  <p className="ca-display mt-1 truncate text-[0.9rem] leading-none text-ca-text-2 group-hover:text-ca-teal">
                    {entry.battleTemplate.shortName}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </article>
    </IllustratedSiteCard>
  )
}

function NewsBullet({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[6px] border border-dotted border-white/12 bg-white/[0.02] px-3 py-2">
      <p className="ca-display text-[1rem] leading-none text-ca-text">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ca-text-3">{body}</p>
    </div>
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
      <div className="p-3">
        <div className="flex items-center gap-3 border-b border-dotted border-white/12 pb-3">
          <StylizedPortraitPlaceholder label={avatarLabel} tone="red" className="h-12 w-12 rounded-[7px]" />
          <div className="min-w-0">
            <p className="ca-display truncate text-[1.35rem] leading-none text-ca-text">{playerName}</p>
            <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-text-3">LV {level} / {rankTitle}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ReadoutTile label="Record" value={`${wins}W/${losses}L`} />
          <ReadoutTile label="Win Rate" value={`${winRate}%`} />
          <ReadoutTile label="Coins" value={missionCoins} />
          <ReadoutTile label="Mode" value="3v3" />
        </div>
      </div>
    </IllustratedSiteCard>
  )
}

function HomeRecentMatches({ matches }: { matches: ReturnType<typeof readRecentMatchHistory> }) {
  const fallbackEntries = battlePrepRoster.slice(0, 3)

  return (
    <IllustratedSiteCard>
      <div className="p-3">
        <SiteSectionHeader
          eyebrow="Recent Games"
          title="Battle Log"
          action={<Link to="/battle/results" className="ca-mono-label text-[0.44rem] text-ca-teal">RESULTS</Link>}
        />
        <div className="space-y-2">
          {matches.length > 0 ? (
            matches.map((match) => (
              <RecentBattleRow
                key={match.id}
                match={match}
                entries={match.yourTeam.map((id) => battlePrepRosterById[id]).filter(Boolean)}
              />
            ))
          ) : (
            <div className="rounded-[7px] border border-white/8 bg-white/[0.025] p-3">
              <div className="flex gap-2">
                {fallbackEntries.map((entry) => (
                  <CharacterFacePortrait key={entry.id} characterId={entry.id} name={entry.name} src={entry.facePortrait} rarity={entry.rarity} size="sm" />
                ))}
              </div>
              <p className="mt-3 text-sm text-ca-text-3">Your battle log will appear after your first match.</p>
            </div>
          )}
        </div>
      </div>
    </IllustratedSiteCard>
  )
}

function LadderMiniTable({
  level,
  rankTitle,
  wins,
  losses,
  winRate,
}: {
  level: number
  rankTitle: string
  wins: number
  losses: number
  winRate: number
}) {
  return (
    <IllustratedSiteCard>
      <div className="p-3">
        <SiteSectionHeader
          eyebrow="Ladder Snapshot"
          title="Profile Rank"
          action={<Link to="/ladders" className="ca-mono-label text-[0.44rem] text-ca-teal">LADDERS</Link>}
        />
        <div className="divide-y divide-dotted divide-white/12 rounded-[6px] border border-white/8 bg-white/[0.02]">
          <RankRow label="Level" value={level} />
          <RankRow label="Rank" value={rankTitle} />
          <RankRow label="Record" value={`${wins}W / ${losses}L`} />
          <RankRow label="Win Rate" value={`${winRate}%`} />
        </div>
      </div>
    </IllustratedSiteCard>
  )
}

function RankRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <span className="ca-mono-label truncate text-right text-[0.46rem] text-ca-text-2">{value}</span>
    </div>
  )
}
