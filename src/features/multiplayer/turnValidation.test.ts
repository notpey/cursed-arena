import { describe, expect, test } from 'vitest'
import { createEnergyAmounts } from '@/features/battle/energy'
import {
  createInitialBattleState,
  getTeam,
  resolveTeamTurnTimeline,
} from '@/features/battle/engine'
import { validateSubmittedTurnCommands } from '@/features/multiplayer/turnValidation'
import type { BattleState, QueuedBattleAction } from '@/features/battle/types'

function getFighter(state: BattleState, team: 'player' | 'enemy', templateId: string) {
  const fighter = getTeam(state, team).find((unit) => unit.templateId === templateId)
  if (!fighter) {
    throw new Error(`Missing fighter ${team}:${templateId}`)
  }
  return fighter
}

function createChargedBattleState() {
  const state = createInitialBattleState({
    playerTeamIds: ['yuji', 'nobara', 'megumi'],
    enemyTeamIds: ['yuji', 'nobara', 'megumi'],
  })
  const chargedPool = {
    amounts: createEnergyAmounts({ physical: 6, technique: 6, vow: 6, mental: 6 }),
  }
  state.playerEnergy = { ...chargedPool, amounts: { ...chargedPool.amounts } }
  state.enemyEnergy = { ...chargedPool, amounts: { ...chargedPool.amounts } }
  return state
}

function makeCommand(actorId: string, abilityId: string, targetId: string | null): QueuedBattleAction {
  return {
    actorId,
    team: 'player',
    abilityId,
    targetId,
  }
}

function expectRejectedReason(result: ReturnType<typeof validateSubmittedTurnCommands>, actorId: string) {
  if (result.ok) {
    throw new Error('Expected submitted turn validation to fail')
  }

  const issue = result.issues.find((candidate) => candidate.actorId === actorId)
  if (!issue) {
    throw new Error(`Expected validation issue for ${actorId}`)
  }
  return issue.reason
}

describe('validateSubmittedTurnCommands', () => {
  test('rejects invalid target server-side', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = {}

    const result = validateSubmittedTurnCommands(
      state,
      'player',
      { [yuji.instanceId]: makeCommand(yuji.instanceId, yuji.abilities[0].id, 'missing-target') },
      [yuji.instanceId],
    )

    expect(expectRejectedReason(result, yuji.instanceId)).toBe('Invalid target')
  })

  test('rejects missing random allocation', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = { random: 2 }

    const result = validateSubmittedTurnCommands(
      state,
      'player',
      { [yuji.instanceId]: makeCommand(yuji.instanceId, yuji.abilities[0].id, target.instanceId) },
      [yuji.instanceId],
    )

    expect(expectRejectedReason(result, yuji.instanceId)).toBe('Missing random resource allocation')
  })

  test('rejects incomplete random allocation', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = { random: 2 }

    const command = makeCommand(yuji.instanceId, yuji.abilities[0].id, target.instanceId)
    command.randomCostAllocation = { physical: 1 }

    const result = validateSubmittedTurnCommands(
      state,
      'player',
      { [yuji.instanceId]: command },
      [yuji.instanceId],
    )

    expect(expectRejectedReason(result, yuji.instanceId)).toBe('Incomplete random resource allocation (1/2)')
  })

  test('rejects shared energy overcommit in submitted order', () => {
    const state = createChargedBattleState()
    state.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 0, vow: 0, mental: 0 })
    const yuji = getFighter(state, 'player', 'yuji')
    const nobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = { physical: 1 }
    nobara.abilities[0].targetRule = 'enemy-single'
    nobara.abilities[0].energyCost = { physical: 1 }

    const result = validateSubmittedTurnCommands(
      state,
      'player',
      {
        [yuji.instanceId]: makeCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId),
        [nobara.instanceId]: makeCommand(nobara.instanceId, nobara.abilities[0].id, enemyNobara.instanceId),
      },
      [yuji.instanceId, nobara.instanceId],
    )

    expect(expectRejectedReason(result, nobara.instanceId)).toBe('Insufficient cursed energy')
  })

  test('rejects stunned actor', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = {}
    yuji.modifiers.push({
      id: 'stun-test',
      label: 'Stun',
      scope: 'fighter',
      stat: 'canAct',
      mode: 'set',
      value: false,
      duration: { kind: 'rounds', remaining: 1 },
      tags: [],
      visible: true,
      stacking: 'replace',
      statusKind: 'stun',
      sourceActorId: enemyYuji.instanceId,
    })

    const result = validateSubmittedTurnCommands(
      state,
      'player',
      { [yuji.instanceId]: makeCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId) },
      [yuji.instanceId],
    )

    expect(expectRejectedReason(result, yuji.instanceId)).toBe('Stunned this turn')
  })

  test('rejects KO actor', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.hp = 0

    const result = validateSubmittedTurnCommands(
      state,
      'player',
      { [yuji.instanceId]: makeCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId) },
      [yuji.instanceId],
    )

    expect(expectRejectedReason(result, yuji.instanceId)).toBe('Fighter is KO')
  })

  test('rejects cooldown violation', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = {}
    yuji.cooldowns[yuji.abilities[0].id] = 2

    const result = validateSubmittedTurnCommands(
      state,
      'player',
      { [yuji.instanceId]: makeCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId) },
      [yuji.instanceId],
    )

    expect(expectRejectedReason(result, yuji.instanceId)).toBe('Cooldown 2 turns')
  })

  test('valid submitted queued actions resolve successfully', () => {
    const state = createChargedBattleState()
    state.playerEnergy.amounts = createEnergyAmounts({ physical: 2, technique: 0, vow: 0, mental: 0 })
    const yuji = getFighter(state, 'player', 'yuji')
    const nobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = { physical: 1 }
    yuji.abilities[0].effects = [{ type: 'damage', power: 10, target: 'inherit' }]
    nobara.abilities[0].targetRule = 'enemy-single'
    nobara.abilities[0].energyCost = { physical: 1 }
    nobara.abilities[0].effects = [{ type: 'damage', power: 10, target: 'inherit' }]

    const result = validateSubmittedTurnCommands(
      state,
      'player',
      {
        [yuji.instanceId]: makeCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId),
        [nobara.instanceId]: makeCommand(nobara.instanceId, nobara.abilities[0].id, enemyNobara.instanceId),
      },
      [nobara.instanceId, yuji.instanceId],
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected validation success')
    }

    const timeline = resolveTeamTurnTimeline(state, result.commands, 'player', result.actionOrder)
    expect(getFighter(timeline.state, 'enemy', 'yuji').hp).toBe(90)
    expect(getFighter(timeline.state, 'enemy', 'nobara').hp).toBe(90)
  })
})
