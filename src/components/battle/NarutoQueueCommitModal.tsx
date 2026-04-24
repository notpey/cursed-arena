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
import { getAbilityById } from '@/features/battle/engine'
import type { BattleFighterState, BattleState, QueuedBattleAction } from '@/features/battle/types'

type RandomAllocation = Record<string, Partial<Record<BattleEnergyType, number>>>

type QueueRow = {
  fighter: BattleFighterState
  abilityName: string
  iconSrc?: string
  cost: BattleEnergyCost
  isPass: boolean
  summary: string
}

function getEnergyTypeLabel(type: BattleEnergyType) {
  return battleEnergyMeta[type].label.toUpperCase()
}

function getQueueTileLabel(row: QueueRow) {
  if (row.isPass) return 'PASS'
  return row.abilityName.slice(0, 10).toUpperCase()
}

function buildDefaultRandomAllocation(rows: QueueRow[], energy: BattleEnergyPool): RandomAllocation {
  const allocation: RandomAllocation = {}
  const remainingPool = { ...energy.amounts }

  for (const row of rows) {
    if (row.isPass) continue

    for (const type of battleEnergyOrder) {
      const required = row.cost[type] ?? 0
      remainingPool[type] = Math.max(0, remainingPool[type] - required)
    }

    let randomNeeded = row.cost.random ?? 0
    if (randomNeeded <= 0) continue

    const actorAlloc: Partial<Record<BattleEnergyType, number>> = {}
    const sorted = [...battleEnergyOrder].sort((left, right) => remainingPool[right] - remainingPool[left])

    for (const type of sorted) {
      if (randomNeeded <= 0) break
      const take = Math.min(remainingPool[type], randomNeeded)
      if (take <= 0) continue
      actorAlloc[type] = take
      remainingPool[type] -= take
      randomNeeded -= take
    }

    allocation[row.fighter.instanceId] = actorAlloc
  }

  return allocation
}

function resolveRandomCost(cost: BattleEnergyCost, allocation: Partial<Record<BattleEnergyType, number>>) {
  if (!cost.random) return cost

  const resolved: BattleEnergyCost = { ...cost }
  delete resolved.random
  for (const type of battleEnergyOrder) {
    if ((allocation[type] ?? 0) > 0) {
      resolved[type] = (resolved[type] ?? 0) + (allocation[type] ?? 0)
    }
  }
  return resolved
}

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
  onConfirm: (actionOrder: string[]) => void
  onBack: () => void
}) {
  const [order, setOrder] = useState<string[]>(() => {
    const aliveIds = new Set(state.playerTeam.filter((fighter) => fighter.hp > 0).map((fighter) => fighter.instanceId))
    const ordered = initialOrder.filter((id) => aliveIds.has(id))
    const remaining = [...aliveIds].filter((id) => !ordered.includes(id))
    return [...ordered, ...remaining]
  })
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const touchDragFromRef = useRef<number | null>(null)

  const rows = useMemo(() => {
    const rowMap = new Map(
      state.playerTeam.map((fighter) => {
        const command = queued[fighter.instanceId]
        const ability = command ? getAbilityById(fighter, command.abilityId) : null
        const isPass = !ability || ability.id === PASS_ABILITY_ID

        return [fighter.instanceId, {
          fighter,
          abilityName: ability?.name ?? 'Pass',
          iconSrc: ability?.icon.src,
          cost: ability ? getAbilityEnergyCost(ability) : {},
          isPass,
          summary: getCommandSummary(state, command),
        } satisfies QueueRow]
      }),
    )

    return order.flatMap((id) => {
      const row = rowMap.get(id)
      return row ? [row] : []
    })
  }, [order, queued, state])

  const activeRows = rows.filter((row) => !row.isPass)
  const totalRandomNeeded = activeRows.reduce((sum, row) => sum + (row.cost.random ?? 0), 0)

  const [globalAlloc, setGlobalAlloc] = useState<Partial<Record<BattleEnergyType, number>>>(() => {
    const defaults = buildDefaultRandomAllocation(rows, energy)
    const aggregate: Partial<Record<BattleEnergyType, number>> = {}
    for (const actorAlloc of Object.values(defaults)) {
      for (const [type, count] of Object.entries(actorAlloc)) {
        aggregate[type as BattleEnergyType] = (aggregate[type as BattleEnergyType] ?? 0) + (count as number)
      }
    }
    return aggregate
  })

  function buildPerActorAlloc(): RandomAllocation {
    const result: RandomAllocation = {}
    const remaining = { ...globalAlloc } as Record<BattleEnergyType, number>

    for (const row of activeRows) {
      const needed = row.cost.random ?? 0
      if (needed <= 0) continue

      const actorAlloc: Partial<Record<BattleEnergyType, number>> = {}
      let left = needed
      for (const type of battleEnergyOrder) {
        if (left <= 0) break
        const take = Math.min(remaining[type] ?? 0, left)
        if (take <= 0) continue
        actorAlloc[type] = take
        remaining[type] -= take
        left -= take
      }
      result[row.fighter.instanceId] = actorAlloc
    }

    return result
  }

  const perActorAlloc = buildPerActorAlloc()
  const totalAllocated = battleEnergyOrder.reduce((sum, type) => sum + (globalAlloc[type] ?? 0), 0)
  const hasUnallocated = totalRandomNeeded > 0 && totalAllocated < totalRandomNeeded
  const aggregateCost = sumEnergyCosts(
    activeRows.map((row) => resolveRandomCost(row.cost, perActorAlloc[row.fighter.instanceId] ?? {})),
  )
  const canAfford = canPayEnergy(energy, aggregateCost)
  const orderedActionIds = rows.filter((row) => !row.isPass).map((row) => row.fighter.instanceId)

  function clearDrag() {
    setDragIndex(null)
    setDragOverIndex(null)
    touchDragFromRef.current = null
  }

  function applyReorder(from: number, to: number) {
    if (from === to) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
  }

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault()
    setDragOverIndex(index)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault()
    if (dragIndex !== null) {
      applyReorder(dragIndex, index)
    }
    clearDrag()
  }

  function handleTouchStart(_event: TouchEvent<HTMLDivElement>, index: number) {
    touchDragFromRef.current = index
    setDragIndex(index)
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (touchDragFromRef.current === null) return
    const point = event.touches[0]
    const tile = document.elementFromPoint(point.clientX, point.clientY)?.closest('[data-queue-index]')
    if (!tile) return
    const index = parseInt((tile as HTMLElement).dataset.queueIndex ?? '-1', 10)
    if (index >= 0) setDragOverIndex(index)
  }

  function handleTouchEnd() {
    if (touchDragFromRef.current !== null && dragOverIndex !== null) {
      applyReorder(touchDragFromRef.current, dragOverIndex)
    }
    clearDrag()
  }

  function adjustGlobalAlloc(type: BattleEnergyType, delta: number) {
    setGlobalAlloc((current) => ({
      ...current,
      [type]: Math.max(0, (current[type] ?? 0) + delta),
    }))
  }

  const title =
    totalRandomNeeded > 0
      ? <>CHOOSE <span className="text-ca-red">{totalRandomNeeded}</span> RANDOM CE PIP(S)</>
      : activeRows.length === 0
        ? <>CONFIRM PASS TURN</>
        : <>CONFIRM ACTIONS</>

  const statusToneClass =
    totalRandomNeeded > 0 && hasUnallocated
      ? 'text-ca-red'
      : !canAfford
        ? 'text-ca-red'
        : activeRows.length === 0
          ? 'text-ca-text-2'
          : 'text-ca-teal'

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.82)] px-3 backdrop-blur-[3px] animate-ca-fade-in">
      <div className="relative w-full max-w-[36rem] overflow-hidden rounded-[10px] border border-white/10 bg-[linear-gradient(180deg,#1e1c24,#17151c)] shadow-[0_24px_60px_rgba(0,0,0,0.58)] animate-ca-slide-up">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(250,39,66,0.09),transparent_42%),radial-gradient(circle_at_right,rgba(5,216,189,0.08),transparent_44%)]" />
        <div className="relative grid gap-0 sm:grid-cols-[4.4rem_minmax(0,1fr)]">
          <div className="hidden border-r border-white/8 bg-[linear-gradient(180deg,rgba(250,39,66,0.12),rgba(255,255,255,0.02))] sm:flex sm:flex-col sm:items-center sm:justify-between sm:px-2 sm:py-4">
            <span className="rounded-full border border-ca-red/30 bg-ca-red/10 px-2 py-1 ca-mono-label text-[0.54rem] tracking-[0.14em] text-ca-red">R{round}</span>
            <span className="ca-display rotate-[-90deg] whitespace-nowrap text-[1rem] tracking-[0.08em] text-ca-text">TURN ORDER</span>
            <span
              className={[
                'rounded-full border px-2 py-1 ca-mono-label text-[0.54rem] tracking-[0.14em]',
                turnSecondsLeft <= 10
                  ? 'border-ca-red/35 bg-ca-red/10 text-ca-red'
                  : 'border-ca-teal/25 bg-ca-teal/10 text-ca-teal',
              ].join(' ')}
            >
              {String(turnSecondsLeft).padStart(2, '0')}S
            </span>
          </div>

          <div className="px-4 py-4 text-ca-text sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <p className="ca-mono-label text-[0.56rem] tracking-[0.14em] text-ca-text-3">ROUND {round}</p>
              <p className={['ca-mono-label text-[0.56rem] tracking-[0.14em]', turnSecondsLeft <= 10 ? 'text-ca-red' : 'text-ca-text-2'].join(' ')}>
                TIMER {String(turnSecondsLeft).padStart(2, '0')}S
              </p>
            </div>

            <div className="mt-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="ca-display text-[1.55rem] tracking-[0.05em] text-ca-text">{title}</h2>
                  <p className="mt-1 max-w-[20rem] text-[0.78rem] text-ca-text-2">
                    Lock your turn, assign random CE if needed, and drag the portraits below to set the resolution order.
                  </p>
                </div>
                <span
                  className={[
                    'rounded-full border px-2 py-1 ca-mono-label text-[0.56rem] tracking-[0.14em]',
                    statusToneClass === 'text-ca-teal'
                      ? 'border-ca-teal/25 bg-ca-teal/10 text-ca-teal'
                      : statusToneClass === 'text-ca-red'
                        ? 'border-ca-red/30 bg-ca-red/10 text-ca-red'
                        : 'border-white/10 bg-white/5 text-ca-text-2',
                  ].join(' ')}
                >
                  {activeRows.length === 0 ? 'PASS TURN' : `${activeRows.length} ACTIVE`}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-3 grid grid-cols-[minmax(0,1fr)_3.4rem_minmax(0,1fr)] gap-3">
                <p className="ca-display text-[0.94rem] tracking-[0.05em] text-ca-text">ENERGY LEFT</p>
                <div />
                <p className="text-right ca-display text-[0.94rem] tracking-[0.05em] text-ca-text">RANDOM COST</p>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_3.4rem_minmax(0,1fr)] gap-x-3 gap-y-2.5">
                {battleEnergyOrder.map((type) => {
                  const meta = battleEnergyMeta[type]
                  const poolCount = getEnergyCount(energy, type)
                  const allocated = globalAlloc[type] ?? 0
                  const atMax = totalAllocated >= totalRandomNeeded
                  const interactive = totalRandomNeeded > 0

                  return (
                    <div key={type} className="contents">
                      <div className="flex min-w-0 items-center gap-2 rounded-[6px] border border-white/6 bg-[rgba(255,255,255,0.025)] px-2 py-2">
                        <span className="h-3 w-3 shrink-0 rounded-full border border-black/30" style={{ backgroundColor: meta.color }} />
                        <span className="min-w-0 truncate ca-mono-label text-[0.62rem] tracking-[0.12em] text-ca-text-2">{getEnergyTypeLabel(type)}</span>
                        <span className="ml-auto ca-display text-[0.98rem] leading-none text-ca-text">{poolCount}</span>
                      </div>

                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => adjustGlobalAlloc(type, -1)}
                          disabled={!interactive || allocated <= 0}
                          className="ca-display h-7 w-7 rounded-[6px] border border-white/10 bg-[rgba(255,255,255,0.06)] text-[1rem] leading-none text-ca-text transition hover:border-ca-red/35 hover:bg-ca-red/10 disabled:opacity-40"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustGlobalAlloc(type, 1)}
                          disabled={!interactive || poolCount <= allocated || atMax}
                          className="ca-display h-7 w-7 rounded-[6px] border border-white/10 bg-[rgba(255,255,255,0.06)] text-[1rem] leading-none text-ca-text transition hover:border-ca-teal/35 hover:bg-ca-teal/10 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>

                      <div className="flex min-w-0 items-center justify-end gap-2 rounded-[6px] border border-white/6 bg-[rgba(255,255,255,0.025)] px-2 py-2">
                        <span className="h-3 w-3 shrink-0 rounded-full border border-black/30" style={{ backgroundColor: meta.color }} />
                        <span className="min-w-0 truncate text-right ca-mono-label text-[0.62rem] tracking-[0.12em] text-ca-text-2">{getEnergyTypeLabel(type)}</span>
                        <span className="ca-display text-[0.98rem] leading-none text-ca-text">{allocated}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 rounded-[10px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="ca-display text-[0.92rem] tracking-[0.05em] text-ca-text">RESOLUTION ORDER</p>
                <p className="ca-mono-label text-[0.58rem] tracking-[0.12em] text-ca-text-3">DRAG TO REORDER</p>
              </div>

              <div className="flex items-center justify-center gap-1.5">
                {rows.map((row, index) => {
                  const isDragging = dragIndex === index
                  const isTarget = dragOverIndex === index && dragIndex !== index
                  const resolvedCost = resolveRandomCost(row.cost, perActorAlloc[row.fighter.instanceId] ?? {})

                  return (
                    <div
                      key={row.fighter.instanceId}
                      data-queue-index={index}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(event) => handleDragOver(event, index)}
                      onDrop={(event) => handleDrop(event, index)}
                      onDragEnd={clearDrag}
                      onTouchStart={(event) => handleTouchStart(event, index)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className={[
                        'relative h-[3.55rem] w-[3.55rem] cursor-grab overflow-hidden rounded-[8px] border bg-[linear-gradient(180deg,#302e3a,#1e1c24)] touch-none shadow-[0_8px_18px_rgba(0,0,0,0.3)] transition',
                        row.isPass ? 'border-white/10' : 'border-white/14',
                        isTarget ? 'scale-[1.04] border-ca-red shadow-[0_0_0_1px_rgba(250,39,66,0.35),0_12px_28px_rgba(250,39,66,0.2)]' : '',
                        isDragging ? 'opacity-35' : 'opacity-100',
                      ].join(' ')}
                      title={`${index + 1}. ${row.summary}`}
                    >
                      {row.iconSrc ? (
                        <img src={row.iconSrc} alt={row.abilityName} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-[linear-gradient(180deg,#26242e,#17151c)]">
                          <span className="ca-display text-[0.76rem] text-ca-text">{getQueueTileLabel(row)}</span>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(13,12,17,0.15),rgba(13,12,17,0.88))] px-1 py-[3px] text-center">
                        <span className="ca-mono-label text-[0.34rem] tracking-[0.1em] text-ca-text">#{index + 1}</span>
                      </div>

                      {!row.isPass ? (
                        <div className="absolute right-1 top-1 flex gap-[2px] rounded-full bg-[rgba(13,12,17,0.72)] px-[4px] py-[3px]">
                          {battleEnergyOrder.flatMap((type) =>
                            Array.from({ length: resolvedCost[type] ?? 0 }, (_, pipIndex) => (
                              <span key={`${type}-${pipIndex}`} className="h-2 w-2 rounded-full border border-black/30" style={{ backgroundColor: battleEnergyMeta[type].color }} />
                            )),
                          )}
                        </div>
                      ) : (
                        <div className="absolute right-1 top-1 rounded-full border border-white/10 bg-[rgba(13,12,17,0.72)] px-1.5 py-[2px]">
                          <span className="ca-mono-label text-[0.32rem] tracking-[0.1em] text-ca-text-2">PASS</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 rounded-[8px] border border-white/6 bg-[rgba(13,12,17,0.38)] px-3 py-2 text-center">
                <p className="ca-mono-label text-[0.48rem] tracking-[0.08em] text-ca-text-2">
                  {rows.length > 0
                    ? rows.map((row, index) => `${index + 1}. ${row.summary.toUpperCase()}`).join('  •  ')
                    : 'ALL LIVING FIGHTERS WILL PASS'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className={['ca-mono-label text-[0.58rem] tracking-[0.12em]', statusToneClass].join(' ')}>
                {totalRandomNeeded > 0 && hasUnallocated ? (
                  <>ASSIGN {totalRandomNeeded - totalAllocated} MORE RANDOM CE PIPS</>
                ) : !canAfford ? (
                  <>CANNOT AFFORD THIS TURN</>
                ) : activeRows.length === 0 ? (
                  <>NO ACTIVE SKILLS QUEUED</>
                ) : (
                  <>DISPLAYED ORDER IS THE RESOLUTION ORDER</>
                )}
              </p>
              <p className="ca-mono-label text-[0.58rem] tracking-[0.12em] text-ca-text-3">
                TOTAL RANDOM {totalAllocated}/{totalRandomNeeded}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!canAfford || hasUnallocated}
                onClick={() => onConfirm(orderedActionIds)}
                className="ca-display rounded-[8px] border border-ca-red/35 bg-ca-red px-4 py-2.5 text-[1.08rem] tracking-[0.05em] text-white shadow-[0_0_24px_rgba(250,39,66,0.22)] transition duration-150 hover:translate-y-[-1px] hover:bg-[#ff3d5a] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                OK
              </button>
              <button
                type="button"
                onClick={onBack}
                className="ca-display rounded-[8px] border border-white/12 bg-[rgba(255,255,255,0.06)] px-4 py-2.5 text-[1.08rem] tracking-[0.05em] text-ca-text transition duration-150 hover:border-ca-teal/35 hover:bg-ca-teal/10 hover:text-ca-teal active:scale-[0.97]"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
