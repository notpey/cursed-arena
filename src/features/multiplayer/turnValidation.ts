import {
  battleEnergyOrder,
  normalizeEnergyAmount,
  type BattleEnergyType,
} from '@/features/battle/energy.ts'
import { PASS_ABILITY_ID } from '@/features/battle/data.ts'
import {
  getAbilityById,
  getBattleCommandBlockReason,
  getResolvedAbilityEnergyCost,
} from '@/features/battle/engine.ts'
import type {
  BattleFighterState,
  BattleState,
  BattleTeamId,
  QueuedBattleAction,
} from '@/features/battle/types.ts'

export type CommandValidationIssue = {
  actorId: string
  abilityId?: string
  reason: string
}

export type SubmittedTurnValidationResult =
  | {
    ok: true
    commands: Record<string, QueuedBattleAction>
    actionOrder: string[]
  }
  | {
    ok: false
    commands: Record<string, QueuedBattleAction>
    actionOrder: string[]
    issues: CommandValidationIssue[]
  }

function getTeamFighters(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.playerTeam : state.enemyTeam
}

function sanitizeRandomAllocation(value: unknown): Partial<Record<BattleEnergyType, number>> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  const normalized = Object.fromEntries(
    battleEnergyOrder
      .map((type) => {
        const raw = candidate[type]
        const amount = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0
        return [type, amount] as const
      })
      .filter((entry) => entry[1] > 0),
  ) as Partial<Record<BattleEnergyType, number>>

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function sanitizeActionOrder(actionOrder: string[], commandableIds: Set<string>) {
  const seen = new Set<string>()
  return actionOrder.filter((actorId) => {
    if (!commandableIds.has(actorId)) return false
    if (seen.has(actorId)) return false
    seen.add(actorId)
    return true
  })
}

function buildValidationOrder(
  submittedActorIds: string[],
  actionOrder: string[],
  teamFighters: BattleFighterState[],
) {
  const submitted = new Set(submittedActorIds)
  const seen = new Set<string>()
  const ordered: string[] = []

  const append = (actorId: string) => {
    if (!submitted.has(actorId) || seen.has(actorId)) return
    ordered.push(actorId)
    seen.add(actorId)
  }

  actionOrder.forEach(append)
  teamFighters.forEach((fighter) => append(fighter.instanceId))
  submittedActorIds.forEach(append)

  return ordered
}

function countAllocatedRandom(allocation: QueuedBattleAction['randomCostAllocation']) {
  if (!allocation) return 0
  return battleEnergyOrder.reduce((total, type) => total + normalizeEnergyAmount(allocation[type]), 0)
}

function getRandomAllocationIssue(
  state: BattleState,
  command: QueuedBattleAction,
): string | null {
  if (command.abilityId === PASS_ABILITY_ID) return null

  const actor = getTeamFighters(state, command.team).find((fighter) => fighter.instanceId === command.actorId)
  if (!actor) return null

  const ability = getAbilityById(actor, command.abilityId)
  if (!ability) return null

  const { cost } = getResolvedAbilityEnergyCost(actor, ability)
  const randomRequired = normalizeEnergyAmount(cost.random)
  if (randomRequired <= 0) return null

  if (!command.randomCostAllocation) return 'Missing random resource allocation'

  const allocated = countAllocatedRandom(command.randomCostAllocation)
  if (allocated < randomRequired) {
    return `Incomplete random resource allocation (${allocated}/${randomRequired})`
  }
  if (allocated > randomRequired) {
    return `Invalid random resource allocation (${allocated}/${randomRequired})`
  }

  return null
}

function sanitizeSubmittedCommand(
  actorId: string,
  team: BattleTeamId,
  raw: unknown,
): QueuedBattleAction | null {
  if (!raw || typeof raw !== 'object') return null

  const candidate = raw as Record<string, unknown>
  if (typeof candidate.abilityId !== 'string') return null

  const command: QueuedBattleAction = {
    actorId,
    team,
    abilityId: candidate.abilityId,
    targetId: typeof candidate.targetId === 'string' ? candidate.targetId : null,
  }

  const allocation = sanitizeRandomAllocation(candidate.randomCostAllocation)
  if (allocation) {
    command.randomCostAllocation = allocation
  }

  return command
}

export function validateSubmittedTurnCommands(
  state: BattleState,
  team: BattleTeamId,
  submittedCommands: Record<string, unknown>,
  submittedActionOrder: string[],
): SubmittedTurnValidationResult {
  const teamFighters = getTeamFighters(state, team)
  const aliveActorIds = new Set(teamFighters.filter((fighter) => fighter.hp > 0).map((fighter) => fighter.instanceId))
  const actionOrder = sanitizeActionOrder(submittedActionOrder, aliveActorIds)
  const submittedActorIds = Object.keys(submittedCommands)
  const validationOrder = buildValidationOrder(submittedActorIds, actionOrder, teamFighters)
  const commands: Record<string, QueuedBattleAction> = {}
  const projectedQueued: Record<string, QueuedBattleAction> = {}
  const issues: CommandValidationIssue[] = []

  validationOrder.forEach((actorId) => {
    const command = sanitizeSubmittedCommand(actorId, team, submittedCommands[actorId])

    if (!command) {
      issues.push({ actorId, reason: 'Malformed command' })
      return
    }

    commands[actorId] = command

    const randomIssue = getRandomAllocationIssue(state, command)
    if (randomIssue) {
      issues.push({ actorId, abilityId: command.abilityId, reason: randomIssue })
      return
    }

    const blockReason = getBattleCommandBlockReason(state, command, projectedQueued)
    if (blockReason) {
      issues.push({ actorId, abilityId: command.abilityId, reason: blockReason })
      return
    }

    projectedQueued[actorId] = command
  })

  if (issues.length > 0) {
    return {
      ok: false,
      commands,
      actionOrder,
      issues,
    }
  }

  return {
    ok: true,
    commands,
    actionOrder,
  }
}
