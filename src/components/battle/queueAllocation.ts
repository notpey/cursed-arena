/**
 * Pure helpers for the Naruto-Arena-style queue commit modal.
 *
 * These helpers do not touch React, the engine, or persistence — they exist so
 * the manual Random-Energy allocation rules can be unit-tested in isolation.
 *
 * Terminology note: this is Cursed Arena. Use "Random Energy" for the
 * flexible-cost resource.
 */

import {
  battleEnergyOrder,
  getEnergyCount,
  type BattleEnergyCost,
  type BattleEnergyPool,
  type BattleEnergyType,
} from '@/features/battle/energy'
import { PASS_ABILITY_ID } from '@/features/battle/data'
import type { BattleAbilityTemplate, BattleFighterState, QueuedBattleAction } from '@/features/battle/types'
import { getAbilityEnergyCost } from '@/features/battle/energy'

// ── Types ─────────────────────────────────────────────────────────────────────

/** A per-type tally of Energy of any kind (fixed cost, manual allocation, etc.). */
export type EnergyByType = Record<BattleEnergyType, number>

/** A per-actor record of the Random-Energy types the player chose for them. */
export type PerActorRandomAllocation = Record<string, Partial<Record<BattleEnergyType, number>>>

// ── Tally helpers ─────────────────────────────────────────────────────────────

export function emptyEnergyByType(): EnergyByType {
  return { physical: 0, technique: 0, vow: 0, mental: 0 }
}

export function totalRandom(allocation: EnergyByType): number {
  return battleEnergyOrder.reduce((sum, type) => sum + (allocation[type] ?? 0), 0)
}

// ── Cost extraction ───────────────────────────────────────────────────────────

/**
 * Sum the fixed (typed, non-random) costs across every queued, non-pass
 * command for the player team. The result is what is automatically reserved
 * from the player's pool — the player never assigns these manually.
 */
export function sumFixedCostsByType(
  playerTeam: BattleFighterState[],
  queued: Record<string, QueuedBattleAction>,
): EnergyByType {
  const totals = emptyEnergyByType()
  for (const fighter of playerTeam) {
    const command = queued[fighter.instanceId]
    if (!command || command.team !== 'player') continue
    if (command.abilityId === PASS_ABILITY_ID) continue
    const ability = findAbility(fighter, command.abilityId)
    if (!ability) continue
    const cost = getAbilityEnergyCost(ability)
    for (const type of battleEnergyOrder) {
      totals[type] += cost[type] ?? 0
    }
  }
  return totals
}

/** Sum the random-cost component across every queued, non-pass command. */
export function sumRequiredRandom(
  playerTeam: BattleFighterState[],
  queued: Record<string, QueuedBattleAction>,
): number {
  let total = 0
  for (const fighter of playerTeam) {
    const command = queued[fighter.instanceId]
    if (!command || command.team !== 'player') continue
    if (command.abilityId === PASS_ABILITY_ID) continue
    const ability = findAbility(fighter, command.abilityId)
    if (!ability) continue
    total += getAbilityEnergyCost(ability).random ?? 0
  }
  return total
}

// ── Energy-Left calculation ───────────────────────────────────────────────────

/**
 * What the player has remaining after fixed costs and current Random-Energy
 * assignments. Never negative.
 */
export function computeEnergyLeft(
  pool: BattleEnergyPool,
  fixedByType: EnergyByType,
  randomByType: EnergyByType,
): EnergyByType {
  const result = emptyEnergyByType()
  for (const type of battleEnergyOrder) {
    const have = getEnergyCount(pool, type)
    result[type] = Math.max(0, have - (fixedByType[type] ?? 0) - (randomByType[type] ?? 0))
  }
  return result
}

// ── Manual allocation rules ───────────────────────────────────────────────────

/** True iff the player can assign one more Random Energy of `type` right now. */
export function canAssignRandom(
  type: BattleEnergyType,
  energyLeft: EnergyByType,
  requiredRandom: number,
  currentRandomTotal: number,
): boolean {
  if (currentRandomTotal >= requiredRandom) return false
  return (energyLeft[type] ?? 0) > 0
}

/** True iff the player has at least one Random Energy of `type` they can undo. */
export function canUndoRandom(
  type: BattleEnergyType,
  randomByType: EnergyByType,
): boolean {
  return (randomByType[type] ?? 0) > 0
}

/**
 * Apply a USE/UNDO action to the random-allocation map.  Returns the new
 * allocation; the input is never mutated. Guards against over-allocation and
 * negative values — callers can rely on the result satisfying:
 *   0 <= total <= requiredRandom
 *   randomByType[type] >= 0 for every type
 */
export function applyRandomChange(
  randomByType: EnergyByType,
  type: BattleEnergyType,
  delta: 1 | -1,
  pool: BattleEnergyPool,
  fixedByType: EnergyByType,
  requiredRandom: number,
): EnergyByType {
  const next: EnergyByType = { ...randomByType }
  if (delta === 1) {
    const energyLeft = computeEnergyLeft(pool, fixedByType, randomByType)
    if (!canAssignRandom(type, energyLeft, requiredRandom, totalRandom(randomByType))) return randomByType
    next[type] = (next[type] ?? 0) + 1
    return next
  }
  if (!canUndoRandom(type, randomByType)) return randomByType
  next[type] = (next[type] ?? 0) - 1
  return next
}

// ── Per-actor distribution ────────────────────────────────────────────────────

/**
 * Distribute the player's manually assigned Random Energy onto each actor's
 * randomCostAllocation, in queue order. Each actor consumes exactly its
 * ability's `random` cost from the global pool. The result is what
 * BattlePage.applyRandomAllocationToQueuedActions consumes.
 */
export function distributeRandomToActors(
  orderedCommandActorIds: string[],
  playerTeam: BattleFighterState[],
  queued: Record<string, QueuedBattleAction>,
  globalRandom: EnergyByType,
): PerActorRandomAllocation {
  const remaining: EnergyByType = { ...globalRandom }
  const allocation: PerActorRandomAllocation = {}

  for (const actorId of orderedCommandActorIds) {
    const fighter = playerTeam.find((f) => f.instanceId === actorId)
    if (!fighter) continue
    const command = queued[actorId]
    if (!command || command.abilityId === PASS_ABILITY_ID) continue
    const ability = findAbility(fighter, command.abilityId)
    if (!ability) continue
    let needed = getAbilityEnergyCost(ability).random ?? 0
    if (needed <= 0) continue

    const actorAlloc: Partial<Record<BattleEnergyType, number>> = {}
    for (const type of battleEnergyOrder) {
      if (needed <= 0) break
      const take = Math.min(remaining[type] ?? 0, needed)
      if (take <= 0) continue
      actorAlloc[type] = take
      remaining[type] -= take
      needed -= take
    }
    if (Object.keys(actorAlloc).length > 0) allocation[actorId] = actorAlloc
  }

  return allocation
}

// ── Aggregate cost (for canPayEnergy check) ───────────────────────────────────

export function aggregateAggregateCost(
  fixedByType: EnergyByType,
  randomByType: EnergyByType,
): BattleEnergyCost {
  const result: BattleEnergyCost = {}
  for (const type of battleEnergyOrder) {
    const total = (fixedByType[type] ?? 0) + (randomByType[type] ?? 0)
    if (total > 0) result[type] = total
  }
  return result
}

// ── Internals ─────────────────────────────────────────────────────────────────

function findAbility(fighter: BattleFighterState, abilityId: string): BattleAbilityTemplate | null {
  return fighter.abilities.concat(fighter.ultimate).find((a) => a.id === abilityId) ?? null
}
