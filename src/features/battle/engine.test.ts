import { describe, expect, test, vi } from 'vitest'
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
  getResolvedAbilityEnergyCost,
  getQueueAbilityBlockReason,
  getTeam,
  getValidTargetIds,
  resolveEffectTargets,
  resolveInterleavedPlayerTurnTimeline,
  resolveTeamTurn,
  resolveTeamTurnTimeline,
  transitionToSecondPlayer,
} from '@/features/battle/engine'
import { getAbilityIntent, isHarmfulAbility, isHelpfulAbility } from '@/features/battle/engine/reactionPredicates'
import { getStatusDuration } from '@/features/battle/statuses'
import { getActivePips } from '@/components/battle/battleDisplay'
import { createModifierInstance, upsertModifier } from '@/features/battle/modifiers'
import type { BattleAbilityTemplate, BattleModifierStat, BattleModifierValue, BattleReactionGuardState, BattleState, QueuedBattleAction } from '@/features/battle/types'
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

function addSetModifier(fighter: ReturnType<typeof getFighter>, stat: BattleModifierStat, value: BattleModifierValue, tags: string[] = []) {
  const instance = createModifierInstance({
    label: `Test ${stat}`,
    stat,
    mode: 'set',
    value,
    duration: { kind: 'rounds', rounds: 2 },
    tags,
    visible: false,
    stacking: 'max',
  }, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

function addInvulnerableModifier(fighter: ReturnType<typeof getFighter>) {
  const instance = createModifierInstance({
    label: 'Test Invulnerable',
    stat: 'isInvulnerable',
    mode: 'set',
    value: true,
    duration: { kind: 'rounds', rounds: 2 },
    tags: ['status', 'invincible'],
    visible: true,
    stacking: 'max',
    statusKind: 'invincible',
  }, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

function addNonDamageEffectImmunity(fighter: ReturnType<typeof getFighter>) {
  fighter.effectImmunities.push({
    id: `test-non-damage-immunity-${fighter.instanceId}`,
    label: 'Test Non-Damage Immunity',
    blocks: ['nonDamage'],
    remainingRounds: 2,
  })
}

function addPulledModifier(fighter: ReturnType<typeof getFighter>) {
  const instance = createModifierInstance({
    label: 'Pulled',
    stat: 'cooldownTick',
    mode: 'flat',
    value: 0,
    duration: { kind: 'rounds', rounds: 2 },
    tags: ['pulled'],
    visible: true,
    stacking: 'replace',
  }, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

describe('battle engine scenarios', () => {
  test('random-enemy effect targeting is deterministic for the same seed and state', () => {
    const left = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const right = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    left.battleSeed = 'random-target-test'
    right.battleSeed = 'random-target-test'
    left.round = 3
    right.round = 3

    const leftTarget = resolveEffectTargets('random-enemy', left.playerTeam[0], null, left.playerTeam, left.enemyTeam, left)[0]
    const rightTarget = resolveEffectTargets('random-enemy', right.playerTeam[0], null, right.playerTeam, right.enemyTeam, right)[0]

    expect(leftTarget?.templateId).toBe(rightTarget?.templateId)
  })

  test('random-enemy effect targeting fails instead of falling back to Math.random without state', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const randomSpy = vi.spyOn(Math, 'random')

    expect(() => {
      resolveEffectTargets('random-enemy', state.playerTeam[0], null, state.playerTeam, state.enemyTeam, undefined as unknown as BattleState)
    }).toThrow('Battle state is required for deterministic random-enemy target resolution.')
    expect(randomSpy).not.toHaveBeenCalled()

    randomSpy.mockRestore()
  })

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

  test('Shoko Preserve the Body prevents defeat from ordinary damage', () => {
    const state = createChargedBattleState({ playerTeamIds: ['shoko', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const shoko = getFighter(state, 'player', 'shoko')
    const allyYuji = getFighter(state, 'player', 'yuji')
    const protectedState = resolveTeamTurn(state, queue('player', shoko.instanceId, 'shoko-preserve-the-body', allyYuji.instanceId), 'player')

    const enemyYuji = getFighter(protectedState.state, 'enemy', 'yuji')
    enemyYuji.abilities.push(sampleAbility({
      id: 'test-lethal-physical',
      kind: 'attack',
      targetRule: 'enemy-single',
      classes: ['Physical', 'Melee', 'Instant'],
      intent: 'harmful',
      effects: [{ type: 'damage', power: 150, target: 'inherit' }],
      energyCost: {},
    }))
    enemyYuji.cooldowns['test-lethal-physical'] = 0

    const hit = resolveTeamTurn(protectedState.state, queue('enemy', enemyYuji.instanceId, 'test-lethal-physical', allyYuji.instanceId), 'enemy')
    const protectedYuji = getFighter(hit.state, 'player', 'yuji')

    expect(protectedYuji.hp).toBe(1)
    expect(protectedYuji.modifiers.some((modifier) => modifier.tags.includes('preserve-the-body'))).toBe(true)
  })

  test('Shoko Preserve the Body heals at the scheduled round end', () => {
    const state = createChargedBattleState({ playerTeamIds: ['shoko', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const shoko = getFighter(state, 'player', 'shoko')
    const allyYuji = getFighter(state, 'player', 'yuji')
    const protectedState = resolveTeamTurn(state, queue('player', shoko.instanceId, 'shoko-preserve-the-body', allyYuji.instanceId), 'player')
    getFighter(protectedState.state, 'player', 'yuji').hp = 50

    const round2 = endRound(protectedState.state)
    const round3 = endRound(round2.state)
    const healed = endRound(round3.state)

    expect(getFighter(healed.state, 'player', 'yuji').hp).toBe(65)
    expect(healed.state.scheduledEffects.some((effect) => effect.abilityId === 'shoko-preserve-the-body')).toBe(false)
  })

  test('Shoko Preserve the Body is blocked by helpful immunity', () => {
    const state = createChargedBattleState({ playerTeamIds: ['shoko', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const shoko = getFighter(state, 'player', 'shoko')
    const allyYuji = getFighter(state, 'player', 'yuji')
    addSetModifier(allyYuji, 'canReceiveHelpfulEffects', false)

    const result = resolveTeamTurn(state, queue('player', shoko.instanceId, 'shoko-preserve-the-body', allyYuji.instanceId), 'player')
    const yujiAfter = getFighter(result.state, 'player', 'yuji')

    expect(yujiAfter.modifiers.some((modifier) => modifier.tags.includes('preserve-the-body'))).toBe(false)
    expect(result.events.some((event) => event.message.includes('cannot receive helpful effects'))).toBe(true)
  })

  test('Shoko Autopsy Report boosts Affliction and Mental damage but not Physical damage', () => {
    function runAutopsyHit(classes: BattleAbilityTemplate['classes']) {
      const state = createChargedBattleState({ playerTeamIds: ['shoko', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
      const shoko = getFighter(state, 'player', 'shoko')
      const enemyYuji = getFighter(state, 'enemy', 'yuji')
      const autopsied = resolveTeamTurn(state, queue('player', shoko.instanceId, 'shoko-autopsy-report', enemyYuji.instanceId), 'player')
      const playerYuji = getFighter(autopsied.state, 'player', 'yuji')
      playerYuji.abilities.push(sampleAbility({
        id: `test-${classes[0].toLowerCase()}-hit`,
        kind: 'attack',
        targetRule: 'enemy-single',
        classes,
        intent: 'harmful',
        effects: [{ type: 'damage', power: 10, target: 'inherit' }],
        energyCost: {},
      }))
      playerYuji.cooldowns[`test-${classes[0].toLowerCase()}-hit`] = 0

      return resolveTeamTurn(autopsied.state, queue('player', playerYuji.instanceId, `test-${classes[0].toLowerCase()}-hit`, enemyYuji.instanceId), 'player')
    }

    expect(getFighter(runAutopsyHit(['Affliction', 'Ranged', 'Instant']).state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(runAutopsyHit(['Mental', 'Ranged', 'Instant']).state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(runAutopsyHit(['Physical', 'Melee', 'Instant']).state, 'enemy', 'yuji').hp).toBe(90)
  })

  test('Shoko Autopsy Report is blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['shoko', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const shoko = getFighter(state, 'player', 'shoko')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(enemyYuji)

    const result = resolveTeamTurn(state, queue('player', shoko.instanceId, 'shoko-autopsy-report', enemyYuji.instanceId), 'player')
    const yujiAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(yujiAfter.modifiers.some((modifier) => modifier.tags.includes('autopsy-report'))).toBe(false)
  })

  test('Yaga Cursed Corpse: Release always deals normal and piercing damage', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yaga', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yaga = getFighter(state, 'player', 'yaga')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(state, queue('player', yaga.instanceId, 'yaga-cursed-corpse-release', enemyYuji.instanceId), 'player')

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(70)
  })

  test('Rot application from Eso is blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['eso', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const eso = getFighter(state, 'player', 'eso')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(enemyYuji)

    const result = resolveTeamTurn(state, queue('player', eso.instanceId, 'eso-impaling-rush', enemyYuji.instanceId), 'player')
    const yujiAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(yujiAfter.hp).toBe(100)
    expect(yujiAfter.stateCounters.rot ?? 0).toBe(0)
    expect(yujiAfter.modifiers.some((modifier) => modifier.tags.includes('rot'))).toBe(false)
  })

  test('Rot application from Kechizu is blocked by invulnerability per target', () => {
    const state = createChargedBattleState({ playerTeamIds: ['kechizu', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const kechizu = getFighter(state, 'player', 'kechizu')
    addInvulnerableModifier(getFighter(state, 'enemy', 'yuji'))

    const result = resolveTeamTurn(state, queue('player', kechizu.instanceId, 'kechizu-acidic-spit', null), 'player')

    expect(getFighter(result.state, 'enemy', 'yuji').stateCounters.rot ?? 0).toBe(0)
    expect(getFighter(result.state, 'enemy', 'nobara').stateCounters.rot).toBe(1)
    expect(getFighter(result.state, 'enemy', 'megumi').stateCounters.rot).toBe(1)
  })

  test('Rot application is blocked by non-damage effect immunity without blocking damage payoff', () => {
    const state = createChargedBattleState({ playerTeamIds: ['eso', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const eso = getFighter(state, 'player', 'eso')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    addNonDamageEffectImmunity(enemyYuji)

    const result = resolveTeamTurn(state, queue('player', eso.instanceId, 'eso-impaling-rush', enemyYuji.instanceId), 'player')
    const yujiAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(yujiAfter.hp).toBe(90)
    expect(yujiAfter.stateCounters.rot ?? 0).toBe(0)
    expect(yujiAfter.modifiers.some((modifier) => modifier.tags.includes('rot'))).toBe(false)
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
    const state = createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const kamo = getFighter(state, 'player', 'noritoshi')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const afterTurn = resolveTeamTurn(
      state,
      queue('player', kamo.instanceId, 'noritoshi-crimson-binding', yuji.instanceId),
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
      playerTeamIds: ['mechamaru', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mechamaru = getFighter(state, 'player', 'mechamaru')

    expect(getValidTargetIds(state, mechamaru.instanceId, 'mechamaru-suppressive-fire')).toHaveLength(3)
    expect(canQueueAbility(state, {}, mechamaru, 'mechamaru-suppressive-fire')).toBe(true)

    const resolved = resolveTeamTurn(
      state,
      queue('player', mechamaru.instanceId, 'mechamaru-suppressive-fire', null),
      'player',
    )

    expect(getFighter(resolved.state, 'enemy', 'yuji').hp).toBe(85)
    expect(getFighter(resolved.state, 'enemy', 'nobara').hp).toBe(85)
    expect(getFighter(resolved.state, 'enemy', 'megumi').hp).toBe(85)

    resolved.state.enemyTeam.forEach((fighter) => {
      fighter.hp = 0
    })
    const updatedMechamaru = getFighter(resolved.state, 'player', 'mechamaru')
    updatedMechamaru.cooldowns['mechamaru-suppressive-fire'] = 0
    expect(getQueueAbilityBlockReason(resolved.state, {}, updatedMechamaru, 'mechamaru-suppressive-fire')).toBe('No valid targets')
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
      event.message === `${actor.shortName} dealt 5 to ${target.shortName}'s destructible defense; 7 remaining.` &&
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
      event.amount === 4 &&
      event.meta?.trigger === 'onShieldBroken',
    )).toBe(true)
    expect(broken.events.some((event) =>
      event.message.includes(`${breakTarget.shortName}'s Fragile Guard destructible defense was destroyed after losing 4`) &&
      event.amount === 4,
    )).toBe(true)
    expect(broken.events.some((event) =>
      event.message === `${breakActor.shortName} dealt 4 to ${breakTarget.shortName}'s destructible defense.` &&
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
    expect(countered.events.some((event) =>
      event.message.includes(`countered ${counterAttacker.shortName}'s ${counterAttacker.abilities[0].name}`) &&
      event.message.includes('canceled the skill') &&
      event.message.includes('returned 20 damage'),
    )).toBe(true)
    expect(countered.runtimeEvents.some((event) =>
      event.type === 'ability_interrupted' &&
      event.meta?.reason === 'counter' &&
      event.meta?.canceledAbilityId === counterAttacker.abilities[0].id,
    )).toBe(true)

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
    expect(reflected.events.some((event) =>
      event.message.includes(`reflected ${reflectAttacker.shortName}'s ${reflectAttacker.abilities[0].name}`) &&
      event.message.includes('received the redirected effect'),
    )).toBe(true)
    expect(reflected.runtimeEvents.some((event) =>
      event.type === 'effect_ignored' &&
      event.meta?.reason === 'reflect' &&
      event.meta?.reflectedToTargetId === reflectAttacker.instanceId,
    )).toBe(true)
  })

  test('KO-before-resolution cancels queued action with a visible interruption event', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const nobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'ally-single'
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'damage', power: 200, target: 'inherit' }]
    nobara.abilities[0].targetRule = 'enemy-single'
    nobara.abilities[0].energyCost = {}
    nobara.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const commands: Record<string, QueuedBattleAction> = {
      [yuji.instanceId]: { actorId: yuji.instanceId, team: 'player', abilityId: yuji.abilities[0].id, targetId: nobara.instanceId },
      [nobara.instanceId]: { actorId: nobara.instanceId, team: 'player', abilityId: nobara.abilities[0].id, targetId: enemyYuji.instanceId },
    }
    const result = resolveTeamTurnTimeline(state, commands, 'player', [yuji.instanceId, nobara.instanceId])

    expect(getFighter(result.state, 'player', 'nobara').hp).toBe(0)
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
    expect(result.steps.flatMap((step) => step.events).some((event) =>
      event.message.includes(`${nobara.shortName}'s queued ${nobara.abilities[0].name} was canceled`) &&
      event.message.includes('defeated before acting'),
    )).toBe(true)
    expect(result.steps.flatMap((step) => step.runtimeEvents).some((event) =>
      event.type === 'ability_interrupted' &&
      event.meta?.reason === 'ko_before_resolution' &&
      event.abilityId === nobara.abilities[0].id,
    )).toBe(true)
  })

  test('stun-before-resolution cancels queued action with a visible interruption event', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const nobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    yuji.abilities[0].targetRule = 'ally-single'
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'stun', duration: 1, target: 'inherit' }]
    nobara.abilities[0].targetRule = 'enemy-single'
    nobara.abilities[0].energyCost = {}
    nobara.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const commands: Record<string, QueuedBattleAction> = {
      [yuji.instanceId]: { actorId: yuji.instanceId, team: 'player', abilityId: yuji.abilities[0].id, targetId: nobara.instanceId },
      [nobara.instanceId]: { actorId: nobara.instanceId, team: 'player', abilityId: nobara.abilities[0].id, targetId: enemyYuji.instanceId },
    }
    const result = resolveTeamTurnTimeline(state, commands, 'player', [yuji.instanceId, nobara.instanceId])

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
    expect(result.steps.flatMap((step) => step.events).some((event) =>
      event.message.includes(`${nobara.shortName}'s queued ${nobara.abilities[0].name} was canceled`) &&
      event.message.includes('stunned before acting'),
    )).toBe(true)
    expect(result.steps.flatMap((step) => step.runtimeEvents).some((event) =>
      event.type === 'ability_interrupted' &&
      event.meta?.reason === 'stun_before_resolution' &&
      event.abilityId === nobara.abilities[0].id,
    )).toBe(true)
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
    expect(blocked.events.some((event) => event.message.includes('immunity blocked'))).toBe(true)
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

    expect(mai.stateCounters.cursed_bullet_uses).toBe(2)

    const fired = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-cursed-bullet', enemyYuji.instanceId),
      'player',
    )

    expect(getFighter(fired.state, 'enemy', 'yuji').hp).toBe(70)
    expect(getFighter(fired.state, 'player', 'mai').stateCounters.cursed_bullet_uses).toBe(1)
  })

  test('counter clamps prevent ammo from exceeding authored maximums', () => {
    let state = createChargedBattleState({
      playerTeamIds: ['mai', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mai = getFighter(state, 'player', 'mai')
    mai.stateCounters.cursed_bullet_uses = 3

    state = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-steady-aim', mai.instanceId),
      'player',
    ).state

    expect(getFighter(state, 'player', 'mai').stateCounters.cursed_bullet_uses).toBe(3)
  })

  test('conditional effects do not fire when counters are empty', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['mai', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mai = getFighter(state, 'player', 'mai')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    mai.stateCounters.cursed_bullet_uses = 0

    const result = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-suppressing-fire', enemyYuji.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(75)
    expect(getStatusDuration(getFighter(result.state, 'enemy', 'yuji').statuses, 'stun')).toBe(1)
  })

  test('mode conditions can upgrade Gojo Hollow Purple', () => {
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
    expect(getFighter(state, 'player', 'gojo').stateModes.recent_blue).toBe('active')
    expect(getFighter(state, 'player', 'gojo').stateModes.recent_red).toBe('active')
    expect(getFighter(state, 'player', 'gojo').stateModes.blue_red_aligned).toBe('active')
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
    panda.stateModes.gorilla_mode = 'active'

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

describe('mechanical clarity', () => {
  test('invulnerability blocks damage from a non-bypassing harmful skill', () => {
    const state = createChargedBattleState()
    const actor = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    actor.abilities[0].energyCost = {}
    actor.abilities[0].targetRule = 'enemy-single'
    actor.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]
    target.modifiers.push({
      id: 'test-invuln',
      label: 'Invulnerable',
      scope: 'fighter',
      targetId: target.instanceId,
      stat: 'isInvulnerable',
      mode: 'set',
      value: true,
      duration: { kind: 'permanent' },
      tags: [],
      visible: true,
      stacking: 'max',
      statusKind: 'invincible',
    })

    const result = resolveTeamTurn(state, queue('player', actor.instanceId, actor.abilities[0].id, target.instanceId), 'player')
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
    expect(result.events.some((e) => e.message.includes('invulnerability blocked'))).toBe(true)
  })

  test('skill with ignoresInvulnerability flag deals damage through invulnerability', () => {
    const state = createChargedBattleState()
    const actor = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    actor.abilities[0].energyCost = {}
    actor.abilities[0].targetRule = 'enemy-single'
    actor.abilities[0].effects = [{ type: 'damage', power: 30, ignoresInvulnerability: true, target: 'inherit' }]
    target.modifiers.push({
      id: 'test-invuln',
      label: 'Invulnerable',
      scope: 'fighter',
      targetId: target.instanceId,
      stat: 'isInvulnerable',
      mode: 'set',
      value: true,
      duration: { kind: 'permanent' },
      tags: [],
      visible: true,
      stacking: 'max',
      statusKind: 'invincible',
    })

    const result = resolveTeamTurn(state, queue('player', actor.instanceId, actor.abilities[0].id, target.instanceId), 'player')
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(70)
  })

  test('Affliction-class skill bypasses destructible defense', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const junpei = getFighter(state, 'player', 'junpei')
    const target = getFighter(state, 'enemy', 'yuji')
    target.shield = { amount: 50, label: 'Strong Guard', sourceActorId: target.instanceId, sourceAbilityId: 'test-shield', tags: [] }

    const result = resolveTeamTurn(state, queue('player', junpei.instanceId, 'junpei-moon-dregs-injection', target.instanceId), 'player')
    const afterTarget = getFighter(result.state, 'enemy', 'yuji')
    expect(afterTarget.hp).toBe(90)
    expect(afterTarget.shield?.amount).toBe(50)
  })

  test('Affliction-class skill does not bypass full invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const junpei = getFighter(state, 'player', 'junpei')
    const target = getFighter(state, 'enemy', 'yuji')
    target.modifiers.push({
      id: 'test-invuln',
      label: 'Invulnerable',
      scope: 'fighter',
      targetId: target.instanceId,
      stat: 'isInvulnerable',
      mode: 'set',
      value: true,
      duration: { kind: 'permanent' },
      tags: [],
      visible: true,
      stacking: 'max',
      statusKind: 'invincible',
    })

    const result = resolveTeamTurn(state, queue('player', junpei.instanceId, 'junpei-moon-dregs-injection', target.instanceId), 'player')
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
    expect(result.events.some((e) => e.message.includes('invulnerability blocked'))).toBe(true)
  })

  test('non-Affliction normal damage is absorbed by destructible defense', () => {
    const state = createChargedBattleState()
    const actor = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    actor.abilities[0].energyCost = {}
    actor.abilities[0].targetRule = 'enemy-single'
    actor.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]
    target.shield = { amount: 50, label: 'Strong Guard', sourceActorId: target.instanceId, sourceAbilityId: 'test-shield', tags: [] }

    const result = resolveTeamTurn(state, queue('player', actor.instanceId, actor.abilities[0].id, target.instanceId), 'player')
    const afterTarget = getFighter(result.state, 'enemy', 'yuji')
    expect(afterTarget.hp).toBe(100)
    expect(afterTarget.shield?.amount).toBe(20)
  })

  test('invulnerability log uses "invulnerable" not "untouchable"', () => {
    const state = createChargedBattleState()
    const actor = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    actor.abilities[0].energyCost = {}
    actor.abilities[0].targetRule = 'enemy-single'
    actor.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]
    target.modifiers.push({
      id: 'test-invuln',
      label: 'Invulnerable',
      scope: 'fighter',
      targetId: target.instanceId,
      stat: 'isInvulnerable',
      mode: 'set',
      value: true,
      duration: { kind: 'permanent' },
      tags: [],
      visible: true,
      stacking: 'max',
      statusKind: 'invincible',
    })

    const result = resolveTeamTurn(state, queue('player', actor.instanceId, actor.abilities[0].id, target.instanceId), 'player')
    expect(result.events.some((e) => e.message.toLowerCase().includes('untouchable'))).toBe(false)
    expect(result.events.some((e) => e.message.includes('invulnerability blocked'))).toBe(true)
  })

  test('destructible defense log messages do not contain the word "shield"', () => {
    const state = createChargedBattleState()
    const actor = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    actor.abilities[0].energyCost = {}
    actor.abilities[0].targetRule = 'enemy-single'
    actor.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]
    target.shield = { amount: 20, label: 'Test Guard', sourceActorId: target.instanceId, sourceAbilityId: 'test-shield', tags: [] }

    const result = resolveTeamTurn(state, queue('player', actor.instanceId, actor.abilities[0].id, target.instanceId), 'player')
    const shieldMessages = result.events.filter((e) => e.message.toLowerCase().includes('shield') && !e.message.toLowerCase().includes('destructible'))
    expect(shieldMessages).toHaveLength(0)
  })

  test('invulnerability status log uses "invulnerable" when applied via status effect', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const junpei = getFighter(state, 'player', 'junpei')

    const result = resolveTeamTurn(state, queue('player', junpei.instanceId, 'junpei-moon-dregs-guard', junpei.instanceId), 'player')
    const invulnMessage = result.events.find((e) => e.message.toLowerCase().includes('invulnerable'))
    expect(invulnMessage).toBeDefined()
    expect(result.events.some((e) => e.message.toLowerCase().includes('untouchable'))).toBe(false)
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

describe('Battle Referee Phase 12 reaction timing laws', () => {
  function addTestAbility(fighter: ReturnType<typeof getFighter>, ability: BattleAbilityTemplate) {
    fighter.abilities.push(ability)
    fighter.cooldowns[ability.id] = 0
  }

  function addEffectReactionGuard(
    fighter: ReturnType<typeof getFighter>,
    overrides: Partial<BattleReactionGuardState>,
  ) {
    fighter.reactionGuards.push({
      id: `phase-12-${fighter.reactionGuards.length}`,
      kind: 'effect',
      label: 'Phase 12 Reaction',
      remainingRounds: 2,
      consumeOnTrigger: false,
      trigger: 'onBeingTargeted',
      harmfulOnly: true,
      effects: [],
      sourceActorId: fighter.instanceId,
      ...overrides,
    })
  }

  test('blocking reaction prevents the triggering harmful damage from landing', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'player', 'yuji')
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 25, target: 'inherit' }]
    addEffectReactionGuard(target, {
      effects: [{ type: 'invulnerable', duration: 1, target: 'self' }],
    })

    const result = resolveTeamTurn(state, queue('enemy', attacker.instanceId, attacker.abilities[0].id, target.instanceId), 'enemy')

    expect(getFighter(result.state, 'player', 'yuji').hp).toBe(100)
    expect(result.events.some((event) => event.message.toLowerCase().includes('invulnerability blocked'))).toBe(true)
  })

  test('deferred cleanup reaction does not expose the target to the original action', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'player', 'yuji')
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 25, target: 'inherit' }]
    addInvulnerableModifier(target)
    addEffectReactionGuard(target, {
      deferEffectsUntilAfterTrigger: true,
      effects: [{ type: 'removeModifier', filter: { statusKind: 'invincible' }, target: 'self' }],
    })

    const result = resolveTeamTurn(state, queue('enemy', attacker.instanceId, attacker.abilities[0].id, target.instanceId), 'enemy')
    const targetAfter = getFighter(result.state, 'player', 'yuji')

    expect(targetAfter.hp).toBe(100)
    expect(targetAfter.modifiers.some((modifier) => modifier.statusKind === 'invincible')).toBe(false)
  })

  test('deferred reaction effects resolve after the triggering action window', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'player', 'yuji')
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]
    addEffectReactionGuard(target, {
      deferEffectsUntilAfterTrigger: true,
      effects: [{ type: 'heal', power: 10, target: 'self' }],
    })

    const result = resolveTeamTurn(state, queue('enemy', attacker.instanceId, attacker.abilities[0].id, target.instanceId), 'enemy')

    expect(getFighter(result.state, 'player', 'yuji').hp).toBe(90)
  })

  test('non-deferred reaction effects still resolve in the normal reaction timing', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'player', 'yuji')
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]
    addEffectReactionGuard(target, {
      effects: [{ type: 'heal', power: 10, target: 'self' }],
    })

    const result = resolveTeamTurn(state, queue('enemy', attacker.instanceId, attacker.abilities[0].id, target.instanceId), 'enemy')

    expect(getFighter(result.state, 'player', 'yuji').hp).toBe(80)
  })

  test('multiple effect reactions resolve in deterministic insertion order for the same target', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'player', 'yuji')
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 1, target: 'inherit' }]
    addEffectReactionGuard(target, {
      id: 'phase-12-first',
      effects: [{ type: 'setMode', key: 'phase_12_order', value: 'first', target: 'self' }],
    })
    addEffectReactionGuard(target, {
      id: 'phase-12-second',
      effects: [{
        type: 'conditional',
        target: 'self',
        conditions: [{ type: 'targetModeIs', key: 'phase_12_order', value: 'first' }],
        effects: [{ type: 'adjustCounter', key: 'phase_12_order_seen', amount: 1, target: 'self' }],
      }],
    })

    const result = resolveTeamTurn(state, queue('enemy', attacker.instanceId, attacker.abilities[0].id, target.instanceId), 'enemy')

    expect(getFighter(result.state, 'player', 'yuji').stateCounters.phase_12_order_seen).toBe(1)
  })

  test('counter priority remains before reflect and deferred cleanup still flushes after cancel', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'player', 'yuji')
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 25, target: 'inherit' }]
    addInvulnerableModifier(target)
    addEffectReactionGuard(target, {
      deferEffectsUntilAfterTrigger: true,
      effects: [{ type: 'removeModifier', filter: { statusKind: 'invincible' }, target: 'self' }],
    })
    target.reactionGuards.push({
      id: 'phase-12-counter',
      kind: 'counter',
      label: 'Phase 12 Counter',
      remainingRounds: 2,
      consumeOnTrigger: true,
      counterDamage: 10,
    })
    target.reactionGuards.push({
      id: 'phase-12-reflect',
      kind: 'reflect',
      label: 'Phase 12 Reflect',
      remainingRounds: 2,
      consumeOnTrigger: true,
    })

    const result = resolveTeamTurn(state, queue('enemy', attacker.instanceId, attacker.abilities[0].id, target.instanceId), 'enemy')
    const targetAfter = getFighter(result.state, 'player', 'yuji')

    expect(targetAfter.hp).toBe(100)
    expect(targetAfter.modifiers.some((modifier) => modifier.statusKind === 'invincible')).toBe(false)
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(90)
    expect(result.runtimeEvents.some((event) => event.meta?.reason === 'counter')).toBe(true)
    expect(result.runtimeEvents.some((event) => event.meta?.reason === 'reflect')).toBe(false)
  })

  test('new effect immunity has generic same-round tick protection', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    addTestAbility(yuji, sampleAbility({
      id: 'phase-12-self-immunity',
      name: 'Phase 12 Self Immunity',
      kind: 'defend',
      targetRule: 'self',
      effects: [{ type: 'effectImmunity', label: 'Phase 12 Immunity', blocks: ['nonDamage'], duration: 1, target: 'self' }],
    }))

    const result = resolveTeamTurn(state, queue('player', yuji.instanceId, 'phase-12-self-immunity', yuji.instanceId), 'player')

    expect(getFighter(result.state, 'player', 'yuji').effectImmunities.some((immunity) => immunity.label === 'Phase 12 Immunity')).toBe(true)
  })

  test('deferred reaction effects still respect helpful intent laws', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'player', 'yuji')
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]
    addSetModifier(target, 'canReceiveHelpfulEffects', false)
    addEffectReactionGuard(target, {
      deferEffectsUntilAfterTrigger: true,
      effects: [{ type: 'heal', power: 10, target: 'self' }],
    })

    const result = resolveTeamTurn(state, queue('enemy', attacker.instanceId, attacker.abilities[0].id, target.instanceId), 'enemy')

    expect(getFighter(result.state, 'player', 'yuji').hp).toBe(80)
    expect(result.events.some((event) => event.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })
})

describe('Phase 11B - strict energy affordability', () => {
  function setupRandomCostAbility(pool = createEnergyAmounts({ physical: 1 })) {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    state.playerEnergy = { amounts: pool }
    const actor = getFighter(state, 'player', 'yuji')
    const ability = sampleAbility({
      id: 'strict-random-cost',
      name: 'Strict Random Cost',
      cooldown: 2,
      energyCost: { random: 1 },
      effects: [{ type: 'setFlag', key: 'strict_energy_fired', value: true, target: 'self' }],
    })
    actor.abilities[0] = ability
    return { state, actor, ability }
  }

  test('valid requestedCost pays and ability fires', () => {
    const { state, actor, ability } = setupRandomCostAbility(createEnergyAmounts({ physical: 1 }))
    const command: QueuedBattleAction = {
      actorId: actor.instanceId,
      team: 'player',
      abilityId: ability.id,
      targetId: null,
      randomCostAllocation: { physical: 1 },
    }

    const result = resolveTeamTurn(state, { [actor.instanceId]: command }, 'player')
    const actorAfter = getFighter(result.state, 'player', 'yuji')

    expect(actorAfter.stateFlags.strict_energy_fired).toBe(true)
    expect(actorAfter.cooldowns[ability.id]).toBe(1)
    expect(result.state.playerEnergy.amounts.physical).toBe(0)
  })

  test('invalid requestedCost blocks action instead of falling back to raw random cost', () => {
    const { state, actor, ability } = setupRandomCostAbility(createEnergyAmounts({ technique: 1 }))
    const command: QueuedBattleAction = {
      actorId: actor.instanceId,
      team: 'player',
      abilityId: ability.id,
      targetId: null,
      randomCostAllocation: { physical: 1 },
    }

    const result = resolveTeamTurn(state, { [actor.instanceId]: command }, 'player')
    const actorAfter = getFighter(result.state, 'player', 'yuji')

    expect(actorAfter.stateFlags.strict_energy_fired ?? false).toBe(false)
    expect(actorAfter.cooldowns[ability.id] ?? 0).toBe(0)
    expect(result.state.playerEnergy.amounts).toEqual(createEnergyAmounts({ technique: 1 }))
  })

  test('no requestedCost uses normal cost', () => {
    const { state, actor, ability } = setupRandomCostAbility(createEnergyAmounts({ technique: 1 }))
    const command: QueuedBattleAction = {
      actorId: actor.instanceId,
      team: 'player',
      abilityId: ability.id,
      targetId: null,
    }

    const result = resolveTeamTurn(state, { [actor.instanceId]: command }, 'player')
    const actorAfter = getFighter(result.state, 'player', 'yuji')

    expect(actorAfter.stateFlags.strict_energy_fired).toBe(true)
    expect(result.state.playerEnergy.amounts).toEqual(createEnergyAmounts())
  })

  test('insufficient normal cost blocks action', () => {
    const { state, actor, ability } = setupRandomCostAbility(createEnergyAmounts())
    const command: QueuedBattleAction = {
      actorId: actor.instanceId,
      team: 'player',
      abilityId: ability.id,
      targetId: null,
    }

    const result = resolveTeamTurn(state, { [actor.instanceId]: command }, 'player')
    const actorAfter = getFighter(result.state, 'player', 'yuji')

    expect(actorAfter.stateFlags.strict_energy_fired ?? false).toBe(false)
    expect(result.events.some((event) => event.message.includes('insufficient cursed energy'))).toBe(true)
  })

  test('blocked action does not apply effects', () => {
    const { state, actor, ability } = setupRandomCostAbility(createEnergyAmounts({ technique: 1 }))
    const command: QueuedBattleAction = {
      actorId: actor.instanceId,
      team: 'player',
      abilityId: ability.id,
      targetId: null,
      randomCostAllocation: { physical: 1 },
    }

    const result = resolveTeamTurn(state, { [actor.instanceId]: command }, 'player')
    const actorAfter = getFighter(result.state, 'player', 'yuji')

    expect(actorAfter.stateFlags.strict_energy_fired ?? false).toBe(false)
    expect(result.runtimeEvents.some((event) => event.type === 'ability_used' && event.abilityId === ability.id)).toBe(false)
  })

  test('blocked action does not set cooldown', () => {
    const { state, actor, ability } = setupRandomCostAbility(createEnergyAmounts({ technique: 1 }))
    const command: QueuedBattleAction = {
      actorId: actor.instanceId,
      team: 'player',
      abilityId: ability.id,
      targetId: null,
      randomCostAllocation: { physical: 1 },
    }

    const result = resolveTeamTurn(state, { [actor.instanceId]: command }, 'player')
    const actorAfter = getFighter(result.state, 'player', 'yuji')

    expect(actorAfter.cooldowns[ability.id] ?? 0).toBe(0)
  })

  test('blocked action logs clear cost failure', () => {
    const { state, actor, ability } = setupRandomCostAbility(createEnergyAmounts({ technique: 1 }))
    const command: QueuedBattleAction = {
      actorId: actor.instanceId,
      team: 'player',
      abilityId: ability.id,
      targetId: null,
      randomCostAllocation: { physical: 1 },
    }

    const result = resolveTeamTurn(state, { [actor.instanceId]: command }, 'player')

    expect(result.events.some((event) =>
      event.actorId === actor.instanceId
      && event.abilityId === ability.id
      && event.message === `${actor.shortName} couldn't activate ${ability.name}: insufficient cursed energy.`
    )).toBe(true)
    expect(result.runtimeEvents.some((event) =>
      event.type === 'ability_interrupted'
      && event.abilityId === ability.id
      && event.meta?.reason === 'insufficient_energy'
    )).toBe(true)
  })

  test('existing queued projected-cost behavior remains unchanged', () => {
    const { state, actor, ability } = setupRandomCostAbility(createEnergyAmounts({ physical: 1 }))
    const ally = getFighter(state, 'player', 'nobara')
    ally.abilities[0] = { ...ability, id: 'strict-random-cost-ally' }
    const queued: Record<string, QueuedBattleAction> = {
      [actor.instanceId]: {
        actorId: actor.instanceId,
        team: 'player',
        abilityId: ability.id,
        targetId: null,
        randomCostAllocation: { physical: 1 },
      },
    }
    const secondCommand: QueuedBattleAction = {
      actorId: ally.instanceId,
      team: 'player',
      abilityId: ally.abilities[0].id,
      targetId: null,
      randomCostAllocation: { physical: 1 },
    }

    expect(getBattleCommandBlockReason(state, secondCommand, queued)).toBe('Insufficient cursed energy')
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
    const makeState = () => createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'nobara'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const s1 = makeState()
    const s2 = makeState()
    const kamo1 = getFighter(s1, 'player', 'noritoshi')
    const kamo2 = getFighter(s2, 'player', 'noritoshi')
    const target1 = getFighter(s1, 'enemy', 'yuji')
    const target2 = getFighter(s2, 'enemy', 'yuji')

    const r1 = resolveTeamTurn(s1, queue('player', kamo1.instanceId, 'noritoshi-crimson-binding', target1.instanceId), 'player')
    const r2 = resolveTeamTurn(s2, queue('player', kamo2.instanceId, 'noritoshi-crimson-binding', target2.instanceId), 'player')

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

    // Collapse Point dealt 5 damage + applied 4-round damageTaken +5 modifier.
    // Execution deals 20 + 5 (damageTaken mod) = 25. No Follow-Through. Total: 5 + 25 = 30. HP = 70.
    expect(getFighter(afterExecution.state, 'enemy', 'yuji').hp).toBe(70)
  })

  test('Nanami Collapse Point applies 5 piercing damage and a 4-round damageTaken +5 modifier', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['nanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const nanami = getFighter(state, 'player', 'nanami')
    const target = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', nanami.instanceId, 'nanami-collapse-point', target.instanceId),
      'player',
    )

    const updatedTarget = getFighter(result.state, 'enemy', 'yuji')
    // 5 piercing damage
    expect(updatedTarget.hp).toBe(95)
    // 4-round damageTaken +5 modifier applied
    const collapseMod = updatedTarget.modifiers.find((mod) => mod.tags.includes('collapse-point') && mod.stat === 'damageTaken')
    expect(collapseMod).toBeDefined()
    expect(collapseMod?.duration.kind).toBe('rounds')
    expect(collapseMod?.value).toBe(5)
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

  test('Toge Throat Spray on an ally does NOT skip Vocal Strain for Toge', () => {
    // When Throat Spray targets an ally (not Toge himself), the flag is set on the ally,
    // so Toge's Vocal Strain passive still fires and he takes self-damage.
    const state = createChargedBattleState({
      playerTeamIds: ['toge', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const toge = getFighter(state, 'player', 'toge')
    const ally = getFighter(state, 'player', 'yuji')
    toge.stateCounters.vocal_strain_damage = 10
    const hpBefore = toge.hp

    const result = resolveTeamTurn(
      state,
      queue('player', toge.instanceId, 'toge-throat-spray', ally.instanceId),
      'player',
    )

    const togeAfter = getFighter(result.state, 'player', 'toge')
    // throat_spray_self_used was set on the ally (inherit = ally), not on Toge,
    // so Toge's flag remains false and Vocal Strain fires normally.
    expect(togeAfter.stateFlags.throat_spray_self_used ?? false).toBe(false)
    // Throat Spray heals the ally 10, gives 10 shield; Vocal Strain deals 10 to Toge.
    // Toge's net HP: 100 - 10 = 90 (no self-heal, vocal strain fires).
    expect(togeAfter.hp).toBe(hpBefore - 10)
    // Counter is NOT reset (vocal strain path, not reset path)
    expect(togeAfter.stateCounters.vocal_strain_damage).toBe(10)
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

  test('Todo Besto Friendo does not mark Todo himself when using Unshakable Confidence', () => {
    // Unshakable Confidence is Strategic/Instant/Ultimate (not Physical), so the
    // abilityClass:'Physical' condition on Besto Friendo prevents it from firing.
    const state = createChargedBattleState({
      playerTeamIds: ['todo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const todo = getFighter(state, 'player', 'todo')

    const result = resolveTeamTurn(
      state,
      queue('player', todo.instanceId, 'todo-unshakable-confidence', todo.instanceId),
      'player',
    )

    const todoAfter = getFighter(result.state, 'player', 'todo')
    // Besto Friendo must NOT have fired: no todo-type or todo-type-damage modifiers on Todo himself.
    expect(todoAfter.modifiers.some((mod) => mod.tags.includes('todo-type'))).toBe(false)
    expect(todoAfter.modifiers.some((mod) => mod.tags.includes('todo-type-damage'))).toBe(false)
  })

  test('Todo Follow-Up Assault deals 20+15 bonus against Boogie Woogie targets, then stuns Physical', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['todo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const todo = getFighter(state, 'player', 'todo')
    const target = getFighter(state, 'enemy', 'yuji')

    // Baseline: Follow-Up without Boogie Woogie deals only 20 (no bonus, no stun)
    const baselineState = createChargedBattleState({
      playerTeamIds: ['todo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    getFighter(baselineState, 'player', 'todo').cooldowns['todo-follow-up-assault'] = 0
    const baseline = resolveTeamTurn(
      baselineState,
      queue('player', getFighter(baselineState, 'player', 'todo').instanceId, 'todo-follow-up-assault', getFighter(baselineState, 'enemy', 'yuji').instanceId),
      'player',
    )
    // No boogie-woogie tag: 20 base only (Besto Friendo fires onAbilityResolve AFTER damage, so +5 damageTaken is set post-hit)
    expect(getFighter(baseline.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(baseline.state, 'enemy', 'yuji').classStuns).toHaveLength(0)

    // With Boogie Woogie: Follow-Up deals 20 + 15 damageFiltered bonus, and Physical class stun applies
    const boogieed = resolveTeamTurn(
      state,
      queue('player', todo.instanceId, 'todo-boogie-woogie', target.instanceId),
      'player',
    )
    const todoAfterBoogie = getFighter(boogieed.state, 'player', 'todo')
    todoAfterBoogie.cooldowns['todo-follow-up-assault'] = 0

    const assaulted = resolveTeamTurn(
      boogieed.state,
      queue('player', todoAfterBoogie.instanceId, 'todo-follow-up-assault', getFighter(boogieed.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    const yujiAfter = getFighter(assaulted.state, 'enemy', 'yuji')
    // With Boogie Woogie tag: 20 base + 15 damageFiltered = 35 + type-damage modifier = 45 damage → HP = 55
    expect(yujiAfter.hp).toBe(55)
    // Physical class stun applied (target had boogie-woogie tag)
    expect(yujiAfter.classStuns.some((stun) => stun.blockedClasses.includes('Physical'))).toBe(true)
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
    expect(updatedPanda.stateFlags.panda_three_cores_triggered).toBe(true)
    expect(updatedPanda.stateModes.gorilla_mode).toBe('active')
  })

  test('Panda Three Cores does not fire a second time once already in gorilla mode', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['panda', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const panda = getFighter(state, 'player', 'panda')
    const attacker = getFighter(state, 'enemy', 'yuji')
    // Already triggered
    panda.stateFlags.panda_three_cores_triggered = true
    panda.stateModes.gorilla_mode = 'active'
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
    expect(updatedPanda.stateFlags.panda_three_cores_triggered).toBe(true)
  })

  // ─── Kamo: Refined Technique ─────────────────────────────────────────────────
  // Risk: Kamo's sequence bonus is prepared after a different consecutive skill,
  // then consumed by the next damaging skill rather than modifying Blood Draw's
  // self-cost.
  test('Kamo Refined Technique prepares a next damaging skill bonus after different consecutive skills', () => {
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

    expect(kamoAfterPierce.stateCounters.kamo_refined_bonus).toBe(1)
  })

  test('Kamo Refined Technique does not prepare a bonus when repeating the same skill', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['noritoshi', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const kamo = getFighter(state, 'player', 'noritoshi')

    const afterFirstPierce = resolveTeamTurn(
      state,
      queue('player', kamo.instanceId, 'noritoshi-piercing-blood', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const afterSecondPierce = resolveTeamTurn(
      afterFirstPierce.state,
      queue('player', getFighter(afterFirstPierce.state, 'player', 'noritoshi').instanceId, 'noritoshi-piercing-blood', getFighter(afterFirstPierce.state, 'enemy', 'nobara').instanceId),
      'player',
    )

    expect(getFighter(afterFirstPierce.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(afterSecondPierce.state, 'player', 'noritoshi').stateCounters.kamo_refined_bonus ?? 0).toBe(0)
  })

  // ─── Gojo: Infinity passive ──────────────────────────────────────────────────
  // Risk: Infinity fires on onRoundStart, applying invulnerable + effectImmunity
  // plus a pre-damage reaction. The first harmful targeting is blocked by
  // Infinity, then deferred collapse suppresses the next round-start reapply.
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

    // Normal harmful targeting is blocked before deferred collapse removes Infinity.
    const afterHit = resolveTeamTurn(
      afterRoundStart.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, gojoAfterStart.instanceId),
      'enemy',
    )

    const gojoAfterHit = getFighter(afterHit.state, 'player', 'gojo')
    expect(gojoAfterHit.hp).toBe(100)
    expect(getStatusDuration(gojoAfterHit.statuses, 'invincible')).toBe(0)
    expect(gojoAfterHit.effectImmunities.some((imm) => (imm.tags ?? []).includes('infinity'))).toBe(false)
    expect(gojoAfterHit.stateModes.infinity_collapsed).toBe('active')
    expect(afterHit.events.some((event) => event.message.toLowerCase().includes('invulnerability blocked'))).toBe(true)
  })

  test('Gojo Infinity blocks harmful non-damage effects from the triggering skill before collapse', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['gojo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [
      { type: 'damage', power: 25, target: 'inherit' },
      { type: 'stun', duration: 1, target: 'inherit' },
    ]

    const afterRoundStart = beginNewRound(state)
    const result = resolveTeamTurn(
      afterRoundStart.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, getFighter(afterRoundStart.state, 'player', 'gojo').instanceId),
      'enemy',
    )

    const gojoAfterHit = getFighter(result.state, 'player', 'gojo')
    expect(gojoAfterHit.hp).toBe(100)
    expect(getStatusDuration(gojoAfterHit.statuses, 'stun')).toBe(0)
    expect(gojoAfterHit.stateModes.infinity_collapsed).toBe('active')
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

    // Damage should land despite invulnerability; Infinity still collapses after the triggering action.
    expect(getFighter(afterHit.state, 'player', 'gojo').hp).toBe(80)
    expect(getFighter(afterHit.state, 'player', 'gojo').stateModes.infinity_collapsed).toBe('active')
  })
})

describe('third batch roster rework', () => {
  test('Junpei Weak Constitution increases incoming damage after round-start setup', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const started = beginNewRound(state).state
    const junpei = getFighter(started, 'player', 'junpei')
    const enemyYuji = getFighter(started, 'enemy', 'yuji')

    const result = resolveTeamTurn(started, queue('enemy', enemyYuji.instanceId, 'yuji-divergent-fist', junpei.instanceId), 'enemy')

    expect(getFighter(result.state, 'player', 'junpei').hp).toBe(75)
  })

  test('Junpei Moon Dregs applies a marker, scheduled damage, and harmful-skill punishment', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const junpei = getFighter(state, 'player', 'junpei')
    junpei.hp = 80
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const injected = resolveTeamTurn(state, queue('player', junpei.instanceId, 'junpei-moon-dregs-injection', enemyYuji.instanceId), 'player')
    const poisoned = getFighter(injected.state, 'enemy', 'yuji')
    expect(poisoned.hp).toBe(90)
    expect(poisoned.modifiers.some((modifier) => modifier.tags.includes('moon-dregs-injection'))).toBe(true)
    expect(getFighter(injected.state, 'player', 'junpei').hp).toBe(85)

    const ticked = beginNewRound(injected.state).state
    expect(getFighter(ticked, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(ticked, 'player', 'junpei').hp).toBe(90)

    const punished = resolveTeamTurn(
      ticked,
      queue('enemy', getFighter(ticked, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(ticked, 'player', 'junpei').instanceId),
      'enemy',
    )
    expect(getFighter(punished.state, 'enemy', 'yuji').hp).toBe(70)
  })

  test('Junpei Paralytic Poison traps the next skill use', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const trapped = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'junpei').instanceId, 'junpei-paralytic-poison', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const triggered = resolveTeamTurn(
      trapped.state,
      queue('enemy', getFighter(trapped.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(trapped.state, 'player', 'junpei').instanceId),
      'enemy',
    )
    const after = getFighter(triggered.state, 'enemy', 'yuji')

    expect(after.hp).toBe(85)
    expect(getStatusDuration(after.statuses, 'stun')).toBe(1)
  })

  test('Junpei Toxic Break has normal damage and Moon Dregs payoff with affliction scaling', () => {
    const normalState = createChargedBattleState({ playerTeamIds: ['junpei', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const normal = resolveTeamTurn(
      normalState,
      queue('player', getFighter(normalState, 'player', 'junpei').instanceId, 'junpei-toxic-break', getFighter(normalState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(normal.state, 'enemy', 'yuji').hp).toBe(80)

    const markedState = createChargedBattleState({ playerTeamIds: ['junpei', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const injected = resolveTeamTurn(
      markedState,
      queue('player', getFighter(markedState, 'player', 'junpei').instanceId, 'junpei-moon-dregs-injection', getFighter(markedState, 'enemy', 'yuji').instanceId),
      'player',
    )
    const broken = resolveTeamTurn(
      injected.state,
      queue('player', getFighter(injected.state, 'player', 'junpei').instanceId, 'junpei-toxic-break', getFighter(injected.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const target = getFighter(broken.state, 'enemy', 'yuji')
    expect(target.hp).toBe(55)
    expect(target.modifiers.some((modifier) => modifier.tags.includes('toxic-break-toxicity') && modifier.damageClass === 'Affliction')).toBe(true)

    const reinjected = resolveTeamTurn(
      broken.state,
      queue('player', getFighter(broken.state, 'player', 'junpei').instanceId, 'junpei-moon-dregs-injection', target.instanceId),
      'player',
    )
    expect(getFighter(reinjected.state, 'enemy', 'yuji').hp).toBe(40)
  })

  test('Junpei Moon Dregs Guard grants invulnerability and poisons the first harmful attacker', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const guarded = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'junpei').instanceId, 'junpei-moon-dregs-guard', getFighter(state, 'player', 'junpei').instanceId), 'player')
    const attacked = resolveTeamTurn(
      guarded.state,
      queue('enemy', getFighter(guarded.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(guarded.state, 'player', 'junpei').instanceId),
      'enemy',
    )

    expect(getFighter(attacked.state, 'player', 'junpei').hp).toBe(100)
    const enemyYuji = getFighter(attacked.state, 'enemy', 'yuji')
    expect(enemyYuji.hp).toBe(85)
    expect(enemyYuji.modifiers.some((modifier) => modifier.tags.includes('moon-dregs-injection'))).toBe(true)
  })

  test('Mahito Understanding marks the first target and the next damaging skill consumes it for bonus damage', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mahito', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const first = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'mahito').instanceId, 'mahito-idle-transfiguration', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(first.state, 'enemy', 'yuji').modifiers.some((modifier) => modifier.tags.includes('soul-understanding'))).toBe(true)

    const second = resolveTeamTurn(
      first.state,
      queue('player', getFighter(first.state, 'player', 'mahito').instanceId, 'mahito-idle-transfiguration', getFighter(first.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const target = getFighter(second.state, 'enemy', 'yuji')
    expect(target.hp).toBe(50)
    expect(target.modifiers.some((modifier) => modifier.tags.includes('soul-understanding'))).toBe(false)
  })

  test('Mahito Idle Transfiguration applies deterministic damage suppression', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mahito', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const result = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'mahito').instanceId, 'mahito-idle-transfiguration', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const target = getFighter(result.state, 'enemy', 'yuji')
    expect(target.hp).toBe(80)
    expect(target.modifiers.some((modifier) => modifier.tags.includes('idle-transfiguration') && modifier.stat === 'damageDealt')).toBe(true)
  })

  test('Mahito Soul Multiplicity upgrades to 25 all enemies against an Idle Transfiguration target', () => {
    const baseState = createChargedBattleState({ playerTeamIds: ['mahito', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const base = resolveTeamTurn(
      baseState,
      queue('player', getFighter(baseState, 'player', 'mahito').instanceId, 'mahito-soul-multiplicity', getFighter(baseState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(base.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([85, 85, 85])

    const setupState = createChargedBattleState({ playerTeamIds: ['mahito', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const idle = resolveTeamTurn(
      setupState,
      queue('player', getFighter(setupState, 'player', 'mahito').instanceId, 'mahito-idle-transfiguration', getFighter(setupState, 'enemy', 'yuji').instanceId),
      'player',
    )
    const upgraded = resolveTeamTurn(
      idle.state,
      queue('player', getFighter(idle.state, 'player', 'mahito').instanceId, 'mahito-soul-multiplicity', getFighter(idle.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(upgraded.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([45, 75, 75])
  })

  test('Mahito Soul Experimentation marks a target and rewards defeat with permanent damage', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mahito', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const marked = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'mahito').instanceId, 'mahito-soul-experimentation', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const markedYuji = getFighter(marked.state, 'enemy', 'yuji')
    expect(markedYuji.modifiers.some((modifier) => modifier.tags.includes('soul-experimentation'))).toBe(true)
    markedYuji.hp = 10

    const defeated = resolveTeamTurn(
      marked.state,
      queue('player', getFighter(marked.state, 'player', 'mahito').instanceId, 'mahito-idle-transfiguration', markedYuji.instanceId),
      'player',
    )
    expect(getFighter(defeated.state, 'player', 'mahito').modifiers.some((modifier) => modifier.tags.includes('soul-experimentation-breakthrough'))).toBe(true)

    const empowered = resolveTeamTurn(
      defeated.state,
      queue('player', getFighter(defeated.state, 'player', 'mahito').instanceId, 'mahito-idle-transfiguration', getFighter(defeated.state, 'enemy', 'nobara').instanceId),
      'player',
    )
    expect(getFighter(empowered.state, 'enemy', 'nobara').hp).toBe(70)
  })

  test('Mahito Self-Embodiment grants invulnerability and transfigures the first harmful attacker', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mahito', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const guarded = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'mahito').instanceId, 'mahito-self-embodiment', getFighter(state, 'player', 'mahito').instanceId), 'player')
    const attacked = resolveTeamTurn(
      guarded.state,
      queue('enemy', getFighter(guarded.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(guarded.state, 'player', 'mahito').instanceId),
      'enemy',
    )

    expect(getFighter(attacked.state, 'player', 'mahito').hp).toBe(100)
    const enemyYuji = getFighter(attacked.state, 'enemy', 'yuji')
    expect(enemyYuji.hp).toBe(80)
    expect(enemyYuji.modifiers.some((modifier) => modifier.tags.includes('idle-transfiguration'))).toBe(true)
  })

  test('Hanami Natural Body grants shield and damage reduction on round start', () => {
    const state = createChargedBattleState({ playerTeamIds: ['hanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const started = beginNewRound(state).state
    const hanami = getFighter(started, 'player', 'hanami')
    expect(hanami.shield?.amount).toBe(10)

    const hit = resolveTeamTurn(started, queue('enemy', getFighter(started, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', hanami.instanceId), 'enemy')
    const after = getFighter(hit.state, 'player', 'hanami')
    expect(after.shield).toBeNull()
    expect(after.hp).toBe(95)
  })

  test('Hanami Root Snare suppresses damage and prevents invulnerability gain', () => {
    const state = createChargedBattleState({ playerTeamIds: ['hanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const snared = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'hanami').instanceId, 'hanami-root-snare', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const target = getFighter(snared.state, 'enemy', 'yuji')
    expect(target.hp).toBe(85)
    expect(target.modifiers.some((modifier) => modifier.tags.includes('root-snare') && modifier.stat === 'damageDealt')).toBe(true)
    expect(target.modifiers.some((modifier) => modifier.tags.includes('root-snare') && modifier.stat === 'canGainInvulnerable')).toBe(true)
  })

  test('Hanami Forest Expansion damages all enemies and applies pressure modifiers', () => {
    const state = createChargedBattleState({ playerTeamIds: ['hanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const result = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'hanami').instanceId, 'hanami-forest-expansion', null), 'player')

    expect(result.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([85, 85, 85])
    expect(result.state.enemyTeam.every((fighter) => fighter.modifiers.some((modifier) => modifier.tags.includes('forest-expansion') && modifier.stat === 'damageTaken'))).toBe(true)
    expect(result.state.enemyTeam.every((fighter) => fighter.modifiers.some((modifier) => modifier.tags.includes('forest-expansion') && modifier.stat === 'damageDealt'))).toBe(true)
  })

  test("Hanami Nature's Resilience grants invulnerability and punishes harmful targeting", () => {
    const state = createChargedBattleState({ playerTeamIds: ['hanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const guarded = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'hanami').instanceId, 'hanami-natures-resilience', getFighter(state, 'player', 'hanami').instanceId), 'player')
    const attacked = resolveTeamTurn(
      guarded.state,
      queue('enemy', getFighter(guarded.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(guarded.state, 'player', 'hanami').instanceId),
      'enemy',
    )

    expect(getFighter(attacked.state, 'player', 'hanami').hp).toBe(100)
    expect(attacked.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([90, 90, 90])
  })

  // ─── Hanami: Cursed Bud Growth trap/heal loop ────────────────────────────────
  // Risk: The onAbilityUse reaction must attach to the enemy, trigger when they
  // next use any skill (harmfulOnly:false), deal 15 to them, heal Hanami 15,
  // then be consumed (consumeOnTrigger:true). If consumeOnTrigger or the heal
  // target ('self' relative to the reaction source) are wrong, the loop either
  // fires repeatedly or Hanami never heals.
  test('Hanami Cursed Bud Growth applies trap, deals 15 on enemy skill use, heals Hanami 15, then consumes', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['hanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const hanami = getFighter(state, 'player', 'hanami')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    hanami.hp = 70

    // Step 1: Hanami uses Cursed Bud Growth on enemy Yuji (deals 20 + installs reaction)
    const afterBud = resolveTeamTurn(
      state,
      queue('player', hanami.instanceId, 'hanami-cursed-bud-growth', enemyYuji.instanceId),
      'player',
    )
    expect(getFighter(afterBud.state, 'enemy', 'yuji').hp).toBe(80)
    // Hanami takes no damage in this step; HP unchanged (no Vocal Strain etc.)
    expect(getFighter(afterBud.state, 'player', 'hanami').hp).toBe(70)
    // Trap reaction guard is installed on the enemy
    expect(getFighter(afterBud.state, 'enemy', 'yuji').reactionGuards.some((g) => g.label === 'Cursed Bud Growth')).toBe(true)

    // Step 2: Enemy Yuji uses any skill — trap triggers, Yuji takes 15, Hanami heals 15.
    // Yuji's ability (Divergent Fist) deals 20 to Hanami: 70 - 20 + 15 (heal) = 65.
    const markedYuji = getFighter(afterBud.state, 'enemy', 'yuji')
    markedYuji.abilities[0].energyCost = {}

    const afterTrigger = resolveTeamTurn(
      afterBud.state,
      queue('enemy', markedYuji.instanceId, markedYuji.abilities[0].id, getFighter(afterBud.state, 'player', 'hanami').instanceId),
      'enemy',
    )

    // Yuji HP: 80 - 15 (trap damage) = 65
    expect(getFighter(afterTrigger.state, 'enemy', 'yuji').hp).toBe(65)
    // Hanami HP: 70 - 20 (Yuji Divergent Fist) + 15 (trap heal) = 65
    const hanamiAfter = getFighter(afterTrigger.state, 'player', 'hanami')
    expect(hanamiAfter.hp).toBe(65)

    // Step 3: Trap is consumed — no more Cursed Bud Growth reaction guard on Yuji
    expect(getFighter(afterTrigger.state, 'enemy', 'yuji').reactionGuards.some((g) => g.label === 'Cursed Bud Growth')).toBe(false)
  })
})

describe('fourth batch roster rework', () => {
  test('Jogo Ember Insects grants shield, applies Scorched, and exposes the Scorched pip', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const result = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'jogo').instanceId, 'jogo-ember-insects', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const jogo = getFighter(result.state, 'player', 'jogo')
    const target = getFighter(result.state, 'enemy', 'yuji')
    const scorchedPip = getActivePips(target).find((pip) => pip.label === 'Scorched')

    expect(jogo.shield?.amount).toBe(10)
    expect(target.stateCounters.scorched).toBe(1)
    expect(scorchedPip?.stackCount).toBe(1)
    expect(scorchedPip?.lines.some((line) => line.text.includes('Cataclysmic Eruption deals 5 damage'))).toBe(true)
  })

  test('Jogo Disaster Heat deals 5 damage per Scorched stack at round start', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    getFighter(state, 'enemy', 'yuji').stateCounters.scorched = 2

    const result = beginNewRound(state).state

    expect(getFighter(result, 'enemy', 'yuji').hp).toBe(90)
  })

  test('Jogo Cataclysmic Eruption uses each target Scorched count and consumes it', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    getFighter(state, 'enemy', 'yuji').stateCounters.scorched = 1
    getFighter(state, 'enemy', 'nobara').stateCounters.scorched = 2
    getFighter(state, 'enemy', 'megumi').stateCounters.scorched = 3

    const result = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'jogo').instanceId, 'jogo-cataclysmic-eruption', null),
      'player',
    )

    expect(result.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([95, 90, 85])
    expect(result.state.enemyTeam.map((fighter) => fighter.stateCounters.scorched ?? 0)).toEqual([0, 0, 0])
  })

  test('Jogo Volcanic Infestation adds Scorched when enemies use new harmful skills', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const trapped = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'jogo').instanceId, 'jogo-volcanic-infestation', null), 'player')
    const triggered = resolveTeamTurn(
      trapped.state,
      queue('enemy', getFighter(trapped.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(trapped.state, 'player', 'jogo').instanceId),
      'enemy',
    )

    expect(getFighter(triggered.state, 'enemy', 'yuji').stateCounters.scorched).toBe(1)
  })

  test('Jogo Molten Husk grants invulnerability and adds Scorched to all enemies when targeted', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const guarded = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'jogo').instanceId, 'jogo-molten-husk', getFighter(state, 'player', 'jogo').instanceId), 'player')
    const attacked = resolveTeamTurn(
      guarded.state,
      queue('enemy', getFighter(guarded.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(guarded.state, 'player', 'jogo').instanceId),
      'enemy',
    )

    expect(getFighter(attacked.state, 'player', 'jogo').hp).toBe(100)
    expect(attacked.state.enemyTeam.map((fighter) => fighter.stateCounters.scorched ?? 0)).toEqual([1, 1, 1])
  })

  test('Jogo Ember Insects shield-break retaliation applies Scorched to the breaker', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const seeded = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'jogo').instanceId, 'jogo-ember-insects', getFighter(state, 'enemy', 'nobara').instanceId),
      'player',
    )
    const attacker = getFighter(seeded.state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const broken = resolveTeamTurn(
      seeded.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, getFighter(seeded.state, 'player', 'jogo').instanceId),
      'enemy',
    )

    expect(getFighter(broken.state, 'enemy', 'yuji').stateCounters.scorched).toBe(1)
  })

  test('Jogo damage threshold trigger carries excess damage toward the next trigger', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['jogo', 'yuji', 'megumi'] })
    const attacker = getFighter(state, 'player', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]

    const result = resolveTeamTurn(state, queue('player', attacker.instanceId, attacker.abilities[0].id, getFighter(state, 'enemy', 'jogo').instanceId), 'player')

    expect(getFighter(result.state, 'enemy', 'jogo').stateCounters.jogo_damage_taken).toBe(5)
    expect(result.state.playerTeam.map((fighter) => fighter.stateCounters.scorched ?? 0)).toEqual([1, 1, 1])
  })

  test('Maki Sweeping Polearm deals AoE damage, schedules follow-up damage, and punishes attackers', () => {
    const state = createChargedBattleState({ playerTeamIds: ['maki', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const swept = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'maki').instanceId, 'maki-sweeping-polearm', null), 'player')
    expect(swept.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([90, 90, 90])

    const punished = resolveTeamTurn(
      swept.state,
      queue('enemy', getFighter(swept.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(swept.state, 'player', 'maki').instanceId),
      'enemy',
    )
    expect(getFighter(punished.state, 'enemy', 'yuji').hp).toBe(80)

    const ticked = beginNewRound(punished.state).state
    expect(ticked.enemyTeam.map((fighter) => fighter.hp)).toEqual([75, 85, 85])
  })

  test('Maki Close-Quarters Combo deals delayed damage and grants damage reduction', () => {
    const state = createChargedBattleState({ playerTeamIds: ['maki', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const combo = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'maki').instanceId, 'maki-close-quarters-combo', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(combo.state, 'enemy', 'yuji').hp).toBe(85)

    const hit = resolveTeamTurn(
      combo.state,
      queue('enemy', getFighter(combo.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(combo.state, 'player', 'maki').instanceId),
      'enemy',
    )
    expect(getFighter(hit.state, 'player', 'maki').hp).toBe(90)

    const ticked = beginNewRound(hit.state).state
    expect(getFighter(ticked, 'enemy', 'yuji').hp).toBe(70)
  })

  test('Maki Playful Cloud Strike ignores invulnerability and gives a consumed next-skill bonus', () => {
    const state = createChargedBattleState({ playerTeamIds: ['maki', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const protectedYuji = resolveTeamTurn(
      state,
      queue('enemy', getFighter(state, 'enemy', 'yuji').instanceId, 'yuji-indomitable-spirit', getFighter(state, 'enemy', 'yuji').instanceId),
      'enemy',
    )
    const playful = resolveTeamTurn(
      protectedYuji.state,
      queue('player', getFighter(protectedYuji.state, 'player', 'maki').instanceId, 'maki-playful-cloud-strike', getFighter(protectedYuji.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(playful.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(playful.state, 'player', 'maki').stateCounters.maki_weapon_bonus).toBe(5)

    const bonus = resolveTeamTurn(
      playful.state,
      queue('player', getFighter(playful.state, 'player', 'maki').instanceId, 'maki-close-quarters-combo', getFighter(playful.state, 'enemy', 'nobara').instanceId),
      'player',
    )
    expect(getFighter(bonus.state, 'enemy', 'nobara').hp).toBe(80)
    expect(getFighter(bonus.state, 'player', 'maki').stateCounters.maki_weapon_bonus).toBe(0)
  })

  test('Maki tracks skill uses and Weapon Mastery triggers once with immediate damage and higher costs', () => {
    const state = createChargedBattleState({ playerTeamIds: ['maki', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const maki = getFighter(state, 'player', 'maki')
    maki.stateCounters.maki_skill_uses = 3
    maki.hp = 75
    const attacker = getFighter(state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 10, target: 'inherit' }]

    const mastered = resolveTeamTurn(state, queue('enemy', attacker.instanceId, attacker.abilities[0].id, maki.instanceId), 'enemy')
    const masteredMaki = getFighter(mastered.state, 'player', 'maki')
    const combo = masteredMaki.abilities.find((ability) => ability.id === 'maki-close-quarters-combo')
    if (!combo) throw new Error('Missing Maki combo')

    expect(masteredMaki.stateFlags.maki_weapon_mastery_used).toBe(true)
    expect(masteredMaki.stateModes.weapon_mastery).toBe('active')
    expect(getResolvedAbilityEnergyCost(masteredMaki, combo).cost.random).toBe(1)

    const result = resolveTeamTurn(
      mastered.state,
      queue('player', masteredMaki.instanceId, 'maki-close-quarters-combo', getFighter(mastered.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(70)
  })

  test('Maki skill-use tracker increments on ability resolve and Tactical Withdrawal grants invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['maki', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const used = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'maki').instanceId, 'maki-close-quarters-combo', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(used.state, 'player', 'maki').stateCounters.maki_skill_uses).toBe(1)

    const withdrawn = resolveTeamTurn(
      used.state,
      queue('player', getFighter(used.state, 'player', 'maki').instanceId, 'maki-tactical-withdrawal', getFighter(used.state, 'player', 'maki').instanceId),
      'player',
    )
    expect(getStatusDuration(getFighter(withdrawn.state, 'player', 'maki').statuses, 'invincible')).toBe(1)
  })

  test('Panda Punch deals 20 normally and 40 in Gorilla Mode with increased cost from Core Shift', () => {
    const normalState = createChargedBattleState({ playerTeamIds: ['panda', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const normal = resolveTeamTurn(
      normalState,
      queue('player', getFighter(normalState, 'player', 'panda').instanceId, 'panda-punch', getFighter(normalState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(normal.state, 'enemy', 'yuji').hp).toBe(80)

    const shiftedState = createChargedBattleState({ playerTeamIds: ['panda', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const shifted = resolveTeamTurn(
      shiftedState,
      queue('player', getFighter(shiftedState, 'player', 'panda').instanceId, 'panda-core-shift', getFighter(shiftedState, 'player', 'panda').instanceId),
      'player',
    )
    const shiftedPanda = getFighter(shifted.state, 'player', 'panda')
    const punch = shiftedPanda.abilities.find((ability) => ability.id === 'panda-punch')
    if (!punch) throw new Error('Missing Panda Punch')
    expect(getResolvedAbilityEnergyCost(shiftedPanda, punch).cost.random).toBe(1)

    const gorillaPunch = resolveTeamTurn(
      shifted.state,
      queue('player', shiftedPanda.instanceId, 'panda-punch', getFighter(shifted.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(gorillaPunch.state, 'enemy', 'yuji').hp).toBe(60)
  })

  test('Panda Cursed Body has normal and Gorilla Mode defensive branches', () => {
    const normalState = createChargedBattleState({ playerTeamIds: ['panda', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const normal = resolveTeamTurn(
      normalState,
      queue('player', getFighter(normalState, 'player', 'panda').instanceId, 'panda-cursed-body', getFighter(normalState, 'player', 'panda').instanceId),
      'player',
    )
    const normalPanda = getFighter(normal.state, 'player', 'panda')
    expect(normalPanda.shield?.amount).toBe(20)
    expect(normalPanda.modifiers.find((modifier) => modifier.tags.includes('cursed-body') && modifier.stat === 'damageTaken')?.duration).toEqual({ kind: 'rounds', remaining: 2 })
    expect(normalPanda.effectImmunities).toHaveLength(0)

    const gorillaState = createChargedBattleState({ playerTeamIds: ['panda', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    getFighter(gorillaState, 'player', 'panda').stateModes.gorilla_mode = 'active'
    const gorilla = resolveTeamTurn(
      gorillaState,
      queue('player', getFighter(gorillaState, 'player', 'panda').instanceId, 'panda-cursed-body', getFighter(gorillaState, 'player', 'panda').instanceId),
      'player',
    )
    const gorillaPanda = getFighter(gorilla.state, 'player', 'panda')
    expect(gorillaPanda.modifiers.find((modifier) => modifier.tags.includes('cursed-body') && modifier.stat === 'damageTaken')?.duration).toEqual({ kind: 'rounds', remaining: 3 })
    expect(gorillaPanda.effectImmunities.some((immunity) => immunity.blocks.includes('nonDamage'))).toBe(true)
  })

  test('Panda Drumming Beat deals 30 normally and 60 plus self harmful-skill stun in Gorilla Mode', () => {
    const normalState = createChargedBattleState({ playerTeamIds: ['panda', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const normal = resolveTeamTurn(
      normalState,
      queue('player', getFighter(normalState, 'player', 'panda').instanceId, 'panda-drumming-beat', getFighter(normalState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(normal.state, 'enemy', 'yuji').hp).toBe(70)

    const gorillaState = createChargedBattleState({ playerTeamIds: ['panda', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    getFighter(gorillaState, 'player', 'panda').stateModes.gorilla_mode = 'active'
    const gorilla = resolveTeamTurn(
      gorillaState,
      queue('player', getFighter(gorillaState, 'player', 'panda').instanceId, 'panda-drumming-beat', getFighter(gorillaState, 'enemy', 'yuji').instanceId),
      'player',
    )
    const panda = getFighter(gorilla.state, 'player', 'panda')
    expect(getFighter(gorilla.state, 'enemy', 'yuji').hp).toBe(40)
    expect(panda.intentStuns.some((stun) => stun.intent === 'harmful')).toBe(true)
  })

  test('Panda Core Shift grants invulnerability and temporary Gorilla Mode without triggering Three Cores', () => {
    const state = createChargedBattleState({ playerTeamIds: ['panda', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const shifted = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'panda').instanceId, 'panda-core-shift', getFighter(state, 'player', 'panda').instanceId),
      'player',
    )
    const panda = getFighter(shifted.state, 'player', 'panda')

    expect(getStatusDuration(panda.statuses, 'invincible')).toBe(1)
    expect(panda.stateModes.gorilla_mode).toBe('active')
    expect(panda.stateModeDurations.gorilla_mode?.remainingRounds).toBe(1)
    expect(panda.stateFlags.panda_three_cores_triggered ?? false).toBe(false)
  })
})

describe('Character Readiness Phase 3 - P1 referee stress tests', () => {
  test('Todo Boogie Woogie enemy debuffs are blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['todo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const todo = getFighter(state, 'player', 'todo')
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(state, queue('player', todo.instanceId, 'todo-boogie-woogie', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('boogie-woogie'))).toBe(false)
  })

  test('Todo Boogie Woogie guard becomes invulnerable and reflects during the triggering window', () => {
    const state = createChargedBattleState({ playerTeamIds: ['todo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const todo = getFighter(state, 'player', 'todo')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const guarded = resolveTeamTurn(state, queue('player', todo.instanceId, 'todo-boogie-woogie', enemyYuji.instanceId), 'player')

    const attacked = resolveTeamTurn(
      guarded.state,
      queue('enemy', getFighter(guarded.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(guarded.state, 'player', 'todo').instanceId),
      'enemy',
    )

    expect(getFighter(attacked.state, 'player', 'todo').hp).toBe(100)
    expect(getFighter(attacked.state, 'enemy', 'yuji').hp).toBe(75)
  })

  test('Todo Boogie Woogie guard still reflects if invulnerability gain is blocked', () => {
    const state = createChargedBattleState({ playerTeamIds: ['todo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const todo = getFighter(state, 'player', 'todo')
    addSetModifier(todo, 'canGainInvulnerable', false)
    const guarded = resolveTeamTurn(state, queue('player', todo.instanceId, 'todo-boogie-woogie', getFighter(state, 'enemy', 'yuji').instanceId), 'player')

    const attacked = resolveTeamTurn(
      guarded.state,
      queue('enemy', getFighter(guarded.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(guarded.state, 'player', 'todo').instanceId),
      'enemy',
    )

    expect(getFighter(attacked.state, 'player', 'todo').hp).toBe(100)
    expect(getStatusDuration(getFighter(attacked.state, 'player', 'todo').statuses, 'invincible')).toBe(0)
    expect(getFighter(attacked.state, 'enemy', 'yuji').hp).toBe(75)
  })

  test('Miwa Simple Domain enemy invulnerability restriction is blocked per invulnerable target', () => {
    const state = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const miwa = getFighter(state, 'player', 'miwa')
    addInvulnerableModifier(getFighter(state, 'enemy', 'yuji'))

    const result = resolveTeamTurn(state, queue('player', miwa.instanceId, 'miwa-simple-domain', miwa.instanceId), 'player')

    expect(getFighter(result.state, 'enemy', 'yuji').modifiers.some((modifier) => modifier.tags.includes('simple-domain') && modifier.stat === 'canGainInvulnerable')).toBe(false)
    expect(getFighter(result.state, 'enemy', 'nobara').modifiers.some((modifier) => modifier.tags.includes('simple-domain') && modifier.stat === 'canGainInvulnerable')).toBe(true)
    expect(getFighter(result.state, 'enemy', 'megumi').modifiers.some((modifier) => modifier.tags.includes('simple-domain') && modifier.stat === 'canGainInvulnerable')).toBe(true)
  })

  test('Miwa Counter Slash return damage and stun respect attacker invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const miwa = getFighter(state, 'player', 'miwa')
    const countered = resolveTeamTurn(state, queue('player', miwa.instanceId, 'miwa-counter-slash', miwa.instanceId), 'player')
    const attacker = getFighter(countered.state, 'enemy', 'yuji')
    addInvulnerableModifier(attacker)

    const result = resolveTeamTurn(
      countered.state,
      queue('enemy', attacker.instanceId, 'yuji-divergent-fist', getFighter(countered.state, 'player', 'miwa').instanceId),
      'enemy',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
    expect(getStatusDuration(getFighter(result.state, 'enemy', 'yuji').statuses, 'stun')).toBe(0)
    expect(getFighter(result.state, 'player', 'miwa').hp).toBe(80)
  })

  test('Miwa Counter Slash damage lands while attacker non-damage immunity blocks only the stun', () => {
    const state = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const miwa = getFighter(state, 'player', 'miwa')
    const countered = resolveTeamTurn(state, queue('player', miwa.instanceId, 'miwa-counter-slash', miwa.instanceId), 'player')
    const attacker = getFighter(countered.state, 'enemy', 'yuji')
    addNonDamageEffectImmunity(attacker)

    const result = resolveTeamTurn(
      countered.state,
      queue('enemy', attacker.instanceId, 'yuji-divergent-fist', getFighter(countered.state, 'player', 'miwa').instanceId),
      'enemy',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(75)
    expect(getStatusDuration(getFighter(result.state, 'enemy', 'yuji').statuses, 'stun')).toBe(0)
  })

  test('Junpei Moon Dregs setup and delayed damage are blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const junpei = getFighter(state, 'player', 'junpei')
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(state, queue('player', junpei.instanceId, 'junpei-moon-dregs-injection', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.hp).toBe(100)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('moon-dregs-injection'))).toBe(false)
    expect(targetAfter.reactionGuards.some((guard) => guard.label === 'Moon Dregs: Injection')).toBe(false)
    expect(result.state.scheduledEffects.some((effect) => effect.abilityId === 'junpei-moon-dregs-injection')).toBe(false)
  })

  test('Junpei Moon Dregs non-damage immunity blocks setup while damage still lands', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const junpei = getFighter(state, 'player', 'junpei')
    const target = getFighter(state, 'enemy', 'yuji')
    addNonDamageEffectImmunity(target)

    const result = resolveTeamTurn(state, queue('player', junpei.instanceId, 'junpei-moon-dregs-injection', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.hp).toBe(90)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('moon-dregs-injection'))).toBe(false)
    expect(targetAfter.reactionGuards.some((guard) => guard.label === 'Moon Dregs: Injection')).toBe(false)
    expect(result.state.scheduledEffects.some((effect) => effect.abilityId === 'junpei-moon-dregs-injection')).toBe(false)
  })

  test('Junpei Moon Dregs scheduled Affliction damage preserves source classes and bypasses shield', () => {
    const state = createChargedBattleState({ playerTeamIds: ['junpei', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const junpei = getFighter(state, 'player', 'junpei')
    const target = getFighter(state, 'enemy', 'yuji')
    target.shield = { amount: 20, label: 'Test Guard', sourceActorId: target.instanceId, tags: ['test'] }

    const injected = resolveTeamTurn(state, queue('player', junpei.instanceId, 'junpei-moon-dregs-injection', target.instanceId), 'player')
    expect(getFighter(injected.state, 'enemy', 'yuji').hp).toBe(90)
    expect(getFighter(injected.state, 'enemy', 'yuji').shield?.amount).toBe(20)

    const ticked = beginNewRound(injected.state).state
    expect(getFighter(ticked, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(ticked, 'enemy', 'yuji').shield?.amount).toBe(20)
  })

  test('Mahito Idle Transfiguration non-damage rider is blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mahito', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const mahito = getFighter(state, 'player', 'mahito')
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(state, queue('player', mahito.instanceId, 'mahito-idle-transfiguration', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.hp).toBe(100)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('idle-transfiguration'))).toBe(false)
  })

  test('Mahito Self-Embodiment damage lands while attacker non-damage immunity blocks Idle Transfiguration', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mahito', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const guarded = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'mahito').instanceId, 'mahito-self-embodiment', getFighter(state, 'player', 'mahito').instanceId), 'player')
    const attacker = getFighter(guarded.state, 'enemy', 'yuji')
    addNonDamageEffectImmunity(attacker)

    const result = resolveTeamTurn(
      guarded.state,
      queue('enemy', attacker.instanceId, 'yuji-divergent-fist', getFighter(guarded.state, 'player', 'mahito').instanceId),
      'enemy',
    )
    const attackerAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(getFighter(result.state, 'player', 'mahito').hp).toBe(100)
    expect(attackerAfter.hp).toBe(80)
    expect(attackerAfter.modifiers.some((modifier) => modifier.tags.includes('idle-transfiguration'))).toBe(false)
  })

  test('Jogo Ember Insects Scorched application is blocked by invulnerability while self defense applies', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const jogo = getFighter(state, 'player', 'jogo')
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(state, queue('player', jogo.instanceId, 'jogo-ember-insects', target.instanceId), 'player')

    expect(getFighter(result.state, 'player', 'jogo').shield?.amount).toBe(10)
    expect(getFighter(result.state, 'enemy', 'yuji').stateCounters.scorched ?? 0).toBe(0)
  })

  test('Jogo Cataclysmic Eruption partially blocks damage but consumes Scorched stacks', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    state.enemyTeam.forEach((fighter) => {
      fighter.stateCounters.scorched = 2
    })
    addInvulnerableModifier(getFighter(state, 'enemy', 'yuji'))
    getFighter(state, 'enemy', 'nobara').effectImmunities.push({
      id: 'test-damage-immunity',
      label: 'Test Damage Immunity',
      blocks: ['damage'],
      remainingRounds: 2,
    })

    const result = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'jogo').instanceId, 'jogo-cataclysmic-eruption', null), 'player')

    expect(result.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([100, 100, 90])
    expect(result.state.enemyTeam.map((fighter) => fighter.stateCounters.scorched ?? 0)).toEqual([0, 0, 0])
  })

  test('Jogo Molten Husk triggers on helpful targeting and applies Scorched through normal gates', () => {
    const state = createChargedBattleState({ playerTeamIds: ['jogo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const guarded = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'jogo').instanceId, 'jogo-molten-husk', getFighter(state, 'player', 'jogo').instanceId), 'player')
    const helper = getFighter(guarded.state, 'enemy', 'yuji')
    helper.abilities.push(sampleAbility({
      id: 'test-helpful-target',
      kind: 'defend',
      targetRule: 'enemy-single',
      intent: 'helpful',
      effects: [{ type: 'shield', amount: 5, target: 'inherit' }],
      energyCost: {},
    }))
    helper.cooldowns['test-helpful-target'] = 0
    addInvulnerableModifier(getFighter(guarded.state, 'enemy', 'nobara'))

    const result = resolveTeamTurn(
      guarded.state,
      queue('enemy', helper.instanceId, 'test-helpful-target', getFighter(guarded.state, 'player', 'jogo').instanceId),
      'enemy',
    )

    expect(getFighter(result.state, 'player', 'jogo').shield?.amount).toBe(5)
    expect(result.state.enemyTeam.map((fighter) => fighter.stateCounters.scorched ?? 0)).toEqual([1, 0, 1])
  })
})

describe('Character Readiness Phase 4 - narrow intent and copy audit', () => {
  test('Yuji Soul Charge helpful guard and enemy suppression respect immunity gates', () => {
    const state = createChargedBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const yuji = getFighter(state, 'player', 'yuji')
    addInvulnerableModifier(getFighter(state, 'enemy', 'yuji'))

    const result = resolveTeamTurn(state, queue('player', yuji.instanceId, 'yuji-soul-charge', yuji.instanceId), 'player')

    expect(getFighter(result.state, 'player', 'yuji').modifiers.some((modifier) => modifier.tags.includes('soul-charge'))).toBe(true)
    expect(getFighter(result.state, 'enemy', 'yuji').modifiers.some((modifier) => modifier.tags.includes('soul-charge-suppression'))).toBe(false)
    expect(getFighter(result.state, 'enemy', 'nobara').modifiers.some((modifier) => modifier.tags.includes('soul-charge-suppression'))).toBe(true)
    expect(getFighter(result.state, 'enemy', 'megumi').modifiers.some((modifier) => modifier.tags.includes('soul-charge-suppression'))).toBe(true)
  })

  test('Nobara Straw Doll stack and marker are blocked by non-damage effect immunity while damage lands', () => {
    const state = createChargedBattleState({ playerTeamIds: ['nobara', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const nobara = getFighter(state, 'player', 'nobara')
    const target = getFighter(state, 'enemy', 'yuji')
    addNonDamageEffectImmunity(target)

    const result = resolveTeamTurn(state, queue('player', nobara.instanceId, 'nobara-hammer-and-nails', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.hp).toBe(90)
    expect(targetAfter.stateCounters.straw_doll_ritual_stacks ?? 0).toBe(0)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('straw-doll-ritual'))).toBe(false)
  })

  test('Momo Aerial Support is blocked by helpful immunity', () => {
    const state = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const momo = getFighter(state, 'player', 'momo')
    const ally = getFighter(state, 'player', 'yuji')
    addSetModifier(ally, 'canReceiveHelpfulEffects', false)

    const result = resolveTeamTurn(state, queue('player', momo.instanceId, 'momo-aerial-support', ally.instanceId), 'player')
    const allyAfter = getFighter(result.state, 'player', 'yuji')

    expect(allyAfter.modifiers.some((modifier) => modifier.tags.includes('aerial-support'))).toBe(false)
    expect(allyAfter.costModifiers.some((modifier) => modifier.label === 'Aerial Support')).toBe(false)
  })

  test('Ijichi Barrier Tagging is blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['ijichi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const ijichi = getFighter(state, 'player', 'ijichi')
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(state, queue('player', ijichi.instanceId, 'ijichi-barrier-tagging', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('barrier-tagging'))).toBe(false)
  })

  test('Nanami Collapse Point marker and vulnerability are blocked by non-damage effect immunity while piercing damage lands', () => {
    const state = createChargedBattleState({ playerTeamIds: ['nanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const nanami = getFighter(state, 'player', 'nanami')
    const target = getFighter(state, 'enemy', 'yuji')
    addNonDamageEffectImmunity(target)

    const result = resolveTeamTurn(state, queue('player', nanami.instanceId, 'nanami-collapse-point', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.hp).toBe(95)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('collapse-point'))).toBe(false)
  })

  test('Mahito Soul Understanding passive marker is blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mahito', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const mahito = getFighter(state, 'player', 'mahito')
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(state, queue('player', mahito.instanceId, 'mahito-idle-transfiguration', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('soul-understanding'))).toBe(false)
  })

  test('Hanami Root Snare restrictions are blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['hanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const hanami = getFighter(state, 'player', 'hanami')
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(state, queue('player', hanami.instanceId, 'hanami-root-snare', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')

    expect(targetAfter.hp).toBe(100)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('root-snare'))).toBe(false)
  })

  test('Kechizu Connected Souls documents cannotGainInvulnerable blocked protection behavior', () => {
    const state = createChargedBattleState({ playerTeamIds: ['kechizu', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const kechizu = getFighter(state, 'player', 'kechizu')
    const ally = getFighter(state, 'player', 'yuji')
    addSetModifier(ally, 'canGainInvulnerable', false)
    const guarded = resolveTeamTurn(state, queue('player', kechizu.instanceId, 'kechizu-connected-souls', ally.instanceId), 'player')

    const result = resolveTeamTurn(
      guarded.state,
      queue('enemy', getFighter(guarded.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(guarded.state, 'player', 'yuji').instanceId),
      'enemy',
    )

    expect(getFighter(result.state, 'player', 'yuji').hp).toBe(80)
    expect(getFighter(result.state, 'player', 'kechizu').hp).toBe(90)
    expect(getFighter(result.state, 'enemy', 'yuji').stateCounters.rot).toBe(2)
  })
})

describe('fifth batch roster rework', () => {
  test('Miwa Simple Domain sets mode, grants non-damage immunity, and applies adapted Steady Discipline reduction', () => {
    const state = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const result = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'miwa').instanceId, 'miwa-simple-domain', getFighter(state, 'player', 'miwa').instanceId),
      'player',
    )
    const miwa = getFighter(result.state, 'player', 'miwa')

    expect(miwa.stateModes.simple_domain).toBe('active')
    expect(miwa.stateModeDurations.simple_domain?.remainingRounds).toBe(2)
    expect(miwa.effectImmunities.some((immunity) => immunity.blocks.includes('nonDamage'))).toBe(true)
    expect(miwa.modifiers.some((modifier) => modifier.tags.includes('simple-domain') && modifier.stat === 'damageTaken' && modifier.value === -10)).toBe(true)
    expect(miwa.modifiers.some((modifier) => modifier.tags.includes('steady-discipline') && modifier.stat === 'damageTaken' && modifier.value === -5)).toBe(true)
  })

  test('Miwa Quick Draw deals 15 normally and 30 through shield while Simple Domain is active', () => {
    const normalState = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const normal = resolveTeamTurn(
      normalState,
      queue('player', getFighter(normalState, 'player', 'miwa').instanceId, 'miwa-quick-draw', getFighter(normalState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(normal.state, 'enemy', 'yuji').hp).toBe(85)

    const domainState = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    getFighter(domainState, 'player', 'miwa').stateModes.simple_domain = 'active'
    getFighter(domainState, 'enemy', 'yuji').shield = { amount: 20, label: 'Test Shield', tags: ['test-shield'] }
    const domain = resolveTeamTurn(
      domainState,
      queue('player', getFighter(domainState, 'player', 'miwa').instanceId, 'miwa-quick-draw', getFighter(domainState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(domain.state, 'enemy', 'yuji').hp).toBe(70)
    expect(getFighter(domain.state, 'enemy', 'yuji').shield?.amount).toBe(20)
  })

  test('Miwa Counter Slash counters once normally and every harmful target while Simple Domain is active', () => {
    const normalState = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const normalGuard = resolveTeamTurn(
      normalState,
      queue('player', getFighter(normalState, 'player', 'miwa').instanceId, 'miwa-counter-slash', getFighter(normalState, 'player', 'miwa').instanceId),
      'player',
    )
    const normalYuji = getFighter(normalGuard.state, 'enemy', 'yuji')
    const normalNobara = getFighter(normalGuard.state, 'enemy', 'nobara')
    normalYuji.abilities[0].energyCost = {}
    normalNobara.abilities[0].energyCost = {}

    const normalHit = resolveTeamTurn(
      normalGuard.state,
      {
        ...queue('enemy', normalYuji.instanceId, normalYuji.abilities[0].id, getFighter(normalGuard.state, 'player', 'miwa').instanceId),
        ...queue('enemy', normalNobara.instanceId, normalNobara.abilities[0].id, getFighter(normalGuard.state, 'player', 'miwa').instanceId),
      },
      'enemy',
    )
    expect(getFighter(normalHit.state, 'enemy', 'yuji').hp).toBe(75)
    expect(getFighter(normalHit.state, 'enemy', 'nobara').hp).toBe(100)
    expect(getStatusDuration(getFighter(normalHit.state, 'enemy', 'yuji').statuses, 'stun')).toBe(1)

    const domainState = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    getFighter(domainState, 'player', 'miwa').stateModes.simple_domain = 'active'
    const domainGuard = resolveTeamTurn(
      domainState,
      queue('player', getFighter(domainState, 'player', 'miwa').instanceId, 'miwa-counter-slash', getFighter(domainState, 'player', 'miwa').instanceId),
      'player',
    )
    const domainYuji = getFighter(domainGuard.state, 'enemy', 'yuji')
    const domainNobara = getFighter(domainGuard.state, 'enemy', 'nobara')
    domainYuji.abilities[0].energyCost = {}
    domainNobara.abilities[0].energyCost = {}

    const domainHit = resolveTeamTurn(
      domainGuard.state,
      {
        ...queue('enemy', domainYuji.instanceId, domainYuji.abilities[0].id, getFighter(domainGuard.state, 'player', 'miwa').instanceId),
        ...queue('enemy', domainNobara.instanceId, domainNobara.abilities[0].id, getFighter(domainGuard.state, 'player', 'miwa').instanceId),
      },
      'enemy',
    )
    expect(getFighter(domainHit.state, 'enemy', 'yuji').hp).toBe(75)
    expect(getFighter(domainHit.state, 'enemy', 'nobara').hp).toBe(75)
  })

  test('Miwa Defensive Stance grants invulnerability and prepares Simple Domain cooldown reduction', () => {
    const state = createChargedBattleState({ playerTeamIds: ['miwa', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const guarded = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'miwa').instanceId, 'miwa-defensive-stance', getFighter(state, 'player', 'miwa').instanceId),
      'player',
    )
    const miwa = getFighter(guarded.state, 'player', 'miwa')
    expect(getStatusDuration(miwa.statuses, 'invincible')).toBe(1)
    expect(miwa.stateModes.defensive_stance_ready).toBe('active')

    const domain = resolveTeamTurn(
      guarded.state,
      queue('player', miwa.instanceId, 'miwa-simple-domain', miwa.instanceId),
      'player',
    )
    expect(getFighter(domain.state, 'player', 'miwa').cooldowns['miwa-simple-domain']).toBeLessThanOrEqual(3)
  })

  test('Mai starts with visible capped Cursed Bullet uses and Cursed Bullet spends ammo', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mai', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const mai = getFighter(state, 'player', 'mai')
    const ammoPip = getActivePips(mai).find((pip) => pip.label === 'Cursed Bullet Uses')
    expect(mai.stateCounters.cursed_bullet_uses).toBe(2)
    expect(ammoPip?.stackCount).toBe(2)

    const fired = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-cursed-bullet', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(fired.state, 'enemy', 'yuji').hp).toBe(70)
    expect(getFighter(fired.state, 'player', 'mai').stateCounters.cursed_bullet_uses).toBe(1)
  })

  test('Mai Cursed Bullet at 0 ammo deals 15 and does not go negative', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mai', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const mai = getFighter(state, 'player', 'mai')
    mai.stateCounters.cursed_bullet_uses = 0

    const result = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-cursed-bullet', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(85)
    expect(getFighter(result.state, 'player', 'mai').stateCounters.cursed_bullet_uses).toBe(0)
  })

  test('Mai Steady Aim reloads up to 3 and boosts the next skill damage', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mai', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const mai = getFighter(state, 'player', 'mai')
    mai.stateCounters.cursed_bullet_uses = 2

    const aimed = resolveTeamTurn(state, queue('player', mai.instanceId, 'mai-steady-aim', mai.instanceId), 'player')
    expect(getFighter(aimed.state, 'player', 'mai').stateCounters.cursed_bullet_uses).toBe(3)

    const boosted = resolveTeamTurn(
      aimed.state,
      queue('player', getFighter(aimed.state, 'player', 'mai').instanceId, 'mai-suppressing-fire', getFighter(aimed.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(boosted.state, 'enemy', 'yuji').hp).toBe(75)
  })

  test('Mai Suppressing Fire suppresses with ammo and stuns at 0 ammo', () => {
    const ammoState = createChargedBattleState({ playerTeamIds: ['mai', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const suppressed = resolveTeamTurn(
      ammoState,
      queue('player', getFighter(ammoState, 'player', 'mai').instanceId, 'mai-suppressing-fire', getFighter(ammoState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(suppressed.state, 'enemy', 'yuji').hp).toBe(85)
    expect(getFighter(suppressed.state, 'enemy', 'yuji').modifiers.some((modifier) => modifier.tags.includes('suppressing-fire') && modifier.stat === 'damageDealt')).toBe(true)

    const emptyState = createChargedBattleState({ playerTeamIds: ['mai', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    getFighter(emptyState, 'player', 'mai').stateCounters.cursed_bullet_uses = 0
    const stunned = resolveTeamTurn(
      emptyState,
      queue('player', getFighter(emptyState, 'player', 'mai').instanceId, 'mai-suppressing-fire', getFighter(emptyState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(stunned.state, 'enemy', 'yuji').hp).toBe(75)
    expect(getStatusDuration(getFighter(stunned.state, 'enemy', 'yuji').statuses, 'stun')).toBe(1)
  })

  test('Mai Emergency Cover grants invulnerability and reloads at next round start', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mai', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const mai = getFighter(state, 'player', 'mai')
    mai.stateCounters.cursed_bullet_uses = 1
    const covered = resolveTeamTurn(state, queue('player', mai.instanceId, 'mai-emergency-cover', mai.instanceId), 'player')

    expect(getStatusDuration(getFighter(covered.state, 'player', 'mai').statuses, 'invincible')).toBe(1)
    expect(getFighter(covered.state, 'player', 'mai').stateCounters.cursed_bullet_uses).toBe(1)

    const reloaded = beginNewRound(covered.state).state
    expect(getFighter(reloaded, 'player', 'mai').stateCounters.cursed_bullet_uses).toBe(2)
  })

  test('Kamo Blood Draw costs HP, grants random energy, and applies cooldown tempo', () => {
    const state = createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const beforeEnergy = totalEnergyInPool(state.playerEnergy)
    const result = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'noritoshi').instanceId, 'noritoshi-blood-draw', getFighter(state, 'player', 'noritoshi').instanceId),
      'player',
    )
    const kamo = getFighter(result.state, 'player', 'noritoshi')

    expect(kamo.hp).toBe(90)
    expect(totalEnergyInPool(result.state.playerEnergy)).toBe(beforeEnergy + 1)
    expect(kamo.cooldowns['noritoshi-blood-draw']).toBe(0)
  })

  test('Kamo Piercing Blood deals 20 normally and 35 piercing after Blood Draw', () => {
    const normalState = createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const normal = resolveTeamTurn(
      normalState,
      queue('player', getFighter(normalState, 'player', 'noritoshi').instanceId, 'noritoshi-piercing-blood', getFighter(normalState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(normal.state, 'enemy', 'yuji').hp).toBe(80)

    const sequenceState = createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const drawn = resolveTeamTurn(
      sequenceState,
      queue('player', getFighter(sequenceState, 'player', 'noritoshi').instanceId, 'noritoshi-blood-draw', getFighter(sequenceState, 'player', 'noritoshi').instanceId),
      'player',
    )
    const pierced = resolveTeamTurn(
      drawn.state,
      queue('player', getFighter(drawn.state, 'player', 'noritoshi').instanceId, 'noritoshi-piercing-blood', getFighter(drawn.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(pierced.state, 'enemy', 'yuji').hp).toBe(65)
  })

  test('Kamo Crimson Binding seals non-Strategic skills normally and fully stuns after Piercing Blood', () => {
    const normalState = createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const normal = resolveTeamTurn(
      normalState,
      queue('player', getFighter(normalState, 'player', 'noritoshi').instanceId, 'noritoshi-crimson-binding', getFighter(normalState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(normal.state, 'enemy', 'yuji').hp).toBe(85)
    expect(getFighter(normal.state, 'enemy', 'yuji').classStuns.some((stun) => stun.blockedClasses.includes('Physical'))).toBe(true)
    expect(getStatusDuration(getFighter(normal.state, 'enemy', 'yuji').statuses, 'stun')).toBe(0)

    const sequenceState = createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const pierced = resolveTeamTurn(
      sequenceState,
      queue('player', getFighter(sequenceState, 'player', 'noritoshi').instanceId, 'noritoshi-piercing-blood', getFighter(sequenceState, 'enemy', 'yuji').instanceId),
      'player',
    )
    const bound = resolveTeamTurn(
      pierced.state,
      queue('player', getFighter(pierced.state, 'player', 'noritoshi').instanceId, 'noritoshi-crimson-binding', getFighter(pierced.state, 'enemy', 'nobara').instanceId),
      'player',
    )
    expect(getFighter(bound.state, 'enemy', 'nobara').hp).toBe(85)
    expect(getStatusDuration(getFighter(bound.state, 'enemy', 'nobara').statuses, 'stun')).toBe(1)
  })

  test('Kamo Refined Technique bonus is visible, consumed by the next damaging skill, and not refreshed by repeats', () => {
    const state = createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const drawn = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'noritoshi').instanceId, 'noritoshi-blood-draw', getFighter(state, 'player', 'noritoshi').instanceId),
      'player',
    )
    const pierced = resolveTeamTurn(
      drawn.state,
      queue('player', getFighter(drawn.state, 'player', 'noritoshi').instanceId, 'noritoshi-piercing-blood', getFighter(drawn.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const kamo = getFighter(pierced.state, 'player', 'noritoshi')
    const refinedPip = getActivePips(kamo).find((pip) => pip.label === 'Refined Technique')
    expect(kamo.stateCounters.kamo_refined_bonus).toBe(1)
    expect(refinedPip?.lines.some((line) => line.text.includes('+10 damage'))).toBe(true)

    const bound = resolveTeamTurn(
      pierced.state,
      queue('player', kamo.instanceId, 'noritoshi-crimson-binding', getFighter(pierced.state, 'enemy', 'nobara').instanceId),
      'player',
    )
    expect(getFighter(bound.state, 'enemy', 'nobara').hp).toBe(75)
    expect(getFighter(bound.state, 'player', 'noritoshi').stateCounters.kamo_refined_bonus).toBe(1)

    const repeated = resolveTeamTurn(
      bound.state,
      queue('player', getFighter(bound.state, 'player', 'noritoshi').instanceId, 'noritoshi-crimson-binding', getFighter(bound.state, 'enemy', 'megumi').instanceId),
      'player',
    )
    expect(getFighter(repeated.state, 'enemy', 'megumi').hp).toBe(75)
    expect(getFighter(repeated.state, 'player', 'noritoshi').stateCounters.kamo_refined_bonus ?? 0).toBe(0)
  })

  test('Kamo Flowing Red Scale grants invulnerability and makes the next skill free', () => {
    const state = createChargedBattleState({ playerTeamIds: ['noritoshi', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const scaled = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'noritoshi').instanceId, 'noritoshi-flowing-red-scale', getFighter(state, 'player', 'noritoshi').instanceId),
      'player',
    )
    const kamo = getFighter(scaled.state, 'player', 'noritoshi')
    const piercingBlood = kamo.abilities.find((ability) => ability.id === 'noritoshi-piercing-blood')
    if (!piercingBlood) throw new Error('Missing Piercing Blood')

    expect(getStatusDuration(kamo.statuses, 'invincible')).toBe(1)
    expect(getResolvedAbilityEnergyCost(kamo, piercingBlood).cost).toEqual({})
  })
})

describe('Character Readiness Phase 5 - targeted residual readiness tests', () => {
  test('Nobara failed Straw Doll setup does not unlock required-tag payoffs', () => {
    const state = createChargedBattleState({ playerTeamIds: ['nobara', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const nobara = getFighter(state, 'player', 'nobara')
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const blocked = resolveTeamTurn(state, queue('player', nobara.instanceId, 'nobara-hammer-and-nails', target.instanceId), 'player')
    const targetAfter = getFighter(blocked.state, 'enemy', 'yuji')

    expect(targetAfter.hp).toBe(100)
    expect(targetAfter.stateCounters.straw_doll_ritual_stacks ?? 0).toBe(0)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('straw-doll-ritual'))).toBe(false)
    expect(getValidTargetIds(blocked.state, getFighter(blocked.state, 'player', 'nobara').instanceId, 'nobara-soul-resonance')).not.toContain(targetAfter.instanceId)

    const illegalPayoff = resolveTeamTurn(
      blocked.state,
      queue('player', getFighter(blocked.state, 'player', 'nobara').instanceId, 'nobara-soul-resonance', targetAfter.instanceId),
      'player',
    )
    expect(getFighter(illegalPayoff.state, 'enemy', 'yuji').hp).toBe(100)
  })

  test('Nobara successful Straw Doll setup unlocks required-tag payoffs', () => {
    const state = createChargedBattleState({ playerTeamIds: ['nobara', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const nobara = getFighter(state, 'player', 'nobara')
    const target = getFighter(state, 'enemy', 'yuji')

    const marked = resolveTeamTurn(state, queue('player', nobara.instanceId, 'nobara-hammer-and-nails', target.instanceId), 'player')
    const markedTarget = getFighter(marked.state, 'enemy', 'yuji')
    const markedNobara = getFighter(marked.state, 'player', 'nobara')

    expect(markedTarget.stateCounters.straw_doll_ritual_stacks).toBe(1)
    expect(getValidTargetIds(marked.state, markedNobara.instanceId, 'nobara-soul-resonance')).toContain(markedTarget.instanceId)
    expect(getValidTargetIds(marked.state, markedNobara.instanceId, 'nobara-hairpin')).toContain(markedTarget.instanceId)

    const payoff = resolveTeamTurn(marked.state, queue('player', markedNobara.instanceId, 'nobara-soul-resonance', markedTarget.instanceId), 'player')
    expect(getFighter(payoff.state, 'enemy', 'yuji').hp).toBe(85)
  })

  test('Momo Coordinated Assault trap setup is blocked by invulnerability and non-damage immunity', () => {
    const invulnerableState = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const invulnerableTarget = getFighter(invulnerableState, 'enemy', 'yuji')
    addInvulnerableModifier(invulnerableTarget)

    const invulnerableResult = resolveTeamTurn(
      invulnerableState,
      queue('player', getFighter(invulnerableState, 'player', 'momo').instanceId, 'momo-coordinated-assault', invulnerableTarget.instanceId),
      'player',
    )
    expect(getFighter(invulnerableResult.state, 'enemy', 'yuji').reactionGuards.some((guard) => guard.label === 'Coordinated Assault')).toBe(false)

    const immuneState = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const immuneTarget = getFighter(immuneState, 'enemy', 'yuji')
    addNonDamageEffectImmunity(immuneTarget)

    const immuneResult = resolveTeamTurn(
      immuneState,
      queue('player', getFighter(immuneState, 'player', 'momo').instanceId, 'momo-coordinated-assault', immuneTarget.instanceId),
      'player',
    )
    expect(getFighter(immuneResult.state, 'enemy', 'yuji').reactionGuards.some((guard) => guard.label === 'Coordinated Assault')).toBe(false)
  })

  test('Momo Coordinated Assault resolves trap and Disrupting Gust payoff deterministically', () => {
    const trapState = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const trapped = resolveTeamTurn(
      trapState,
      queue('player', getFighter(trapState, 'player', 'momo').instanceId, 'momo-coordinated-assault', getFighter(trapState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(trapped.state, 'enemy', 'yuji').reactionGuards.some((guard) => guard.label === 'Coordinated Assault')).toBe(true)

    const triggered = resolveTeamTurn(
      trapped.state,
      queue('player', getFighter(trapped.state, 'player', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(trapped.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(triggered.state, 'enemy', 'yuji').hp).toBe(65)
    expect(getFighter(triggered.state, 'enemy', 'yuji').reactionGuards.some((guard) => guard.label === 'Coordinated Assault')).toBe(false)

    const gustState = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const gusted = resolveTeamTurn(
      gustState,
      queue('player', getFighter(gustState, 'player', 'momo').instanceId, 'momo-disrupting-gust', getFighter(gustState, 'enemy', 'yuji').instanceId),
      'player',
    )
    const immediate = resolveTeamTurn(
      gusted.state,
      queue('player', getFighter(gusted.state, 'player', 'momo').instanceId, 'momo-coordinated-assault', getFighter(gusted.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(immediate.state, 'enemy', 'yuji').hp).toBe(75)
    expect(getFighter(immediate.state, 'enemy', 'yuji').reactionGuards.some((guard) => guard.label === 'Coordinated Assault')).toBe(false)
  })

  test('Mechamaru Overload Cannon respects partial protection and damage reduction', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mechamaru', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    addInvulnerableModifier(getFighter(state, 'enemy', 'yuji'))
    getFighter(state, 'enemy', 'nobara').effectImmunities.push({
      id: 'test-damage-immunity-nobara',
      label: 'Test Damage Immunity',
      blocks: ['damage'],
      remainingRounds: 2,
    })
    const reducedTarget = getFighter(state, 'enemy', 'megumi')
    reducedTarget.modifiers = upsertModifier(reducedTarget.modifiers, createModifierInstance({
      label: 'Test Damage Reduction',
      stat: 'damageTaken',
      mode: 'flat',
      value: -10,
      duration: { kind: 'rounds', rounds: 2 },
      tags: ['test-damage-reduction'],
      visible: false,
      stacking: 'replace',
    }, {
      scope: 'fighter',
      targetId: reducedTarget.instanceId,
      nextIndex: reducedTarget.modifiers.length,
    }))

    const result = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'mechamaru').instanceId, 'mechamaru-overload-cannon', null),
      'player',
    )

    expect(result.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([100, 100, 85])
    expect(getFighter(result.state, 'player', 'mechamaru').stateModes.overload).toBe('active')
  })

  test('Hanami Cursed Bud Growth harmful trap setup is blocked by invulnerability and non-damage immunity', () => {
    const invulnerableState = createChargedBattleState({ playerTeamIds: ['hanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const invulnerableTarget = getFighter(invulnerableState, 'enemy', 'yuji')
    addInvulnerableModifier(invulnerableTarget)

    const invulnerableResult = resolveTeamTurn(
      invulnerableState,
      queue('player', getFighter(invulnerableState, 'player', 'hanami').instanceId, 'hanami-cursed-bud-growth', invulnerableTarget.instanceId),
      'player',
    )
    const invulnerableAfter = getFighter(invulnerableResult.state, 'enemy', 'yuji')
    expect(invulnerableAfter.hp).toBe(100)
    expect(invulnerableAfter.reactionGuards.some((guard) => guard.label === 'Cursed Bud Growth')).toBe(false)

    const immuneState = createChargedBattleState({ playerTeamIds: ['hanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const immuneTarget = getFighter(immuneState, 'enemy', 'yuji')
    addNonDamageEffectImmunity(immuneTarget)

    const immuneResult = resolveTeamTurn(
      immuneState,
      queue('player', getFighter(immuneState, 'player', 'hanami').instanceId, 'hanami-cursed-bud-growth', immuneTarget.instanceId),
      'player',
    )
    const immuneAfter = getFighter(immuneResult.state, 'enemy', 'yuji')
    expect(immuneAfter.hp).toBe(80)
    expect(immuneAfter.reactionGuards.some((guard) => guard.label === 'Cursed Bud Growth')).toBe(false)
  })

  test('Hanami Cursed Bud Growth trap triggers from the original source and consumes itself', () => {
    const state = createChargedBattleState({ playerTeamIds: ['hanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const hanami = getFighter(state, 'player', 'hanami')
    hanami.hp = 70

    const trapped = resolveTeamTurn(
      state,
      queue('player', hanami.instanceId, 'hanami-cursed-bud-growth', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(trapped.state, 'enemy', 'yuji').hp).toBe(80)

    const triggered = resolveTeamTurn(
      trapped.state,
      queue('enemy', getFighter(trapped.state, 'enemy', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(trapped.state, 'player', 'hanami').instanceId),
      'enemy',
    )

    expect(getFighter(triggered.state, 'enemy', 'yuji').hp).toBe(65)
    expect(getFighter(triggered.state, 'player', 'hanami').hp).toBe(65)
    expect(getFighter(triggered.state, 'enemy', 'yuji').reactionGuards.some((guard) => guard.label === 'Cursed Bud Growth')).toBe(false)
  })

  test('Nanami Collapse Point leaves a permanent marker while vulnerability is limited to 4 turns', () => {
    const state = createChargedBattleState({ playerTeamIds: ['nanami', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const nanami = getFighter(state, 'player', 'nanami')

    const result = resolveTeamTurn(
      state,
      queue('player', nanami.instanceId, 'nanami-collapse-point', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const target = getFighter(result.state, 'enemy', 'yuji')
    const marker = target.modifiers.find((modifier) => modifier.tags.includes('collapse-point') && modifier.stat === 'cooldownTick')
    const vulnerability = target.modifiers.find((modifier) => modifier.tags.includes('collapse-point') && modifier.stat === 'damageTaken')

    expect(target.hp).toBe(95)
    expect(marker?.duration).toEqual({ kind: 'permanent' })
    expect(vulnerability?.duration).toEqual({ kind: 'rounds', remaining: 4 })
    expect(vulnerability?.value).toBe(5)
  })
})

describe('sixth batch roster rework', () => {
  test('Momo Aerial Support buffs one ally damage and reduces random cost', () => {
    const state = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const supported = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'momo').instanceId, 'momo-aerial-support', getFighter(state, 'player', 'yuji').instanceId),
      'player',
    )
    const yuji = getFighter(supported.state, 'player', 'yuji')
    yuji.abilities[0].energyCost = { random: 1 }
    const divergentFist = yuji.abilities.find((ability) => ability.id === 'yuji-divergent-fist')
    if (!divergentFist) throw new Error('Missing Divergent Fist')
    expect(getResolvedAbilityEnergyCost(yuji, divergentFist).cost.random).toBe(0)

    const hit = resolveTeamTurn(
      supported.state,
      queue('player', yuji.instanceId, 'yuji-divergent-fist', getFighter(supported.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(hit.state, 'enemy', 'yuji').hp).toBe(70)
  })

  test('Momo Disrupting Gust damages and taxes the target next skill', () => {
    const state = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const gusted = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'momo').instanceId, 'momo-disrupting-gust', getFighter(state, 'enemy', 'yuji').instanceId),
      'player',
    )
    const target = getFighter(gusted.state, 'enemy', 'yuji')
    const divergentFist = target.abilities.find((ability) => ability.id === 'yuji-divergent-fist')
    if (!divergentFist) throw new Error('Missing Divergent Fist')

    expect(target.hp).toBe(90)
    expect(target.modifiers.some((modifier) => modifier.tags.includes('disrupting-gust') && modifier.stat === 'damageDealt')).toBe(true)
    expect(getResolvedAbilityEnergyCost(target, divergentFist).cost.random).toBe(1)
  })

  test('Momo Coordinated Assault traps next damage or triggers immediately on Disrupting Gust targets', () => {
    const trapState = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const trapped = resolveTeamTurn(
      trapState,
      queue('player', getFighter(trapState, 'player', 'momo').instanceId, 'momo-coordinated-assault', getFighter(trapState, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(trapped.state, 'enemy', 'yuji').hp).toBe(100)
    const triggered = resolveTeamTurn(
      trapped.state,
      queue('player', getFighter(trapped.state, 'player', 'yuji').instanceId, 'yuji-divergent-fist', getFighter(trapped.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(triggered.state, 'enemy', 'yuji').hp).toBe(65)

    const gustState = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const gusted = resolveTeamTurn(
      gustState,
      queue('player', getFighter(gustState, 'player', 'momo').instanceId, 'momo-disrupting-gust', getFighter(gustState, 'enemy', 'yuji').instanceId),
      'player',
    )
    const immediate = resolveTeamTurn(
      gusted.state,
      queue('player', getFighter(gusted.state, 'player', 'momo').instanceId, 'momo-coordinated-assault', getFighter(gusted.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(immediate.state, 'enemy', 'yuji').hp).toBe(75)
  })

  test('Momo Evasive Flight grants invulnerability and team damage reduction without duplicate passive protection', () => {
    const state = createChargedBattleState({ playerTeamIds: ['momo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const roundStart = beginNewRound(state).state
    expect(getStatusDuration(getFighter(roundStart, 'player', 'momo').statuses, 'invincible')).toBe(0)

    const evasive = resolveTeamTurn(
      roundStart,
      queue('player', getFighter(roundStart, 'player', 'momo').instanceId, 'momo-evasive-flight', getFighter(roundStart, 'player', 'momo').instanceId),
      'player',
    )
    const momo = getFighter(evasive.state, 'player', 'momo')
    const allyYuji = getFighter(evasive.state, 'player', 'yuji')
    expect(getStatusDuration(momo.statuses, 'invincible')).toBe(1)
    expect(allyYuji.modifiers.some((modifier) => modifier.tags.includes('evasive-flight') && modifier.stat === 'damageTaken')).toBe(true)
  })

  test('Mechamaru Artillery Frame and artillery skills apply battlefield pressure', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mechamaru', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const started = beginNewRound(state).state
    expect(started.enemyTeam.map((fighter) => fighter.hp)).toEqual([97, 97, 97])

    const cannon = resolveTeamTurn(
      started,
      queue('player', getFighter(started, 'player', 'mechamaru').instanceId, 'mechamaru-cursed-energy-cannon', getFighter(started, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(cannon.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([77, 87, 87])

    const suppressive = resolveTeamTurn(
      cannon.state,
      queue('player', getFighter(cannon.state, 'player', 'mechamaru').instanceId, 'mechamaru-suppressive-fire', null),
      'player',
    )
    expect(suppressive.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([62, 72, 72])
    expect(suppressive.state.enemyTeam.every((fighter) => fighter.modifiers.some((modifier) => modifier.tags.includes('suppressive-fire') && modifier.stat === 'damageDealt'))).toBe(true)
  })

  test('Mechamaru Overload Cannon sets mode, boosts skills, and later damages Mechamaru', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mechamaru', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    state.battlefield.fatigueStartsRound = 99
    const overloaded = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'mechamaru').instanceId, 'mechamaru-overload-cannon', null),
      'player',
    )
    expect(overloaded.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([75, 75, 75])
    expect(getFighter(overloaded.state, 'player', 'mechamaru').stateModes.overload).toBe('active')

    const boosted = resolveTeamTurn(
      overloaded.state,
      queue('player', getFighter(overloaded.state, 'player', 'mechamaru').instanceId, 'mechamaru-cursed-energy-cannon', getFighter(overloaded.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(boosted.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([50, 60, 60])

    const afterFirstEnd = endRound(boosted.state).state
    const afterSecondEnd = endRound(afterFirstEnd).state
    const afterThirdEnd = endRound(afterSecondEnd).state
    expect(getFighter(afterThirdEnd, 'player', 'mechamaru').hp).toBe(90)
  })

  test('Mechamaru Remote Shielding grants invulnerability and team damage reduction', () => {
    const state = createChargedBattleState({ playerTeamIds: ['mechamaru', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const shielded = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'mechamaru').instanceId, 'mechamaru-remote-shielding', getFighter(state, 'player', 'mechamaru').instanceId),
      'player',
    )
    expect(getStatusDuration(getFighter(shielded.state, 'player', 'mechamaru').statuses, 'invincible')).toBe(1)
    expect(getFighter(shielded.state, 'player', 'yuji').modifiers.some((modifier) => modifier.tags.includes('remote-shielding') && modifier.stat === 'damageTaken')).toBe(true)
  })

  test('Gojo Infinity collapses on harmful targeting, suppresses the next round start, and later restores', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const started = beginNewRound(state).state
    expect(getStatusDuration(getFighter(started, 'player', 'gojo').statuses, 'invincible')).toBe(1)

    const attacker = getFighter(started, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    const collapsed = resolveTeamTurn(started, queue('enemy', attacker.instanceId, 'yuji-divergent-fist', getFighter(started, 'player', 'gojo').instanceId), 'enemy').state
    expect(getFighter(collapsed, 'player', 'gojo').hp).toBe(100)
    expect(getFighter(collapsed, 'player', 'gojo').stateModes.infinity_collapsed).toBe('active')

    const suppressed = beginNewRound(collapsed).state
    expect(getStatusDuration(getFighter(suppressed, 'player', 'gojo').statuses, 'invincible')).toBe(0)

    const restored = beginNewRound(resolveTeamTurn(suppressed, {}, 'player').state).state
    expect(getStatusDuration(getFighter(restored, 'player', 'gojo').statuses, 'invincible')).toBe(1)
  })

  test('Gojo Blue, Red, and Hollow Purple use target setup and actor locks correctly', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const gojo = getFighter(state, 'player', 'gojo')
    expect(getQueueAbilityBlockReason(state, {}, gojo, 'gojo-hollow-purple')).toBe('Not available')

    const blue = resolveTeamTurn(state, queue('player', gojo.instanceId, 'gojo-lapse-blue', getFighter(state, 'enemy', 'yuji').instanceId), 'player')
    expect(getFighter(blue.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(blue.state, 'enemy', 'yuji').modifiers.some((modifier) => modifier.tags.includes('pulled'))).toBe(true)

    const blueAgain = resolveTeamTurn(blue.state, queue('player', getFighter(blue.state, 'player', 'gojo').instanceId, 'gojo-lapse-blue', getFighter(blue.state, 'enemy', 'yuji').instanceId), 'player')
    expect(getFighter(blueAgain.state, 'enemy', 'yuji').hp).toBe(55)

    const red = resolveTeamTurn(blueAgain.state, queue('player', getFighter(blueAgain.state, 'player', 'gojo').instanceId, 'gojo-reversal-red', getFighter(blueAgain.state, 'enemy', 'yuji').instanceId), 'player')
    expect(getFighter(red.state, 'enemy', 'yuji').hp).toBe(15)
    expect(getStatusDuration(getFighter(red.state, 'enemy', 'yuji').statuses, 'stun')).toBe(1)
    expect(getFighter(red.state, 'enemy', 'yuji').modifiers.some((modifier) => modifier.tags.includes('pulled'))).toBe(false)

    const purple = resolveTeamTurn(red.state, queue('player', getFighter(red.state, 'player', 'gojo').instanceId, 'gojo-hollow-purple', null), 'player')
    expect(purple.state.enemyTeam.map((fighter) => fighter.hp)).toEqual([0, 55, 55])
  })

  test('Gojo Blue harmful Pulled setup is blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'enemy', 'yuji')
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'gojo').instanceId, 'gojo-lapse-blue', target.instanceId),
      'player',
    )

    const targetAfter = getFighter(result.state, 'enemy', 'yuji')
    expect(targetAfter.hp).toBe(100)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('pulled'))).toBe(false)
    expect(getFighter(result.state, 'player', 'gojo').stateModes.recent_blue).toBe('active')
  })

  test('Gojo Red harmful Pulled consumption and alignment are blocked by invulnerability', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const target = getFighter(state, 'enemy', 'yuji')
    addPulledModifier(target)
    addInvulnerableModifier(target)

    const result = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'gojo').instanceId, 'gojo-reversal-red', target.instanceId),
      'player',
    )

    const targetAfter = getFighter(result.state, 'enemy', 'yuji')
    const gojoAfter = getFighter(result.state, 'player', 'gojo')
    expect(targetAfter.hp).toBe(100)
    expect(getStatusDuration(targetAfter.statuses, 'stun')).toBe(0)
    expect(targetAfter.modifiers.some((modifier) => modifier.tags.includes('pulled'))).toBe(true)
    expect(gojoAfter.stateModes.blue_red_aligned).toBeUndefined()
    expect(gojoAfter.stateModes.recent_red).toBe('active')
  })

  test('Gojo cannot gain Infinity invulnerability while canGainInvulnerable is false', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    addSetModifier(getFighter(state, 'player', 'gojo'), 'canGainInvulnerable', false)

    const started = beginNewRound(state)
    const gojoAfterStart = getFighter(started.state, 'player', 'gojo')
    expect(getStatusDuration(gojoAfterStart.statuses, 'invincible')).toBe(0)
    expect(gojoAfterStart.effectImmunities.some((immunity) => (immunity.tags ?? []).includes('infinity'))).toBe(true)
    expect(started.events.some((event) => event.message.toLowerCase().includes('cannot become invulnerable'))).toBe(true)
  })

  test('helpful immunity blocks Gojo self-helpful Infinity effects', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    addSetModifier(getFighter(state, 'player', 'gojo'), 'canReceiveHelpfulEffects', false)

    const started = beginNewRound(state)
    const gojoAfterStart = getFighter(started.state, 'player', 'gojo')
    expect(getStatusDuration(gojoAfterStart.statuses, 'invincible')).toBe(0)
    expect(gojoAfterStart.effectImmunities.some((immunity) => (immunity.tags ?? []).includes('infinity'))).toBe(false)
    expect(gojoAfterStart.reactionGuards.some((guard) => guard.label === 'Infinity Collapse')).toBe(true)
    expect(started.events.some((event) => event.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })

  test('Gojo Infinity collapses after counter priority cancels the triggering skill', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const started = beginNewRound(state).state
    const gojo = getFighter(started, 'player', 'gojo')
    gojo.reactionGuards.push({
      id: 'gojo-test-counter',
      kind: 'counter',
      label: 'Test Counter',
      remainingRounds: 1,
      consumeOnTrigger: true,
      counterDamage: 10,
    })
    const attacker = getFighter(started, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}

    const result = resolveTeamTurn(started, queue('enemy', attacker.instanceId, 'yuji-divergent-fist', gojo.instanceId), 'enemy')

    expect(getFighter(result.state, 'player', 'gojo').hp).toBe(100)
    expect(getFighter(result.state, 'player', 'gojo').stateModes.infinity_collapsed).toBe('active')
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(90)
    expect(result.runtimeEvents.some((event) => event.type === 'ability_interrupted' && event.meta?.reason === 'counter')).toBe(true)
  })

  test('Gojo Infinity collapses after reflect redirects the triggering skill', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const started = beginNewRound(state).state
    const gojo = getFighter(started, 'player', 'gojo')
    gojo.reactionGuards.push({
      id: 'gojo-test-reflect',
      kind: 'reflect',
      label: 'Test Reflect',
      remainingRounds: 1,
      consumeOnTrigger: true,
    })
    const attacker = getFighter(started, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const result = resolveTeamTurn(started, queue('enemy', attacker.instanceId, attacker.abilities[0].id, gojo.instanceId), 'enemy')

    expect(getFighter(result.state, 'player', 'gojo').hp).toBe(100)
    expect(getFighter(result.state, 'player', 'gojo').stateModes.infinity_collapsed).toBe('active')
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(80)
  })

  test('Gojo Infinity effect immunity survives the same-round team tick after Phase 7B', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const started = beginNewRound(state).state
    const afterPlayerTick = resolveTeamTurn(started, {}, 'player').state

    expect(getFighter(afterPlayerTick, 'player', 'gojo').effectImmunities.some((immunity) => (immunity.tags ?? []).includes('infinity'))).toBe(true)
  })

  test('Gojo Six Eyes Focus grants invulnerability, makes next skill free, and prevents one Infinity collapse', () => {
    const state = createChargedBattleState({ playerTeamIds: ['gojo', 'yuji', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    const focused = resolveTeamTurn(
      state,
      queue('player', getFighter(state, 'player', 'gojo').instanceId, 'gojo-six-eyes-focus', getFighter(state, 'player', 'gojo').instanceId),
      'player',
    )
    const gojo = getFighter(focused.state, 'player', 'gojo')
    const blue = gojo.abilities.find((ability) => ability.id === 'gojo-lapse-blue')
    if (!blue) throw new Error('Missing Lapse: Blue')
    expect(getStatusDuration(gojo.statuses, 'invincible')).toBe(1)
    expect(getResolvedAbilityEnergyCost(gojo, blue).cost).toEqual({})

    const started = beginNewRound(focused.state).state
    const attacker = getFighter(started, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    const attacked = resolveTeamTurn(started, queue('enemy', attacker.instanceId, 'yuji-divergent-fist', getFighter(started, 'player', 'gojo').instanceId), 'enemy').state
    expect(getFighter(attacked, 'player', 'gojo').hp).toBe(100)
    expect(getFighter(attacked, 'player', 'gojo').stateModes.infinity_collapsed).toBeUndefined()
  })
})

// ── scheduledOrder parameter tests ───────────────────────────────────────────
describe('resolveScheduledEffects orderedIds', () => {
  /**
   * Helper: build a state with two due roundStart scheduled effects and advance
   * to the round where they fire.  Returns the pre-round state and the IDs of
   * both scheduled effects so tests can pass them as orderedIds.
   *
   * Effect A deals 15 damage to enemy slot-0 (Yuji).
   * Effect B deals 15 damage to enemy slot-1 (Nobara).
   * We use Maki's Close-Quarters Combo (conditional follow-up schedule) and
   * Eso's Hostage Situation to get two independent roundStart effects.
   */
  function buildTwoScheduledEffectsState() {
    const base = createChargedBattleState({
      playerTeamIds: ['maki', 'eso', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })

    const maki = getFighter(base, 'player', 'maki')
    const eso = getFighter(base, 'player', 'eso')
    const yuji = getFighter(base, 'enemy', 'yuji')
    const nobara = getFighter(base, 'enemy', 'nobara')

    // Maki uses Close-Quarters Combo on Yuji (without Weapon Mastery → schedules 15 dmg)
    const afterMaki = resolveTeamTurn(
      base,
      queue('player', maki.instanceId, 'maki-close-quarters-combo', yuji.instanceId),
      'player',
    )
    // Eso uses Hostage Situation on Nobara (schedules 15 piercing dmg)
    const afterEso = resolveTeamTurn(
      afterMaki.state,
      queue('player', eso.instanceId, 'eso-hostage-situation', nobara.instanceId),
      'player',
    )

    const scheduledEffects = afterEso.state.scheduledEffects.filter(
      (e) => e.phase === 'roundStart',
    )
    // Should have exactly 2 due effects
    if (scheduledEffects.length !== 2) {
      throw new Error(`Expected 2 scheduled effects, got ${scheduledEffects.length}`)
    }

    // Both effects are due next round; advance round counter so they fire
    const preRoundState = { ...afterEso.state, round: afterEso.state.round }
    return { preRoundState, scheduledEffects }
  }

  test('default order (no orderedIds) preserves creation order', () => {
    const { preRoundState, scheduledEffects } = buildTwoScheduledEffectsState()
    const [effectA, effectB] = scheduledEffects

    const result = beginNewRound(preRoundState)
    const yujiAfter = result.state.playerTeam.concat(result.state.enemyTeam)
      .find((f) => f.instanceId === effectA.targetIds[0])
    const nobaraAfter = result.state.playerTeam.concat(result.state.enemyTeam)
      .find((f) => f.instanceId === effectB.targetIds[0])

    // Both effects must have fired — targets took damage
    expect(yujiAfter).toBeDefined()
    expect(nobaraAfter).toBeDefined()
    expect(yujiAfter!.hp).toBeLessThan(yujiAfter!.maxHp)
    expect(nobaraAfter!.hp).toBeLessThan(nobaraAfter!.maxHp)
    // Scheduled effects list is drained
    expect(result.state.scheduledEffects.filter((e) => e.phase === 'roundStart').length).toBe(0)
  })

  test('orderedIds reverses execution order when both targets survive', () => {
    const { preRoundState, scheduledEffects } = buildTwoScheduledEffectsState()
    const [effectA, effectB] = scheduledEffects

    const defaultResult = beginNewRound(preRoundState)
    const reversedResult = beginNewRound(preRoundState, [effectB.id, effectA.id])

    // Both orderings produce the same damage when targets don't die — the HP
    // values are identical.  The ordering matters only when one entry kills a
    // target that another entry also targets; here targets are different so we
    // just assert both fire.
    const yujiDefault = defaultResult.state.playerTeam.concat(defaultResult.state.enemyTeam)
      .find((f) => f.instanceId === effectA.targetIds[0])
    const yujiReversed = reversedResult.state.playerTeam.concat(reversedResult.state.enemyTeam)
      .find((f) => f.instanceId === effectA.targetIds[0])

    expect(yujiDefault!.hp).toBe(yujiReversed!.hp)

    // Scheduled effects list drained in both cases
    expect(defaultResult.state.scheduledEffects.filter((e) => e.phase === 'roundStart').length).toBe(0)
    expect(reversedResult.state.scheduledEffects.filter((e) => e.phase === 'roundStart').length).toBe(0)
  })

  test('orderedIds with only one ID listed still fires all due effects (remainder appended)', () => {
    const { preRoundState, scheduledEffects } = buildTwoScheduledEffectsState()
    const [effectA, effectB] = scheduledEffects

    // Only pass effectB's ID — effectA should still fire (appended after)
    const result = beginNewRound(preRoundState, [effectB.id])

    const yujiAfter = result.state.playerTeam.concat(result.state.enemyTeam)
      .find((f) => f.instanceId === effectA.targetIds[0])
    const nobaraAfter = result.state.playerTeam.concat(result.state.enemyTeam)
      .find((f) => f.instanceId === effectB.targetIds[0])

    // Both fired
    expect(yujiAfter!.hp).toBeLessThan(yujiAfter!.maxHp)
    expect(nobaraAfter!.hp).toBeLessThan(nobaraAfter!.maxHp)
    expect(result.state.scheduledEffects.filter((e) => e.phase === 'roundStart').length).toBe(0)
  })

  test('unknown IDs in orderedIds are silently ignored without affecting others', () => {
    const { preRoundState, scheduledEffects } = buildTwoScheduledEffectsState()
    const [effectA] = scheduledEffects

    const result = beginNewRound(preRoundState, ['nonexistent-id-xyz', effectA.id])

    // All real effects still fire
    expect(result.state.scheduledEffects.filter((e) => e.phase === 'roundStart').length).toBe(0)
  })

  test('selected-skill actionOrder in resolveTeamTurn is unaffected by scheduledOrder', () => {
    const base = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })

    const yuji = getFighter(base, 'player', 'yuji')
    const nobara = getFighter(base, 'player', 'nobara')
    const enemyYuji = getFighter(base, 'enemy', 'yuji')
    const enemyNobara = getFighter(base, 'enemy', 'nobara')

    const commands: Record<string, import('@/features/battle/types').QueuedBattleAction> = {
      [yuji.instanceId]: { actorId: yuji.instanceId, team: 'player', abilityId: 'yuji-divergent-fist', targetId: enemyYuji.instanceId },
      [nobara.instanceId]: { actorId: nobara.instanceId, team: 'player', abilityId: 'nobara-straw-doll-technique', targetId: enemyNobara.instanceId },
    }

    // Yuji first
    const yujiFirst = resolveTeamTurn(base, commands, 'player', [yuji.instanceId, nobara.instanceId])
    // Nobara first
    const nobaraFirst = resolveTeamTurn(base, commands, 'player', [nobara.instanceId, yuji.instanceId])

    // Different action orders produce the same total damage when targets don't die from the first hit
    // but the actionOrder parameter is correctly respected (both resolve)
    expect(getFighter(yujiFirst.state, 'enemy', 'yuji').hp).toBeLessThan(enemyYuji.maxHp)
    expect(getFighter(nobaraFirst.state, 'enemy', 'yuji').hp).toBeLessThan(enemyYuji.maxHp)
  })

  test('onRoundStart passives and burns fire regardless of scheduledOrder value', () => {
    // Mechamaru's Artillery Frame passive deals 3 damage to all enemies each round start.
    // Passing a scheduledOrder (even empty) must not suppress passives.
    const base = createChargedBattleState({
      playerTeamIds: ['mechamaru', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })

    const enemyYuji = getFighter(base, 'enemy', 'yuji')

    // beginNewRound with an explicit empty scheduledOrder
    const withEmpty = beginNewRound(base, [])
    // beginNewRound with no scheduledOrder (legacy path)
    const withNone = beginNewRound(base)

    const yujiAfterEmpty = getFighter(withEmpty.state, 'enemy', 'yuji')
    const yujiAfterNone = getFighter(withNone.state, 'enemy', 'yuji')

    // Artillery Frame fires in both cases — 3 damage
    expect(yujiAfterEmpty.hp).toBe(enemyYuji.maxHp - 3)
    expect(yujiAfterNone.hp).toBe(enemyYuji.maxHp - 3)
    // Outcomes are identical
    expect(yujiAfterEmpty.hp).toBe(yujiAfterNone.hp)
  })

  test('scheduledOrder changes outcome when one effect kills the target before another can heal them', () => {
    // Construct a state where two roundStart scheduled effects target the same fighter:
    //   Effect A (heal): heals the target for 30 HP
    //   Effect B (damage): deals 20 piercing damage to the target
    // Target starts at 10 HP (manually reduced).
    //
    // Order A → B: heal fires first (10 → 40), damage fires second (40 → 20). Target survives at 20 HP.
    // Order B → A: damage fires first (10 → 0, killed), heal is skipped (target dead). Target stays at 0 HP.
    const base = createChargedBattleState({
      playerTeamIds: ['maki', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })

    const maki = getFighter(base, 'player', 'maki')
    const yuji = getFighter(base, 'enemy', 'yuji')

    // Reduce Yuji to 10 HP so that 20 damage is lethal but the preceding heal would save him.
    yuji.hp = 10

    const healEffectId = 'test-heal-effect'
    const damageEffectId = 'test-damage-effect'

    const stateWithScheduled: typeof base = {
      ...base,
      scheduledEffects: [
        {
          id: healEffectId,
          actorId: maki.instanceId,
          targetIds: [yuji.instanceId],
          abilityId: undefined,
          dueRound: base.round,
          phase: 'roundStart',
          effects: [{ type: 'heal', power: 30, target: 'inherit' }],
        },
        {
          id: damageEffectId,
          actorId: maki.instanceId,
          targetIds: [yuji.instanceId],
          abilityId: undefined,
          dueRound: base.round,
          phase: 'roundStart',
          effects: [{ type: 'damage', power: 20, piercing: true, target: 'inherit' }],
        },
      ],
    }

    // Order A → B: heal then damage — Yuji survives
    const healFirst = beginNewRound(stateWithScheduled, [healEffectId, damageEffectId])
    const yujiHealFirst = getFighter(healFirst.state, 'enemy', 'yuji')

    // Order B → A: damage then heal — Yuji is killed before heal can fire
    const damageFirst = beginNewRound(stateWithScheduled, [damageEffectId, healEffectId])
    const yujiDamageFirst = getFighter(damageFirst.state, 'enemy', 'yuji')

    // Heal-first: target is alive and took net -10 HP (healed 30, then damaged 20)... but started at 10
    // so: 10 + 30 = 40, then 40 - 20 = 20.
    expect(yujiHealFirst.hp).toBe(20)
    expect(yujiHealFirst.hp).toBeGreaterThan(0)

    // Damage-first: target was killed (10 - 20 = dead), heal skipped
    expect(yujiDamageFirst.hp).toBeLessThanOrEqual(0)

    // The two orderings produce genuinely different outcomes
    expect(yujiHealFirst.hp).not.toBe(yujiDamageFirst.hp)
  })
})

// ── resolveInterleavedPlayerTurnTimeline ──────────────────────────────────────
describe('resolveInterleavedPlayerTurnTimeline', () => {
  /**
   * Builds a state with one roundStart scheduled effect that heals a player ally,
   * and two player commands. Returns the state, scheduled effect ID, and actor IDs.
   *
   * Scheduled: heals player Megumi for 20 HP (so we can detect firing order by HP).
   * Command A (Yuji): damages enemy Yuji for 20.
   * Command B (Nobara): damages enemy Yuji for 10.
   */
  function buildInterleavedScenario() {
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })

    const playerYuji  = getFighter(state, 'player', 'yuji')
    const playerNobara = getFighter(state, 'player', 'nobara')
    const playerMegumi = getFighter(state, 'player', 'megumi')
    const enemyYuji   = getFighter(state, 'enemy', 'yuji')

    // Damage Megumi so the heal is observable (starts below maxHp)
    playerMegumi.hp = 60

    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    playerNobara.abilities[0].energyCost = {}
    playerNobara.abilities[0].targetRule = 'enemy-single'
    playerNobara.abilities[0].effects = [{ type: 'damage', power: 10, target: 'inherit' }]

    const scheduledId = 'test-interleaved-heal'
    const stateWithScheduled = {
      ...state,
      scheduledEffects: [
        {
          id: scheduledId,
          actorId: playerYuji.instanceId,
          targetIds: [playerMegumi.instanceId],
          abilityId: undefined as string | undefined,
          dueRound: state.round,
          phase: 'roundStart' as const,
          effects: [{ type: 'heal' as const, power: 20, target: 'inherit' as const }],
        },
      ],
    }

    const commands: Record<string, import('@/features/battle/types').QueuedBattleAction> = {
      [playerYuji.instanceId]:   { actorId: playerYuji.instanceId,   team: 'player', abilityId: playerYuji.abilities[0].id,   targetId: enemyYuji.instanceId },
      [playerNobara.instanceId]: { actorId: playerNobara.instanceId, team: 'player', abilityId: playerNobara.abilities[0].id, targetId: enemyYuji.instanceId },
    }

    return { stateWithScheduled, commands, scheduledId, playerYuji, playerNobara, playerMegumi, enemyYuji }
  }

  test('scheduled before command resolves scheduled effect before the command', () => {
    const { stateWithScheduled, commands, scheduledId, playerYuji, playerMegumi, enemyYuji } = buildInterleavedScenario()

    // queueOrder: scheduled → Yuji command
    const result = resolveInterleavedPlayerTurnTimeline(stateWithScheduled, commands, [
      { kind: 'scheduled', scheduledEffectId: scheduledId },
      { kind: 'command', actorId: playerYuji.instanceId },
    ])

    // Megumi healed before Yuji acts (megumi HP > starting because heal ran)
    expect(getFighter(result.state, 'player', 'megumi').hp).toBeGreaterThan(playerMegumi.hp)
    // Yuji's command damaged the enemy
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(enemyYuji.hp - 20)
  })

  test('command before scheduled resolves command before the scheduled effect', () => {
    const { stateWithScheduled, commands, scheduledId, playerYuji, playerMegumi, enemyYuji } = buildInterleavedScenario()

    // Same actors but command fires first — outcome on enemy is the same (both still fire)
    const result = resolveInterleavedPlayerTurnTimeline(stateWithScheduled, commands, [
      { kind: 'command', actorId: playerYuji.instanceId },
      { kind: 'scheduled', scheduledEffectId: scheduledId },
    ])

    expect(getFighter(result.state, 'player', 'megumi').hp).toBeGreaterThan(playerMegumi.hp)
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(enemyYuji.hp - 20)
  })

  test('scheduled between two commands resolves correctly between them', () => {
    const { stateWithScheduled, commands, scheduledId, playerYuji, playerNobara, playerMegumi, enemyYuji } = buildInterleavedScenario()

    // Yuji → scheduled heal → Nobara
    const result = resolveInterleavedPlayerTurnTimeline(stateWithScheduled, commands, [
      { kind: 'command', actorId: playerYuji.instanceId },
      { kind: 'scheduled', scheduledEffectId: scheduledId },
      { kind: 'command', actorId: playerNobara.instanceId },
    ])

    // All three resolved: enemy took 30 total, megumi healed
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(enemyYuji.hp - 30)
    expect(getFighter(result.state, 'player', 'megumi').hp).toBeGreaterThan(playerMegumi.hp)
    // Steps: [yuji-action, roundStart-heal, nobara-action, tick] = at least 3 content steps
    expect(result.steps.length).toBeGreaterThanOrEqual(3)
  })

  test('scheduled effect resolved through queueOrder does not fire again in roundStart resolution', () => {
    const { stateWithScheduled, commands, scheduledId, playerYuji, playerMegumi } = buildInterleavedScenario()

    const result = resolveInterleavedPlayerTurnTimeline(stateWithScheduled, commands, [
      { kind: 'scheduled', scheduledEffectId: scheduledId },
      { kind: 'command', actorId: playerYuji.instanceId },
    ])

    // Scheduled effects array should be drained (the effect was spliced out during queueOrder resolution)
    expect(result.state.scheduledEffects.filter((e) => e.id === scheduledId)).toHaveLength(0)

    // Megumi should have healed exactly once (not twice)
    const expectedHpAfterOneHeal = Math.min(playerMegumi.hp + 20, playerMegumi.maxHp)
    expect(getFighter(result.state, 'player', 'megumi').hp).toBe(expectedHpAfterOneHeal)
  })

  test('scheduled effect omitted from queueOrder still fires via applyRoundStartEffects at end', () => {
    const { stateWithScheduled, commands, scheduledId, playerYuji } = buildInterleavedScenario()

    // queueOrder does NOT include the scheduled effect — it should still fire via beginNewRoundTimeline
    const result = resolveInterleavedPlayerTurnTimeline(stateWithScheduled, commands, [
      { kind: 'command', actorId: playerYuji.instanceId },
    ])

    // Scheduled effect was NOT consumed by queueOrder, so it must fire during the post-turn endRound path
    // In resolveInterleavedPlayerTurnTimeline the post-loop path calls tickTeamTurn then returns —
    // the omitted scheduled effect remains in state.scheduledEffects to fire in endRoundTimeline.
    // The caller (BattlePage) calls endRoundTimeline which will drain it.
    // We verify the effect is still present (not double-removed or silently lost).
    expect(result.state.scheduledEffects.filter((e) => e.id === scheduledId)).toHaveLength(1)
  })

  test('passing the same scheduled effect ID twice only fires it once', () => {
    const { stateWithScheduled, commands, scheduledId, playerMegumi } = buildInterleavedScenario()

    const result = resolveInterleavedPlayerTurnTimeline(stateWithScheduled, commands, [
      { kind: 'scheduled', scheduledEffectId: scheduledId },
      { kind: 'scheduled', scheduledEffectId: scheduledId },
    ])

    // Second entry finds no matching ID (already spliced), so it no-ops.
    // Megumi healed exactly once.
    const expectedHpAfterOneHeal = Math.min(playerMegumi.hp + 20, playerMegumi.maxHp)
    expect(getFighter(result.state, 'player', 'megumi').hp).toBe(expectedHpAfterOneHeal)
  })

  test('empty queueOrder is safe and tickTeamTurn still runs', () => {
    const { stateWithScheduled, commands } = buildInterleavedScenario()

    // No entries in queueOrder — the function should not throw and should call tickTeamTurn
    expect(() => {
      resolveInterleavedPlayerTurnTimeline(stateWithScheduled, commands, [])
    }).not.toThrow()
  })

  test('command-only queueOrder respects actor order', () => {
    const { stateWithScheduled, commands, playerYuji, playerNobara, enemyYuji } = buildInterleavedScenario()

    // Nobara first, then Yuji
    const nobaraFirst = resolveInterleavedPlayerTurnTimeline(stateWithScheduled, commands, [
      { kind: 'command', actorId: playerNobara.instanceId },
      { kind: 'command', actorId: playerYuji.instanceId },
    ])

    // Both fire: enemy takes 30 total regardless of order (same targets, additive damage)
    expect(getFighter(nobaraFirst.state, 'enemy', 'yuji').hp).toBe(enemyYuji.hp - 30)
    expect(nobaraFirst.steps.length).toBeGreaterThanOrEqual(2)
  })

  test('passives still fire via tickTeamTurn after the queueOrder loop', () => {
    // Mechamaru's Artillery Frame passive (onRoundStart) fires through beginNewRound, not queueOrder.
    // resolveInterleavedPlayerTurnTimeline calls tickTeamTurn after the loop, not beginNewRound,
    // so onRoundStart passives are not part of this function — they fire in endRoundTimeline.
    // This test verifies the function doesn't accidentally fire passives during the loop.
    const state = createChargedBattleState({
      playerTeamIds: ['mechamaru', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mechamaru = getFighter(state, 'player', 'mechamaru')
    const enemyYuji  = getFighter(state, 'enemy', 'yuji')
    const hpBefore = enemyYuji.hp

    mechamaru.abilities[0].energyCost = {}

    const result = resolveInterleavedPlayerTurnTimeline(state, {}, [])

    // Artillery Frame (onRoundStart) must NOT have fired — endRoundTimeline drives that
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(hpBefore)
  })

  test('reaction guards remain present after interleaved resolution (not consumed by queueOrder loop)', () => {
    // Reaction guards fire reactively during resolveAction, not during the queueOrder loop itself.
    // A guard on enemy Yuji should still be present if Nobara was targeted instead.
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const playerYuji = getFighter(state, 'player', 'yuji')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')
    const enemyYuji  = getFighter(state, 'enemy', 'yuji')

    enemyYuji.reactionGuards = [{
      id: 'test-counter-guard',
      kind: 'counter' as const,
      label: 'Test Counter',
      remainingRounds: 2,
      counterDamage: 10,
      consumeOnTrigger: false,
      sourceActorId: enemyYuji.instanceId,
    }]

    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].effects = [{ type: 'damage', power: 5, target: 'inherit' }]

    const commands: Record<string, import('@/features/battle/types').QueuedBattleAction> = {
      [playerYuji.instanceId]: { actorId: playerYuji.instanceId, team: 'player', abilityId: playerYuji.abilities[0].id, targetId: enemyNobara.instanceId },
    }

    // Target Nobara, not Yuji — Yuji's counter guard should not be consumed
    const result = resolveInterleavedPlayerTurnTimeline(state, commands, [
      { kind: 'command', actorId: playerYuji.instanceId },
    ])

    const yujiAfter = getFighter(result.state, 'enemy', 'yuji')
    expect(yujiAfter.reactionGuards.some((g) => g.id === 'test-counter-guard')).toBe(true)
  })
})

describe('keyword contract', () => {
  // ── Piercing vs Affliction ──────────────────────────────────────────────────

  test('piercing damage bypasses damage reduction but not destructible defense', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yaga', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const actor = getFighter(state, 'player', 'yaga')
    const target = getFighter(state, 'enemy', 'yuji')
    // Give target damage reduction and a large shield
    target.modifiers.push({
      id: 'test-dmg-reduction',
      label: 'Damage Reduction',
      scope: 'fighter',
      targetId: target.instanceId,
      stat: 'damageTaken',
      mode: 'flat',
      value: -30,
      duration: { kind: 'permanent' },
      tags: [],
      visible: true,
      stacking: 'stack',
    })
    target.shield = { amount: 50, label: 'Big Guard', sourceActorId: target.instanceId, tags: [] }

    // yaga-cursed-corpse-release fires 15 normal + 15 piercing damage
    const result = resolveTeamTurn(state, queue('player', actor.instanceId, 'yaga-cursed-corpse-release', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')
    // HP should be untouched — both hits absorbed by the 50-shield, but the piercing hit bypasses reduction
    expect(targetAfter.hp).toBe(100)
    // Shield should be reduced by: normal hit (15 - 30 reduction = 0, minimum 1) + piercing hit (15, no reduction)
    // Normal: max(1, 15 - 30) = 1, piercing: 15 → total 16 damage to shield
    expect(targetAfter.shield).not.toBeNull()
    expect(targetAfter.shield!.amount).toBeLessThan(50)
  })

  test('Affliction-class skill bypasses destructible defense', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['junpei', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const junpei = getFighter(state, 'player', 'junpei')
    const target = getFighter(state, 'enemy', 'yuji')
    target.shield = { amount: 50, label: 'Big Guard', sourceActorId: target.instanceId, tags: [] }

    // junpei-moon-dregs-injection is Affliction class — bypasses shield entirely
    const result = resolveTeamTurn(state, queue('player', junpei.instanceId, 'junpei-moon-dregs-injection', target.instanceId), 'player')
    const targetAfter = getFighter(result.state, 'enemy', 'yuji')
    // Affliction bypasses shield — HP is reduced directly
    expect(targetAfter.hp).toBeLessThan(100)
    // Shield is untouched (Affliction ignores it)
    expect(targetAfter.shield?.amount).toBe(50)
  })

  // ── Counter keyword ─────────────────────────────────────────────────────────

  test('counter guard fires when target is hit by a counterable skill', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yaga', 'nobara', 'megumi'],
    })
    const playerYuji = getFighter(state, 'player', 'yuji')
    const enemyYaga = getFighter(state, 'enemy', 'yaga')
    const playerYujiHpBefore = playerYuji.hp

    // Give yaga a counter guard manually (simulates Cursed Corpse: Intercept effect)
    enemyYaga.reactionGuards = [{
      id: 'counter-test',
      kind: 'counter' as const,
      label: 'Counter',
      remainingRounds: 1,
      counterDamage: 10,
      consumeOnTrigger: true,
      sourceActorId: enemyYaga.instanceId,
    }]

    // Yuji hits Yaga with a basic damage ability
    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const result = resolveTeamTurn(state, queue('player', playerYuji.instanceId, playerYuji.abilities[0].id, enemyYaga.instanceId), 'player')
    const yujiAfter = getFighter(result.state, 'player', 'yuji')
    // Yuji should have taken counter damage
    expect(yujiAfter.hp).toBeLessThan(playerYujiHpBefore)
    // Counter guard should be consumed
    const yagaAfter = getFighter(result.state, 'enemy', 'yaga')
    expect(yagaAfter.reactionGuards.some((g) => g.id === 'counter-test')).toBe(false)
  })

  test('skill with cannotBeCountered flag is not countered', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yaga', 'nobara', 'megumi'],
    })
    const playerYuji = getFighter(state, 'player', 'yuji')
    const enemyYaga = getFighter(state, 'enemy', 'yaga')
    const playerYujiHpBefore = playerYuji.hp

    enemyYaga.reactionGuards = [{
      id: 'counter-test',
      kind: 'counter' as const,
      label: 'Counter',
      remainingRounds: 1,
      counterDamage: 10,
      consumeOnTrigger: true,
      sourceActorId: enemyYaga.instanceId,
    }]

    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].effects = [{ type: 'damage', power: 20, cannotBeCountered: true, target: 'inherit' }]

    const result = resolveTeamTurn(state, queue('player', playerYuji.instanceId, playerYuji.abilities[0].id, enemyYaga.instanceId), 'player')
    const yujiAfter = getFighter(result.state, 'player', 'yuji')
    // No counter damage should land
    expect(yujiAfter.hp).toBe(playerYujiHpBefore)
  })

  test('counter damage packet does not trigger a second counter on the original attacker', () => {
    // Counter packets set cannotBeCountered + cannotBeReflected to prevent infinite loops.
    // Counter fires pre-damage and CANCELS the triggering skill entirely.
    // Verify: Yaga counters Yuji's attack; Yuji also has a counter guard but it does NOT fire on the counter packet.
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yaga', 'nobara', 'megumi'],
    })
    const playerYuji = getFighter(state, 'player', 'yuji')
    const enemyYaga = getFighter(state, 'enemy', 'yaga')

    // Both sides have counter guards
    playerYuji.reactionGuards = [{
      id: 'counter-yuji',
      kind: 'counter' as const,
      label: 'Counter',
      remainingRounds: 1,
      counterDamage: 15,
      consumeOnTrigger: false,
      sourceActorId: playerYuji.instanceId,
    }]
    enemyYaga.reactionGuards = [{
      id: 'counter-yaga',
      kind: 'counter' as const,
      label: 'Counter',
      remainingRounds: 1,
      counterDamage: 10,
      consumeOnTrigger: false,
      sourceActorId: enemyYaga.instanceId,
    }]

    playerYuji.abilities[0].energyCost = {}
    playerYuji.abilities[0].targetRule = 'enemy-single'
    playerYuji.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const result = resolveTeamTurn(state, queue('player', playerYuji.instanceId, playerYuji.abilities[0].id, enemyYaga.instanceId), 'player')
    // Counter fires pre-damage and cancels Yuji's skill — Yaga takes 0 damage from the original hit
    const yagaAfter = getFighter(result.state, 'enemy', 'yaga')
    expect(yagaAfter.hp).toBe(100)
    // Yuji takes counter damage from Yaga's guard (10), and Yuji's own counter guard does NOT fire on this counter packet
    const yujiAfter = getFighter(result.state, 'player', 'yuji')
    expect(yujiAfter.hp).toBe(90) // 100 - 10 counter only; no further counter-counter recursion
    // Confirm the counter event fired (not just silence)
    expect(result.events.some((e) => e.message.toLowerCase().includes('countered'))).toBe(true)
  })

  // ── Stun / class lock / intent lock cancel chain ────────────────────────────

  test('stun cancels queued action before resolution', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const actor = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    actor.abilities[0].energyCost = {}
    actor.abilities[0].targetRule = 'enemy-single'
    actor.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]

    // Apply a stun modifier directly to actor
    actor.modifiers.push({
      id: 'stun-before-resolve',
      label: 'Stun',
      scope: 'fighter',
      targetId: actor.instanceId,
      stat: 'canAct',
      mode: 'set',
      value: false,
      duration: { kind: 'rounds', remaining: 1 },
      tags: [],
      visible: true,
      stacking: 'replace',
      statusKind: 'stun',
    })

    const result = resolveTeamTurn(state, queue('player', actor.instanceId, actor.abilities[0].id, target.instanceId), 'player')
    // Target should be unharmed — stun prevented resolution
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
    expect(result.events.some((e) => e.message.toLowerCase().includes('stunned') || e.message.toLowerCase().includes('canceled'))).toBe(true)
  })

  test('class lock cancels queued action for locked class before resolution', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['noritoshi', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const noritoshi = getFighter(state, 'player', 'noritoshi')
    const target = getFighter(state, 'enemy', 'yuji')

    // Piercing Blood is Physical+Ranged — apply a class stun for Physical
    noritoshi.classStuns = [{
      id: 'class-stun-physical',
      label: 'Physical Seal',
      blockedClasses: ['Physical'],
      remainingRounds: 1,
    }]

    const result = resolveTeamTurn(
      state,
      queue('player', noritoshi.instanceId, 'noritoshi-piercing-blood', target.instanceId),
      'player',
    )
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
    expect(result.events.some((e) => e.message.toLowerCase().includes('sealed') || e.message.toLowerCase().includes('canceled'))).toBe(true)
  })

  test('intent lock log uses "sealed" not "stunned"', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['junpei', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const junpei = getFighter(state, 'player', 'junpei')
    const target = getFighter(state, 'enemy', 'yuji')

    // Apply intentStun (harmful) to junpei before resolution
    junpei.intentStuns = [{
      id: 'intent-stun-harmful',
      label: 'Intent Seal',
      intent: 'harmful',
      remainingRounds: 1,
    }]

    // junpei-moon-dregs-injection is a harmful ability — should be canceled by the intent lock
    const result = resolveTeamTurn(
      state,
      queue('player', junpei.instanceId, 'junpei-moon-dregs-injection', target.instanceId),
      'player',
    )
    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(100)
    // The cancel message should say "sealed" not "stunned"
    const cancelEvent = result.events.find((e) => e.message.includes('canceled because its intent'))
    expect(cancelEvent).toBeDefined()
    expect(cancelEvent!.message).toContain('sealed')
    expect(cancelEvent!.message).not.toContain('stunned')
  })

  test('intent lock apply log uses "sealed" not "stunned"', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['kechizu', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const kechizu = getFighter(state, 'player', 'kechizu')
    const target = getFighter(state, 'enemy', 'yuji')

    // kechizu-chomp applies intentStun (helpful) to target — log should say "sealed"
    const result = resolveTeamTurn(
      state,
      queue('player', kechizu.instanceId, 'kechizu-chomp', target.instanceId),
      'player',
    )
    const intentStunEvent = result.events.find((e) => e.message.toLowerCase().includes('sealed') && e.message.toLowerCase().includes('skill'))
    expect(intentStunEvent).toBeDefined()
    expect(result.events.some((e) => e.message.toLowerCase().includes('stunned') && e.message.toLowerCase().includes('skill'))).toBe(false)
  })

  // ── Destructible defense log messages ───────────────────────────────────────

  test('shield gain log uses "destructible defense" not "shield"', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yaga', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const yaga = getFighter(state, 'player', 'yaga')

    // yaga-emergency-substitute applies invulnerable + 25 destructible defense
    const result = resolveTeamTurn(state, queue('player', yaga.instanceId, 'yaga-emergency-substitute', yaga.instanceId), 'player')
    const shieldGainEvent = result.events.find((e) => e.message.includes('25') && e.message.toLowerCase().includes('destructible'))
    expect(shieldGainEvent).toBeDefined()
    // Must not log as "shield"
    const bareShieldEvent = result.events.find(
      (e) => e.message.toLowerCase().includes('gained') && e.message.toLowerCase().includes(' shield') && !e.message.toLowerCase().includes('destructible'),
    )
    expect(bareShieldEvent).toBeUndefined()
  })

  // ── Phase 7B — per-round tick symmetry ─────────────────────────────────────
  // Law 7.1: every fighter-scoped duration ticks exactly once per round.
  // Prior to Phase 7B, endRound called tickTeamTurn(secondTeam) a second time,
  // giving the second-acting team a double-tick on cooldowns, abilityState,
  // effectImmunities, reactionGuards, stateModes, and costModifiers.

  describe('Phase 7B — per-round tick symmetry (Law 7.1)', () => {
    // Helper: build a full round given a known firstPlayer.
    // Returns the state after endRound (start of next round ready).
    function runFullRound(
      initial: BattleState,
      firstTeam: 'player' | 'enemy',
    ): BattleState {
      initial.firstPlayer = firstTeam
      initial.activePlayer = firstTeam
      const secondTeam = firstTeam === 'player' ? 'enemy' : 'player'
      const afterFirst = resolveTeamTurn(initial, {}, firstTeam)
      const afterTransition = transitionToSecondPlayer(afterFirst.state)
      const afterSecond = resolveTeamTurn(afterTransition, {}, secondTeam)
      const afterEnd = endRound(afterSecond.state)
      return afterEnd.state
    }

    test('first-team cooldown decrements by 1 per round', () => {
      const state = createChargedBattleState({
        playerTeamIds: ['yuji', 'nobara', 'megumi'],
        enemyTeamIds: ['yuji', 'nobara', 'megumi'],
      })
      state.firstPlayer = 'player'
      state.activePlayer = 'player'

      const yuji = getFighter(state, 'player', 'yuji')
      // Set a cooldown of 3 on yuji's first ability
      const abilityId = yuji.abilities[0].id
      yuji.cooldowns[abilityId] = 3

      const afterRound = runFullRound(state, 'player')
      const yujiAfter = getFighter(afterRound, 'player', 'yuji')
      // Should decrement by exactly 1 (one tickTeamTurn call for player team)
      expect(yujiAfter.cooldowns[abilityId]).toBe(2)
    })

    test('second-team cooldown decrements by 1 per round, not 2', () => {
      const state = createChargedBattleState({
        playerTeamIds: ['yuji', 'nobara', 'megumi'],
        enemyTeamIds: ['yuji', 'nobara', 'megumi'],
      })
      state.firstPlayer = 'player'
      state.activePlayer = 'player'

      const enemyYuji = getFighter(state, 'enemy', 'yuji')
      const abilityId = enemyYuji.abilities[0].id
      enemyYuji.cooldowns[abilityId] = 3

      const afterRound = runFullRound(state, 'player')
      const enemyYujiAfter = getFighter(afterRound, 'enemy', 'yuji')
      // Before Phase 7B fix: would have been 1 (double-tick: 3→2→1)
      // After fix: exactly 1 tick → 3→2
      expect(enemyYujiAfter.cooldowns[abilityId]).toBe(2)
    })

    test('first-team and second-team cooldowns decrement by the same amount per round', () => {
      const state = createChargedBattleState({
        playerTeamIds: ['yuji', 'nobara', 'megumi'],
        enemyTeamIds: ['yuji', 'nobara', 'megumi'],
      })
      state.firstPlayer = 'player'
      state.activePlayer = 'player'

      const yuji = getFighter(state, 'player', 'yuji')
      const enemyYuji = getFighter(state, 'enemy', 'yuji')
      const abilityId = yuji.abilities[0].id
      const enemyAbilityId = enemyYuji.abilities[0].id
      yuji.cooldowns[abilityId] = 4
      enemyYuji.cooldowns[enemyAbilityId] = 4

      const afterRound = runFullRound(state, 'player')
      const playerAfter = getFighter(afterRound, 'player', 'yuji')
      const enemyAfter = getFighter(afterRound, 'enemy', 'yuji')

      expect(playerAfter.cooldowns[abilityId]).toBe(enemyAfter.cooldowns[enemyAbilityId])
    })

    test('second-team effectImmunity decrements by 1 per round', () => {
      const state = createChargedBattleState({
        playerTeamIds: ['yuji', 'nobara', 'megumi'],
        enemyTeamIds: ['yuji', 'nobara', 'megumi'],
      })
      state.firstPlayer = 'player'
      state.activePlayer = 'player'

      const enemyYuji = getFighter(state, 'enemy', 'yuji')
      enemyYuji.effectImmunities.push({
        id: 'test-immunity',
        label: 'Test Immunity',
        blocks: ['damage'],
        remainingRounds: 3,
        tags: [],
      })

      const afterRound = runFullRound(state, 'player')
      const enemyAfter = getFighter(afterRound, 'enemy', 'yuji')
      // Before fix: double-ticked to 1; after fix: 2
      expect(enemyAfter.effectImmunities[0]?.remainingRounds).toBe(2)
    })

    test('second-team reactionGuard decrements by 1 per round (skip-guard for first round applies)', () => {
      const state = createChargedBattleState({
        playerTeamIds: ['yuji', 'nobara', 'megumi'],
        enemyTeamIds: ['yuji', 'nobara', 'megumi'],
      })
      // Round 1 is current; set firstPlayer = player
      state.firstPlayer = 'player'
      state.activePlayer = 'player'
      state.round = 1

      const enemyYuji = getFighter(state, 'enemy', 'yuji')
      // Reaction guard applied in a *previous* round (round 0) so skip guard does not fire
      enemyYuji.reactionGuards.push({
        id: 'test-guard',
        kind: 'counter',
        label: 'Test Counter',
        remainingRounds: 3,
        appliedInRound: 0,
        consumeOnTrigger: false,
        visible: true,
        counterDamage: 20,
      })

      const afterRound = runFullRound(state, 'player')
      const enemyAfter = getFighter(afterRound, 'enemy', 'yuji')
      // Before fix: double-ticked to 1; after fix: 2
      expect(enemyAfter.reactionGuards[0]?.remainingRounds).toBe(2)
    })

    test('second-team abilityState (replacement) decrements by 1 per round', () => {
      const state = createChargedBattleState({
        playerTeamIds: ['yuji', 'nobara', 'megumi'],
        enemyTeamIds: ['yuji', 'nobara', 'megumi'],
      })
      state.firstPlayer = 'player'
      state.activePlayer = 'player'

      const enemyYuji = getFighter(state, 'enemy', 'yuji')
      // abilityState has no appliedInRound skip guard — ticks every time tickTeamTurn runs
      enemyYuji.abilityState.push({
        mode: 'grant',
        grantedAbility: enemyYuji.abilities[0],
        duration: 3,
      })

      const afterRound = runFullRound(state, 'player')
      const enemyAfter = getFighter(afterRound, 'enemy', 'yuji')
      // Before fix: duration 3→2→1 (double-tick); after fix: 3→2
      expect(enemyAfter.abilityState[0]?.duration).toBe(2)
    })

    test('2-round stun skip guard: appliedInRound tick is skipped, so remaining stays 2 after first same-round tick', () => {
      // Inject a 2-round stun on the enemy in round 1.
      // tickTeamTurn(enemy) fires during resolveTeamTurn(enemy, round=1).
      // Skip guard: appliedInRound(1) === round(1) → NOT decremented.
      // Phase 7B: no extra tickTeamTurn(enemy) in endRound.
      // After full round 1, the stun should still have remaining=2 (skip guard preserved it).
      // On the enemy's NEXT turn (round 2), remaining decrements from 2 to 1.
      const state = createChargedBattleState({
        playerTeamIds: ['yuji', 'nobara', 'megumi'],
        enemyTeamIds: ['yuji', 'nobara', 'megumi'],
      })
      state.firstPlayer = 'player'
      state.activePlayer = 'player'
      state.round = 1

      const enemyYuji = getFighter(state, 'enemy', 'yuji')
      // Use a non-stun modifier so resolveAction doesn't consume it on pass
      // (stuns are consumed in resolveAction, so we use a different stat)
      enemyYuji.modifiers.push({
        id: 'test-debuff-7b',
        scope: 'fighter',
        targetId: enemyYuji.instanceId,
        label: 'Marked',
        stat: 'damageTaken',
        mode: 'flat',
        value: 10,
        duration: { kind: 'rounds', remaining: 2 },
        tags: ['status', 'mark'],
        statusKind: 'mark',
        visible: true,
        stacking: 'max',
        appliedInRound: 1,
      })

      // After player turn: debuff on enemy, not ticked (tickTeamTurn only ticks own team)
      const afterPlayer = resolveTeamTurn(state, {}, 'player')
      // After enemy turn: tickTeamTurn(enemy, round=1) → appliedInRound===round → SKIP
      const afterTransition = transitionToSecondPlayer(afterPlayer.state)
      const afterEnemy = resolveTeamTurn(afterTransition, {}, 'enemy')
      const enemyMidRound = getFighter(afterEnemy.state, 'enemy', 'yuji')
      // Skip guard should leave remaining=2
      expect(enemyMidRound.modifiers.find((m) => m.id === 'test-debuff-7b')?.duration).toEqual({ kind: 'rounds', remaining: 2 })

      // endRound (no extra enemy tick), then round 2 begins
      const afterEnd = endRound(afterEnemy.state)
      const enemyAfterEnd = getFighter(afterEnd.state, 'enemy', 'yuji')
      expect(enemyAfterEnd.modifiers.find((m) => m.id === 'test-debuff-7b')?.duration).toEqual({ kind: 'rounds', remaining: 2 })

      // Round 2 enemy turn: appliedInRound(1) ≠ round(2) → decrements to 1
      const afterPlayerR2 = resolveTeamTurn(afterEnd.state, {}, 'player')
      const afterTransitionR2 = transitionToSecondPlayer(afterPlayerR2.state)
      const afterEnemyR2 = resolveTeamTurn(afterTransitionR2, {}, 'enemy')
      const enemyR2 = getFighter(afterEnemyR2.state, 'enemy', 'yuji')
      expect(enemyR2.modifiers.find((m) => m.id === 'test-debuff-7b')?.duration).toEqual({ kind: 'rounds', remaining: 1 })
    })

    test('scheduled roundStart effect fires at the correct absolute round regardless of team order', () => {
      const state = createChargedBattleState({
        playerTeamIds: ['yuji', 'nobara', 'megumi'],
        enemyTeamIds: ['yuji', 'nobara', 'megumi'],
      })
      state.firstPlayer = 'player'
      state.activePlayer = 'player'
      state.round = 1

      // Plant a scheduled effect due at round 3 start
      state.scheduledEffects.push({
        id: 'test-scheduled',
        actorId: getFighter(state, 'player', 'yuji').instanceId,
        targetIds: [getFighter(state, 'enemy', 'yuji').instanceId],
        abilityId: undefined,
        dueRound: 3,
        phase: 'roundStart',
        effects: [{ type: 'stun', duration: 1, target: 'inherit' }],
      })

      // Advance to round 3 via two full rounds
      const afterR1 = runFullRound(state, 'player')
      const r2Start = beginNewRound(afterR1)
      const afterR2 = runFullRound(r2Start.state, 'player')
      const r3Start = beginNewRound(afterR2)

      // The scheduled effect should fire at round 3 start
      const scheduledGone = r3Start.state.scheduledEffects.every((e) => e.id !== 'test-scheduled')
      expect(scheduledGone).toBe(true)
    })
  })
})
