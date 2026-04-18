import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { endRoundTimeline, resolveTeamTurnTimeline, transitionToSecondPlayer } from '@/features/battle/engine.ts'
import type { BattleState, BattleTimelineStep, QueuedBattleAction } from '@/features/battle/types.ts'

type BattleTeamId = 'player' | 'enemy'
type MatchStatus = 'waiting' | 'in_progress' | 'finished' | 'abandoned'
type MatchRow = {
  id: string
  status: MatchStatus
  player_a_id: string
  player_b_id: string | null
  current_phase: string
  current_round: number
  active_player: BattleTeamId
  battle_state: unknown
  match_revision: number
  resolution_id: string | null
  resolution_steps: unknown
  winner: BattleTeamId | null
  last_submission_id: string | null
  last_submission_player_id: string | null
}

type SubmitMatchTurnRequest = {
  matchId: string
  submissionId: string
  expectedRevision: number
  round: number
  phase: 'firstPlayerCommand' | 'secondPlayerCommand'
  commands: Record<string, unknown>
  actionOrder: string[]
}

type SubmitMatchTurnRejectCode =
  | 'MATCH_NOT_FOUND'
  | 'NOT_PARTICIPANT'
  | 'MATCH_NOT_ACTIVE'
  | 'NOT_YOUR_TURN'
  | 'STALE_REVISION'
  | 'STALE_PHASE'
  | 'INVALID_COMMANDS'
  | 'ALREADY_SUBMITTED'
  | 'INTERNAL_ERROR'

type SubmitMatchTurnReject = {
  ok: false
  code: SubmitMatchTurnRejectCode
  message: string
  latestRevision?: number
  latestState?: unknown
}

type SubmitMatchTurnSuccess = {
  ok: true
  matchId: string
  revision: number
  resolution: {
    resolutionId: string
    round: number
    phase: 'firstPlayerCommand' | 'secondPlayerCommand'
    source: 'server'
    steps: BattleTimelineStep[]
    finalState: BattleState
  }
  status: MatchStatus
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reject(code: SubmitMatchTurnRejectCode, message: string, extras: Partial<SubmitMatchTurnReject> = {}) {
  return Response.json(
    {
      ok: false,
      code,
      message,
      ...extras,
    } satisfies SubmitMatchTurnReject,
    { status: 200, headers: corsHeaders },
  )
}

function isResolvablePhase(phase: unknown): phase is SubmitMatchTurnRequest['phase'] {
  return phase === 'firstPlayerCommand' || phase === 'secondPlayerCommand'
}

function validateRequest(body: unknown): SubmitMatchTurnRequest | null {
  if (!body || typeof body !== 'object') return null
  const candidate = body as Record<string, unknown>

  if (
    typeof candidate.matchId !== 'string' ||
    typeof candidate.submissionId !== 'string' ||
    typeof candidate.expectedRevision !== 'number' ||
    typeof candidate.round !== 'number' ||
    !isResolvablePhase(candidate.phase) ||
    !candidate.commands ||
    typeof candidate.commands !== 'object' ||
    !Array.isArray(candidate.actionOrder) ||
    !candidate.actionOrder.every((entry) => typeof entry === 'string')
  ) {
    return null
  }

  return {
    matchId: candidate.matchId,
    submissionId: candidate.submissionId,
    expectedRevision: candidate.expectedRevision,
    round: candidate.round,
    phase: candidate.phase,
    commands: candidate.commands as Record<string, unknown>,
    actionOrder: candidate.actionOrder,
  }
}

function getRoleTeam(match: MatchRow, userId: string): BattleTeamId | null {
  if (match.player_a_id === userId) return 'player'
  if (match.player_b_id === userId) return 'enemy'
  return null
}

function getStatusFromState(state: BattleState): MatchStatus {
  if (state.phase === 'finished') return 'finished'
  return 'in_progress'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return reject('INTERNAL_ERROR', 'Supabase function environment is not fully configured.')
  }

  const requestClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
      },
    },
  })

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const {
    data: { user },
    error: authError,
  } = await requestClient.auth.getUser()

  if (authError || !user) {
    return reject('NOT_PARTICIPANT', 'Authenticated user is required to submit a turn.')
  }

  const requestBody = validateRequest(await req.json().catch(() => null))
  if (!requestBody) {
    return reject('INVALID_COMMANDS', 'Malformed turn submission payload.')
  }

  const { data: match, error: matchError } = await adminClient
    .from('matches')
    .select('id,status,player_a_id,player_b_id,current_phase,current_round,active_player,battle_state,match_revision,resolution_id,resolution_steps,winner,last_submission_id,last_submission_player_id')
    .eq('id', requestBody.matchId)
    .maybeSingle()

  if (matchError || !match) {
    return reject('MATCH_NOT_FOUND', 'Match not found.')
  }

  const row = match as MatchRow
  const callerTeam = getRoleTeam(row, user.id)
  if (!callerTeam) {
    return reject('NOT_PARTICIPANT', 'Authenticated user is not a participant in this match.')
  }

  if (row.status !== 'in_progress') {
    return reject('MATCH_NOT_ACTIVE', 'Match is not currently in progress.')
  }

  if (row.match_revision !== requestBody.expectedRevision) {
    return reject('STALE_REVISION', 'Client revision is stale.', {
      latestRevision: row.match_revision,
      latestState: row.battle_state,
    })
  }

  if (row.current_round !== requestBody.round || row.current_phase !== requestBody.phase) {
    return reject('STALE_PHASE', 'Client round or phase is stale.', {
      latestRevision: row.match_revision,
      latestState: row.battle_state,
    })
  }

  if (row.active_player !== callerTeam) {
    return reject('NOT_YOUR_TURN', 'It is not the caller’s active command phase.')
  }

  if (Object.keys(requestBody.commands).length === 0) {
    return reject('INVALID_COMMANDS', 'At least one command entry is required.')
  }

  if (requestBody.actionOrder.length === 0) {
    return reject('INVALID_COMMANDS', 'Action order must contain at least one actor id.')
  }

  const { data: existingSubmission, error: submissionLookupError } = await adminClient
    .from('match_commands')
    .select('id')
    .eq('match_id', requestBody.matchId)
    .eq('submission_id', requestBody.submissionId)
    .maybeSingle()

  if (submissionLookupError) {
    return reject('INTERNAL_ERROR', 'Failed to inspect prior submissions.')
  }

  if (existingSubmission) {
    const { data: latestMatch, error: latestMatchError } = await adminClient
      .from('matches')
      .select('battle_state,match_revision,resolution_id,resolution_steps,status,current_round,current_phase')
      .eq('id', requestBody.matchId)
      .maybeSingle()

    if (latestMatchError || !latestMatch || !latestMatch.resolution_id || !latestMatch.resolution_steps || !latestMatch.battle_state) {
      return reject('ALREADY_SUBMITTED', 'This submission id has already been processed.', {
        latestRevision: row.match_revision,
        latestState: row.battle_state,
      })
    }

    return Response.json(
      {
        ok: true,
        matchId: requestBody.matchId,
        revision: latestMatch.match_revision as number,
        resolution: {
          resolutionId: latestMatch.resolution_id as string,
          round: latestMatch.current_round as number,
          phase: latestMatch.current_phase as SubmitMatchTurnRequest['phase'],
          source: 'server',
          steps: latestMatch.resolution_steps as BattleTimelineStep[],
          finalState: latestMatch.battle_state as BattleState,
        },
        status: latestMatch.status as MatchStatus,
      } satisfies SubmitMatchTurnSuccess,
      { status: 200, headers: corsHeaders },
    )
  }

  const canonicalState = row.battle_state as BattleState | null
  if (!canonicalState) {
    return reject('MATCH_NOT_ACTIVE', 'Match has no canonical battle state.')
  }

  const canonicalCommands = requestBody.commands as Record<string, QueuedBattleAction>

  const commandInsert = await adminClient
    .from('match_commands')
    .insert({
      match_id: requestBody.matchId,
      player_id: user.id,
      submission_id: requestBody.submissionId,
      round: requestBody.round,
      phase: requestBody.phase,
      commands: canonicalCommands,
      action_order: requestBody.actionOrder,
      command_source: 'server-authoritative',
    })

  if (commandInsert.error) {
    return reject('INTERNAL_ERROR', `Failed to persist command submission: ${commandInsert.error.message}`)
  }

  const resolutionSteps: BattleTimelineStep[] = []
  const turnTimeline = resolveTeamTurnTimeline(canonicalState, canonicalCommands, callerTeam, requestBody.actionOrder)
  resolutionSteps.push(...turnTimeline.steps)

  let nextState = turnTimeline.state

  if (nextState.phase !== 'finished') {
    if (requestBody.phase === 'firstPlayerCommand') {
      nextState = transitionToSecondPlayer(nextState)
    } else {
      const roundTimeline = endRoundTimeline(nextState)
      resolutionSteps.push(...roundTimeline.steps)
      nextState = roundTimeline.state
    }
  }

  const nextRevision = row.match_revision + 1
  const resolutionId = requestBody.submissionId
  const updatePayload = {
    battle_state: nextState,
    current_phase: nextState.phase,
    current_round: nextState.round,
    active_player: nextState.activePlayer ?? 'player',
    winner: nextState.winner ?? null,
    status: getStatusFromState(nextState),
    resolution_id: resolutionId,
    resolution_steps: resolutionSteps,
    match_revision: nextRevision,
    last_submission_id: requestBody.submissionId,
    last_submission_player_id: user.id,
    last_activity_at: new Date().toISOString(),
  }

  const { data: updatedMatch, error: updateError } = await adminClient
    .from('matches')
    .update(updatePayload)
    .eq('id', requestBody.matchId)
    .eq('match_revision', row.match_revision)
    .select('id,status,battle_state,match_revision,current_round,current_phase,resolution_id,resolution_steps')
    .maybeSingle()

  if (updateError) {
    return reject('INTERNAL_ERROR', `Failed to commit canonical match state: ${updateError.message}`)
  }

  if (!updatedMatch) {
    return reject('STALE_REVISION', 'Match revision changed while resolving the turn.')
  }

  return Response.json(
    {
      ok: true,
      matchId: requestBody.matchId,
      revision: updatedMatch.match_revision as number,
      resolution: {
        resolutionId: updatedMatch.resolution_id as string,
        round: updatedMatch.current_round as number,
        phase: requestBody.phase,
        source: 'server',
        steps: updatedMatch.resolution_steps as BattleTimelineStep[],
        finalState: updatedMatch.battle_state as BattleState,
      },
      status: updatedMatch.status as MatchStatus,
    } satisfies SubmitMatchTurnSuccess,
    { status: 200, headers: corsHeaders },
  )
})
