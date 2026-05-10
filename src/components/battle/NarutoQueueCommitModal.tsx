import { type DragEvent, type TouchEvent, useMemo, useRef, useState } from 'react'
import { getCommandSummary } from '@/components/battle/battleDisplay'
import { PASS_ABILITY_ID } from '@/features/battle/data'
import {
  battleEnergyMeta,
  battleEnergyOrder,
  canPayEnergy,
  getAbilityEnergyCost,
  getEnergyCount,
  sumEnergyCosts,
  type BattleEnergyCost,
  type BattleEnergyPool,
  type BattleEnergyType,
} from '@/features/battle/energy'
import { getFighterById } from '@/features/battle/engine'
import { buildQueuePreview, type ActiveEffectInstance, type QueueOrderEntry } from '@/features/battle/queuePreview'
import type { BattleFighterState, BattleState, QueuedBattleAction } from '@/features/battle/types'

// ── Energy allocation helpers ─────────────────────────────────────────────────

type RandomAllocation = Record<string, Partial<Record<BattleEnergyType, number>>>
type EnergyAllocation = Partial<Record<BattleEnergyType, number>>

type QueueRow = {
  fighter: BattleFighterState
  abilityName: string
  iconSrc?: string
  cost: BattleEnergyCost
  isPass: boolean
  summary: string
}

function resolveRandomCost(cost: BattleEnergyCost, allocation: EnergyAllocation) {
  if (!cost.random) return cost

  const resolved: BattleEnergyCost = { ...cost }
  delete resolved.random
  for (const type of battleEnergyOrder) {
    const amount = allocation[type] ?? 0
    if (amount > 0) resolved[type] = (resolved[type] ?? 0) + amount
  }
  return resolved
}

function sumAllocation(allocation: EnergyAllocation) {
  return battleEnergyOrder.reduce((sum, type) => sum + (allocation[type] ?? 0), 0)
}

function buildDefaultGlobalAllocation(rows: QueueRow[], energy: BattleEnergyPool): EnergyAllocation {
  const allocation: EnergyAllocation = {}
  const remainingPool = { ...energy.amounts }

  for (const row of rows) {
    if (row.isPass) continue

    for (const type of battleEnergyOrder) {
      remainingPool[type] = Math.max(0, remainingPool[type] - (row.cost[type] ?? 0))
    }

    let randomNeeded = row.cost.random ?? 0
    const sorted = [...battleEnergyOrder].sort((left, right) => remainingPool[right] - remainingPool[left])

    for (const type of sorted) {
      if (randomNeeded <= 0) break
      const take = Math.min(remainingPool[type], randomNeeded)
      if (take <= 0) continue
      allocation[type] = (allocation[type] ?? 0) + take
      remainingPool[type] -= take
      randomNeeded -= take
    }
  }

  return allocation
}

function distributeGlobalAllocation(rows: QueueRow[], globalAllocation: EnergyAllocation): RandomAllocation {
  const remaining = { ...globalAllocation }
  const allocation: RandomAllocation = {}

  for (const row of rows) {
    const randomNeeded = row.cost.random ?? 0
    if (row.isPass || randomNeeded <= 0) continue

    let left = randomNeeded
    const actorAllocation: EnergyAllocation = {}

    for (const type of battleEnergyOrder) {
      if (left <= 0) break
      const take = Math.min(remaining[type] ?? 0, left)
      if (take <= 0) continue
      actorAllocation[type] = take
      remaining[type] = (remaining[type] ?? 0) - take
      left -= take
    }

    if (sumAllocation(actorAllocation) > 0) allocation[row.fighter.instanceId] = actorAllocation
  }

  return allocation
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EnergyDiamond({ value, color }: { value: number; color: string }) {
  return (
    <div className="relative grid h-10 w-10 shrink-0 place-items-center">
      <div
        className="absolute inset-1 rotate-45 border-2 bg-[rgba(228,230,239,0.92)] shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
        style={{ borderColor: color }}
      />
      <span className="relative ca-display text-[1.15rem] leading-none text-[#17151c]">{value}</span>
    </div>
  )
}

function EnergyPanel({
  title,
  type,
  value,
  muted = false,
}: {
  title: string
  type: BattleEnergyType
  value: number
  muted?: boolean
}) {
  const meta = battleEnergyMeta[type]

  return (
    <div
      className={[
        'relative h-[4.75rem] overflow-hidden border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] px-2 py-1.5',
        muted ? 'opacity-45 saturate-75' : '',
      ].join(' ')}
    >
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: meta.color }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_25%,rgba(255,255,255,0.1),transparent_44%)]" />
      <div className="relative grid h-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 pl-1.5">
        <EnergyDiamond value={value} color={meta.color} />
        <div className="min-w-0">
          <p className="ca-display truncate text-[1.05rem] leading-none text-ca-text">{meta.label}</p>
          <p className="ca-mono-label mt-1 text-[0.42rem] tracking-[0.12em] text-ca-text-3">{title}</p>
        </div>
      </div>
    </div>
  )
}

// Tile for ActiveEffectInstance entries — covers draggable (command/scheduled) and locked (passive/reaction) tiles.
function ActiveEffectTile({
  entry,
  state,
  draggable: isDraggable,
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
  draggable: boolean
  index: number
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
  const kindBadge = entry.kind === 'scheduled' ? 'SCH' : entry.kind === 'reaction' ? 'REACT' : entry.kind === 'command' ? 'CMD' : 'PASS'
  const kindBadgeColor = entry.kind === 'scheduled' ? 'text-amber-300' : entry.kind === 'reaction' ? 'text-ca-red' : entry.kind === 'command' ? 'text-ca-teal' : 'text-ca-teal'
  const teamColor = isEnemy ? 'text-ca-red' : 'text-ca-teal'
  const teamBg = isEnemy
    ? 'border-ca-red/30 bg-[rgba(250,39,66,0.12)]'
    : 'border-ca-teal/30 bg-ca-teal-wash/60'

  const actorName = getFighterById(state, entry.sourceActorId)?.shortName ?? '?'
  const targetNames = entry.targetIds
    .map((id) => getFighterById(state, id)?.shortName)
    .filter((n): n is string => Boolean(n))
  const targetLine = targetNames.length > 0 ? `→ ${targetNames.join(', ')}` : null
  const tooltip = [actorName, entry.label, entry.summary, targetLine].filter(Boolean).join(' · ')

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
          'relative h-[3.15rem] w-[3.15rem] overflow-hidden border-2 bg-[#1e1c24] shadow-[0_4px_10px_rgba(0,0,0,0.28)] transition',
          isDraggable
            ? 'cursor-grab touch-none border-ca-teal/35 shadow-[0_6px_14px_rgba(0,0,0,0.3)]'
            : 'cursor-default border-white/12 opacity-55 saturate-50',
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
        {/* Team chip — bottom-left */}
        <div className={`absolute bottom-0 left-0 border px-1 py-[1px] ${teamBg}`}>
          <span className={`ca-mono-label text-[0.3rem] ${teamColor}`}>{isEnemy ? 'ENM' : 'ALY'}</span>
        </div>
        {/* Position number for reorderable entries */}
        {isDraggable ? (
          <div className="absolute right-0 top-0 bg-black/72 px-1 py-0.5">
            <span className="ca-mono-label text-[0.3rem] text-amber-300">#{index + 1}</span>
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
  onConfirm: (queueOrder: QueueOrderEntry[], randomAlloc: RandomAllocation) => void
  onBack: () => void
}) {
  // ── Queue preview ─────────────────────────────────────────────────────────
  const queueEntries = useMemo(() => buildQueuePreview(state, queued), [state, queued])
  const passiveEntries = useMemo(() => queueEntries.filter((e) => e.kind === 'passive'), [queueEntries])
  const reactionEntries = useMemo(() => queueEntries.filter((e) => e.kind === 'reaction'), [queueEntries])
  const draggableEntries = useMemo(() => queueEntries.filter((e) => e.kind === 'scheduled' || e.kind === 'command'), [queueEntries])

  // ── Unified queue order state ─────────────────────────────────────────────
  // Initialize from initialOrder for commands; scheduled effects appear first by default.
  const [queueOrder, setQueueOrder] = useState<QueueOrderEntry[]>(() => {
    const aliveIds = new Set(state.playerTeam.filter((f) => f.hp > 0).map((f) => f.instanceId))
    const queuedCommandIds = new Set(
      Object.values(queued)
        .filter((cmd) => cmd.team === 'player' && cmd.abilityId !== PASS_ABILITY_ID)
        .map((cmd) => cmd.actorId),
    )

    const scheduledEntries = draggableEntries.filter((e) => e.kind === 'scheduled')
    const commandEntries = draggableEntries.filter((e) => e.kind === 'command')

    // Respect initialOrder for commands; scheduled entries appear before commands
    const orderedCommandIds = [
      ...initialOrder.filter((id) => aliveIds.has(id) && queuedCommandIds.has(id)),
      ...[...queuedCommandIds].filter((id) => aliveIds.has(id) && !initialOrder.includes(id)),
    ]

    const result: QueueOrderEntry[] = [
      ...scheduledEntries.map((e): QueueOrderEntry => ({ kind: 'scheduled', scheduledEffectId: e.scheduledEffectId! })),
      ...orderedCommandIds.flatMap((actorId): QueueOrderEntry[] => {
        const entry = commandEntries.find((e) => e.commandActorId === actorId)
        return entry ? [{ kind: 'command', actorId }] : []
      }),
    ]
    return result
  })

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const touchDragFromRef = useRef<number | null>(null)

  // Derive the ordered draggable entries for rendering from queueOrder
  const orderedDraggableEntries = useMemo(() => {
    const scheduledById = new Map(
      draggableEntries
        .filter((e) => e.kind === 'scheduled')
        .map((e) => [e.scheduledEffectId!, e]),
    )
    const commandByActorId = new Map(
      draggableEntries
        .filter((e) => e.kind === 'command')
        .map((e) => [e.commandActorId!, e]),
    )

    return queueOrder.flatMap((entry): ActiveEffectInstance[] => {
      if (entry.kind === 'scheduled') {
        const found = scheduledById.get(entry.scheduledEffectId)
        return found ? [found] : []
      }
      const found = commandByActorId.get(entry.actorId)
      return found ? [found] : []
    })
  }, [queueOrder, draggableEntries])

  const hasAutoEntries = passiveEntries.length > 0 || reactionEntries.length > 0
  const hasDraggableEntries = orderedDraggableEntries.length > 0

  // ── Command rows (for energy calculation) ────────────────────────────────
  const rows = useMemo(() => {
    const rowMap = new Map(
      state.playerTeam.flatMap((fighter) => {
        const command = queued[fighter.instanceId]
        const ability = command
          ? (fighter.abilities.concat(fighter.ultimate)).find((a) => a.id === command.abilityId) ?? null
          : null
        const isPass = !ability || ability.id === PASS_ABILITY_ID
        if (isPass) return []

        return [[fighter.instanceId, {
          fighter,
          abilityName: ability.name,
          iconSrc: ability.icon.src,
          cost: getAbilityEnergyCost(ability),
          isPass,
          summary: getCommandSummary(state, command),
        } satisfies QueueRow]]
      }),
    )

    // Order by queueOrder's command entries
    const orderedIds = queueOrder.flatMap((e) => e.kind === 'command' ? [e.actorId] : [])
    const result = orderedIds.flatMap((id) => {
      const row = rowMap.get(id)
      return row ? [row] : []
    })
    // Append any queued commands not in queueOrder
    rowMap.forEach((row, id) => {
      if (!orderedIds.includes(id)) result.push(row)
    })
    return result
  }, [queueOrder, queued, state])

  const activeRows = useMemo(() => rows.filter((row) => !row.isPass), [rows])
  const totalRandomNeeded = activeRows.reduce((sum, row) => sum + (row.cost.random ?? 0), 0)
  const [globalAllocation, setGlobalAllocation] = useState<EnergyAllocation>(() => buildDefaultGlobalAllocation(rows, energy))

  const fixedSpendByType = useMemo(
    () =>
      Object.fromEntries(
        battleEnergyOrder.map((type) => [
          type,
          activeRows.reduce((sum, row) => sum + (row.cost[type] ?? 0), 0),
        ]),
      ) as Record<BattleEnergyType, number>,
    [activeRows],
  )

  const totalAllocated = sumAllocation(globalAllocation)
  const hasUnallocated = totalRandomNeeded > 0 && totalAllocated < totalRandomNeeded
  const perActorAlloc = useMemo(
    () => distributeGlobalAllocation(activeRows, globalAllocation),
    [activeRows, globalAllocation],
  )
  const aggregateCost = sumEnergyCosts(
    activeRows.map((row) => resolveRandomCost(row.cost, perActorAlloc[row.fighter.instanceId] ?? {})),
  )
  const canAfford = canPayEnergy(energy, aggregateCost)
  const timerCritical = turnSecondsLeft <= 10

  // ── Unified drag handlers ─────────────────────────────────────────────────
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

  // ── Energy allocation ─────────────────────────────────────────────────────
  function adjustGlobalAllocation(type: BattleEnergyType, delta: number) {
    setGlobalAllocation((current) => {
      const currentValue = current[type] ?? 0

      if (delta < 0) {
        if (currentValue <= 0) return current
        const next = { ...current }
        if (currentValue === 1) delete next[type]
        else next[type] = currentValue - 1
        return next
      }

      if (totalAllocated >= totalRandomNeeded) return current
      const available = getEnergyCount(energy, type) - fixedSpendByType[type] - currentValue
      if (available <= 0) return current

      return { ...current, [type]: currentValue + 1 }
    })
  }

  // ── Hint text ─────────────────────────────────────────────────────────────
  const stripHint = (() => {
    if (hasDraggableEntries) return 'DRAG TO REORDER'
    if (hasAutoEntries) return 'LOCKED'
    return 'NO ACTIONS'
  })()

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.72)] px-3 backdrop-blur-[2px] animate-ca-fade-in">
      <div className="relative w-full max-w-[39rem] overflow-hidden border border-white/14 bg-[linear-gradient(180deg,#302e3a,#17151c)] shadow-[0_24px_70px_rgba(0,0,0,0.62)] animate-ca-slide-up">
        <header className="border-b border-black/30 bg-[linear-gradient(180deg,rgba(130,45,51,0.95),rgba(88,32,38,0.98))] px-4 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <span className="ca-mono-label text-[0.52rem] tracking-[0.14em] text-white/65">ROUND {round}</span>
            <h2 className="ca-display text-[1.55rem] leading-none tracking-[0.06em] text-white">
              {totalRandomNeeded > 0 ? `Choose ${totalRandomNeeded} Random Energy${totalRandomNeeded === 1 ? '' : '(s)'}` : 'Confirm Skills'}
            </h2>
            <span className={['ca-mono-label text-[0.52rem] tracking-[0.14em]', timerCritical ? 'text-ca-red' : 'text-white/65'].join(' ')}>
              {String(turnSecondsLeft).padStart(2, '0')}S
            </span>
          </div>
        </header>

        <div className="relative bg-[linear-gradient(135deg,rgba(228,218,191,0.1),rgba(255,255,255,0.02))] p-3">
          {/* ── Energy allocation grid ── */}
          <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_12rem]">
            <section className="border border-black/35 bg-[rgba(18,15,16,0.42)] p-1.5">
              <p className="mb-1 bg-[rgba(130,45,51,0.92)] px-2 py-1 ca-display text-[1.05rem] leading-none text-white">Energy Pool</p>
              <div className="space-y-1.5">
                {battleEnergyOrder.map((type) => {
                  const left = Math.max(0, getEnergyCount(energy, type) - fixedSpendByType[type] - (globalAllocation[type] ?? 0))
                  return <EnergyPanel key={type} title="AVAILABLE" type={type} value={left} muted={left <= 0} />
                })}
              </div>
            </section>

            <section className="flex flex-col justify-center gap-3 py-2">
              {battleEnergyOrder.map((type) => {
                const available = getEnergyCount(energy, type) - fixedSpendByType[type] - (globalAllocation[type] ?? 0)
                const canUse = totalAllocated < totalRandomNeeded && available > 0
                const canUndo = (globalAllocation[type] ?? 0) > 0

                return (
                  <div key={type} className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => adjustGlobalAllocation(type, 1)}
                      disabled={!canUse}
                      className="ca-display border border-black/40 bg-[rgba(228,230,239,0.9)] px-2 py-2 text-[1.08rem] leading-none text-[#17151c] shadow-[inset_0_3px_0_rgba(255,255,255,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
                      style={{ borderLeft: `5px solid ${battleEnergyMeta[type].color}` }}
                    >
                      USE
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustGlobalAllocation(type, -1)}
                      disabled={!canUndo}
                      className="ca-display border border-black/40 bg-[rgba(228,230,239,0.9)] px-2 py-2 text-[1.08rem] leading-none text-[#17151c] shadow-[inset_0_3px_0_rgba(255,255,255,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
                      style={{ borderRight: `5px solid ${battleEnergyMeta[type].color}` }}
                    >
                      UNDO
                    </button>
                  </div>
                )
              })}

              <div className="mt-1 border border-white/10 bg-[rgba(13,12,17,0.58)] px-2 py-2 text-center">
                <p className={['ca-mono-label text-[0.54rem] tracking-[0.12em]', hasUnallocated || !canAfford ? 'text-ca-red' : 'text-ca-teal'].join(' ')}>
                  {hasUnallocated
                    ? `${totalRandomNeeded - totalAllocated} RANDOM ENERGY REMAINING`
                    : !canAfford
                      ? 'CANNOT AFFORD THIS QUEUE'
                      : 'READY TO COMMIT'}
                </p>
              </div>
            </section>

            <section className="border border-black/35 bg-[rgba(18,15,16,0.42)] p-1.5">
              <p className="mb-1 bg-[rgba(130,45,51,0.92)] px-2 py-1 ca-display text-[1.05rem] leading-none text-white">Your Energy Spent</p>
              <div className="space-y-1.5">
                {battleEnergyOrder.map((type) => (
                  <EnergyPanel key={type} title="SPENT" type={type} value={(globalAllocation[type] ?? 0) + fixedSpendByType[type]} />
                ))}
              </div>
            </section>
          </div>

          {/* ── Unified resolution queue strip ── */}
          <section className="mt-3 border border-black/35 bg-[rgba(13,12,17,0.7)] p-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="ca-mono-label text-[0.5rem] tracking-[0.14em] text-ca-text-3">RESOLVES IN ORDER →</p>
              <p className="ca-mono-label text-[0.46rem] tracking-[0.1em] text-ca-text-3">{stripHint}</p>
            </div>

            <div className="flex items-end gap-2 overflow-x-auto pb-1">
              {/* Locked passive tiles — always before draggable strip */}
              {passiveEntries.map((entry) => (
                <ActiveEffectTile
                  key={entry.id}
                  entry={entry}
                  state={state}
                  draggable={false}
                  index={0}
                />
              ))}

              {/* Locked reaction tiles */}
              {reactionEntries.map((entry) => (
                <ActiveEffectTile
                  key={entry.id}
                  entry={entry}
                  state={state}
                  draggable={false}
                  index={0}
                />
              ))}

              {/* Divider — only when locked entries and draggable entries both exist */}
              {hasAutoEntries && hasDraggableEntries ? (
                <div className="flex shrink-0 flex-col items-center gap-1 self-stretch">
                  <div className="flex-1" />
                  <div className="mx-1 h-8 w-px self-center bg-white/15" />
                  <p className="ca-mono-label text-[0.38rem] text-ca-text-3">DRAG</p>
                  <p className="ca-mono-label text-[0.38rem] text-ca-text-3">ZONE</p>
                </div>
              ) : null}

              {/* Single unified draggable strip (scheduled + commands interleaved) */}
              {orderedDraggableEntries.map((entry, index) => {
                const isCmd = entry.kind === 'command'
                const actorId = isCmd ? entry.commandActorId : undefined
                const row = actorId ? rows.find((r) => r.fighter.instanceId === actorId) : undefined
                const resolvedCost = row ? resolveRandomCost(row.cost, perActorAlloc[row.fighter.instanceId] ?? {}) : null

                return (
                  <div key={entry.id} className="flex shrink-0 flex-col items-center gap-1">
                    <div
                      data-queue-order-index={index}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(event) => handleDragOver(event, index)}
                      onDrop={(event) => handleDrop(event, index)}
                      onDragEnd={clearDrag}
                      onTouchStart={(event) => handleTouchStart(event, index)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      title={[
                        getFighterById(state, entry.sourceActorId)?.shortName ?? '?',
                        entry.label,
                        entry.summary,
                      ].filter(Boolean).join(' · ')}
                      className={[
                        'relative h-[3.15rem] w-[3.15rem] cursor-grab overflow-hidden border-2 bg-[#1e1c24] touch-none shadow-[0_8px_16px_rgba(0,0,0,0.34)] transition',
                        isCmd ? 'border-ca-teal/35' : 'border-amber-300/30',
                        dragOverIndex === index && dragIndex !== index ? 'scale-[1.05] border-ca-red' : '',
                        dragIndex === index ? 'opacity-35' : 'opacity-100',
                      ].join(' ')}
                    >
                      {entry.sourceIcon.src ? (
                        <img src={entry.sourceIcon.src} alt={entry.label} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="grid h-full w-full place-items-center">
                          <span className="ca-display text-[0.68rem] text-ca-text">{entry.sourceIcon.label}</span>
                        </div>
                      )}
                      <div className="absolute left-0 top-0 bg-black/72 px-1 py-0.5">
                        <span className={`ca-mono-label text-[0.32rem] ${isCmd ? 'text-ca-teal' : 'text-amber-300'}`}>
                          {isCmd ? 'CMD' : 'SCH'}
                        </span>
                      </div>
                      <div className="absolute right-0 top-0 bg-black/72 px-1 py-0.5 ca-mono-label text-[0.34rem] text-ca-text">
                        #{index + 1}
                      </div>
                      {/* Energy pips for command tiles */}
                      {resolvedCost && !row?.isPass ? (
                        <div className="absolute bottom-0 right-0 flex gap-[2px] bg-black/72 px-1 py-0.5">
                          {battleEnergyOrder.flatMap((type) =>
                            Array.from({ length: resolvedCost[type] ?? 0 }, (_, pipIndex) => (
                              <span key={`${type}-${pipIndex}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: battleEnergyMeta[type].color }} />
                            )),
                          )}
                        </div>
                      ) : null}
                    </div>

                    <p className="w-[3.15rem] truncate text-center ca-mono-label text-[0.44rem] text-ca-text-2">
                      {(getFighterById(state, entry.sourceActorId)?.shortName ?? '?').toUpperCase()}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── OK / CANCEL ── */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!canAfford || hasUnallocated}
              onClick={() => onConfirm(queueOrder, perActorAlloc)}
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
