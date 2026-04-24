import { describe, expect, test, vi } from 'vitest'
import type { StagedBattleSession } from '@/features/battle/matches'

const mockedReadStagedBattleSession = vi.hoisted(() => vi.fn<() => StagedBattleSession | null>())

vi.mock('@/features/battle/matches', async () => {
  const actual = await vi.importActual<typeof import('@/features/battle/matches')>('@/features/battle/matches')
  return {
    ...actual,
    readStagedBattleSession: mockedReadStagedBattleSession,
  }
})

describe('battle prep staged launch handoff', () => {
  test('preserves staged teams exactly when session payload is valid', async () => {
    mockedReadStagedBattleSession.mockReturnValue({
      mode: 'practice',
      battleSeed: 'seed-valid',
      playerTeamIds: ['gojo', 'megumi', 'jogo'],
      enemyTeamIds: ['yuji', 'nobara', 'nanami'],
      opponentName: 'TRAINING_DUMMY',
      opponentTitle: 'Practice Match',
      opponentRankLabel: null,
      roomCode: null,
      practiceOptions: { aiEnabled: true, enemyTeamIds: ['yuji', 'nobara', 'nanami'] },
    })

    const { readStagedBattleLaunch } = await import('@/features/battle/prep')
    const launch = readStagedBattleLaunch()

    expect(launch.playerTeamIds).toEqual(['gojo', 'megumi', 'jogo'])
    expect(launch.enemyTeamIds).toEqual(['yuji', 'nobara', 'nanami'])
    expect(launch.battleSeed).toBe('seed-valid')
  })

  test('falls back safely when staged teams are invalid', async () => {
    mockedReadStagedBattleSession.mockReturnValue({
      mode: 'quick',
      battleSeed: 'seed-invalid',
      playerTeamIds: ['missing-a', 'missing-b', 'missing-c'],
      enemyTeamIds: ['missing-x', 'missing-y', 'missing-z'],
      opponentName: 'QUEUE_OPPONENT',
      opponentTitle: 'Quick Match',
      opponentRankLabel: null,
      roomCode: null,
      practiceOptions: null,
    })

    const { readStagedBattleLaunch } = await import('@/features/battle/prep')
    const launch = readStagedBattleLaunch()

    expect(launch.playerTeamIds.length).toBe(3)
    expect(launch.enemyTeamIds.length).toBe(3)
    expect(launch.playerTeamIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(launch.enemyTeamIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(launch.battleSeed).toBe('seed-invalid')
  })
})
