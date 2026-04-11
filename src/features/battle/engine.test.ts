import { describe, expect, test } from 'vitest'
import {
  beginNewRound,
  createInitialBattleState,
  endRound,
  getTeam,
  resolveTeamTurn,
  transitionToSecondPlayer,
} from '@/features/battle/engine'
import type { BattleState, QueuedBattleAction } from '@/features/battle/types'

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

describe('battle engine scenarios', () => {
  test('Gojo passive reduces cooldowns by an extra turn at round end', () => {
    const state = createInitialBattleState()
    const gojo = getFighter(state, 'player', 'gojo')

    gojo.cooldowns['gojo-red'] = 2

    const result = endRound(state)
    const updatedGojo = getFighter(result.state, 'player', 'gojo')

    expect(updatedGojo.cooldowns['gojo-red']).toBe(0)
  })

  test('Megumi passive damage boost applies to standard attacks', () => {
    const state = createInitialBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, 'megumi-dogs', yuji.instanceId),
      'player',
    )

    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')
    expect(updatedYuji.hp).toBe(54)
  })

  test('Nanami execute passive applies only below threshold', () => {
    const aboveThreshold = createInitialBattleState()
    const belowThreshold = createInitialBattleState()

    const gojoAbove = getFighter(aboveThreshold, 'player', 'gojo')
    const gojoBelow = getFighter(belowThreshold, 'player', 'gojo')
    const nanamiAbove = getFighter(aboveThreshold, 'enemy', 'nanami')
    const nanamiBelow = getFighter(belowThreshold, 'enemy', 'nanami')

    gojoAbove.hp = 60
    gojoBelow.hp = 50

    const aboveResult = resolveTeamTurn(
      aboveThreshold,
      queue('enemy', nanamiAbove.instanceId, 'nanami-collapse', gojoAbove.instanceId),
      'enemy',
    )
    const belowResult = resolveTeamTurn(
      belowThreshold,
      queue('enemy', nanamiBelow.instanceId, 'nanami-collapse', gojoBelow.instanceId),
      'enemy',
    )

    expect(getFighter(aboveResult.state, 'player', 'gojo').hp).toBe(3)
    expect(getFighter(belowResult.state, 'player', 'gojo').hp).toBe(0)
  })

  test('Jogo passive applies burn on hit', () => {
    const state = createInitialBattleState()
    const jogo = getFighter(state, 'player', 'jogo')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', jogo.instanceId, 'jogo-embers', yuji.instanceId),
      'player',
    )

    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')
    expect(updatedYuji.statuses.burnTurns).toBe(2)
    expect(updatedYuji.statuses.burnDamage).toBe(7)
  })

  test('Yuji passive heals at round start', () => {
    const state = createInitialBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    yuji.hp = 80

    const result = beginNewRound(state)
    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')

    expect(updatedYuji.hp).toBe(86)
  })

  test('battlefield bonus increases ultimate damage', () => {
    const state = createInitialBattleState()
    const gojo = getFighter(state, 'player', 'gojo')

    const result = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, 'gojo-hollow-purple', null),
      'player',
    )

    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')
    expect(updatedYuji.hp).toBe(19)
  })

  test('dead fighters do not act on the second turn after first-turn resolution', () => {
    const state = createInitialBattleState()
    state.firstPlayer = 'player'
    state.activePlayer = 'player'
    state.phase = 'firstPlayerCommand'

    const gojo = getFighter(state, 'player', 'gojo')
    const yuji = getFighter(state, 'enemy', 'yuji')
    yuji.hp = 40

    const firstTurn = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, 'gojo-red', yuji.instanceId),
      'player',
    )
    const secondPhase = transitionToSecondPlayer(firstTurn.state)
    const secondTurn = resolveTeamTurn(
      secondPhase,
      queue('enemy', yuji.instanceId, 'yuji-kick', gojo.instanceId),
      'enemy',
    )

    expect(getFighter(secondTurn.state, 'enemy', 'yuji').hp).toBe(0)
    expect(secondTurn.events.some((event) => event.actorId === yuji.instanceId && event.kind === 'action')).toBe(false)
  })

  test('battle seed locks initiative deterministically', () => {
    const first = createInitialBattleState({ battleSeed: 'alpha-seed' })
    const second = createInitialBattleState({ battleSeed: 'alpha-seed' })
    const alternate = createInitialBattleState({ battleSeed: 'beta-seed' })

    expect(first.firstPlayer).toBe(second.firstPlayer)
    expect([first.firstPlayer, 'player', 'enemy']).toContain(alternate.firstPlayer)
  })
})
