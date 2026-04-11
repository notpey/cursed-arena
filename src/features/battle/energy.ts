import type { BattleAbilityTemplate } from '@/features/battle/types'

export const battleEnergyOrder = ['physical', 'technique', 'vow', 'mental'] as const

export type BattleEnergyType = (typeof battleEnergyOrder)[number]

export type BattleEnergyPool = {
  reserve: number
  focus: BattleEnergyType | null
  focusAvailable: boolean
}

export type BattleEnergyCost = Partial<Record<BattleEnergyType, number>>

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

export function createRoundEnergyPool(
  livingCount = 3,
  focus: BattleEnergyType | null = 'technique',
): BattleEnergyPool {
  return {
    reserve: Math.max(0, livingCount),
    focus,
    focusAvailable: true,
  }
}

export function refreshRoundEnergy(
  pool: BattleEnergyPool,
  livingCount: number,
  nextFocus?: BattleEnergyType | null,
): BattleEnergyPool {
  return {
    reserve: pool.reserve + Math.max(0, livingCount),
    focus: nextFocus === undefined ? pool.focus : nextFocus,
    focusAvailable: true,
  }
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
  return battleEnergyOrder.reduce((total, type) => total + (cost[type] ?? 0), 0)
}

export function getAbilityEnergyCost(ability: BattleAbilityTemplate): BattleEnergyCost {
  if (ability.kind === 'pass') return {}

  if (ability.energyCost) {
    const explicit = Object.fromEntries(
      battleEnergyOrder
        .map((type) => [type, Math.max(0, Math.floor(ability.energyCost?.[type] ?? 0))] as const)
        .filter((entry) => entry[1] > 0),
    ) as BattleEnergyCost

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

export function getFocusDiscountType(
  pool: BattleEnergyPool,
  cost: BattleEnergyCost,
): BattleEnergyType | null {
  if (!pool.focusAvailable || !pool.focus) return null
  return cost[pool.focus] ? pool.focus : null
}

export function canPayEnergy(pool: BattleEnergyPool, cost: BattleEnergyCost) {
  const totalCost = countEnergyCost(cost)
  const discount = getFocusDiscountType(pool, cost) ? 1 : 0
  return pool.reserve >= totalCost - discount
}

export function spendEnergy(pool: BattleEnergyPool, cost: BattleEnergyCost): BattleEnergyPool {
  const discountType = getFocusDiscountType(pool, cost)
  const discount = discountType ? 1 : 0

  return {
    reserve: Math.max(0, pool.reserve - Math.max(0, countEnergyCost(cost) - discount)),
    focus: pool.focus,
    focusAvailable: discountType ? false : pool.focusAvailable,
  }
}

