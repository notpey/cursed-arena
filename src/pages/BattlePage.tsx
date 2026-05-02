import { type DragEvent, type PointerEvent, type TouchEvent, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { battleEnergyOrder, battleEnergyMeta, canExchangeEnergy, canPayEnergy, exchangeEnergy, getAbilityEnergyCost, getEnergyCount, sumEnergyCosts, type BattleEnergyPool, type BattleEnergyCost, type BattleEnergyType } from '@/features/battle/energy'
import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import homeBgBase from '@/assets/backgrounds/home-bg-base.webp'
import { BattleBoard } from '@/components/battle/BattleBoard'
import { BattleInfoPanel } from '@/components/battle/BattleInfoPanel'
import { NarutoQueueCommitModal } from '@/components/battle/NarutoQueueCommitModal'
import { BattleTopBar } from '@/components/battle/BattleTopBar'
import { battleBoardProfiles, PASS_ABILITY_ID } from '@/features/battle/data'
import {
  buildCompletionId,
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
import { fetchMyClan } from '@/features/clans/client'
import { getLadderRankTitle, getLevelForExperience } from '@/features/ranking/ladder'
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
  BattleFighterState,
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

type PracticeTurnLogEntry = {
  id: string
  round: number
  label: string
  summary: string
  detail?: string
  tone: 'red' | 'teal' | 'gold' | 'frost'
}

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

function humanizeKey(value: string) {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function counterLabel(key: string) {
  if (key === 'sukuna_bonus_hp') return 'Transformation health bonus'
  if (key === 'shikigami') return 'Shikigami'
  if (key === 'straw_doll_damage_taken') return 'Straw Doll vulnerability'
  return humanizeKey(key)
}

function findFighterName(state: BattleState, fighterId?: string) {
  if (!fighterId) return null
  const fighter = getFighterById(state, fighterId)
  return fighter?.shortName ?? fighter?.name ?? null
}

function findAbilityName(state: BattleState, actorId?: string, abilityId?: string) {
  if (!actorId || !abilityId) return abilityId ? humanizeKey(abilityId) : null
  const actor = getFighterById(state, actorId)
  const ability = actor ? getAbilityById(actor, abilityId) : null
  return ability?.name ?? humanizeKey(abilityId)
}

function formatResourceAmounts(amounts: Partial<Record<string, number>>) {
  return Object.entries(amounts)
    .filter(([, amount]) => (amount ?? 0) !== 0)
    .map(([key, amount]) => `${Math.abs(amount ?? 0)} ${humanizeKey(key)}`)
    .join(', ')
}

function formatRuntimeEventForPracticeLog(event: BattleRuntimeEvent, state: BattleState): PracticeTurnLogEntry | null {
  const actor = findFighterName(state, event.actorId)
  const target = findFighterName(state, event.targetId)
  const ability = findAbilityName(state, event.actorId, event.abilityId)
  const metaLabel = typeof event.meta?.label === 'string' ? event.meta.label : null
  const status = typeof event.meta?.status === 'string' ? humanizeKey(event.meta.status) : null

  switch (event.type) {
    case 'ability_used':
      return {
        id: event.id,
        round: event.round,
        label: 'ACTION',
        summary: `${actor ?? 'A fighter'} used ${ability ?? 'a technique'}${target ? ` on ${target}` : ''}.`,
        tone: event.team === 'enemy' ? 'red' : 'teal',
      }
    case 'damage_applied':
      return {
        id: event.id,
        round: event.round,
        label: 'DAMAGE',
        summary: `${target ?? 'Target'} took ${event.amount ?? 0} damage${actor ? ` from ${actor}` : ''}.`,
        detail: ability ? `Source: ${ability}` : undefined,
        tone: 'red',
      }
    case 'damage_blocked':
      return {
        id: event.id,
        round: event.round,
        label: 'BLOCKED',
        summary: `${target ?? 'Target'} blocked ${event.amount ?? 0} damage.`,
        detail: event.meta?.blockedByShield ? 'Shield absorbed the hit.' : event.meta?.blockedByInvincible ? 'Invulnerability prevented the hit.' : undefined,
        tone: 'gold',
      }
    case 'heal_applied':
      return {
        id: event.id,
        round: event.round,
        label: 'HEAL',
        summary: `${target ?? 'Target'} recovered ${event.amount ?? 0} HP${actor ? ` from ${actor}` : ''}.`,
        detail: ability ? `Source: ${ability}` : undefined,
        tone: 'teal',
      }
    case 'resource_changed': {
      const packet = event.packet?.kind === 'resource' ? event.packet : null
      const mode = packet?.mode ? humanizeKey(packet.mode) : 'Changed'
      const amounts = packet ? formatResourceAmounts(packet.amounts) : `${event.amount ?? 0} energy`
      return {
        id: event.id,
        round: event.round,
        label: 'ENERGY',
        summary: `${humanizeKey(event.team ?? packet?.targetTeam ?? 'team')} energy ${mode.toLowerCase()}: ${amounts}.`,
        detail: ability ? `Source: ${ability}` : undefined,
        tone: 'gold',
      }
    }
    case 'modifier_applied':
    case 'status_applied':
      return {
        id: event.id,
        round: event.round,
        label: 'STATUS',
        summary: `${target ?? 'Target'} gained ${status ?? metaLabel ?? 'an effect'}.`,
        detail: typeof event.meta?.duration === 'number' ? `${event.meta.duration} turn${event.meta.duration === 1 ? '' : 's'} remaining.` : undefined,
        tone: event.tags?.includes('burn') || event.tags?.includes('mark') ? 'red' : 'gold',
      }
    case 'modifier_removed':
    case 'status_removed':
      return {
        id: event.id,
        round: event.round,
        label: 'REMOVED',
        summary: `${target ?? 'Target'} lost ${status ?? metaLabel ?? 'an effect'}.`,
        tone: 'frost',
      }
    case 'shield_applied':
      return {
        id: event.id,
        round: event.round,
        label: 'SHIELD',
        summary: `${target ?? 'Target'} gained ${event.amount ?? 0} shield.`,
        detail: metaLabel ?? undefined,
        tone: 'teal',
      }
    case 'shield_damaged':
      return {
        id: event.id,
        round: event.round,
        label: 'SHIELD',
        summary: `${target ?? 'Target'} shield took ${event.amount ?? 0} damage.`,
        tone: 'gold',
      }
    case 'shield_broken':
      return {
        id: event.id,
        round: event.round,
        label: 'SHIELD',
        summary: `${target ?? 'Target'} shield broke.`,
        tone: 'red',
      }
    case 'counter_changed': {
      const key = typeof event.meta?.key === 'string' ? event.meta.key : 'counter'
      return {
        id: event.id,
        round: event.round,
        label: 'TRACKER',
        summary: `${target ?? actor ?? 'Fighter'} ${counterLabel(key)} is now ${event.amount ?? event.meta?.value ?? 0}.`,
        tone: 'teal',
      }
    }
    case 'fighter_flag_changed':
      return {
        id: event.id,
        round: event.round,
        label: 'STATE',
        summary: `${target ?? 'Target'} ${humanizeKey(String(event.meta?.key ?? 'state'))} is now ${String(event.meta?.value ?? false)}.`,
        tone: 'frost',
      }
    case 'effect_ignored':
      return {
        id: event.id,
        round: event.round,
        label: 'IGNORED',
        summary: `${target ?? 'Target'} ignored an effect.`,
        detail: ability ? `Source: ${ability}` : undefined,
        tone: 'frost',
      }
    case 'fighter_defeated':
      return {
        id: event.id,
        round: event.round,
        label: 'DEFEAT',
        summary: `${target ?? 'A fighter'} was defeated${actor ? ` by ${actor}` : ''}.`,
        tone: 'red',
      }
    case 'scheduled_effect_created':
      return {
        id: event.id,
        round: event.round,
        label: 'DELAYED',
        summary: `${actor ?? 'A fighter'} created a delayed effect.`,
        detail: `Resolves round ${event.meta?.dueRound ?? '?'}, ${humanizeKey(String(event.meta?.phase ?? 'phase'))}.`,
        tone: 'gold',
      }
    case 'scheduled_effect_resolved':
      return {
        id: event.id,
        round: event.round,
        label: 'DELAYED',
        summary: `${actor ?? 'A delayed effect'} resolved${target ? ` on ${target}` : ''}.`,
        tone: 'gold',
      }
    case 'round_ended':
      return { id: event.id, round: event.round, label: 'ROUND', summary: `Round ${event.round} ended.`, tone: 'frost' }
    case 'round_started':
      return { id: event.id, round: event.round, label: 'ROUND', summary: `Round ${event.round} started.`, tone: 'frost' }
    default:
      return null
  }
}

function buildPracticeTurnLogEntries(steps: BattleTimelineStep[]) {
  return steps.flatMap((step) =>
    step.runtimeEvents
      .map((event) => formatRuntimeEventForPracticeLog(event, step.state))
      .filter((entry): entry is PracticeTurnLogEntry => entry !== null),
  )
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
  _queued: Record<string, QueuedBattleAction>,
): Record<string, QueuedBattleAction> {
  void _queued
  return buildTimeoutCommands(state)
}

function applyRandomAllocationToQueuedActions(
  queued: Record<string, QueuedBattleAction>,
  randomAlloc: RandomAllocation,
) {
  return Object.fromEntries(
    Object.entries(queued).map(([actorId, command]) => {
      const baseCommand = { ...command }
      delete baseCommand.randomCostAllocation
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

  if (hadUnconfirmedActions || committedCount > 0) {
    message = 'Turn timer expired. Unconfirmed actions were canceled and the turn was passed.'
  } else if (autoPassedCount > 0) {
    message = 'Turn timer expired. The turn was passed automatically.'
  }

  return {
    id: `timeout-${round}-${Date.now()}`,
    round,
    kind: 'system',
    tone: 'red',
    message,
  }
}

function createPassTurnEvent(round: number): BattleEvent {
  return {
    id: `pass-turn-${round}-${Date.now()}`,
    round,
    kind: 'system',
    tone: 'frost',
    message: 'No actions were queued. The turn was passed.',
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
    <aside className="flex w-[10rem] shrink-0 flex-col gap-1.5 rounded-[0.2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(20,18,30,0.96),rgba(10,8,18,0.98))] p-2 shadow-[0_12px_22px_rgba(0,0,0,0.34)]">
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

function practiceLogToneClasses(tone: PracticeTurnLogEntry['tone']) {
  if (tone === 'red') return 'border-ca-red/24 bg-ca-red-wash'
  if (tone === 'teal') return 'border-ca-teal/24 bg-ca-teal-wash'
  if (tone === 'gold') return 'border-amber-300/25 bg-amber-300/10'
  return 'border-white/10 bg-white/[0.035]'
}

function PracticeTurnLogOverlay({
  entries,
  eventCount,
}: {
  entries: PracticeTurnLogEntry[]
  eventCount: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState(() => ({ x: 16, y: 88 }))
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const displayEntries = [...entries].reverse()
  const latestRound = displayEntries[0]?.round ?? 1

  function clampPosition(x: number, y: number) {
    if (typeof window === 'undefined') return { x, y }
    const width = Math.min(320, window.innerWidth - 16)
    const height = collapsed ? 64 : Math.min(420, window.innerHeight - 16)
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
    }
  }

  function handleDragStart(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleDragMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPosition(clampPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY))
  }

  function handleDragEnd(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <aside
      className="fixed z-30 flex max-h-[min(26rem,calc(100dvh-1rem))] min-h-0 w-[min(20rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[0.35rem] border border-ca-teal/24 bg-[linear-gradient(180deg,rgba(30,28,36,0.97),rgba(13,12,17,0.99))] shadow-[0_20px_52px_rgba(0,0,0,0.52)] backdrop-blur-md"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="flex cursor-move touch-none select-none items-center justify-between gap-2 border-b border-white/8 px-3 py-2.5"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div>
          <p className="ca-mono-label text-[0.58rem] text-ca-teal">PRACTICE ONLY</p>
          <p className="ca-display mt-1 text-[1rem] leading-none text-ca-text">TURN LOG</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="ca-mono-label rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.56rem] text-ca-text-3">
            R{latestRound}
          </span>
          <span className="ca-mono-label rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.56rem] text-ca-text-3">
            {entries.length || eventCount}
          </span>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed((value) => !value)}
            className="rounded-full border border-white/12 bg-white/6 px-2 py-1 ca-mono-label text-[0.52rem] text-ca-text-2 transition hover:border-ca-teal/35 hover:text-ca-teal"
          >
            {collapsed ? 'OPEN' : 'HIDE'}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pt-2.5">
          {displayEntries.length > 0 ? (
            displayEntries.map((entry, index) => (
              <div
                key={entry.id}
                className={['rounded-[0.32rem] border px-2.5 py-2 animate-ca-slide-up', practiceLogToneClasses(entry.tone)].join(' ')}
                style={{ animationDelay: `${Math.min(index, 4) * 18}ms` }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="ca-mono-label text-[0.56rem] text-ca-text-3">R{entry.round}</span>
                  <span className="rounded-full border border-white/10 bg-black/18 px-1.5 py-0.5 ca-mono-label text-[0.5rem] text-ca-text-2">
                    {entry.label}
                  </span>
                </div>
                <p className="text-[0.72rem] leading-5 text-ca-text-2">{entry.summary}</p>
                {entry.detail ? <p className="mt-1 text-[0.64rem] leading-4 text-ca-text-3">{entry.detail}</p> : null}
              </div>
            ))
          ) : (
            <div className="rounded-[0.3rem] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4">
              <p className="text-[0.72rem] leading-5 text-ca-text-3">Commit a practice turn to see each resolved action, status, tracker, shield, and resource change.</p>
            </div>
          )}
        </div>
      ) : null}
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
  const isPracticeBattle = stagedSession?.mode === 'practice'
  const aiEnabled = practiceOptions ? practiceOptions.aiEnabled : true
  const [initialBattle] = useState(createNewBattle)
  const [battle, setBattle] = useState<BattleViewState>(initialBattle.viewState)
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [hoveredAbility, setHoveredAbility] = useState<HoveredAbilityState | null>(null)
  const [battleLog, setBattleLog] = useState<BattleEvent[]>(initialBattle.initialEvents)
  const [practiceTurnLog, setPracticeTurnLog] = useState<PracticeTurnLogEntry[]>([])
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(60)
  const [lastRecordedResultId, setLastRecordedResultId] = useState<string | null>(null)
  const [recordedResult, setRecordedResult] = useState<LastBattleResult | null>(null)
  const [queueDialogOpen, setQueueDialogOpen] = useState(false)
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)
  const [timelineLocked, setTimelineLocked] = useState(false)
  const [timelineFocus, setTimelineFocus] = useState<BattleTimelineFocus | null>(null)
  const [boardRevealKey, setBoardRevealKey] = useState(0)
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  const timelineRunRef = useRef(0)
  const lastPlayedMultiplayerResolutionRef = useRef<string | null>(null)
  const [playerClanTag, setPlayerClanTag] = useState<string | null>(null)
  const battleProfileStats = readBattleProfileStats()

  useEffect(() => {
    const identityUserId = currentUserId ?? 'local-user'
    let disposed = false

    fetchMyClan(identityUserId)
      .then(({ data }) => {
        if (!disposed) setPlayerClanTag(data?.tag ?? null)
      })
      .catch(() => {
        if (!disposed) setPlayerClanTag(null)
      })

    return () => {
      disposed = true
    }
  }, [currentUserId])

  const playerBoardProfile = {
    username: profile.displayName,
    title: profile.title,
    initials: profile.avatarLabel,
    accent: 'teal' as const,
    avatarUrl: profile.avatarUrl,
    clanTag: playerClanTag,
    level: battleProfileStats.level,
    rankTitle: battleProfileStats.rankTitle,
    ladderRank: battleProfileStats.ladderRank ?? null,
  }
  const enemyBoardProfile = multiplayer
    ? {
        username: multiplayer.opponentDisplayName,
        title: 'Opponent',
        initials: getInitials(multiplayer.opponentDisplayName),
        accent: 'red' as const,
        // TODO: Fetch opponent avatar, clan tag, level, rank title, and ladder rank from profile metadata when match rows expose opponent IDs safely.
        avatarUrl: null,
        clanTag: null,
        level: null,
        rankTitle: null,
        ladderRank: null,
      }
    : stagedSession
      ? {
          username: stagedSession.opponentName,
          title: stagedSession.opponentTitle,
          initials: getInitials(stagedSession.opponentName),
          accent: 'red' as const,
          avatarUrl: null,
          clanTag: null,
          level: stagedSession.opponentExperience ? getLevelForExperience(stagedSession.opponentExperience) : null,
          rankTitle: stagedSession.opponentRankLabel ?? (
            stagedSession.opponentExperience
              ? getLadderRankTitle({ level: getLevelForExperience(stagedSession.opponentExperience), ladderRank: null })
              : stagedSession.opponentTitle
          ),
          ladderRank: null,
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

    setBattle((current) => ({ ...current, queued: {}, selectedActorId: null }))

    const events = steps.flatMap((step) => step.events)
    if (events.length > 0) {
      setBattleLog((current) => [...current, ...events].slice(-36))
    }
    if (isPracticeBattle) {
      const entries = buildPracticeTurnLogEntries(steps)
      if (entries.length > 0) {
        setPracticeTurnLog((current) => [...current, ...entries].slice(-140))
      }
    }

    for (const step of steps) {
      if (timelineRunRef.current !== runId) return false

      const focus = createTimelineFocus(step) ?? { label: 'RESOLVING', tone: 'frost' as const }
      setBattle((current) => ({ ...current, state: step.state }))
      setTimelineFocus(focus)
      await wait(260)
    }

    if (timelineRunRef.current !== runId) return false

    setTimelineFocus(null)
    return true
  }, [isPracticeBattle])

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
      setBoardRevealKey((current) => current + 1)
      setSelectedAbilityId(null)
      setSelectedTargetId(null)
      setTimelineLocked(false)
      setTimelineFocus(null)
    })()
  }, [multiplayer, multiplayerAutoCommands, multiplayerBattleState, multiplayerIsMyTurn, multiplayerLatestResolution, playTimelineSteps])

  const onTurnTimeout = useEffectEvent(() => {
    if (battle.state.phase === 'finished' || timelineLocked) return
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
    if (!isDocumentVisible) return
    onTurnTimeout()
  }, [turnSecondsLeft, isDocumentVisible])

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
    const winner = battle.state.winner

    // Derive a stable completion id from the session seed so the React guard
    // is consistent with the persistent localStorage idempotency check.
    const resultId = stagedSession
      ? buildCompletionId(stagedSession.battleSeed, stagedSession.mode)
      : buildCompletionId(battle.state.playerTeam.map((f) => f.templateId).join('-'), 'quick')

    if (lastRecordedResultId === resultId) return

    // Claim the slot immediately to prevent double-recording across re-renders
    setLastRecordedResultId(resultId)

    if (multiplayer && matchId) {
      // Online match — settle LP on the server then record locally
      const won = winner === 'player'
      const draw = winner === 'draw'
      const playerTeamIds = battle.state.playerTeam.map((f) => f.templateId)
      const enemyTeamIds  = battle.state.enemyTeam.map((f) => f.templateId)
      const mode = multiplayer.matchRow?.mode ?? 'private'

      const settlePromise = draw ? Promise.resolve({ data: null }) : settleMatchLp(matchId)
      settlePromise.then(({ data: settle }) => {
        // Compute experience delta from server response (settle_match_lp values are treated
        // as experience until the RPC is migrated to settle_match_experience).
        // TODO: once settle_match_experience RPC exists, read experienceGain/experienceLoss directly.
        let lpDelta = 0
        let lpBefore = readBattleProfileStats().experience
        if (settle && !settle.error && !settle.already_settled) {
          if (won) {
            lpDelta  = settle.experienceGain ?? 0
            lpBefore = (settle.winnerExperience ?? lpBefore) - lpDelta
          } else {
            lpDelta  = -(settle.experienceLoss ?? 0)
            lpBefore = (settle.loserExperience ?? lpBefore) - lpDelta
          }
        }

        const result = recordOnlineCompletedBattle({
          winner,
          rounds: battle.state.round,
          playerTeamIds,
          enemyTeamIds,
          opponentName: multiplayer.opponentDisplayName,
          mode,
          lpDelta,
          lpBefore,
          battleSeed: stagedSession?.battleSeed ?? [mode, playerTeamIds.join('-'), enemyTeamIds.join('-')].join(':'),
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
                experienceDelta: result.experienceDelta,
                experienceBefore: result.experienceBefore,
                experienceAfter: result.experienceAfter,
                levelBefore: result.levelBefore,
                levelAfter: result.levelAfter,
                rankTitleBefore: result.rankTitleBefore,
                rankTitleAfter: result.rankTitleAfter,
                ladderRankBefore: result.ladderRankBefore ?? null,
                ladderRankAfter: result.ladderRankAfter ?? null,
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
      winner,
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
    setBoardRevealKey((current) => current + 1)
    setTimelineLocked(false)
    setTimelineFocus(null)
  }

  function handleTurnTimeout() {
    if (battle.state.phase === 'finished') return

    // In online mode only time out if it's actually our turn
    if (multiplayer && !multiplayer.isMyTurn) return

    const hadUnconfirmedActions = queueDialogOpen || hasPendingTargetSelection
    const queuedActionCount = countCommittedPlayerActions(battle.queued)
    const timeoutQueued = buildTimeoutQueuedActions(battle.state, battle.queued)
    const autoPassedCount = getCommandablePlayerUnits(battle.state).length

    setQueueDialogOpen(false)
    resolveQueuedRound(
      timeoutQueued,
      [
        createTimeoutEvent(battle.state.round, {
          committedCount: queuedActionCount,
          autoPassedCount,
          hadUnconfirmedActions: hadUnconfirmedActions || queuedActionCount > 0,
        }),
      ],
      undefined,
    )
  }

  function resolveCommittedRound() {
    if (!commitReady || battle.state.phase === 'finished') return
    if (committedActionCount === 0) {
      setQueueDialogOpen(false)
      resolveQueuedRound(
        buildTimeoutQueuedActions(battle.state, battle.queued),
        [createPassTurnEvent(battle.state.round)],
        undefined,
      )
      return
    }
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
    setPracticeTurnLog([])
    setTurnSecondsLeft(60)
    setRecordedResult(null)
    setLastRecordedResultId(null)
    setTimelineLocked(false)
    setTimelineFocus(null)
  }

  if (matchId && (!multiplayer || !multiplayerBattleState)) {
    const unavailable = multiplayer?.status === 'abandoned' || multiplayer?.status === 'error'
    const message = multiplayer?.status === 'abandoned'
      ? 'This match is no longer active.'
      : multiplayer?.status === 'error'
        ? multiplayer.error ?? 'The match could not be loaded.'
        : 'Loading online match...'

    return (
      <div className="relative h-[100dvh] overflow-hidden bg-[#08090d] text-ca-text">
        <div className="absolute inset-0 bg-cover bg-center opacity-[0.42]" style={{ backgroundImage: `url(${homeBgBase})` }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_34%,rgba(250,39,66,0.08),transparent_34%),radial-gradient(circle_at_84%_24%,rgba(5,216,189,0.08),transparent_32%),linear-gradient(180deg,rgba(4,5,8,0.18),rgba(4,5,8,0.58))]" />
        <div className="relative grid h-full place-items-center p-6">
          <div className="w-full max-w-sm rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,26,0.96),rgba(10,10,16,0.98))] p-6 text-center shadow-[0_22px_54px_rgba(0,0,0,0.4)]">
            <p className="ca-mono-label text-[0.52rem] text-ca-text-3">ONLINE MATCH</p>
            <h1 className="ca-display mt-3 text-3xl text-ca-text">{unavailable ? 'Match Unavailable' : 'Syncing Match'}</h1>
            <p className="mt-2 text-sm text-ca-text-2">{message}</p>
            {unavailable ? (
              <button
                type="button"
                onClick={() => navigate('/battle/prep')}
                className="ca-display mt-5 rounded-lg border border-ca-teal/35 bg-ca-teal-wash px-5 py-3 text-xl text-ca-teal"
              >
                Return to Prep
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#08090d] text-ca-text">
      <div className="absolute inset-0 bg-cover bg-center opacity-[0.42]" style={{ backgroundImage: `url(${homeBgBase})` }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_34%,rgba(250,39,66,0.08),transparent_34%),radial-gradient(circle_at_84%_24%,rgba(5,216,189,0.08),transparent_32%),linear-gradient(180deg,rgba(4,5,8,0.18),rgba(4,5,8,0.58))]" />

      <div className="relative flex h-full w-full flex-col p-2 sm:p-3">
        <div className="flex w-full flex-1 flex-col overflow-y-auto rounded-[0.35rem] border border-white/10 bg-[rgba(8,8,12,0.18)] shadow-[0_20px_56px_rgba(0,0,0,0.34)]">
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
              key={boardRevealKey}
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

        {isPracticeBattle ? <PracticeTurnLogOverlay entries={practiceTurnLog} eventCount={battleLog.length} /> : null}

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
  const draw = winner === 'draw'
  const title = draw ? 'Draw' : win ? 'Victory' : 'Defeat'

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(5,6,10,0.72)] backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,26,0.96),rgba(10,10,16,0.98))] p-6 shadow-[0_22px_54px_rgba(0,0,0,0.4)]">
        <p className="ca-mono-label text-[0.52rem] text-ca-text-3">Match Concluded</p>
        <h2 className={['ca-display mt-3 text-5xl', draw ? 'text-ca-gold' : win ? 'text-ca-teal' : 'text-ca-red'].join(' ')}>{title}</h2>
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
                recordedResult.experienceDelta >= 0 ? 'border-ca-teal/20 bg-ca-teal-wash text-ca-teal' : 'border-ca-red/20 bg-ca-red-wash text-ca-red',
              ].join(' ')}>
                XP {recordedResult.experienceDelta >= 0 ? '+' + recordedResult.experienceDelta : recordedResult.experienceDelta}
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

// Per-action random CE allocation: maps actorId → Record<BattleEnergyType, number>
type RandomAllocation = Record<string, Partial<Record<BattleEnergyType, number>>>

function buildDefaultRandomAllocation(
  rows: { fighter: BattleFighterState; cost: BattleEnergyCost | null; isPass: boolean }[],
  energy: BattleEnergyPool,
): RandomAllocation {
  // For each action that has random cost, greedily assign from the most-abundant type.
  const allocation: RandomAllocation = {}
  const remainingPool = { ...energy.amounts }

  for (const { fighter, cost, isPass } of rows) {
    if (!cost || isPass) continue
    // First spend typed costs to update remainingPool
    for (const type of battleEnergyOrder) {
      const required = cost[type] ?? 0
      remainingPool[type] = Math.max(0, remainingPool[type] - required)
    }
    const randomNeeded = cost.random ?? 0
    if (randomNeeded === 0) continue

    const alloc: Partial<Record<BattleEnergyType, number>> = {}
    let left = randomNeeded
    const sorted = [...battleEnergyOrder].sort((a, b) => remainingPool[b] - remainingPool[a])
    for (const type of sorted) {
      if (left <= 0) break
      const take = Math.min(remainingPool[type], left)
      if (take > 0) {
        alloc[type] = take
        remainingPool[type] -= take
        left -= take
      }
    }
    allocation[fighter.instanceId] = alloc
  }

  return allocation
}


export function SkillQueueModal({
  round,
  state,
  queued,
  initialOrder,
  energy,
  turnSecondsLeft,
  onConfirm,
  onBack,
}: {
  round: number
  state: BattleState
  queued: Record<string, QueuedBattleAction>
  initialOrder: string[]
  energy: BattleEnergyPool
  turnSecondsLeft: number
  onConfirm: (actionOrder: string[]) => void
  onBack: () => void
}) {
  const [order, setOrder] = useState<string[]>(() => {
    const aliveIds = new Set(state.playerTeam.filter((f) => f.hp > 0).map((f) => f.instanceId))
    const filtered = initialOrder.filter((id) => aliveIds.has(id))
    const rest = [...aliveIds].filter((id) => !filtered.includes(id))
    return [...filtered, ...rest]
  })

  const rowMap = new Map(
    state.playerTeam.map((fighter) => {
      const action = queued[fighter.instanceId]
      const ability = action ? getAbilityById(fighter, action.abilityId) : null
      const cost = ability ? getAbilityEnergyCost(ability) : null
      const isPass = !ability || ability.id === PASS_ABILITY_ID
      return [fighter.instanceId, { fighter, ability, cost, isPass }]
    }),
  )

  const rows = order
    .map((id) => rowMap.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)

  const activeRows = rows.filter((r) => !r.isPass)
  const passRows = rows.filter((r) => r.isPass)

  // Total random energy pips needed across all queued skills
  const randomRows = rows.filter(({ cost, isPass }) => !isPass && (cost?.random ?? 0) > 0)
  const totalRandomNeeded = randomRows.reduce((sum, { cost }) => sum + (cost?.random ?? 0), 0)

  // Single aggregate allocation (one pool for all random pips)
  const [globalAlloc, setGlobalAlloc] = useState<Partial<Record<BattleEnergyType, number>>>(() => {
    const defaults = buildDefaultRandomAllocation(rows, energy)
    const agg: Partial<Record<BattleEnergyType, number>> = {}
    for (const perType of Object.values(defaults)) {
      for (const [t, count] of Object.entries(perType)) {
        agg[t as BattleEnergyType] = (agg[t as BattleEnergyType] ?? 0) + (count as number)
      }
    }
    return agg
  })

  const totalAllocated = battleEnergyOrder.reduce((s, t) => s + (globalAlloc[t] ?? 0), 0)
  const hasUnallocated = totalRandomNeeded > 0 && totalAllocated < totalRandomNeeded

  function adjustGlobalAlloc(type: BattleEnergyType, delta: number) {
    setGlobalAlloc((prev) => ({ ...prev, [type]: Math.max(0, (prev[type] ?? 0) + delta) }))
  }

  // Distribute global alloc back to per-actor for cost checking
  function buildPerActorAlloc(): RandomAllocation {
    const result: RandomAllocation = {}
    const rem = { ...globalAlloc } as Record<BattleEnergyType, number>
    for (const { fighter, cost } of randomRows) {
      const needed = cost?.random ?? 0
      if (!needed) continue
      const actorAlloc: Partial<Record<BattleEnergyType, number>> = {}
      let left = needed
      for (const type of battleEnergyOrder) {
        if (left <= 0) break
        const take = Math.min(rem[type] ?? 0, left)
        if (take > 0) { actorAlloc[type] = take; rem[type] = (rem[type] ?? 0) - take; left -= take }
      }
      result[fighter.instanceId] = actorAlloc
    }
    return result
  }

  function resolvedCost(actorId: string, cost: BattleEnergyCost, alloc: RandomAllocation): BattleEnergyCost {
    if (!cost.random) return cost
    const a = alloc[actorId] ?? {}
    const r: BattleEnergyCost = { ...cost }
    delete r.random
    for (const type of battleEnergyOrder) {
      if ((a[type] ?? 0) > 0) r[type] = (r[type] ?? 0) + (a[type] ?? 0)
    }
    return r
  }

  const perActorAlloc = buildPerActorAlloc()
  const aggregateCost = sumEnergyCosts(
    rows.flatMap(({ fighter, cost, isPass }) =>
      isPass || !cost ? [] : [resolvedCost(fighter.instanceId, cost, perActorAlloc)],
    ),
  )
  const canAfford = canPayEnergy(energy, aggregateCost)
  const orderedActionIds = activeRows.map((row) => row.fighter.instanceId)
  void passRows
  void orderedActionIds

  // ── Drag / touch state ────────────────────────────────────────────────────
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const touchDragFromRef = useRef<number | null>(null)

  function applyReorder(from: number, to: number) {
    if (from === to) return
    // Map active-row indices back to full order indices
    const fromId = activeRows[from]?.fighter.instanceId
    const toId   = activeRows[to]?.fighter.instanceId
    if (!fromId || !toId) return
    const fi = order.indexOf(fromId)
    const ti = order.indexOf(toId)
    if (fi === -1 || ti === -1) return
    const next = [...order]
    const [m] = next.splice(fi, 1)
    next.splice(ti, 0, m)
    setOrder(next)
  }

  function clearDrag() { setDragIndex(null); setDragOverIndex(null); touchDragFromRef.current = null }
  function handleDragStart(i: number) { setDragIndex(i) }
  function handleDragOver(e: DragEvent<HTMLDivElement>, i: number) { e.preventDefault(); setDragOverIndex(i) }
  function handleDrop(e: DragEvent<HTMLDivElement>, i: number) { e.preventDefault(); if (dragIndex !== null) applyReorder(dragIndex, i); clearDrag() }
  function handleDragEnd() { clearDrag() }
  function handleTouchStart(_e: TouchEvent<HTMLDivElement>, i: number) { touchDragFromRef.current = i; setDragIndex(i) }
  function handleTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (touchDragFromRef.current === null) return
    const t = e.touches[0]
    const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-tile-index]')
    if (el) { const idx = parseInt((el as HTMLElement).dataset.tileIndex ?? '-1', 10); if (idx >= 0) setDragOverIndex(idx) }
  }
  function handleTouchEnd() {
    if (touchDragFromRef.current !== null && dragOverIndex !== null) applyReorder(touchDragFromRef.current, dragOverIndex)
    clearDrag()
  }

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(4,5,10,0.82)] backdrop-blur-[3px]">
      <div className="w-full max-w-[22rem] rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,14,26,0.99),rgba(10,9,18,1))] shadow-[0_24px_60px_rgba(0,0,0,0.6)]">

        {/* ── Header ── */}
        <div className="border-b border-white/8 px-5 py-4 text-center">
          <div className="flex items-center justify-between gap-3">
            <p className="ca-mono-label text-[0.46rem] text-ca-text-3">ROUND {round}</p>
            <p className={['ca-mono-label text-[0.46rem]', turnSecondsLeft <= 10 ? 'text-ca-red' : 'text-ca-text-2'].join(' ')}>
              TIMER {String(turnSecondsLeft).padStart(2, '0')}S
            </p>
          </div>
          {totalRandomNeeded > 0 ? (
            <p className="ca-display mt-1 text-[1.35rem] leading-tight text-ca-text">
              CHOOSE {totalRandomNeeded} RANDOM ENERGY
            </p>
          ) : activeRows.length === 0 ? (
            <p className="ca-display mt-1 text-[1.35rem] leading-tight text-ca-text">CONFIRM PASS TURN</p>
          ) : (
            <p className="ca-display mt-1 text-[1.35rem] leading-tight text-ca-text">CONFIRM ACTIONS</p>
          )}
        </div>

        {/* ── Execution order tiles (non-pass fighters only) ── */}
        {activeRows.length > 0 ? (
          <div className="border-b border-white/8 px-5 py-3">
            <p className="ca-mono-label mb-2 text-[0.4rem] text-ca-text-3">EXECUTION ORDER — DRAG TO REORDER</p>
            <div className="flex items-end gap-2.5">
              {activeRows.map((row, index) => {
                const isDragging = dragIndex === index
                const isTarget   = dragOverIndex === index && dragIndex !== index
                const effCost    = row.cost ? resolvedCost(row.fighter.instanceId, row.cost, perActorAlloc) : null
                return (
                  <div
                    key={row.fighter.instanceId}
                    data-tile-index={index}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, index)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={['flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing select-none transition-all touch-none', isDragging ? 'opacity-30' : 'opacity-100'].join(' ')}
                    style={{ transform: isTarget ? 'scale(1.05) translateX(4px)' : undefined }}
                  >
                    <span className="ca-mono-label text-[0.4rem] text-ca-text-3">{index + 1}</span>
                    <div className={['relative h-[3rem] w-[3rem] overflow-hidden rounded-[0.2rem] border-2 bg-[rgba(20,20,28,0.9)]', isTarget ? 'border-ca-teal/60 shadow-[0_0_10px_rgba(5,216,189,0.3)]' : 'border-white/25'].join(' ')}>
                      {row.ability?.icon.src ? (
                        <img src={row.ability.icon.src} alt={row.ability.name} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="grid h-full w-full place-items-center ca-mono-label text-[0.5rem] font-black text-white/20">{row.fighter.shortName.slice(0, 2).toUpperCase()}</div>
                      )}
                      {effCost ? (
                        <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-[0.1rem] bg-[rgba(0,0,0,0.75)] px-0.5 py-0.5">
                          <EnergyCostRow cost={effCost} compact />
                        </div>
                      ) : null}
                    </div>
                    <p className="ca-mono-label max-w-[3rem] truncate text-center text-[0.4rem] text-ca-text-2">{row.fighter.shortName.toUpperCase()}</p>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* ── Energy pool + random allocation ── */}
        <div className="px-5 py-4">
          {/* Column headers */}
          <div className={['mb-2 items-center gap-x-2', totalRandomNeeded > 0 ? 'grid grid-cols-[1fr_1.6rem_1.6rem_2.2rem]' : 'flex'].join(' ')}>
            <p className="ca-mono-label text-[0.42rem] text-ca-text-3">ENERGY LEFT</p>
            {totalRandomNeeded > 0 ? (
              <><span /><span /><p className="ca-mono-label text-right text-[0.42rem] text-ca-text-3">RANDOM</p></>
            ) : null}
          </div>

          <div className="space-y-2">
            {battleEnergyOrder.map((type) => {
              const meta      = battleEnergyMeta[type]
              const poolCount = getEnergyCount(energy, type)
              const allocated = globalAlloc[type] ?? 0
              const atMax     = totalAllocated >= totalRandomNeeded
              const dim       = poolCount === 0 && allocated === 0
              return (
                <div
                  key={type}
                  className={['items-center gap-x-2', totalRandomNeeded > 0 ? 'grid grid-cols-[1fr_1.6rem_1.6rem_2.2rem]' : 'flex gap-2'].join(' ')}
                >
                  {/* Left: square + label + pool count */}
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-[0.6rem] w-[0.6rem] shrink-0 rounded-[0.1rem]"
                      style={{ background: meta.color, opacity: dim ? 0.2 : 1 }}
                    />
                    <span
                      className="ca-mono-label w-[2.2rem] text-[0.52rem]"
                      style={{ color: dim ? 'rgba(255,255,255,0.2)' : meta.color }}
                    >
                      {meta.short}
                    </span>
                    <span className={['ca-mono-label text-[0.52rem] tabular-nums', dim ? 'text-white/20' : 'text-ca-text'].join(' ')}>
                      {poolCount}
                    </span>
                  </div>

                  {totalRandomNeeded > 0 ? (
                    <>
                      {/* — button */}
                      <button
                        type="button"
                        disabled={allocated <= 0}
                        onClick={() => adjustGlobalAlloc(type, -1)}
                        className="grid h-[1.3rem] w-[1.3rem] place-items-center rounded border border-white/15 bg-[rgba(255,255,255,0.05)] ca-mono-label text-[0.75rem] text-ca-text-2 transition hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-20 disabled:cursor-not-allowed"
                      >−</button>

                      {/* + button */}
                      <button
                        type="button"
                        disabled={poolCount === 0 || allocated >= poolCount || atMax}
                        onClick={() => adjustGlobalAlloc(type, 1)}
                        className="grid h-[1.3rem] w-[1.3rem] place-items-center rounded border border-white/15 bg-[rgba(255,255,255,0.05)] ca-mono-label text-[0.75rem] text-ca-text-2 transition hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-20 disabled:cursor-not-allowed"
                      >+</button>

                      {/* Right: allocated amount */}
                      <p
                        className="ca-mono-label text-right text-[0.52rem] tabular-nums"
                        style={{ color: allocated > 0 ? meta.color : 'rgba(255,255,255,0.2)' }}
                      >
                        {allocated}
                      </p>
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="mt-3">
            {hasUnallocated ? (
              <p className="ca-mono-label text-[0.44rem] text-amber-300">{totalRandomNeeded - totalAllocated} ENERGY REMAINING TO ASSIGN</p>
            ) : activeRows.length === 0 ? (
              <p className="ca-mono-label text-[0.44rem] text-ca-text-2">NO TECHNIQUES QUEUED. ALL FIGHTERS WILL PASS.</p>
            ) : !canAfford ? (
              <p className="ca-mono-label text-[0.44rem] text-ca-red">CANNOT AFFORD THIS QUEUE</p>
            ) : (
              <p className="ca-mono-label text-[0.44rem] text-ca-teal">READY TO COMMIT</p>
            )}
          </div>
        </div>

        {/* ── OK / Cancel ── */}
        <div className="grid grid-cols-2 gap-3 border-t border-white/8 px-5 py-4">
          <button
            type="button"
            disabled={!canAfford || hasUnallocated}
            onClick={() => onConfirm(order)}
            className="ca-display rounded-lg border border-ca-teal/35 bg-[linear-gradient(180deg,rgba(5,216,189,0.16),rgba(5,216,189,0.07))] py-2.5 text-[1.05rem] text-ca-teal transition hover:brightness-110 disabled:opacity-35 disabled:cursor-not-allowed"
          >
            OK
          </button>
          <button
            type="button"
            onClick={onBack}
            className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] py-2.5 text-[1.05rem] text-ca-text transition hover:bg-[rgba(36,34,48,0.8)]"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}
