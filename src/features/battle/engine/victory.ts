import { isAlive } from '@/features/battle/engine/selectors.ts'
import type {
  BattleEventTone,
  BattleState,
} from '@/features/battle/types.ts'

export function getWinner(state: BattleState): BattleState['winner'] {
  const playerAlive = state.playerTeam.some(isAlive)
  const enemyAlive = state.enemyTeam.some(isAlive)
  if (playerAlive && enemyAlive) return null
  if (playerAlive) return 'player'
  if (enemyAlive) return 'enemy'
  return 'draw'
}

export function getVictoryTone(winner: BattleState['winner']): BattleEventTone {
  if (winner === 'player') return 'teal'
  if (winner === 'enemy') return 'red'
  return 'gold'
}

export function getVictoryMessage(winner: BattleState['winner']) {
  if (winner === 'player') return 'Your squad controls the battlefield.'
  if (winner === 'enemy') return 'The enemy team overwhelmed your formation.'
  return 'Both squads collapsed before either side could claim control.'
}
