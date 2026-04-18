import type { BattleState, BattleTimelineStep, QueuedBattleAction, TurnPhase } from '@/features/battle/types'

export type ResolvableMatchPhase = Extract<TurnPhase, 'firstPlayerCommand' | 'secondPlayerCommand'>

export type MatchResolutionStatus = 'in_progress' | 'finished' | 'abandoned'

export type SubmitMatchTurnRequest = {
  matchId: string
  submissionId: string
  expectedRevision: number
  round: number
  phase: ResolvableMatchPhase
  commands: Record<string, QueuedBattleAction>
  actionOrder: string[]
}

export type SubmitMatchTurnRejectCode =
  | 'MATCH_NOT_FOUND'
  | 'NOT_PARTICIPANT'
  | 'MATCH_NOT_ACTIVE'
  | 'NOT_YOUR_TURN'
  | 'STALE_REVISION'
  | 'STALE_PHASE'
  | 'INVALID_COMMANDS'
  | 'ALREADY_SUBMITTED'
  | 'INTERNAL_ERROR'

export type AuthoritativeTurnResolution = {
  resolutionId: string
  round: number
  phase: ResolvableMatchPhase
  source: 'server'
  steps: BattleTimelineStep[]
  finalState: BattleState
}

export type SubmitMatchTurnSuccess = {
  ok: true
  matchId: string
  revision: number
  resolution: AuthoritativeTurnResolution
  status: MatchResolutionStatus
}

export type SubmitMatchTurnReject = {
  ok: false
  code: SubmitMatchTurnRejectCode
  message: string
  latestRevision?: number
  latestState?: BattleState
}

export type SubmitMatchTurnResponse = SubmitMatchTurnSuccess | SubmitMatchTurnReject

export function buildTurnSubmissionId(matchId: string, round: number, phase: ResolvableMatchPhase, nonce = Date.now()) {
  return `${matchId}:${round}:${phase}:${nonce}`
}

export function isSuccessfulTurnSubmit(response: SubmitMatchTurnResponse): response is SubmitMatchTurnSuccess {
  return response.ok
}
