import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import sukunaHome from '@/assets/renders/sukuna-home.webp'
import {
  getModeDescription,
  getModeLabel,
  getRankTier,
  readBattleProfileStats,
  readLastBattleResult,
  readRecentMatchHistory,
  persistSelectedMatchMode,
  type BattleMatchMode,
} from '@/features/battle/matches'
import { usePlayerState } from '@/features/player/store'
import { useAuth } from '@/features/auth/useAuth'
import { fetchPlayerRankProfile, type PlayerRankProfile } from '@/features/ranking/client'
import {
  getMissionsWithProgress,
  getMissionCoins,
  type MissionWithProgress,
} from '@/features/missions/store'

type HomeHeroRenderConfig = {
  image: string
  anchorX: string
  anchorY: string
  scale: number
  xOffset: string
  yOffset: string
  maxWidth: string
  wordmarkOffsetX: string
  wordmarkOffsetY: string
  wordmarkOpacity: number
  wordmarkSize: string
  bottomFadeHeight: string
  bottomFadeStrength: number
  sideFadeStrength: number
  glowRed: number
  glowTeal: number
  glowFrost: number
  rimLightStrength: number
  opacity: number
}

const homeHeroRender: HomeHeroRenderConfig = {
  image: sukunaHome,
  anchorX: '50%',
  anchorY: '87%',
  scale: 0.9,
  xOffset: '4%',
  yOffset: '0%',
  maxWidth: '35.5rem',
  wordmarkOffsetX: '6%',
  wordmarkOffsetY: '-52%',
  wordmarkOpacity: 0.032,
  wordmarkSize: '8.5rem',
  bottomFadeHeight: '41%',
  bottomFadeStrength: 0.92,
  sideFadeStrength: 0.12,
  glowRed: 0.46,
  glowTeal: 0.28,
  glowFrost: 0.38,
  rimLightStrength: 0.34,
  opacity: 0.97,
}

export function HomePage() {
  const navigate = useNavigate()
  const { profile } = usePlayerState()
  const { user } = useAuth()
  const profileStats = useMemo(() => readBattleProfileStats(), [])
  const recentMatches = useMemo(() => readRecentMatchHistory().slice(0, 3), [])
  const lastResult = useMemo(() => readLastBattleResult(), [])
  const selectedMode: BattleMatchMode = lastResult?.mode ?? 'ranked'

  const [dbProfile, setDbProfile] = useState<PlayerRankProfile | null>(null)
  const missions = useMemo<MissionWithProgress[]>(() => getMissionsWithProgress(), [])
  const coins = useMemo(() => getMissionCoins(), [])

  // Fetch real LP from DB when logged in
  useEffect(() => {
    if (!user) return
    void fetchPlayerRankProfile(user.id).then(({ data }) => {
      if (data) setDbProfile(data)
    })
  }, [user])



  const displayStats = useMemo(() => {
    if (!dbProfile) return profileStats
    const rankTier = getRankTier(dbProfile.lp)
    return {
      ...profileStats,
      rank: rankTier.label,
      lpCurrent: dbProfile.lp,
      wins: dbProfile.wins,
      losses: dbProfile.losses,
      currentStreak: dbProfile.win_streak,
      bestStreak: dbProfile.best_streak,
      matchesPlayed: dbProfile.wins + dbProfile.losses,
    }
  }, [dbProfile, profileStats])

  const dailyMissions = missions.filter((m) => m.type === 'daily')
  const weeklyMissions = missions.filter((m) => m.type === 'weekly')

  function handleLaunchMode(mode: BattleMatchMode) {
    persistSelectedMatchMode(mode)
    navigate('/battle/prep')
  }

  return (
    <div className="relative isolate grid h-full grid-cols-1 gap-4 overflow-hidden py-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] xl:gap-5 xl:py-6">
      <section className="relative z-10 min-w-0 space-y-4">
        <EventBanner />

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <MissionColumn title="Daily Missions" missions={dailyMissions} />
          <MissionColumn title="Weekly Missions" missions={weeklyMissions} />
        </div>

        <BattlePassCard />
        <StoryContinueCard />
        <ProfileSummaryCard
          profileStats={displayStats}
          avatarLabel={profile.avatarLabel}
          coins={coins}
        />
      </section>

      <aside className="relative z-10 min-w-0">
        <HeroPlayPanel
          profileStats={displayStats}
          recentMatches={recentMatches}
          selectedMode={selectedMode}
          onLaunchMode={handleLaunchMode}
        />
      </aside>
    </div>
  )
}

function EventBanner() {
  return (
    <SurfaceCard className="overflow-hidden border-white/10 bg-[rgba(17,17,24,0.34)] shadow-[0_10px_26px_rgba(0,0,0,0.22)]">
      <div className="relative h-[250px] p-4 sm:h-[270px] sm:p-5">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_18%_30%,rgba(5,216,189,0.18),transparent_55%),radial-gradient(130%_95%_at_72%_10%,rgba(250,39,66,0.22),transparent_60%),linear-gradient(110deg,#241a28_0%,#102433_40%,#23131c_100%)]" />
        <div className="absolute inset-0 opacity-50 [background:linear-gradient(120deg,transparent_10%,rgba(255,255,255,0.1)_16%,transparent_23%,transparent_40%,rgba(255,255,255,0.08)_46%,transparent_52%,transparent_65%,rgba(250,39,66,0.1)_70%,transparent_78%)]" />
        <div className="absolute right-6 top-4 h-52 w-44 rounded-[40%] border border-white/10 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.28),transparent_45%),radial-gradient(circle_at_65%_20%,rgba(250,39,66,0.25),transparent_52%),linear-gradient(180deg,rgba(228,230,239,0.12),rgba(48,46,58,0.35))] blur-[0.2px] sm:right-10 sm:w-52" />

        <div className="relative z-10 flex h-full flex-col justify-between">
          <div className="flex gap-2">
            <Tag text="/Event Banner" tone="teal" />
            <Tag text="/Patch 1.01" tone="red" />
          </div>

          <div>
            <h1 className="ca-display max-w-xl text-3xl text-ca-text sm:text-4xl">
              Special Grade Summon - Gojo Satoru
            </h1>
            <p className="mt-2 text-sm text-ca-text-2">
              Boosted rates for the Strongest Sorcerer. Pity carries over from previous banner.
            </p>
            <ProgressBar value={18} tone="teal" className="mt-4 max-w-[12rem]" />
          </div>
        </div>
      </div>
    </SurfaceCard>
  )
}

function MissionColumn({
  title,
  missions,
}: {
  title: string
  missions: MissionWithProgress[]
}) {
  return (
    <div className="min-w-0">
      <SectionHeader title={title} />
      <div className="space-y-2.5">
        {missions.map((mission) => (
          <SurfaceCard
            key={mission.id}
            className="border-white/8 bg-[rgba(15,15,21,0.24)] shadow-[0_6px_18px_rgba(0,0,0,0.14)]"
          >
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3">
              <div
                className={[
                  'grid h-7 w-7 place-items-center rounded-md border text-[0.65rem]',
                  mission.complete
                    ? 'border-ca-teal/30 bg-ca-teal-wash-mid text-ca-teal'
                    : 'border-ca-border bg-ca-surface/70 text-ca-text-3',
                ].join(' ')}
              >
                {mission.complete ? 'OK' : ''}
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm text-ca-text-2">{mission.label}</p>
                  <span className="ca-mono-label text-[0.5rem] text-ca-text-3">
                    {mission.progressLabel}
                  </span>
                </div>
                <ProgressBar
                  value={Math.round((mission.progress / mission.goal) * 100)}
                  tone={mission.complete ? 'teal' : 'red'}
                />
              </div>

              <div
                className={[
                  'ca-mono-label rounded-md border px-2 py-1 text-[0.45rem]',
                  mission.claimed
                    ? 'border-ca-teal/20 bg-ca-teal-wash text-ca-teal'
                    : 'border-ca-border-subtle bg-ca-overlay/50 text-ca-text-3',
                ].join(' ')}
              >
                {mission.claimed ? '✓' : `${mission.reward} CC`}
              </div>
            </div>
          </SurfaceCard>
        ))}
      </div>
    </div>
  )
}

function BattlePassCard() {
  return (
    <SurfaceCard className="border-white/8 bg-[rgba(15,15,21,0.24)] shadow-[0_8px_20px_rgba(0,0,0,0.16)]">
      <div className="grid grid-cols-[auto_1fr] gap-4 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="grid h-12 w-12 place-items-center rounded-lg border border-ca-red/30 bg-ca-red-wash-mid text-ca-red shadow-[0_0_16px_rgba(250,39,66,0.14)]">
          <span className="ca-display text-2xl">BP</span>
        </div>

        <div>
          <p className="ca-mono-label text-[0.55rem] text-ca-text-3">Cursed Pass - Season 3</p>
          <p className="ca-display mt-1 text-3xl text-ca-text">Level 23</p>
        </div>

        <div className="sm:w-64">
          <div className="mb-1 flex items-center justify-between">
            <span className="ca-mono-label text-[0.48rem] text-ca-text-3">680 / 1000 EXP</span>
          </div>
          <ProgressBar value={68} tone="gold" />
        </div>
      </div>
    </SurfaceCard>
  )
}

function StoryContinueCard() {
  return (
    <SurfaceCard className="overflow-hidden border-white/10 bg-[rgba(15,15,21,0.26)] shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
      <div className="relative p-4">
        <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_80%_20%,rgba(5,216,189,0.06),transparent_60%),linear-gradient(115deg,#0f1018_10%,#301315_58%,#0f1018_100%)]" />
        <div className="absolute inset-0 opacity-35 [background:linear-gradient(135deg,rgba(255,255,255,0.06),transparent_25%,rgba(250,39,66,0.08)_55%,transparent_80%)]" />
        <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-lg border border-ca-teal/30 bg-ca-teal-wash">
            <span className="ca-display text-3xl text-ca-teal">CH3</span>
          </div>
          <div className="min-w-0">
            <p className="ca-mono-label text-[0.52rem] text-ca-teal">Continue Story</p>
            <p className="ca-display mt-1 truncate text-3xl text-ca-text sm:text-[2.2rem]">
              Chapter 3 - Cursed Womb
            </p>
            <p className="mt-1 text-xs text-ca-text-3">
              Juvenile Detention Center Arc - 3 stages remaining
            </p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full border border-ca-border bg-ca-overlay/70 text-ca-text-2 hover:border-ca-border-strong"
            aria-label="Continue story"
          >
            {'>'}
          </button>
        </div>
      </div>
    </SurfaceCard>
  )
}

function ProfileSummaryCard({
  profileStats,
  avatarLabel,
  coins,
}: {
  profileStats: ReturnType<typeof readBattleProfileStats>
  avatarLabel: string
  coins: number
}) {
  const winRate = Math.round((profileStats.wins / Math.max(1, profileStats.matchesPlayed)) * 100)

  return (
    <SurfaceCard className="border-white/8 bg-[rgba(15,15,21,0.22)] shadow-[0_7px_18px_rgba(0,0,0,0.14)]">
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-ca-red/35 bg-gradient-to-br from-ca-red-wash-mid to-transparent p-[2px]">
            <div className="grid h-full w-full place-items-center rounded-full bg-ca-surface text-xs font-semibold">
              {avatarLabel}
            </div>
          </div>
          <div className="min-w-0">
            <p className="ca-display truncate text-2xl">{profileStats.playerName}</p>
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">{profileStats.rank} · {profileStats.season}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <RecordStat label="W" value={`${profileStats.wins}`} />
          <RecordStat label="L" value={`${profileStats.losses}`} />
          <RecordStat label="WR" value={`${winRate}%`} />
          <RecordStat label="CC" value={`${coins}`} tone="gold" />
        </div>
      </div>
    </SurfaceCard>
  )
}


function RecordStat({ label, value, tone }: { label: string; value: string; tone?: 'gold' }) {
  return (
    <div className="text-center">
      <p className={['ca-mono-label text-xs', tone === 'gold' ? 'text-amber-400' : 'text-ca-text'].join(' ')}>{value}</p>
      <p className="ca-mono-label mt-1 text-[0.45rem] text-ca-text-3">{label}</p>
    </div>
  )
}

function HeroPlayPanel({
  profileStats,
  recentMatches,
  selectedMode,
  onLaunchMode,
}: {
  profileStats: ReturnType<typeof readBattleProfileStats>
  recentMatches: ReturnType<typeof readRecentMatchHistory>
  selectedMode: BattleMatchMode
  onLaunchMode: (mode: BattleMatchMode) => void
}) {
  const hero = homeHeroRender
  const ctaWidth = '22rem'
  const activeMatch = recentMatches[0]
  const winRate = Math.round((profileStats.wins / Math.max(1, profileStats.matchesPlayed)) * 100)

  return (
    <SurfaceCard className="relative h-full min-h-[480px] overflow-hidden border-transparent bg-transparent shadow-none backdrop-blur-0 xl:min-h-[720px]">
      <div className="absolute inset-0 bg-[radial-gradient(72%_60%_at_66%_24%,rgba(228,230,239,0.09),transparent_60%),radial-gradient(50%_50%_at_72%_20%,rgba(250,39,66,0.08),transparent_62%),radial-gradient(45%_45%_at_36%_22%,rgba(5,216,189,0.04),transparent_66%)]" />

      <div className="pointer-events-none absolute inset-0 z-[2]">
        <div
          className="absolute h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            left: hero.anchorX,
            top: '39%',
            background: `radial-gradient(circle, rgba(250,39,66,${hero.glowRed.toFixed(2)}) 0%, rgba(250,39,66,${(
              hero.glowRed * 0.35
            ).toFixed(2)}) 28%, transparent 68%)`,
          }}
        />
        <div
          className="absolute h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            left: `calc(${hero.anchorX} - 8%)`,
            top: '42%',
            background: `radial-gradient(circle, rgba(5,216,189,${hero.glowTeal.toFixed(2)}) 0%, rgba(5,216,189,${(
              hero.glowTeal * 0.4
            ).toFixed(2)}) 34%, transparent 72%)`,
          }}
        />
        <div
          className="absolute h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
          style={{
            left: `calc(${hero.anchorX} + 3%)`,
            top: '33%',
            background: `radial-gradient(circle, rgba(228,230,239,${hero.glowFrost.toFixed(2)}) 0%, rgba(228,230,239,${(
              hero.glowFrost * 0.35
            ).toFixed(2)}) 28%, transparent 70%)`,
          }}
        />
        <div
          className="absolute h-[21rem] w-[21rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
          style={{
            left: `calc(${hero.anchorX} + 1%)`,
            top: '46%',
            background: `radial-gradient(circle, rgba(250,39,66,${(hero.glowRed * 0.22).toFixed(
              2,
            )}) 0%, rgba(228,230,239,${(hero.glowFrost * 0.16).toFixed(2)}) 34%, transparent 74%)`,
          }}
        />
      </div>

      <div
        className="pointer-events-none absolute z-[3] -translate-x-1/2 -translate-y-1/2"
        style={{ left: hero.anchorX, top: '41%' }}
      >
        <p
          className="ca-display select-none text-white leading-none tracking-[0.08em] [mask-image:linear-gradient(90deg,transparent_0%,black_16%,black_84%,transparent_100%)]"
          style={{
            fontSize: `clamp(6rem, 8vw, ${hero.wordmarkSize})`,
            opacity: hero.wordmarkOpacity,
            transform: `translate(${hero.wordmarkOffsetX}, ${hero.wordmarkOffsetY})`,
          }}
        >
          SUKUNA
        </p>
      </div>

      <div className="pointer-events-none absolute inset-0 z-[4]">
        <div
          className="absolute"
          style={{
            left: hero.anchorX,
            top: hero.anchorY,
            width: hero.maxWidth,
            transform: `translate(-50%, -100%) translate(${hero.xOffset}, ${hero.yOffset}) scale(${hero.scale})`,
            transformOrigin: 'bottom center',
          }}
        >
          <img
            src={hero.image}
            alt="Selected home character"
            className="block h-auto w-full select-none"
            style={{
              opacity: hero.opacity,
              filter: `drop-shadow(0 18px 28px rgba(0,0,0,0.28)) drop-shadow(0 -2px 28px rgba(228,230,239,${(
                hero.rimLightStrength * 0.52
              ).toFixed(2)})) drop-shadow(12px 0 34px rgba(250,39,66,${(
                hero.rimLightStrength * 0.5
              ).toFixed(2)})) drop-shadow(-12px 0 30px rgba(5,216,189,${(
                hero.rimLightStrength * 0.34
              ).toFixed(2)}))`,
            }}
            draggable={false}
          />
        </div>

        <div
          className="absolute inset-x-0 bottom-0 z-[5]"
          style={{
            height: hero.bottomFadeHeight,
            background: `linear-gradient(180deg, rgba(8,9,14,0) 0%, rgba(8,9,14,${(
              hero.bottomFadeStrength * 0.22
            ).toFixed(2)}) 24%, rgba(8,9,14,${(hero.bottomFadeStrength * 0.62).toFixed(2)}) 58%, rgba(8,9,14,${hero.bottomFadeStrength.toFixed(2)}) 100%)`,
          }}
        />
        <div
          className="absolute inset-y-0 right-0 z-[5] w-[18%]"
          style={{
            background: `linear-gradient(90deg, rgba(8,9,14,0) 0%, rgba(8,9,14,${hero.sideFadeStrength.toFixed(
              2,
            )}) 72%, rgba(8,9,14,${(hero.sideFadeStrength * 1.8).toFixed(2)}) 100%)`,
          }}
        />
        <div className="absolute inset-x-0 bottom-[17%] z-[5] h-[22%] bg-[radial-gradient(60%_100%_at_50%_100%,rgba(8,9,14,0.3),transparent_72%)]" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-end gap-4 p-4 sm:p-6">
        <div className="mx-auto w-full rounded-[1rem] border border-white/10 bg-[rgba(10,10,16,0.54)] p-3 backdrop-blur-sm" style={{ maxWidth: ctaWidth }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="ca-mono-label text-[0.46rem] text-ca-text-3">Battle Queue</p>
              <p className="ca-display mt-1 text-[1.5rem] text-ca-text">{getModeLabel(selectedMode)}</p>
            </div>
            <div className="text-right">
              <p className="ca-mono-label text-[0.42rem] text-ca-text-3">RANK</p>
              <p className="ca-display mt-1 text-[1.2rem] text-ca-text">{profileStats.rank}</p>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-ca-text-2">{getModeDescription(selectedMode)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <RecordStat label="W" value={`${profileStats.wins}`} />
            <RecordStat label="L" value={`${profileStats.losses}`} />
            <RecordStat label="WR" value={`${winRate}%`} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onLaunchMode(selectedMode)}
          className="ca-display relative mx-auto w-full rounded-xl border border-ca-red/55 bg-gradient-to-b from-[#ff3150] to-[#f31f3d] px-6 py-8 text-6xl text-white shadow-[0_20px_60px_rgba(250,39,66,0.24)] transition hover:scale-[1.01] hover:shadow-[0_25px_70px_rgba(250,39,66,0.3)] sm:text-7xl"
          style={{ maxWidth: ctaWidth }}
        >
          <span className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(60%_55%_at_50%_30%,rgba(255,255,255,0.18),transparent_60%)]" />
          Play
        </button>

        <div className="mx-auto grid w-full grid-cols-3 gap-2.5" style={{ maxWidth: ctaWidth }}>
          {(['ranked', 'quick', 'private'] as BattleMatchMode[]).map((mode) => {
            const active = selectedMode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onLaunchMode(mode)}
                className={[
                  'ca-display rounded-xl border px-3 py-3 text-xl transition',
                  active
                    ? 'border-ca-red/55 bg-ca-red-wash text-ca-text'
                    : 'border-ca-red/35 bg-[rgba(12,12,18,0.18)] text-ca-text hover:border-ca-red/55 hover:bg-ca-red-wash',
                ].join(' ')}
              >
                {getModeLabel(mode)}
              </button>
            )
          })}
        </div>

        <div className="mx-auto grid w-full gap-2.5" style={{ maxWidth: ctaWidth }}>
          <div className="rounded-[1rem] border border-white/10 bg-[rgba(10,10,16,0.54)] p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="ca-mono-label text-[0.46rem] text-ca-text-3">Recent Match</p>
              {activeMatch ? (
                <span
                  className={[
                    'ca-mono-label text-[0.46rem]',
                    activeMatch.result === 'WIN' ? 'text-ca-teal' : 'text-ca-red',
                  ].join(' ')}
                >
                  {activeMatch.result}
                </span>
              ) : null}
            </div>
            {activeMatch ? (
              <>
                <p className="mt-2 ca-display text-[1.35rem] text-ca-text">VS {activeMatch.opponentName}</p>
                <p className="mt-1 text-xs leading-5 text-ca-text-2">
                  {getModeLabel(activeMatch.mode)} / {activeMatch.rounds} ROUNDS / {activeMatch.rankAfter}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs leading-5 text-ca-text-2">No recent battle data.</p>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(90%_55%_at_50%_100%,rgba(8,9,14,0.46),transparent_58%)]" />
    </SurfaceCard>
  )
}

function Tag({ text, tone }: { text: string; tone: 'red' | 'teal' }) {
  return (
    <span
      className={[
        'ca-mono-label rounded-full border px-3 py-1 text-[0.52rem]',
        tone === 'teal'
          ? 'border-ca-teal/30 bg-ca-teal-wash-mid text-ca-teal'
          : 'border-ca-red/30 bg-ca-red-wash-mid text-ca-red',
      ].join(' ')}
    >
      {text}
    </span>
  )
}
