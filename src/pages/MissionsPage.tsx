import { useMemo } from 'react'
import { battleRosterById } from '@/features/battle/data'
import {
  UNLOCK_MISSION_DEFS,
  STARTER_FIGHTER_IDS,
  getAllUnlockMissionProgress,
  getObjectiveProgressLabel,
  type UnlockMissionDef,
  type UnlockMissionProgress,
} from '@/features/missions/unlocks'

// ── Helpers ───────────────────────────────────────────────────────────────────

function MissionCard({ def, progress }: { def: UnlockMissionDef; progress: UnlockMissionProgress }) {
  const reward = battleRosterById[def.reward.fighterId]
  const pct = (() => {
    switch (def.objective.type) {
      case 'win_with_fighter':
        return Math.min(progress.progress / def.objective.count, 1) * 100
      case 'win_streak':
        return Math.min(progress.progress / def.objective.count, 1) * 100
      case 'reach_lp':
        return Math.min(progress.progress / def.objective.lp, 1) * 100
    }
  })()

  const progressLabel = getObjectiveProgressLabel(def, progress)
  const completed = progress.completed

  return (
    <div
      className={[
        'relative overflow-hidden rounded-[0.4rem] border bg-[linear-gradient(135deg,rgba(14,12,24,0.96),rgba(19,15,31,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_18px_rgba(0,0,0,0.3)] transition duration-200',
        completed
          ? 'border-ca-teal/35 shadow-[0_0_22px_rgba(5,216,189,0.1)]'
          : 'border-white/8',
      ].join(' ')}
    >
      {/* Completion glow strip */}
      {completed ? (
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(5,216,189,0.6),transparent)]" />
      ) : null}

      <div className="flex gap-4 p-4 sm:p-5">
        {/* Reward portrait */}
        <div className="shrink-0">
          <div
            className={[
              'relative h-[5rem] w-[5rem] overflow-hidden rounded-[0.3rem] border sm:h-[6rem] sm:w-[6rem]',
              completed ? 'border-ca-teal/40' : 'border-white/10',
              !completed ? 'grayscale opacity-40' : '',
            ].join(' ')}
          >
            {reward?.boardPortraitSrc ? (
              <img
                src={reward.boardPortraitSrc}
                alt={reward.name}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[rgba(15,15,20,0.95)] text-[1.8rem] font-black text-white/15">
                ?
              </div>
            )}
            {completed ? (
              <div className="absolute inset-0 flex items-end justify-center bg-[linear-gradient(to_top,rgba(5,216,189,0.25),transparent_60%)] pb-1">
                <span className="ca-mono-label text-[0.36rem] text-ca-teal">UNLOCKED</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Mission info */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  'rounded-[0.18rem] border px-2 py-0.5 ca-mono-label text-[0.44rem]',
                  completed
                    ? 'border-ca-teal/30 bg-[rgba(5,216,189,0.08)] text-ca-teal'
                    : 'border-white/10 bg-white/4 text-ca-text-3',
                ].join(' ')}
              >
                {completed ? 'COMPLETE' : 'IN PROGRESS'}
              </span>
              {reward ? (
                <span className="ca-mono-label text-[0.44rem] text-ca-text-3">
                  UNLOCKS — {reward.name.toUpperCase()}
                </span>
              ) : null}
            </div>
            <h3 className="ca-display mt-1.5 text-2xl text-ca-text">{def.name}</h3>
            <p className="mt-1 text-sm leading-snug text-ca-text-2">{def.description}</p>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="ca-mono-label text-[0.44rem] text-ca-text-3">PROGRESS</span>
              <span className={['ca-mono-label text-[0.46rem]', completed ? 'text-ca-teal' : 'text-ca-text-2'].join(' ')}>
                {progressLabel}
              </span>
            </div>
            <div className="h-[0.3rem] w-full overflow-hidden rounded-full bg-white/8">
              <div
                className={[
                  'h-full rounded-full transition-all duration-500',
                  completed ? 'bg-ca-teal' : 'bg-white/30',
                ].join(' ')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StarterFighterPill({ fighterId }: { fighterId: string }) {
  const fighter = battleRosterById[fighterId]
  return (
    <div className="flex items-center gap-2 rounded-[0.3rem] border border-ca-teal/20 bg-[rgba(5,216,189,0.05)] px-3 py-2">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-ca-teal">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
      </svg>
      <span className="ca-display text-[1rem] text-ca-text">{fighter?.name ?? fighterId}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function MissionsPage() {
  const allProgress = useMemo(() => getAllUnlockMissionProgress(), [])
  const completed = UNLOCK_MISSION_DEFS.filter((d) => allProgress[d.id]?.completed).length
  const total = UNLOCK_MISSION_DEFS.length

  return (
    <section className="relative isolate py-4 sm:py-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute right-[10%] top-[6%] h-[24rem] w-[24rem] rounded-full bg-ca-teal/7 blur-3xl" />
        <div className="absolute bottom-[18%] left-[6%] h-[18rem] w-[18rem] rounded-full bg-white/4 blur-3xl" />
      </div>

      <div className="space-y-5">
        {/* Header */}
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
              <p className="ca-display mt-1 text-2xl text-ca-text">{completed} / {total}</p>
            </div>
          </div>
        </header>

        {/* Starters */}
        <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.14)] p-4 sm:p-5">
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">STARTER FIGHTERS</p>
          <p className="mt-1 text-sm text-ca-text-2">These fighters are available from the start — no mission required.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STARTER_FIGHTER_IDS.map((id) => (
              <StarterFighterPill key={id} fighterId={id} />
            ))}
          </div>
        </section>

        {/* Unlock missions */}
        <section>
          <p className="ca-mono-label mb-3 text-[0.5rem] text-ca-text-3">UNLOCK MISSIONS</p>
          {UNLOCK_MISSION_DEFS.length === 0 ? (
            <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.14)] p-6 text-center">
              <p className="text-sm text-ca-text-3">No unlock missions available yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {UNLOCK_MISSION_DEFS.map((def) => (
                <MissionCard
                  key={def.id}
                  def={def}
                  progress={allProgress[def.id] ?? { progress: 0, completed: false }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
