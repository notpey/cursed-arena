import { describe, expect, test } from 'vitest'
import {
  canPayEnergy,
  createEnergyAmounts,
  createRoundEnergyPool,
  spendEnergy,
  totalEnergyInPool,
  type BattleEnergyPool,
} from '@/features/battle/energy'

function pool(amounts: Parameters<typeof createEnergyAmounts>[0], focus: BattleEnergyPool['focus'] = 'technique'): BattleEnergyPool {
  return {
    amounts: createEnergyAmounts(amounts),
    focus,
  }
}

describe('battle energy model', () => {
  test('round generation is deterministic and focus guarantees one matching pip', () => {
    const first = createRoundEnergyPool(3, 'technique', 'alpha-seed')
    const second = createRoundEnergyPool(3, 'technique', 'alpha-seed')

    expect(first).toEqual(second)
    expect(first.amounts.technique).toBeGreaterThanOrEqual(1)
    expect(totalEnergyInPool(first)).toBe(3)
  })

  test('typed costs must be payable by matching typed CE', () => {
    const exactPool = pool({ physical: 1, technique: 1 }, 'physical')

    expect(canPayEnergy(exactPool, { physical: 1, random: 1 })).toBe(true)
    expect(canPayEnergy(exactPool, { physical: 2 })).toBe(false)
    expect(canPayEnergy(exactPool, { vow: 1 })).toBe(false)
  })

  test('spendEnergy removes typed CE from the actual matching buckets', () => {
    const current = pool({ physical: 1, technique: 3, vow: 1 }, 'technique')
    const after = spendEnergy(current, { technique: 1, random: 2 })

    expect(after.amounts.technique).toBe(0)
    expect(after.amounts.vow).toBe(1)
    expect(after.amounts.physical).toBe(1)
    expect(totalEnergyInPool(after)).toBe(2)
  })
})
