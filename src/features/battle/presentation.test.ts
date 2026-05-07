import { describe, expect, test } from 'vitest'
import { buildPresentationQueue, resolveAbilityName } from '@/features/battle/presentation'
import type { BattleAbilityTemplate, BattleFighterState, BattleState, BattleTimelineStep } from '@/features/battle/types'

// ── Minimal fixture helpers ───────────────────────────────────────────────────

function makeState(round = 1): BattleState {
  return {
    stateSchemaVersion: 1,
    battleSeed: 'test',
    round,
    phase: 'firstPlayerResolve',
    firstPlayer: 'player',
    activePlayer: 'player',
    battlefield: { label: 'Arena', id: 'arena', effects: [] },
    playerEnergy: {},
    enemyEnergy: {},
    playerTeam: [],
    enemyTeam: [],
    playerTeamModifiers: [],
    enemyTeamModifiers: [],
    battlefieldModifiers: [],
    scheduledEffects: [],
    winner: null,
    randomTickCount: 0,
  } as unknown as BattleState
}

function makeStep(overrides: Partial<BattleTimelineStep> = {}): BattleTimelineStep {
  return {
    id: 'step-1',
    kind: 'action',
    round: 1,
    state: makeState(),
    events: [],
    runtimeEvents: [],
    ...overrides,
  }
}

function makeRuntimeEvent(
  type: BattleTimelineStep['runtimeEvents'][number]['type'],
  extra: Partial<BattleTimelineStep['runtimeEvents'][number]> = {},
): BattleTimelineStep['runtimeEvents'][number] {
  return {
    id: `runtime-${type}`,
    round: 1,
    type,
    ...extra,
  }
}

function makeAbility(id: string, name: string): BattleAbilityTemplate {
  return {
    id,
    name,
    description: '',
    kind: 'attack',
    targetRule: 'enemy-single',
    classes: [],
    cooldown: 0,
    energyCost: {},
    effects: [],
    icon: { label: id, tone: 'red' },
  } as unknown as BattleAbilityTemplate
}

function makeFighterState(instanceId: string, abilities: BattleAbilityTemplate[], ultimate: BattleAbilityTemplate): BattleFighterState {
  return {
    instanceId,
    templateId: instanceId,
    team: 'player',
    slot: 0,
    name: instanceId,
    shortName: instanceId,
    abilities,
    ultimate,
  } as unknown as BattleFighterState
}

function makeStateWithFighter(fighter: BattleFighterState, team: 'player' | 'enemy' = 'player'): BattleState {
  const base = makeState()
  return {
    ...base,
    playerTeam: team === 'player' ? [fighter] : [],
    enemyTeam: team === 'enemy' ? [fighter] : [],
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildPresentationQueue', () => {
  test('empty timeline returns empty queue', () => {
    expect(buildPresentationQueue([])).toEqual([])
  })

  test('every timeline step produces at least one state-commit item', () => {
    const steps = [makeStep(), makeStep({ id: 'step-2' })]
    const queue = buildPresentationQueue(steps)
    const commits = queue.filter((item) => item.kind === 'state-commit')
    expect(commits.length).toBeGreaterThanOrEqual(steps.length)
  })

  test('final item in the queue is a state-commit', () => {
    const queue = buildPresentationQueue([makeStep()])
    expect(queue[queue.length - 1]!.kind).toBe('state-commit')
  })

  test('final state-commit references the final timeline step state', () => {
    const finalState = makeState(5)
    const steps = [makeStep(), makeStep({ id: 'step-2', state: finalState })]
    const queue = buildPresentationQueue(steps)
    const lastCommit = [...queue].reverse().find((item) => item.kind === 'state-commit')
    expect(lastCommit?.commitState).toBe(finalState)
  })

  test('action step with actor+ability produces an action-start item', () => {
    const step = makeStep({
      kind: 'action',
      actorId: 'yuji-1',
      abilityId: 'divergent-fist',
      team: 'player',
    })
    const queue = buildPresentationQueue([step])
    const actionItem = queue.find((item) => item.kind === 'action-start')
    expect(actionItem).toBeDefined()
    expect(actionItem?.actorId).toBe('yuji-1')
    expect(actionItem?.abilityId).toBe('divergent-fist')
    expect(actionItem?.tone).toBe('teal')
  })

  test('action-start tone is red for enemy actor', () => {
    const step = makeStep({ kind: 'action', actorId: 'sukuna-1', abilityId: 'cleave', team: 'enemy' })
    const queue = buildPresentationQueue([step])
    const actionItem = queue.find((item) => item.kind === 'action-start')
    expect(actionItem?.tone).toBe('red')
  })

  test('damage_applied runtime event produces a damage item', () => {
    const step = makeStep({
      runtimeEvents: [makeRuntimeEvent('damage_applied', { amount: 45, targetId: 'megumi-1' })],
    })
    const queue = buildPresentationQueue([step])
    const dmgItem = queue.find((item) => item.kind === 'damage')
    expect(dmgItem).toBeDefined()
    expect(dmgItem?.amount).toBe(45)
    expect(dmgItem?.targetId).toBe('megumi-1')
    expect(dmgItem?.tone).toBe('red')
  })

  test('damage_applied with zero amount does not produce a damage item', () => {
    const step = makeStep({
      runtimeEvents: [makeRuntimeEvent('damage_applied', { amount: 0 })],
    })
    const queue = buildPresentationQueue([step])
    expect(queue.find((item) => item.kind === 'damage')).toBeUndefined()
  })

  test('heal_applied runtime event produces a heal item', () => {
    const step = makeStep({
      runtimeEvents: [makeRuntimeEvent('heal_applied', { amount: 30, targetId: 'yuji-1' })],
    })
    const queue = buildPresentationQueue([step])
    const healItem = queue.find((item) => item.kind === 'heal')
    expect(healItem).toBeDefined()
    expect(healItem?.amount).toBe(30)
    expect(healItem?.tone).toBe('teal')
  })

  test('status_applied runtime event produces a status item', () => {
    const step = makeStep({
      runtimeEvents: [
        makeRuntimeEvent('status_applied', { meta: { status: 'stun' }, targetId: 'nobara-1' }),
      ],
    })
    const queue = buildPresentationQueue([step])
    const statusItem = queue.find((item) => item.kind === 'status')
    expect(statusItem).toBeDefined()
    expect(statusItem?.message).toBe('STUN')
    expect(statusItem?.targetId).toBe('nobara-1')
  })

  test('status_applied with burn tag uses red tone', () => {
    const step = makeStep({
      runtimeEvents: [
        makeRuntimeEvent('status_applied', { meta: { status: 'burn' }, tags: ['burn'] }),
      ],
    })
    const queue = buildPresentationQueue([step])
    const statusItem = queue.find((item) => item.kind === 'status')
    expect(statusItem?.tone).toBe('red')
  })

  test('fighter_defeated runtime event produces a defeat item', () => {
    const step = makeStep({
      runtimeEvents: [makeRuntimeEvent('fighter_defeated', { targetId: 'nanami-1' })],
    })
    const queue = buildPresentationQueue([step])
    const defeatItem = queue.find((item) => item.kind === 'defeat')
    expect(defeatItem).toBeDefined()
    expect(defeatItem?.targetId).toBe('nanami-1')
    expect(defeatItem?.tone).toBe('red')
  })

  test('round_ended runtime event produces a round-end item', () => {
    const step = makeStep({
      kind: 'roundEnd',
      runtimeEvents: [makeRuntimeEvent('round_ended')],
    })
    const queue = buildPresentationQueue([step])
    const roundEndItem = queue.find((item) => item.kind === 'round-end')
    expect(roundEndItem).toBeDefined()
    expect(roundEndItem?.tone).toBe('frost')
  })

  test('roundStart step produces a round-start item', () => {
    const step = makeStep({ kind: 'roundStart', state: makeState(3) })
    const queue = buildPresentationQueue([step])
    const roundStartItem = queue.find((item) => item.kind === 'round-start')
    expect(roundStartItem).toBeDefined()
    expect(roundStartItem?.message).toBe('ROUND 3')
  })

  test('victory event on a step produces a victory item', () => {
    const step = makeStep({
      events: [{
        id: 'ev-1', round: 1, kind: 'victory', tone: 'gold',
        message: 'Player wins!',
      }],
    })
    const queue = buildPresentationQueue([step])
    const victoryItem = queue.find((item) => item.kind === 'victory')
    expect(victoryItem).toBeDefined()
    expect(victoryItem?.tone).toBe('gold')
  })

  test('queue builder does not mutate input timeline step state', () => {
    const state = makeState()
    const step = makeStep({ state })
    const stateBefore = JSON.stringify(state)
    buildPresentationQueue([step])
    expect(JSON.stringify(state)).toBe(stateBefore)
  })

  test('multiple steps each produce their own state-commit with the correct state', () => {
    const stateA = makeState(1)
    const stateB = makeState(2)
    const steps = [makeStep({ state: stateA }), makeStep({ id: 'step-2', state: stateB })]
    const queue = buildPresentationQueue(steps)
    const commits = queue.filter((item) => item.kind === 'state-commit')
    expect(commits[0]?.commitState).toBe(stateA)
    expect(commits[commits.length - 1]?.commitState).toBe(stateB)
  })

  test('resource_changed produces a resource item', () => {
    const step = makeStep({
      runtimeEvents: [makeRuntimeEvent('resource_changed')],
    })
    const queue = buildPresentationQueue([step])
    expect(queue.find((item) => item.kind === 'resource')).toBeDefined()
  })

  test('action step without actorId does not produce an action-start item', () => {
    const step = makeStep({ kind: 'action', actorId: undefined, abilityId: undefined })
    const queue = buildPresentationQueue([step])
    expect(queue.find((item) => item.kind === 'action-start')).toBeUndefined()
  })
})

// ── resolveAbilityName ────────────────────────────────────────────────────────

describe('resolveAbilityName', () => {
  test('resolves name from regular ability on actor in playerTeam', () => {
    const ability = makeAbility('divergent-fist', 'Divergent Fist')
    const fighter = makeFighterState('yuji-1', [ability], makeAbility('ult', 'Divergent Fist Ultimate'))
    const state = makeStateWithFighter(fighter, 'player')
    const step = makeStep({ actorId: 'yuji-1', abilityId: 'divergent-fist', state })
    expect(resolveAbilityName(step)).toBe('Divergent Fist')
  })

  test('resolves name from ultimate ability on actor', () => {
    const regular = makeAbility('strike', 'Strike')
    const ultimate = makeAbility('mahoraga', 'Mahoraga Summon')
    const fighter = makeFighterState('megumi-1', [regular], ultimate)
    const state = makeStateWithFighter(fighter, 'player')
    const step = makeStep({ actorId: 'megumi-1', abilityId: 'mahoraga', state })
    expect(resolveAbilityName(step)).toBe('Mahoraga Summon')
  })

  test('resolves name from actor in enemyTeam', () => {
    const ability = makeAbility('cleave', 'Cleave')
    const fighter = makeFighterState('sukuna-1', [ability], makeAbility('ult', 'Ult'))
    const state = makeStateWithFighter(fighter, 'enemy')
    const step = makeStep({ actorId: 'sukuna-1', abilityId: 'cleave', state })
    expect(resolveAbilityName(step)).toBe('Cleave')
  })

  test('falls back to BattleEvent message when actor not found in state', () => {
    const step = makeStep({
      actorId: 'ghost-1',
      abilityId: 'unknown-id',
      state: makeState(),
      events: [{ id: 'ev-1', round: 1, kind: 'action', tone: 'teal', message: 'Divergent Fist', actorId: 'ghost-1' }],
    })
    expect(resolveAbilityName(step)).toBe('Divergent Fist')
  })

  test('falls back to raw abilityId when actor and events are missing', () => {
    const step = makeStep({ actorId: 'ghost-1', abilityId: 'raw-id', state: makeState(), events: [] })
    expect(resolveAbilityName(step)).toBe('raw-id')
  })

  test('action-start message uses resolved name, not raw id', () => {
    const ability = makeAbility('divergent-fist', 'Divergent Fist')
    const fighter = makeFighterState('yuji-1', [ability], makeAbility('ult', 'Ult'))
    const state = makeStateWithFighter(fighter, 'player')
    const step = makeStep({ kind: 'action', actorId: 'yuji-1', abilityId: 'divergent-fist', team: 'player', state })
    const queue = buildPresentationQueue([step])
    const actionItem = queue.find((item) => item.kind === 'action-start')
    expect(actionItem?.message).toBe('DIVERGENT FIST')
  })

  test('does not mutate step state when resolving name', () => {
    const ability = makeAbility('strike', 'Strike')
    const fighter = makeFighterState('yuji-1', [ability], makeAbility('ult', 'Ult'))
    const state = makeStateWithFighter(fighter, 'player')
    const before = JSON.stringify(state)
    const step = makeStep({ actorId: 'yuji-1', abilityId: 'strike', state })
    resolveAbilityName(step)
    expect(JSON.stringify(state)).toBe(before)
  })

  test('returns empty string when both actorId and abilityId are absent', () => {
    const step = makeStep({ actorId: undefined, abilityId: undefined, state: makeState() })
    expect(resolveAbilityName(step)).toBe('')
  })
})
