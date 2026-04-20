import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { ActiveEffectPips, BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/components/battle/battleDisplay'
import { getAbilityEnergyCost } from '@/features/battle/energy'
import { hasStatus } from '@/features/battle/statuses'
import { getAbilityById } from '@/features/battle/engine'
import type { BattleAbilityTemplate, BattleFighterState, PassiveEffect, QueuedBattleAction } from '@/features/battle/types'

function SkillTile({
  ability,
  active,
  queued,
  locked,
  onSelect,
  onHover,
  onLeave,
}: {
  ability: BattleAbilityTemplate
  active: boolean
  queued: boolean
  locked: boolean
  onSelect?: () => void
  onHover?: () => void
  onLeave?: () => void
}) {
  const cost = getAbilityEnergyCost(ability)

  return (
    <button
      type="button"
      onClick={locked ? undefined : onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      disabled={locked}
      title={ability.name}
      className={cn(
        'group relative h-[4rem] w-[4rem] shrink-0 overflow-hidden rounded-[0.2rem] border-2 bg-[rgba(20,20,28,0.9)] transition sm:h-[5rem] sm:w-[5rem] xl:h-[6rem] xl:w-[6rem]',
        active ? 'border-white/60 shadow-[0_0_10px_rgba(255,255,255,0.24)]' : 'border-white/15',
        queued && 'border-ca-teal/60 shadow-[0_0_10px_rgba(5,216,189,0.25)]',
        locked && 'cursor-not-allowed opacity-35 grayscale-[0.2]',
        !locked && !active && !queued && 'hover:border-white/30',
      )}
    >
      <div className="absolute inset-0 grid place-items-center">
        {ability.icon.src ? (
          <img src={ability.icon.src} alt={ability.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[rgba(15,15,20,0.95)] text-[1.2rem] font-black text-white/30">?</div>
        )}
      </div>

      <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-[0.1rem] bg-[rgba(0,0,0,0.7)] px-1 py-0.5">
        <EnergyCostRow cost={cost} compact />
      </div>
    </button>
  )
}

function QueuedSlot({
  actor,
  queuedAction,
  onDequeue,
}: {
  actor: BattleFighterState
  queuedAction?: QueuedBattleAction
  onDequeue?: () => void
}) {
  const queuedAbility = queuedAction ? getAbilityById(actor, queuedAction.abilityId) : null
  const hasQueued = Boolean(queuedAbility)

  return (
    <button
      type="button"
      onClick={hasQueued ? onDequeue : undefined}
      disabled={!hasQueued}
      title={hasQueued ? `${queuedAbility!.name} (click to remove)` : 'This fighter will pass unless a technique is queued'}
      className={cn(
        'group relative h-[4rem] w-[4rem] shrink-0 overflow-hidden rounded-[0.2rem] border-2 transition sm:h-[5rem] sm:w-[5rem] xl:h-[6rem] xl:w-[6rem]',
        hasQueued
          ? 'border-ca-teal/60 bg-[rgba(5,216,189,0.08)] shadow-[0_0_10px_rgba(5,216,189,0.2)]'
          : 'border-dashed border-white/10 bg-[rgba(15,15,20,0.6)]',
        hasQueued && 'cursor-pointer',
      )}
    >
      <div className="absolute inset-0 grid place-items-center">
        {queuedAbility ? (
          queuedAbility.icon.src ? (
            <img src={queuedAbility.icon.src} alt={queuedAbility.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[rgba(5,216,189,0.06)] text-[1.2rem] font-black text-ca-teal/60">?</div>
          )
        ) : (
          <div className="flex flex-col items-center gap-1">
            <div className="h-[2px] w-4 rounded-full bg-white/12" />
            <span className="ca-mono-label text-[0.38rem] text-ca-text-3">PASS</span>
          </div>
        )}
      </div>

      {hasQueued ? (
        <div className="absolute bottom-0.5 left-0.5 rounded-[0.1rem] bg-[rgba(0,0,0,0.7)] px-1 py-0.5">
          <span className="ca-mono-label text-[0.42rem] text-ca-teal group-hover:hidden">QUEUED</span>
          <span className="ca-mono-label hidden text-[0.42rem] text-ca-red group-hover:inline">REMOVE</span>
        </div>
      ) : null}
    </button>
  )
}

function rootPassiveName(label: string): string {
  return label.split(':')[0].trim()
}

function uniqueNamedPassives(passiveEffects: PassiveEffect[]): PassiveEffect[] {
  const seen = new Set<string>()
  const result: PassiveEffect[] = []
  for (const p of passiveEffects) {
    const root = rootPassiveName(p.label)
    if (seen.has(root)) continue
    seen.add(root)
    result.push(passiveEffects.find((x) => x.label === root) ?? p)
  }
  return result
}

function PassiveTile({ passive }: { passive: PassiveEffect }) {
  return (
    <div
      title={passive.label}
      className="group relative h-[4rem] w-[4rem] shrink-0 overflow-hidden rounded-[0.2rem] border-2 border-ca-teal/30 bg-[rgba(5,216,189,0.06)] sm:h-[5rem] sm:w-[5rem] xl:h-[6rem] xl:w-[6rem]"
    >
      <div className="absolute inset-0 grid place-items-center">
        {passive.icon?.src ? (
          <img src={passive.icon.src} alt={passive.label} className="h-full w-full object-cover opacity-80" />
        ) : (
          <span className="ca-mono-label text-[0.9rem] font-black text-ca-teal/50">P</span>
        )}
      </div>
      <div className="absolute bottom-0.5 left-0 right-0 flex justify-center">
        <span className="ca-mono-label rounded-[0.1rem] bg-[rgba(0,0,0,0.7)] px-1 py-0.5 text-[0.38rem] text-ca-teal">PASSIVE</span>
      </div>
      <div className="pointer-events-none absolute inset-0 hidden flex-col justify-end bg-[rgba(5,10,18,0.92)] p-1.5 group-hover:flex">
        <p className="ca-mono-label text-[0.4rem] font-bold leading-tight text-ca-teal">{passive.label}</p>
      </div>
    </div>
  )
}

export function BattleAbilityStrip({
  fighter,
  selected,
  actorTargetable,
  actorSelectedTarget,
  actorMuted,
  pendingAbilityId,
  queuedAction,
  validAbility,
  carryoverLabels = [],
  interactionLocked = false,
  timelineRole = null,
  timelineTone = null,
  onActorClick,
  onAbilityClick,
  onHoverAbility,
  onLeaveAbility,
  onDequeue,
}: {
  fighter: BattleFighterState
  selected?: boolean
  actorTargetable?: boolean
  actorSelectedTarget?: boolean
  actorMuted?: boolean
  pendingAbilityId?: string | null
  queuedAction?: QueuedBattleAction
  validAbility?: (abilityId: string) => boolean
  carryoverLabels?: string[]
  interactionLocked?: boolean
  timelineRole?: 'actor' | 'target' | null
  timelineTone?: 'red' | 'teal' | 'gold' | 'frost' | null
  onActorClick?: () => void
  onAbilityClick?: (abilityId: string) => void
  onHoverAbility?: (abilityId: string) => void
  onLeaveAbility?: () => void
  onDequeue?: () => void
}) {
  const abilities = fighter.abilities.concat(fighter.ultimate)
  const hpValue = (fighter.hp / fighter.maxHp) * 100
  const disabledLabel =
    fighter.hp <= 0
      ? 'KO'
      : hasStatus(fighter.statuses, 'stun')
        ? 'STUNNED'
        : hasStatus(fighter.statuses, 'invincible')
          ? 'VOID'
          : null

  return (
    <div className="relative flex items-start gap-2.5 sm:gap-3">
      <div className="relative z-10 shrink-0 pt-0.5">
        <BattlePortraitSlot
          fighter={fighter}
          accent="teal"
          active={Boolean(selected)}
          targetable={Boolean(actorTargetable)}
          selectedTarget={Boolean(actorSelectedTarget)}
          muted={Boolean(actorMuted)}
          hideHp
          sizeClass="w-[7rem] sm:w-[8.5rem] xl:w-[10rem]"
          carryoverLabels={carryoverLabels}
          timelineRole={timelineRole}
          timelineTone={timelineTone}
          onClick={!interactionLocked ? onActorClick : undefined}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-end gap-1 pb-0.5">
        <div className="flex min-h-[2.4rem] items-end px-1.5 sm:px-2">
          <ActiveEffectPips fighter={fighter} tooltipDown />
        </div>

        <div
          className={cn(
            'relative min-w-0 overflow-hidden rounded-[0.3rem] border bg-[linear-gradient(135deg,rgba(12,10,24,0.94),rgba(18,14,32,0.9))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_12px_rgba(0,0,0,0.3)] transition',
            selected ? 'border-ca-teal/35 ring-1 ring-ca-teal/20' : 'border-[rgba(5,216,189,0.2)]',
            actorTargetable && 'ring-2 ring-amber-300/30',
            actorMuted && 'opacity-50 saturate-75',
            timelineRole === 'actor' && timelineTone === 'red' && 'border-ca-red/45 ring-1 ring-ca-red/25 shadow-[0_0_22px_rgba(250,39,66,0.16)]',
            timelineRole === 'actor' && timelineTone !== 'red' && 'border-ca-teal/45 ring-1 ring-ca-teal/25 shadow-[0_0_22px_rgba(5,216,189,0.16)]',
            timelineRole === 'target' && 'border-amber-300/40 ring-1 ring-amber-300/25 shadow-[0_0_22px_rgba(252,211,77,0.12)]',
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_60%,rgba(5,216,189,0.03)_85%,rgba(5,216,189,0.06)_100%)]" />

          <div className="relative border-b border-white/6 bg-black/40">
            <ProgressBar value={hpValue} tone="green-muted" className="h-[1.1rem] bg-black/50" />
            <span className="absolute inset-0 flex items-center justify-center ca-mono-label text-[0.55rem] text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
              {fighter.shortName.toUpperCase()} - {fighter.hp}/{fighter.maxHp}
            </span>
            {disabledLabel ? (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-white/12 bg-black/55 px-1.5 py-0.5 ca-mono-label text-[0.45rem] text-amber-200">
                {disabledLabel}
              </span>
            ) : null}
          </div>

          <div className="relative flex min-w-0 items-center gap-2 overflow-x-auto px-2 py-2 sm:gap-2.5 sm:px-2.5">
            <QueuedSlot actor={fighter} queuedAction={queuedAction} onDequeue={onDequeue} />

            {abilities.map((ability) => (
              <SkillTile
                key={ability.id}
                ability={ability}
                active={pendingAbilityId === ability.id}
                queued={queuedAction?.abilityId === ability.id}
                locked={interactionLocked || !(validAbility?.(ability.id) ?? true)}
                onSelect={!interactionLocked && onAbilityClick ? () => onAbilityClick(ability.id) : undefined}
                onHover={!interactionLocked && onHoverAbility ? () => onHoverAbility(ability.id) : undefined}
                onLeave={!interactionLocked ? onLeaveAbility : undefined}
              />
            ))}

            {(fighter.passiveEffects?.length ?? 0) > 0 ? (
              <>
                <div className="h-8 w-px shrink-0 bg-white/8" />
                {uniqueNamedPassives(fighter.passiveEffects!).map((passive) => (
                  <PassiveTile key={passive.label} passive={passive} />
                ))}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
