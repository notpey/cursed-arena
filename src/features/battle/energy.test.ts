import { describe, expect, test } from 'vitest'
import {
  canExchangeEnergy,
  canPayEnergy,
  createEnergyAmounts,
  createRoundEnergyPool,
  exchangeEnergy,
  spendEnergy,
  totalEnergyInPool,
  type BattleEnergyPool,
} from '@/features/battle/energy'

function pool(amounts: Parameters<typeof createEnergyAmounts>[0]): BattleEnergyPool {
  return {
    amounts: createEnergyAmounts(amounts),
  }
}

describe('battle energy model', () => {
  test('round generation is deterministic and fully random by default', () => {
    const first = createRoundEnergyPool(3, 'alpha-seed')
    const second = createRoundEnergyPool(3, 'alpha-seed')

    expect(first).toEqual(second)
    expect(totalEnergyInPool(first)).toBe(3)
  })

  test('typed costs must be payable by matching typed CE', () => {
    const exactPool = pool({ physical: 1, technique: 1 })

    expect(canPayEnergy(exactPool, { physical: 1, random: 1 })).toBe(true)
    expect(canPayEnergy(exactPool, { physical: 2 })).toBe(false)
    expect(canPayEnergy(exactPool, { vow: 1 })).toBe(false)
  })

  test('spendEnergy removes typed CE from the actual matching buckets', () => {
    const current = pool({ physical: 1, technique: 3, vow: 1 })
    const after = spendEnergy(current, { technique: 1, random: 2 })

    expect(after.amounts.technique).toBe(0)
    expect(after.amounts.vow).toBe(1)
    expect(after.amounts.physical).toBe(1)
    expect(totalEnergyInPool(after)).toBe(2)
  })

  test('exchangeEnergy converts 5 total chakra into 1 chosen chakra', () => {
    const current = pool({ physical: 3, technique: 2, vow: 1 })
    const after = exchangeEnergy(current, 'mental')

    expect(canExchangeEnergy(current)).toBe(true)
    expect(after.amounts.mental).toBe(1)
    expect(totalEnergyInPool(after)).toBe(2)
  })
})
