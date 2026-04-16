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
  resolveTeamTurn,
  transitionToSecondPlayer,
  endRound,
  getCommandablePlayerUnits,
  createAutoCommands,
} from '@/features/battle/engine'
import { PASS_ABILITY_ID } from '@/features/battle/data'
import type {
  BattleState,
  BattleTeamId,
  QueuedBattleAction,
  BattleEvent,
} from '@/features/battle/types'
import {
  commitMatchState,
  fetchMatch,
  getMyRole,
  submitCommandRecord,
  subscribeToMatch,
} from '@/features/multiplayer/client'
import type { MatchRow, MultiplayerRole, MultiplayerStatus } from '@/features/multiplayer/types'
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
  const canonicalRef = useRef<BattleState | null>(null)
  const roleRef      = useRef<MultiplayerRole | null>(null)
  const matchRowRef  = useRef<MatchRow | null>(null)

  const [canonical, setCanonical]       = useState<BattleState | null>(null)
  const [matchRow, setMatchRow]         = useState<MatchRow | null>(null)
  const [role, setRole]                 = useState<MultiplayerRole | null>(null)
  const [opponentName, setOpponentName] = useState('')
  const [status, setStatus]             = useState<MultiplayerStatus>('loading')
  const [error, setError]               = useState<string | null>(null)

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

      // Re-map local ('player') commands to canonical perspective for Player B
      const canonicalCommands =
        myRole === 'b' ? swapCommandPerspective(localCommands) : localCommands

      // Persist raw commands (audit trail / desync detection)
      const commandPhase = isFirstPhase ? 'firstPlayerCommand' : 'secondPlayerCommand'
      await submitCommandRecord({
        matchId,
        playerId: currentUserId,
        round: canon.round,
        phase: commandPhase,
        commands: canonicalCommands,
      })

      // ── Engine resolution ─────────────────────────────────────────────────
      const allEvents: BattleEvent[] = []

      // 1. Resolve this player's turn, respecting player-chosen action order
      const turnResult = resolveTeamTurn(canon, canonicalCommands, myTeam, actionOrder)
      allEvents.push(...turnResult.events)
      let nextState = turnResult.state

      if (nextState.phase === 'finished') {
        await commitMatchState({ matchId, newState: nextState })
        setCanonical(nextState)
        setStatus('finished')
        return { events: allEvents }
      }

      if (isFirstPhase) {
        // First player done → transition to second player's command phase
        nextState = transitionToSecondPlayer(nextState)
      } else {
        // Second player done → close the round (ticks statuses, fatigue, begins new round)
        const roundResult = endRound(nextState)
        allEvents.push(...roundResult.events)
        nextState = roundResult.state
      }

      // ── Commit to DB (Realtime broadcasts to opponent) ────────────────────
      await commitMatchState({ matchId, newState: nextState })

      // Optimistic local update so this client doesn't wait for its own Realtime echo
      canonicalRef.current = nextState
      setCanonical(nextState)

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
