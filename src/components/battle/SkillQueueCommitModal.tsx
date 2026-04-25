import { type DragEvent, type TouchEvent, useRef, useState } from 'react'
import { describePassiveForUi, getCommandSummary } from '@/components/battle/battleDisplay'
import { EnergyCostRow } from '@/components/battle/BattleEnergy'
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
import { getAbilityById, isAlive } from '@/features/battle/engine'
import type { BattleFighterState, BattleState, PassiveEffect, QueuedBattleAction } from '@/features/battle/types'

type RandomAllocation = Record<string, Partial<Record<BattleEnergyType, number>>>

function buildRoundStartPreview(team: BattleFighterState[]): Array<{ fighter: BattleFighterState; passive: PassiveEffect; text: string }> {
  const rows: Array<{ fighter: BattleFighterState; passive: PassiveEffect; text: string }> = []
  for (const fighter of team) {
    if (!isAlive(fighter)) continue
    for (const passive of fighter.passiveEffects ?? []) {
      if (passive.trigger !== 'onRoundStart') continue
      if (passive.hidden) continue
      rows.push({ fighter, passive, text: describePassiveForUi(passive) })
    }
  }
  return rows
}

function buildDefaultRandomAllocation(
  rows: { fighter: BattleFighterState; cost: BattleEnergyCost | null; isPass: boolean }[],
  energy: BattleEnergyPool,
): RandomAllocation {
  const allocation: RandomAllocation = {}
  const remainingPool = { ...energy.amounts }

  for (const { fighter, cost, isPass } of rows) {
    if (!cost || isPass) continue

    for (const type of battleEnergyOrder) {
      const required = cost[type] ?? 0
      remainingPool[type] = Math.max(0, remainingPool[type] - required)
    }

    const randomNeeded = cost.random ?? 0
    if (randomNeeded === 0) continue

    const alloc: Partial<Record<BattleEnergyType, number>> = {}
    let left = randomNeeded
    const sorted = [...battleEnergyOrder].sort((a, b) => remainingPool[b] - remainingPool[a])
    for (const type of sorted) {
      if (left <= 0) break
      const take = Math.min(remainingPool[type], left)
      if (take > 0) {
        alloc[type] = take
        remainingPool[type] -= take
        left -= take
      }
    }
    allocation[fighter.instanceId] = alloc
  }

  return allocation
}

export function SkillQueueCommitModal({
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
    const aliveIds = new Set(state.playerTeam.filter((f) => f.hp > 0).map((f) => f.instanceId))
    const filtered = initialOrder.filter((id) => aliveIds.has(id))
    const rest = [...aliveIds].filter((id) => !filtered.includes(id))
    return [...filtered, ...rest]
  })

  const rowMap = new Map(
    state.playerTeam.map((fighter) => {
      const action = queued[fighter.instanceId]
      const ability = action ? getAbilityById(fighter, action.abilityId) : null
      const cost = ability ? getAbilityEnergyCost(ability) : null
      const isPass = !ability || ability.id === PASS_ABILITY_ID
      return [fighter.instanceId, { fighter, ability, cost, isPass }]
    }),
  )

  const rows = order
    .map((id) => rowMap.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)

  const activeRows = rows.filter((r) => !r.isPass)
  const passRows = rows.filter((r) => r.isPass)
  const randomRows = rows.filter(({ cost, isPass }) => !isPass && (cost?.random ?? 0) > 0)
  const totalRandomNeeded = randomRows.reduce((sum, { cost }) => sum + (cost?.random ?? 0), 0)

  const [globalAlloc, setGlobalAlloc] = useState<Partial<Record<BattleEnergyType, number>>>(() => {
    const defaults = buildDefaultRandomAllocation(rows, energy)
    const agg: Partial<Record<BattleEnergyType, number>> = {}
    for (const perType of Object.values(defaults)) {
      for (const [t, count] of Object.entries(perType)) {
        agg[t as BattleEnergyType] = (agg[t as BattleEnergyType] ?? 0) + (count as number)
      }
    }
    return agg
  })

  const totalAllocated = battleEnergyOrder.reduce((s, t) => s + (globalAlloc[t] ?? 0), 0)
  const hasUnallocated = totalRandomNeeded > 0 && totalAllocated < totalRandomNeeded

  function adjustGlobalAlloc(type: BattleEnergyType, delta: number) {
    setGlobalAlloc((prev) => ({ ...prev, [type]: Math.max(0, (prev[type] ?? 0) + delta) }))
  }

  function buildPerActorAlloc(): RandomAllocation {
    const result: RandomAllocation = {}
    const rem = { ...globalAlloc } as Record<BattleEnergyType, number>
    for (const { fighter, cost } of randomRows) {
      const needed = cost?.random ?? 0
      if (!needed) continue
      const actorAlloc: Partial<Record<BattleEnergyType, number>> = {}
      let left = needed
      for (const type of battleEnergyOrder) {
        if (left <= 0) break
        const take = Math.min(rem[type] ?? 0, left)
        if (take > 0) {
          actorAlloc[type] = take
          rem[type] = (rem[type] ?? 0) - take
          left -= take
        }
      }
      result[fighter.instanceId] = actorAlloc
    }
    return result
  }

  function resolvedCost(actorId: string, cost: BattleEnergyCost, alloc: RandomAllocation): BattleEnergyCost {
    if (!cost.random) return cost
    const a = alloc[actorId] ?? {}
    const r: BattleEnergyCost = { ...cost }
    delete r.random
    for (const type of battleEnergyOrder) {
      if ((a[type] ?? 0) > 0) r[type] = (r[type] ?? 0) + (a[type] ?? 0)
    }
    return r
  }

  const perActorAlloc = buildPerActorAlloc()
  const aggregateCost = sumEnergyCosts(
    rows.flatMap(({ fighter, cost, isPass }) =>
      isPass || !cost ? [] : [resolvedCost(fighter.instanceId, cost, perActorAlloc)],
    ),
  )
  const canAfford = canPayEnergy(energy, aggregateCost)
  const orderedActionIds = activeRows.map((row) => row.fighter.instanceId)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const touchDragFromRef = useRef<number | null>(null)

  function applyReorder(from: number, to: number) {
    if (from === to) return
    const fromId = activeRows[from]?.fighter.instanceId
    const toId = activeRows[to]?.fighter.instanceId
    if (!fromId || !toId) return
    const fi = order.indexOf(fromId)
    const ti = order.indexOf(toId)
    if (fi === -1 || ti === -1) return
    const next = [...order]
    const [moved] = next.splice(fi, 1)
    next.splice(ti, 0, moved)
    setOrder(next)
  }

  function clearDrag() {
    setDragIndex(null)
    setDragOverIndex(null)
    touchDragFromRef.current = null
  }

  function handleDragStart(i: number) {
    setDragIndex(i)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, i: number) {
    e.preventDefault()
    setDragOverIndex(i)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, i: number) {
    e.preventDefault()
    if (dragIndex !== null) applyReorder(dragIndex, i)
    clearDrag()
  }

  function handleDragEnd() {
    clearDrag()
  }

  function handleTouchStart(_e: TouchEvent<HTMLDivElement>, i: number) {
    touchDragFromRef.current = i
    setDragIndex(i)
  }

  function handleTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (touchDragFromRef.current === null) return
    const t = e.touches[0]
    const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-tile-index]')
    if (!el) return
    const idx = parseInt((el as HTMLElement).dataset.tileIndex ?? '-1', 10)
    if (idx >= 0) setDragOverIndex(idx)
  }

  function handleTouchEnd() {
    if (touchDragFromRef.current !== null && dragOverIndex !== null) {
      applyReorder(touchDragFromRef.current, dragOverIndex)
    }
    clearDrag()
  }

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(4,5,10,0.82)] backdrop-blur-[3px] animate-ca-fade-in">
      <div className="w-full max-w-[34rem] rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,14,26,0.99),rgba(10,9,18,1))] shadow-[0_24px_60px_rgba(0,0,0,0.6)] animate-ca-slide-up">
        <div className="border-b border-white/8 px-5 py-4 text-center">
          <div className="flex items-center justify-between gap-3">
            <p className="ca-mono-label text-[0.46rem] text-ca-text-3">ROUND {round}</p>
            <p className={['ca-mono-label text-[0.46rem]', turnSecondsLeft <= 10 ? 'text-ca-red' : 'text-ca-text-2'].join(' ')}>
              TIMER {String(turnSecondsLeft).padStart(2, '0')}S
            </p>
          </div>
          {totalRandomNeeded > 0 ? (
            <p className="ca-display mt-1 text-[1.35rem] leading-tight text-ca-text">
              CHOOSE {totalRandomNeeded} RANDOM ENERGY
            </p>
          ) : activeRows.length === 0 ? (
            <p className="ca-display mt-1 text-[1.35rem] leading-tight text-ca-text">CONFIRM PASS TURN</p>
          ) : (
            <p className="ca-display mt-1 text-[1.35rem] leading-tight text-ca-text">CONFIRM ACTIONS</p>
          )}
        </div>

        {(() => {
          const roundStartRows = buildRoundStartPreview(state.playerTeam)
          if (roundStartRows.length === 0) return null
          return (
            <div className="border-b border-white/8 px-5 py-4">
              <p className="ca-mono-label text-[0.42rem] text-ca-text-3">ROUND START — RESOLVES BEFORE YOUR SKILLS</p>
              <div className="mt-2 space-y-1.5">
                {roundStartRows.map(({ fighter, passive, text }) => (
                  <div key={`${fighter.instanceId}-${passive.id ?? passive.label}`} className="flex items-center gap-2 rounded-[0.4rem] border border-ca-teal/18 bg-ca-teal-wash/40 px-3 py-2">
                    <span className="ca-mono-label w-[3.2rem] shrink-0 text-[0.42rem] text-ca-teal">{fighter.shortName.toUpperCase()}</span>
                    <span className="ca-mono-label shrink-0 text-[0.42rem] text-ca-text-3">{passive.label.toUpperCase()}</span>
                    <span className="truncate text-[0.72rem] text-ca-text-2">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        <div className="border-b border-white/8 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="ca-mono-label text-[0.42rem] text-ca-text-3">QUEUED ACTIONS</p>
            {activeRows.length > 0 ? (
              <p className="ca-mono-label text-[0.42rem] text-ca-text-3">DRAG TO REORDER</p>
            ) : null}
          </div>

          {activeRows.length > 0 ? (
            <div className="mt-3 space-y-2">
              {activeRows.map((row, index) => {
                const isDragging = dragIndex === index
                const isTarget = dragOverIndex === index && dragIndex !== index
                const effCost = row.cost ? resolvedCost(row.fighter.instanceId, row.cost, perActorAlloc) : null

                return (
                  <div
                    key={row.fighter.instanceId}
                    data-tile-index={index}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, index)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={[
                      'grid cursor-grab grid-cols-[2rem_3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[0.45rem] border px-3 py-2.5 transition-all touch-none',
                      isTarget ? 'border-ca-teal/40 bg-ca-teal-wash shadow-[0_0_0_1px_rgba(5,216,189,0.12)]' : 'border-white/10 bg-[rgba(255,255,255,0.03)]',
                      isDragging ? 'opacity-30' : 'opacity-100',
                    ].join(' ')}
                  >
                    <div className="text-center">
                      <p className="ca-mono-label text-[0.42rem] text-ca-text-3">#{index + 1}</p>
                    </div>

                    <div className="relative h-[3rem] w-[3rem] overflow-hidden rounded-[0.25rem] border border-white/15 bg-[rgba(20,20,28,0.9)]">
                      {row.ability?.icon.src ? (
                        <img src={row.ability.icon.src} alt={row.ability.name} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="grid h-full w-full place-items-center ca-mono-label text-[0.55rem] font-black text-white/20">
                          {row.fighter.shortName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{row.fighter.shortName.toUpperCase()}</p>
                      <p className="ca-display truncate text-[0.92rem] leading-none text-ca-text">{row.ability?.name.toUpperCase() ?? 'PASS'}</p>
                      <p className="mt-1 truncate text-[0.72rem] text-ca-text-2">{getCommandSummary(state, queued[row.fighter.instanceId])}</p>
                    </div>

                    <div className="justify-self-end">
                      {effCost ? (
                        <div className="rounded-[0.25rem] border border-white/10 bg-[rgba(0,0,0,0.28)] px-2 py-1">
                          <EnergyCostRow cost={effCost} compact />
                        </div>
                      ) : (
                        <span className="ca-mono-label text-[0.48rem] text-ca-text-3">FREE</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-[0.45rem] border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-3">
              <p className="ca-mono-label text-[0.46rem] text-ca-text-3">NO ACTIVE TECHNIQUES QUEUED</p>
              <p className="mt-1 text-[0.78rem] text-ca-text-2">Press OK to pass with all living fighters this turn.</p>
            </div>
          )}

          {passRows.length > 0 ? (
            <div className="mt-3 rounded-[0.45rem] border border-white/8 bg-[rgba(0,0,0,0.18)] px-3 py-2.5">
              <p className="ca-mono-label text-[0.42rem] text-ca-text-3">PASSING THIS TURN</p>
              <p className="mt-1 text-[0.72rem] text-ca-text-2">
                {passRows.map((row) => row.fighter.shortName.toUpperCase()).join(', ')}
              </p>
            </div>
          ) : null}
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="ca-mono-label text-[0.42rem] text-ca-text-3">TOTAL COST</p>
            <div className="rounded-[0.25rem] border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1">
              <EnergyCostRow cost={aggregateCost} compact />
            </div>
          </div>

          <div className={['mb-2 items-center gap-x-2', totalRandomNeeded > 0 ? 'grid grid-cols-[1fr_1.6rem_1.6rem_2.2rem]' : 'flex'].join(' ')}>
            <p className="ca-mono-label text-[0.42rem] text-ca-text-3">ENERGY LEFT</p>
            {totalRandomNeeded > 0 ? (
              <><span /><span /><p className="ca-mono-label text-right text-[0.42rem] text-ca-text-3">RANDOM</p></>
            ) : null}
          </div>

          <div className="space-y-2">
            {battleEnergyOrder.map((type) => {
              const meta = battleEnergyMeta[type]
              const poolCount = getEnergyCount(energy, type)
              const allocated = globalAlloc[type] ?? 0
              const atMax = totalAllocated >= totalRandomNeeded
              const dim = poolCount === 0 && allocated === 0
              return (
                <div
                  key={type}
                  className={['items-center gap-x-2', totalRandomNeeded > 0 ? 'grid grid-cols-[1fr_1.6rem_1.6rem_2.2rem]' : 'flex gap-2'].join(' ')}
                >
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-[0.6rem] w-[0.6rem] shrink-0 rounded-[0.1rem]"
                      style={{ background: meta.color, opacity: dim ? 0.2 : 1 }}
                    />
                    <span
                      className="ca-mono-label w-[2.2rem] text-[0.52rem]"
                      style={{ color: dim ? 'rgba(255,255,255,0.2)' : meta.color }}
                    >
                      {meta.short}
                    </span>
                    <span className={['ca-mono-label text-[0.52rem] tabular-nums', dim ? 'text-white/20' : 'text-ca-text'].join(' ')}>
                      {poolCount}
                    </span>
                  </div>

                  {totalRandomNeeded > 0 ? (
                    <>
                      <button
                        type="button"
                        disabled={allocated <= 0}
                        onClick={() => adjustGlobalAlloc(type, -1)}
                        className="grid h-[1.3rem] w-[1.3rem] place-items-center rounded border border-white/15 bg-[rgba(255,255,255,0.05)] ca-mono-label text-[0.75rem] text-ca-text-2 transition duration-100 hover:bg-[rgba(255,255,255,0.1)] active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed"
                      >−</button>

                      <button
                        type="button"
                        disabled={poolCount === 0 || allocated >= poolCount || atMax}
                        onClick={() => adjustGlobalAlloc(type, 1)}
                        className="grid h-[1.3rem] w-[1.3rem] place-items-center rounded border border-white/15 bg-[rgba(255,255,255,0.05)] ca-mono-label text-[0.75rem] text-ca-text-2 transition duration-100 hover:bg-[rgba(255,255,255,0.1)] active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed"
                      >+</button>

                      <p
                        className="ca-mono-label text-right text-[0.52rem] tabular-nums"
                        style={{ color: allocated > 0 ? meta.color : 'rgba(255,255,255,0.2)' }}
                      >
                        {allocated}
                      </p>
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="mt-3">
            {hasUnallocated ? (
              <p key="unalloc" className="ca-mono-label text-[0.44rem] text-amber-300 animate-ca-fade-in">{totalRandomNeeded - totalAllocated} ENERGY REMAINING TO ASSIGN</p>
            ) : activeRows.length === 0 ? (
              <p key="pass" className="ca-mono-label text-[0.44rem] text-ca-text-2 animate-ca-fade-in">NO TECHNIQUES QUEUED. ALL FIGHTERS WILL PASS.</p>
            ) : !canAfford ? (
              <p key="cant" className="ca-mono-label text-[0.44rem] text-ca-red animate-ca-fade-in">CANNOT AFFORD THIS QUEUE</p>
            ) : (
              <p key="ready" className="ca-mono-label text-[0.44rem] text-ca-teal animate-ca-fade-in">READY TO COMMIT</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/8 px-5 py-4">
          <button
            type="button"
            disabled={!canAfford || hasUnallocated}
            onClick={() => onConfirm(orderedActionIds)}
            className="ca-display rounded-lg border border-ca-teal/35 bg-[linear-gradient(180deg,rgba(5,216,189,0.16),rgba(5,216,189,0.07))] py-2.5 text-[1.05rem] text-ca-teal transition duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed"
          >
            OK
          </button>
          <button
            type="button"
            onClick={onBack}
            className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] py-2.5 text-[1.05rem] text-ca-text transition duration-150 hover:bg-[rgba(36,34,48,0.8)] active:scale-[0.97]"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}
