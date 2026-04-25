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
import { describeSkillEffectForUi } from '@/components/battle/battleDisplay'
import { getAbilityById, isAlive } from '@/features/battle/engine'
import type { BattleFighterState, BattleState, PassiveEffect, QueuedBattleAction } from '@/features/battle/types'

function buildRoundStartPreview(team: BattleFighterState[]): Array<{ fighter: BattleFighterState; passive: PassiveEffect; text: string }> {
  const rows: Array<{ fighter: BattleFighterState; passive: PassiveEffect; text: string }> = []
  for (const fighter of team) {
    if (!isAlive(fighter)) continue
    for (const passive of fighter.passiveEffects ?? []) {
      if (passive.trigger !== 'onRoundStart') continue
      if (passive.hidden) continue
      const effectText = passive.effects.map(describeSkillEffectForUi).join(', ')
      rows.push({ fighter, passive, text: effectText || passive.description || passive.label })
    }
  }
  return rows
}

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

function getQueueTileLabel(row: QueueRow) {
  if (row.isPass) return 'PASS'
  return row.abilityName.slice(0, 10).toUpperCase()
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
  onConfirm: (actionOrder: string[], randomAlloc: RandomAllocation) => void
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
  const orderedActionIds = rows.filter((row) => !row.isPass).map((row) => row.fighter.instanceId)
  const timerCritical = turnSecondsLeft <= 10

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

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.72)] px-3 backdrop-blur-[2px] animate-ca-fade-in">
      <div className="relative w-full max-w-[39rem] overflow-hidden border border-white/14 bg-[linear-gradient(180deg,#302e3a,#17151c)] shadow-[0_24px_70px_rgba(0,0,0,0.62)] animate-ca-slide-up">
        <header className="border-b border-black/30 bg-[linear-gradient(180deg,rgba(130,45,51,0.95),rgba(88,32,38,0.98))] px-4 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <span className="ca-mono-label text-[0.52rem] tracking-[0.14em] text-white/65">ROUND {round}</span>
            <h2 className="ca-display text-[1.55rem] leading-none tracking-[0.06em] text-white">
              Choose {totalRandomNeeded} Random Energy(s)
            </h2>
            <span className={['ca-mono-label text-[0.52rem] tracking-[0.14em]', timerCritical ? 'text-ca-red' : 'text-white/65'].join(' ')}>
              {String(turnSecondsLeft).padStart(2, '0')}S
            </span>
          </div>
        </header>

        <div className="relative bg-[linear-gradient(135deg,rgba(228,218,191,0.1),rgba(255,255,255,0.02))] p-3">
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

          {(() => {
            const roundStartRows = buildRoundStartPreview(state.playerTeam)
            if (roundStartRows.length === 0) return null
            return (
              <section className="mt-3 border border-black/35 bg-[rgba(13,12,17,0.7)] p-2">
                <p className="ca-mono-label text-[0.48rem] tracking-[0.12em] text-ca-teal">ROUND START — RESOLVES BEFORE YOUR SKILLS</p>
                <div className="mt-2 space-y-1">
                  {roundStartRows.map(({ fighter, passive, text }) => (
                    <div key={`${fighter.instanceId}-${passive.id ?? passive.label}`} className="flex items-center gap-2 border border-ca-teal/20 bg-ca-teal-wash/40 px-2 py-1.5">
                      <span className="ca-mono-label w-[3rem] shrink-0 text-[0.42rem] text-ca-teal">{fighter.shortName.toUpperCase()}</span>
                      <span className="ca-mono-label shrink-0 text-[0.42rem] text-ca-text-3">{passive.label.toUpperCase()}</span>
                      <span className="truncate text-[0.72rem] text-ca-text-2">{text}</span>
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}

          <section className="mt-3 border border-black/35 bg-[rgba(13,12,17,0.7)] p-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="ca-display border border-black/40 bg-[rgba(228,230,239,0.92)] px-3 py-1 text-[1rem] leading-none text-[#17151c]">
                Skill Reorder
              </p>
              <p className="ca-mono-label text-[0.48rem] tracking-[0.12em] text-ca-text-3">DRAG SKILLS TO CHANGE ORDER</p>
            </div>

            <div className="flex items-center justify-center gap-2">
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
                      'relative h-[3.15rem] w-[3.15rem] cursor-grab overflow-hidden border-2 bg-[#1e1c24] touch-none shadow-[0_8px_16px_rgba(0,0,0,0.34)] transition',
                      row.isPass ? 'border-white/15' : 'border-ca-teal/35',
                      isTarget ? 'scale-[1.05] border-ca-red' : '',
                      isDragging ? 'opacity-35' : 'opacity-100',
                    ].join(' ')}
                    title={`${index + 1}. ${row.summary}`}
                  >
                    {row.iconSrc ? (
                      <img src={row.iconSrc} alt={row.abilityName} className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <div className="grid h-full w-full place-items-center">
                        <span className="ca-display text-[0.68rem] text-ca-text">{getQueueTileLabel(row)}</span>
                      </div>
                    )}
                    <div className="absolute left-0 top-0 bg-black/72 px-1 py-0.5 ca-mono-label text-[0.34rem] text-ca-text">#{index + 1}</div>
                    {!row.isPass ? (
                      <div className="absolute bottom-0 right-0 flex gap-[2px] bg-black/72 px-1 py-0.5">
                        {battleEnergyOrder.flatMap((type) =>
                          Array.from({ length: resolvedCost[type] ?? 0 }, (_, pipIndex) => (
                            <span key={`${type}-${pipIndex}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: battleEnergyMeta[type].color }} />
                          )),
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!canAfford || hasUnallocated}
              onClick={() => onConfirm(orderedActionIds, perActorAlloc)}
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
