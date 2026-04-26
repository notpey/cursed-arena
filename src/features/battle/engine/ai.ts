import {
  PASS_ABILITY_ID,
  battlePassAbility,
} from '@/features/battle/data.ts'
import {
  battleEnergyExchangeCost,
  battleEnergyOrder,
  canExchangeEnergy,
  canPayEnergy,
  exchangeEnergy,
  getAbilityEnergyCost,
  spendEnergy,
  totalEnergyInPool,
  type BattleEnergyType,
} from '@/features/battle/energy.ts'
import {
  getCooldown,
  getVisibleAbilities,
  isAlive,
} from '@/features/battle/engine/selectors.ts'
import { getResolvedAbilityEnergyCost } from '@/features/battle/engine/costModifier.ts'
import type {
  BattleState,
  BattleTeamId,
  QueuedBattleAction,
} from '@/features/battle/types.ts'

function cloneEnergyPool(state: BattleState, team: BattleTeamId) {
  const pool = team === 'player' ? state.playerEnergy : state.enemyEnergy
  return {
    amounts: { ...pool.amounts },
  }
}

function tryAffordAbilityWithExchanges(pool: ReturnType<typeof cloneEnergyPool>, cost: ReturnType<typeof getAbilityEnergyCost>) {
  let current = {
    amounts: { ...pool.amounts },
  }
  const exchanges: BattleEnergyType[] = []
  const maxExchanges = Math.floor(totalEnergyInPool(current) / battleEnergyExchangeCost)

  for (let index = 0; index <= maxExchanges; index += 1) {
    if (canPayEnergy(current, cost)) {
      return { pool: current, exchanges }
    }

    const deficits = battleEnergyOrder
      .map((type) => ({ type, amount: Math.max(0, (cost[type] ?? 0) - current.amounts[type]) }))
      .filter((entry) => entry.amount > 0)
      .sort((left, right) => right.amount - left.amount || battleEnergyOrder.indexOf(left.type) - battleEnergyOrder.indexOf(right.type))

    const targetType = deficits[0]?.type
    if (!targetType || !canExchangeEnergy(current)) {
      break
    }

    const next = exchangeEnergy(current, targetType)
    if (totalEnergyInPool(next) >= totalEnergyInPool(current)) {
      break
    }

    current = next
    exchanges.push(targetType)
  }

  return canPayEnergy(current, cost) ? { pool: current, exchanges } : null
}

export function buildEnemyCommands(state: BattleState): Record<string, QueuedBattleAction> {
  const commands: Record<string, QueuedBattleAction> = {}
  let plannedPool = cloneEnergyPool(state, 'enemy')

  const fighters = state.enemyTeam
    .filter(isAlive)
    .sort((left, right) => left.slot - right.slot)

  fighters.forEach((fighter) => {
    const lowHpAlly = state.enemyTeam.filter(isAlive).sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp)[0]
    const enemyFront = state.playerTeam.filter(isAlive).sort((left, right) => left.hp - right.hp)[0]

    const availableAbilities = getVisibleAbilities(fighter)
      .filter((ability) => getCooldown(fighter, ability.id) <= 0)

    const sorted = availableAbilities
      .map((ability) => {
        let score = ability.power ?? ability.healPower ?? ability.attackBuffAmount ?? 0

        const effects = ability.effects ?? []
        for (const effect of effects) {
          if (effect.type === 'invulnerable') score += 20
          else if (effect.type === 'counter') score += effect.counterDamage
          else if (effect.type === 'reaction') score += 15
        }

        if (ability.classes.includes('Ultimate') && state.round >= 3) score += 28
        if (ability.kind === 'heal' && lowHpAlly && lowHpAlly.hp / lowHpAlly.maxHp < 0.5) score += 40
        if (ability.kind === 'defend' && fighter.hp / fighter.maxHp < 0.35) score += 26
        if (ability.kind === 'buff' && fighter.hp / fighter.maxHp > 0.35) score += 14
        if (ability.kind === 'debuff') score += 18
        return { ability, score }
      })
      .sort((left, right) => right.score - left.score)

    const plannedAction =
      sorted
        .map(({ ability }) => {
          const cost = getResolvedAbilityEnergyCost(fighter, ability).cost
          if (canPayEnergy(plannedPool, cost)) {
            return { ability, pool: plannedPool }
          }

          const exchangePlan = tryAffordAbilityWithExchanges(plannedPool, cost)
          if (!exchangePlan) return null

          return {
            ability,
            pool: exchangePlan.pool,
          }
        })
        .find((entry) => Boolean(entry)) ?? null

    const ability = plannedAction?.ability ?? battlePassAbility
    let targetId: string | null = null

    if (ability.targetRule === 'enemy-single') {
      targetId = enemyFront?.instanceId ?? null
    } else if (ability.targetRule === 'ally-single') {
      targetId = lowHpAlly?.instanceId ?? fighter.instanceId
    } else if (ability.targetRule === 'self') {
      targetId = fighter.instanceId
    }

    commands[fighter.instanceId] = {
      actorId: fighter.instanceId,
      team: 'enemy',
      abilityId: ability.id,
      targetId,
    }

    if (ability.id !== PASS_ABILITY_ID) {
      plannedPool = spendEnergy(plannedAction?.pool ?? plannedPool, getResolvedAbilityEnergyCost(fighter, ability).cost)
    }
  })

  return commands
}
