import { useMemo, useState } from 'react'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import { battleRosterById } from '@/features/battle/data'
import {
  UNLOCK_MISSION_DEFS,
  STARTER_FIGHTER_IDS,
  getAllUnlockMissionProgress,
  getObjectiveGoalLine,
  type UnlockMissionDef,
  type UnlockMissionProgress,
} from '@/features/missions/unlocks'

// ── Shared ────────────────────────────────────────────────────────────────────

type View =
  | { level: 'index' }
  | { level: 'section'; section: string }
  | { level: 'detail'; missionId: string }

function Breadcrumb({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const sectionName = view.level === 'section'
    ? view.section
    : view.level === 'detail'
      ? UNLOCK_MISSION_DEFS.find((d) => d.id === (view as { level: 'detail'; missionId: string }).missionId)?.section ?? ''
      : ''

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1.5 ca-mono-label text-[0.5rem]">
      <button type="button" onClick={() => onNavigate({ level: 'index' })} className="text-ca-teal hover:underline">
        Missions
      </button>
      {view.level !== 'index' ? (
        <>
          <span className="text-ca-text-3">›</span>
          <button
            type="button"
            onClick={() => onNavigate({ level: 'section', section: sectionName })}
            className={view.level === 'section' ? 'text-ca-text' : 'text-ca-teal hover:underline'}
          >
            {sectionName}
          </button>
        </>
      ) : null}
      {view.level === 'detail' ? (
        <>
          <span className="text-ca-text-3">›</span>
          <span className="text-ca-text">
            {UNLOCK_MISSION_DEFS.find((d) => d.id === (view as { level: 'detail'; missionId: string }).missionId)?.name ?? ''}
          </span>
        </>
      ) : null}
    </nav>
  )
}

// ── Level 1: Index ────────────────────────────────────────────────────────────

type SectionSummary = {
  section: string
  description: string
  total: number
  completed: number
  defs: UnlockMissionDef[]
}

function SectionIndexRow({
  summary,
  onClick,
}: {
  summary: SectionSummary
  onClick: () => void
}) {
  const previewFighters = summary.defs
    .map((d) => battleRosterById[d.reward.fighterId])
    .filter(Boolean)
    .slice(0, 1)
  const previewPortraitSrc = normalizeBattleAssetSrc(previewFighters[0]?.boardPortraitSrc)

  return (
    <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.22)] transition duration-150 hover:border-white/14 hover:bg-[rgba(14,15,20,0.32)]">
      <div className="flex items-stretch gap-0">
        {/* Preview image */}
        {previewPortraitSrc ? (
          <div className="w-[7rem] shrink-0 overflow-hidden rounded-l-[inherit]">
            <img
              src={previewPortraitSrc}
              alt={previewFighters[0].name}
              className="h-full w-full object-cover object-top"
            />
          </div>
        ) : (
          <div className="w-[7rem] shrink-0 rounded-l-[inherit] bg-white/4" />
        )}

        {/* Text */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="ca-display text-2xl text-ca-text sm:text-3xl">{summary.section}</h2>
            <p className="mt-1.5 text-sm leading-snug text-ca-text-2">{summary.description}</p>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClick}
              className="ca-mono-label text-[0.5rem] text-ca-teal hover:underline"
            >
              View {summary.section} missions →
            </button>
            <span className="ca-mono-label text-[0.46rem] text-ca-text-3">
              {summary.completed} / {summary.total} complete
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function IndexView({
  sections,
  allProgress,
  onNavigate,
}: {
  sections: SectionSummary[]
  allProgress: Record<string, UnlockMissionProgress>
  onNavigate: (v: View) => void
}) {
  const totalCompleted = UNLOCK_MISSION_DEFS.filter((d) => allProgress[d.id]?.completed).length

  return (
    <div className="space-y-4">
      <header className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Progression / Unlock Missions</p>
            <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">Missions</h1>
            <p className="mt-2 text-sm text-ca-text-3">
              Complete missions to permanently unlock new fighters for your roster.
            </p>
          </div>
          <div className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.02)] px-3 py-2 text-right">
            <p className="ca-mono-label text-[0.46rem] text-ca-text-3">COMPLETED</p>
            <p className="ca-display mt-1 text-2xl text-ca-text">{totalCompleted} / {UNLOCK_MISSION_DEFS.length}</p>
          </div>
        </div>
      </header>

      {/* Starters note */}
      <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.14)] p-4 sm:p-5">
        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">STARTER FIGHTERS — ALWAYS AVAILABLE</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STARTER_FIGHTER_IDS.map((id) => {
            const f = battleRosterById[id]
            return (
              <span key={id} className="flex items-center gap-1.5 rounded-[0.22rem] border border-ca-teal/20 bg-[rgba(5,216,189,0.05)] px-2.5 py-1.5 ca-mono-label text-[0.5rem] text-ca-teal">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 shrink-0">
                  <path fillRule="evenodd" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.78 5.47a.75.75 0 0 0-1.06-1.06L7 9.13 5.28 7.41a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z" clipRule="evenodd" />
                </svg>
                {f?.name ?? id}
              </span>
            )
          })}
        </div>
      </div>

      {/* Section rows */}
      <div className="space-y-3">
        {sections.map((s) => (
          <SectionIndexRow
            key={s.section}
            summary={s}
            onClick={() => onNavigate({ level: 'section', section: s.section })}
          />
        ))}
      </div>
    </div>
  )
}

// ── Level 2: Section grid ─────────────────────────────────────────────────────

function MissionGridCard({
  def,
  progress,
  onClick,
}: {
  def: UnlockMissionDef
  progress: UnlockMissionProgress
  onClick: () => void
}) {
  const reward = battleRosterById[def.reward.fighterId]
  const completed = progress.completed
  const rewardPortraitSrc = normalizeBattleAssetSrc(reward?.boardPortraitSrc)

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left"
    >
      <div className={[
        'relative overflow-hidden rounded-[0.3rem] border transition duration-150',
        completed
          ? 'border-ca-teal/35 bg-[rgba(5,216,189,0.04)]'
          : 'border-white/10 bg-[rgba(14,12,24,0.9)] hover:border-white/20',
      ].join(' ')}>

        {/* Portrait */}
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {rewardPortraitSrc ? (
            <img
              src={rewardPortraitSrc}
              alt={reward.name}
              className={['h-full w-full object-cover object-top transition duration-200 group-hover:scale-[1.03]', !completed ? 'grayscale-[0.5] brightness-75' : ''].join(' ')}
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[rgba(15,15,20,0.95)] text-[2rem] font-black text-white/10">?</div>
          )}
          {completed ? (
            <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgba(5,216,189,0.55),transparent)] pb-1.5 pt-4 text-center">
              <span className="ca-mono-label text-[0.42rem] text-ca-teal drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">COMPLETE</span>
            </div>
          ) : null}
        </div>

        {/* Label */}
        <div className="px-2 py-2">
          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{def.section}</p>
          <p className="ca-display mt-0.5 text-[1.05rem] leading-tight text-ca-text group-hover:text-ca-teal/90 transition-colors duration-150">{def.name}</p>
        </div>
      </div>
    </button>
  )
}

function SectionView({
  section,
  defs,
  allProgress,
  onNavigate,
}: {
  section: string
  defs: UnlockMissionDef[]
  allProgress: Record<string, UnlockMissionProgress>
  onNavigate: (v: View) => void
}) {
  const [search, setSearch] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)

  const filtered = defs.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
    if (onlyAvailable && allProgress[d.id]?.completed) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-4 sm:p-5">
        <h2 className="ca-display text-3xl text-ca-text sm:text-4xl">{section}</h2>
        <p className="mt-1.5 text-sm text-ca-text-2">
          Complete these missions to unlock fighters for your roster.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search mission..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-[0.22rem] border border-white/10 bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-sm text-ca-text placeholder:text-ca-text-3 focus:border-white/20 focus:outline-none"
          />
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="accent-ca-teal"
            />
            <span className="ca-mono-label text-[0.5rem] text-ca-text-2">Only show incomplete</span>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ca-text-3">No missions match your filter.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((def) => (
            <MissionGridCard
              key={def.id}
              def={def}
              progress={allProgress[def.id] ?? { progress: 0, completed: false }}
              onClick={() => onNavigate({ level: 'detail', missionId: def.id })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Level 3: Mission detail ───────────────────────────────────────────────────

function DetailView({
  def,
  progress,
  onNavigate,
}: {
  def: UnlockMissionDef
  progress: UnlockMissionProgress
  onNavigate: (v: View) => void
}) {
  const reward = battleRosterById[def.reward.fighterId]
  const completed = progress.completed
  const rewardPortraitSrc = normalizeBattleAssetSrc(reward?.boardPortraitSrc)
  const goalLine = getObjectiveGoalLine(def, progress)

  const pct = (() => {
    switch (def.objective.type) {
      case 'win_with_fighter': return Math.min(progress.progress / def.objective.count, 1) * 100
      case 'win_streak': return Math.min(progress.progress / def.objective.count, 1) * 100
      case 'reach_lp': return Math.min(progress.progress / def.objective.lp, 1) * 100
    }
  })()

  return (
    <div className="space-y-4">
      <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-4 sm:p-5">
        <h2 className="ca-display text-3xl text-ca-text sm:text-4xl">{def.name}</h2>
        <p className="mt-2 text-sm text-ca-text-2">{def.description}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        {/* Left column — mission details */}
        <div className="space-y-3">

          {/* Mission Info */}
          <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">MISSION INFO</p>
            <div className="mt-3 space-y-2 border-t border-white/6 pt-3">
              <div className="flex gap-2 text-sm">
                <span className="shrink-0 text-ca-text-3">Mission name:</span>
                <span className="text-ca-text">{def.name}</span>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="shrink-0 text-ca-text-3">Section:</span>
                <button
                  type="button"
                  onClick={() => onNavigate({ level: 'section', section: def.section })}
                  className="text-ca-teal hover:underline"
                >
                  {def.section}
                </button>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="shrink-0 text-ca-text-3">Status:</span>
                <span className={completed ? 'text-ca-teal' : 'text-ca-text-2'}>
                  {completed ? 'Completed' : 'In Progress'}
                </span>
              </div>
            </div>
          </div>

          {/* Mission Goals */}
          <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">MISSION GOALS</p>
            <div className="mt-3 border-t border-white/6 pt-3">
              <div className="flex items-start gap-2">
                <span className={['mt-0.5 shrink-0', completed ? 'text-ca-teal' : 'text-ca-text-3'].join(' ')}>
                  {completed ? (
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.78 5.47a.75.75 0 0 0-1.06-1.06L7 9.13 5.28 7.41a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="8" cy="8" r="6" />
                      <path d="M5 8.5 7 10.5l4-5" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ca-text">{goalLine}</p>
                  <div className="mt-2 h-[0.28rem] w-full overflow-hidden rounded-full bg-white/8">
                    <div
                      className={['h-full rounded-full transition-all duration-500', completed ? 'bg-ca-teal' : 'bg-white/30'].join(' ')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mission Reward */}
          <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">MISSION REWARD</p>
            <p className="mt-2 text-sm text-ca-text-2">
              Completing &quot;{def.name}&quot; unlocks:
            </p>
            {reward ? (
              <div className="mt-3 flex items-center gap-3">
                <div className={['h-14 w-14 shrink-0 overflow-hidden rounded-[0.22rem] border', completed ? 'border-ca-teal/35' : 'border-white/10 grayscale opacity-50'].join(' ')}>
                  {rewardPortraitSrc ? (
                    <img src={rewardPortraitSrc} alt={reward.name} className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[rgba(15,15,20,0.95)] text-[1.2rem] font-black text-white/15">?</div>
                  )}
                </div>
                <div>
                  <p className={['ca-display text-xl', completed ? 'text-ca-teal' : 'text-ca-text'].join(' ')}>{reward.name}</p>
                  {reward.battleTitle ? <p className="mt-0.5 text-xs text-ca-text-3">{reward.battleTitle}</p> : null}
                  {completed ? <p className="ca-mono-label mt-1 text-[0.44rem] text-ca-teal">UNLOCKED</p> : null}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ca-text-3">Unknown fighter</p>
            )}
          </div>
        </div>

        {/* Right column — large portrait */}
        {rewardPortraitSrc ? (
          <div className="hidden lg:block">
            <div className={['w-[13rem] overflow-hidden rounded-[0.3rem] border xl:w-[15rem]', completed ? 'border-ca-teal/35' : 'border-white/10'].join(' ')}>
              <img
                src={rewardPortraitSrc}
                alt={reward.name}
                className={['h-full w-full object-cover object-top', !completed ? 'grayscale brightness-75' : ''].join(' ')}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function MissionsPage() {
  const [view, setView] = useState<View>({ level: 'index' })
  const allProgress = useMemo(() => getAllUnlockMissionProgress(), [])

  const sections = useMemo<SectionSummary[]>(() => {
    const map = new Map<string, UnlockMissionDef[]>()
    for (const def of UNLOCK_MISSION_DEFS) {
      const arr = map.get(def.section) ?? []
      arr.push(def)
      map.set(def.section, arr)
    }

    const sectionDescriptions: Record<string, string> = {
      'Starter Missions': 'Introductory missions for new players. Complete these to expand your starting roster.',
    }

    return [...map.entries()].map(([section, defs]) => ({
      section,
      description: sectionDescriptions[section] ?? `Unlock new fighters by completing ${section.toLowerCase()}.`,
      total: defs.length,
      completed: defs.filter((d) => allProgress[d.id]?.completed).length,
      defs,
    }))
  }, [allProgress])

  const currentDef = view.level === 'detail'
    ? UNLOCK_MISSION_DEFS.find((d) => d.id === view.missionId) ?? null
    : null

  const sectionDefs = view.level === 'section' || view.level === 'detail'
    ? UNLOCK_MISSION_DEFS.filter((d) => d.section === (view.level === 'section' ? view.section : currentDef?.section))
    : []

  return (
    <section className="relative isolate py-4 sm:py-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute right-[10%] top-[6%] h-[24rem] w-[24rem] rounded-full bg-ca-teal/7 blur-3xl" />
        <div className="absolute bottom-[18%] left-[6%] h-[18rem] w-[18rem] rounded-full bg-white/4 blur-3xl" />
      </div>

      <div key={view.level} className="animate-ca-fade-in">
        <Breadcrumb view={view} onNavigate={setView} />

        {view.level === 'index' && (
          <IndexView sections={sections} allProgress={allProgress} onNavigate={setView} />
        )}
        {view.level === 'section' && (
          <SectionView
            section={view.section}
            defs={sectionDefs}
            allProgress={allProgress}
            onNavigate={setView}
          />
        )}
        {view.level === 'detail' && currentDef ? (
          <DetailView
            def={currentDef}
            progress={allProgress[currentDef.id] ?? { progress: 0, completed: false }}
            onNavigate={setView}
          />
        ) : null}
      </div>
    </section>
  )
}
