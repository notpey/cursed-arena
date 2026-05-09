// Shared Team Energy — intentional design
//
// Cursed Arena uses Naruto-Arena-style shared team energy: each team has a
// single pool that all three fighters draw from.  Individual fighters do NOT
// own separate energy pools.
//
// Rules that follow from this:
//   • Ability costs are deducted from the acting fighter's TEAM pool.
//   • All queued actions for a team compete for the same pool; the UI and
//     getBattleCommandBlockReason enforce that queued actions never overcommit
//     the projected pool balance.
//   • Energy generation: +1 random type per living fighter per round, credited
//     to the team pool, not the individual.
//   • Character-specific resources (charges, ammo, stacks) MUST use counters,
//     modes, flags, passives, or modifiers — NOT a separate energy pool.
//
// Do not refactor into per-character energy unless product direction explicitly
// changes.  Future character kits should be balanced around the shared pool.

import type { BattleAbilityTemplate, BattleResourceKey, BattleState, BattleTeamId } from '@/features/battle/types.ts'
import { createSeededRandom } from '@/features/battle/random.ts'

export const battleEnergyOrder = ['physical', 'technique', 'vow', 'mental'] as const

export type BattleEnergyType = (typeof battleEnergyOrder)[number]

export type BattleEnergyAmounts = Record<BattleEnergyType, number>

export type BattleEnergyPool = {
  amounts: BattleEnergyAmounts
}

export type BattleEnergyCost = Partial<Record<BattleEnergyType, number>> & { random?: number }

export type BattleEnergyRefreshRuleId = 'fully_random'

export type BattleEnergyRefreshRule = {
  id: BattleEnergyRefreshRuleId
}

export const battleEnergyRefreshRules: Record<BattleEnergyRefreshRuleId, BattleEnergyRefreshRule> = {
  fully_random: {
    id: 'fully_random',
  },
}

export const defaultBattleEnergyRefreshRule = battleEnergyRefreshRules.fully_random

export const battleEnergyExchangeCost = 5

export const randomEnergyMeta = {
  label: 'Random',
  short: 'RND',
  color: '#4e5060',
  border: 'rgba(78, 80, 96, 0.5)',
  glow: 'rgba(78, 80, 96, 0.25)',
}

export const battleEnergyMeta: Record<
  BattleEnergyType,
  { label: string; short: string; color: string; border: string; glow: string }
> = {
  physical: {
    label: 'Physical',
    short: 'PHY',
    color: '#4ade80',
    border: 'rgba(74, 222, 128, 0.35)',
    glow: 'rgba(74, 222, 128, 0.22)',
  },
  technique: {
    label: 'Cursed Technique',
    short: 'CT',
    color: '#55a7ff',
    border: 'rgba(85, 167, 255, 0.35)',
    glow: 'rgba(85, 167, 255, 0.2)',
  },
  vow: {
    label: 'Binding Vow',
    short: 'VOW',
    color: '#ff4f68',
    border: 'rgba(255, 79, 104, 0.35)',
    glow: 'rgba(255, 79, 104, 0.22)',
  },
  mental: {
    label: 'Mental',
    short: 'MEN',
    color: '#f7f7fb',
    border: 'rgba(247, 247, 251, 0.3)',
    glow: 'rgba(247, 247, 251, 0.18)',
  },
}

function sanitizeCount(value: number | undefined) {
  return Math.max(0, Math.floor(value ?? 0))
}

export function normalizeEnergyAmount(value: number | undefined) {
  return Math.max(0, Math.floor(value ?? 0))
}

export function normalizeEnergyCost(cost: BattleEnergyCost) {
  const next: BattleEnergyCost = {}
  battleEnergyOrder.forEach((type) => {
    const value = normalizeEnergyAmount(cost[type])
    if (value > 0) next[type] = value
  })
  const random = normalizeEnergyAmount(cost.random)
  if (random > 0) next.random = random
  return next
}

export function formatEnergyAmounts(amounts: Partial<Record<BattleEnergyType, number>>) {
  const tokens = battleEnergyOrder
    .map((type) => {
      const amount = amounts[type] ?? 0
      if (amount <= 0) return null
      return `${type.toUpperCase()} +${amount}`
    })
    .filter((token): token is string => Boolean(token))

  return tokens.length > 0 ? tokens.join(', ') : 'no gain'
}

export function countEnergyAmounts(amounts: Partial<Record<BattleEnergyType, number>>) {
  return battleEnergyOrder.reduce((total, type) => total + normalizeEnergyAmount(amounts[type]), 0)
}

export function createEnergyAmounts(values: Partial<Record<BattleEnergyType, number>> = {}): BattleEnergyAmounts {
  return Object.fromEntries(
    battleEnergyOrder.map((type) => [type, sanitizeCount(values[type])]),
  ) as BattleEnergyAmounts
}

export function totalEnergyAmounts(amounts: Partial<Record<BattleEnergyType, number>>) {
  return battleEnergyOrder.reduce((total, type) => total + sanitizeCount(amounts[type]), 0)
}

export function totalEnergyInPool(pool: BattleEnergyPool) {
  return totalEnergyAmounts(pool.amounts)
}

export function getEnergyCount(pool: BattleEnergyPool, type: BattleEnergyType) {
  return pool.amounts[type] ?? 0
}

function addEnergyAmounts(left: BattleEnergyAmounts, right: Partial<Record<BattleEnergyType, number>>) {
  return createEnergyAmounts(
    Object.fromEntries(
      battleEnergyOrder.map((type) => [type, left[type] + sanitizeCount(right[type])]),
    ) as Partial<Record<BattleEnergyType, number>>,
  )
}

function subtractEnergyAmounts(left: BattleEnergyAmounts, right: Partial<Record<BattleEnergyType, number>>) {
  return createEnergyAmounts(
    Object.fromEntries(
      battleEnergyOrder.map((type) => [type, Math.max(0, left[type] - sanitizeCount(right[type]) )]),
    ) as Partial<Record<BattleEnergyType, number>>,
  )
}

function generateRefreshAmounts(
  livingCount: number,
  seed: string,
  rule: BattleEnergyRefreshRule = defaultBattleEnergyRefreshRule,
): BattleEnergyAmounts {
  void rule
  const next = createEnergyAmounts()
  const remaining = Math.max(0, livingCount)

  const random = createSeededRandom(seed)
  for (let index = 0; index < remaining; index += 1) {
    const rolledIndex = Math.floor(random() * battleEnergyOrder.length) % battleEnergyOrder.length
    next[battleEnergyOrder[rolledIndex]] += 1
  }

  return next
}

export function createRoundEnergyPool(
  livingCount = 3,
  seed = 'default-energy-seed',
  rule: BattleEnergyRefreshRule = defaultBattleEnergyRefreshRule,
): BattleEnergyPool {
  return {
    amounts: generateRefreshAmounts(livingCount, seed, rule),
  }
}

export function refreshRoundEnergy(
  pool: BattleEnergyPool,
  livingCount: number,
  seed = 'default-energy-seed',
  rule: BattleEnergyRefreshRule = defaultBattleEnergyRefreshRule,
): BattleEnergyPool {
  const refresh = generateRefreshAmounts(livingCount, seed, rule)

  return {
    amounts: addEnergyAmounts(pool.amounts, refresh),
  }
}

export function getRefreshGain(
  livingCount: number,
  seed = 'default-energy-seed',
  rule: BattleEnergyRefreshRule = defaultBattleEnergyRefreshRule,
) {
  return generateRefreshAmounts(livingCount, seed, rule)
}

export function countEnergyCost(cost: BattleEnergyCost) {
  return battleEnergyOrder.reduce((total, type) => total + sanitizeCount(cost[type]), 0) + sanitizeCount(cost.random)
}

export function countTypedCost(cost: BattleEnergyCost) {
  return battleEnergyOrder.reduce((total, type) => total + sanitizeCount(cost[type]), 0)
}

export function sumEnergyCosts(costs: BattleEnergyCost[]) {
  return costs.reduce<BattleEnergyCost>((total, cost) => {
    const next: BattleEnergyCost = { ...total }
    battleEnergyOrder.forEach((type) => {
      const amount = sanitizeCount(cost[type])
      if (amount > 0) {
        next[type] = sanitizeCount(next[type]) + amount
      }
    })

    const random = sanitizeCount(cost.random)
    if (random > 0) {
      next.random = sanitizeCount(next.random) + random
    }

    return next
  }, {})
}

export function getAbilityEnergyCost(ability: BattleAbilityTemplate): BattleEnergyCost {
  if (ability.kind === 'pass') return {}

  if (ability.energyCost) {
    const explicit = Object.fromEntries(
      battleEnergyOrder
        .map((type) => [type, sanitizeCount(ability.energyCost?.[type])] as const)
        .filter((entry) => entry[1] > 0),
    ) as BattleEnergyCost

    if (sanitizeCount(ability.energyCost.random) > 0) {
      explicit.random = sanitizeCount(ability.energyCost.random)
    }

    return explicit
  }

  if (ability.classes.includes('Ultimate')) {
    return { technique: 1, vow: 1, mental: 1 }
  }

  if (ability.kind === 'heal') {
    return ability.targetRule === 'ally-all' ? { mental: 1, technique: 1 } : { mental: 1 }
  }

  if (ability.kind === 'defend') {
    return { technique: 1 }
  }

  if (ability.kind === 'buff') {
    return { vow: 1 }
  }

  if (ability.kind === 'debuff') {
    return { vow: 1, mental: 1 }
  }

  if (ability.kind === 'utility') {
    return { technique: 1, mental: 1 }
  }

  if (ability.targetRule === 'enemy-all') {
    return { physical: 1, technique: 1 }
  }

  return { physical: 1 }
}

function getSpentEnergyAmountsInternal(pool: BattleEnergyPool, cost: BattleEnergyCost): BattleEnergyAmounts | null {
  const remaining = createEnergyAmounts(pool.amounts)
  const spent = createEnergyAmounts()

  for (const type of battleEnergyOrder) {
    const required = sanitizeCount(cost[type])
    if (remaining[type] < required) return null
    remaining[type] -= required
    spent[type] += required
  }

  let randomRequired = sanitizeCount(cost.random)
  if (randomRequired === 0) return spent

  const sortedTypes = [...battleEnergyOrder].sort((left, right) => {
    const delta = remaining[right] - remaining[left]
    if (delta !== 0) return delta
    return battleEnergyOrder.indexOf(left) - battleEnergyOrder.indexOf(right)
  })

  for (const type of sortedTypes) {
    if (randomRequired <= 0) break
    const spendable = Math.min(remaining[type], randomRequired)
    remaining[type] -= spendable
    spent[type] += spendable
    randomRequired -= spendable
  }

  if (randomRequired > 0) return null
  return spent
}

export function getSpentEnergyAmounts(pool: BattleEnergyPool, cost: BattleEnergyCost) {
  return getSpentEnergyAmountsInternal(pool, cost)
}

function buildExchangeSpendAmounts(pool: BattleEnergyPool, targetType: BattleEnergyType, exchangeCost: number) {
  const spend = createEnergyAmounts()
  let remaining = sanitizeCount(exchangeCost)
  const sources = [...battleEnergyOrder].sort((left, right) => {
    const leftPenalty = left === targetType ? 1 : 0
    const rightPenalty = right === targetType ? 1 : 0
    if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty

    const delta = pool.amounts[right] - pool.amounts[left]
    if (delta !== 0) return delta
    return battleEnergyOrder.indexOf(left) - battleEnergyOrder.indexOf(right)
  })

  for (const type of sources) {
    if (remaining <= 0) break
    const take = Math.min(pool.amounts[type], remaining)
    if (take <= 0) continue
    spend[type] = take
    remaining -= take
  }

  if (remaining > 0) {
    return null
  }

  return spend
}

export function canPayEnergy(pool: BattleEnergyPool, cost: BattleEnergyCost) {
  return getSpentEnergyAmountsInternal(pool, cost) !== null
}

export function getEnergyResourceDelta(amounts: Partial<Record<BattleEnergyType, number>>, sign: 1 | -1) {
  const entries = battleEnergyOrder
    .map((type) => {
      const value = normalizeEnergyAmount(amounts[type]) * sign
      return [type, value] as const
    })
    .filter((entry) => entry[1] !== 0)

  return {
    reserve: countEnergyAmounts(amounts) * sign,
    ...Object.fromEntries(entries),
  } as Partial<Record<BattleResourceKey, number>>
}

export function gainEnergyPool(
  pool: BattleEnergyPool,
  amount: BattleEnergyCost,
  seed: string,
) {
  const normalized = normalizeEnergyCost(amount)
  const gained = createEnergyAmounts()
  const nextAmounts = createEnergyAmounts(pool.amounts)

  battleEnergyOrder.forEach((type) => {
    const typed = normalizeEnergyAmount(normalized[type])
    if (typed <= 0) return
    gained[type] += typed
    nextAmounts[type] += typed
  })

  const random = normalizeEnergyAmount(normalized.random)
  if (random > 0) {
    const randomizer = createSeededRandom(seed)
    for (let index = 0; index < random; index += 1) {
      const rolled = Math.floor(randomizer() * battleEnergyOrder.length) % battleEnergyOrder.length
      const type = battleEnergyOrder[rolled]
      gained[type] += 1
      nextAmounts[type] += 1
    }
  }

  return {
    pool: {
      amounts: nextAmounts,
    },
    gained,
  }
}

export function drainEnergyPool(
  pool: BattleEnergyPool,
  amount: BattleEnergyCost,
) {
  const normalized = normalizeEnergyCost(amount)
  const drained = createEnergyAmounts()
  const nextAmounts = createEnergyAmounts(pool.amounts)

  battleEnergyOrder.forEach((type) => {
    const requested = normalizeEnergyAmount(normalized[type])
    if (requested <= 0) return
    const taken = Math.min(nextAmounts[type], requested)
    nextAmounts[type] -= taken
    drained[type] += taken
  })

  let randomRemaining = normalizeEnergyAmount(normalized.random)
  while (randomRemaining > 0) {
    const sourceType = battleEnergyOrder
      .filter((type) => nextAmounts[type] > 0)
      .sort((left, right) => nextAmounts[right] - nextAmounts[left] || battleEnergyOrder.indexOf(left) - battleEnergyOrder.indexOf(right))[0]
    if (!sourceType) break
    nextAmounts[sourceType] -= 1
    drained[sourceType] += 1
    randomRemaining -= 1
  }

  return {
    pool: {
      amounts: nextAmounts,
    },
    drained,
  }
}

export function getEnergyPool(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.playerEnergy : state.enemyEnergy
}

export function setEnergyPool(state: BattleState, team: BattleTeamId, pool: BattleState['playerEnergy']) {
  if (team === 'player') {
    state.playerEnergy = pool
  } else {
    state.enemyEnergy = pool
  }
}

export function canExchangeEnergy(pool: BattleEnergyPool, exchangeCost = battleEnergyExchangeCost) {
  return totalEnergyInPool(pool) >= sanitizeCount(exchangeCost)
}

export function exchangeEnergy(
  pool: BattleEnergyPool,
  targetType: BattleEnergyType,
  exchangeCost = battleEnergyExchangeCost,
): BattleEnergyPool {
  const normalizedCost = sanitizeCount(exchangeCost)
  if (normalizedCost <= 0) return pool

  const spend = buildExchangeSpendAmounts(pool, targetType, normalizedCost)
  if (!spend) return pool

  return {
    amounts: addEnergyAmounts(subtractEnergyAmounts(pool.amounts, spend), { [targetType]: 1 }),
  }
}

export function spendEnergy(pool: BattleEnergyPool, cost: BattleEnergyCost): BattleEnergyPool {
  const spent = getSpentEnergyAmountsInternal(pool, cost)
  if (!spent) return pool

  return {
    amounts: subtractEnergyAmounts(pool.amounts, spent),
  }
}
