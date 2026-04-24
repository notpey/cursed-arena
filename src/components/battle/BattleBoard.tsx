import { BattleAbilityStrip } from '@/components/battle/BattleAbilityStrip'
import { ActiveEffectPips, BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import type { BattleAbilityTemplate, BattleFighterState, BattleState, QueuedBattleAction } from '@/features/battle/types'

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
}) {
  return (
    <section className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-[0.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,11,18,0.26),rgba(8,8,13,0.2))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] animate-ca-turn-reveal sm:px-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(250,39,66,0.32),transparent_42%,rgba(5,216,189,0.28))]" />
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
                      'rounded-[0.22rem] border bg-[linear-gradient(135deg,rgba(24,10,14,0.94),rgba(32,14,18,0.9))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_12px_rgba(0,0,0,0.34)] transition duration-200 sm:p-2',
                      enemyTimelineRole === 'actor'
                        ? 'border-ca-red/50 shadow-[0_0_0_1px_rgba(250,39,66,0.24),0_0_22px_rgba(250,39,66,0.18)]'
                        : enemyTimelineRole === 'target'
                          ? 'border-amber-300/40 shadow-[0_0_0_1px_rgba(252,211,77,0.2),0_0_22px_rgba(252,211,77,0.12)]'
                          : 'border-[rgba(250,39,66,0.2)]',
                    ].join(' ')}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {/* Pip row above the portrait, centered with the frame */}
                      <div className="flex min-h-[1.55rem] items-center justify-center">
                        <ActiveEffectPips fighter={enemy} mirrored />
                      </div>

                      <BattlePortraitSlot
                        fighter={enemy}
                        accent="red"
                        mirrored
                        targetable={enemyTargetable}
                        selectedTarget={selectedTargetId === enemy.instanceId}
                        muted={Boolean(targetingEnemies && !enemyTargetable && selectedAbility)}
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
