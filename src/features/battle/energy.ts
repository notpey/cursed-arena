import type { BattleAbilityTemplate } from '@/features/battle/types.ts'
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
  let remaining = Math.max(0, livingCount)

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
