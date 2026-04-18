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

function getNarutoArenaLabel(type: BattleEnergyType) {
  switch (type) {
    case 'physical':
      return 'TAIJUTSU'
    case 'technique':
      return 'BLOODLINE'
    case 'vow':
      return 'NINJUTSU'
    case 'mental':
      return 'GENJUTSU'
  }
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
      ? <>CHOOSE <span className="text-[#c71818]">{totalRandomNeeded}</span> RANDOM CHAKRA(S)</>
      : activeRows.length === 0
        ? <>CONFIRM PASS TURN</>
        : <>CONFIRM ACTIONS</>

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.78)] backdrop-blur-[2px]">
      <div className="flex w-full max-w-[31rem] items-stretch justify-center px-3">
        <div className="relative hidden w-[4.8rem] shrink-0 sm:block">
          <div className="absolute bottom-1 top-1 left-1/2 w-[2.85rem] -translate-x-1/2 rounded-[1.35rem] border-[3px] border-[#3c170d] bg-[linear-gradient(180deg,#79a462,#486f3d)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.08),0_10px_22px_rgba(0,0,0,0.34)]" />
          <div className="absolute left-1/2 top-0 h-3 w-9 -translate-x-1/2 rounded-full border-[3px] border-[#3c170d] bg-[linear-gradient(180deg,#7b4938,#41231b)]" />
          <div className="absolute bottom-0 left-1/2 h-3 w-9 -translate-x-1/2 rounded-full border-[3px] border-[#3c170d] bg-[linear-gradient(180deg,#7b4938,#41231b)]" />
          <div className="absolute inset-y-10 left-1/2 flex -translate-x-1/2 items-center justify-center">
            <span className="ca-display rotate-[-90deg] whitespace-nowrap text-[1rem] tracking-[0.1em] text-[#132314]">QUEUE</span>
          </div>
        </div>

        <div className="w-full border-[6px] border-[#b12217] bg-[linear-gradient(180deg,#f4ebcf,#eadcb9)] shadow-[0_18px_42px_rgba(0,0,0,0.46)]">
          <div className="border-[2px] border-[#82180e] px-4 py-4 text-[#16120d]">
            <div className="flex items-center justify-between">
              <p className="ca-mono-label text-[0.46rem] tracking-[0.12em] text-[#665844]">ROUND {round}</p>
              <p className={['ca-mono-label text-[0.46rem] tracking-[0.12em]', turnSecondsLeft <= 10 ? 'text-[#ba1212]' : 'text-[#665844]'].join(' ')}>
                TIMER {String(turnSecondsLeft).padStart(2, '0')}S
              </p>
            </div>

            <div className="mt-2 text-center">
              <h2 className="ca-display text-[1.42rem] tracking-[0.04em] text-[#16120d]">{title}</h2>
            </div>

            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_3.4rem_minmax(0,1fr)] gap-3">
              <p className="ca-display text-[0.92rem] text-[#16120d]">CHAKRA LEFT:</p>
              <div />
              <p className="ca-display text-right text-[0.92rem] text-[#16120d]">RANDOM CHAKRA:</p>

              {battleEnergyOrder.map((type) => {
                const meta = battleEnergyMeta[type]
                const poolCount = getEnergyCount(energy, type)
                const allocated = globalAlloc[type] ?? 0
                const atMax = totalAllocated >= totalRandomNeeded
                const interactive = totalRandomNeeded > 0

                return (
                  <div key={type} className="contents">
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 shrink-0 border border-black/50" style={{ backgroundColor: meta.color }} />
                      <span className="ca-display text-[0.88rem] leading-none text-[#16120d]">{getNarutoArenaLabel(type)}</span>
                      <span className="ml-auto ca-display text-[0.88rem] leading-none text-[#16120d]">{poolCount}</span>
                    </div>

                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustGlobalAlloc(type, -1)}
                        disabled={!interactive || allocated <= 0}
                        className="ca-display h-6 w-6 border border-[#6e6148] bg-[#f6ebca] text-[0.95rem] leading-none text-[#16120d] disabled:opacity-40"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustGlobalAlloc(type, 1)}
                        disabled={!interactive || poolCount <= allocated || atMax}
                        className="ca-display h-6 w-6 border border-[#6e6148] bg-[#f6ebca] text-[0.95rem] leading-none text-[#16120d] disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      <span className="h-3 w-3 shrink-0 border border-black/50" style={{ backgroundColor: meta.color }} />
                      <span className="ca-display text-[0.88rem] leading-none text-[#16120d]">{getNarutoArenaLabel(type)}</span>
                      <span className="ca-display text-[0.88rem] leading-none text-[#16120d]">{allocated}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-5">
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
                        'relative h-[3.35rem] w-[3.35rem] cursor-grab overflow-hidden border-2 bg-[#d2bb90] touch-none',
                        row.isPass ? 'border-[#6e6248]' : 'border-[#6d4720]',
                        isTarget ? 'scale-[1.04] border-[#c71818]' : '',
                        isDragging ? 'opacity-35' : 'opacity-100',
                      ].join(' ')}
                      title={`${index + 1}. ${row.summary}`}
                    >
                      {row.iconSrc ? (
                        <img src={row.iconSrc} alt={row.abilityName} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-[linear-gradient(180deg,#4c4337,#241d18)]">
                          <span className="ca-display text-[0.76rem] text-[#f3e5c2]">{getQueueTileLabel(row)}</span>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-[rgba(15,10,6,0.76)] px-1 py-[2px] text-center">
                        <span className="ca-mono-label text-[0.34rem] tracking-[0.08em] text-[#f0e2b8]">#{index + 1}</span>
                      </div>

                      {!row.isPass ? (
                        <div className="absolute right-0 top-0 flex gap-[1px] bg-[rgba(0,0,0,0.64)] px-[2px] py-[2px]">
                          {battleEnergyOrder.flatMap((type) =>
                            Array.from({ length: resolvedCost[type] ?? 0 }, (_, pipIndex) => (
                              <span key={`${type}-${pipIndex}`} className="h-2 w-2 border border-black/40" style={{ backgroundColor: battleEnergyMeta[type].color }} />
                            )),
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 text-center">
                <p className="ca-mono-label text-[0.44rem] tracking-[0.08em] text-[#665844]">
                  {rows.length > 0
                    ? rows.map((row, index) => `${index + 1}. ${row.summary.toUpperCase()}`).join('  •  ')
                    : 'ALL LIVING FIGHTERS WILL PASS'}
                </p>
              </div>
            </div>

            <div className="mt-4 text-center">
              {totalRandomNeeded > 0 && hasUnallocated ? (
                <p className="ca-mono-label text-[0.48rem] tracking-[0.08em] text-[#ba1212]">
                  ASSIGN {totalRandomNeeded - totalAllocated} MORE RANDOM CHAKRA
                </p>
              ) : !canAfford ? (
                <p className="ca-mono-label text-[0.48rem] tracking-[0.08em] text-[#ba1212]">CANNOT AFFORD THIS TURN</p>
              ) : activeRows.length === 0 ? (
                <p className="ca-mono-label text-[0.48rem] tracking-[0.08em] text-[#665844]">NO ACTIVE TECHNIQUES QUEUED</p>
              ) : (
                <p className="ca-mono-label text-[0.48rem] tracking-[0.08em] text-[#665844]">DISPLAYED ORDER IS THE RESOLUTION ORDER</p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 px-6">
              <button
                type="button"
                disabled={!canAfford || hasUnallocated}
                onClick={() => onConfirm(orderedActionIds)}
                className="ca-display border-2 border-[#6f6247] bg-[linear-gradient(180deg,#f6ebc4,#e4cf9e)] px-4 py-2 text-[1.15rem] tracking-[0.04em] text-[#16120d] disabled:opacity-50"
              >
                OK
              </button>
              <button
                type="button"
                onClick={onBack}
                className="ca-display border-2 border-[#6f6247] bg-[linear-gradient(180deg,#f6ebc4,#e4cf9e)] px-4 py-2 text-[1.15rem] tracking-[0.04em] text-[#16120d]"
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
