import { useEffect } from 'react'
import { BattleAbilityStrip } from '@/components/battle/BattleAbilityStrip'
import { ActiveEffectPips, BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import { setActiveBattleStateForPips } from '@/components/battle/battleDisplay'
import type { BattleAbilityTemplate, BattleFighterState, BattleState, QueuedBattleAction } from '@/features/battle/types'
import type { BattlePresentationMode } from '@/features/battle/presentationPreference'

type TimelineFocus = {
  actorId?: string
  targetId?: string
  label: string
  tone: 'red' | 'teal' | 'gold' | 'frost'
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
  onSelectActor,
  onSelectAbility,
  onTargetFighter,
  onHoverAbility,
  onLeaveAbility,
  onDequeue,
  canUsePlayerAbility,
  getPlayerAbilityBlockReason,
  interactionLocked = false,
  timelineFocus = null,
  playerIsActiveSide = true,
  presentationMode = 'standard',
}: {
  state: BattleState
  queued: Record<string, QueuedBattleAction>
  selectedActorId: string | null
  selectedAbility: BattleAbilityTemplate | null
  selectedTargetId: string | null
  validTargetIds: string[]
  targetingAllies: boolean
  targetingEnemies: boolean
  onSelectActor: (actorId: string) => void
  onSelectAbility: (actorId: string, abilityId: string) => void
  onTargetFighter: (fighter: BattleFighterState) => void
  onHoverAbility: (actorId: string, abilityId: string) => void
  onLeaveAbility: () => void
  onDequeue: (actorId: string) => void
  canUsePlayerAbility: (fighter: BattleFighterState, abilityId: string) => boolean
  getPlayerAbilityBlockReason: (fighter: BattleFighterState, abilityId: string) => string | null
  interactionLocked?: boolean
  timelineFocus?: TimelineFocus | null
  /** Whether the player side is currently the active/commanding side. */
  playerIsActiveSide?: boolean
  presentationMode?: BattlePresentationMode
}) {
  useEffect(() => {
    setActiveBattleStateForPips(state)
    return () => setActiveBattleStateForPips(null)
  }, [state])

  return (
    <section
      key={playerIsActiveSide ? 'player-side' : 'enemy-side'}
      className={[
        'relative flex flex-1 flex-col justify-center overflow-hidden rounded-[0.25rem] border bg-[radial-gradient(circle_at_50%_42%,rgba(233,235,245,0.02),transparent_42%),linear-gradient(180deg,rgba(8,7,13,0.5),rgba(4,4,8,0.4))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_0_36px_rgba(0,0,0,0.22)] animate-ca-control-shift sm:px-4 transition-colors duration-500',
        playerIsActiveSide
          ? 'border-ca-teal/36 shadow-[inset_0_0_34px_rgba(6,220,194,0.12),inset_0_1px_0_rgba(255,255,255,0.05),0_0_24px_rgba(6,220,194,0.07)]'
          : 'border-ca-red/36 shadow-[inset_0_0_34px_rgba(252,43,71,0.13),inset_0_1px_0_rgba(255,255,255,0.05),0_0_24px_rgba(252,43,71,0.07)]',
      ].join(' ')}
    >
      <div className="pointer-events-none absolute -inset-x-20 inset-y-0 bg-[linear-gradient(105deg,transparent_0%,rgba(252,43,71,0.035)_34%,rgba(6,220,194,0.045)_49%,rgba(255,255,255,0.035)_56%,transparent_70%)] opacity-85 animate-ca-energy-sweep" />
      <div
        className={[
          'pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity duration-500',
          playerIsActiveSide
            ? 'bg-[linear-gradient(90deg,rgba(5,216,189,0.55),transparent_50%,rgba(5,216,189,0.22))]'
            : 'bg-[linear-gradient(90deg,rgba(250,39,66,0.55),transparent_50%,rgba(250,39,66,0.22))]',
        ].join(' ')}
      />
      <div className="relative z-10 mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-[0.18rem] border border-amber-300/24 bg-amber-300/10 px-2.5 py-1 ca-mono-label text-[0.58rem] text-amber-300">
          {state.battlefield.label.toUpperCase()}
        </span>
        <span className="rounded-[0.18rem] border border-white/10 bg-white/5 px-2.5 py-1 ca-mono-label text-[0.58rem] text-ca-text-2">
          {state.firstPlayer === 'player' ? 'OPENING WINDOW' : 'RESPONSE WINDOW'}
        </span>
        {selectedAbility ? (
          <span key={selectedAbility.id} className="rounded-[0.18rem] border border-white/10 bg-white/5 px-2.5 py-1 ca-mono-label text-[0.58rem] text-ca-text-2 animate-ca-fade-in">
            {targetingEnemies ? 'TARGET ENEMY' : targetingAllies ? 'TARGET ALLY' : selectedAbility.name.toUpperCase()}
          </span>
        ) : null}

        {timelineFocus ? (
          <span key={timelineFocus.label} className={[
            'rounded-[0.18rem] border px-2.5 py-1 ca-mono-label text-[0.58rem] animate-ca-fade-in',
            timelineFocus.tone === 'red'
              ? 'border-ca-red/24 bg-ca-red-wash text-ca-red'
              : timelineFocus.tone === 'teal'
                ? 'border-ca-teal/24 bg-ca-teal-wash text-ca-teal'
                : timelineFocus.tone === 'gold'
                  ? 'border-amber-300/24 bg-amber-300/10 text-amber-200'
                  : 'border-white/10 bg-white/5 text-ca-text',
          ].join(' ')}>
            {timelineFocus.label}
          </span>
        ) : null}
      </div>

      {/* Opponent-turn banner — shown when the player cannot act because it is the opponent's command phase */}
      {!playerIsActiveSide && !interactionLocked ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 flex justify-center animate-ca-fade-in">
          <div className="flex items-center gap-2 rounded-[0.22rem] border border-white/13 bg-[rgba(5,5,10,0.82)] px-4 py-2 shadow-[0_9px_24px_rgba(0,0,0,0.52)] backdrop-blur-sm animate-ca-soft-pop">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ca-red" />
            <span className="ca-mono-label text-[0.62rem] tracking-[0.14em] text-ca-text-2">AWAITING OPPONENT</span>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex flex-1 flex-col justify-evenly gap-1.5 sm:gap-2">
        {state.playerTeam.map((fighter, index) => {
          const enemy = state.enemyTeam[index]
          const allyQueued = queued[fighter.instanceId]
          const allyTargetable = targetingAllies && validTargetIds.includes(fighter.instanceId)
          const enemyTargetable = Boolean(enemy && targetingEnemies && validTargetIds.includes(enemy.instanceId))
          const allyTimelineRole =
            timelineFocus?.actorId === fighter.instanceId
              ? 'actor'
              : timelineFocus?.targetId === fighter.instanceId
                ? 'target'
                : null
          const enemyTimelineRole =
            enemy
              ? timelineFocus?.actorId === enemy.instanceId
                ? 'actor'
                : timelineFocus?.targetId === enemy.instanceId
                  ? 'target'
                  : null
              : null

          return (
            <div key={fighter.instanceId} className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="w-full max-w-[30rem] md:max-w-[35rem] xl:max-w-[40rem] 2xl:max-w-[44rem]">
                <BattleAbilityStrip
                  fighter={fighter}
                  selected={selectedActorId === fighter.instanceId}
                  actorTargetable={allyTargetable}
                  actorSelectedTarget={selectedTargetId === fighter.instanceId}
                  actorMuted={Boolean(targetingAllies && !allyTargetable && selectedAbility)}
                  pendingAbilityId={selectedActorId === fighter.instanceId ? selectedAbility?.id ?? null : null}
                  queuedAction={allyQueued}
                  validAbility={(abilityId) => canUsePlayerAbility(fighter, abilityId)}
                  abilityBlockReason={(abilityId) => getPlayerAbilityBlockReason(fighter, abilityId)}
                  interactionLocked={interactionLocked}
                  timelineRole={allyTimelineRole}
                  timelineTone={timelineFocus?.tone ?? null}
                  isActiveSide={playerIsActiveSide}
                  presentationMode={presentationMode}
                  onActorClick={() => {
                    if (interactionLocked) return
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
                  <div
                    className={[
                      'rounded-[0.22rem] border bg-[linear-gradient(135deg,rgba(24,8,13,0.95),rgba(13,8,12,0.93))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_5px_14px_rgba(0,0,0,0.4)] transition duration-200 sm:p-2',
                      // Timeline focus styles take precedence over targeting styles
                      enemyTimelineRole === 'actor'
                        ? 'border-ca-red/50 shadow-[0_0_0_1px_rgba(250,39,66,0.24),0_0_22px_rgba(250,39,66,0.18)]'
                        : enemyTimelineRole === 'target'
                          ? 'border-amber-300/40 shadow-[0_0_0_1px_rgba(252,211,77,0.2),0_0_22px_rgba(252,211,77,0.12)]'
                          // Valid target: gold border + slow pulse to make it unmissable
                          : enemyTargetable
                            ? selectedTargetId === enemy?.instanceId
                              ? 'border-amber-300/70 shadow-[0_0_0_2px_rgba(255,209,102,0.5),0_0_26px_rgba(255,209,102,0.36)] animate-ca-selected-breathe'
                              : 'border-amber-300/60 animate-ca-target-pulse'
                            // Non-valid while targeting enemies: dim the whole card
                            : (targetingEnemies && selectedAbility)
                              ? 'border-[rgba(250,39,66,0.1)] opacity-40 saturate-50'
                              : 'border-[rgba(252,43,71,0.23)]',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-2">
                      {/* Pip column to the LEFT of the portrait so the stack can stretch */}
                      <ActiveEffectPips
                        fighter={enemy}
                        mirrored
                        column
                        className="pt-0.5"
                        hidden={Boolean(selectedAbility)}
                      />

                      <BattlePortraitSlot
                        fighter={enemy}
                        accent="red"
                        mirrored
                        targetable={enemyTargetable}
                        selectedTarget={selectedTargetId === enemy.instanceId}
                        muted={false}
                        sizeClass="w-[4rem] sm:w-[4.75rem] xl:w-[5.4rem]"
                        timelineRole={enemyTimelineRole}
                        timelineTone={timelineFocus?.tone ?? null}
                        onClick={enemyTargetable && !interactionLocked ? () => onTargetFighter(enemy) : undefined}
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
