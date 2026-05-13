import { useState } from 'react'
import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { ActiveEffectPips, BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/components/battle/battleDisplay'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import { battleEnergyOrder, getAbilityEnergyCost, normalizeEnergyAmount } from '@/features/battle/energy'
import { hasStatus } from '@/features/battle/statuses'
import { getAbilityById, getCooldown } from '@/features/battle/engine'
import type { BattleAbilityTemplate, BattleFighterState, QueuedBattleAction } from '@/features/battle/types'
import type { BattlePresentationMode } from '@/features/battle/presentationPreference'

function getQueuedRandomAllocated(action: QueuedBattleAction | undefined) {
  return battleEnergyOrder.reduce((total, type) => total + normalizeEnergyAmount(action?.randomCostAllocation?.[type]), 0)
}

function SkillTile({
  ability,
  active,
  queued,
  locked,
  lockReason,
  cooldown,
  queuedOrder,
  randomAllocationMissing,
  onSelect,
  onHover,
  onLeave,
}: {
  ability: BattleAbilityTemplate
  active: boolean
  queued: boolean
  locked: boolean
  lockReason?: string | null
  cooldown: number
  queuedOrder?: number | null
  randomAllocationMissing?: boolean
  onSelect?: () => void
  onHover?: () => void
  onLeave?: () => void
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const cost = getAbilityEnergyCost(ability)
  const iconSrc = normalizeBattleAssetSrc(ability.icon.src)
  const onCooldown = cooldown > 0
  const tooltipHeading = locked
    ? 'Unavailable'
    : randomAllocationMissing
      ? 'Random Energy'
      : queued
        ? 'Queued'
        : ability.name
  const tooltipTitle = [
    ability.name,
    queued ? `Queued${queuedOrder ? ` #${queuedOrder}` : ''}` : null,
    randomAllocationMissing ? 'Random Energy allocation required at confirmation' : null,
    lockReason,
  ].filter(Boolean).join(' - ')

  function handleMouseEnter() {
    setTooltipVisible(true)
    onHover?.()
  }

  function handleMouseLeave() {
    setTooltipVisible(false)
    onLeave?.()
  }

  return (
    <div className={cn('relative shrink-0', tooltipVisible && 'z-[160]')}>
      <button
        type="button"
        onClick={locked ? onHover : onSelect}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        disabled={false}
        title={tooltipTitle || ability.name}
        aria-label={lockReason ? `${ability.name} - ${lockReason}` : ability.name}
        className={cn(
          'group ca-motion-smooth relative h-[3.2rem] w-[3.2rem] overflow-hidden rounded-[0.14rem] border-2 bg-[rgba(12,12,18,0.92)] shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_3px_10px_rgba(0,0,0,0.25)] transition-all duration-200 sm:h-[3.9rem] sm:w-[3.9rem] xl:h-[4.65rem] xl:w-[4.65rem]',
          active && 'border-white/82 shadow-[0_0_0_1px_rgba(255,255,255,0.46),0_0_22px_rgba(255,255,255,0.34)] -translate-y-[3px] scale-[1.055] animate-ca-soft-pop',
          !active && queued && 'border-ca-teal/72 shadow-[0_0_0_1px_rgba(6,220,194,0.3),0_0_16px_rgba(6,220,194,0.28)] animate-ca-selected-breathe',
          !active && !queued && 'border-white/18',
          locked && 'cursor-pointer border-white/10 opacity-42 grayscale saturate-50 shadow-none',
          !locked && !active && !queued && 'hover:border-white/40 hover:-translate-y-[2px] hover:scale-[1.025] hover:shadow-[0_7px_18px_rgba(0,0,0,0.46)]',
          'active:scale-[0.93]',
        )}
      >
        <div className="absolute inset-0 grid place-items-center">
          {iconSrc ? (
            <img src={iconSrc} alt={ability.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[rgba(15,15,20,0.95)] text-[1.2rem] font-black text-white/30">?</div>
          )}
        </div>

        {onCooldown ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/65">
            <span className="ca-display select-none text-[1.55rem] leading-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] sm:text-[1.9rem] xl:text-[2.2rem]">
              {cooldown}
            </span>
          </div>
        ) : null}

        <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-[0.1rem] bg-[rgba(0,0,0,0.7)] px-1 py-0.5">
          <EnergyCostRow cost={cost} compact />
        </div>

        {queued ? (
          <div className="absolute left-0.5 bottom-0.5 rounded-[0.1rem] border border-ca-teal/35 bg-black/72 px-1 py-0.5">
            <span className="ca-mono-label text-[0.34rem] text-ca-teal">
              {queuedOrder ? `QUE ${queuedOrder}` : 'QUE'}
            </span>
          </div>
        ) : null}
      </button>

      {tooltipVisible && (locked || queued || randomAllocationMissing) ? (
        <div className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-[220] -translate-x-1/2">
          <div className="relative min-w-[9rem] max-w-[16rem] rounded-[0.32rem] border border-white/14 bg-[linear-gradient(180deg,rgba(18,17,24,0.98),rgba(8,8,13,0.99))] px-2.5 py-2 shadow-[0_14px_32px_rgba(0,0,0,0.62)] backdrop-blur-md">
            <p className="ca-mono-label text-[0.48rem] leading-none text-ca-text">{tooltipHeading.toUpperCase()}</p>
            <p className="mt-1 text-[0.65rem] leading-snug text-ca-text-2">
              {lockReason ?? (randomAllocationMissing ? 'Random Energy allocation is required before submission.' : 'Queued for resolution.')}
            </p>
            {queued ? (
              <p className="mt-1 ca-mono-label text-[0.5rem] leading-snug text-ca-teal">
                {queuedOrder ? `QUEUE ORDER ${queuedOrder}` : 'QUEUED'} - COST RESERVED AT COMMIT
              </p>
            ) : null}
            {cost.random ? (
              <p className="mt-1 ca-mono-label text-[0.5rem] leading-snug text-ca-text-3">
                RANDOM ENERGY REQUIRED: {cost.random}
              </p>
            ) : null}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 translate-y-[1px]">
              <div className="h-0 w-0 border-b-[5px] border-l-[5px] border-r-[5px] border-b-[rgba(18,17,24,0.98)] border-l-transparent border-r-transparent" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function QueuedSlot({
  actor,
  queuedAction,
  queuedOrder,
  onDequeue,
}: {
  actor: BattleFighterState
  queuedAction?: QueuedBattleAction
  queuedOrder?: number | null
  onDequeue?: () => void
}) {
  const queuedAbility = queuedAction ? getAbilityById(actor, queuedAction.abilityId) : null
  const hasQueued = Boolean(queuedAbility)
  const queuedIconSrc = normalizeBattleAssetSrc(queuedAbility?.icon.src)

  return (
    <button
      type="button"
      onClick={hasQueued ? onDequeue : undefined}
      disabled={!hasQueued}
      title={hasQueued ? `${queuedAbility!.name} (click to remove)` : 'This fighter will pass unless a technique is queued'}
      className={cn(
        'group ca-motion-smooth relative h-[3.2rem] w-[3.2rem] shrink-0 overflow-hidden rounded-[0.14rem] border-2 transition duration-200 sm:h-[3.9rem] sm:w-[3.9rem] xl:h-[4.65rem] xl:w-[4.65rem]',
        hasQueued
          ? 'border-ca-teal/66 bg-[rgba(6,220,194,0.05)] shadow-[0_0_14px_rgba(6,220,194,0.22)] animate-ca-selected-breathe'
          : 'border-dashed border-white/13 bg-[rgba(10,10,16,0.66)]',
        hasQueued && 'cursor-pointer active:scale-[0.93]',
      )}
    >
      <div className="absolute inset-0 grid place-items-center">
        {queuedAbility ? (
          queuedIconSrc ? (
            <img src={queuedIconSrc} alt={queuedAbility.name} className="h-full w-full object-cover" />
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
          <span className="ca-mono-label text-[0.42rem] text-ca-teal group-hover:hidden">{queuedOrder ? `QUE ${queuedOrder}` : 'QUEUED'}</span>
          <span className="ca-mono-label hidden text-[0.42rem] text-ca-red group-hover:inline">REMOVE</span>
        </div>
      ) : null}
    </button>
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
  queuedOrder = null,
  delayedEffectCount = 0,
  validAbility,
  abilityBlockReason,
  carryoverLabels = [],
  interactionLocked = false,
  timelineRole = null,
  timelineTone = null,
  isActiveSide = true,
  presentationMode = 'standard',
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
  queuedOrder?: number | null
  delayedEffectCount?: number
  validAbility?: (abilityId: string) => boolean
  abilityBlockReason?: (abilityId: string) => string | null
  carryoverLabels?: string[]
  interactionLocked?: boolean
  timelineRole?: 'actor' | 'target' | null
  timelineTone?: 'red' | 'teal' | 'gold' | 'frost' | null
  isActiveSide?: boolean
  presentationMode?: BattlePresentationMode
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
    <div className={cn('ca-motion-smooth relative flex items-start gap-2 sm:gap-2.5 transition-all duration-[350ms]', selected && 'translate-x-1', !isActiveSide && 'opacity-70')}>
      <div className="relative z-10 shrink-0 pt-0.5">
        <BattlePortraitSlot
          fighter={fighter}
          accent="teal"
          active={Boolean(selected)}
          targetable={Boolean(actorTargetable)}
          selectedTarget={Boolean(actorSelectedTarget)}
          muted={Boolean(actorMuted)}
          hideHp
          sizeClass="w-[5.5rem] sm:w-[6.5rem] xl:w-[7.35rem]"
          carryoverLabels={carryoverLabels}
          queuedAction={queuedAction}
          delayedEffectCount={delayedEffectCount}
          timelineRole={timelineRole}
          timelineTone={timelineTone}
          onClick={!interactionLocked ? onActorClick : undefined}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-end gap-1 pb-0.5">
        <div className="flex min-h-[1.55rem] items-end px-1.5 sm:px-2">
          <ActiveEffectPips fighter={fighter} tooltipDown hidden={Boolean(pendingAbilityId)} />
        </div>

        <div
          className={cn(
            'ca-motion-smooth relative min-w-0 overflow-visible rounded-[0.22rem] border bg-[linear-gradient(135deg,rgba(10,9,18,0.96),rgba(17,13,28,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_5px_14px_rgba(0,0,0,0.38)] transition duration-200',
            selected ? 'border-ca-teal/48 ring-1 ring-ca-teal/28 animate-ca-control-shift shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_8px_20px_rgba(0,0,0,0.44),0_0_20px_rgba(6,220,194,0.12)]' : 'border-[rgba(6,220,194,0.23)]',
            actorTargetable && 'ring-2 ring-amber-300/30',
            actorMuted && 'opacity-50 saturate-75',
            timelineRole === 'actor' && timelineTone === 'red' && 'border-ca-red/40 ring-1 ring-ca-red/20 shadow-[0_0_18px_rgba(252,43,71,0.13)]',
            timelineRole === 'actor' && timelineTone !== 'red' && 'border-ca-teal/40 ring-1 ring-ca-teal/20 shadow-[0_0_18px_rgba(6,220,194,0.13)]',
            timelineRole === 'target' && 'border-amber-300/40 ring-1 ring-amber-300/25 shadow-[0_0_22px_rgba(252,211,77,0.12)]',
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_72%,rgba(8,226,200,0.035)_100%)]" />

          {isActiveSide && fighter.hp > 0 && hasStatus(fighter.statuses, 'stun') ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[rgba(0,0,0,0.55)]">
              <span className="ca-mono-label text-[0.7rem] tracking-[0.14em] text-amber-200">STUNNED</span>
            </div>
          ) : null}

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

          <div className="relative flex min-w-0 items-center gap-1.5 px-1.5 py-1.5 sm:gap-2 sm:px-2">
            <div className={cn(
              'shrink-0 overflow-hidden',
              presentationMode === 'standard'
                ? 'transition-[width,opacity,transform] duration-[420ms] ease-out'
                : 'transition-none',
              isActiveSide
                ? 'w-[3.2rem] opacity-100 sm:w-[3.9rem] xl:w-[4.65rem]'
                : 'w-0 -translate-x-3 opacity-0',
            )}>
              <QueuedSlot actor={fighter} queuedAction={queuedAction} queuedOrder={queuedOrder} onDequeue={onDequeue} />
            </div>

            {isActiveSide ? (
              <div className={cn(
                'h-8 w-px shrink-0 bg-white/10',
                presentationMode === 'standard' ? 'transition-opacity duration-200' : 'transition-none',
              )} />
            ) : null}

            {abilities.map((ability) => {
              const lockReason = interactionLocked
                ? 'Locked during resolution'
                : abilityBlockReason?.(ability.id) ?? null
              const isLocked = interactionLocked || !(validAbility?.(ability.id) ?? true)
              const abilityCooldown = getCooldown(fighter, ability.id)
              const randomRequired = getAbilityEnergyCost(ability).random ?? 0
              const randomAllocationMissing = queuedAction?.abilityId === ability.id && randomRequired > getQueuedRandomAllocated(queuedAction)
              return (
                <SkillTile
                  key={ability.id}
                  ability={ability}
                  active={pendingAbilityId === ability.id}
                  queued={queuedAction?.abilityId === ability.id}
                  locked={isLocked}
                  lockReason={isLocked ? lockReason : null}
                  cooldown={abilityCooldown}
                  queuedOrder={queuedOrder}
                  randomAllocationMissing={randomAllocationMissing}
                  onSelect={!interactionLocked && onAbilityClick ? () => onAbilityClick(ability.id) : undefined}
                  onHover={onHoverAbility ? () => onHoverAbility(ability.id) : undefined}
                  onLeave={onLeaveAbility}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
