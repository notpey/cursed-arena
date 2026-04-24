import { useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import gojoRender from '@/assets/renders/Satoru_Gojo_Cursed_Clash.webp'
import yujiRender from '@/assets/renders/Yuji_Itadori_Cursed_Clash.webp'
import megumiRender from '@/assets/renders/Megumi_Fushiguro_Cursed_Clash.webp'
import nobaraRender from '@/assets/renders/Nobara_Kugisaki_Cursed_Clash.webp'
import jogoRender from '@/assets/renders/Jogo_Cursed_Clash.webp'
import mahitoRender from '@/assets/renders/Mahito_Cursed_Clash.webp'
import hanamiRender from '@/assets/renders/Hanami_Cursed_Clash.webp'
import tojiRender from '@/assets/renders/Toji_Fushiguro_Cursed_Clash.webp'

type ChapterId = 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5'
type StoryView = 'chapters' | 'stages'

type EnemyPreview = {
  id: string
  name: string
  image: string
  frame?: {
    scale?: number
    x?: string
    y?: string
  }
}

type RewardPreview = {
  id: string
  label: string
  color: 'teal' | 'gold' | 'red' | 'frost'
}

type StageData = {
  id: string
  code: string
  name: string
  recommendedLevel: number
  stars: number
  boss?: boolean
  enemies: EnemyPreview[]
  rewards: RewardPreview[]
  unlocked: boolean
}

type ChapterData = {
  id: ChapterId
  chapterNumber: number
  badgeLabel: string
  title: string
  subtitle: string
  locked?: boolean
  unlockRequirement?: string
  continueTag?: boolean
  hardModeUnlocked?: boolean
  bannerMood: {
    chapterCard: string
    chapterGlow: string
    bannerGradient: string
    ambient: string
  }
  stages: StageData[]
}

const enemyPool = {
  yuji: { id: 'yuji', name: 'Yuji', image: yujiRender, frame: { scale: 1.7, y: '10%' } },
  megumi: { id: 'megumi', name: 'Megumi', image: megumiRender, frame: { scale: 1.72, y: '10%' } },
  nobara: { id: 'nobara', name: 'Nobara', image: nobaraRender, frame: { scale: 1.76, y: '9%' } },
  jogo: { id: 'jogo', name: 'Jogo', image: jogoRender, frame: { scale: 1.72, y: '10%' } },
  mahito: { id: 'mahito', name: 'Mahito', image: mahitoRender, frame: { scale: 1.72, y: '10%' } },
  hanami: { id: 'hanami', name: 'Hanami', image: hanamiRender, frame: { scale: 1.65, y: '12%' } },
  toji: { id: 'toji', name: 'Toji', image: tojiRender, frame: { scale: 1.68, y: '10%' } },
  gojo: { id: 'gojo', name: 'Gojo', image: gojoRender, frame: { scale: 1.8, y: '11%' } },
} satisfies Record<string, EnemyPreview>

const storyChapters: ChapterData[] = [
  {
    id: 'ch1',
    chapterNumber: 1,
    badgeLabel: 'CH 1',
    title: 'INTRODUCTION TO CURSES',
    subtitle: 'Tokyo Jujutsu High Orientation',
    hardModeUnlocked: true,
    bannerMood: {
      chapterCard:
        'linear-gradient(115deg, rgba(5,216,189,0.07), rgba(10,12,18,0.12) 48%, rgba(15,17,24,0.2) 100%)',
      chapterGlow: 'rgba(5,216,189,0.12)',
      bannerGradient:
        'radial-gradient(90%_130%_at_18%_24%,rgba(5,216,189,0.12),transparent_58%), linear-gradient(120deg,#0f1520_0%,#121821_45%,#11131b_100%)',
      ambient: 'rgba(5,216,189,0.08)',
    },
    stages: [
      stage('ch1-1', '1-1', 'Unexpected Transfer', 5, 3, [enemyPool.yuji, enemyPool.megumi], false, true),
      stage('ch1-2', '1-2', 'Cursed Energy Basics', 7, 3, [enemyPool.nobara, enemyPool.megumi], false, true),
      stage('ch1-3', '1-3', 'Training Grounds', 9, 3, [enemyPool.yuji, enemyPool.nobara], true, true),
    ],
  },
  {
    id: 'ch2',
    chapterNumber: 2,
    badgeLabel: 'CH 2',
    title: 'FEAR AND THE CURSE',
    subtitle: 'Occult Club Incident Arc',
    hardModeUnlocked: true,
    bannerMood: {
      chapterCard:
        'linear-gradient(115deg, rgba(5,216,189,0.04), rgba(16,14,20,0.16) 52%, rgba(24,12,18,0.22) 100%)',
      chapterGlow: 'rgba(250,39,66,0.08)',
      bannerGradient:
        'radial-gradient(90%_130%_at_22%_18%,rgba(5,216,189,0.08),transparent_62%), radial-gradient(70%_90%_at_72%_35%,rgba(250,39,66,0.08),transparent_62%), linear-gradient(120deg,#12131a_0%,#17121a_52%,#1a1016_100%)',
      ambient: 'rgba(250,39,66,0.06)',
    },
    stages: [
      stage('ch2-1', '2-1', 'Basement Seal', 12, 3, [enemyPool.jogo, enemyPool.hanami], false, true),
      stage('ch2-2', '2-2', 'Echoes in the Corridor', 14, 2, [enemyPool.mahito, enemyPool.jogo], false, true),
      stage('ch2-3', '2-3', 'The Gathering Pulse', 16, 1, [enemyPool.hanami, enemyPool.mahito], false, true),
      stage('ch2-4', '2-4', 'Spirit Nest', 18, 0, [enemyPool.jogo, enemyPool.mahito, enemyPool.hanami], true, true),
    ],
  },
  {
    id: 'ch3',
    chapterNumber: 3,
    badgeLabel: 'CH 3',
    title: 'CURSED WOMB',
    subtitle: 'Juvenile Detention Center Arc',
    continueTag: true,
    hardModeUnlocked: false,
    bannerMood: {
      chapterCard:
        'linear-gradient(115deg, rgba(5,216,189,0.03), rgba(22,13,19,0.18) 40%, rgba(42,13,21,0.24) 100%)',
      chapterGlow: 'rgba(250,39,66,0.12)',
      bannerGradient:
        'radial-gradient(90%_120%_at_14%_20%,rgba(5,216,189,0.06),transparent_60%), radial-gradient(70%_90%_at_82%_24%,rgba(250,39,66,0.15),transparent_60%), linear-gradient(120deg,#13141b_0%,#1d1319_44%,#2a0f19_100%)',
      ambient: 'rgba(250,39,66,0.08)',
    },
    stages: [
      stage('ch3-1', '3-1', 'Perimeter Sweep', 20, 3, [enemyPool.yuji, enemyPool.megumi], false, true),
      stage('ch3-2', '3-2', 'Lower Hallway', 22, 2, [enemyPool.hanami, enemyPool.jogo], false, true),
      stage('ch3-3', '3-3', 'The Cursed Womb', 25, 0, [enemyPool.mahito, enemyPool.jogo, enemyPool.hanami], true, true),
      stage('ch3-4', '3-4', 'Detention Core', 27, 0, [enemyPool.mahito, enemyPool.jogo], false, false),
    ],
  },
  {
    id: 'ch4',
    chapterNumber: 4,
    badgeLabel: 'CH 4',
    title: 'KYOTO GOODWILL',
    subtitle: 'Exchange Event Arc',
    hardModeUnlocked: false,
    bannerMood: {
      chapterCard:
        'linear-gradient(115deg, rgba(5,216,189,0.02), rgba(16,17,24,0.18) 38%, rgba(32,22,15,0.24) 100%)',
      chapterGlow: 'rgba(245,166,35,0.1)',
      bannerGradient:
        'radial-gradient(80%_110%_at_18%_18%,rgba(5,216,189,0.05),transparent_62%), radial-gradient(70%_95%_at_80%_28%,rgba(245,166,35,0.12),transparent_64%), linear-gradient(120deg,#12141a_0%,#181a22_45%,#231a14_100%)',
      ambient: 'rgba(245,166,35,0.06)',
    },
    stages: [
      stage('ch4-1', '4-1', 'Opening Ceremony', 30, 0, [enemyPool.toji, enemyPool.hanami], false, false),
      stage('ch4-2', '4-2', 'Forest Trial', 32, 0, [enemyPool.jogo, enemyPool.mahito], false, false),
      stage('ch4-3', '4-3', 'Exchange Clash', 34, 0, [enemyPool.toji, enemyPool.mahito, enemyPool.hanami], true, false),
    ],
  },
  {
    id: 'ch5',
    chapterNumber: 5,
    badgeLabel: 'CH 5',
    title: 'HIDDEN INVENTORY',
    subtitle: 'Star Plasma Vessel Arc',
    locked: true,
    unlockRequirement: 'CLEAR CH 4 TO UNLOCK',
    bannerMood: {
      chapterCard:
        'linear-gradient(115deg, rgba(5,216,189,0.01), rgba(16,16,24,0.16) 28%, rgba(56,12,22,0.28) 100%)',
      chapterGlow: 'rgba(250,39,66,0.12)',
      bannerGradient:
        'radial-gradient(90%_120%_at_80%_20%,rgba(250,39,66,0.16),transparent_58%), linear-gradient(120deg,#11121a_0%,#1a1219_40%,#2a0d18_100%)',
      ambient: 'rgba(250,39,66,0.08)',
    },
    stages: [
      stage('ch5-1', '5-1', 'Escort Route', 36, 0, [enemyPool.toji, enemyPool.mahito], false, false),
      stage('ch5-2', '5-2', 'Ambush at Dawn', 38, 0, [enemyPool.toji, enemyPool.jogo], false, false),
      stage('ch5-3', '5-3', 'The Vessel', 40, 0, [enemyPool.toji, enemyPool.mahito, enemyPool.jogo], true, false),
    ],
  },
]

export function StoryPage() {
  const [view, setView] = useState<StoryView>('chapters')
  const [selectedChapterId, setSelectedChapterId] = useState<ChapterId>('ch3')

  const selectedChapter = storyChapters.find((chapter) => chapter.id === selectedChapterId) ?? storyChapters[0]

  function openChapter(chapterId: ChapterId) {
    const chapter = storyChapters.find((entry) => entry.id === chapterId)
    if (!chapter || chapter.locked) return
    setSelectedChapterId(chapterId)
    setView('stages')
  }

  return (
    <section className="relative isolate py-4 sm:py-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute right-[12%] top-[8%] h-[22rem] w-[22rem] rounded-full bg-ca-teal/8 blur-3xl" />
        <div className="absolute left-[8%] bottom-[16%] h-[18rem] w-[18rem] rounded-full bg-white/4 blur-3xl" />
      </div>

      <div key={view} className="animate-ca-fade-in">
        {view === 'chapters' ? (
          <ChapterSelectView selectedChapterId={selectedChapterId} onOpenChapter={openChapter} />
        ) : (
          <StageSelectView
            chapter={selectedChapter}
            onBack={() => setView('chapters')}
          />
        )}
      </div>
    </section>
  )
}

function ChapterSelectView({
  selectedChapterId,
  onOpenChapter,
}: {
  selectedChapterId: ChapterId
  onOpenChapter: (chapterId: ChapterId) => void
}) {
  return (
    <div className="grid min-h-[calc(100vh-9rem)] grid-rows-[auto_1fr] gap-4">
      <header className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Story / Campaign</p>
            <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">Chapter Select</h1>
            <p className="mt-2 text-sm text-ca-text-3">
              Choose an arc to continue progression, replay stages for stars, or unlock hard mode routes.
            </p>
          </div>
          <div className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.02)] px-3 py-2">
            <p className="ca-mono-label text-[0.46rem] text-ca-text-3">CURRENT CHAPTER</p>
            <p className="ca-display mt-1 text-2xl text-ca-text">
              {storyChapters.find((ch) => ch.id === selectedChapterId)?.badgeLabel ?? 'CH ?'}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
        {storyChapters.map((chapter) => (
          <ChapterCard
            key={chapter.id}
            chapter={chapter}
            selected={chapter.id === selectedChapterId}
            onOpen={() => onOpenChapter(chapter.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ChapterCard({
  chapter,
  selected,
  onOpen,
}: {
  chapter: ChapterData
  selected: boolean
  onOpen: () => void
}) {
  const stats = getChapterStats(chapter)

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={chapter.locked}
      className="w-full text-left transition duration-150 active:scale-[0.99] disabled:cursor-not-allowed"
    >
      <div
        className="relative overflow-hidden rounded-[12px] border p-4 transition duration-200"
        style={{
          borderColor: selected ? 'rgba(5,216,189,0.26)' : 'rgba(228,230,239,0.08)',
          background: chapter.bannerMood.chapterCard,
          boxShadow: selected ? `0 0 26px ${chapter.bannerMood.chapterGlow}` : '0 10px 20px rgba(0,0,0,0.12)',
          opacity: chapter.locked ? 0.48 : 1,
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-60 [background:linear-gradient(125deg,rgba(255,255,255,0.02),transparent_30%,rgba(255,255,255,0.01)_60%,transparent_100%)]" />

        <div className="relative grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 place-items-center rounded-xl border border-ca-teal/25 bg-[linear-gradient(145deg,rgba(5,216,189,0.14),rgba(8,9,14,0.32))]">
              <span className="ca-display text-3xl text-ca-teal">{chapter.badgeLabel}</span>
            </div>
            {chapter.continueTag && !chapter.locked ? (
              <span className="ca-mono-label rounded-full border border-ca-teal/28 bg-ca-teal-wash px-3 py-1 text-[0.46rem] text-ca-teal">
                CONTINUE
              </span>
            ) : null}
          </div>

          <div className="min-w-0">
            <p className="ca-display text-2xl text-ca-text sm:text-[2rem]">{chapter.title}</p>
            <p className="mt-1 text-sm text-ca-text-3">{chapter.subtitle}</p>
            {chapter.locked && chapter.unlockRequirement ? (
              <p className="ca-mono-label mt-3 text-[0.48rem] text-ca-text-disabled">{chapter.unlockRequirement}</p>
            ) : null}
          </div>

          <div className="min-w-[14rem] md:w-[15rem]">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="ca-mono-label text-[0.52rem] text-amber-300">
                {stats.stars}/{stats.maxStars} *
              </span>
              {chapter.hardModeUnlocked ? (
                <span className="ca-mono-label rounded-md border border-ca-red/25 bg-ca-red-wash px-2 py-1 text-[0.45rem] text-ca-red">
                  HARD MODE
                </span>
              ) : null}
            </div>
            <ProgressBar value={stats.clearProgressPct} tone="teal" className="mt-3 h-2 bg-ca-highlight/55" />
            <div className="mt-2 flex items-center justify-between">
              <span className="ca-mono-label text-[0.45rem] text-ca-text-3">
                {stats.clearedStages}/{chapter.stages.length} STAGES CLEARED
              </span>
              <span className="ca-mono-label text-[0.45rem] text-ca-text-3">
                {chapter.locked ? 'LOCKED' : 'OPEN'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function StageSelectView({
  chapter,
  onBack,
}: {
  chapter: ChapterData
  onBack: () => void
}) {
  const stats = getChapterStats(chapter)
  const nextBattleStageId = chapter.stages.find((stage) => stage.unlocked && stage.stars < 3)?.id ?? null

  return (
    <div className="grid min-h-[calc(100vh-9rem)] grid-rows-[auto_1fr] gap-4">
      <header className="overflow-hidden rounded-[12px] border border-white/8">
        <div className="relative px-4 py-4 sm:px-5 sm:py-5" style={{ background: chapter.bannerMood.bannerGradient }}>
          <div className="pointer-events-none absolute inset-0 opacity-40 [background:linear-gradient(135deg,rgba(255,255,255,0.04),transparent_26%,rgba(255,255,255,0.02)_60%,transparent_100%)]" />
          <div
            className="pointer-events-none absolute right-[10%] top-[18%] h-40 w-40 rounded-full blur-3xl"
            style={{ background: chapter.bannerMood.ambient }}
          />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={onBack}
                className="ca-mono-label inline-flex items-center gap-1.5 text-[0.52rem] text-ca-text-3 transition duration-150 hover:text-ca-text-2"
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 3L5 8l5 5" />
                </svg>
                CHAPTERS
              </button>
              <div className="mt-3 flex items-center gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-xl border border-ca-teal/28 bg-[rgba(5,216,189,0.1)]">
                  <span className="ca-display text-3xl text-ca-teal">{chapter.badgeLabel}</span>
                </div>
                <div>
                  <h1 className="ca-display text-3xl text-ca-text sm:text-[2.5rem]">{chapter.title}</h1>
                  <p className="mt-1 text-sm text-ca-text-3">{chapter.subtitle}</p>
                </div>
              </div>
            </div>

            <div className="w-full max-w-md rounded-[10px] border border-white/8 bg-[rgba(10,11,16,0.22)] p-3 sm:w-[22rem]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="ca-mono-label text-[0.48rem] text-ca-text-3">CHAPTER PROGRESS</span>
                <span className="ca-mono-label text-[0.52rem] text-amber-300">
                  {stats.stars}/{stats.maxStars} *
                </span>
              </div>
              <ProgressBar value={stats.clearProgressPct} tone="teal" className="mt-3 h-2 bg-ca-highlight/55" />
              <div className="mt-2 flex items-center justify-between">
                <span className="ca-mono-label text-[0.45rem] text-ca-text-3">
                  {stats.clearedStages}/{chapter.stages.length} STAGES
                </span>
                {chapter.hardModeUnlocked ? (
                  <span className="ca-mono-label rounded-md border border-ca-red/25 bg-ca-red-wash px-2 py-1 text-[0.42rem] text-ca-red">
                    HARD MODE
                  </span>
                ) : (
                  <span className="ca-mono-label text-[0.45rem] text-ca-text-disabled">HARD MODE LOCKED</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="min-h-0 overflow-y-auto pr-1">
        <div className="space-y-3">
          {chapter.stages.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              showBattle={stage.id === nextBattleStageId}
              chapterNumber={chapter.chapterNumber}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StageCard({
  stage,
  showBattle,
}: {
  stage: StageData
  showBattle: boolean
  chapterNumber: number
}) {
  const locked = !stage.unlocked
  const actionLabel = locked ? 'LOCKED' : showBattle ? 'BATTLE' : 'REPLAY'
  const actionIsPrimary = !locked && showBattle

  return (
    <div
      className="relative overflow-hidden rounded-[12px] border"
      style={{
        borderColor: stage.boss ? 'rgba(250,39,66,0.18)' : 'rgba(228,230,239,0.07)',
        background: stage.boss
          ? 'linear-gradient(115deg, rgba(250,39,66,0.1), rgba(20,12,16,0.22) 44%, rgba(14,14,20,0.16) 100%)'
          : 'linear-gradient(115deg, rgba(5,216,189,0.02), rgba(15,16,22,0.16) 48%, rgba(15,15,20,0.12) 100%)',
        opacity: locked ? 0.52 : 1,
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:linear-gradient(120deg,rgba(255,255,255,0.02),transparent_35%,rgba(255,255,255,0.01)_70%,transparent_100%)]" />
      <div className="relative grid gap-3 p-3 sm:grid-cols-[auto_minmax(0,1.2fr)_auto_auto] sm:items-center sm:gap-4 sm:p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-white/10 bg-[rgba(255,255,255,0.02)] px-2 py-2">
            <p className="ca-mono-label text-[0.55rem] text-ca-text-2">{stage.code}</p>
          </div>
          {stage.boss ? (
            <span className="ca-mono-label rounded-md border border-ca-red/25 bg-ca-red-wash px-2 py-1 text-[0.45rem] text-ca-red">
              BOSS
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="ca-display truncate text-xl text-ca-text sm:text-2xl">{stage.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="ca-mono-label text-[0.48rem] text-ca-text-disabled">
              RECOMMENDED LV {stage.recommendedLevel}
            </span>
            <div className="flex items-center gap-1">
              <span className="ca-mono-label text-[0.45rem] text-ca-text-3">STARS</span>
              {Array.from({ length: 3 }, (_, idx) => (
                <span
                  key={`${stage.id}-star-${idx}`}
                  className="h-2 w-2 rounded-full border"
                  style={{
                    background: idx < stage.stars ? 'var(--warning)' : 'rgba(228,230,239,0.04)',
                    borderColor: idx < stage.stars ? 'rgba(245,166,35,0.34)' : 'rgba(228,230,239,0.1)',
                    boxShadow: idx < stage.stars ? '0 0 8px rgba(245,166,35,0.18)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <EnemyPreviewRow enemies={stage.enemies} />
          <RewardPreviewRow rewards={stage.rewards} />
        </div>

        <button
          type="button"
          disabled={locked}
          className={[
            'ca-display min-w-[8rem] rounded-lg border px-4 py-3 text-xl transition duration-150',
            locked
              ? 'cursor-not-allowed border-white/10 bg-[rgba(255,255,255,0.02)] text-ca-text-disabled'
              : actionIsPrimary
                ? 'border-ca-red/45 bg-gradient-to-b from-[#ff3150] to-[#f31f3d] text-white shadow-[0_10px_26px_rgba(250,39,66,0.18)] hover:shadow-[0_14px_30px_rgba(250,39,66,0.24)] active:scale-[0.97]'
                : 'border-white/12 bg-[rgba(18,19,26,0.16)] text-ca-text hover:border-ca-teal/28 hover:text-ca-teal active:scale-[0.97]',
          ].join(' ')}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

function EnemyPreviewRow({ enemies }: { enemies: EnemyPreview[] }) {
  return (
    <div className="flex items-center gap-1">
      {enemies.slice(0, 3).map((enemy) => (
        <PortraitCircle key={enemy.id} portrait={enemy} />
      ))}
    </div>
  )
}

function RewardPreviewRow({ rewards }: { rewards: RewardPreview[] }) {
  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      {rewards.map((reward) => (
        <span
          key={reward.id}
          className="grid h-7 w-7 place-items-center rounded-full border text-[0.45rem]"
          style={{
            borderColor:
              reward.color === 'teal'
                ? 'rgba(5,216,189,0.2)'
                : reward.color === 'gold'
                  ? 'rgba(245,166,35,0.2)'
                  : reward.color === 'red'
                    ? 'rgba(250,39,66,0.2)'
                    : 'rgba(228,230,239,0.14)',
            background:
              reward.color === 'teal'
                ? 'rgba(5,216,189,0.08)'
                : reward.color === 'gold'
                  ? 'rgba(245,166,35,0.08)'
                  : reward.color === 'red'
                    ? 'rgba(250,39,66,0.08)'
                    : 'rgba(255,255,255,0.02)',
            color: 'var(--text-secondary)',
          }}
          title={reward.label}
        >
          <span className="ca-mono-label text-[0.35rem]">{reward.label.slice(0, 2)}</span>
        </span>
      ))}
    </div>
  )
}

function PortraitCircle({ portrait }: { portrait: EnemyPreview }) {
  const frame = portrait.frame ?? {}
  const scale = frame.scale ?? 1.7
  const x = frame.x ?? '0%'
  const y = frame.y ?? '10%'

  return (
    <div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10 bg-[rgba(255,255,255,0.03)]">
      <div
        className="absolute left-1/2 top-[6%] w-[92%]"
        style={{
          transform: `translate(-50%, 0) translate(${x}, ${y}) scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        <img src={portrait.image} alt={portrait.name} className="block h-auto w-full select-none" draggable={false} />
      </div>
    </div>
  )
}

function getChapterStats(chapter: ChapterData) {
  const maxStars = chapter.stages.length * 3
  const stars = chapter.stages.reduce((total, stage) => total + stage.stars, 0)
  const clearedStages = chapter.stages.filter((stage) => stage.stars > 0).length
  const clearProgressPct = chapter.stages.length ? (clearedStages / chapter.stages.length) * 100 : 0
  return { maxStars, stars, clearedStages, clearProgressPct }
}

function stage(
  id: string,
  code: string,
  name: string,
  recommendedLevel: number,
  stars: number,
  enemies: EnemyPreview[],
  boss: boolean,
  unlocked: boolean,
): StageData {
  const rewardColors: RewardPreview['color'][] = boss ? ['gold', 'red', 'teal'] : ['teal', 'frost', 'gold']
  return {
    id,
    code,
    name,
    recommendedLevel,
    stars,
    enemies,
    boss,
    unlocked,
    rewards: rewardColors.map((color, idx) => ({
      id: `${id}-reward-${idx}`,
      label: boss ? ['SSR', 'ORB', 'SEAL'][idx] : ['XP', 'CE', 'GD'][idx],
      color,
    })),
  }
}
