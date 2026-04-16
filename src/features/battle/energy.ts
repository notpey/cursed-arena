import type { BattleAbilityTemplate } from '@/features/battle/types'
import { createSeededRandom } from '@/features/battle/random'

export const battleEnergyOrder = ['physical', 'technique', 'vow', 'mental'] as const

export type BattleEnergyType = (typeof battleEnergyOrder)[number]

export type BattleEnergyAmounts = Record<BattleEnergyType, number>

export type BattleEnergyPool = {
  amounts: BattleEnergyAmounts
  focus: BattleEnergyType | null
}

export type BattleEnergyCost = Partial<Record<BattleEnergyType, number>> & { random?: number }

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
  focus: BattleEnergyType | null,
  seed: string,
): BattleEnergyAmounts {
  const next = createEnergyAmounts()
  let remaining = Math.max(0, livingCount)

  if (focus && remaining > 0) {
    next[focus] += 1
    remaining -= 1
  }

  const random = createSeededRandom(seed)
  for (let index = 0; index < remaining; index += 1) {
    const rolledIndex = Math.floor(random() * battleEnergyOrder.length) % battleEnergyOrder.length
    next[battleEnergyOrder[rolledIndex]] += 1
  }

  return next
}

export function createRoundEnergyPool(
  livingCount = 3,
  focus: BattleEnergyType | null = 'technique',
  seed = 'default-energy-seed',
): BattleEnergyPool {
  return {
    amounts: generateRefreshAmounts(livingCount, focus, seed),
    focus,
  }
}

export function refreshRoundEnergy(
  pool: BattleEnergyPool,
  livingCount: number,
  seed = 'default-energy-seed',
  nextFocus?: BattleEnergyType | null,
): BattleEnergyPool {
  const focus = nextFocus === undefined ? pool.focus : nextFocus
  const refresh = generateRefreshAmounts(livingCount, focus, seed)

  return {
    amounts: addEnergyAmounts(pool.amounts, refresh),
    focus,
  }
}

export function getRefreshGain(
  livingCount: number,
  focus: BattleEnergyType | null,
  seed = 'default-energy-seed',
) {
  return generateRefreshAmounts(livingCount, focus, seed)
}

export function setEnergyFocus(
  pool: BattleEnergyPool,
  focus: BattleEnergyType | null,
): BattleEnergyPool {
  return {
    ...pool,
    focus,
  }
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

  if (ability.tags.includes('ULT')) {
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

  if (ability.tags.includes('DEBUFF')) {
    return { physical: 1, vow: 1 }
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

export function canPayEnergy(pool: BattleEnergyPool, cost: BattleEnergyCost) {
  return getSpentEnergyAmountsInternal(pool, cost) !== null
}

export function spendEnergy(pool: BattleEnergyPool, cost: BattleEnergyCost): BattleEnergyPool {
  const spent = getSpentEnergyAmountsInternal(pool, cost)
  if (!spent) return pool

  return {
    amounts: subtractEnergyAmounts(pool.amounts, spent),
    focus: pool.focus,
  }
}
