import { type DragEvent, type TouchEvent, useMemo, useRef, useState } from 'react'
import { PASS_ABILITY_ID } from '@/features/battle/data'
import {
  battleEnergyMeta,
  battleEnergyOrder,
  canPayEnergy,
  type BattleEnergyPool,
  type BattleEnergyType,
} from '@/features/battle/energy'
import { getFighterById } from '@/features/battle/engine'
import { buildQueuePreview, type ActiveEffectInstance, type QueueOrderEntry } from '@/features/battle/queuePreview'
import type { BattleState, QueuedBattleAction } from '@/features/battle/types'
import {
  aggregateAggregateCost,
  applyRandomChange,
  canAssignRandom,
  canUndoRandom,
  computeEnergyLeft,
  distributeRandomToActors,
  emptyEnergyByType,
  sumFixedCostsByType,
  sumRequiredRandom,
  totalRandom,
  type EnergyByType,
  type PerActorRandomAllocation,
} from '@/components/battle/queueAllocation'

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Compact resource cell — small color square + short code + tabular number.
 * Mirrors the Naruto-Arena compact resource row, kept Cursed-Arena-skinned.
 */
function EnergyCell({ type, value, muted, dim }: { type: BattleEnergyType; value: number; muted?: boolean; dim?: boolean }) {
  const meta = battleEnergyMeta[type]
  return (
    <div
      className={[
        'flex items-center justify-between gap-2 border border-white/8 bg-[rgba(20,18,24,0.6)] px-1.5 py-1',
        muted ? 'opacity-45 saturate-75' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="h-2.5 w-2.5 shrink-0 rotate-45 border border-black/40" style={{ backgroundColor: meta.color }} />
        <span className="ca-mono-label text-[0.46rem] tracking-[0.1em] text-ca-text-2 truncate">{meta.short}</span>
      </div>
      <span className={['ca-display tabular-nums text-[0.95rem] leading-none', dim && value === 0 ? 'text-ca-text-3' : 'text-ca-text'].join(' ')}>
        {value}
      </span>
    </div>
  )
}

/**
 * A single draggable queue tile.  Only command and scheduled entries — the
 * two kinds the engine actually dispatches through queueOrder — are rendered
 * by the modal.  Passives and reaction guards are NOT shown here: they are
 * board-state effects, not queue-resolution entries.
 */
function QueueIcon({
  entry,
  state,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  entry: ActiveEffectInstance
  state: BattleState
  index: number
  isDragging?: boolean
  isDropTarget?: boolean
  onDragStart: () => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onTouchStart: (e: TouchEvent<HTMLDivElement>) => void
  onTouchMove: (e: TouchEvent<HTMLDivElement>) => void
  onTouchEnd: () => void
}) {
  const isEnemy = entry.ownerTeam === 'enemy'
  const actorName = getFighterById(state, entry.sourceActorId)?.shortName ?? '?'
  const targetNames = entry.targetIds
    .map((id) => getFighterById(state, id)?.shortName)
    .filter((n): n is string => Boolean(n))
  const targetLine = targetNames.length > 0 ? `→ ${targetNames.join(', ')}` : null
  const tooltip = [actorName, entry.label, entry.summary, targetLine].filter(Boolean).join(' · ')

  const kindBadge      = entry.kind === 'scheduled' ? 'SCH' : 'CMD'
  const kindBadgeColor = entry.kind === 'scheduled' ? 'text-amber-300' : 'text-ca-teal'
  const borderClass    = entry.kind === 'scheduled' ? 'border-amber-300/35' : 'border-ca-teal/35'

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        data-queue-order-index={index}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        title={tooltip}
        className={[
          'relative h-[3.15rem] w-[3.15rem] cursor-grab touch-none overflow-hidden border-2 bg-[#1e1c24] shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition',
          borderClass,
          isDragging ? 'opacity-35' : '',
          isDropTarget ? 'scale-[1.05] border-ca-red' : '',
        ].join(' ')}
      >
        {entry.sourceIcon.src ? (
          <img src={entry.sourceIcon.src} alt={entry.label} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <span className="ca-display text-[0.68rem] text-ca-text">{entry.sourceIcon.label}</span>
          </div>
        )}

        {/* Kind badge — top-left */}
        <div className="absolute left-0 top-0 bg-black/72 px-1 py-0.5">
          <span className={`ca-mono-label text-[0.32rem] ${kindBadgeColor}`}>{kindBadge}</span>
        </div>

        {/* Position number — top-right */}
        <div className="absolute right-0 top-0 bg-black/72 px-1 py-0.5">
          <span className="ca-mono-label text-[0.3rem] text-amber-300">#{index + 1}</span>
        </div>

        {/* Enemy chip — bottom-left only when enemy-owned */}
        {isEnemy ? (
          <div className="absolute bottom-0 left-0 border border-ca-red/30 bg-[rgba(250,39,66,0.15)] px-1 py-[1px]">
            <span className="ca-mono-label text-[0.3rem] text-ca-red">ENM</span>
          </div>
        ) : null}

        {/* Drag affordance */}
        <div className="absolute bottom-0 right-0 bg-black/72 px-[3px] py-[1px]">
          <span className="ca-mono-label text-[0.42rem] tracking-[0.05em] text-ca-text-2">⋮⋮</span>
        </div>
      </div>
      <p className="w-[3.15rem] truncate text-center ca-mono-label text-[0.44rem] text-ca-text-3">
        {actorName.toUpperCase()}
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function NarutoQueueCommitModal({
  round,
  state,
  queued,
  initialOrder,
  energy,
  turnSecondsLeft,
  onConfirm,
  onBack,
}: {
  round: number
  state: BattleState
  queued: Record<string, QueuedBattleAction>
  initialOrder: string[]
  energy: BattleEnergyPool
  turnSecondsLeft: number
  onConfirm: (queueOrder: QueueOrderEntry[], randomAlloc: PerActorRandomAllocation) => void
  onBack: () => void
}) {
  // ── Queue preview — only the kinds the engine actually dispatches ───────────
  // resolveInterleavedPlayerTurnTimeline handles 'command' and 'scheduled' only.
  // Passive/reaction entries (still produced by buildQueuePreview for future
  // non-queue surfaces like portrait pips) are intentionally excluded here:
  // they are board-state effects, not queue-resolution entries.
  const queueEntries = useMemo(() => buildQueuePreview(state, queued), [state, queued])
  const dispatchableEntries = useMemo(
    () => queueEntries.filter((e) => e.kind === 'command' || e.kind === 'scheduled'),
    [queueEntries],
  )

  // ── queueOrder is the canonical reorderable resolution order ───────────────
  const [queueOrder, setQueueOrder] = useState<QueueOrderEntry[]>(() => {
    const aliveIds = new Set(state.playerTeam.filter((f) => f.hp > 0).map((f) => f.instanceId))
    const queuedCmdIds = new Set(
      Object.values(queued)
        .filter((c) => c.team === 'player' && c.abilityId !== PASS_ABILITY_ID)
        .map((c) => c.actorId),
    )
    const scheduled = dispatchableEntries.filter((e) => e.kind === 'scheduled')
    const commands = dispatchableEntries.filter((e) => e.kind === 'command')
    const orderedCmdIds = [
      ...initialOrder.filter((id) => aliveIds.has(id) && queuedCmdIds.has(id)),
      ...[...queuedCmdIds].filter((id) => aliveIds.has(id) && !initialOrder.includes(id)),
    ]
    return [
      ...scheduled.map((e): QueueOrderEntry => ({ kind: 'scheduled', scheduledEffectId: e.scheduledEffectId! })),
      ...orderedCmdIds.flatMap((actorId): QueueOrderEntry[] => {
        const found = commands.find((e) => e.commandActorId === actorId)
        return found ? [{ kind: 'command', actorId }] : []
      }),
    ]
  })

  const queueRowEntries = useMemo(() => {
    const scheduledById = new Map(dispatchableEntries.filter((e) => e.kind === 'scheduled').map((e) => [e.scheduledEffectId!, e] as const))
    const commandById   = new Map(dispatchableEntries.filter((e) => e.kind === 'command'  ).map((e) => [e.commandActorId!, e]   as const))
    return queueOrder.flatMap((entry): ActiveEffectInstance[] => {
      if (entry.kind === 'scheduled') {
        const found = scheduledById.get(entry.scheduledEffectId)
        return found ? [found] : []
      }
      const found = commandById.get(entry.actorId)
      return found ? [found] : []
    })
  }, [queueOrder, dispatchableEntries])

  // ── Energy bookkeeping ─────────────────────────────────────────────────────
  const fixedByType    = useMemo(() => sumFixedCostsByType(state.playerTeam, queued), [state.playerTeam, queued])
  const requiredRandom = useMemo(() => sumRequiredRandom(state.playerTeam, queued),   [state.playerTeam, queued])

  // Manual Random Energy allocation. Starts empty (zero of each type) — never
  // auto-allocated. The player must press USE to assign each one.
  const [randomByType, setRandomByType] = useState<EnergyByType>(() => emptyEnergyByType())

  const energyLeft         = useMemo(() => computeEnergyLeft(energy, fixedByType, randomByType), [energy, fixedByType, randomByType])
  const assignedRandomTotal = totalRandom(randomByType)
  const aggregateCost      = useMemo(() => aggregateAggregateCost(fixedByType, randomByType), [fixedByType, randomByType])
  const canAfford          = canPayEnergy(energy, aggregateCost)
  const isFullyAllocated   = assignedRandomTotal === requiredRandom
  const okEnabled          = isFullyAllocated && canAfford
  const timerCritical      = turnSecondsLeft <= 10

  function handleAssign(type: BattleEnergyType, delta: 1 | -1) {
    setRandomByType((current) => applyRandomChange(current, type, delta, energy, fixedByType, requiredRandom))
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  function handleConfirm() {
    if (!okEnabled) return
    const orderedCommandActorIds = queueOrder.flatMap((e) => (e.kind === 'command' ? [e.actorId] : []))
    const perActor = distributeRandomToActors(orderedCommandActorIds, state.playerTeam, queued, randomByType)
    onConfirm(queueOrder, perActor)
  }

  // ── Drag interaction ───────────────────────────────────────────────────────
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const touchDragFromRef = useRef<number | null>(null)

  function clearDrag() {
    setDragIndex(null)
    setDragOverIndex(null)
    touchDragFromRef.current = null
  }

  function applyReorder(from: number, to: number) {
    if (from === to) return
    setQueueOrder((current) => {
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function handleDragStart(index: number) { setDragIndex(index) }

  function handleDragOver(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault()
    setDragOverIndex(index)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault()
    if (dragIndex !== null) applyReorder(dragIndex, index)
    clearDrag()
  }

  function handleTouchStart(_event: TouchEvent<HTMLDivElement>, index: number) {
    touchDragFromRef.current = index
    setDragIndex(index)
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (touchDragFromRef.current === null) return
    const point = event.touches[0]
    const tile = document.elementFromPoint(point.clientX, point.clientY)?.closest('[data-queue-order-index]')
    if (!tile) return
    const index = parseInt((tile as HTMLElement).dataset.queueOrderIndex ?? '-1', 10)
    if (index >= 0) setDragOverIndex(index)
  }

  function handleTouchEnd() {
    if (touchDragFromRef.current !== null && dragOverIndex !== null) {
      applyReorder(touchDragFromRef.current, dragOverIndex)
    }
    clearDrag()
  }

  // ── Title (rule 4: "Choose N Random Energy", no "(s)") ─────────────────────
  const title =
    requiredRandom === 0 ? 'Confirm Skills' :
    requiredRandom === 1 ? 'Choose 1 Random Energy' :
    `Choose ${requiredRandom} Random Energy`

  const allocationStatus =
    requiredRandom === 0
      ? canAfford ? 'READY TO COMMIT' : 'CANNOT AFFORD THIS QUEUE'
      : isFullyAllocated
        ? canAfford ? 'READY TO COMMIT' : 'CANNOT AFFORD THIS QUEUE'
        : `${requiredRandom - assignedRandomTotal} RANDOM ENERGY REMAINING`

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.72)] px-3 backdrop-blur-[2px] animate-ca-fade-in">
      <div className="relative w-full max-w-[34rem] overflow-hidden border border-white/14 bg-[linear-gradient(180deg,#302e3a,#17151c)] shadow-[0_24px_70px_rgba(0,0,0,0.62)] animate-ca-slide-up">
        {/* ── Header — single line, compact ── */}
        <header className="flex items-center justify-between gap-2 border-b border-black/30 bg-[linear-gradient(180deg,rgba(130,45,51,0.95),rgba(88,32,38,0.98))] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <span className="ca-mono-label shrink-0 text-[0.5rem] tracking-[0.14em] text-white/65">R{round}</span>
          <h2 className="ca-display truncate text-[1.2rem] leading-none tracking-[0.04em] text-white">{title}</h2>
          <span className={['ca-mono-label shrink-0 tabular-nums text-[0.5rem] tracking-[0.14em]', timerCritical ? 'text-ca-red' : 'text-white/65'].join(' ')}>
            {String(turnSecondsLeft).padStart(2, '0')}S
          </span>
        </header>

        <div className="relative bg-[linear-gradient(135deg,rgba(228,218,191,0.07),rgba(255,255,255,0.015))] p-2.5">
          {/* Caption — fixed costs reserved hint */}
          <p className="mb-2 ca-mono-label text-center text-[0.46rem] tracking-[0.12em] text-ca-text-3">
            {requiredRandom > 0
              ? 'FIXED COSTS RESERVED — ASSIGN RANDOM ENERGY BELOW'
              : 'FIXED COSTS RESERVED'}
          </p>

          {/* ── Compact Energy panels (LEFT / CONTROLS / RIGHT) ── */}
          <div className="grid gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_8.5rem]">
            {/* LEFT — Energy Left */}
            <section>
              <p className="mb-1 ca-mono-label text-[0.46rem] tracking-[0.14em] text-ca-text-3">ENERGY LEFT</p>
              <div className="space-y-1">
                {battleEnergyOrder.map((type) => (
                  <EnergyCell key={type} type={type} value={energyLeft[type]} muted={energyLeft[type] <= 0} />
                ))}
              </div>
            </section>

            {/* MIDDLE — compact +/- per type */}
            <section className="flex flex-col gap-1 pt-[1.05rem]">
              {battleEnergyOrder.map((type) => {
                const meta        = battleEnergyMeta[type]
                const useEnabled  = canAssignRandom(type, energyLeft, requiredRandom, assignedRandomTotal)
                const undoEnabled = canUndoRandom(type, randomByType)
                return (
                  <div key={type} className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAssign(type, -1)}
                      disabled={!undoEnabled}
                      title={`Remove 1 ${meta.label} from Random Energy`}
                      aria-label={`Remove ${meta.label}`}
                      className="ca-display grid h-6 w-6 place-items-center border border-black/40 bg-[rgba(228,230,239,0.92)] text-[0.95rem] leading-none text-[#17151c] shadow-[inset_0_2px_0_rgba(255,255,255,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      −
                    </button>
                    <span
                      className="ca-mono-label inline-block w-12 text-center text-[0.46rem] tracking-[0.1em]"
                      style={{ color: meta.color }}
                    >
                      {meta.short}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAssign(type, 1)}
                      disabled={!useEnabled}
                      title={`Assign 1 ${meta.label} as Random Energy`}
                      aria-label={`Assign ${meta.label}`}
                      className="ca-display grid h-6 w-6 place-items-center border border-black/40 bg-[rgba(228,230,239,0.92)] text-[0.95rem] leading-none text-[#17151c] shadow-[inset_0_2px_0_rgba(255,255,255,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                )
              })}
            </section>

            {/* RIGHT — Random Energy assigned */}
            <section>
              <p className="mb-1 ca-mono-label text-[0.46rem] tracking-[0.14em] text-ca-text-3">RANDOM ENERGY</p>
              <div className="space-y-1">
                {battleEnergyOrder.map((type) => (
                  <EnergyCell key={type} type={type} value={randomByType[type]} dim />
                ))}
              </div>
            </section>
          </div>

          {/* ── Allocation status — single line ── */}
          <p className={['mt-2 ca-mono-label text-center text-[0.5rem] tracking-[0.12em]', okEnabled ? 'text-ca-teal' : 'text-ca-red'].join(' ')}>
            {allocationStatus}
          </p>

          {/* ── Queue strip ── */}
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="ca-mono-label text-[0.46rem] tracking-[0.14em] text-ca-text-3">QUEUE — RESOLVES LEFT TO RIGHT</p>
            <p className="ca-mono-label text-[0.42rem] tracking-[0.1em] text-ca-text-3">
              {queueRowEntries.length > 0 ? 'DRAG TO REORDER' : 'NO ACTIONS'}
            </p>
          </div>
          <div className="mt-1 flex min-h-[3.6rem] items-end gap-1.5 overflow-x-auto border-t border-white/8 pt-1.5 pb-0.5">
            {/* Selected commands and due scheduled effects only — passive and
                reaction effects belong on portrait pips, not the queue. */}
            {queueRowEntries.map((entry, i) => (
              <QueueIcon
                key={entry.id}
                entry={entry}
                state={state}
                index={i}
                isDragging={dragIndex === i}
                isDropTarget={dragOverIndex === i && dragIndex !== i}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={clearDrag}
                onTouchStart={(e) => handleTouchStart(e, i)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
            ))}
          </div>

          {/* ── OK / CANCEL ── */}
          <div className="mt-2.5 grid grid-cols-[1fr_1fr] gap-2">
            <button
              type="button"
              disabled={!okEnabled}
              onClick={handleConfirm}
              className="ca-display border border-ca-red/45 bg-ca-red px-3 py-1.5 text-[1rem] tracking-[0.05em] text-white shadow-[0_0_18px_rgba(250,39,66,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onBack}
              className="ca-display border border-white/14 bg-[rgba(255,255,255,0.08)] px-3 py-1.5 text-[1rem] tracking-[0.05em] text-ca-text transition hover:border-ca-teal/35 hover:text-ca-teal"
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
