import { useEffect, useEffectEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCommandSummary } from '@/components/battle/battleDisplay'
import { getStatusDuration, hasStatus } from '@/features/battle/statuses'
import { setEnergyFocus, getAbilityEnergyCost, countEnergyCost, type BattleEnergyType } from '@/features/battle/energy'
import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import homeBgBase from '@/assets/backgrounds/home-bg-base.webp'
import { BattleBoard } from '@/components/battle/BattleBoard'
import { BattleInfoPanel } from '@/components/battle/BattleInfoPanel'
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
import { readStagedBattleLaunch } from '@/features/battle/prep'
import { usePlayerState } from '@/features/player/store'
import { useAuth } from '@/features/auth/useAuth'
import {
  buildEnemyCommands,
  canQueueAbility,
  createAutoCommands,
  createInitialBattleState,
  endRound,
  getAbilityById,
  getCommandablePlayerUnits,
  getFighterById,
  getValidTargetIds,
  isAlive,
  resolveTeamTurn,
  transitionToSecondPlayer,
} from '@/features/battle/engine'
import type { BattleEvent, BattleFighterState, BattleState, QueuedBattleAction } from '@/features/battle/types'
import type { BattleEnergyPool } from '@/features/battle/energy'
import {
  useMultiplayerMatch,
  buildTimeoutCommands,
} from '@/features/multiplayer/useMultiplayerMatch'

type BattleViewState = {
  state: BattleState
  queued: Record<string, QueuedBattleAction>
  selectedActorId: string | null
}

type HoveredAbilityState = {
  actorId: string
  abilityId: string
}

type CarryoverHighlightMap = Record<string, string[]>

type RoundTransitionState = {
  key: string
  round: number
  title: string
  subtitle: string
  badges: string[]
  tone: 'teal' | 'red' | 'gold'
  highlights: CarryoverHighlightMap
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

  if (state.firstPlayer === 'enemy') {
    const enemyCommands = buildEnemyCommands(state)
    const result = resolveTeamTurn(state, enemyCommands, 'enemy')
    state = result.state
    initialEvents.push(...result.events)

    if (state.phase !== 'finished') {
      state = transitionToSecondPlayer(state)
    }
  }

  const queued = createAutoCommands(state)
  return {
    viewState: {
      state,
      queued,
      selectedActorId: getNextActorId(state, queued),
    },
    initialEvents,
  }
}

function hasCommittedPlayerAction(command?: QueuedBattleAction) {
  return Boolean(command?.team === 'player' && command.abilityId !== PASS_ABILITY_ID)
}

function buildTimedOutQueuedActions(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
) {
  return getCommandablePlayerUnits(state).reduce<Record<string, QueuedBattleAction>>((acc, fighter) => {
    acc[fighter.instanceId] =
      queued[fighter.instanceId] ?? {
        actorId: fighter.instanceId,
        team: 'player',
        abilityId: PASS_ABILITY_ID,
        targetId: null,
      }

    return acc
  }, { ...queued })
}

function createTimeoutEvent(round: number, autoPassedCount: number): BattleEvent {
  const message =
    autoPassedCount > 0
      ? `Turn timer expired. ${autoPassedCount} unresolved action${autoPassedCount === 1 ? ' was' : 's were'} auto-passed.`
      : 'Turn timer expired. Queued actions locked automatically.'

  return {
    id: `timeout-${round}-${Date.now()}`,
    round,
    kind: 'system',
    tone: 'red',
    message,
  }
}

function getFighterLabel(previousState: BattleState, nextState: BattleState, fighterId?: string) {
  if (!fighterId) return null
  return getFighterById(nextState, fighterId)?.shortName ?? getFighterById(previousState, fighterId)?.shortName ?? null
}

function pushHighlight(labels: string[], label: string) {
  if (!labels.includes(label)) labels.push(label)
}

function buildCarryoverHighlights(previousState: BattleState, nextState: BattleState): CarryoverHighlightMap {
  const highlights: CarryoverHighlightMap = {}
  const nextFighters = nextState.playerTeam.concat(nextState.enemyTeam)

  nextFighters.forEach((fighter) => {
    const previous = getFighterById(previousState, fighter.instanceId)
    if (!previous) return

    const labels: string[] = []

    if (fighter.hp > previous.hp) {
      pushHighlight(labels, `+${fighter.hp - previous.hp} HP`)
    }

    if (hasStatus(fighter.statuses, 'stun') && getStatusDuration(fighter.statuses, 'stun') !== getStatusDuration(previous.statuses, 'stun')) {
      pushHighlight(labels, 'STUNNED')
    }

    if (hasStatus(fighter.statuses, 'invincible') && getStatusDuration(fighter.statuses, 'invincible') !== getStatusDuration(previous.statuses, 'invincible')) {
      pushHighlight(labels, 'VOID')
    }

    if (hasStatus(fighter.statuses, 'attackUp') && getStatusDuration(fighter.statuses, 'attackUp') !== getStatusDuration(previous.statuses, 'attackUp')) {
      pushHighlight(labels, 'DMG UP')
    }

    if (hasStatus(fighter.statuses, 'burn') && getStatusDuration(fighter.statuses, 'burn') !== getStatusDuration(previous.statuses, 'burn')) {
      pushHighlight(labels, `BURN ${getStatusDuration(fighter.statuses, 'burn')}T`)
    }

    if (hasStatus(fighter.statuses, 'mark') && getStatusDuration(fighter.statuses, 'mark') !== getStatusDuration(previous.statuses, 'mark')) {
      pushHighlight(labels, 'MARKED')
    }

    const readyAbility = Object.keys(fighter.cooldowns).some((abilityId) => {
      const before = previous.cooldowns[abilityId] ?? 0
      const after = fighter.cooldowns[abilityId] ?? 0
      return before > 0 && after === 0
    })

    if (readyAbility) {
      pushHighlight(labels, 'CD READY')
    }

    if (labels.length > 0) {
      highlights[fighter.instanceId] = labels.slice(0, 2)
    }
  })

  return highlights
}

function buildRoundTransition(previousState: BattleState, nextState: BattleState, events: BattleEvent[]): RoundTransitionState | null {
  if (nextState.round <= previousState.round) return null

  const highlights = buildCarryoverHighlights(previousState, nextState)
  const tone = nextState.firstPlayer === 'player' ? 'teal' : 'red'
  const title = `ROUND ${nextState.round}`
  const subtitle = nextState.firstPlayer === 'player'
    ? 'Your squad has opening initiative.'
    : 'Enemy initiative leads the next exchange.'

  const badges: string[] = []

  const fatigueEvents = events.filter(
    (event) => event.round === previousState.round && event.kind === 'system' && event.message.includes('Domain pressure'),
  )
  if (fatigueEvents.length > 0) {
    badges.push(`FATIGUE x${fatigueEvents.length}`)
  }

  const defeatNames = Array.from(
    new Set(
      events
        .filter((event) => event.round === previousState.round && event.kind === 'defeat')
        .map((event) => getFighterLabel(previousState, nextState, event.targetId))
        .filter((name): name is string => Boolean(name)),
    ),
  )
  if (defeatNames.length > 0) {
    badges.push(`KO ${defeatNames.slice(0, 2).join(', ')}`)
  }

  const roundStartHeals = events.filter((event) => event.round === nextState.round && event.kind === 'heal')
  if (roundStartHeals.length > 0) {
    badges.push(`ROUND START HEAL x${roundStartHeals.length}`)
  }

  const cooldownReadyCount = Object.values(highlights).flat().filter((label) => label === 'CD READY').length
  if (cooldownReadyCount > 0) {
    badges.push(`${cooldownReadyCount} CD READY`)
  }

  badges.push('ENERGY REFRESHED')
  badges.push(nextState.firstPlayer === 'player' ? 'PLAYER OPENS' : 'ENEMY OPENS')

  return {
    key: `round-${nextState.round}`,
    round: nextState.round,
    title,
    subtitle,
    badges: badges.slice(0, 4),
    tone,
    highlights,
  }
}

function getEnemyIntentSummaries(state: BattleState) {
  const previewState = JSON.parse(JSON.stringify(state)) as BattleState
  const commands = buildEnemyCommands(previewState)

  return Object.fromEntries(
    Object.entries(commands).map(([actorId, command]) => [actorId, getCommandSummary(previewState, command)]),
  )
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
  events,
}: {
  onSurrender: () => void
  events: BattleEvent[]
}) {
  const latest = [...events].reverse().slice(0, 3)

  return (
    <aside className="flex flex-col gap-1.5 rounded-[0.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,12,26,0.96),rgba(10,8,18,0.98))] p-2 shadow-[0_12px_22px_rgba(0,0,0,0.3)]">
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

      <div className="flex-1 rounded-[0.15rem] border border-white/8 bg-black/25 p-2">
        {latest.length > 0 ? (
          <div className="space-y-1">
            {latest.map((event) => (
              <p key={event.id} className="text-[0.6rem] leading-4 text-ca-text-2">
                R{event.round} {event.message}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[0.6rem] leading-4 text-ca-text-3">Resolve a round to populate the quick battle log.</p>
        )}
      </div>
    </aside>
  )
}

export function BattlePage() {
  const navigate = useNavigate()
  const { profile } = usePlayerState()
  const { user } = useAuth()
  const { matchId } = useParams<{ matchId?: string }>()

  // ── Multiplayer hook (null when playing vs AI) ──────────────────────────
  const multiplayer = useMultiplayerMatch(matchId ?? null, user?.id ?? null)

  const [stagedSession] = useState(() => readStagedBattleSession())
  const [initialBattle] = useState(createNewBattle)
  const [battle, setBattle] = useState<BattleViewState>(initialBattle.viewState)
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [hoveredAbility, setHoveredAbility] = useState<HoveredAbilityState | null>(null)
  const [battleLog, setBattleLog] = useState<BattleEvent[]>(initialBattle.initialEvents)
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(60)
  const [roundTransition, setRoundTransition] = useState<RoundTransitionState | null>(null)
  const [lastRecordedResultId, setLastRecordedResultId] = useState<string | null>(null)
  const [recordedResult, setRecordedResult] = useState<LastBattleResult | null>(null)
  const [queueDialogOpen, setQueueDialogOpen] = useState(false)

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
  const commitReady = commandableUnits.length > 0 && !hasPendingTargetSelection
  const targetingAllies = selectedAbility?.targetRule === 'ally-single'
  const targetingEnemies = selectedAbility?.targetRule === 'enemy-single'
  const hoveredActor = hoveredAbility ? getFighterById(battle.state, hoveredAbility.actorId) : null
  const fallbackActor = battle.state.playerTeam.find(isAlive) ?? battle.state.playerTeam[0] ?? null
  const inspectedActor = hoveredActor ?? selectedActor ?? fallbackActor
  const inspectedAbility =
    hoveredAbility && hoveredActor ? getAbilityById(hoveredActor, hoveredAbility.abilityId) : selectedAbility
  const turnOrderLabel = battle.state.firstPlayer === 'player' ? '1ST' : '2ND'
  const enemyIntentSummaries = getEnemyIntentSummaries(battle.state)
  const topBarPrompt = targetingEnemies
    ? `TARGET ENEMY WITH ${selectedAbility?.name.toUpperCase() ?? 'TECHNIQUE'}`
    : targetingAllies
      ? `TARGET ALLY WITH ${selectedAbility?.name.toUpperCase() ?? 'TECHNIQUE'}`
      : selectedAbility
        ? `${selectedAbility.name.toUpperCase()} READY`
        : battle.state.firstPlayer === 'enemy'
          ? `RESPONSE TURN (${turnOrderLabel})`
          : `OPENING TURN (${turnOrderLabel})`

  // ── Sync multiplayer state → local battle view ──────────────────────────
  useEffect(() => {
    if (!multiplayer) return
    const nextActorId = multiplayer.isMyTurn
      ? getNextActorId(multiplayer.battleState, multiplayer.autoCommands)
      : null

    setBattle({
      state: multiplayer.battleState,
      queued: multiplayer.autoCommands,
      selectedActorId: nextActorId,
    })
    clearPendingSelection()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplayer?.battleState, multiplayer?.isMyTurn])

  const onTurnTimeout = useEffectEvent(() => {
    if (battle.state.phase === 'finished') return
    handleTurnTimeout()
  })

  useEffect(() => {
    setTurnSecondsLeft(60)
  }, [battle.state.round, battle.state.phase, multiplayer?.isMyTurn])

  useEffect(() => {
    if (battle.state.phase === 'finished') return undefined
    // In online mode only tick down when it's our turn
    if (multiplayer && !multiplayer.isMyTurn) return undefined
    const timer = window.setInterval(() => {
      setTurnSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [battle.state.phase, battle.state.round, multiplayer?.isMyTurn])

  useEffect(() => {
    if (turnSecondsLeft > 0) return
    onTurnTimeout()
  }, [turnSecondsLeft])

  useEffect(() => {
    if (!roundTransition) return undefined
    const timer = window.setTimeout(() => {
      setRoundTransition(null)
    }, 2400)

    return () => window.clearTimeout(timer)
  }, [roundTransition])

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
  }, [battle.state, stagedSession, lastRecordedResultId, multiplayer, matchId])

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

  function handleSelectFocus(type: BattleEnergyType) {
    setBattle((current) => {
      const nextState = {
        ...current.state,
        playerEnergy: setEnergyFocus(current.state.playerEnergy, type),
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
  ) {
    if (battle.state.phase === 'finished') return

    // ── Online path ───────────────────────────────────────────────────────
    if (multiplayer) {
      const { events } = await multiplayer.submitCommands(queuedActions, preludeEvents)
      // State arrives via the useEffect above (Realtime + optimistic update).
      // We only need to append events to the log here.
      setBattleLog((current) => [...current, ...preludeEvents, ...events].slice(-36))
      clearPendingSelection()
      setHoveredAbility(null)
      return
    }

    // ── Local / AI path ───────────────────────────────────────────────────
    const previousState = battle.state
    let currentState = battle.state
    const playerEvents: BattleEvent[] = [...preludeEvents]
    const enemyEvents: BattleEvent[] = []

    // Phase 1: player turn
    if (currentState.firstPlayer === 'player') {
      const playerResult = resolveTeamTurn(currentState, queuedActions, 'player')
      currentState = playerResult.state
      playerEvents.push(...playerResult.events)
    } else {
      const playerResult = resolveTeamTurn(currentState, queuedActions, 'player')
      currentState = playerResult.state
      playerEvents.push(...playerResult.events)
    }

    // Flush player events to log so they appear before enemy fires
    clearPendingSelection()
    setHoveredAbility(null)
    setBattleLog((current) => [...current, ...playerEvents].slice(-36))

    // Brief pause so the player can read what just happened
    await new Promise<void>((resolve) => window.setTimeout(resolve, 420))

    // Phase 2: enemy turn + round end
    if (currentState.phase !== 'finished' && previousState.firstPlayer === 'player') {
      currentState = transitionToSecondPlayer(currentState)
      const enemyCommands = buildEnemyCommands(currentState)
      const enemyResult = resolveTeamTurn(currentState, enemyCommands, 'enemy')
      currentState = enemyResult.state
      enemyEvents.push(...enemyResult.events)
    }

    if (currentState.phase !== 'finished') {
      const roundEnd = endRound(currentState)
      currentState = roundEnd.state
      enemyEvents.push(...roundEnd.events)
    }

    if (currentState.phase !== 'finished' && currentState.firstPlayer === 'enemy') {
      const enemyCommands = buildEnemyCommands(currentState)
      const enemyResult = resolveTeamTurn(currentState, enemyCommands, 'enemy')
      currentState = enemyResult.state
      enemyEvents.push(...enemyResult.events)

      if (currentState.phase !== 'finished') {
        currentState = transitionToSecondPlayer(currentState)
      }
    }

    const allEvents = [...playerEvents, ...enemyEvents]
    const nextQueued = createAutoCommands(currentState)
    const nextActorId = getNextActorId(currentState, nextQueued)
    const nextTransition = buildRoundTransition(previousState, currentState, allEvents)

    setBattle({
      state: currentState,
      queued: nextQueued,
      selectedActorId: nextActorId,
    })
    setBattleLog((current) => [...current, ...enemyEvents].slice(-36))
    setRoundTransition(nextTransition)
  }

  function handleTurnTimeout() {
    if (battle.state.phase === 'finished') return

    // In online mode only time out if it's actually our turn
    if (multiplayer && !multiplayer.isMyTurn) return

    const queuedActions = multiplayer
      ? buildTimeoutCommands(battle.state)
      : buildTimedOutQueuedActions(battle.state, battle.queued)

    const autoPassedCount = getCommandablePlayerUnits(battle.state).filter(
      (fighter) => !battle.queued[fighter.instanceId],
    ).length

    resolveQueuedRound(queuedActions, [createTimeoutEvent(battle.state.round, autoPassedCount)])
  }

  function resolveCommittedRound() {
    if (!commitReady || battle.state.phase === 'finished') return
    setQueueDialogOpen(true)
  }

  function handleQueueConfirm() {
    setQueueDialogOpen(false)
    resolveQueuedRound(battle.queued)
  }

  function handleTargetFighterClick(fighter: { instanceId: string }) {
    if (!selectedActor || !selectedAbilityId) return
    if (!validTargetIds.includes(fighter.instanceId)) return
    queuePlayerAbility(selectedActor.instanceId, selectedAbilityId, fighter.instanceId)
  }

  function handleSurrender() {
    const { viewState, initialEvents } = createNewBattle()
    setBattle(viewState)
    setSelectedAbilityId(null)
    setSelectedTargetId(null)
    setHoveredAbility(null)
    setBattleLog(initialEvents)
    setTurnSecondsLeft(30)
    setRoundTransition(null)
    setRecordedResult(null)
    setLastRecordedResultId(null)
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
            battleFinished={battle.state.phase === 'finished'}
            onReady={resolveCommittedRound}
            onSelectFocus={handleSelectFocus}
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
              enemyIntentSummaries={enemyIntentSummaries}
              roundTransition={roundTransition}
              onSelectActor={handleSelectActor}
              onSelectAbility={handleSelectAbility}
              onTargetFighter={handleTargetFighterClick}
              onHoverAbility={(actorId, abilityId) => setHoveredAbility({ actorId, abilityId })}
              onLeaveAbility={() => setHoveredAbility(null)}
              onDequeue={clearQueuedAction}
              canUsePlayerAbility={(fighter, abilityId) => canQueueAbility(battle.state, battle.queued, fighter, abilityId)}
            />

            <div className="grid gap-2 lg:grid-cols-[10rem_minmax(0,1fr)]">
              <UtilityRail onSurrender={handleSurrender} events={battleLog} />
              <BattleInfoPanel
                actor={inspectedActor}
                ability={inspectedAbility}
                battlefieldName={battle.state.battlefield.description}
              />
            </div>
          </div>
        </div>

        {multiplayer && multiplayer.status === 'opponent_turn' ? (
          <OpponentTurnOverlay opponentName={multiplayer.opponentDisplayName} />
        ) : null}

        {multiplayer && multiplayer.status === 'waiting_for_opponent' ? (
          <WaitingForOpponentOverlay />
        ) : null}

        {multiplayer && multiplayer.status === 'error' ? (
          <DisconnectOverlay error={multiplayer.error} onReturnHome={() => navigate('/')} />
        ) : null}

        {queueDialogOpen ? (
          <SkillQueueModal
            round={battle.state.round}
            playerTeam={battle.state.playerTeam}
            queued={battle.queued}
            energy={battle.state.playerEnergy}
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

function OpponentTurnOverlay({ opponentName }: { opponentName: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center pb-6 pointer-events-none">
      <div className="rounded-[0.35rem] border border-white/10 bg-[rgba(8,8,14,0.82)] px-5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-sm">
        <p className="ca-mono-label text-[0.52rem] text-ca-text-3 mb-1">WAITING</p>
        <p className="ca-display text-sm text-ca-text">
          {opponentName.toUpperCase()} IS CHOOSING ACTIONS
        </p>
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

function SkillQueueModal({
  round,
  playerTeam,
  queued,
  energy,
  onConfirm,
  onBack,
}: {
  round: number
  playerTeam: BattleFighterState[]
  queued: Record<string, QueuedBattleAction>
  energy: BattleEnergyPool
  onConfirm: () => void
  onBack: () => void
}) {
  const rows = playerTeam.map((fighter) => {
    const action = queued[fighter.instanceId]
    const ability = action ? getAbilityById(fighter, action.abilityId) : null
    const cost = ability ? getAbilityEnergyCost(ability) : null
    const totalCost = cost ? countEnergyCost(cost) : 0
    const isPass = !ability || ability.id === PASS_ABILITY_ID
    return { fighter, ability, cost, totalCost, isPass }
  })

  const grandTotal = rows.reduce((sum, r) => sum + r.totalCost, 0)
  const focusDiscount = rows.some((r) => r.cost && energy.focus && r.cost[energy.focus]) && energy.focusAvailable ? 1 : 0
  const netCost = Math.max(0, grandTotal - focusDiscount)
  const reserveAfter = Math.max(0, energy.reserve - netCost)
  const canAfford = energy.reserve >= netCost

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(4,5,10,0.78)] backdrop-blur-[3px]">
      <div className="w-full max-w-lg rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,14,26,0.98),rgba(10,9,18,0.99))] shadow-[0_24px_60px_rgba(0,0,0,0.5)]">

        <div className="border-b border-white/8 px-6 py-4">
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">ACTION QUEUE</p>
          <h2 className="ca-display mt-1.5 text-3xl text-ca-text">COMMIT ROUND {round}</h2>
        </div>

        <div className="divide-y divide-white/6 px-2 py-1">
          {rows.map(({ fighter, ability, cost, isPass }) => (
            <div key={fighter.instanceId} className="flex items-center gap-3 px-4 py-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.25rem] border border-white/10 bg-[rgba(255,255,255,0.04)]">
                <span className="ca-mono-label text-[0.52rem] text-ca-text-2">
                  {fighter.shortName.slice(0, 2).toUpperCase()}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="ca-display text-[0.95rem] leading-none text-ca-text">{fighter.shortName}</p>
                <p className={['mt-1 ca-mono-label text-[0.5rem]', isPass ? 'text-ca-text-3' : 'text-ca-text-2'].join(' ')}>
                  {isPass ? 'AUTO-PASS' : ability!.name.toUpperCase()}
                </p>
              </div>

              <div className="shrink-0">
                {cost && !isPass ? (
                  <EnergyCostRow cost={cost} />
                ) : (
                  <span className="ca-mono-label text-[0.46rem] text-ca-text-3">—</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/8 px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="ca-mono-label text-[0.46rem] text-ca-text-3">TOTAL COST</span>
              <span className={['ca-mono-label text-[0.56rem]', canAfford ? 'text-ca-text' : 'text-ca-red'].join(' ')}>
                {netCost}
              </span>
            </div>
            <div className="h-3 w-px bg-white/12" />
            <div className="flex items-center gap-2">
              <span className="ca-mono-label text-[0.46rem] text-ca-text-3">RESERVE</span>
              <span className="ca-mono-label text-[0.56rem] text-ca-text">{energy.reserve}</span>
            </div>
            <div className="h-3 w-px bg-white/12" />
            <div className="flex items-center gap-2">
              <span className="ca-mono-label text-[0.46rem] text-ca-text-3">AFTER</span>
              <span className={['ca-mono-label text-[0.56rem]', reserveAfter === 0 ? 'text-amber-300' : 'text-ca-teal'].join(' ')}>
                {reserveAfter}
              </span>
            </div>
            {focusDiscount > 0 ? (
              <>
                <div className="h-3 w-px bg-white/12" />
                <span className="ca-mono-label text-[0.46rem] text-ca-teal">FOCUS -1</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex gap-3 border-t border-white/8 px-6 py-4">
          <button
            type="button"
            onClick={onConfirm}
            className="ca-display flex-1 rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] py-2.5 text-[1.05rem] text-white transition hover:brightness-110"
          >
            CONFIRM
          </button>
          <button
            type="button"
            onClick={onBack}
            className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] px-5 py-2.5 text-[1.05rem] text-ca-text transition hover:bg-[rgba(36,34,48,0.8)]"
          >
            BACK
          </button>
        </div>

      </div>
    </div>
  )
}







