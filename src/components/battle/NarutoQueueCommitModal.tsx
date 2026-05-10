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

function EnergyRow({ type, value, muted }: { type: BattleEnergyType; value: number; muted?: boolean }) {
  const meta = battleEnergyMeta[type]
  return (
    <div
      className={[
        'relative grid grid-cols-[2.4rem_minmax(0,1fr)_1.6rem] items-center gap-2 border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] px-2 py-1.5',
        muted ? 'opacity-45 saturate-75' : '',
      ].join(' ')}
    >
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: meta.color }} />
      <div className="relative grid h-9 w-9 place-items-center pl-1">
        <div
          className="absolute inset-1 rotate-45 border-2 bg-[rgba(228,230,239,0.92)]"
          style={{ borderColor: meta.color }}
        />
        <span className="relative ca-display text-[1rem] leading-none text-[#17151c]">{value}</span>
      </div>
      <p className="ca-display truncate text-[0.95rem] leading-none text-ca-text">{meta.label}</p>
      <span className="ca-mono-label text-[0.42rem] tracking-[0.12em] text-ca-text-3">{meta.short}</span>
    </div>
  )
}

function QueueIcon({
  entry,
  state,
  index,
  draggable: isDraggable,
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
  draggable: boolean
  isDragging?: boolean
  isDropTarget?: boolean
  onDragStart?: () => void
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void
  onDrop?: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: () => void
  onTouchStart?: (e: TouchEvent<HTMLDivElement>) => void
  onTouchMove?: (e: TouchEvent<HTMLDivElement>) => void
  onTouchEnd?: () => void
}) {
  const isEnemy = entry.ownerTeam === 'enemy'
  const actorName = getFighterById(state, entry.sourceActorId)?.shortName ?? '?'
  const targetNames = entry.targetIds
    .map((id) => getFighterById(state, id)?.shortName)
    .filter((n): n is string => Boolean(n))
  const targetLine = targetNames.length > 0 ? `→ ${targetNames.join(', ')}` : null
  const fixedHint = !isDraggable
    ? entry.kind === 'reaction'
      ? 'Triggers reactively'
      : entry.timing === 'preTurn'
        ? 'Auto-resolves before actions'
        : 'Auto-resolves'
    : null
  const tooltip = [actorName, entry.label, entry.summary, targetLine, fixedHint].filter(Boolean).join(' · ')

  const kindBadge =
    entry.kind === 'scheduled' ? 'SCH' :
    entry.kind === 'reaction'  ? 'REACT' :
    entry.kind === 'command'   ? 'CMD' : 'PASS'

  const kindBadgeColor =
    entry.kind === 'scheduled' ? 'text-amber-300' :
    entry.kind === 'reaction'  ? 'text-ca-red'    :
    entry.kind === 'command'   ? 'text-ca-teal'   : 'text-ca-teal'

  // Border colour communicates source-owned identity even when fixed.
  const borderClass = isDraggable
    ? entry.kind === 'scheduled' ? 'border-amber-300/35' : 'border-ca-teal/35'
    : entry.kind === 'reaction' ? 'border-ca-red/35' : 'border-white/15'

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        data-queue-order-index={isDraggable ? index : undefined}
        draggable={isDraggable}
        onDragStart={isDraggable ? onDragStart : undefined}
        onDragOver={isDraggable ? onDragOver : undefined}
        onDrop={isDraggable ? onDrop : undefined}
        onDragEnd={isDraggable ? onDragEnd : undefined}
        onTouchStart={isDraggable ? onTouchStart : undefined}
        onTouchMove={isDraggable ? onTouchMove : undefined}
        onTouchEnd={isDraggable ? onTouchEnd : undefined}
        title={tooltip}
        className={[
          'relative h-[3.15rem] w-[3.15rem] overflow-hidden border-2 bg-[#1e1c24] shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition',
          borderClass,
          isDraggable ? 'cursor-grab touch-none' : 'cursor-default opacity-70',
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

        {/* Drag affordance for reorderable icons */}
        {isDraggable ? (
          <div className="absolute bottom-0 right-0 bg-black/72 px-[3px] py-[1px]">
            <span className="ca-mono-label text-[0.42rem] tracking-[0.05em] text-ca-text-2">⋮⋮</span>
          </div>
        ) : null}
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
  // ── Queue preview — single source of truth, mixed display order ─────────────
  const queueEntries = useMemo(() => buildQueuePreview(state, queued), [state, queued])

  // Fixed (locked) entries appear first — passives, then reactions. They are
  // source-owned skill icons, NOT a separate report. They stay in the same
  // strip as commands so the player sees one continuous resolution order.
  const fixedEntries = useMemo(
    () => queueEntries.filter((e) => e.kind === 'passive' || e.kind === 'reaction'),
    [queueEntries],
  )
  const reorderableEntries = useMemo(
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
    const scheduled = reorderableEntries.filter((e) => e.kind === 'scheduled')
    const commands = reorderableEntries.filter((e) => e.kind === 'command')
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

  const orderedReorderableEntries = useMemo(() => {
    const scheduledById = new Map(reorderableEntries.filter((e) => e.kind === 'scheduled').map((e) => [e.scheduledEffectId!, e] as const))
    const commandById   = new Map(reorderableEntries.filter((e) => e.kind === 'command'  ).map((e) => [e.commandActorId!, e]   as const))
    return queueOrder.flatMap((entry): ActiveEffectInstance[] => {
      if (entry.kind === 'scheduled') {
        const found = scheduledById.get(entry.scheduledEffectId)
        return found ? [found] : []
      }
      const found = commandById.get(entry.actorId)
      return found ? [found] : []
    })
  }, [queueOrder, reorderableEntries])

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
      <div className="relative w-full max-w-[39rem] overflow-hidden border border-white/14 bg-[linear-gradient(180deg,#302e3a,#17151c)] shadow-[0_24px_70px_rgba(0,0,0,0.62)] animate-ca-slide-up">
        {/* ── Header ── */}
        <header className="border-b border-black/30 bg-[linear-gradient(180deg,rgba(130,45,51,0.95),rgba(88,32,38,0.98))] px-4 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <span className="ca-mono-label text-[0.52rem] tracking-[0.14em] text-white/65">ROUND {round}</span>
            <h2 className="ca-display text-[1.55rem] leading-none tracking-[0.06em] text-white">{title}</h2>
            <span className={['ca-mono-label text-[0.52rem] tracking-[0.14em]', timerCritical ? 'text-ca-red' : 'text-white/65'].join(' ')}>
              {String(turnSecondsLeft).padStart(2, '0')}S
            </span>
          </div>
          {requiredRandom > 0 ? (
            <p className="mt-1 ca-mono-label text-[0.48rem] tracking-[0.14em] text-white/55">
              FIXED COSTS ALREADY RESERVED — ASSIGN THE RANDOM SLOTS BELOW
            </p>
          ) : (
            <p className="mt-1 ca-mono-label text-[0.48rem] tracking-[0.14em] text-white/55">
              FIXED COSTS ALREADY RESERVED
            </p>
          )}
        </header>

        <div className="relative bg-[linear-gradient(135deg,rgba(228,218,191,0.1),rgba(255,255,255,0.02))] p-3">
          {/* ── Energy panels (LEFT / CONTROLS / RIGHT) ── */}
          <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_12rem]">
            {/* LEFT — Energy Left after fixed + manual deductions */}
            <section className="border border-black/35 bg-[rgba(18,15,16,0.42)] p-1.5">
              <p className="mb-1 bg-[rgba(130,45,51,0.92)] px-2 py-1 ca-display text-[1.05rem] leading-none text-white">Energy Left</p>
              <div className="space-y-1.5">
                {battleEnergyOrder.map((type) => (
                  <EnergyRow key={type} type={type} value={energyLeft[type]} muted={energyLeft[type] <= 0} />
                ))}
              </div>
            </section>

            {/* MIDDLE — USE / UNDO controls per type */}
            <section className="flex flex-col justify-center gap-3 py-2">
              {battleEnergyOrder.map((type) => {
                const useEnabled  = canAssignRandom(type, energyLeft, requiredRandom, assignedRandomTotal)
                const undoEnabled = canUndoRandom(type, randomByType)
                return (
                  <div key={type} className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleAssign(type, 1)}
                      disabled={!useEnabled}
                      title={`Assign 1 ${battleEnergyMeta[type].label} as Random Energy`}
                      className="ca-display border border-black/40 bg-[rgba(228,230,239,0.9)] px-2 py-2 text-[1.08rem] leading-none text-[#17151c] shadow-[inset_0_3px_0_rgba(255,255,255,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
                      style={{ borderLeft: `5px solid ${battleEnergyMeta[type].color}` }}
                    >
                      USE
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAssign(type, -1)}
                      disabled={!undoEnabled}
                      title={`Remove 1 ${battleEnergyMeta[type].label} from Random Energy`}
                      className="ca-display border border-black/40 bg-[rgba(228,230,239,0.9)] px-2 py-2 text-[1.08rem] leading-none text-[#17151c] shadow-[inset_0_3px_0_rgba(255,255,255,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
                      style={{ borderRight: `5px solid ${battleEnergyMeta[type].color}` }}
                    >
                      UNDO
                    </button>
                  </div>
                )
              })}

              <div className="mt-1 border border-white/10 bg-[rgba(13,12,17,0.58)] px-2 py-2 text-center">
                <p className={['ca-mono-label text-[0.54rem] tracking-[0.12em]', okEnabled ? 'text-ca-teal' : 'text-ca-red'].join(' ')}>
                  {allocationStatus}
                </p>
              </div>
            </section>

            {/* RIGHT — Random Energy currently assigned */}
            <section className="border border-black/35 bg-[rgba(18,15,16,0.42)] p-1.5">
              <p className="mb-1 bg-[rgba(130,45,51,0.92)] px-2 py-1 ca-display text-[1.05rem] leading-none text-white">Random Energy</p>
              <div className="space-y-1.5">
                {battleEnergyOrder.map((type) => (
                  <EnergyRow key={type} type={type} value={randomByType[type]} />
                ))}
              </div>
            </section>
          </div>

          {/* ── Single continuous queue strip ── */}
          <section className="mt-3 border border-black/35 bg-[rgba(13,12,17,0.7)] p-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="ca-mono-label text-[0.5rem] tracking-[0.14em] text-ca-text-3">QUEUE — RESOLVES LEFT TO RIGHT</p>
              <p className="ca-mono-label text-[0.46rem] tracking-[0.1em] text-ca-text-3">
                {orderedReorderableEntries.length > 0 ? 'DRAG TO REORDER' : fixedEntries.length > 0 ? 'AUTO-RESOLVES' : 'NO ACTIONS'}
              </p>
            </div>

            <div className="flex items-end gap-2 overflow-x-auto pb-1">
              {/* Fixed source-owned icons (passives + active reactions) — same strip,
                  not a separate section. They render with the same kind badge and
                  borders as draggable icons; only the drag handle differs. */}
              {fixedEntries.map((entry, i) => (
                <QueueIcon
                  key={entry.id}
                  entry={entry}
                  state={state}
                  index={i}
                  draggable={false}
                />
              ))}

              {/* Reorderable scheduled + command icons — one continuous segment. */}
              {orderedReorderableEntries.map((entry, i) => {
                const index = fixedEntries.length + i
                return (
                  <QueueIcon
                    key={entry.id}
                    entry={entry}
                    state={state}
                    index={index}
                    draggable
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
                )
              })}
            </div>
          </section>

          {/* ── OK / CANCEL ── */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!okEnabled}
              onClick={handleConfirm}
              className="ca-display border border-ca-red/45 bg-ca-red px-4 py-2.5 text-[1.1rem] tracking-[0.05em] text-white shadow-[0_0_24px_rgba(250,39,66,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onBack}
              className="ca-display border border-white/14 bg-[rgba(255,255,255,0.08)] px-4 py-2.5 text-[1.1rem] tracking-[0.05em] text-ca-text transition hover:border-ca-teal/35 hover:text-ca-teal"
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
