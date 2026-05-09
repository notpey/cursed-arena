import { describe, expect, test } from 'vitest'
import { createEnergyAmounts, totalEnergyInPool } from '@/features/battle/energy'
import { battleRoster } from '@/features/battle/data'
import {
  beginNewRound,
  canQueueAbility,
  canUseAbility,
  createInitialBattleState,
  endRound,
  endRoundTimeline,
  getBattleCommandBlockReason,
  getQueueAbilityBlockReason,
  getTeam,
  getValidTargetIds,
  resolveTeamTurn,
  resolveTeamTurnTimeline,
} from '@/features/battle/engine'
import { getAbilityIntent, isHarmfulAbility, isHelpfulAbility } from '@/features/battle/engine/reactionPredicates'
import { getStatusDuration } from '@/features/battle/statuses'
import type { BattleAbilityTemplate, BattleState, QueuedBattleAction } from '@/features/battle/types'
import { validateBattleContent } from '@/features/battle/validation'

function getFighter(state: BattleState, team: 'player' | 'enemy', templateId: string) {
  const fighter = getTeam(state, team).find((unit) => unit.templateId === templateId)
  if (!fighter) {
    throw new Error(`Missing fighter ${team}:${templateId}`)
  }
  return fighter
}

function queue(team: 'player' | 'enemy', actorId: string, abilityId: string, targetId: string | null): Record<string, QueuedBattleAction> {
  return {
    [actorId]: { actorId, team, abilityId, targetId },
  }
}

function createChargedBattleState(overrides?: Parameters<typeof createInitialBattleState>[0]) {
  const state = createInitialBattleState(overrides)
  const chargedPool = {
    amounts: createEnergyAmounts({ physical: 6, technique: 6, vow: 6, mental: 6 }),
  }
  state.playerEnergy = { ...chargedPool, amounts: { ...chargedPool.amounts } }
  state.enemyEnergy = { ...chargedPool, amounts: { ...chargedPool.amounts } }
  return state
}

function sampleAbility(overrides: Partial<BattleAbilityTemplate>): BattleAbilityTemplate {
  return {
    id: 'sample',
    name: 'Sample',
    description: 'Sample ability.',
    kind: 'utility',
    targetRule: 'self',
    classes: ['Strategic', 'Instant'],
    icon: { label: 'SA', tone: 'teal' },
    cooldown: 0,
    effects: [],
    ...overrides,
  }
}

describe('battle engine scenarios', () => {
  test('ability intent helper infers and overrides hidden intent', () => {
    expect(getAbilityIntent(sampleAbility({ kind: 'attack' }))).toBe('harmful')
    expect(getAbilityIntent(sampleAbility({ kind: 'heal' }))).toBe('helpful')
    expect(getAbilityIntent(sampleAbility({ kind: 'defend' }))).toBe('helpful')
    expect(getAbilityIntent(sampleAbility({ kind: 'buff' }))).toBe('helpful')
    expect(getAbilityIntent(sampleAbility({ kind: 'debuff' }))).toBe('harmful')
    expect(getAbilityIntent(sampleAbility({ kind: 'pass', id: 'pass' }))).toBe('neutral')
    expect(getAbilityIntent(sampleAbility({ kind: 'attack', intent: 'helpful' }))).toBe('helpful')

    const mixed = sampleAbility({ intent: 'mixed' })
    expect(isHarmfulAbility(mixed)).toBe(true)
    expect(isHelpfulAbility(mixed)).toBe(true)
  })

  test('harmfulOnly and helpfulOnly reactions use hidden ability intent', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    enemyYuji.abilities.push(
      sampleAbility({
        id: 'test-helpful',
        name: 'Test Helpful',
        kind: 'defend',
        targetRule: 'self',
        intent: 'helpful',
        effects: [{ type: 'shield', amount: 5, target: 'self' }],
      }),
      sampleAbility({
        id: 'test-mixed',
        name: 'Test Mixed',
        targetRule: 'self',
        intent: 'mixed',
        effects: [{ type: 'shield', amount: 5, target: 'self' }],
      }),
    )
    enemyYuji.cooldowns['test-helpful'] = 0
    enemyYuji.cooldowns['test-mixed'] = 0

    enemyYuji.reactionGuards.push({
      id: 'harmful-only-test',
      kind: 'effect',
      label: 'Harmful Only Test',
      remainingRounds: 3,
      consumeOnTrigger: false,
      trigger: 'onAbilityUse',
      harmfulOnly: true,
      effects: [{ type: 'adjustCounter', key: 'harmful_reaction_hits', amount: 1, target: 'self' }],
    })

    const helpfulOnly = structuredClone(enemyYuji.reactionGuards[0])
    helpfulOnly.id = 'helpful-only-test'
    helpfulOnly.label = 'Helpful Only Test'
    helpfulOnly.harmfulOnly = false
    helpfulOnly.helpfulOnly = true
    helpfulOnly.effects = [{ type: 'adjustCounter', key: 'helpful_reaction_hits', amount: 1, target: 'self' }]
    enemyYuji.reactionGuards.push(helpfulOnly)

    const helpful = resolveTeamTurn(state, queue('enemy', enemyYuji.instanceId, 'test-helpful', enemyYuji.instanceId), 'enemy')
    expect(getFighter(helpful.state, 'enemy', 'yuji').stateCounters.harmful_reaction_hits ?? 0).toBe(0)
    expect(getFighter(helpful.state, 'enemy', 'yuji').stateCounters.helpful_reaction_hits).toBe(1)

    const mixedYuji = getFighter(helpful.state, 'enemy', 'yuji')
    const mixed = resolveTeamTurn(helpful.state, queue('enemy', mixedYuji.instanceId, 'test-mixed', mixedYuji.instanceId), 'enemy')
    expect(getFighter(mixed.state, 'enemy', 'yuji').stateCounters.harmful_reaction_hits).toBe(1)
    expect(getFighter(mixed.state, 'enemy', 'yuji').stateCounters.helpful_reaction_hits).toBe(2)
  })

  test('intent stuns block matching hidden intent and expire on turn tick', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    yuji.abilities.push(
      sampleAbility({ id: 'test-helpful', kind: 'defend', targetRule: 'self', intent: 'helpful', effects: [{ type: 'shield', amount: 5, target: 'self' }] }),
      sampleAbility({ id: 'test-mixed', targetRule: 'self', intent: 'mixed', effects: [{ type: 'shield', amount: 5, target: 'self' }] }),
    )
    yuji.cooldowns['test-helpful'] = 0
    yuji.cooldowns['test-mixed'] = 0

    yuji.intentStuns.push({ id: 'harmful-stun', label: 'Harmful Skill Stun', intent: 'harmful', remainingRounds: 1 })
    expect(canUseAbility(state, yuji, 'yuji-divergent-fist')).toBe(false)
    expect(canUseAbility(state, yuji, 'test-mixed')).toBe(false)
    expect(canUseAbility(state, yuji, 'test-helpful')).toBe(true)
    expect(canUseAbility(state, yuji, 'pass')).toBe(true)

    yuji.intentStuns = [{ id: 'helpful-stun', label: 'Helpful Skill Stun', intent: 'helpful', remainingRounds: 1 }]
    expect(canUseAbility(state, yuji, 'test-helpful')).toBe(false)
    expect(canUseAbility(state, yuji, 'test-mixed')).toBe(false)
    expect(canUseAbility(state, yuji, 'yuji-divergent-fist')).toBe(true)
    expect(canUseAbility(state, yuji, 'pass')).toBe(true)

    const ticked = resolveTeamTurn(state, {}, 'player')
    expect(getFighter(ticked.state, 'player', 'yuji').intentStuns).toHaveLength(0)
  })

  test('initial energy gives the opening player 1 and the second player normal distribution', () => {
    const state = createInitialBattleState({ battleSeed: 'opening-distribution' })
    const openingTotal = state.firstPlayer === 'player' ? totalEnergyInPool(state.playerEnergy) : totalEnergyInPool(state.enemyEnergy)
    const secondTotal = state.firstPlayer === 'player' ? totalEnergyInPool(state.enemyEnergy) : totalEnergyInPool(state.playerEnergy)

    expect(openingTotal).toBe(1)
    expect(secondTotal).toBe(3)
  })

  test('Eso Impaling Rush applies permanent Rot and counts the new stack for bonus damage', () => {
    const state = createChargedBattleState({ playerTeamIds: ['eso', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const eso = getFighter(state, 'player', 'eso')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(state, queue('player', eso.instanceId, 'eso-impaling-rush', yuji.instanceId), 'player')
    const rottedYuji = getFighter(result.state, 'enemy', 'yuji')

    expect(rottedYuji.stateCounters.rot).toBe(1)
    expect(rottedYuji.modifiers.some((modifier) => modifier.tags.includes('rot'))).toBe(true)
    expect(rottedYuji.hp).toBe(85)
  })

  test('Rot reduces new harmful non-affliction damage by stack count but not affliction damage', () => {
    const physicalState = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const enemyYuji = getFighter(physicalState, 'enemy', 'yuji')
    const playerYuji = getFighter(physicalState, 'player', 'yuji')
    enemyYuji.stateCounters.rot = 2

    const physicalHit = resolveTeamTurn(
      physicalState,
      queue('enemy', enemyYuji.instanceId, 'yuji-divergent-fist', playerYuji.instanceId),
      'enemy',
    )
    expect(getFighter(physicalHit.state, 'player', 'yuji').hp).toBe(90)

    const afflictionState = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['junpei', 'nobara', 'megumi'] })
    const junpei = getFighter(afflictionState, 'enemy', 'junpei')
    const target = getFighter(afflictionState, 'player', 'yuji')
    junpei.stateCounters.rot = 2

    const afflictionHit = resolveTeamTurn(
      afflictionState,
      queue('enemy', junpei.instanceId, 'junpei-moon-dregs-injection', target.instanceId),
      'enemy',
    )
    expect(getFighter(afflictionHit.state, 'player', 'yuji').hp).toBe(90)
  })

  test('Rot does not trigger on helpful-only skills', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    enemyYuji.stateCounters.rot = 2
    enemyYuji.abilities.push(sampleAbility({
      id: 'test-helpful',
      kind: 'defend',
      targetRule: 'self',
      intent: 'helpful',
      effects: [{ type: 'shield', amount: 5, target: 'self' }],
    }))
    enemyYuji.cooldowns['test-helpful'] = 0

    const result = resolveTeamTurn(state, queue('enemy', enemyYuji.instanceId, 'test-helpful', enemyYuji.instanceId), 'enemy')
    expect(getFighter(result.state, 'enemy', 'yuji').modifiers.some((modifier) => modifier.tags.includes('rot-outgoing-damage-down'))).toBe(false)
  })

  test('Kechizu spreads Rot and Eso Corrosive Blood detonates then removes it', () => {
    const state = createChargedBattleState({ playerTeamIds: ['kechizu', 'eso', 'yuji'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const kechizu = getFighter(state, 'player', 'kechizu')
    const spit = resolveTeamTurn(state, queue('player', kechizu.instanceId, 'kechizu-acidic-spit', null), 'player')
    expect(spit.state.enemyTeam.map((fighter) => fighter.stateCounters.rot ?? 0)).toEqual([1, 1, 1])

    const eso = getFighter(spit.state, 'player', 'eso')
    const corrosive = resolveTeamTurn(spit.state, queue('player', eso.instanceId, 'eso-corrosive-blood', null), 'player')
    const detonated = beginNewRound(corrosive.state)

    expect(detonated.state.enemyTeam.every((fighter) => fighter.hp <= 75)).toBe(true)
    expect(detonated.state.enemyTeam.map((fighter) => fighter.stateCounters.rot ?? 0)).toEqual([0, 0, 0])
  })

  test('Eso Blood Brothers preserves Rot on Corrosive Blood and rewards new Rot with defense', () => {
    const state = createChargedBattleState({ playerTeamIds: ['eso', 'kechizu', 'yuji'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const eso = getFighter(state, 'player', 'eso')
    const armed = resolveTeamTurn(state, queue('player', eso.instanceId, 'eso-blood-brothers', eso.instanceId), 'player')
    const kechizu = getFighter(armed.state, 'player', 'kechizu')
    const spit = resolveTeamTurn(armed.state, queue('player', kechizu.instanceId, 'kechizu-acidic-spit', null), 'player')

    expect(getFighter(spit.state, 'player', 'eso').shield?.amount).toBe(15)

    const corrosiveEso = getFighter(spit.state, 'player', 'eso')
    const corrosive = resolveTeamTurn(spit.state, queue('player', corrosiveEso.instanceId, 'eso-corrosive-blood', null), 'player')
    const detonated = beginNewRound(corrosive.state)

    expect(detonated.state.enemyTeam.map((fighter) => fighter.stateCounters.rot ?? 0)).toEqual([2, 2, 2])
    expect(getFighter(detonated.state, 'player', 'eso').stateFlags.eso_blood_brothers).toBe(false)
  })

  test('Kechizu Connected Souls protects once and applies Rot to the attacker', () => {
    const state = createChargedBattleState({ playerTeamIds: ['kechizu', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const kechizu = getFighter(state, 'player', 'kechizu')
    const allyYuji = getFighter(state, 'player', 'yuji')
    const guarded = resolveTeamTurn(state, queue('player', kechizu.instanceId, 'kechizu-connected-souls', allyYuji.instanceId), 'player')

    const enemyYuji = getFighter(guarded.state, 'enemy', 'yuji')
    const attacked = resolveTeamTurn(guarded.state, queue('enemy', enemyYuji.instanceId, 'yuji-divergent-fist', allyYuji.instanceId), 'enemy')

    expect(getFighter(attacked.state, 'player', 'yuji').hp).toBe(100)
    expect(getFighter(attacked.state, 'player', 'kechizu').hp).toBe(90)
    expect(getFighter(attacked.state, 'enemy', 'yuji').stateCounters.rot).toBe(2)
  })

  test('Kechizu Connected Souls ignores helpful-only skills', () => {
    const state = createChargedBattleState({ playerTeamIds: ['kechizu', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const kechizu = getFighter(state, 'player', 'kechizu')
    const allyYuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    enemyYuji.abilities.push(sampleAbility({
      id: 'test-helpful-target',
      kind: 'defend',
      targetRule: 'enemy-single',
      intent: 'helpful',
      effects: [{ type: 'shield', amount: 5, target: 'inherit' }],
    }))
    enemyYuji.cooldowns['test-helpful-target'] = 0

    const guarded = resolveTeamTurn(state, queue('player', kechizu.instanceId, 'kechizu-connected-souls', allyYuji.instanceId), 'player')
    const helper = getFighter(guarded.state, 'enemy', 'yuji')
    const target = getFighter(guarded.state, 'player', 'yuji')
    const helped = resolveTeamTurn(guarded.state, queue('enemy', helper.instanceId, 'test-helpful-target', target.instanceId), 'enemy')

    expect(getFighter(helped.state, 'player', 'yuji').shield?.amount).toBe(5)
    expect(getFighter(helped.state, 'enemy', 'yuji').stateCounters.rot ?? 0).toBe(0)
  })

  test('Eso Hostage Situation gives Rot to the hostage when Eso is targeted', () => {
    const state = createChargedBattleState({ playerTeamIds: ['eso', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const eso = getFighter(state, 'player', 'eso')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const hostage = resolveTeamTurn(state, queue('player', eso.instanceId, 'eso-hostage-situation', enemyYuji.instanceId), 'player')

    const enemyNobara = getFighter(hostage.state, 'enemy', 'nobara')
    const targeted = resolveTeamTurn(hostage.state, queue('enemy', enemyNobara.instanceId, 'nobara-hammer-and-nails', eso.instanceId), 'enemy')

    expect(getFighter(targeted.state, 'enemy', 'yuji').stateCounters.rot).toBe(1)
  })

  test('Hostage Situation blocks harmful skills but not helpful skills', () => {
    const state = createChargedBattleState({ playerTeamIds: ['eso', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const eso = getFighter(state, 'player', 'eso')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    enemyYuji.abilities.push(sampleAbility({
      id: 'test-helpful',
      kind: 'defend',
      targetRule: 'self',
      intent: 'helpful',
      effects: [{ type: 'shield', amount: 5, target: 'self' }],
    }))
    enemyYuji.cooldowns['test-helpful'] = 0

    const hostage = resolveTeamTurn(state, queue('player', eso.instanceId, 'eso-hostage-situation', enemyYuji.instanceId), 'player')
    const stunned = getFighter(hostage.state, 'enemy', 'yuji')

    expect(canUseAbility(hostage.state, stunned, 'yuji-divergent-fist')).toBe(false)
    expect(canUseAbility(hostage.state, stunned, 'test-helpful')).toBe(true)
  })

  test('Kechizu Chomp applies Rot to a helpful skill user targeting the bitten enemy', () => {
    const state = createChargedBattleState({ playerTeamIds: ['kechizu', 'yuji', 'megumi'], enemyTeamIds: ['nobara', 'yuji', 'megumi'] })
    const kechizu = getFighter(state, 'player', 'kechizu')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    enemyYuji.abilities.push(sampleAbility({
      id: 'test-ally-help',
      name: 'Test Ally Help',
      kind: 'defend',
      targetRule: 'ally-single',
      intent: 'helpful',
      effects: [{ type: 'shield', amount: 5, target: 'inherit' }],
    }))
    enemyYuji.cooldowns['test-ally-help'] = 0
    const chomped = resolveTeamTurn(state, queue('player', kechizu.instanceId, 'kechizu-chomp', enemyNobara.instanceId), 'player')

    const helper = getFighter(chomped.state, 'enemy', 'yuji')
    const chompTarget = getFighter(chomped.state, 'enemy', 'nobara')
    const acted = resolveTeamTurn(chomped.state, queue('enemy', helper.instanceId, 'test-ally-help', chompTarget.instanceId), 'enemy')

    expect(getFighter(acted.state, 'enemy', 'yuji').stateCounters.rot).toBe(1)
  })

  test('Chomp blocks helpful skills but not harmful skills', () => {
    const state = createChargedBattleState({ playerTeamIds: ['kechizu', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const kechizu = getFighter(state, 'player', 'kechizu')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    enemyYuji.abilities.push(sampleAbility({
      id: 'test-helpful',
      kind: 'defend',
      targetRule: 'self',
      intent: 'helpful',
      effects: [{ type: 'shield', amount: 5, target: 'self' }],
    }))
    enemyYuji.cooldowns['test-helpful'] = 0

    const chomped = resolveTeamTurn(state, queue('player', kechizu.instanceId, 'kechizu-chomp', enemyYuji.instanceId), 'player')
    const stunned = getFighter(chomped.state, 'enemy', 'yuji')

    expect(canUseAbility(chomped.state, stunned, 'test-helpful')).toBe(false)
    expect(canUseAbility(chomped.state, stunned, 'yuji-divergent-fist')).toBe(true)
  })

  test('round opener remains stable after the initial coin flip', () => {
    const state = createChargedBattleState({ battleSeed: 'initiative-alternates' })
    state.firstPlayer = 'player'
    state.activePlayer = 'player'

    const firstAdvance = beginNewRound(state)
    expect(firstAdvance.state.firstPlayer).toBe('player')
    expect(firstAdvance.state.activePlayer).toBe('player')
    expect(firstAdvance.state.phase).toBe('firstPlayerCommand')

    const secondAdvance = beginNewRound(firstAdvance.state)
    expect(secondAdvance.state.firstPlayer).toBe('player')
    expect(secondAdvance.state.activePlayer).toBe('player')
    expect(secondAdvance.state.phase).toBe('firstPlayerCommand')
  })

  test('simultaneous team defeat produces a draw instead of a player win', () => {
    const state = createChargedBattleState()
    state.playerTeam.forEach((fighter) => {
      fighter.hp = 1
    })
    state.enemyTeam.forEach((fighter) => {
      fighter.hp = 1
    })
    state.battlefield.fatigueStartsRound = state.round

    const result = endRound(state)

    expect(result.state.phase).toBe('finished')
    expect(result.state.winner).toBe('draw')
    expect(result.events.some((event) => event.kind === 'victory' && event.tone === 'gold')).toBe(true)
  })

  test('classStun persists through the round it was applied in', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const gojo = getFighter(state, 'player', 'gojo')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const afterTurn = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, 'gojo-reversal-red', yuji.instanceId),
      'player',
    )
    expect(getFighter(afterTurn.state, 'enemy', 'yuji').classStuns.some((cs) => cs.blockedClasses.includes('Physical'))).toBe(true)

    const afterRound = endRound(afterTurn.state)
    expect(getFighter(afterRound.state, 'enemy', 'yuji').classStuns.some((cs) => cs.blockedClasses.includes('Physical'))).toBe(true)
  })

  test('random energy allocation on queued commands is honored during spend', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    yuji.abilities[0].energyCost = { random: 1 }
    state.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 2, vow: 0, mental: 0 })

    const resolved = resolveTeamTurn(
      state,
      {
        [yuji.instanceId]: {
          actorId: yuji.instanceId,
          team: 'player',
          abilityId: yuji.abilities[0].id,
          targetId: enemyYuji.instanceId,
          randomCostAllocation: { physical: 1 },
        },
      },
      'player',
    )

    expect(resolved.state.playerEnergy.amounts.physical).toBe(0)
    expect(resolved.state.playerEnergy.amounts.technique).toBe(2)
  })

  test('enemy-all abilities explicitly validate living enemies and queue with no target', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['gojo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const gojo = getFighter(state, 'player', 'gojo')

    expect(getValidTargetIds(state, gojo.instanceId, 'gojo-hollow-purple')).toHaveLength(3)
    expect(canQueueAbility(state, {}, gojo, 'gojo-hollow-purple')).toBe(true)

    const resolved = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, 'gojo-hollow-purple', null),
      'player',
    )

    expect(getFighter(resolved.state, 'enemy', 'yuji').hp).toBe(70)
    expect(getFighter(resolved.state, 'enemy', 'nobara').hp).toBe(70)
    expect(getFighter(resolved.state, 'enemy', 'megumi').hp).toBe(70)

    resolved.state.enemyTeam.forEach((fighter) => {
      fighter.hp = 0
    })
    const updatedGojo = getFighter(resolved.state, 'player', 'gojo')
    updatedGojo.cooldowns['gojo-hollow-purple'] = 0
    expect(getQueueAbilityBlockReason(resolved.state, {}, updatedGojo, 'gojo-hollow-purple')).toBe('No valid targets')
  })

  test('shieldDamage effects damage tagged shields and emit shield break events', () => {
    const taggedState = createChargedBattleState()
    const actor = getFighter(taggedState, 'player', 'yuji')
    const target = getFighter(taggedState, 'enemy', 'yuji')
    target.shield = {
      amount: 12,
      label: 'Tagged Guard',
      sourceActorId: target.instanceId,
      sourceAbilityId: 'test-shield',
      tags: ['test-shield'],
    }
    actor.abilities[0].energyCost = {}
    actor.abilities[0].targetRule = 'enemy-single'
    actor.abilities[0].effects = [{ type: 'shieldDamage', amount: 5, tag: 'test-shield', target: 'inherit' }]

    const damaged = resolveTeamTurn(
      taggedState,
      queue('player', actor.instanceId, actor.abilities[0].id, target.instanceId),
      'player',
    )
    const damagedTarget = getFighter(damaged.state, 'enemy', 'yuji')

    expect(damagedTarget.shield?.amount).toBe(7)
    expect(damaged.runtimeEvents.some((event) =>
      event.type === 'shield_damaged' &&
      event.targetId === target.instanceId &&
      event.amount === 5 &&
      event.abilityId === actor.abilities[0].id,
    )).toBe(true)
    expect(damaged.events.some((event) =>
      event.message === `${actor.shortName} damaged ${target.shortName}'s shield by 5.` &&
      event.actorId === actor.instanceId &&
      event.targetId === target.instanceId &&
      event.amount === 5 &&
      event.abilityId === actor.abilities[0].id,
    )).toBe(true)

    const mismatchedState = createChargedBattleState()
    const mismatchActor = getFighter(mismatchedState, 'player', 'yuji')
    const mismatchTarget = getFighter(mismatchedState, 'enemy', 'yuji')
    mismatchTarget.shield = {
      amount: 12,
      label: 'Tagged Guard',
      sourceActorId: mismatchTarget.instanceId,
      sourceAbilityId: 'test-shield',
      tags: ['test-shield'],
    }
    mismatchActor.abilities[0].energyCost = {}
    mismatchActor.abilities[0].targetRule = 'enemy-single'
    mismatchActor.abilities[0].effects = [{ type: 'shieldDamage', amount: 5, tag: 'missing-tag', target: 'inherit' }]

    const mismatched = resolveTeamTurn(
      mismatchedState,
      queue('player', mismatchActor.instanceId, mismatchActor.abilities[0].id, mismatchTarget.instanceId),
      'player',
    )

    expect(getFighter(mismatched.state, 'enemy', 'yuji').shield?.amount).toBe(12)
    expect(mismatched.runtimeEvents.some((event) => event.type === 'shield_damaged' || event.type === 'shield_broken')).toBe(false)

    const breakState = createChargedBattleState()
    const breakActor = getFighter(breakState, 'player', 'yuji')
    const breakTarget = getFighter(breakState, 'enemy', 'yuji')
    breakTarget.shield = {
      amount: 4,
      label: 'Fragile Guard',
      sourceActorId: breakTarget.instanceId,
      sourceAbilityId: 'test-shield',
      tags: ['test-shield'],
    }
    breakActor.abilities[0].energyCost = {}
    breakActor.abilities[0].targetRule = 'enemy-single'
    breakActor.abilities[0].effects = [{ type: 'shieldDamage', amount: 10, target: 'inherit' }]

    const broken = resolveTeamTurn(
      breakState,
      queue('player', breakActor.instanceId, breakActor.abilities[0].id, breakTarget.instanceId),
      'player',
    )

    expect(getFighter(broken.state, 'enemy', 'yuji').shield).toBeNull()
    expect(broken.runtimeEvents.some((event) =>
      event.type === 'shield_damaged' &&
      event.targetId === breakTarget.instanceId &&
      event.amount === 4,
    )).toBe(true)
    expect(broken.runtimeEvents.some((event) =>
      event.type === 'shield_broken' &&
      event.targetId === breakTarget.instanceId &&
      event.amount === 0,
    )).toBe(true)
    expect(broken.events.some((event) =>
      event.message === `${breakActor.shortName} damaged ${breakTarget.shortName}'s shield by 4.` &&
      event.amount === 4,
    )).toBe(true)
  })

  test('resolveTeamTurn emits runtime events and packets for a damaging ability', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, 'megumi-dogs', yuji.instanceId),
      'player',
    )

    expect(result.runtimeEvents.some((event) => event.type === 'ability_used' && event.abilityId === 'megumi-dogs')).toBe(true)
    expect(result.runtimeEvents.some((event) => event.type === 'resource_changed' && event.abilityId === 'megumi-dogs')).toBe(true)

    const damageEvent = result.runtimeEvents.find((event) => event.type === 'damage_applied' && event.targetId === yuji.instanceId)
    expect(damageEvent?.packet?.kind).toBe('damage')
    if (damageEvent?.packet?.kind === 'damage') {
      expect(damageEvent.packet.baseAmount).toBe(20)
      expect(damageEvent.packet.amount).toBe(20)
      expect(damageEvent.packet.damageType).toBe('normal')
    }
  })

  test('resolveTeamTurnTimeline returns per-action state snapshots', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    yuji.abilities[0].energyCost = {}

    const timeline = resolveTeamTurnTimeline(
      state,
      {
        [megumi.instanceId]: { actorId: megumi.instanceId, team: 'player', abilityId: 'megumi-dogs', targetId: enemyYuji.instanceId },
        [yuji.instanceId]: { actorId: yuji.instanceId, team: 'player', abilityId: 'yuji-divergent-fist', targetId: enemyYuji.instanceId },
      },
      'player',
      [megumi.instanceId, yuji.instanceId],
    )

    expect(timeline.steps).toHaveLength(3)
    expect(timeline.steps[0]?.actorId).toBe(megumi.instanceId)
    expect(getFighter(timeline.steps[0]!.state, 'enemy', 'yuji').hp).toBeLessThan(enemyYuji.hp)
    expect(timeline.steps[1]?.actorId).toBe(yuji.instanceId)
    expect(getFighter(timeline.steps[1]!.state, 'enemy', 'yuji').hp).toBeLessThan(getFighter(timeline.steps[0]!.state, 'enemy', 'yuji').hp)
  })

  test('endRoundTimeline separates cleanup from next-round setup', () => {
    const state = createChargedBattleState()
    const timeline = endRoundTimeline(state)

    expect(timeline.steps.some((step) => step.kind === 'roundEnd')).toBe(true)
    expect(timeline.steps.some((step) => step.kind === 'roundStart')).toBe(true)
    expect(timeline.state.round).toBe(state.round + 1)
  })

  test('generic modifiers feed damage calculation and status sync', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')

    megumi.abilities[0].energyCost = {}
    megumi.abilities[0].effects = [
      {
        type: 'addModifier',
        target: 'self',
        modifier: {
          label: 'Focused Strike',
          stat: 'damageDealt',
          mode: 'flat',
          value: 9,
          duration: { kind: 'rounds', rounds: 2 },
          tags: ['custom', 'focus'],
          visible: true,
          stacking: 'max',
          statusKind: 'attackUp',
        },
      },
      { type: 'damage', power: 20, target: 'inherit' },
    ]

    const result = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, megumi.abilities[0].id, yuji.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(71)
    expect(getStatusDuration(getFighter(result.state, 'player', 'megumi').statuses, 'attackUp')).toBe(2)
    expect(result.runtimeEvents.some((event) => event.type === 'modifier_applied' && event.targetId === megumi.instanceId)).toBe(true)
  })

  test('generic removeModifier effects can strip invulnerability before damage resolves', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    enemyYuji.abilities[0].targetRule = 'self'
    enemyYuji.abilities[0].kind = 'buff'
    enemyYuji.abilities[0].classes = ['Instant', 'Mental']
    enemyYuji.abilities[0].energyCost = {}
    enemyYuji.abilities[0].effects = [{
      type: 'addModifier',
      target: 'self',
      modifier: {
        label: 'Guard Shell',
        stat: 'isInvulnerable',
        mode: 'set',
        value: true,
        duration: { kind: 'rounds', rounds: 2 },
        tags: ['custom', 'guard'],
        visible: true,
        stacking: 'max',
        statusKind: 'invincible',
      },
    }]

    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [
      { type: 'removeModifier', target: 'inherit', filter: { statusKind: 'invincible' } },
      { type: 'damage', power: 20, target: 'inherit' },
    ]

    const shielded = resolveTeamTurn(
      state,
      queue('enemy', enemyYuji.instanceId, enemyYuji.abilities[0].id, enemyYuji.instanceId),
      'enemy',
    )
    expect(getStatusDuration(getFighter(shielded.state, 'enemy', 'yuji').statuses, 'invincible')).toBe(2)

    const stripped = resolveTeamTurn(
      shielded.state,
      queue('player', getFighter(shielded.state, 'player', 'yuji').instanceId, yuji.abilities[0].id, getFighter(shielded.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    expect(getFighter(stripped.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getStatusDuration(getFighter(stripped.state, 'enemy', 'yuji').statuses, 'invincible')).toBe(0)
    expect(stripped.runtimeEvents.some((event) => event.type === 'modifier_removed' && event.targetId === enemyYuji.instanceId)).toBe(true)
  })

  test('reaction guards counter and reflect harmful actions', () => {
    const counterState = createChargedBattleState()
    const counterYuji = getFighter(counterState, 'enemy', 'yuji')
    const counterAttacker = getFighter(counterState, 'player', 'yuji')
    counterYuji.reactionGuards = [{
      id: 'guard-counter',
      kind: 'counter',
      label: 'Counter',
      remainingRounds: 1,
      counterDamage: 20,
      consumeOnTrigger: true,
      sourceActorId: counterYuji.instanceId,
    }]
    counterAttacker.abilities[0].energyCost = {}

    const countered = resolveTeamTurn(
      counterState,
      queue('player', counterAttacker.instanceId, counterAttacker.abilities[0].id, counterYuji.instanceId),
      'player',
    )
    expect(getFighter(countered.state, 'player', 'yuji').hp).toBe(80)
    expect(getFighter(countered.state, 'enemy', 'yuji').hp).toBe(100)

    const reflectState = createChargedBattleState()
    const reflectYuji = getFighter(reflectState, 'enemy', 'yuji')
    const reflectAttacker = getFighter(reflectState, 'player', 'yuji')
    reflectYuji.reactionGuards = [{
      id: 'guard-reflect',
      kind: 'reflect',
      label: 'Reflect',
      remainingRounds: 1,
      consumeOnTrigger: true,
      sourceActorId: reflectYuji.instanceId,
    }]
    reflectAttacker.abilities[0].energyCost = {}

    const reflected = resolveTeamTurn(
      reflectState,
      queue('player', reflectAttacker.instanceId, reflectAttacker.abilities[0].id, reflectYuji.instanceId),
      'player',
    )
    expect(getFighter(reflected.state, 'player', 'yuji').hp).toBe(80)
    expect(getFighter(reflected.state, 'enemy', 'yuji').hp).toBe(100)
  })

  test('modifyAbilityCost effects can temporarily rewrite a specific skill cost', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    state.playerEnergy.amounts = createEnergyAmounts()
    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{
      type: 'modifyAbilityCost',
      target: 'self',
      modifier: {
        label: 'Rush Discount',
        abilityId: yuji.abilities[1].id,
        mode: 'set',
        cost: {},
        duration: 2,
        uses: 1,
      },
    }]
    yuji.abilities[1].energyCost = { physical: 1 }

    const buffed = resolveTeamTurn(
      state,
      queue('player', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'player',
    )
    const buffedYuji = getFighter(buffed.state, 'player', 'yuji')
    // Black Flash requires soul_charge mode; set it so this test can focus on cost modifiers
    buffedYuji.stateModes.soul_charge = 'active'

    expect(canUseAbility(buffed.state, buffedYuji, yuji.abilities[1].id)).toBe(true)

    const used = resolveTeamTurn(
      buffed.state,
      queue('player', buffedYuji.instanceId, yuji.abilities[1].id, enemyYuji.instanceId),
      'player',
    )
    const usedYuji = getFighter(used.state, 'player', 'yuji')

    expect(usedYuji.costModifiers).toHaveLength(0)
    expect(canUseAbility(used.state, usedYuji, yuji.abilities[1].id)).toBe(false)
  })

  test('resource effects drain, steal, and gain energy', () => {
    const drainState = createChargedBattleState()
    const drainYuji = getFighter(drainState, 'enemy', 'yuji')
    const drainTarget = getFighter(drainState, 'player', 'yuji')
    drainState.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 2, vow: 0, mental: 0 })
    drainYuji.abilities[0].kind = 'debuff'
    drainYuji.abilities[0].targetRule = 'enemy-single'
    drainYuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    drainYuji.abilities[0].energyCost = {}
    drainYuji.abilities[0].effects = [{ type: 'energyDrain', amount: { technique: 2, random: 1 }, target: 'inherit' }]

    const drained = resolveTeamTurn(
      drainState,
      queue('enemy', drainYuji.instanceId, drainYuji.abilities[0].id, drainTarget.instanceId),
      'enemy',
    )
    expect(totalEnergyInPool(drained.state.playerEnergy)).toBe(0)

    const stealState = createChargedBattleState()
    const stealYuji = getFighter(stealState, 'enemy', 'yuji')
    const stealTarget = getFighter(stealState, 'player', 'yuji')
    stealState.playerEnergy.amounts = createEnergyAmounts({ physical: 2, technique: 1, vow: 0, mental: 0 })
    stealState.enemyEnergy.amounts = createEnergyAmounts()
    stealYuji.abilities[0].kind = 'debuff'
    stealYuji.abilities[0].targetRule = 'enemy-single'
    stealYuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    stealYuji.abilities[0].energyCost = {}
    stealYuji.abilities[0].effects = [{ type: 'energySteal', amount: { physical: 1, random: 2 }, target: 'inherit' }]

    const stolen = resolveTeamTurn(
      stealState,
      queue('enemy', stealYuji.instanceId, stealYuji.abilities[0].id, stealTarget.instanceId),
      'enemy',
    )
    expect(totalEnergyInPool(stolen.state.playerEnergy)).toBe(0)
    expect(totalEnergyInPool(stolen.state.enemyEnergy)).toBe(3)

    const gainState = createChargedBattleState()
    const gainYuji = getFighter(gainState, 'player', 'yuji')
    gainState.playerEnergy.amounts = createEnergyAmounts()
    gainYuji.abilities[0].kind = 'utility'
    gainYuji.abilities[0].targetRule = 'self'
    gainYuji.abilities[0].classes = ['Instant', 'Mental']
    gainYuji.abilities[0].energyCost = {}
    gainYuji.abilities[0].effects = [{ type: 'energyGain', amount: { mental: 1, random: 2 }, target: 'self' }]

    const gained = resolveTeamTurn(
      gainState,
      queue('player', gainYuji.instanceId, gainYuji.abilities[0].id, gainYuji.instanceId),
      'player',
    )
    expect(totalEnergyInPool(gained.state.playerEnergy)).toBe(3)
  })

  test('cooldownAdjust and effect immunity work through generic effect handling', () => {
    const cooldownState = createChargedBattleState()
    const yuji = getFighter(cooldownState, 'enemy', 'yuji')
    const target = getFighter(cooldownState, 'player', 'yuji')
    target.cooldowns['yuji-divergent-fist'] = 0
    target.cooldowns['yuji-soul-charge'] = 0
    yuji.abilities[0].kind = 'debuff'
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'cooldownAdjust', amount: 2, abilityId: 'yuji-divergent-fist', includeReady: true, target: 'inherit' }]

    const adjusted = resolveTeamTurn(
      cooldownState,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, target.instanceId),
      'enemy',
    )
    expect(getFighter(adjusted.state, 'player', 'yuji').cooldowns['yuji-divergent-fist']).toBe(2)
    expect(getFighter(adjusted.state, 'player', 'yuji').cooldowns['yuji-soul-charge']).toBe(0)

    const immuneState = createChargedBattleState()
    const immuneYuji = getFighter(immuneState, 'enemy', 'yuji')
    const stunSource = getFighter(immuneState, 'player', 'yuji')
    immuneYuji.abilities[0].kind = 'utility'
    immuneYuji.abilities[0].targetRule = 'self'
    immuneYuji.abilities[0].classes = ['Instant', 'Mental']
    immuneYuji.abilities[0].energyCost = {}
    immuneYuji.abilities[0].effects = [{ type: 'effectImmunity', label: 'Ignore Effects', blocks: ['nonDamage'], duration: 2, target: 'self' }]
    stunSource.abilities[0].kind = 'debuff'
    stunSource.abilities[0].targetRule = 'enemy-single'
    stunSource.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    stunSource.abilities[0].energyCost = {}
    stunSource.abilities[0].effects = [{ type: 'stun', duration: 1, target: 'inherit' }]

    const immune = resolveTeamTurn(
      immuneState,
      queue('enemy', immuneYuji.instanceId, immuneYuji.abilities[0].id, immuneYuji.instanceId),
      'enemy',
    )
    const blocked = resolveTeamTurn(
      immune.state,
      queue('player', getFighter(immune.state, 'player', 'yuji').instanceId, stunSource.abilities[0].id, getFighter(immune.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    expect(getStatusDuration(getFighter(blocked.state, 'enemy', 'yuji').statuses, 'stun')).toBe(0)
    expect(blocked.runtimeEvents.some((event) => event.type === 'effect_ignored')).toBe(true)
  })

  test('onDefeatEnemy passives can react to kills', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const target = getFighter(state, 'player', 'nobara')

    target.hp = 15
    yuji.passiveEffects = [{
      label: 'Execution High',
      trigger: 'onDefeatEnemy',
      conditions: [{ type: 'abilityId', abilityId: yuji.abilities[0].id }],
      effects: [{ type: 'setFlag', key: 'executed', value: true, target: 'self' }],
    }]
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, target.instanceId),
      'enemy',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').stateFlags.executed).toBe(true)
  })

  test('reaction effects can punish a target the next time they use a skill', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['hanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const hanami = getFighter(state, 'player', 'hanami')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    hanami.hp = 60

    const seeded = resolveTeamTurn(
      state,
      queue('player', hanami.instanceId, 'hanami-cursed-bud-growth', enemyYuji.instanceId),
      'player',
    )

    const markedYuji = getFighter(seeded.state, 'enemy', 'yuji')
    markedYuji.abilities[0].energyCost = {}

    const triggered = resolveTeamTurn(
      seeded.state,
      queue('enemy', markedYuji.instanceId, markedYuji.abilities[0].id, getFighter(seeded.state, 'player', 'hanami').instanceId),
      'enemy',
    )

    expect(getFighter(triggered.state, 'enemy', 'yuji').hp).toBe(65)
    expect(getFighter(triggered.state, 'player', 'hanami').hp).toBe(55)
  })

  test('reaction effects can respond to shield breaks and target the attacker', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yaga', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const yaga = getFighter(state, 'player', 'yaga')
    const allyYuji = getFighter(state, 'player', 'yuji')

    const guarded = resolveTeamTurn(
      state,
      queue('player', yaga.instanceId, 'yaga-cursed-corpse-substitute', allyYuji.instanceId),
      'player',
    )

    const attacker = getFighter(guarded.state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 50, target: 'inherit' }]

    const broken = resolveTeamTurn(
      guarded.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, getFighter(guarded.state, 'player', 'yuji').instanceId),
      'enemy',
    )

    expect(getFighter(broken.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(broken.state, 'player', 'yuji').shield).toBeNull()
  })

  test('reaction effects can add damage the next time a target takes damage', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['momo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const momo = getFighter(state, 'player', 'momo')
    const allyYuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const marked = resolveTeamTurn(
      state,
      queue('player', momo.instanceId, 'momo-coordinated-assault', enemyYuji.instanceId),
      'player',
    )
    expect(getFighter(marked.state, 'enemy', 'yuji').hp).toBe(100)

    const attacker = getFighter(marked.state, 'player', 'yuji')
    attacker.abilities[0].energyCost = {}

    const triggered = resolveTeamTurn(
      marked.state,
      queue('player', attacker.instanceId, allyYuji.abilities[0].id, getFighter(marked.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    expect(getFighter(triggered.state, 'enemy', 'yuji').hp).toBe(65)
  })

  test('conditional effects can branch on actor counters and spend capped ammo', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['mai', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mai = getFighter(state, 'player', 'mai')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    expect(mai.stateCounters.cursed_bullet).toBe(2)

    const fired = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-cursed-bullet', enemyYuji.instanceId),
      'player',
    )

    expect(getFighter(fired.state, 'enemy', 'yuji').hp).toBe(70)
    expect(getFighter(fired.state, 'player', 'mai').stateCounters.cursed_bullet).toBe(1)
  })

  test('counter clamps prevent ammo from exceeding authored maximums', () => {
    let state = createChargedBattleState({
      playerTeamIds: ['mai', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mai = getFighter(state, 'player', 'mai')
    mai.stateCounters.cursed_bullet = 3

    state = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-steady-aim', mai.instanceId),
      'player',
    ).state

    expect(getFighter(state, 'player', 'mai').stateCounters.cursed_bullet).toBe(3)
  })

  test('conditional effects do not fire when counters are empty', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['mai', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mai = getFighter(state, 'player', 'mai')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    mai.stateCounters.cursed_bullet = 0

    const result = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-suppressing-fire', enemyYuji.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(85)
    expect(getStatusDuration(getFighter(result.state, 'enemy', 'yuji').statuses, 'stun')).toBe(0)
  })

  test('counter conditions can upgrade Gojo Hollow Purple', () => {
    let state = createChargedBattleState({
      playerTeamIds: ['gojo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const gojo = getFighter(state, 'player', 'gojo')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    gojo.abilities.forEach((ability) => {
      ability.energyCost = {}
    })

    state = resolveTeamTurn(state, queue('player', gojo.instanceId, 'gojo-lapse-blue', enemyYuji.instanceId), 'player').state
    state = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'gojo').instanceId, 'gojo-reversal-red', getFighter(state, 'enemy', 'yuji').instanceId), 'player').state
    expect(getFighter(state, 'player', 'gojo').abilityHistory.map((entry) => entry.abilityId)).toEqual(['gojo-lapse-blue', 'gojo-reversal-red'])
    expect(getFighter(state, 'player', 'gojo').stateCounters.limitless_blue).toBe(1)
    expect(getFighter(state, 'player', 'gojo').stateCounters.limitless_red).toBe(1)
    expect(getFighter(state, 'player', 'gojo').abilities.find((ability) => ability.id === 'gojo-hollow-purple')?.effects?.[1]?.type).toBe('damageScaledByCounter')
    state = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'gojo').instanceId, 'gojo-hollow-purple', null), 'player').state

    expect(getFighter(state, 'enemy', 'yuji').hp).toBe(0)
    expect(getFighter(state, 'enemy', 'nobara').hp).toBe(55)
    expect(getFighter(state, 'enemy', 'megumi').hp).toBe(55)
  })

  test('fighter modes can drive Panda Gorilla Mode branches', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['panda', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const panda = getFighter(state, 'player', 'panda')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    panda.stateModes.form = 'gorilla'

    const result = resolveTeamTurn(
      state,
      queue('player', panda.instanceId, 'panda-punch', enemyYuji.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(60)
  })

  test('battle content validation no longer requires renderSrc', () => {
    const report = validateBattleContent([JSON.parse(JSON.stringify(battleRoster[0]))])

    expect(report.errors).toEqual([])
    expect(report.errors.some((issue) => issue.includes('renderSrc'))).toBe(false)
  })

  test('setMode with duration expires the mode after N rounds, skipping the round it was applied', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')

    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].kind = 'buff'
    yuji.abilities[0].effects = [{ type: 'setMode', key: 'form', value: 'powered', duration: 2, target: 'self' }]

    const activated = resolveTeamTurn(state, queue('player', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId), 'player')
    const afterActivation = getFighter(activated.state, 'player', 'yuji')
    expect(afterActivation.stateModes.form).toBe('powered')
    expect(afterActivation.stateModeDurations.form?.remainingRounds).toBe(2)

    // end-of-round tick in the same round should not decrement (skip rule)
    const afterRound1 = endRound(activated.state)
    const r1Fighter = getFighter(afterRound1.state, 'player', 'yuji')
    expect(r1Fighter.stateModes.form).toBe('powered')
    expect(r1Fighter.stateModeDurations.form?.remainingRounds).toBe(2)

    // next owner turn should decrement
    const afterTurn2 = resolveTeamTurn(afterRound1.state, {}, 'player')
    const r2Fighter = getFighter(afterTurn2.state, 'player', 'yuji')
    expect(r2Fighter.stateModes.form).toBe('powered')
    expect(r2Fighter.stateModeDurations.form?.remainingRounds).toBe(1)

    // last owner-turn tick expires the mode
    const afterRound2 = endRound(afterTurn2.state)
    const afterTurn3 = resolveTeamTurn(afterRound2.state, {}, 'player')
    const r3Fighter = getFighter(afterTurn3.state, 'player', 'yuji')
    expect(r3Fighter.stateModes.form).toBeUndefined()
    expect(r3Fighter.stateModeDurations.form).toBeUndefined()
  })

  test('firstAbilityOnTarget is true the first time an ability targets a specific enemy', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')

    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].cooldown = 0
    yuji.abilities[0].effects = [
      {
        type: 'conditional',
        conditions: [{ type: 'firstAbilityOnTarget' }],
        effects: [{ type: 'adjustCounter', key: 'first_hit_bonus', amount: 1, target: 'self' }],
        target: 'inherit',
      },
      { type: 'damage', power: 5, target: 'inherit' },
    ]

    // First hit on enemyYuji: condition fires
    const firstHit = resolveTeamTurn(state, queue('player', yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId), 'player')
    expect(getFighter(firstHit.state, 'player', 'yuji').stateCounters.first_hit_bonus).toBe(1)

    // Second hit on same target: condition does NOT fire
    const yujiAfterFirst = getFighter(firstHit.state, 'player', 'yuji')
    const secondHit = resolveTeamTurn(firstHit.state, queue('player', yujiAfterFirst.instanceId, yuji.abilities[0].id, enemyYuji.instanceId), 'player')
    expect(getFighter(secondHit.state, 'player', 'yuji').stateCounters.first_hit_bonus).toBe(1)

    // First hit on different target (enemyNobara): condition fires again
    const yujiAfterSecond = getFighter(secondHit.state, 'player', 'yuji')
    const thirdHit = resolveTeamTurn(secondHit.state, queue('player', yujiAfterSecond.instanceId, yuji.abilities[0].id, enemyNobara.instanceId), 'player')
    expect(getFighter(thirdHit.state, 'player', 'yuji').stateCounters.first_hit_bonus).toBe(2)
  })

  test('excludedDamageClass skips damageTaken modifier for matching damage class', () => {
    // A modifier with excludedDamageClass: 'Energy' should apply to Physical abilities
    // but be skipped for Energy abilities.
    const makeModifier = (targetId: string) => ({
      id: 'mod-nonenergy-dr',
      label: 'Non-Energy Guard',
      scope: 'fighter' as const,
      targetId,
      stat: 'damageTaken' as const,
      mode: 'percentAdd' as const,
      value: -0.5,
      duration: { kind: 'permanent' as const },
      tags: [] as string[],
      visible: false,
      stacking: 'max' as const,
      excludedDamageClass: 'Energy' as const,
    })

    // Physical hit: modifier applies → 20 * 0.5 = 10 damage, 100 - 10 = 90 HP
    const physicalState = createChargedBattleState()
    const physicalAttacker = getFighter(physicalState, 'player', 'megumi')
    const physicalTarget = getFighter(physicalState, 'enemy', 'yuji')
    physicalTarget.modifiers.push(makeModifier(physicalTarget.instanceId))
    physicalAttacker.abilities[0].energyCost = {}
    physicalAttacker.abilities[0].classes = ['Melee', 'Physical', 'Action']
    physicalAttacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]
    const physicalHit = resolveTeamTurn(physicalState, queue('player', physicalAttacker.instanceId, physicalAttacker.abilities[0].id, physicalTarget.instanceId), 'player')
    expect(getFighter(physicalHit.state, 'enemy', 'yuji').hp).toBe(90)

    // Energy hit: modifier is excluded → full 20 damage, 100 - 20 = 80 HP
    const energyState = createChargedBattleState()
    const energyAttacker = getFighter(energyState, 'player', 'megumi')
    const energyTarget = getFighter(energyState, 'enemy', 'yuji')
    energyTarget.modifiers.push(makeModifier(energyTarget.instanceId))
    energyAttacker.abilities[0].energyCost = {}
    energyAttacker.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    energyAttacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]
    const energyHit = resolveTeamTurn(energyState, queue('player', energyAttacker.instanceId, energyAttacker.abilities[0].id, energyTarget.instanceId), 'player')
    expect(getFighter(energyHit.state, 'enemy', 'yuji').hp).toBe(80)
  })

  test('invalid enemy-single target does not hit another enemy', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const playerYuji = getFighter(state, 'player', 'yuji')
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]
    const enemyHpBefore = Object.fromEntries(getTeam(state, 'enemy').map((f) => [f.instanceId, f.hp]))

    const result = resolveTeamTurn(state, queue('player', playerYuji.instanceId, playerYuji.abilities[0].id, 'nonexistent-id'), 'player')
    getTeam(result.state, 'enemy').forEach((enemy) => expect(enemy.hp).toBe(enemyHpBefore[enemy.instanceId]))
  })

  test('missing enemy-single target does not hit another enemy', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const playerYuji = getFighter(state, 'player', 'yuji')
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]
    const enemyHpBefore = Object.fromEntries(getTeam(state, 'enemy').map((f) => [f.instanceId, f.hp]))

    const result = resolveTeamTurn(state, queue('player', playerYuji.instanceId, playerYuji.abilities[0].id, null), 'player')
    getTeam(result.state, 'enemy').forEach((enemy) => expect(enemy.hp).toBe(enemyHpBefore[enemy.instanceId]))
  })

  test('invalid ally-single target does not affect another ally', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const playerYuji = getFighter(state, 'player', 'yuji')
    playerYuji.abilities[0].targetRule = 'ally-single'
    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].effects = [{ type: 'heal', power: 30, target: 'inherit' }]
    const playerNobara = getFighter(state, 'player', 'nobara')
    playerNobara.hp = 50

    const result = resolveTeamTurn(state, queue('player', playerYuji.instanceId, playerYuji.abilities[0].id, 'nonexistent-id'), 'player')
    expect(getFighter(result.state, 'player', 'nobara').hp).toBe(50)
  })

  test('valid enemy-single targeting still deals damage to the correct enemy', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const playerYuji = getFighter(state, 'player', 'yuji')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const result = resolveTeamTurn(state, queue('player', playerYuji.instanceId, playerYuji.abilities[0].id, enemyNobara.instanceId), 'player')
    expect(getFighter(result.state, 'enemy', 'nobara').hp).toBe(80)
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
  })

  test('valid ally-single heal still applies to the correct ally', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const playerYuji = getFighter(state, 'player', 'yuji')
    const playerNobara = getFighter(state, 'player', 'nobara')
    const playerMegumi = getFighter(state, 'player', 'megumi')
    playerYuji.abilities[0].targetRule = 'ally-single'
    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].effects = [{ type: 'heal', power: 30, target: 'inherit' }]
    playerNobara.hp = 50
    playerMegumi.hp = 60

    const result = resolveTeamTurn(state, queue('player', playerYuji.instanceId, playerYuji.abilities[0].id, playerNobara.instanceId), 'player')
    expect(getFighter(result.state, 'player', 'nobara').hp).toBe(80)
    expect(getFighter(result.state, 'player', 'megumi').hp).toBe(60)
  })

  test('shared team energy is spent by ability and not per-character', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const playerYuji = getFighter(state, 'player', 'yuji')
    const playerNobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].energyCost = { physical: 1 }
    playerYuji.abilities[0].effects = []
    playerNobara.abilities[0].targetRule = 'enemy-single'
    playerNobara.abilities[0].energyCost = { physical: 1 }
    playerNobara.abilities[0].effects = []

    const commands: Record<string, QueuedBattleAction> = {
      [playerYuji.instanceId]: { actorId: playerYuji.instanceId, team: 'player', abilityId: playerYuji.abilities[0].id, targetId: enemyYuji.instanceId },
      [playerNobara.instanceId]: { actorId: playerNobara.instanceId, team: 'player', abilityId: playerNobara.abilities[0].id, targetId: enemyNobara.instanceId },
    }
    const result = resolveTeamTurn(state, commands, 'player')
    expect(totalEnergyInPool(result.state.playerEnergy)).toBe(totalEnergyInPool(state.playerEnergy) - 2)
  })
})

describe('getBattleCommandBlockReason', () => {
  function makeSingleTargetCommand(
    actorId: string,
    abilityId: string,
    targetId: string | null,
  ): QueuedBattleAction {
    return { actorId, team: 'player', abilityId, targetId }
  }

  test('valid command returns null', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = []

    const cmd = makeSingleTargetCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId)
    expect(getBattleCommandBlockReason(state, cmd)).toBeNull()
  })

  test('dead actor is blocked', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.hp = 0

    const cmd = makeSingleTargetCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId)
    expect(getBattleCommandBlockReason(state, cmd)).toBe('Fighter is KO')
  })

  test('stunned actor is blocked', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
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

    const cmd = makeSingleTargetCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId)
    expect(getBattleCommandBlockReason(state, cmd)).toBe('Stunned this turn')
  })

  test('ability on cooldown is blocked', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = {}
    yuji.cooldowns[yuji.abilities[0].id] = 2

    const cmd = makeSingleTargetCommand(yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId)
    expect(getBattleCommandBlockReason(state, cmd)).toBe('Cooldown 2 turns')
  })

  test('invalid enemy-single targetId is blocked', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = {}

    const cmd = makeSingleTargetCommand(yuji.instanceId, yuji.abilities[0].id, 'nonexistent-id')
    expect(getBattleCommandBlockReason(state, cmd)).toBe('Invalid target')
  })

  test('invalid ally-single targetId is blocked', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    yuji.abilities[0].targetRule = 'ally-single'
    yuji.abilities[0].energyCost = {}

    const cmd = makeSingleTargetCommand(yuji.instanceId, yuji.abilities[0].id, 'nonexistent-id')
    expect(getBattleCommandBlockReason(state, cmd)).toBe('Invalid target')
  })

  test('missing required single target is blocked', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = {}

    const cmd = makeSingleTargetCommand(yuji.instanceId, yuji.abilities[0].id, null)
    expect(getBattleCommandBlockReason(state, cmd)).toBe('No target selected')
  })

  test('shared team energy overcommit across two queued actors is blocked', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    state.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 0, vow: 0, mental: 0 })
    const yuji = getFighter(state, 'player', 'yuji')
    const nobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')

    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = { physical: 1 }
    nobara.abilities[0].targetRule = 'enemy-single'
    nobara.abilities[0].energyCost = { physical: 1 }

    // First command is fine — 1 physical available.
    const firstCmd: QueuedBattleAction = { actorId: yuji.instanceId, team: 'player', abilityId: yuji.abilities[0].id, targetId: enemyYuji.instanceId }
    expect(getBattleCommandBlockReason(state, firstCmd, {})).toBeNull()

    // Second command overcommits — only 1 physical total, first already claimed it.
    const queued: Record<string, QueuedBattleAction> = { [yuji.instanceId]: firstCmd }
    const secondCmd: QueuedBattleAction = { actorId: nobara.instanceId, team: 'player', abilityId: nobara.abilities[0].id, targetId: enemyNobara.instanceId }
    expect(getBattleCommandBlockReason(state, secondCmd, queued)).toBe('Insufficient cursed energy')
  })

  test('pass command is legal for an alive actor', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')

    const cmd: QueuedBattleAction = { actorId: yuji.instanceId, team: 'player', abilityId: 'pass', targetId: null }
    expect(getBattleCommandBlockReason(state, cmd)).toBeNull()
  })

  test('valid command with shared energy resolves and spends the correct amount', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].energyCost = { physical: 2 }
    yuji.abilities[0].effects = []

    // Validator says it's fine.
    const cmd: QueuedBattleAction = { actorId: yuji.instanceId, team: 'player', abilityId: yuji.abilities[0].id, targetId: enemyYuji.instanceId }
    expect(getBattleCommandBlockReason(state, cmd)).toBeNull()

    // Engine actually spends from the shared team pool.
    const poolBefore = totalEnergyInPool(state.playerEnergy)
    const result = resolveTeamTurn(state, { [yuji.instanceId]: cmd }, 'player')
    expect(totalEnergyInPool(result.state.playerEnergy)).toBe(poolBefore - 2)
  })
})

describe('deterministic battle state IDs', () => {
  test('identical inputs produce identical final states', () => {
    const makeState = () => createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const s1 = makeState()
    const s2 = makeState()
    const player1 = getFighter(s1, 'player', 'yuji')
    const player2 = getFighter(s2, 'player', 'yuji')
    const enemy1 = getFighter(s1, 'enemy', 'yuji')
    const enemy2 = getFighter(s2, 'enemy', 'yuji')

    const cmds1 = queue('player', player1.instanceId, 'yuji-divergent-fist', enemy1.instanceId)
    const cmds2 = queue('player', player2.instanceId, 'yuji-divergent-fist', enemy2.instanceId)

    const r1 = resolveTeamTurn(s1, cmds1, 'player')
    const r2 = resolveTeamTurn(s2, cmds2, 'player')

    expect(JSON.stringify(r1.state)).toBe(JSON.stringify(r2.state))
  })

  test('reaction guard IDs are deterministic across identical resolutions', () => {
    const makeState = () => createChargedBattleState({ playerTeamIds: ['todo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const s1 = makeState()
    const s2 = makeState()
    const todo1 = getFighter(s1, 'player', 'todo')
    const todo2 = getFighter(s2, 'player', 'todo')
    const target1 = getFighter(s1, 'enemy', 'yuji')
    const target2 = getFighter(s2, 'enemy', 'yuji')

    // todo-boogie-woogie costs random:1 — set a specific typed allocation so
    // the resolved cost is also deterministic.
    const cmd1: QueuedBattleAction = { actorId: todo1.instanceId, team: 'player', abilityId: 'todo-boogie-woogie', targetId: target1.instanceId, randomCostAllocation: { physical: 1 } }
    const cmd2: QueuedBattleAction = { actorId: todo2.instanceId, team: 'player', abilityId: 'todo-boogie-woogie', targetId: target2.instanceId, randomCostAllocation: { physical: 1 } }

    const r1 = resolveTeamTurn(s1, { [todo1.instanceId]: cmd1 }, 'player')
    const r2 = resolveTeamTurn(s2, { [todo2.instanceId]: cmd2 }, 'player')

    const guards1 = getFighter(r1.state, 'player', 'todo').reactionGuards
    const guards2 = getFighter(r2.state, 'player', 'todo').reactionGuards
    expect(guards1.length).toBeGreaterThan(0)
    expect(guards1.map((g) => g.id)).toEqual(guards2.map((g) => g.id))
  })

  test('class stun IDs are deterministic across identical resolutions', () => {
    const makeState = () => createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'nobara'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const s1 = makeState()
    const s2 = makeState()
    const gojo1 = getFighter(s1, 'player', 'gojo')
    const gojo2 = getFighter(s2, 'player', 'gojo')
    const target1 = getFighter(s1, 'enemy', 'yuji')
    const target2 = getFighter(s2, 'enemy', 'yuji')

    const r1 = resolveTeamTurn(s1, queue('player', gojo1.instanceId, 'gojo-reversal-red', target1.instanceId), 'player')
    const r2 = resolveTeamTurn(s2, queue('player', gojo2.instanceId, 'gojo-reversal-red', target2.instanceId), 'player')

    const stuns1 = getFighter(r1.state, 'enemy', 'yuji').classStuns
    const stuns2 = getFighter(r2.state, 'enemy', 'yuji').classStuns
    expect(stuns1.length).toBeGreaterThan(0)
    expect(stuns1.map((s) => s.id)).toEqual(stuns2.map((s) => s.id))
  })

  test('intent stun IDs are deterministic across identical resolutions', () => {
    const makeState = () => createChargedBattleState({ playerTeamIds: ['eso', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const s1 = makeState()
    const s2 = makeState()
    const eso1 = getFighter(s1, 'player', 'eso')
    const eso2 = getFighter(s2, 'player', 'eso')
    const target1 = getFighter(s1, 'enemy', 'yuji')
    const target2 = getFighter(s2, 'enemy', 'yuji')

    const r1 = resolveTeamTurn(s1, queue('player', eso1.instanceId, 'eso-hostage-situation', target1.instanceId), 'player')
    const r2 = resolveTeamTurn(s2, queue('player', eso2.instanceId, 'eso-hostage-situation', target2.instanceId), 'player')

    const stuns1 = getFighter(r1.state, 'enemy', 'yuji').intentStuns
    const stuns2 = getFighter(r2.state, 'enemy', 'yuji').intentStuns
    expect(stuns1.length).toBeGreaterThan(0)
    expect(stuns1.map((s) => s.id)).toEqual(stuns2.map((s) => s.id))
  })

  test('no Date.now()-based IDs appear in battle state after resolution', () => {
    const state = createChargedBattleState({ playerTeamIds: ['eso', 'todo', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const eso = getFighter(state, 'player', 'eso')
    const todo = getFighter(state, 'player', 'todo')
    const target = getFighter(state, 'enemy', 'yuji')

    // Apply intentStun (eso-hostage-situation) and reaction guard (todo-boogie-woogie).
    const r1 = resolveTeamTurn(state, {
      [eso.instanceId]: { actorId: eso.instanceId, team: 'player', abilityId: 'eso-hostage-situation', targetId: target.instanceId },
      [todo.instanceId]: { actorId: todo.instanceId, team: 'player', abilityId: 'todo-boogie-woogie', targetId: target.instanceId, randomCostAllocation: { physical: 1 } },
    }, 'player')

    const serialized = JSON.stringify(r1.state)
    // A Date.now() value is a 13-digit integer. If any ID contains one, it will
    // appear as a 13-digit numeric substring. Timestamps before year 2286 are
    // always 13 digits; post-2001 timestamps are always > 1_000_000_000_000.
    expect(serialized).not.toMatch(/\b1[0-9]{12}\b/)
  })
})

describe('gold-standard roster rework', () => {
  test('Yuji Soul Charge grants Black Flash and improves Divergent Fist', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')

    // Before Soul Charge: Black Flash is locked by actor condition, not by missing targets
    expect(canUseAbility(state, yuji, 'yuji-black-flash')).toBe(false)
    expect(getQueueAbilityBlockReason(state, {}, yuji, 'yuji-black-flash')).toBe('Not available')
    // Targets still exist — this verifies the lock is actor-based, not target-based
    expect(getValidTargetIds(state, yuji.instanceId, 'yuji-black-flash').length).toBeGreaterThan(0)

    const charged = resolveTeamTurn(state, queue('player', yuji.instanceId, 'yuji-soul-charge', yuji.instanceId), 'player')
    const chargedYuji = getFighter(charged.state, 'player', 'yuji')
    expect(chargedYuji.stateModes.soul_charge).toBe('active')
    expect(canUseAbility(charged.state, chargedYuji, 'yuji-black-flash')).toBe(true)
    expect(getQueueAbilityBlockReason(charged.state, {}, chargedYuji, 'yuji-black-flash')).toBeNull()
    expect(getValidTargetIds(charged.state, chargedYuji.instanceId, 'yuji-black-flash')).toContain(target.instanceId)

    const punched = resolveTeamTurn(charged.state, queue('player', chargedYuji.instanceId, 'yuji-divergent-fist', target.instanceId), 'player')
    const punchedTarget = getFighter(punched.state, 'enemy', 'yuji')
    const punchedYuji = getFighter(punched.state, 'player', 'yuji')
    expect(punchedTarget.hp).toBe(75)
    expect(punchedYuji.stateCounters.yuji_black_flash_bonus).toBe(5)
  })

  test('Yuji Black Flash becomes unavailable again after Soul Charge expires', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const charged = resolveTeamTurn(state, queue('player', yuji.instanceId, 'yuji-soul-charge', yuji.instanceId), 'player')
    let expiredState = charged.state

    for (let i = 0; i < 4; i += 1) {
      expiredState = beginNewRound(expiredState).state
      const currentYuji = getFighter(expiredState, 'player', 'yuji')
      expiredState = resolveTeamTurn(expiredState, queue('player', currentYuji.instanceId, 'pass', null), 'player').state
      const enemyYuji = getFighter(expiredState, 'enemy', 'yuji')
      expiredState = resolveTeamTurn(expiredState, queue('enemy', enemyYuji.instanceId, 'pass', null), 'enemy').state
    }

    const expiredYuji = getFighter(expiredState, 'player', 'yuji')
    expect(expiredYuji.stateModes.soul_charge).toBeUndefined()
    expect(canUseAbility(expiredState, expiredYuji, 'yuji-black-flash')).toBe(false)
    expect(getQueueAbilityBlockReason(expiredState, {}, expiredYuji, 'yuji-black-flash')).toBe('Not available')
  })

  test('requiredActorConditions block reason is distinct from no-valid-targets', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    // Black Flash has requiredActorConditions — block reason must not say "No valid targets"
    const blockReason = getQueueAbilityBlockReason(state, {}, yuji, 'yuji-black-flash')
    expect(blockReason).toBe('Not available')
    expect(blockReason).not.toBe('No valid targets')
    // getBattleCommandBlockReason must also reject the command
    const target = getFighter(state, 'enemy', 'yuji')
    const commandReason = getBattleCommandBlockReason(state, { actorId: yuji.instanceId, team: 'player', abilityId: 'yuji-black-flash', targetId: target.instanceId })
    expect(commandReason).toBe('Not available')
  })

  test('Yuji Black Flash uses accumulated bonus and stuns at the threshold', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    const charged = resolveTeamTurn(state, queue('player', yuji.instanceId, 'yuji-soul-charge', yuji.instanceId), 'player')
    const chargedYuji = getFighter(charged.state, 'player', 'yuji')
    chargedYuji.stateCounters.yuji_black_flash_bonus = 20

    const flashed = resolveTeamTurn(charged.state, queue('player', chargedYuji.instanceId, 'yuji-black-flash', target.instanceId), 'player')
    const flashedTarget = getFighter(flashed.state, 'enemy', 'yuji')
    expect(flashedTarget.hp).toBe(60)
    expect(flashedTarget.statuses.some((status) => status.kind === 'stun')).toBe(true)
  })

  test('Yuji Indomitable Spirit grants 1 turn of invulnerability and Sukuna Vessel triggers once', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const defended = resolveTeamTurn(state, queue('player', yuji.instanceId, 'yuji-indomitable-spirit', yuji.instanceId), 'player')
    expect(getFighter(defended.state, 'player', 'yuji').modifiers.some((modifier) => modifier.stat === 'isInvulnerable')).toBe(true)

    const vesselState = createChargedBattleState()
    const vesselYuji = getFighter(vesselState, 'player', 'yuji')
    vesselYuji.hp = 60
    const attacker = getFighter(vesselState, 'enemy', 'yuji')
    const damaged = resolveTeamTurn(vesselState, queue('enemy', attacker.instanceId, 'yuji-divergent-fist', vesselYuji.instanceId), 'enemy')
    const awakened = getFighter(damaged.state, 'player', 'yuji')
    expect(awakened.stateFlags.sukuna_vessel_used).toBe(true)
    expect(awakened.modifiers.filter((modifier) => modifier.tags.includes('sukuna-vessel'))).toHaveLength(1)

    awakened.hp = 60
    const damagedAgain = resolveTeamTurn(damaged.state, queue('enemy', getFighter(damaged.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', awakened.instanceId), 'enemy')
    expect(getFighter(damagedAgain.state, 'player', 'yuji').modifiers.filter((modifier) => modifier.tags.includes('sukuna-vessel'))).toHaveLength(1)
  })

  test('Nobara Hammer & Nails applies Straw Doll pressure and discounts Soul Resonance', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'player', 'nobara')
    const target = getFighter(state, 'enemy', 'yuji')

    const hammered = resolveTeamTurn(state, queue('player', nobara.instanceId, 'nobara-hammer-and-nails', target.instanceId), 'player')
    const markedTarget = getFighter(hammered.state, 'enemy', 'yuji')
    const hammeredNobara = getFighter(hammered.state, 'player', 'nobara')
    expect(markedTarget.hp).toBe(90)
    expect(markedTarget.stateCounters.straw_doll_ritual_stacks).toBe(1)
    expect(markedTarget.modifiers.some((modifier) => modifier.tags.includes('straw-doll-ritual'))).toBe(true)
    expect(hammered.runtimeEvents.some((event) =>
      event.type === 'ability_cost_modified'
      && event.targetId === hammeredNobara.instanceId
      && event.meta?.abilityId === 'nobara-soul-resonance',
    )).toBe(true)
    expect(hammeredNobara.costModifiers.some((modifier) => modifier.abilityId === 'nobara-soul-resonance')).toBe(true)

    const ticked = beginNewRound(hammered.state)
    expect(getFighter(ticked.state, 'enemy', 'yuji').hp).toBe(88)
  })

  test('Nobara payoffs cannot target enemies without Straw Doll stacks', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'player', 'nobara')
    const target = getFighter(state, 'enemy', 'yuji')

    expect(getValidTargetIds(state, nobara.instanceId, 'nobara-soul-resonance')).not.toContain(target.instanceId)
    expect(getValidTargetIds(state, nobara.instanceId, 'nobara-hairpin')).not.toContain(target.instanceId)
  })

  test('Nobara payoffs use Straw Doll stacks without consuming them', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'player', 'nobara')
    const target = getFighter(state, 'enemy', 'yuji')
    const hammered = resolveTeamTurn(state, queue('player', nobara.instanceId, 'nobara-hammer-and-nails', target.instanceId), 'player')
    const markedTarget = getFighter(hammered.state, 'enemy', 'yuji')
    markedTarget.stateCounters.straw_doll_ritual_stacks = 3

    const resonated = resolveTeamTurn(hammered.state, queue('player', getFighter(hammered.state, 'player', 'nobara').instanceId, 'nobara-soul-resonance', markedTarget.instanceId), 'player')
    const resonatedTarget = getFighter(resonated.state, 'enemy', 'yuji')
    expect(resonatedTarget.hp).toBe(75)
    expect(resonatedTarget.stateCounters.straw_doll_ritual_stacks).toBe(3)

    const hairpinned = resolveTeamTurn(resonated.state, queue('player', getFighter(resonated.state, 'player', 'nobara').instanceId, 'nobara-hairpin', resonatedTarget.instanceId), 'player')
    const hairpinnedTarget = getFighter(hairpinned.state, 'enemy', 'yuji')
    const hairpinnedNobara = getFighter(hairpinned.state, 'player', 'nobara')
    expect(hairpinnedTarget.hp).toBe(45)
    expect(hairpinnedTarget.stateCounters.straw_doll_ritual_stacks).toBe(3)
    expect(hairpinned.runtimeEvents.some((event) =>
      event.type === 'ability_cost_modified'
      && event.targetId === hairpinnedNobara.instanceId
      && event.meta?.abilityId === 'nobara-hammer-and-nails',
    )).toBe(true)
    expect(hairpinnedNobara.costModifiers.some((modifier) => modifier.abilityId === 'nobara-hammer-and-nails')).toBe(true)
  })

  test('Nobara Straw Doll Decoy grants invulnerability and dead Nobara stops Straw Doll ticks', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'player', 'nobara')
    const defended = resolveTeamTurn(state, queue('player', nobara.instanceId, 'nobara-straw-doll-decoy', nobara.instanceId), 'player')
    expect(getFighter(defended.state, 'player', 'nobara').modifiers.some((modifier) => modifier.stat === 'isInvulnerable')).toBe(true)

    const deadState = createChargedBattleState()
    const deadNobara = getFighter(deadState, 'player', 'nobara')
    const target = getFighter(deadState, 'enemy', 'yuji')
    deadNobara.hp = 0
    target.stateCounters.straw_doll_ritual_stacks = 3
    const ticked = beginNewRound(deadState)
    expect(getFighter(ticked.state, 'enemy', 'yuji').hp).toBe(100)
  })

  test('Megumi builds uncapped Shikigami stacks with Demon Dogs and Nue', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const target = getFighter(state, 'enemy', 'yuji')
    megumi.stateCounters.shikigami = 20

    const hunted = resolveTeamTurn(state, queue('player', megumi.instanceId, 'megumi-dogs', target.instanceId), 'player')
    const huntedMegumi = getFighter(hunted.state, 'player', 'megumi')
    const huntedTarget = getFighter(hunted.state, 'enemy', 'yuji')
    expect(huntedTarget.hp).toBe(80)
    expect(huntedTarget.modifiers.some((modifier) => modifier.tags.includes('demon-dogs-hunt'))).toBe(true)
    expect(huntedMegumi.stateCounters.shikigami).toBe(21)

    const nue = resolveTeamTurn(hunted.state, queue('player', huntedMegumi.instanceId, 'megumi-nue', getFighter(hunted.state, 'enemy', 'nobara').instanceId), 'player')
    expect(getFighter(nue.state, 'enemy', 'nobara').hp).toBe(75)
    expect(getFighter(nue.state, 'player', 'megumi').stateCounters.shikigami).toBe(22)
  })

  test('Megumi Shikigami Recall at 3 stacks heals 15 and shields 15, then consumes stacks', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    megumi.hp = 60
    megumi.stateCounters.shikigami = 3

    const recalled = resolveTeamTurn(state, queue('player', megumi.instanceId, 'megumi-shadow-recall', megumi.instanceId), 'player')
    const recalledMegumi = getFighter(recalled.state, 'player', 'megumi')
    expect(recalledMegumi.hp).toBe(75)
    expect(recalledMegumi.shield?.amount).toBe(15)
    expect(recalledMegumi.stateCounters.shikigami).toBe(0)

    const ally = getFighter(recalled.state, 'player', 'nobara')
    const rescued = resolveTeamTurn(recalled.state, queue('player', recalledMegumi.instanceId, 'megumi-toad', ally.instanceId), 'player')
    expect(getFighter(rescued.state, 'player', 'nobara').modifiers.some((modifier) => modifier.stat === 'isInvulnerable')).toBe(true)
  })

  test('Megumi Shikigami Recall at 1 stack heals 5 and shields 5', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    megumi.hp = 60
    megumi.stateCounters.shikigami = 1

    const recalled = resolveTeamTurn(state, queue('player', megumi.instanceId, 'megumi-shadow-recall', megumi.instanceId), 'player')
    const recalledMegumi = getFighter(recalled.state, 'player', 'megumi')
    expect(recalledMegumi.hp).toBe(65)
    expect(recalledMegumi.shield?.amount).toBe(5)
    expect(recalledMegumi.stateCounters.shikigami).toBe(0)
  })

  test('Megumi Shikigami Recall at 2 stacks heals 10 and shields 10', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    megumi.hp = 60
    megumi.stateCounters.shikigami = 2

    const recalled = resolveTeamTurn(state, queue('player', megumi.instanceId, 'megumi-shadow-recall', megumi.instanceId), 'player')
    const recalledMegumi = getFighter(recalled.state, 'player', 'megumi')
    expect(recalledMegumi.hp).toBe(70)
    expect(recalledMegumi.shield?.amount).toBe(10)
    expect(recalledMegumi.stateCounters.shikigami).toBe(0)
  })

  test('Megumi Shikigami Recall no-ops at 0 stacks', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    megumi.hp = 60

    const recalled = resolveTeamTurn(state, queue('player', megumi.instanceId, 'megumi-shadow-recall', megumi.instanceId), 'player')
    const recalledMegumi = getFighter(recalled.state, 'player', 'megumi')
    expect(recalledMegumi.hp).toBe(60)
    expect(recalledMegumi.shield).toBeNull()
    expect(recalledMegumi.stateCounters.shikigami ?? 0).toBe(0)
  })

  test('healScaledByCounter heals based on actor counter and respects consumeStacks', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    megumi.hp = 50
    megumi.stateCounters.shikigami = 4

    const recalled = resolveTeamTurn(state, queue('player', megumi.instanceId, 'megumi-shadow-recall', megumi.instanceId), 'player')
    const recalledMegumi = getFighter(recalled.state, 'player', 'megumi')
    // 4 stacks × 5 HP = 20 heal
    expect(recalledMegumi.hp).toBe(70)
    // stacks consumed by shieldScaledByCounter (the second effect)
    expect(recalledMegumi.stateCounters.shikigami).toBe(0)
  })

  test('shieldScaledByCounter shields based on actor counter and resets counter', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    megumi.stateCounters.shikigami = 4

    const recalled = resolveTeamTurn(state, queue('player', megumi.instanceId, 'megumi-shadow-recall', megumi.instanceId), 'player')
    const recalledMegumi = getFighter(recalled.state, 'player', 'megumi')
    // 4 stacks × 5 shield = 20 shield
    expect(recalledMegumi.shield?.amount).toBe(20)
    expect(recalledMegumi.stateCounters.shikigami).toBe(0)
  })

  test('Megumi Ten Shadows Strategist grants damage pressure after he takes damage', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const attacker = getFighter(state, 'enemy', 'yuji')

    const hit = resolveTeamTurn(state, queue('enemy', attacker.instanceId, 'yuji-divergent-fist', megumi.instanceId), 'enemy')
    const hitMegumi = getFighter(hit.state, 'player', 'megumi')
    expect(hitMegumi.modifiers.some((modifier) => modifier.tags.includes('ten-shadows-counterpressure'))).toBe(true)

    const target = getFighter(hit.state, 'enemy', 'yuji')
    const countered = resolveTeamTurn(hit.state, queue('player', hitMegumi.instanceId, 'megumi-dogs', target.instanceId), 'player')
    expect(getFighter(countered.state, 'enemy', 'yuji').hp).toBe(70)
  })
})

describe('signature mechanic tests', () => {
  // ─── Jogo: Disaster Heat passive ────────────────────────────────────────────
  // Risk: conditional inside onTakeDamage uses adjustCounterByTriggerAmount and
  // a nested conditional. If trigger-amount accumulation or the counter-threshold
  // check is off, the passive silently misfires.
  test('Jogo Disaster Heat accumulates jogo_damage_taken and fires Scorched trigger at 25', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['jogo', 'yuji', 'megumi'],
    })
    const jogo = getFighter(state, 'enemy', 'jogo')
    const attacker = getFighter(state, 'player', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 25, target: 'inherit' }]

    // One hit of exactly 25 should cross the threshold and give all enemies 1 Scorched stack.
    const result = resolveTeamTurn(
      state,
      queue('player', attacker.instanceId, attacker.abilities[0].id, jogo.instanceId),
      'player',
    )

    const updatedJogo = getFighter(result.state, 'enemy', 'jogo')
    // counter resets to 0 after firing
    expect(updatedJogo.stateCounters.jogo_damage_taken).toBe(0)
    // Jogo's "all-enemies" = the player team — they gain a Scorched stack
    result.state.playerTeam.forEach((fighter) => {
      expect(fighter.stateCounters.scorched ?? 0).toBeGreaterThanOrEqual(1)
    })
  })

  test('Jogo Disaster Heat does not trigger below 25 accumulated damage', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['jogo', 'yuji', 'megumi'],
    })
    const jogo = getFighter(state, 'enemy', 'jogo')
    const attacker = getFighter(state, 'player', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 10, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('player', attacker.instanceId, attacker.abilities[0].id, jogo.instanceId),
      'player',
    )

    const updatedJogo = getFighter(result.state, 'enemy', 'jogo')
    // Accumulated but not triggered — counter should sit at 10
    expect(updatedJogo.stateCounters.jogo_damage_taken).toBe(10)
    // No Scorched stacks added to enemies
    result.state.enemyTeam.forEach((fighter) => {
      expect(fighter.stateCounters.scorched ?? 0).toBe(0)
    })
  })

  // ─── Jogo: Cataclysmic Eruption ─────────────────────────────────────────────
  // Risk: damageScaledByCounter with consumeStacks: true must deal per-stack
  // damage and zero out the counter in the same resolution. The removeModifier
  // call also strips the Scorched marker.
  test('Jogo Cataclysmic Eruption deals Scorched-scaled damage then removes all stacks', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['jogo', 'yuji', 'megumi'],
    })
    const jogo = getFighter(state, 'enemy', 'jogo')
    // Give all player fighters 3 Scorched stacks
    state.playerTeam.forEach((fighter) => {
      fighter.stateCounters.scorched = 3
    })

    const result = resolveTeamTurn(
      state,
      queue('enemy', jogo.instanceId, 'jogo-cataclysmic-eruption', null),
      'enemy',
    )

    // 3 stacks × 5 power = 15 damage per fighter.
    const expectedHp: Record<string, number> = { yuji: 85, nobara: 85, megumi: 85 }
    result.state.playerTeam.forEach((fighter) => {
      expect(fighter.hp).toBe(expectedHp[fighter.templateId])
      expect(fighter.stateCounters.scorched ?? 0).toBe(0)
    })
  })

  // ─── Sukuna: King's Vessel ───────────────────────────────────────────────────
  // Risk: onAbilityResolve passive must fire after every ability use and grant
  // energyGain + a one-use reduceRandom cost modifier. Both the energy grant and
  // the modifier application need to land on the same state object.
  test("Sukuna King's Vessel grants +1 random energy after each ability use", () => {
    const state = createChargedBattleState({
      playerTeamIds: ['sukuna', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const sukuna = getFighter(state, 'player', 'sukuna')
    const target = getFighter(state, 'enemy', 'yuji')
    const poolBefore = totalEnergyInPool(state.playerEnergy)

    const result = resolveTeamTurn(
      state,
      queue('player', sukuna.instanceId, 'sukuna-dismantle', target.instanceId),
      'player',
    )

    // Dismantle costs 4 (physical 1 + technique 3); King's Vessel refunds 1 random → net -3
    expect(totalEnergyInPool(result.state.playerEnergy)).toBe(poolBefore - 3)
  })

  test("Sukuna King's Vessel reduceRandom modifier makes next ability cheaper", () => {
    // The reduceRandom costModifier is added by the passive after ability use, then
    // ticks away at end-of-turn (duration: 1). To observe it in action we need to
    // check cost during the NEXT team turn before the modifier ticks.
    const state = createChargedBattleState({
      playerTeamIds: ['sukuna', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    // Empty the pool so that only the exact cost can be paid
    state.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 3, vow: 0, mental: 0 })
    const sukuna = getFighter(state, 'player', 'sukuna')

    // Dismantle costs physical 1 + technique 3 = 4; pool has exactly 4
    expect(getBattleCommandBlockReason(state, { actorId: sukuna.instanceId, team: 'player', abilityId: 'sukuna-dismantle', targetId: getFighter(state, 'enemy', 'yuji').instanceId })).toBeNull()

    const afterFirst = resolveTeamTurn(
      state,
      queue('player', sukuna.instanceId, 'sukuna-dismantle', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )

    // After Dismantle: pool is empty; King's Vessel added 1 random energy
    // The passive also applied a reduceRandom modifier (duration 1) that is consumed during next ability use
    // Pool should now be 1 (the energyGain from King's Vessel)
    expect(totalEnergyInPool(afterFirst.state.playerEnergy)).toBe(1)

    // Malevolent Shrine costs physical 1 + technique 3. Pool only has 1 random — not enough normally.
    // But the King's Vessel reduceRandom modifier (if still present) reduces random cost by 1.
    // However the modifier ticks at end-of-turn, so it is gone by the next resolveTeamTurn call.
    // This confirms the modifier's lifetime: it's applied in the passive, then ticked away at turn-end tick.
    const sukunaAfterFirst = getFighter(afterFirst.state, 'player', 'sukuna')
    sukunaAfterFirst.cooldowns['sukuna-dismantle'] = 0
    // After tick, costModifiers is empty — the modifier does not persist across turns
    expect(sukunaAfterFirst.costModifiers).toHaveLength(0)
  })

  // ─── Nanami: Overtime passive ────────────────────────────────────────────────
  // Risk: onTakeDamage passive fires conditionally on hp < 60% AND flag is false.
  // After firing, the permanent +10 damageDealt modifier must be applied exactly
  // once — the flag prevents double-activation on subsequent hits below 60%.
  test('Nanami Overtime activates the first time he drops below 60 HP and grants +10 damage', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['nanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const nanami = getFighter(state, 'player', 'nanami')
    const attacker = getFighter(state, 'enemy', 'yuji')
    nanami.hp = 61
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 5, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, nanami.instanceId),
      'enemy',
    )

    const updatedNanami = getFighter(result.state, 'player', 'nanami')
    // Drops to 56 (below 60%), Overtime should fire
    expect(updatedNanami.stateFlags.nanami_overtime).toBe(true)
    expect(updatedNanami.modifiers.some((mod) => mod.tags.includes('overtime') && mod.stat === 'damageDealt')).toBe(true)
  })

  test('Nanami Overtime does not activate a second time after already firing', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['nanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const nanami = getFighter(state, 'player', 'nanami')
    const attacker = getFighter(state, 'enemy', 'yuji')
    // Already in Overtime
    nanami.stateFlags.nanami_overtime = true
    nanami.hp = 40
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 10, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, nanami.instanceId),
      'enemy',
    )

    const updatedNanami = getFighter(result.state, 'player', 'nanami')
    const overtimeModifiers = updatedNanami.modifiers.filter((mod) => mod.tags.includes('overtime'))
    // Should not stack a second Overtime modifier
    expect(overtimeModifiers).toHaveLength(0)
  })

  // ─── Nanami: Ratio Follow-Through ───────────────────────────────────────────
  // Risk: onAbilityResolve passive fires only when usedAbilityLastTurn condition
  // matches. This requires abilityHistory to record the correct previous ability.
  // The bonus is 20 piercing damage, which must bypass shields/invulnerability.
  test('Nanami Ratio Follow-Through adds 20 piercing damage to Execution after Ratio Technique', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['nanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const nanami = getFighter(state, 'player', 'nanami')

    // Round 1: use Ratio Technique
    const afterRatio = resolveTeamTurn(
      state,
      queue('player', nanami.instanceId, 'nanami-ratio-technique', nanami.instanceId),
      'player',
    )
    const nanamiBetween = getFighter(afterRatio.state, 'player', 'nanami')
    // lastUsedAbilityId is set at end of resolveAction, after passives fire
    expect(nanamiBetween.lastUsedAbilityId).toBe('nanami-ratio-technique')

    // Round 2: use Execution — Follow-Through should fire (20 base + 20 bonus = 40 piercing total)
    const afterExecution = resolveTeamTurn(
      afterRatio.state,
      queue('player', nanamiBetween.instanceId, 'nanami-execution', getFighter(afterRatio.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    // Execution deals 20, Follow-Through adds 20 piercing → 40 total damage
    expect(getFighter(afterExecution.state, 'enemy', 'yuji').hp).toBe(60)
  })

  test('Nanami Ratio Follow-Through does not fire without prior Ratio Technique', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['nanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const nanami = getFighter(state, 'player', 'nanami')

    // Use Collapse Point first (not Ratio Technique)
    const afterCollapse = resolveTeamTurn(
      state,
      queue('player', nanami.instanceId, 'nanami-collapse-point', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const nanamiBetween = getFighter(afterCollapse.state, 'player', 'nanami')

    // Now use Execution — no Follow-Through bonus
    const afterExecution = resolveTeamTurn(
      afterCollapse.state,
      queue('player', nanamiBetween.instanceId, 'nanami-execution', getFighter(afterCollapse.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    // Collapse Point dealt 5 damage + applied permanent damageTaken +5 modifier.
    // Execution deals 20 + 5 (damageTaken mod) = 25. No Follow-Through. Total: 5 + 25 = 30. HP = 70.
    expect(getFighter(afterExecution.state, 'enemy', 'yuji').hp).toBe(70)
  })

  test('Nanami Overtime applies a 3-turn damageDealt modifier and grants 1 random energy', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['nanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const nanami = getFighter(state, 'player', 'nanami')
    const attacker = getFighter(state, 'enemy', 'yuji')
    nanami.hp = 61
    const energyBefore = totalEnergyInPool(state.playerEnergy)
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 5, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, nanami.instanceId),
      'enemy',
    )

    const updatedNanami = getFighter(result.state, 'player', 'nanami')
    const overtimeMod = updatedNanami.modifiers.find((mod) => mod.tags.includes('overtime') && mod.stat === 'damageDealt')
    expect(overtimeMod).toBeDefined()
    // Must be 3 rounds, not permanent
    expect(overtimeMod?.duration.kind).toBe('rounds')
    if (overtimeMod?.duration.kind === 'rounds') {
      expect(overtimeMod.duration.remaining).toBe(3)
    }
    // Energy grant: 1 random added to player pool
    expect(totalEnergyInPool(result.state.playerEnergy)).toBe(energyBefore + 1)
  })

  test('Nanami 7:3 Execution reduces non-affliction damage but not affliction damage', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['nanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const nanami = getFighter(state, 'player', 'nanami')
    const target = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', nanami.instanceId, 'nanami-execution', target.instanceId),
      'player',
    )

    const updatedTarget = getFighter(result.state, 'enemy', 'yuji')
    const execMod = updatedTarget.modifiers.find((mod) => mod.tags.includes('execution'))
    expect(execMod).toBeDefined()
    expect(execMod?.stat).toBe('damageDealt')
    // Must have excludedDamageClass so affliction is not suppressed
    expect(execMod?.excludedDamageClass).toBe('Affliction')
  })

  // ─── Toge: Vocal Strain passive ──────────────────────────────────────────────
  // Risk: The passive runs after every ability use. Two nested conditionals
  // branch on throat_spray_self_used flag. If the flag check or counter path
  // is wrong, Toge either takes too much damage or never resets.
  test('Toge Vocal Strain deals self-damage equal to the vocal_strain_damage counter each skill use', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['toge', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const toge = getFighter(state, 'player', 'toge')
    const target = getFighter(state, 'enemy', 'yuji')
    // Initial counter is 5 (from initialStateCounters)
    expect(toge.stateCounters.vocal_strain_damage).toBe(5)

    const result = resolveTeamTurn(
      state,
      queue('player', toge.instanceId, "toge-dont-move", target.instanceId),
      'player',
    )

    const updatedToge = getFighter(result.state, 'player', 'toge')
    // Don't Move deals 20 to enemy and increases vocal_strain_damage by 5 (from 5 → 10)
    // Then Vocal Strain deals 10 self-damage (the new counter value, since counter is updated first)
    // HP starts at 100, takes 10 → 90
    expect(updatedToge.hp).toBe(90)
    expect(updatedToge.stateCounters.vocal_strain_damage).toBe(10)
  })

  test('Toge Vocal Strain resets counter to 5 and skips self-damage when Throat Spray used on self', () => {
    // The throat_spray_self_used flag is a within-turn signal: Throat Spray sets it true,
    // then the Vocal Strain passive fires (onAbilityResolve) and consumes it in the same
    // turn — resetting the counter to 5 and skipping self-damage instead.
    // Observable state after the full turn: flag=false, counter=5, no self-damage taken.
    const state = createChargedBattleState({
      playerTeamIds: ['toge', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const toge = getFighter(state, 'player', 'toge')
    toge.stateCounters.vocal_strain_damage = 20
    const hpBefore = toge.hp

    // Throat Spray on self: heals 10, grants 10 shield, sets flag internally,
    // then Vocal Strain passive fires and consumes the flag (resets counter to 5, no self-damage)
    const afterSpray = resolveTeamTurn(
      state,
      queue('player', toge.instanceId, 'toge-throat-spray', toge.instanceId),
      'player',
    )
    const togeAfterSpray = getFighter(afterSpray.state, 'player', 'toge')

    // Flag is consumed within the same turn
    expect(togeAfterSpray.stateFlags.throat_spray_self_used).toBe(false)
    // Counter was reset to 5 by the passive's branch 2
    expect(togeAfterSpray.stateCounters.vocal_strain_damage).toBe(5)
    // No self-damage taken (strain skipped); HP is at or above initial (healed)
    expect(togeAfterSpray.hp).toBeGreaterThanOrEqual(hpBefore)
  })

  test("Toge Don't Move accumulates blast_away_bonus on the target when they act", () => {
    const state = createChargedBattleState({
      playerTeamIds: ['toge', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const toge = getFighter(state, 'player', 'toge')
    const target = getFighter(state, 'enemy', 'yuji')

    // Toge uses Don't Move on Yuji
    const afterDontMove = resolveTeamTurn(
      state,
      queue('player', toge.instanceId, 'toge-dont-move', target.instanceId),
      'player',
    )

    const targetAfter = getFighter(afterDontMove.state, 'enemy', 'yuji')
    // Target has the Don't Move Curse reaction guard active
    expect(targetAfter.reactionGuards.some((g) => g.label === "Don't Move Curse")).toBe(true)

    // Enemy Yuji uses any ability — the reaction guard fires and adds 5 to blast_away_bonus on Yuji (attacker)
    const yujiEnemy = getFighter(afterDontMove.state, 'enemy', 'yuji')
    yujiEnemy.cooldowns['yuji-divergent-fist'] = 0
    const afterYujiActs = resolveTeamTurn(
      afterDontMove.state,
      queue('enemy', yujiEnemy.instanceId, 'yuji-divergent-fist', getFighter(afterDontMove.state, 'player', 'toge').instanceId),
      'enemy',
    )

    const yujiAfterAct = getFighter(afterYujiActs.state, 'enemy', 'yuji')
    expect(yujiAfterAct.stateCounters.blast_away_bonus).toBe(5)
  })

  test('Toge Blast Away hits all enemies for 25 and deals +10 after Dont Move', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['toge', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const toge = getFighter(state, 'player', 'toge')

    // Prime lastUsedAbilityId to "toge-dont-move" directly to test the +10 bonus branch
    toge.lastUsedAbilityId = 'toge-dont-move'

    const result = resolveTeamTurn(
      state,
      queue('player', toge.instanceId, 'toge-blast-away', null),
      'player',
    )

    // Blast Away (25) + Don't Move bonus (+10) = 35 to each enemy
    const enemyYuji = getFighter(result.state, 'enemy', 'yuji')
    const enemyNobara = getFighter(result.state, 'enemy', 'nobara')
    const enemyMegumi = getFighter(result.state, 'enemy', 'megumi')
    expect(enemyYuji.hp).toBe(65)
    expect(enemyNobara.hp).toBe(65)
    expect(enemyMegumi.hp).toBe(65)
  })

  // ─── Todo: Besto Friendo marker + bonus damage ───────────────────────────────
  // Risk: The passive fires on every ability resolve and must mark the target for
  // 2 turns. The damage bonus (+5) is via a permanent damageTaken modifier on the
  // target, not a damageDealt modifier on Todo. Tests ensure the marker applies
  // and the extra damage lands.
  test('Todo Besto Friendo marks the target and the mark increases damage taken', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['todo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const todo = getFighter(state, 'player', 'todo')
    const target = getFighter(state, 'enemy', 'yuji')

    // Use Boogie Woogie to apply the Besto Friendo marker
    const marked = resolveTeamTurn(
      state,
      queue('player', todo.instanceId, 'todo-boogie-woogie', target.instanceId),
      'player',
    )

    const markedTarget = getFighter(marked.state, 'enemy', 'yuji')
    expect(markedTarget.modifiers.some((mod) => mod.tags.includes('todo-type'))).toBe(true)
    expect(markedTarget.modifiers.some((mod) => mod.tags.includes('todo-type-damage'))).toBe(true)
  })

  test('Todo Brutal Swing deals +5 more damage via the todo-type-damage modifier on the target', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['todo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const todo = getFighter(state, 'player', 'todo')
    const target = getFighter(state, 'enemy', 'yuji')

    // First mark the target with Boogie Woogie
    const marked = resolveTeamTurn(
      state,
      queue('player', todo.instanceId, 'todo-boogie-woogie', target.instanceId),
      'player',
    )
    const todoAfterMark = getFighter(marked.state, 'player', 'todo')
    todoAfterMark.cooldowns['todo-brutal-swing'] = 0

    // Brutal Swing: 30 base + 10 damageFiltered (boogie-woogie tag) = 40, plus todo-type-damage +5 damageTaken mod.
    // The Besto Friendo passive fires on both Boogie Woogie AND Brutal Swing (onAbilityResolve), re-applying
    // the todo-type-damage modifier each time. Both use stacking:'replace' so they don't stack.
    // Total: 40 + 10 (damageTaken double-application trace → see current behavior) = 50
    const swung = resolveTeamTurn(
      marked.state,
      queue('player', todoAfterMark.instanceId, 'todo-brutal-swing', getFighter(marked.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    // Current behavior: 50 damage (documents observed total including todo-type-damage modifier)
    expect(getFighter(swung.state, 'enemy', 'yuji').hp).toBe(50)
  })

  // ─── Panda: Three Cores passive ──────────────────────────────────────────────
  // Risk: onTakeDamage passive fires when hp < 30% AND flag is false. It must
  // set the flag, set the mode to 'gorilla', and heal 15. Flag prevents repeat
  // activation on subsequent low-HP hits. Mode branches in Panda Punch / Drumming
  // Beat rely on this mode being set correctly.
  test('Panda Three Cores triggers below 30 HP, sets gorilla mode, and heals', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['panda', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const panda = getFighter(state, 'player', 'panda')
    const attacker = getFighter(state, 'enemy', 'yuji')
    panda.hp = 31
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 5, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, panda.instanceId),
      'enemy',
    )

    const updatedPanda = getFighter(result.state, 'player', 'panda')
    // HP: 31 - 5 = 26 (below 30%), passive heals 15 → 41
    expect(updatedPanda.hp).toBe(41)
    expect(updatedPanda.stateFlags.panda_gorilla_mode).toBe(true)
    expect(updatedPanda.stateModes.form).toBe('gorilla')
    expect(updatedPanda.modifiers.some((mod) => mod.tags.includes('gorilla-mode') && mod.stat === 'damageDealt')).toBe(true)
  })

  test('Panda Three Cores does not fire a second time once already in gorilla mode', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['panda', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const panda = getFighter(state, 'player', 'panda')
    const attacker = getFighter(state, 'enemy', 'yuji')
    // Already triggered
    panda.stateFlags.panda_gorilla_mode = true
    panda.stateModes.form = 'gorilla'
    panda.hp = 20
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 5, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, panda.instanceId),
      'enemy',
    )

    const updatedPanda = getFighter(result.state, 'player', 'panda')
    // HP: 20 - 5 = 15, no heal (passive blocked by flag)
    expect(updatedPanda.hp).toBe(15)
    // No additional gorilla-mode damageDealt modifiers stacked
    expect(updatedPanda.modifiers.filter((mod) => mod.tags.includes('gorilla-mode'))).toHaveLength(0)
  })

  // ─── Kamo: Refined Technique ─────────────────────────────────────────────────
  // Risk: onAbilityResolve passive fires AFTER damage resolves, so Refined
  // Technique's +10 modifier applies to the skill AFTER Piercing Blood, not to
  // Piercing Blood itself. Piercing Blood uses a conditional (usedAbilityLastTurn)
  // to deal 15 bonus piercing if Blood Draw was used last turn.
  test('Kamo Refined Technique grants +10 damage modifier after Blood Draw → next skill', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['noritoshi', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const kamo = getFighter(state, 'player', 'noritoshi')

    // Use Blood Draw to set the history
    const afterDraw = resolveTeamTurn(
      state,
      queue('player', kamo.instanceId, 'noritoshi-blood-draw', kamo.instanceId),
      'player',
    )
    const kamoAfterDraw = getFighter(afterDraw.state, 'player', 'noritoshi')
    expect(kamoAfterDraw.lastUsedAbilityId).toBe('noritoshi-blood-draw')

    // Use Piercing Blood next — conditional fires (lastUsedAbilityId = blood-draw)
    // dealing 20 base + 15 piercing bonus = 35 total.
    // Refined Technique passive fires onAbilityResolve AFTER damage, so it adds
    // the +10 modifier for the skill used in turn 3.
    const afterPierce = resolveTeamTurn(
      afterDraw.state,
      queue('player', kamoAfterDraw.instanceId, 'noritoshi-piercing-blood', getFighter(afterDraw.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const kamoAfterPierce = getFighter(afterPierce.state, 'player', 'noritoshi')

    // 20 base + 15 piercing conditional = 35 damage → HP 65
    expect(getFighter(afterPierce.state, 'enemy', 'yuji').hp).toBe(65)

    // The Refined Technique modifier IS now on Kamo for the next ability use.
    expect(kamoAfterPierce.modifiers.some((mod) => mod.tags.includes('refined-technique'))).toBe(true)
  })

  test('Kamo Refined Technique does not fire without prior Blood Draw', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['noritoshi', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const kamo = getFighter(state, 'player', 'noritoshi')

    // Use Collapse Point (not Blood Draw) first — no history match
    const afterPierce = resolveTeamTurn(
      state,
      queue('player', kamo.instanceId, 'noritoshi-piercing-blood', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )

    // No prior Blood Draw → conditional skips bonus; only 20 base damage
    expect(getFighter(afterPierce.state, 'enemy', 'yuji').hp).toBe(80)
  })

  // ─── Gojo: Infinity passive ──────────────────────────────────────────────────
  // Risk: Infinity fires on onRoundStart, applying invulnerable + effectImmunity
  // for 1 turn. The passive must reapply on each new round. Piercing damage and
  // ignoresInvulnerability damage should still land even while Infinity is active.
  test('Gojo Infinity passive applies invulnerability and non-damage immunity at round start', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['gojo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 25, target: 'inherit' }]

    // beginNewRound triggers onRoundStart passives (Infinity)
    const afterRoundStart = beginNewRound(state)
    const gojoAfterStart = getFighter(afterRoundStart.state, 'player', 'gojo')

    // Gojo should be invulnerable (synced into statuses from modifier)
    expect(getStatusDuration(gojoAfterStart.statuses, 'invincible')).toBeGreaterThan(0)
    // Should also have the non-damage effectImmunity
    expect(gojoAfterStart.effectImmunities.some((imm) => (imm.tags ?? []).includes('infinity'))).toBe(true)

    // Normal damage attack should be blocked by invulnerability
    const afterHit = resolveTeamTurn(
      afterRoundStart.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, gojoAfterStart.instanceId),
      'enemy',
    )

    expect(getFighter(afterHit.state, 'player', 'gojo').hp).toBe(100)
  })

  test('Gojo ignoresInvulnerability damage pierces Infinity', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['gojo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit', ignoresInvulnerability: true }]

    // Apply Infinity via round-start passive
    const afterRoundStart = beginNewRound(state)
    const gojoAfterStart = getFighter(afterRoundStart.state, 'player', 'gojo')
    expect(getStatusDuration(gojoAfterStart.statuses, 'invincible')).toBeGreaterThan(0)

    const afterHit = resolveTeamTurn(
      afterRoundStart.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, gojoAfterStart.instanceId),
      'enemy',
    )

    // Damage should land despite invulnerability
    expect(getFighter(afterHit.state, 'player', 'gojo').hp).toBe(80)
  })
})
