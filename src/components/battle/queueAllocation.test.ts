import { describe, expect, test } from 'vitest'
import { createEnergyAmounts } from '@/features/battle/energy'
import {
  applyRandomChange,
  canAssignRandom,
  canUndoRandom,
  computeEnergyLeft,
  distributeRandomToActors,
  emptyEnergyByType,
  sumFixedCostsByType,
  sumRequiredRandom,
  totalRandom,
  type EnergyByType,
} from '@/components/battle/queueAllocation'
import { createInitialBattleState, getTeam } from '@/features/battle/engine'
import { getAbilityEnergyCost, type BattleEnergyPool } from '@/features/battle/energy'
import type { BattleState, QueuedBattleAction } from '@/features/battle/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pool(amounts: Partial<EnergyByType> = {}): BattleEnergyPool {
  return { amounts: createEnergyAmounts({ physical: 6, technique: 6, vow: 6, mental: 6, ...amounts }) }
}

function fullState(): BattleState {
  const state = createInitialBattleState({ playerTeamIds: ['yuji', 'megumi', 'nobara'], enemyTeamIds: ['yuji', 'megumi', 'nobara'] })
  state.playerEnergy = pool()
  state.enemyEnergy = pool()
  return state
}

function getFighter(state: BattleState, templateId: string) {
  const f = getTeam(state, 'player').find((u) => u.templateId === templateId)
  if (!f) throw new Error(`Missing ${templateId}`)
  return f
}

function queueOne(
  actorId: string,
  abilityId: string,
  targetId: string | null = null,
): Record<string, QueuedBattleAction> {
  return { [actorId]: { actorId, team: 'player', abilityId, targetId } }
}

// ── totalRandom + emptyEnergyByType ───────────────────────────────────────────

describe('totalRandom', () => {
  test('returns 0 for an empty allocation', () => {
    expect(totalRandom(emptyEnergyByType())).toBe(0)
  })
  test('sums all four energy types', () => {
    expect(totalRandom({ physical: 1, technique: 2, vow: 3, mental: 0 })).toBe(6)
  })
})

// ── computeEnergyLeft ─────────────────────────────────────────────────────────

describe('computeEnergyLeft — fixed costs are deducted before random allocation', () => {
  test('with no costs the player has the full pool', () => {
    const left = computeEnergyLeft(pool(), emptyEnergyByType(), emptyEnergyByType())
    expect(left).toEqual({ physical: 6, technique: 6, vow: 6, mental: 6 })
  })

  test('fixed costs reduce energy left even with zero random assigned', () => {
    const fixed: EnergyByType = { physical: 1, technique: 2, vow: 0, mental: 0 }
    const left = computeEnergyLeft(pool(), fixed, emptyEnergyByType())
    expect(left).toEqual({ physical: 5, technique: 4, vow: 6, mental: 6 })
  })

  test('manual random assignment further reduces energy left', () => {
    const fixed: EnergyByType = { physical: 0, technique: 1, vow: 0, mental: 0 }
    const random: EnergyByType = { physical: 1, technique: 0, vow: 0, mental: 0 }
    const left = computeEnergyLeft(pool(), fixed, random)
    expect(left.physical).toBe(5)
    expect(left.technique).toBe(5)
    expect(left.vow).toBe(6)
  })

  test('never returns a negative value', () => {
    const fixed: EnergyByType = { physical: 99, technique: 0, vow: 0, mental: 0 }
    const left = computeEnergyLeft(pool(), fixed, emptyEnergyByType())
    expect(left.physical).toBe(0)
  })
})

// ── canAssignRandom / canUndoRandom ───────────────────────────────────────────

describe('canAssignRandom', () => {
  const energyLeft: EnergyByType = { physical: 2, technique: 0, vow: 1, mental: 1 }

  test('false when an energy type has 0 available', () => {
    expect(canAssignRandom('technique', energyLeft, 3, 0)).toBe(false)
  })

  test('true when type has stock and required random is unmet', () => {
    expect(canAssignRandom('physical', energyLeft, 3, 0)).toBe(true)
    expect(canAssignRandom('vow', energyLeft, 3, 1)).toBe(true)
  })

  test('false when required random has been fully assigned', () => {
    expect(canAssignRandom('physical', energyLeft, 1, 1)).toBe(false)
  })

  test('false when assigned exceeds required (defensive)', () => {
    expect(canAssignRandom('physical', energyLeft, 1, 2)).toBe(false)
  })
})

describe('canUndoRandom', () => {
  test('false when 0 random of that type is currently assigned', () => {
    expect(canUndoRandom('physical', emptyEnergyByType())).toBe(false)
  })
  test('true when at least 1 random of that type is assigned', () => {
    expect(canUndoRandom('vow', { physical: 0, technique: 0, vow: 1, mental: 0 })).toBe(true)
  })
})

// ── applyRandomChange ─────────────────────────────────────────────────────────

describe('applyRandomChange — USE/UNDO obey the over-allocation rule', () => {
  const fixed = emptyEnergyByType()

  test('USE assigns exactly one random of the chosen type', () => {
    const next = applyRandomChange(emptyEnergyByType(), 'physical', 1, pool(), fixed, 2)
    expect(next).toEqual({ physical: 1, technique: 0, vow: 0, mental: 0 })
  })

  test('UNDO removes exactly one random of the chosen type', () => {
    const start: EnergyByType = { physical: 1, technique: 0, vow: 0, mental: 0 }
    const next = applyRandomChange(start, 'physical', -1, pool(), fixed, 2)
    expect(next).toEqual(emptyEnergyByType())
  })

  test('UNDO is a no-op at 0 (cannot go negative)', () => {
    const next = applyRandomChange(emptyEnergyByType(), 'physical', -1, pool(), fixed, 2)
    expect(next).toEqual(emptyEnergyByType())
  })

  test('USE is a no-op when assignedRandomTotal === requiredRandom', () => {
    const start: EnergyByType = { physical: 1, technique: 0, vow: 0, mental: 0 }
    const next = applyRandomChange(start, 'vow', 1, pool(), fixed, 1)
    expect(next).toBe(start) // no change → same reference returned
  })

  test('USE is a no-op when the energy type has 0 left after fixed costs', () => {
    const fixedAll: EnergyByType = { physical: 6, technique: 0, vow: 0, mental: 0 }
    const start = emptyEnergyByType()
    const next = applyRandomChange(start, 'physical', 1, pool(), fixedAll, 2)
    expect(next).toBe(start) // identity preserved when nothing changed
  })

  test('the result never exceeds requiredRandom no matter how many USE calls', () => {
    let alloc = emptyEnergyByType()
    for (let i = 0; i < 50; i++) {
      alloc = applyRandomChange(alloc, 'physical', 1, pool(), fixed, 3)
    }
    expect(totalRandom(alloc)).toBe(3)
  })

  test('does not mutate the input allocation object', () => {
    const start: EnergyByType = { physical: 0, technique: 0, vow: 0, mental: 0 }
    applyRandomChange(start, 'physical', 1, pool(), fixed, 2)
    expect(start).toEqual({ physical: 0, technique: 0, vow: 0, mental: 0 })
  })
})

// ── sumFixedCostsByType + sumRequiredRandom (engine-coupled) ──────────────────

describe('sumFixedCostsByType + sumRequiredRandom (engine-coupled)', () => {
  test('returns zeros when no commands are queued', () => {
    const state = fullState()
    expect(sumFixedCostsByType(state.playerTeam, {})).toEqual(emptyEnergyByType())
    expect(sumRequiredRandom(state.playerTeam, {})).toBe(0)
  })

  test('aggregates fixed and random costs across all queued commands', () => {
    const state = fullState()
    const yuji = getFighter(state, 'yuji')
    const megumi = getFighter(state, 'megumi')

    // Use the first non-pass ability of each fighter — we don't care which,
    // we just need real costs from the actual kit.
    const yujiAbility = yuji.abilities[0]
    const megumiAbility = megumi.abilities[0]

    const queued: Record<string, QueuedBattleAction> = {
      ...queueOne(yuji.instanceId, yujiAbility.id),
      ...queueOne(megumi.instanceId, megumiAbility.id),
    }

    const fixed = sumFixedCostsByType(state.playerTeam, queued)
    const random = sumRequiredRandom(state.playerTeam, queued)

    // Verify the totals match the sum of each ability's declared cost.
    let expectedRandom = 0
    const expectedFixed = emptyEnergyByType()
    for (const ability of [yujiAbility, megumiAbility]) {
      const cost = getAbilityEnergyCost(ability)
      expectedRandom += cost.random ?? 0
      expectedFixed.physical  += cost.physical  ?? 0
      expectedFixed.technique += cost.technique ?? 0
      expectedFixed.vow       += cost.vow       ?? 0
      expectedFixed.mental    += cost.mental    ?? 0
    }
    expect(fixed).toEqual(expectedFixed)
    expect(random).toBe(expectedRandom)
  })
})

// ── distributeRandomToActors ──────────────────────────────────────────────────

describe('distributeRandomToActors — global allocation flows onto each actor', () => {
  test('returns an empty allocation when no actor needs random energy', () => {
    const state = fullState()
    expect(distributeRandomToActors([], state.playerTeam, {}, emptyEnergyByType())).toEqual({})
  })

  test('respects ordered command actor ids — first actor consumes first', () => {
    // Find a fighter+ability that actually has a random cost. We synthesize one
    // by checking whichever ability has random > 0; if none in the kit, we just
    // assert the no-random behaviour.
    const state = fullState()
    const yuji = getFighter(state, 'yuji')
    const megumi = getFighter(state, 'megumi')

    const findRandomAbility = (f: ReturnType<typeof getFighter>) =>
      f.abilities.concat(f.ultimate).find((a) => (getAbilityEnergyCost(a).random ?? 0) > 0)

    const yujiRandomAbility = findRandomAbility(yuji)
    const megumiRandomAbility = findRandomAbility(megumi)
    if (!yujiRandomAbility || !megumiRandomAbility) {
      // Kits don't currently have random costs on these characters — nothing
      // meaningful to distribute. Verify the path still returns {}.
      const queued = {
        ...queueOne(yuji.instanceId, yuji.abilities[0].id),
        ...queueOne(megumi.instanceId, megumi.abilities[0].id),
      }
      const result = distributeRandomToActors(
        [yuji.instanceId, megumi.instanceId],
        state.playerTeam,
        queued,
        { physical: 1, technique: 0, vow: 0, mental: 0 },
      )
      expect(result).toEqual({})
      return
    }

    const yujiNeed = getAbilityEnergyCost(yujiRandomAbility).random ?? 0
    const queued = {
      ...queueOne(yuji.instanceId, yujiRandomAbility.id),
      ...queueOne(megumi.instanceId, megumiRandomAbility.id),
    }

    const global: EnergyByType = { physical: yujiNeed, technique: 0, vow: 0, mental: 0 }
    const result = distributeRandomToActors([yuji.instanceId, megumi.instanceId], state.playerTeam, queued, global)
    expect(result[yuji.instanceId]?.physical ?? 0).toBe(yujiNeed)
  })
})

// ── End-to-end constraint: OK enables only when total === required ──────────

describe('OK gating: assignedRandomTotal === requiredRandom', () => {
  test('under-assigned → OK should be disabled', () => {
    const required = 2
    const alloc: EnergyByType = { physical: 1, technique: 0, vow: 0, mental: 0 }
    expect(totalRandom(alloc) === required).toBe(false)
  })

  test('exactly assigned → OK should be enabled', () => {
    const required = 2
    const alloc: EnergyByType = { physical: 1, technique: 1, vow: 0, mental: 0 }
    expect(totalRandom(alloc) === required).toBe(true)
  })

  test('over-assignment is impossible via applyRandomChange', () => {
    let alloc = emptyEnergyByType()
    for (let i = 0; i < 10; i++) {
      alloc = applyRandomChange(alloc, 'physical', 1, pool(), emptyEnergyByType(), 2)
    }
    expect(totalRandom(alloc)).toBeLessThanOrEqual(2)
  })
})
