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
import {
  canAbilityTarget,
  canReceiveHelpfulEffect,
  targetHasRequiredTags,
} from '@/features/battle/engine/referee.ts'
import { isHarmfulAbility, isHelpfulAbility } from '@/features/battle/engine/reactionPredicates.ts'
import type {
  BattleAbilityTemplate,
  BattleFighterState,
  BattleState,
  BattleTeamId,
  QueuedBattleAction,
} from '@/features/battle/types.ts'

// ─────────────────────────────────────────────
// AI pacing
// ─────────────────────────────────────────────

const AI_BASE_DELAY_MS = 750
const AI_PER_ACTION_DELAY_MS = 200
const AI_MAX_DELAY_MS = 1800

/**
 * Returns the ms to wait before committing the AI turn.
 * Pure function — deterministic given the action count.
 * Per-action delay makes the wait scale with how much the AI is "doing".
 */
export function calcAiTurnDelay(nonPassActionCount: number): number {
  return Math.min(
    AI_BASE_DELAY_MS + nonPassActionCount * AI_PER_ACTION_DELAY_MS,
    AI_MAX_DELAY_MS,
  )
}

// ─────────────────────────────────────────────
// Target selection helpers
// ─────────────────────────────────────────────

/**
 * Returns true if the ability would be entirely wasted on this target:
 * harmful skill into invulnerability (without bypass).
 */
function isHarmfulWastedOnTarget(
  state: BattleState,
  ability: BattleAbilityTemplate,
  target: BattleFighterState,
): boolean {
  if (!isHarmfulAbility(ability)) return false
  return !canAbilityTarget(state, ability, target)
}

/**
 * Selects the best single enemy target for a harmful ability.
 *
 * Priority order:
 * 1. Skip fully-blocked targets (invulnerable / required tags missing)
 * 2. Prefer lethal targets (damage ≥ current HP)
 * 3. Prefer lower HP targets (most pressure)
 */
function pickBestEnemyTarget(
  state: BattleState,
  ability: BattleAbilityTemplate,
  enemies: BattleFighterState[],
): BattleFighterState | null {
  const candidates = enemies.filter((t) => !isHarmfulWastedOnTarget(state, ability, t))
  if (candidates.length === 0) return enemies[0] ?? null  // fall back — engine will block it

  const damage = ability.power ?? 0

  // Lethal target first
  if (damage > 0) {
    const lethal = candidates.find((t) => t.hp <= damage)
    if (lethal) return lethal
  }

  // Lowest HP
  return candidates.slice().sort((a, b) => a.hp - b.hp)[0] ?? null
}

/**
 * Selects the best single ally target for a helpful ability.
 *
 * Priority order:
 * 1. Skip allies blocked from receiving helpful effects
 * 2. Skip full-health allies for heals (no wasted healing)
 * 3. Lowest HP ally most in need
 */
function pickBestAllyTarget(
  state: BattleState,
  ability: BattleAbilityTemplate,
  allies: BattleFighterState[],
  self: BattleFighterState,
): BattleFighterState {
  const isHeal = ability.kind === 'heal'

  const candidates = allies.filter((ally) => {
    if (!canReceiveHelpfulEffect(state, ally)) return false
    if (isHeal && ally.hp >= ally.maxHp) return false
    return true
  })

  if (candidates.length === 0) return self

  return candidates.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]!
}

// ─────────────────────────────────────────────
// Skill scoring
// ─────────────────────────────────────────────

/**
 * Returns true if the ability's required-tag condition can be satisfied by
 * at least one valid target on the appropriate side.
 */
function abilityHasViableTarget(
  state: BattleState,
  ability: BattleAbilityTemplate,
  self: BattleFighterState,
): boolean {
  const requiredTags = ability.requiredTargetTags ?? []
  if (requiredTags.length === 0) return true

  const targetRule = ability.targetRule
  if (targetRule === 'enemy-single' || targetRule === 'enemy-all') {
    return state.playerTeam.filter(isAlive).some((t) =>
      targetHasRequiredTags(state, t, ability),
    )
  }
  if (targetRule === 'ally-single' || targetRule === 'ally-all') {
    return [...state.enemyTeam.filter(isAlive)].some((t) =>
      targetHasRequiredTags(state, t, ability),
    )
  }
  if (targetRule === 'self') {
    return targetHasRequiredTags(state, self, ability)
  }
  return true
}

function scoreAbility(
  state: BattleState,
  ability: BattleAbilityTemplate,
  fighter: BattleFighterState,
  lowHpAlly: BattleFighterState,
  enemyFront: BattleFighterState | undefined,
): number {
  // Weed out payoff skills whose required setup is absent
  if (!abilityHasViableTarget(state, ability, fighter)) return -1000

  let score = ability.power ?? ability.healPower ?? ability.attackBuffAmount ?? 0

  const effects = ability.effects ?? []
  for (const effect of effects) {
    if (effect.type === 'invulnerable') score += 20
    else if (effect.type === 'counter') score += effect.counterDamage
    else if (effect.type === 'reaction') score += 15
  }

  if (ability.classes.includes('Ultimate') && state.round >= 3) score += 28

  // Heal: only valuable when someone actually needs it
  if (ability.kind === 'heal') {
    if (lowHpAlly.hp / lowHpAlly.maxHp < 0.5) score += 40
    else score -= 20  // penalise heal when team is healthy
  }

  if (ability.kind === 'defend' && fighter.hp / fighter.maxHp < 0.35) score += 26
  if (ability.kind === 'buff' && fighter.hp / fighter.maxHp > 0.35) score += 14
  if (ability.kind === 'debuff') score += 18

  // Penalise harmful abilities that are fully blocked on all available targets
  if (isHarmfulAbility(ability) && (ability.targetRule === 'enemy-single' || ability.targetRule === 'enemy-all')) {
    const liveEnemies = state.playerTeam.filter(isAlive)
    const allBlocked = liveEnemies.length > 0 && liveEnemies.every((t) =>
      isHarmfulWastedOnTarget(state, ability, t),
    )
    if (allBlocked) score -= 60
  }

  // Reward harmful ability targeting the already-weakest enemy (lethal bonus)
  if (isHarmfulAbility(ability) && enemyFront && (ability.power ?? 0) > 0) {
    if (enemyFront.hp <= (ability.power ?? 0)) score += 35  // can finish them off
  }

  return score
}

// ─────────────────────────────────────────────
// Energy helpers (unchanged from original)
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────

export function buildEnemyCommands(state: BattleState): Record<string, QueuedBattleAction> {
  const commands: Record<string, QueuedBattleAction> = {}
  let plannedPool = cloneEnergyPool(state, 'enemy')

  const fighters = state.enemyTeam
    .filter(isAlive)
    .sort((left, right) => left.slot - right.slot)

  fighters.forEach((fighter) => {
    const liveAllies = state.enemyTeam.filter(isAlive)
    const lowHpAlly = liveAllies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? fighter
    const liveEnemies = state.playerTeam.filter(isAlive)
    const enemyFront = liveEnemies.slice().sort((a, b) => a.hp - b.hp)[0]

    const availableAbilities = getVisibleAbilities(fighter)
      .filter((ability) => getCooldown(fighter, ability.id) <= 0)

    const sorted = availableAbilities
      .map((ability) => ({
        ability,
        score: scoreAbility(state, ability, fighter, lowHpAlly, enemyFront),
      }))
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
      const picked = pickBestEnemyTarget(state, ability, liveEnemies)
      targetId = picked?.instanceId ?? null
    } else if (ability.targetRule === 'ally-single') {
      if (isHelpfulAbility(ability)) {
        const picked = pickBestAllyTarget(state, ability, liveAllies, fighter)
        targetId = picked.instanceId
      } else {
        targetId = lowHpAlly.instanceId
      }
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
