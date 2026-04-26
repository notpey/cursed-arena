import { PASS_ABILITY_ID, battlePassAbility } from '@/features/battle/data.ts'
import type {
  BattleAbilityStateDelta,
  BattleAbilityTemplate,
  BattleFighterState,
  BattleState,
  BattleTeamId,
} from '@/features/battle/types.ts'

export function getVisibleAbilities(fighter: BattleFighterState): BattleAbilityTemplate[] {
  const replacements = new Map(
    fighter.abilityState
      .filter((delta): delta is Extract<BattleAbilityStateDelta, { mode: 'replace' }> => delta.mode === 'replace')
      .map((delta) => [delta.slotAbilityId, delta.replacement]),
  )
  const locks = new Set(
    fighter.abilityState
      .filter((delta): delta is Extract<BattleAbilityStateDelta, { mode: 'lock' }> => delta.mode === 'lock')
      .map((delta) => delta.slotAbilityId),
  )
  const grants = fighter.abilityState
    .filter((delta): delta is Extract<BattleAbilityStateDelta, { mode: 'grant' }> => delta.mode === 'grant')
    .map((delta) => delta.grantedAbility)

  const baseAbilities = fighter.abilities.flatMap((ability) =>
    locks.has(ability.id) ? [] : [replacements.get(ability.id) ?? ability],
  )
  const ultimate = locks.has(fighter.ultimate.id) ? [] : [replacements.get(fighter.ultimate.id) ?? fighter.ultimate]

  return baseAbilities.concat(ultimate, grants)
}

export function getTeam(state: BattleState, team: BattleTeamId): BattleFighterState[] {
  return team === 'player' ? state.playerTeam : state.enemyTeam
}

export function getOpposingTeam(state: BattleState, team: BattleTeamId): BattleFighterState[] {
  return team === 'player' ? state.enemyTeam : state.playerTeam
}

export function getFighterById(state: BattleState, fighterId: string): BattleFighterState | null {
  return state.playerTeam.concat(state.enemyTeam).find((fighter) => fighter.instanceId === fighterId) ?? null
}

export function getAbilityById(fighter: BattleFighterState, abilityId: string): BattleAbilityTemplate | null {
  if (abilityId === PASS_ABILITY_ID) return battlePassAbility
  return getVisibleAbilities(fighter).find((ability) => ability.id === abilityId) ?? null
}

export function getCooldown(fighter: BattleFighterState, abilityId: string): number {
  return fighter.cooldowns[abilityId] ?? 0
}

export function isAlive(fighter: BattleFighterState): boolean {
  return fighter.hp > 0
}
