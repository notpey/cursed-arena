/**
 * useMultiplayerMatch
 *
 * Manages the full lifecycle of a live online match:
 *   - Loads initial state from Supabase
 *   - Subscribes to Realtime updates
 *   - Exposes a local-perspective BattleState (Player B always sees themselves as 'player')
 *   - Handles command submission + engine resolution + state commit
 *
 * Turn model (N-A style alternating):
 *   First player submits → resolveTeamTurn + transitionToSecondPlayer → commit
 *   Second player submits → resolveTeamTurn + endRound → commit
 *   Both clients see every state change via Realtime.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  endRoundTimeline,
  transitionToSecondPlayer,
  getCommandablePlayerUnits,
  createAutoCommands,
  resolveTeamTurnTimeline,
} from '@/features/battle/engine'
import { PASS_ABILITY_ID } from '@/features/battle/data'
import type {
  BattleState,
  BattleTeamId,
  BattleTimelineStep,
  QueuedBattleAction,
  BattleEvent,
} from '@/features/battle/types'
import {
  commitMatchState,
  fetchMatch,
  getMyRole,
  submitCommandRecord,
  subscribeToMatch,
  claimVictoryDueToDisconnect,
} from '@/features/multiplayer/client'
import type { MatchRow, MultiplayerResolutionReplay, MultiplayerRole, MultiplayerStatus } from '@/features/multiplayer/types'
import { roleToTeam } from '@/features/multiplayer/types'

// ── Perspective helpers ───────────────────────────────────────────────────────

/**
 * Swap a BattleState so the calling player always sees themselves as 'player'.
 * Used for Player B, whose canonical team is 'enemy'.
 */
function swapPerspective(state: BattleState): BattleState {
  return {
    ...state,
    firstPlayer:  state.firstPlayer  === 'player' ? 'enemy' : 'player',
    activePlayer: state.activePlayer === 'player' ? 'enemy' : 'player',
    playerTeam:   state.enemyTeam.map((f) => ({ ...f, team: 'player' as const })),
    enemyTeam:    state.playerTeam.map((f) => ({ ...f, team: 'enemy'  as const })),
    playerEnergy: state.enemyEnergy,
    enemyEnergy:  state.playerEnergy,
    playerTeamModifiers:    state.enemyTeamModifiers,
    enemyTeamModifiers:     state.playerTeamModifiers,
    winner: state.winner === null
      ? null
      : state.winner === 'player' ? 'enemy' : 'player',
  }
}

function flipTeam(team: BattleTeamId): BattleTeamId {
  return team === 'player' ? 'enemy' : 'player'
}

/**
 * Swap command team fields from local ('player') perspective back to canonical.
 * Instance IDs stay the same — only the 'team' tag on each action is flipped.
 */
function swapCommandPerspective(
  commands: Record<string, QueuedBattleAction>,
): Record<string, QueuedBattleAction> {
  return Object.fromEntries(
    Object.entries(commands).map(([id, cmd]) => [
      id,
      { ...cmd, team: (cmd.team === 'player' ? 'enemy' : 'player') as BattleTeamId },
    ]),
  )
}

/** Convert a canonical MatchRow into the local-perspective BattleState. */
function localState(canonical: BattleState, role: MultiplayerRole): BattleState {
  return role === 'b' ? swapPerspective(canonical) : canonical
}

function localizeTimelineSteps(steps: BattleTimelineStep[], role: MultiplayerRole): BattleTimelineStep[] {
  if (role !== 'b') return steps

  return steps.map((step) => ({
    ...step,
    state: swapPerspective(step.state),
    team: step.team ? flipTeam(step.team) : undefined,
  }))
}

/** True when the calling player's command phase is active. */
function calcIsMyTurn(canonical: BattleState, myTeam: BattleTeamId): boolean {
  return (
    (canonical.phase === 'firstPlayerCommand' || canonical.phase === 'secondPlayerCommand') &&
    canonical.activePlayer === myTeam
  )
}

// ── Auto-pass helpers ─────────────────────────────────────────────────────────

function buildPassCommands(
  state: BattleState,
  team: BattleTeamId,
): Record<string, QueuedBattleAction> {
  const fighters = getCommandablePlayerUnits({ ...state, activePlayer: team } as BattleState)
  return Object.fromEntries(
    fighters.map((f) => [
      f.instanceId,
      { actorId: f.instanceId, team, abilityId: PASS_ABILITY_ID, targetId: null },
    ]),
  )
}

// ── Hook return type ──────────────────────────────────────────────────────────

export type MultiplayerMatchHandle = {
  /** BattleState from this player's perspective (always 'player' = you). */
  battleState: BattleState
  /** Queued actions in local perspective for UI display. */
  autoCommands: Record<string, QueuedBattleAction>
  isMyTurn: boolean
  myRole: MultiplayerRole
  opponentDisplayName: string
  status: MultiplayerStatus
  error: string | null
  /** Raw match row — useful for reading mode, team lists, etc. on match end. */
  matchRow: MatchRow | null
  latestResolution: MultiplayerResolutionReplay | null
  /**
   * Unix timestamp (ms) of the last incoming Realtime update from the opponent.
   * Used to detect disconnects: if this is >90s old and it's opponent's turn,
   * the opponent may have left the match.
   */
  lastOpponentActionAt: number
  /** Claim victory because the opponent has not responded — marks match abandoned. */
  claimVictory: () => Promise<void>
  /**
   * Submit commands and run engine resolution.
   * Commands should be in LOCAL perspective (you = 'player').
   * The hook re-maps them to canonical before committing.
   * actionOrder is the player-chosen execution sequence (local actorIds).
   */
  submitCommands: (
    localCommands: Record<string, QueuedBattleAction>,
    preludeEvents?: BattleEvent[],
    actionOrder?: string[],
  ) => Promise<{ events: BattleEvent[] }>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMultiplayerMatch(
  matchId: string | null,
  currentUserId: string | null,
): MultiplayerMatchHandle | null {
  // Canonical state (a=player, b=enemy) — source of truth
  const canonicalRef            = useRef<BattleState | null>(null)
  const roleRef                 = useRef<MultiplayerRole | null>(null)
  const matchRowRef             = useRef<MatchRow | null>(null)
  // Tracks when we last received an incoming Realtime update (not our own commit)
  const lastOpponentActionAtRef = useRef<number>(0)
  const lastSeenResolutionIdRef = useRef<string | null>(null)
  const lastLocalResolutionIdRef = useRef<string | null>(null)

  const [canonical, setCanonical]             = useState<BattleState | null>(null)
  const [matchRow, setMatchRow]               = useState<MatchRow | null>(null)
  const [role, setRole]                       = useState<MultiplayerRole | null>(null)
  const [opponentName, setOpponentName]       = useState('')
  const [status, setStatus]                   = useState<MultiplayerStatus>('loading')
  const [error, setError]                     = useState<string | null>(null)
  const [lastOpponentActionAt, setLastOpponentActionAt] = useState<number>(0)
  const [latestResolution, setLatestResolution] = useState<MultiplayerResolutionReplay | null>(null)

  // Keep refs in sync so callbacks don't close over stale state
  useEffect(() => { canonicalRef.current = canonical },  [canonical])
  useEffect(() => { roleRef.current      = role },       [role])

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!matchId || !currentUserId) return

    let cancelled = false

    fetchMatch(matchId).then(({ data, error: fetchErr }) => {
      if (cancelled) return
      if (fetchErr || !data) {
        setError(fetchErr ?? 'Match not found')
        setStatus('error')
        return
      }

      const myRole = getMyRole(data, currentUserId)
      if (!myRole) {
        setError('You are not a participant in this match')
        setStatus('error')
        return
      }

      matchRowRef.current = data
      setMatchRow(data)
      roleRef.current     = myRole
      lastSeenResolutionIdRef.current = data.resolution_id ?? null
      lastOpponentActionAtRef.current = Date.now()
      setLastOpponentActionAt(lastOpponentActionAtRef.current)

      const opponent = myRole === 'a' ? data.player_b_display_name : data.player_a_display_name
      setOpponentName(opponent || 'Opponent')
      setRole(myRole)

      if (data.status === 'waiting' || !data.battle_state) {
        setStatus('waiting_for_opponent')
        return
      }

      const canon = data.battle_state
      canonicalRef.current = canon
      setCanonical(canon)

      const myTeam = roleToTeam(myRole)
      setStatus(calcIsMyTurn(canon, myTeam) ? 'my_turn' : 'opponent_turn')
    })

    return () => { cancelled = true }
  }, [matchId, currentUserId])

  // ── Realtime subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!matchId || !currentUserId) return

    const unsubscribe = subscribeToMatch(matchId, (updatedRow) => {
      const myRole = roleRef.current
      if (!myRole) return

      // Stamp when we last heard from the other side (used for disconnect detection)
      lastOpponentActionAtRef.current = Date.now()
      setLastOpponentActionAt(Date.now())

      matchRowRef.current = updatedRow
      setMatchRow(updatedRow)

      // Update opponent name if player_b just joined
      const opponent = myRole === 'a' ? updatedRow.player_b_display_name : updatedRow.player_a_display_name
      if (opponent) setOpponentName(opponent)

      if (updatedRow.status === 'waiting' || !updatedRow.battle_state) {
        setStatus('waiting_for_opponent')
        return
      }

      const canon = updatedRow.battle_state
      canonicalRef.current = canon
      setCanonical(canon)

      if (
        updatedRow.resolution_id &&
        updatedRow.resolution_steps &&
        updatedRow.resolution_id !== lastSeenResolutionIdRef.current
      ) {
        lastSeenResolutionIdRef.current = updatedRow.resolution_id
        setLatestResolution({
          id: updatedRow.resolution_id,
          steps: localizeTimelineSteps(updatedRow.resolution_steps, myRole),
          source: updatedRow.resolution_id === lastLocalResolutionIdRef.current ? 'local' : 'remote',
        })
      }

      if (canon.phase === 'finished') {
        setStatus('finished')
        return
      }

      const myTeam = roleToTeam(myRole)
      setStatus(calcIsMyTurn(canon, myTeam) ? 'my_turn' : 'opponent_turn')
    })

    return unsubscribe
  }, [matchId, currentUserId])

  // ── Command submission ──────────────────────────────────────────────────────
  const submitCommands = useCallback(
    async (
      localCommands: Record<string, QueuedBattleAction>,
      _preludeEvents?: BattleEvent[],
      actionOrder?: string[],
    ): Promise<{ events: BattleEvent[] }> => {
      const canon  = canonicalRef.current
      const myRole = roleRef.current

      if (!canon || !myRole || !matchId || !currentUserId) {
        return { events: [] }
      }

      const myTeam: BattleTeamId = roleToTeam(myRole)
      const isFirstPhase = canon.phase === 'firstPlayerCommand'
      const commandPhase = isFirstPhase ? 'firstPlayerCommand' : 'secondPlayerCommand'
      const resolutionId = `${matchId}:${canon.round}:${commandPhase}:${Date.now()}`

      // Re-map local ('player') commands to canonical perspective for Player B
      const canonicalCommands =
        myRole === 'b' ? swapCommandPerspective(localCommands) : localCommands

      // Persist raw commands (audit trail / desync detection)
      await submitCommandRecord({
        matchId,
        playerId: currentUserId,
        round: canon.round,
        phase: commandPhase,
        commands: canonicalCommands,
      })

      // ── Engine resolution ─────────────────────────────────────────────────
      const allEvents: BattleEvent[] = []
      const resolutionSteps: BattleTimelineStep[] = []

      if (_preludeEvents && _preludeEvents.length > 0) {
        allEvents.push(..._preludeEvents)
        resolutionSteps.push({
          id: `timeline-system-${resolutionId}`,
          kind: 'system',
          round: canon.round,
          state: canon,
          events: _preludeEvents,
          runtimeEvents: [],
          team: myTeam,
        })
      }

      // 1. Resolve this player's turn, respecting player-chosen action order
      const turnTimeline = resolveTeamTurnTimeline(canon, canonicalCommands, myTeam, actionOrder)
      allEvents.push(...turnTimeline.steps.flatMap((step) => step.events))
      resolutionSteps.push(...turnTimeline.steps)
      let nextState = turnTimeline.state

      if (nextState.phase === 'finished') {
        await commitMatchState({
          matchId,
          newState: nextState,
          resolutionId,
          resolutionSteps,
        })
        lastLocalResolutionIdRef.current = resolutionId
        lastSeenResolutionIdRef.current = resolutionId
        setCanonical(nextState)
        setLatestResolution({
          id: resolutionId,
          steps: localizeTimelineSteps(resolutionSteps, myRole),
          source: 'local',
        })
        setStatus('finished')
        return { events: allEvents }
      }

      if (isFirstPhase) {
        // First player done → transition to second player's command phase
        nextState = transitionToSecondPlayer(nextState)
      } else {
        // Second player done → close the round (ticks statuses, fatigue, begins new round)
        const roundTimeline = endRoundTimeline(nextState)
        allEvents.push(...roundTimeline.steps.flatMap((step) => step.events))
        resolutionSteps.push(...roundTimeline.steps)
        nextState = roundTimeline.state
      }

      // ── Commit to DB (Realtime broadcasts to opponent) ────────────────────
      await commitMatchState({
        matchId,
        newState: nextState,
        resolutionId,
        resolutionSteps,
      })
      lastLocalResolutionIdRef.current = resolutionId
      lastSeenResolutionIdRef.current = resolutionId

      // Optimistic local update so this client doesn't wait for its own Realtime echo
      canonicalRef.current = nextState
      setCanonical(nextState)
      setLatestResolution({
        id: resolutionId,
        steps: localizeTimelineSteps(resolutionSteps, myRole),
        source: 'local',
      })

      if (nextState.phase === 'finished') {
        setStatus('finished')
      } else {
        const myTeamNext = roleToTeam(myRole)
        setStatus(calcIsMyTurn(nextState, myTeamNext) ? 'my_turn' : 'opponent_turn')
      }

      return { events: allEvents }
    },
    [matchId, currentUserId],
  )

  // ── Claim victory (opponent disconnected) ────────────────────────────────
  const claimVictory = useCallback(async () => {
    const myRole = roleRef.current
    if (!myRole || !matchId) return
    await claimVictoryDueToDisconnect(matchId, myRole)
  }, [matchId])

  // ── Assemble return value ───────────────────────────────────────────────────
  if (!matchId || !currentUserId || !canonical || !role) {
    // Not ready or not in online mode
    return null
  }

  const myTeam = roleToTeam(role)
  const local = localState(canonical, role)
  const isMy = calcIsMyTurn(canonical, myTeam)

  return {
    battleState:          local,
    autoCommands:         createAutoCommands(local),
    isMyTurn:             isMy,
    myRole:               role,
    opponentDisplayName:  opponentName,
    status,
    error,
    matchRow,
    latestResolution,
    lastOpponentActionAt,
    claimVictory,
    submitCommands,
  }
}

// ── Utility: build a pass-all command set for timeout ────────────────────────
export function buildTimeoutCommands(
  localState: BattleState,
): Record<string, QueuedBattleAction> {
  // Pass for every commandable unit on the local player's team
  return buildPassCommands(localState, 'player')
}
