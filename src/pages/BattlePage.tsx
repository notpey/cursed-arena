import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { battleEnergyOrder, canExchangeEnergy, exchangeEnergy, type BattleEnergyType } from '@/features/battle/energy'
import homeBgBase from '@/assets/backgrounds/home-bg-base.webp'
import { BattleBoard } from '@/components/battle/BattleBoard'
import { BattleInfoPanel } from '@/components/battle/BattleInfoPanel'
import { NarutoQueueCommitModal } from '@/components/battle/NarutoQueueCommitModal'
import { BattleTopBar } from '@/components/battle/BattleTopBar'
import { battleBoardProfiles, PASS_ABILITY_ID } from '@/features/battle/data'
import {
  getModeLabel,
  readBattleProfileStats,
  readStagedBattleSession,
  recordCompletedBattle,
  recordOnlineCompletedBattle,
  type LastBattleResult,
} from '@/features/battle/matches'
import { settleMatchLp } from '@/features/ranking/client'
import { saveMatchHistory } from '@/features/multiplayer/client'
import { readStagedBattleLaunch } from '@/features/battle/prep'
import { usePlayerState } from '@/features/player/store'
import { useAuth } from '@/features/auth/useAuth'
import {
  buildEnemyCommands,
  canQueueAbility,
  createAutoCommands,
  createInitialBattleState,
  getAbilityById,
  getCommandablePlayerUnits,
  getFighterById,
  getQueueAbilityBlockReason,
  getValidTargetIds,
  isAlive,
  resolveTeamTurn,
  resolveTeamTurnTimeline,
  endRoundTimeline,
  transitionToSecondPlayer,
} from '@/features/battle/engine'
import type {
  BattleEvent,
  BattleRuntimeEvent,
  BattleState,
  BattleTimelineStep,
  QueuedBattleAction,
} from '@/features/battle/types'
import {
  useMultiplayerMatch,
  buildTimeoutCommands,
} from '@/features/multiplayer/useMultiplayerMatch'

type BattleViewState = {
  state: BattleState
  queued: Record<string, QueuedBattleAction>
  /** Player-chosen execution order (array of actorIds). Defaults to slot order. */
  actionOrder: string[]
  selectedActorId: string | null
}

type HoveredAbilityState = {
  actorId: string
  abilityId: string
}

type BattleTimelineFocus = {
  actorId?: string
  targetId?: string
  label: string
  tone: 'red' | 'teal' | 'gold' | 'frost'
}

type RandomAllocation = Record<string, Partial<Record<BattleEnergyType, number>>>

const timelineStepDelayMs = 360
const timelineSystemDelayMs = 240
const timelineRoundDelayMs = 300
const timelineEventPriority: BattleRuntimeEvent['type'][] = [
  'fighter_defeated',
  'damage_applied',
  'heal_applied',
  'status_applied',
  'modifier_applied',
  'modifier_removed',
  'resource_changed',
  'ability_used',
  'round_ended',
  'round_started',
]

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function getTimelineStepDelay(step: BattleTimelineStep) {
  if (step.kind === 'action') return timelineStepDelayMs
  if (step.kind === 'roundStart' || step.kind === 'roundEnd') return timelineRoundDelayMs
  return timelineSystemDelayMs
}

function createTimelineFocus(step: BattleTimelineStep): BattleTimelineFocus | null {
  const runtime = timelineEventPriority
    .map((type) => step.runtimeEvents.find((event) => event.type === type))
    .find(Boolean)

  if (runtime) {
    switch (runtime.type) {
      case 'damage_applied':
        return {
          actorId: runtime.actorId ?? (runtime.packet?.kind === 'damage' ? runtime.packet.sourceActorId : undefined),
          targetId: runtime.targetId,
          label: `${runtime.amount ?? (runtime.packet?.kind === 'damage' ? runtime.packet.amount : 0)} DAMAGE`,
          tone: 'red',
        }
      case 'heal_applied':
        return {
          actorId: runtime.actorId ?? (runtime.packet?.kind === 'heal' ? runtime.packet.sourceActorId : undefined),
          targetId: runtime.targetId,
          label: `${runtime.amount ?? (runtime.packet?.kind === 'heal' ? runtime.packet.amount : 0)} HEAL`,
          tone: 'teal',
        }
      case 'fighter_defeated':
        return {
          actorId: runtime.actorId,
          targetId: runtime.targetId,
          label: 'FIGHTER DEFEATED',
          tone: 'red',
        }
      case 'status_applied':
      case 'modifier_applied':
        return {
          actorId: runtime.actorId,
          targetId: runtime.targetId,
          label: String(runtime.meta?.status ?? 'STATUS').replace(/_/g, ' ').toUpperCase(),
          tone: runtime.tags?.includes('burn') || runtime.tags?.includes('mark') ? 'red' : 'gold',
        }
      case 'modifier_removed':
        return {
          actorId: runtime.actorId,
          targetId: runtime.targetId,
          label: 'STATUS CLEARED',
          tone: 'frost',
        }
      case 'resource_changed':
        return {
          actorId: runtime.actorId,
          targetId: runtime.targetId,
          label: runtime.packet?.kind === 'resource' && runtime.packet.mode === 'spend' ? 'ENERGY SPENT' : 'ENERGY SHIFT',
          tone: 'gold',
        }
      case 'ability_used':
        return {
          actorId: runtime.actorId,
          targetId: runtime.targetId,
          label: 'TECHNIQUE RELEASED',
          tone: runtime.team === 'enemy' ? 'red' : 'teal',
        }
      case 'round_ended':
        return {
          label: 'ROUND END',
          tone: 'frost',
        }
      case 'round_started':
        return {
          label: `ROUND ${step.state.round}`,
          tone: 'frost',
        }
      default:
        break
    }
  }

  const lastEvent = step.events[step.events.length - 1]
  if (!lastEvent) return null

  return {
    actorId: lastEvent.actorId,
    targetId: lastEvent.targetId,
    label: lastEvent.message.toUpperCase(),
    tone: lastEvent.tone,
  }
}

function getNextActorId(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
  preferredActorId?: string | null,
) {
  if (preferredActorId) {
    const preferred = getFighterById(state, preferredActorId)
    if (preferred && isAlive(preferred) && !queued[preferred.instanceId]) {
      return preferred.instanceId
    }
  }

  return getCommandablePlayerUnits(state).find((fighter) => !queued[fighter.instanceId])?.instanceId ?? null
}

function createNewBattle(): { viewState: BattleViewState; initialEvents: BattleEvent[] } {
  let state = createInitialBattleState(readStagedBattleLaunch())
  const initialEvents: BattleEvent[] = []
  const sessionAiEnabled = readStagedBattleSession()?.practiceOptions?.aiEnabled ?? true

  if (state.firstPlayer === 'enemy' && sessionAiEnabled) {
    const enemyCommands = buildEnemyCommands(state)
    const result = resolveTeamTurn(state, enemyCommands, 'enemy')
    state = result.state
    initialEvents.push(...result.events)

    if (state.phase !== 'finished') {
      state = transitionToSecondPlayer(state)
    }
  } else if (state.firstPlayer === 'enemy') {
    state = transitionToSecondPlayer(state)
  }

  const queued = createAutoCommands(state)
  return {
    viewState: {
      state,
      queued,
      actionOrder: getCommandablePlayerUnits(state).map((f) => f.instanceId),
      selectedActorId: getNextActorId(state, queued),
    },
    initialEvents,
  }
}

function hasCommittedPlayerAction(command?: QueuedBattleAction) {
  return Boolean(command?.team === 'player' && command.abilityId !== PASS_ABILITY_ID)
}

function countCommittedPlayerActions(queued: Record<string, QueuedBattleAction>) {
  return Object.values(queued).filter((command) => hasCommittedPlayerAction(command)).length
}

function buildTimeoutQueuedActions(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
): Record<string, QueuedBattleAction> {
  const timeoutCommands = buildTimeoutCommands(state)
  for (const [actorId, command] of Object.entries(queued)) {
    if (!hasCommittedPlayerAction(command)) continue
    timeoutCommands[actorId] = command
  }
  return timeoutCommands
}

function buildCommittedActionOrder(
  actionOrder: string[],
  queued: Record<string, QueuedBattleAction>,
): string[] | undefined {
  const committedActorIds = new Set(
    Object.values(queued)
      .filter((command) => hasCommittedPlayerAction(command))
      .map((command) => command.actorId),
  )

  if (committedActorIds.size === 0) return undefined

  const ordered = actionOrder.filter((actorId) => committedActorIds.has(actorId))
  for (const actorId of committedActorIds) {
    if (!ordered.includes(actorId)) ordered.push(actorId)
  }
  return ordered
}

function applyRandomAllocationToQueuedActions(
  queued: Record<string, QueuedBattleAction>,
  randomAlloc: RandomAllocation,
) {
  return Object.fromEntries(
    Object.entries(queued).map(([actorId, command]) => {
      const { randomCostAllocation: _unused, ...baseCommand } = command
      const allocation = randomAlloc[actorId]
      if (!allocation) return [actorId, baseCommand]

      const normalized = Object.fromEntries(
        battleEnergyOrder
          .map((type) => [type, Math.max(0, Math.floor(allocation[type] ?? 0))] as const)
          .filter((entry) => entry[1] > 0),
      ) as Partial<Record<BattleEnergyType, number>>

      if (Object.keys(normalized).length === 0) {
        return [actorId, baseCommand]
      }

      return [actorId, { ...baseCommand, randomCostAllocation: normalized }]
    }),
  )
}

function createTimeoutEvent(
  round: number,
  {
    committedCount,
    autoPassedCount,
    hadUnconfirmedActions,
  }: {
    committedCount: number
    autoPassedCount: number
    hadUnconfirmedActions: boolean
  },
): BattleEvent {
  let message = 'Turn timer expired. The turn was passed automatically.'

  if (committedCount > 0 && autoPassedCount > 0) {
    message = `Turn timer expired. ${committedCount} queued action${committedCount === 1 ? '' : 's'} locked in; ${autoPassedCount} fighter${autoPassedCount === 1 ? '' : 's'} auto-passed.`
  } else if (committedCount > 0) {
    message = `Turn timer expired. ${committedCount} queued action${committedCount === 1 ? '' : 's'} locked in.`
  } else if (hadUnconfirmedActions) {
    message = 'Turn timer expired. Unconfirmed actions were canceled and the turn was passed.'
  }

  return {
    id: `timeout-${round}-${Date.now()}`,
    round,
    kind: 'system',
    tone: 'red',
    message,
  }
}

function getInitials(value: string) {
  return value
    .split(/\s+|_/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function UtilityRail({
  onSurrender,
}: {
  onSurrender: () => void
}) {
  return (
    <aside className="flex w-[10rem] shrink-0 flex-col gap-1.5 rounded-[0.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,12,26,0.96),rgba(10,8,18,0.98))] p-2 shadow-[0_12px_22px_rgba(0,0,0,0.3)]">
      <button
        type="button"
        onClick={onSurrender}
        className="rounded-[0.15rem] border border-white/15 bg-[rgba(255,255,255,0.08)] px-2.5 py-2 text-left ca-display text-[0.78rem] leading-none text-ca-text transition hover:bg-[rgba(255,255,255,0.14)]"
      >
        SURRENDER
      </button>

      <button
        type="button"
        className="rounded-[0.15rem] border border-white/10 bg-[rgba(255,255,255,0.04)] px-2.5 py-2 text-left ca-display text-[0.72rem] leading-none text-ca-text-2 transition hover:bg-[rgba(255,255,255,0.1)]"
      >
        OPEN CHAT
      </button>

      <div className="rounded-[0.15rem] border border-white/8 bg-black/25 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="ca-mono-label text-[0.52rem] text-ca-text-3">SOUND</span>
          <div className="relative h-1 flex-1 rounded-full bg-white/10">
            <div className="absolute left-0 top-0 h-full w-[58%] rounded-full bg-white/50" />
          </div>
        </div>
      </div>
    </aside>
  )
}
export function BattlePage() {
  const navigate = useNavigate()
  const { profile } = usePlayerState()
  const { user } = useAuth()
  const { matchId } = useParams<{ matchId?: string }>()
  const currentUserId = user?.id ?? null

  // ── Multiplayer hook (null when playing vs AI) ──────────────────────────
  const multiplayer = useMultiplayerMatch(matchId ?? null, currentUserId)

  const [stagedSession] = useState(() => readStagedBattleSession())
  const practiceOptions = stagedSession?.practiceOptions ?? null
  const aiEnabled = practiceOptions ? practiceOptions.aiEnabled : true
  const [initialBattle] = useState(createNewBattle)
  const [battle, setBattle] = useState<BattleViewState>(initialBattle.viewState)
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [hoveredAbility, setHoveredAbility] = useState<HoveredAbilityState | null>(null)
  const [, setBattleLog] = useState<BattleEvent[]>(initialBattle.initialEvents)
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(60)
  const [lastRecordedResultId, setLastRecordedResultId] = useState<string | null>(null)
  const [recordedResult, setRecordedResult] = useState<LastBattleResult | null>(null)
  const [queueDialogOpen, setQueueDialogOpen] = useState(false)
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)
  const [timelineLocked, setTimelineLocked] = useState(false)
  const [timelineFocus, setTimelineFocus] = useState<BattleTimelineFocus | null>(null)
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  const timelineRunRef = useRef(0)
  const lastPlayedMultiplayerResolutionRef = useRef<string | null>(null)

  const playerBoardProfile = {
    username: profile.displayName,
    title: profile.title,
    initials: profile.avatarLabel,
    accent: 'teal' as const,
  }
  const enemyBoardProfile = multiplayer
    ? {
        username: multiplayer.opponentDisplayName,
        title: 'Opponent',
        initials: getInitials(multiplayer.opponentDisplayName),
        accent: 'red' as const,
      }
    : stagedSession
      ? {
          username: stagedSession.opponentName,
          title: stagedSession.opponentTitle,
          initials: getInitials(stagedSession.opponentName),
          accent: 'red' as const,
        }
      : battleBoardProfiles.enemy
  const selectedActor = battle.selectedActorId ? getFighterById(battle.state, battle.selectedActorId) : null
  const selectedAbility = selectedActor && selectedAbilityId ? getAbilityById(selectedActor, selectedAbilityId) : null
  const validTargetIds =
    selectedActor && selectedAbilityId
      ? getValidTargetIds(battle.state, selectedActor.instanceId, selectedAbilityId)
      : []
  const commandableUnits = getCommandablePlayerUnits(battle.state)
  const hasPendingTargetSelection = Boolean(selectedAbilityId)
  const commitReady = commandableUnits.length > 0 && !hasPendingTargetSelection && !timelineLocked
  const targetingAllies = selectedAbility?.targetRule === 'ally-single'
  const targetingEnemies = selectedAbility?.targetRule === 'enemy-single'
  const hoveredActor = hoveredAbility ? getFighterById(battle.state, hoveredAbility.actorId) : null
  const fallbackActor = battle.state.playerTeam.find(isAlive) ?? battle.state.playerTeam[0] ?? null
  const inspectedActor = hoveredActor ?? selectedActor ?? fallbackActor
  const inspectedAbility =
    hoveredAbility && hoveredActor ? getAbilityById(hoveredActor, hoveredAbility.abilityId) : selectedAbility
  const turnOrderLabel = battle.state.firstPlayer === 'player' ? '1ST' : '2ND'
  const committedActionCount = countCommittedPlayerActions(battle.queued)
  const hasCommittedActions = committedActionCount > 0
  const timerPressurePrompt =
    turnSecondsLeft <= 10
      ? hasCommittedActions
        ? 'COMMIT TURN NOW'
        : 'QUEUE ACTIONS OR PASS'
      : turnSecondsLeft <= 20
        ? hasCommittedActions
          ? 'LOCK IN ACTION ORDER'
          : 'PLAN YOUR TURN'
        : null
  const multiplayerBattleState = multiplayer?.battleState
  const multiplayerAutoCommands = multiplayer?.autoCommands
  const multiplayerIsMyTurn = multiplayer?.isMyTurn ?? false
  const multiplayerLatestResolution = multiplayer?.latestResolution ?? null
  const topBarPrompt = timelineFocus
    ? timelineFocus.label
    : targetingEnemies
    ? `TARGET ENEMY WITH ${selectedAbility?.name.toUpperCase() ?? 'TECHNIQUE'}`
    : targetingAllies
      ? `TARGET ALLY WITH ${selectedAbility?.name.toUpperCase() ?? 'TECHNIQUE'}`
      : selectedAbility
        ? `${selectedAbility.name.toUpperCase()} READY`
        : timerPressurePrompt
          ? timerPressurePrompt
        : battle.state.firstPlayer === 'enemy'
          ? `RESPONSE TURN (${turnOrderLabel})`
          : `OPENING TURN (${turnOrderLabel})`

  useEffect(() => {
    lastPlayedMultiplayerResolutionRef.current = null
  }, [matchId])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const syncVisibility = () => {
      setIsDocumentVisible(document.visibilityState === 'visible')
    }

    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    window.addEventListener('focus', syncVisibility)
    window.addEventListener('blur', syncVisibility)

    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      window.removeEventListener('focus', syncVisibility)
      window.removeEventListener('blur', syncVisibility)
    }
  }, [])

  // ── Sync multiplayer state → local battle view ──────────────────────────
  useEffect(() => {
    if (!multiplayerBattleState || !multiplayerAutoCommands) return
    if (
      multiplayerLatestResolution &&
      multiplayerLatestResolution.id !== lastPlayedMultiplayerResolutionRef.current
    ) {
      return
    }
    const nextActorId = multiplayerIsMyTurn
      ? getNextActorId(multiplayerBattleState, multiplayerAutoCommands)
      : null

    setBattle({
      state: multiplayerBattleState,
      queued: multiplayerAutoCommands,
      actionOrder: getCommandablePlayerUnits(multiplayerBattleState).map((f) => f.instanceId),
      selectedActorId: nextActorId,
    })
    setSelectedAbilityId(null)
    setSelectedTargetId(null)
  }, [multiplayerAutoCommands, multiplayerBattleState, multiplayerIsMyTurn, multiplayerLatestResolution])

  const playTimelineSteps = useCallback(async (steps: BattleTimelineStep[]) => {
    const runId = ++timelineRunRef.current

    setTimelineLocked(true)
    setTimelineFocus(null)
    clearPendingSelection()
    setHoveredAbility(null)

    // Lock interactions immediately, then resolve board + focus in readable beats.
    setBattle((current) => ({ ...current, queued: {}, selectedActorId: null }))

    for (const step of steps) {
      if (timelineRunRef.current !== runId) {
        return false
      }

      setBattle((current) => ({
        ...current,
        state: step.state,
        queued: {},
        selectedActorId: null,
      }))

      if (step.events.length > 0) {
        setBattleLog((current) => [...current, ...step.events].slice(-36))
      }

      const focus = createTimelineFocus(step)
      setTimelineFocus(focus)
      await wait(getTimelineStepDelay(step))
    }

    if (timelineRunRef.current !== runId) {
      return false
    }

    setTimelineFocus(null)
    return true
  }, [])

  useEffect(() => {
    if (!multiplayer || !multiplayerBattleState || !multiplayerAutoCommands || !multiplayerLatestResolution) return
    if (multiplayerLatestResolution.id === lastPlayedMultiplayerResolutionRef.current) return

    lastPlayedMultiplayerResolutionRef.current = multiplayerLatestResolution.id

    void (async () => {
      const finished = await playTimelineSteps(multiplayerLatestResolution.steps)
      if (!finished) return

      const nextActorId = multiplayerIsMyTurn
        ? getNextActorId(multiplayerBattleState, multiplayerAutoCommands)
        : null

      setBattle({
        state: multiplayerBattleState,
        queued: multiplayerAutoCommands,
        actionOrder: getCommandablePlayerUnits(multiplayerBattleState).map((fighter) => fighter.instanceId),
        selectedActorId: nextActorId,
      })
      setSelectedAbilityId(null)
      setSelectedTargetId(null)
      setTimelineLocked(false)
      setTimelineFocus(null)
    })()
  }, [multiplayer, multiplayerAutoCommands, multiplayerBattleState, multiplayerIsMyTurn, multiplayerLatestResolution, playTimelineSteps])

  const onTurnTimeout = useEffectEvent(() => {
    if (battle.state.phase === 'finished' || timelineLocked || !isDocumentVisible) return
    handleTurnTimeout()
  })

  useEffect(() => {
    setTurnSecondsLeft(60)
  }, [battle.state.round, battle.state.phase, multiplayer?.isMyTurn])

  useEffect(() => {
    if (battle.state.phase === 'finished') return undefined
    if (timelineLocked) return undefined
    if (!isDocumentVisible) return undefined
    // In online mode only tick down when it's our turn
    if (multiplayerBattleState && !multiplayerIsMyTurn) return undefined
    const timer = window.setInterval(() => {
      setTurnSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [battle.state.phase, battle.state.round, isDocumentVisible, multiplayerBattleState, multiplayerIsMyTurn, timelineLocked])

  useEffect(() => {
    if (turnSecondsLeft > 0) return
    onTurnTimeout()
  }, [turnSecondsLeft])

  // ── Opponent disconnect detection ─────────────────────────────────────────
  // If it's opponent's turn in an online match and we haven't received a
  // Realtime update in 90 seconds, they may have left.
  useEffect(() => {
    if (!multiplayer || multiplayerIsMyTurn || battle.state.phase === 'finished' || !isDocumentVisible) {
      setOpponentDisconnected(false)
      return undefined
    }
    const lastUpdate = multiplayer.lastOpponentActionAt
    const check = () => {
      if (Date.now() - lastUpdate > 90_000) {
        setOpponentDisconnected(true)
      }
    }
    check()
    const interval = window.setInterval(check, 5_000)
    return () => window.clearInterval(interval)
  }, [battle.state.phase, isDocumentVisible, multiplayer, multiplayerIsMyTurn, multiplayer?.lastOpponentActionAt])

  useEffect(() => {
    if (battle.state.phase !== 'finished' || !battle.state.winner) return

    const resultId =
      String(battle.state.round) +
      '-' +
      battle.state.winner +
      '-' +
      battle.state.playerTeam.map((fighter) => fighter.templateId).join('-') +
      '-' +
      battle.state.enemyTeam.map((fighter) => fighter.templateId).join('-')

    if (lastRecordedResultId === resultId) return

    // Claim the slot immediately to prevent double-recording across re-renders
    setLastRecordedResultId(resultId)

    if (multiplayer && matchId) {
      // Online match — settle LP on the server then record locally
      const won = battle.state.winner === 'player'
      const playerTeamIds = battle.state.playerTeam.map((f) => f.templateId)
      const enemyTeamIds  = battle.state.enemyTeam.map((f) => f.templateId)
      const mode = multiplayer.matchRow?.mode ?? 'private'

      settleMatchLp(matchId).then(({ data: settle }) => {
        // Compute LP delta from server response; fall back to 0 if non-ranked or error
        let lpDelta = 0
        let lpBefore = readBattleProfileStats().lpCurrent
        if (settle && !settle.error && !settle.already_settled) {
          if (won) {
            lpDelta  = settle.lp_gain ?? 0
            lpBefore = (settle.winner_lp ?? lpBefore) - lpDelta
          } else {
            lpDelta  = -(settle.lp_loss ?? 0)
            lpBefore = (settle.loser_lp ?? lpBefore) - lpDelta
          }
        }

        const result = recordOnlineCompletedBattle({
          won,
          rounds: battle.state.round,
          playerTeamIds,
          enemyTeamIds,
          opponentName: multiplayer.opponentDisplayName,
          mode,
          lpDelta,
          lpBefore,
        })
        setRecordedResult(result)

        // Persist to server-side match history (fire-and-forget)
        if (currentUserId) {
          const historyEntry = result.id
            ? {
                id: result.id,
                result: result.result,
                mode: result.mode,
                opponentName: result.opponentName,
                opponentTitle: result.opponentTitle,
                opponentRankLabel: result.opponentRankLabel ?? null,
                yourTeam: result.yourTeam,
                theirTeam: result.theirTeam,
                timestamp: result.timestamp,
                rounds: result.rounds,
                lpDelta: result.lpDelta,
                rankBefore: result.rankBefore,
                rankAfter: result.rankAfter,
                roomCode: result.roomCode ?? null,
              }
            : null
          if (historyEntry) {
            void saveMatchHistory(currentUserId, historyEntry)
          }
        }
      })
      return
    }

    // Local AI match
    const result = recordCompletedBattle({
      winner: battle.state.winner,
      rounds: battle.state.round,
      playerTeamIds: battle.state.playerTeam.map((fighter) => fighter.templateId),
      enemyTeamIds: battle.state.enemyTeam.map((fighter) => fighter.templateId),
      session: stagedSession,
    })

    setRecordedResult(result)
  }, [battle.state, stagedSession, lastRecordedResultId, multiplayer, matchId, currentUserId])

  function clearPendingSelection() {
    setSelectedAbilityId(null)
    setSelectedTargetId(null)
  }

  function resetSelection(actorId: string | null, queued = battle.queued) {
    const existing = actorId ? queued[actorId] : undefined
    setSelectedAbilityId(hasCommittedPlayerAction(existing) ? existing?.abilityId ?? null : null)
    setSelectedTargetId(existing?.team === 'player' ? existing.targetId ?? null : null)
  }

  function clearQueuedAction(actorId: string) {
    if (timelineLocked) return
    const nextQueued = { ...battle.queued }
    delete nextQueued[actorId]

    setBattle((current) => ({
      ...current,
      queued: nextQueued,
      selectedActorId: actorId,
    }))
    clearPendingSelection()
  }

  function handleSelectActor(actorId: string) {
    if (timelineLocked) return
    const existing = battle.queued[actorId]
    if (hasCommittedPlayerAction(existing)) {
      clearQueuedAction(actorId)
      return
    }

    setBattle((current) => ({ ...current, selectedActorId: actorId }))
    clearPendingSelection()
  }

  function lockAction(command: QueuedBattleAction) {
    const nextQueued = { ...battle.queued, [command.actorId]: command }
    const nextActorId = getNextActorId(battle.state, nextQueued, battle.selectedActorId)
    setBattle((current) => ({
      ...current,
      queued: nextQueued,
      selectedActorId: nextActorId,
    }))
    resetSelection(nextActorId, nextQueued)
  }

  function queuePlayerAbility(actorId: string, abilityId: string, targetId: string | null = null) {
    const actor = getFighterById(battle.state, actorId)
    if (!actor) return
    const ability = getAbilityById(actor, abilityId)
    if (!ability) return

    const command: QueuedBattleAction = {
      actorId: actor.instanceId,
      team: 'player',
      abilityId,
      targetId,
    }

    if (ability.targetRule === 'self') {
      command.targetId = actor.instanceId
    }

    lockAction(command)
  }

  function handleSelectAbility(actorId: string, abilityId: string) {
    if (timelineLocked) return
    const actor = getFighterById(battle.state, actorId)
    if (!actor) return
    const ability = getAbilityById(actor, abilityId)
    if (!ability || !canQueueAbility(battle.state, battle.queued, actor, abilityId)) return

    setBattle((current) => ({ ...current, selectedActorId: actor.instanceId }))

    if (ability.targetRule === 'self') {
      queuePlayerAbility(actor.instanceId, abilityId, actor.instanceId)
      return
    }

    if (ability.targetRule === 'enemy-all' || ability.targetRule === 'ally-all' || ability.targetRule === 'none') {
      queuePlayerAbility(actor.instanceId, abilityId, null)
      return
    }

    const targets = getValidTargetIds(battle.state, actor.instanceId, abilityId)
    setSelectedAbilityId(abilityId)
    setSelectedTargetId(targets[0] ?? null)
  }

  function handleExchangeEnergy(type: BattleEnergyType) {
    if (timelineLocked) return
    setBattle((current) => {
      if (!canExchangeEnergy(current.state.playerEnergy)) {
        return current
      }

      const nextState = {
        ...current.state,
        playerEnergy: exchangeEnergy(current.state.playerEnergy, type),
      }

      const nextQueued = Object.values(current.queued).reduce<Record<string, QueuedBattleAction>>((acc, command) => {
        if (command.team !== 'player' || command.abilityId === PASS_ABILITY_ID) {
          acc[command.actorId] = command
          return acc
        }

        const actor = getFighterById(nextState, command.actorId)
        if (actor && canQueueAbility(nextState, acc, actor, command.abilityId)) {
          acc[command.actorId] = command
        }

        return acc
      }, {})

      return {
        ...current,
        state: nextState,
        queued: nextQueued,
        selectedActorId: getNextActorId(nextState, nextQueued, current.selectedActorId),
      }
    })
    clearPendingSelection()
  }

  async function resolveQueuedRound(
    queuedActions: Record<string, QueuedBattleAction>,
    preludeEvents: BattleEvent[] = [],
    playerActionOrder?: string[],
  ) {
    if (battle.state.phase === 'finished') return

    // ── Online path ───────────────────────────────────────────────────────
    if (multiplayer) {
      await multiplayer.submitCommands(queuedActions, preludeEvents, playerActionOrder)
      clearPendingSelection()
      setHoveredAbility(null)
      return
    }

    // ── Local / AI path ───────────────────────────────────────────────────
    const previousState = battle.state
    let currentState = battle.state
    const timelineSteps: BattleTimelineStep[] = []

    // Phase 1: player turn — respects player-chosen action order
    if (preludeEvents.length > 0) {
      setBattleLog((current) => [...current, ...preludeEvents].slice(-36))
    }

    const playerTimeline = resolveTeamTurnTimeline(currentState, queuedActions, 'player', playerActionOrder)
    currentState = playerTimeline.state
    timelineSteps.push(...playerTimeline.steps)

    clearPendingSelection()
    setHoveredAbility(null)

    // Phase 2: enemy turn + round end
    if (currentState.phase !== 'finished' && previousState.firstPlayer === 'player') {
      currentState = transitionToSecondPlayer(currentState)
      if (aiEnabled) {
        const enemyCommands = buildEnemyCommands(currentState)
        const enemyTimeline = resolveTeamTurnTimeline(currentState, enemyCommands, 'enemy')
        currentState = enemyTimeline.state
        timelineSteps.push(...enemyTimeline.steps)
      }
    }

    if (currentState.phase !== 'finished') {
      const roundTimeline = endRoundTimeline(currentState)
      currentState = roundTimeline.state
      timelineSteps.push(...roundTimeline.steps)
    }

    if (currentState.phase !== 'finished' && currentState.firstPlayer === 'enemy' && aiEnabled) {
      const enemyCommands = buildEnemyCommands(currentState)
      const openingEnemyTimeline = resolveTeamTurnTimeline(currentState, enemyCommands, 'enemy')
      currentState = openingEnemyTimeline.state
      timelineSteps.push(...openingEnemyTimeline.steps)

      if (currentState.phase !== 'finished') {
        currentState = transitionToSecondPlayer(currentState)
      }
    } else if (currentState.phase !== 'finished' && currentState.firstPlayer === 'enemy') {
      currentState = transitionToSecondPlayer(currentState)
    }

    const finishedTimeline = await playTimelineSteps(timelineSteps)
    if (!finishedTimeline) {
      setTimelineLocked(false)
      return
    }

    const nextQueued = createAutoCommands(currentState)
    const nextActorId = getNextActorId(currentState, nextQueued)

    setBattle({
      state: currentState,
      queued: nextQueued,
      actionOrder: getCommandablePlayerUnits(currentState).map((f) => f.instanceId),
      selectedActorId: nextActorId,
    })
    setTimelineLocked(false)
    setTimelineFocus(null)
  }

  function handleTurnTimeout() {
    if (battle.state.phase === 'finished') return

    // In online mode only time out if it's actually our turn
    if (multiplayer && !multiplayer.isMyTurn) return

    const hadUnconfirmedActions = queueDialogOpen || hasPendingTargetSelection
    const timeoutQueued = buildTimeoutQueuedActions(battle.state, battle.queued)
    const committedCount = countCommittedPlayerActions(timeoutQueued)
    const autoPassedCount = Math.max(0, getCommandablePlayerUnits(battle.state).length - committedCount)
    const committedOrder = buildCommittedActionOrder(battle.actionOrder, timeoutQueued)

    setQueueDialogOpen(false)
    resolveQueuedRound(
      timeoutQueued,
      [
        createTimeoutEvent(battle.state.round, {
          committedCount,
          autoPassedCount,
          hadUnconfirmedActions,
        }),
      ],
      committedOrder,
    )
  }

  function resolveCommittedRound() {
    if (!commitReady || battle.state.phase === 'finished') return
    setQueueDialogOpen(true)
  }

  function handleQueueConfirm(finalActionOrder: string[], randomAlloc: RandomAllocation) {
    setQueueDialogOpen(false)
    resolveQueuedRound(applyRandomAllocationToQueuedActions(battle.queued, randomAlloc), [], finalActionOrder)
  }

  function handleTargetFighterClick(fighter: { instanceId: string }) {
    if (timelineLocked) return
    if (!selectedActor || !selectedAbilityId) return
    if (!validTargetIds.includes(fighter.instanceId)) return
    queuePlayerAbility(selectedActor.instanceId, selectedAbilityId, fighter.instanceId)
  }

  function handleSurrender() {
    timelineRunRef.current += 1
    lastPlayedMultiplayerResolutionRef.current = null
    const { viewState, initialEvents } = createNewBattle()
    setBattle(viewState)
    setSelectedAbilityId(null)
    setSelectedTargetId(null)
    setHoveredAbility(null)
    setBattleLog(initialEvents)
    setTurnSecondsLeft(60)
    setRecordedResult(null)
    setLastRecordedResultId(null)
    setTimelineLocked(false)
    setTimelineFocus(null)
  }

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#08090d] text-ca-text">
      <div className="absolute inset-0 bg-cover bg-center opacity-[0.55]" style={{ backgroundImage: `url(${homeBgBase})` }} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,5,8,0.05),rgba(4,5,8,0.4))]" />

      <div className="relative flex h-full w-full flex-col p-2 sm:p-3">
        <div className="flex w-full flex-1 flex-col overflow-y-auto rounded-[0.45rem] border border-white/8 bg-[rgba(8,8,12,0.06)] shadow-[0_20px_56px_rgba(0,0,0,0.28)]">
          <BattleTopBar
            playerProfile={playerBoardProfile}
            enemyProfile={enemyBoardProfile}
            playerEnergy={battle.state.playerEnergy}
            boardPrompt={topBarPrompt}
            turnSecondsLeft={turnSecondsLeft}
            commitReady={commitReady}
            battleFinished={battle.state.phase === 'finished' || timelineLocked}
            onReady={resolveCommittedRound}
            onExchangeEnergy={handleExchangeEnergy}
          />

          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <BattleBoard
              state={battle.state}
              queued={battle.queued}
              selectedActorId={battle.selectedActorId}
              selectedAbility={selectedAbility}
              selectedTargetId={selectedTargetId}
              validTargetIds={validTargetIds}
              targetingAllies={targetingAllies}
              targetingEnemies={targetingEnemies}
              onSelectActor={handleSelectActor}
              onSelectAbility={handleSelectAbility}
              onTargetFighter={handleTargetFighterClick}
              onHoverAbility={(actorId, abilityId) => setHoveredAbility({ actorId, abilityId })}
              onLeaveAbility={() => setHoveredAbility(null)}
              onDequeue={clearQueuedAction}
              canUsePlayerAbility={(fighter, abilityId) => canQueueAbility(battle.state, battle.queued, fighter, abilityId)}
              getPlayerAbilityBlockReason={(fighter, abilityId) => getQueueAbilityBlockReason(battle.state, battle.queued, fighter, abilityId)}
              interactionLocked={timelineLocked}
              timelineFocus={timelineFocus}
            />

            <div className="grid gap-2 lg:grid-cols-[10rem_minmax(0,1fr)]">
              <UtilityRail onSurrender={handleSurrender} />
              <BattleInfoPanel state={battle.state} queued={battle.queued} actor={inspectedActor} ability={inspectedAbility} />
            </div>
          </div>
        </div>

        {multiplayer && multiplayer.status === 'waiting_for_opponent' ? (
          <WaitingForOpponentOverlay />
        ) : null}

        {multiplayer && multiplayer.status === 'error' ? (
          <DisconnectOverlay error={multiplayer.error} onReturnHome={() => navigate('/')} />
        ) : null}

        {opponentDisconnected && multiplayer && battle.state.phase !== 'finished' ? (
          <OpponentDisconnectedOverlay
            opponentName={multiplayer.opponentDisplayName}
            onClaimVictory={async () => {
              await multiplayer.claimVictory()
              setOpponentDisconnected(false)
            }}
            onDismiss={() => setOpponentDisconnected(false)}
          />
        ) : null}

        {queueDialogOpen ? (
          <NarutoQueueCommitModal
            round={battle.state.round}
            state={battle.state}
            queued={battle.queued}
            initialOrder={battle.actionOrder}
            energy={battle.state.playerEnergy}
            turnSecondsLeft={turnSecondsLeft}
            onConfirm={handleQueueConfirm}
            onBack={() => setQueueDialogOpen(false)}
          />
        ) : null}

        {battle.state.phase === 'finished' ? (
          <BattleResultOverlay
            winner={battle.state.winner}
            recordedResult={recordedResult}
            onViewResults={() => navigate('/battle/results')}
            onPlayAgain={() => navigate('/battle/prep')}
            onReturnHome={() => navigate('/')}
          />
        ) : null}
      </div>
    </div>
  )
}

function BattleResultOverlay({
  winner,
  recordedResult,
  onViewResults,
  onPlayAgain,
  onReturnHome,
}: {
  winner: BattleState['winner']
  recordedResult: LastBattleResult | null
  onViewResults: () => void
  onPlayAgain: () => void
  onReturnHome: () => void
}) {
  const win = winner === 'player'

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.72)] backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,26,0.96),rgba(10,10,16,0.98))] p-6 shadow-[0_22px_54px_rgba(0,0,0,0.4)]">
        <p className="ca-mono-label text-[0.52rem] text-ca-text-3">Match Concluded</p>
        <h2 className={['ca-display mt-3 text-5xl', win ? 'text-ca-teal' : 'text-ca-red'].join(' ')}>{win ? 'Victory' : 'Defeat'}</h2>
        <p className="mt-3 text-sm text-ca-text-2">
          {recordedResult ? getModeLabel(recordedResult.mode) + ' vs ' + recordedResult.opponentName : 'Battle result recorded.'}
        </p>
        {recordedResult ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.42rem] text-ca-text-2">
              ROUNDS {recordedResult.rounds}
            </span>
            {recordedResult.mode === 'ranked' ? (
              <span className={[
                'ca-mono-label rounded-md border px-2 py-1 text-[0.42rem]',
                recordedResult.lpDelta >= 0 ? 'border-ca-teal/20 bg-ca-teal-wash text-ca-teal' : 'border-ca-red/20 bg-ca-red-wash text-ca-red',
              ].join(' ')}>
                LP {recordedResult.lpDelta >= 0 ? '+' + recordedResult.lpDelta : recordedResult.lpDelta}
              </span>
            ) : null}
            <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.42rem] text-ca-text-3">
              STREAK {recordedResult.profileSnapshot.currentStreak}
            </span>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onViewResults}
            className="ca-display rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] px-4 py-2 text-[1.1rem] text-white"
          >
            View Results
          </button>
          <button
            type="button"
            onClick={onPlayAgain}
            className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] px-4 py-2 text-[1.1rem] text-ca-text"
          >
            Play Again
          </button>
          <button
            type="button"
            onClick={onReturnHome}
            className="ca-display rounded-lg border border-white/8 bg-transparent px-4 py-2 text-[1.1rem] text-ca-text-3 hover:text-ca-text"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  )
}

function DisconnectOverlay({
  error,
  onReturnHome,
}: {
  error: string | null
  onReturnHome: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.82)] backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,26,0.96),rgba(10,10,16,0.98))] p-6 text-center shadow-[0_22px_54px_rgba(0,0,0,0.4)]">
        <p className="ca-mono-label text-[0.52rem] text-ca-text-3">CONNECTION LOST</p>
        <h2 className="ca-display mt-3 text-4xl text-ca-red">Disconnected</h2>
        <p className="mt-3 text-sm text-ca-text-2">
          {error ?? 'The connection to your opponent was interrupted.'}
        </p>
        <button
          type="button"
          onClick={onReturnHome}
          className="mt-6 ca-display rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] px-6 py-2.5 text-[1.1rem] text-white"
        >
          Return Home
        </button>
      </div>
    </div>
  )
}

function WaitingForOpponentOverlay() {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.8)] backdrop-blur-sm">
      <div className="rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,26,0.96),rgba(10,10,16,0.98))] px-10 py-8 shadow-[0_22px_54px_rgba(0,0,0,0.4)] text-center">
        <p className="ca-mono-label text-[0.52rem] text-ca-text-3 mb-3">PRIVATE MATCH</p>
        <h2 className="ca-display text-3xl text-ca-teal mb-2">Waiting for Opponent</h2>
        <p className="text-sm text-ca-text-2">Share your room code with a friend to begin.</p>
      </div>
    </div>
  )
}

function OpponentDisconnectedOverlay({
  opponentName,
  onClaimVictory,
  onDismiss,
}: {
  opponentName: string
  onClaimVictory: () => void
  onDismiss: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.72)] backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[14px] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(22,18,10,0.97),rgba(12,10,8,0.98))] p-6 shadow-[0_22px_54px_rgba(0,0,0,0.4)] text-center">
        <p className="ca-mono-label text-[0.52rem] text-amber-300/60">CONNECTION</p>
        <h2 className="ca-display mt-3 text-2xl text-amber-300">Opponent May Have Left</h2>
        <p className="mt-2 text-sm text-ca-text-2">
          No response from <span className="text-ca-text">{opponentName}</span> for over 90 seconds.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClaimVictory}
            className="ca-display w-full rounded-lg border border-ca-teal/35 bg-[linear-gradient(180deg,rgba(5,216,189,0.18),rgba(5,216,189,0.08))] px-4 py-2.5 text-[1rem] text-ca-teal"
          >
            Claim Victory
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="ca-display w-full rounded-lg border border-white/8 bg-transparent px-4 py-2 text-[0.9rem] text-ca-text-3"
          >
            Keep Waiting
          </button>
        </div>
      </div>
    </div>
  )
}
