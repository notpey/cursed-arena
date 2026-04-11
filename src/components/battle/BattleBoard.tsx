import { BattleAbilityStrip } from '@/components/battle/BattleAbilityStrip'
import { BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import { cn, getStatusPills } from '@/components/battle/battleDisplay'
import type { BattleAbilityTemplate, BattleFighterState, BattleState, QueuedBattleAction } from '@/features/battle/types'

type RoundTransitionOverlay = {
  key: string
  round: number
  title: string
  subtitle: string
  badges: string[]
  tone: 'teal' | 'red' | 'gold'
  highlights: Record<string, string[]>
} | null

function transitionToneClasses(tone: 'teal' | 'red' | 'gold') {
  if (tone === 'red') {
    return {
      pulse: 'bg-[radial-gradient(circle_at_50%_45%,rgba(250,39,66,0.16),transparent_60%)]',
      border: 'border-ca-red/25',
      wash: 'bg-[linear-gradient(180deg,rgba(44,10,18,0.9),rgba(18,10,14,0.82))]',
      text: 'text-ca-red',
      badge: 'border-ca-red/24 bg-ca-red-wash text-ca-red',
    }
  }

  if (tone === 'gold') {
    return {
      pulse: 'bg-[radial-gradient(circle_at_50%_45%,rgba(245,166,35,0.16),transparent_60%)]',
      border: 'border-amber-300/25',
      wash: 'bg-[linear-gradient(180deg,rgba(40,24,8,0.9),rgba(18,12,10,0.82))]',
      text: 'text-amber-300',
      badge: 'border-amber-300/24 bg-amber-300/10 text-amber-300',
    }
  }

  return {
    pulse: 'bg-[radial-gradient(circle_at_50%_45%,rgba(5,216,189,0.16),transparent_60%)]',
    border: 'border-ca-teal/25',
    wash: 'bg-[linear-gradient(180deg,rgba(6,32,30,0.9),rgba(8,16,18,0.82))]',
    text: 'text-ca-teal',
    badge: 'border-ca-teal/24 bg-ca-teal-wash text-ca-teal',
  }
}

function getIntentTone(summary: string) {
  if (summary.toLowerCase().includes('auto-pass')) return 'text-ca-text-3'
  if (summary.toLowerCase().includes('->')) return 'text-ca-red'
  return 'text-ca-text-2'
}

export function BattleBoard({
  state,
  queued,
  selectedActorId,
  selectedAbility,
  selectedTargetId,
  validTargetIds,
  targetingAllies,
  targetingEnemies,
  enemyIntentSummaries,
  roundTransition,
  onSelectActor,
  onSelectAbility,
  onTargetFighter,
  onHoverAbility,
  onLeaveAbility,
  onDequeue,
  canUsePlayerAbility,
}: {
  state: BattleState
  queued: Record<string, QueuedBattleAction>
  selectedActorId: string | null
  selectedAbility: BattleAbilityTemplate | null
  selectedTargetId: string | null
  validTargetIds: string[]
  targetingAllies: boolean
  targetingEnemies: boolean
  enemyIntentSummaries: Record<string, string>
  roundTransition: RoundTransitionOverlay
  onSelectActor: (actorId: string) => void
  onSelectAbility: (actorId: string, abilityId: string) => void
  onTargetFighter: (fighter: BattleFighterState) => void
  onHoverAbility: (actorId: string, abilityId: string) => void
  onLeaveAbility: () => void
  onDequeue: (actorId: string) => void
  canUsePlayerAbility: (fighter: BattleFighterState, abilityId: string) => boolean
}) {
  const transitionStyles = roundTransition ? transitionToneClasses(roundTransition.tone) : null

  return (
    <section className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-[0.3rem] border border-white/6 bg-[rgba(6,6,10,0.18)] px-3 py-3 sm:px-4">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-0 transition-opacity duration-700',
          roundTransition ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className={cn('absolute inset-0 animate-pulse', transitionStyles?.pulse)} />
      </div>

      <div
        className={cn(
          'pointer-events-none absolute left-1/2 top-4 z-20 w-full max-w-[36rem] -translate-x-1/2 px-4 transition-all duration-500',
          roundTransition ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
        )}
      >
        {roundTransition && transitionStyles ? (
          <div className={cn('overflow-hidden rounded-[0.3rem] border px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.36)]', transitionStyles.border, transitionStyles.wash)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="ca-mono-label text-[0.58rem] text-ca-text-3">ROUND TRANSITION</p>
                <p className={cn('mt-1 ca-display text-[1.05rem] leading-none', transitionStyles.text)}>{roundTransition.title}</p>
              </div>
              <span className={cn('rounded-full border px-2 py-1 ca-mono-label text-[0.56rem]', transitionStyles.badge)}>
                {roundTransition.subtitle.toUpperCase()}
              </span>
            </div>

            {roundTransition.badges.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {roundTransition.badges.map((badge) => (
                  <span key={`${roundTransition.key}-${badge}`} className={cn('rounded-full border px-2 py-1 ca-mono-label text-[0.52rem]', transitionStyles.badge)}>
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-amber-300/24 bg-amber-300/10 px-2.5 py-1 ca-mono-label text-[0.58rem] text-amber-300">
          {state.battlefield.label.toUpperCase()}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 ca-mono-label text-[0.58rem] text-ca-text-2">
          {state.firstPlayer === 'player' ? 'OPENING WINDOW' : 'RESPONSE WINDOW'}
        </span>
        {selectedAbility ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 ca-mono-label text-[0.58rem] text-ca-text-2">
            {targetingEnemies ? 'TARGET ENEMY' : targetingAllies ? 'TARGET ALLY' : selectedAbility.name.toUpperCase()}
          </span>
        ) : null}
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-evenly gap-2 sm:gap-3">
        {state.playerTeam.map((fighter, index) => {
          const enemy = state.enemyTeam[index]
          const allyQueued = queued[fighter.instanceId]
          const allyTargetable = targetingAllies && validTargetIds.includes(fighter.instanceId)
          const enemyTargetable = Boolean(enemy && targetingEnemies && validTargetIds.includes(enemy.instanceId))
          const playerStatus = getStatusPills(fighter).map((pill) => pill.label)
          const enemyStatus = enemy ? getStatusPills(enemy).map((pill) => pill.label) : []
          const playerCarryover = roundTransition?.highlights[fighter.instanceId] ?? []
          const enemyCarryover = enemy ? roundTransition?.highlights[enemy.instanceId] ?? [] : []
          const enemyIntent = enemy ? enemyIntentSummaries[enemy.instanceId] ?? 'Auto-pass' : 'Auto-pass'

          return (
            <div key={fighter.instanceId} className="flex items-center justify-between gap-4 sm:gap-6">
              <div className="w-full max-w-[36rem] md:max-w-[42rem] xl:max-w-[48rem] 2xl:max-w-[54rem]">
                <BattleAbilityStrip
                  fighter={fighter}
                  selected={selectedActorId === fighter.instanceId}
                  actorTargetable={allyTargetable}
                  actorSelectedTarget={selectedTargetId === fighter.instanceId}
                  actorMuted={Boolean(targetingAllies && !allyTargetable && selectedAbility)}
                  pendingAbilityId={selectedActorId === fighter.instanceId ? selectedAbility?.id ?? null : null}
                  queuedAction={allyQueued}
                  validAbility={(abilityId) => canUsePlayerAbility(fighter, abilityId)}
                  statusLabels={playerStatus}
                  carryoverLabels={playerCarryover}
                  onActorClick={() => {
                    if (allyTargetable) {
                      onTargetFighter(fighter)
                      return
                    }
                    onSelectActor(fighter.instanceId)
                  }}
                  onAbilityClick={(abilityId) => onSelectAbility(fighter.instanceId, abilityId)}
                  onHoverAbility={(abilityId) => onHoverAbility(fighter.instanceId, abilityId)}
                  onLeaveAbility={onLeaveAbility}
                  onDequeue={() => onDequeue(fighter.instanceId)}
                />
              </div>

              <div className="shrink-0">
                {enemy ? (
                  <div className="rounded-[0.3rem] border border-[rgba(250,39,66,0.2)] bg-[linear-gradient(135deg,rgba(24,10,14,0.94),rgba(32,14,18,0.9))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_12px_rgba(0,0,0,0.3)] sm:p-2.5">
                    <div className="flex flex-col items-end gap-2 xl:flex-row xl:items-center xl:gap-3">
                      <div className="hidden max-w-[9rem] text-right xl:block">
                        <p className="ca-mono-label text-[0.52rem] text-ca-text-3">ENEMY PRESSURE</p>
                        <p className={cn('mt-1 text-[0.62rem] leading-4', getIntentTone(enemyIntent))}>{enemyIntent}</p>
                        <p className="mt-2 ca-mono-label text-[0.52rem] text-ca-text-3">ROLE</p>
                        <p className="mt-1 ca-display text-[0.68rem] leading-none text-ca-text">{enemy.role.toUpperCase()}</p>
                      </div>

                      <BattlePortraitSlot
                        fighter={enemy}
                        accent="red"
                        mirrored
                        targetable={enemyTargetable}
                        selectedTarget={selectedTargetId === enemy.instanceId}
                        muted={Boolean(targetingEnemies && !enemyTargetable && selectedAbility)}
                        statusLabels={enemyStatus}
                        carryoverLabels={enemyCarryover}
                        onClick={enemyTargetable ? () => onTargetFighter(enemy) : undefined}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
