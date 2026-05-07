import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import {
  SitePanel,
  SitePanelHeader,
  SiteDivider,
  SiteListRow,
  SiteNewsPost,
} from '@/components/site/siteVisuals'
import { useBattleRoster, useBattleRosterById } from '@/features/battle/contentStore'
import { readBattleProfileStats } from '@/features/battle/matches'
import { useAuth } from '@/features/auth/useAuth'
import { getMissionCoins, getMissionsWithProgress } from '@/features/missions/store'
import { UNLOCK_MISSION_DEFS } from '@/features/missions/unlocks'
import { fetchPlayerRankProfile, getLevelProgress, type PlayerRankProfile } from '@/features/ranking/client'
import { getLadderRankTitle, getLevelForExperience } from '@/features/ranking/ladder'
import { usePlayerState } from '@/features/player/store'

const manualQuickLinks = [
  { label: 'The Basics', desc: 'Rounds, turns, health, targeting, energy' },
  { label: 'Characters & Skills', desc: 'Roles, cooldowns, costs, classes' },
  { label: 'Missions', desc: 'Unlock characters through goals' },
  { label: 'Ladders', desc: 'Ranked progress and standings' },
]

export function HomePage() {
  const { profile } = usePlayerState()
  const { user } = useAuth()
  const localStats = useMemo(() => readBattleProfileStats(), [])
  const missions = useMemo(() => getMissionsWithProgress(), [])
  const missionCoins = useMemo(() => getMissionCoins(), [])
  const [dbProfile, setDbProfile] = useState<PlayerRankProfile | null>(null)
  const battlePrepRoster = useBattleRoster()
  const battlePrepRosterById = useBattleRosterById()

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

  const missionSpotlight = missions.find((m) => !m.complete) ?? missions[0] ?? null
  const completedMissions = missions.filter((m) => m.complete).length
  const winRate = Math.round((profileStats.wins / Math.max(1, profileStats.matchesPlayed)) * 100)

  // All characters for the strip; lead with fan favourites
  const newCharacters = ['yuji', 'megumi', 'nobara', 'gojo', 'todo', 'nanami', 'maki', 'mahito', 'jogo']
    .map((id) => battlePrepRosterById[id])
    .filter(Boolean)

  const rewardEntry =
    battlePrepRosterById[UNLOCK_MISSION_DEFS[0]?.reward.fighterId ?? 'gojo'] ??
    battlePrepRosterById.gojo ??
    battlePrepRoster[0]

  return (
    <div className="p-4 space-y-3">
      {/* Page intro strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dotted border-white/12 pb-3">
        <div>
          <p className="ca-mono-label text-[0.44rem] text-ca-text-3 tracking-[0.1em]">STARTPAGE / NEWS</p>
          <h1 className="ca-display mt-1 text-[1.85rem] leading-none tracking-[0.05em] text-ca-text">
            Cursed-Arena
          </h1>
        </div>
        <Link
          to="/battle/prep"
          className="ca-display shrink-0 rounded-[4px] border border-ca-red/45 bg-ca-red px-5 py-3 text-[1.2rem] leading-none text-white shadow-[0_6px_16px_rgba(250,39,66,0.18)] transition hover:brightness-110 active:scale-[0.98]"
        >
          Start Playing
        </Link>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_14rem]">
        {/* ── Left: primary content column ── */}
        <div className="space-y-3 min-w-0">

          {/* New Characters — above news */}
          <SitePanel>
            <SitePanelHeader
              eyebrow="Characters & Skills"
              title="New Characters"
              action={
                <Link to="/characters" className="ca-mono-label text-[0.44rem] text-ca-teal">
                  VIEW ALL →
                </Link>
              }
            />
            <div className="px-4 pb-4 pt-3">
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-9">
                {newCharacters.map((entry) => (
                  <Link key={entry.id} to={`/characters/${entry.id}`} className="group">
                    <CharacterFacePortrait
                      characterId={entry.id}
                      name={entry.name}
                      src={entry.facePortrait}
                      rarity={entry.rarity}
                      size="md"
                      className="h-auto w-full aspect-square"
                    />
                    <p className="ca-display mt-1.5 truncate text-center text-[0.78rem] leading-none text-ca-text-2 group-hover:text-ca-teal">
                      {entry.battleTemplate.shortName}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </SitePanel>

          {/* News / Updates */}
          <SitePanel>
            <SitePanelHeader eyebrow="Latest Updates" title="Site News" />
            <div className="divide-y divide-dotted divide-white/10 px-4">
              <SiteNewsPost
                date="May 2025"
                patchLabel="PATCH 01B"
                title="Archive Site Pass Online"
                body="Site navigation, character archive, missions, and manual are now live."
              />
              <SiteNewsPost
                date="Apr 2025"
                patchLabel="PATCH 01A"
                title="16-Character Roster Live"
                body="The full launch roster of sixteen characters is now available in the character archive with face portraits, role summaries, ability previews, and grade labels."
              />
              <SiteNewsPost
                date="Mar 2025"
                title="Missions & Unlocks System"
                body="Complete mission goals to unlock characters and earn cursed coins."
              />
            </div>
          </SitePanel>

          {/* Game Manual Quick Reference */}
          <SitePanel>
            <SitePanelHeader
              eyebrow="Game Manual"
              title="Player Reference"
              action={
                <Link to="/manual" className="ca-mono-label text-[0.44rem] text-ca-teal">
                  OPEN MANUAL →
                </Link>
              }
            />
            <div className="divide-y divide-dotted divide-white/10">
              {manualQuickLinks.map((entry) => (
                <Link
                  key={entry.label}
                  to="/manual"
                  className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="ca-display text-[1rem] leading-none text-ca-text">{entry.label}</p>
                    <p className="mt-1 text-[0.72rem] leading-[1.5] text-ca-text-3">{entry.desc}</p>
                  </div>
                  <span className="ca-mono-label shrink-0 text-[0.42rem] text-ca-teal">READ</span>
                </Link>
              ))}
            </div>
          </SitePanel>
        </div>

        {/* ── Right utility column — single: account + mission ── */}
        <div className="space-y-3">

          {/* Account summary — compact, no duplication of sidebar */}
          <SitePanel>
            <SitePanelHeader eyebrow="Account" title={profileStats.playerName || profile.displayName} />
            <div className="divide-y divide-dotted divide-white/10">
              <SiteListRow label="Level">{profileStats.level}</SiteListRow>
              <SiteListRow label="Rank">{profileStats.rankTitle}</SiteListRow>
              <SiteListRow label="Record">{profileStats.wins}W / {profileStats.losses}L</SiteListRow>
              <SiteListRow label="Win Rate">{winRate}%</SiteListRow>
              <SiteListRow label="Coins">{missionCoins}</SiteListRow>
            </div>
          </SitePanel>

          {/* Mission Spotlight */}
          <SitePanel>
            <SitePanelHeader
              eyebrow="Missions"
              title="Mission Spotlight"
              action={
                <span className="ca-mono-label text-[0.38rem] text-ca-text-3">
                  {completedMissions}/{missions.length}
                </span>
              }
            />
            <div className="px-4 py-3 space-y-3">
              {missionSpotlight && rewardEntry ? (
                <>
                  <div className="flex items-center gap-3">
                    <CharacterFacePortrait
                      characterId={rewardEntry.id}
                      name={rewardEntry.name}
                      src={rewardEntry.facePortrait}
                      rarity={rewardEntry.rarity}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="ca-display truncate text-[1.05rem] leading-none text-ca-text">
                        {missionSpotlight.label}
                      </p>
                      <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-text-3">
                        {missionSpotlight.progressLabel}
                      </p>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-ca-teal transition-all"
                      style={{ width: `${Math.min(100, Math.round((missionSpotlight.progress / Math.max(1, missionSpotlight.goal)) * 100))}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-[0.72rem] leading-[1.5] text-ca-text-3">All missions complete.</p>
              )}
              <Link
                to="/missions"
                className="ca-display block rounded-[4px] border border-white/10 bg-white/[0.025] px-3 py-2 text-center text-[0.95rem] text-ca-text-2 transition hover:border-ca-teal/22 hover:text-ca-teal"
              >
                Open Missions
              </Link>
            </div>
          </SitePanel>

          <SiteDivider />
          <div className="px-1">
            <Link to="/profile" className="ca-mono-label block text-[0.44rem] text-ca-text-3 hover:text-ca-teal">
              PROFILE & MATCH HISTORY →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
