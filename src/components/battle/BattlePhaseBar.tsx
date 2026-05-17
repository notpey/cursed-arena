import type { TurnPhase } from '@/features/battle/types'

export type BattlePhaseBarProps = {
  phase: TurnPhase
  round: number
  /** True when timeline animation is running (resolution lockout). */
  resolving: boolean
  /** True when the player's command window is open and they can queue actions. */
  playerCanAct: boolean
  /** True when this is an online match (not local/AI). */
  isOnline: boolean
  /** True when the online match is waiting on the opponent's command. */
  waitingForOpponent: boolean
}

type PhaseInfo = {
  label: string
  sub: string | null
  accent: 'teal' | 'red' | 'gold' | 'frost'
}

function derivePhaseInfo(props: BattlePhaseBarProps): PhaseInfo {
  const { phase, resolving, playerCanAct, waitingForOpponent } = props

  if (phase === 'finished') {
    return { label: 'Match Concluded', sub: null, accent: 'gold' }
  }

  if (resolving) {
    return { label: 'Resolving Actions', sub: 'Queue locked.', accent: 'red' }
  }

  if (waitingForOpponent) {
    return { label: 'Waiting for Opponent', sub: 'Enemy command in progress…', accent: 'red' }
  }

  if (playerCanAct) {
    const window = phase === 'firstPlayerCommand' || phase === 'secondPlayerCommand'
      ? (phase === 'firstPlayerCommand' ? 'Opening Command' : 'Response Command')
      : 'Your Command'
    return { label: window, sub: 'Queue your actions and press Ready.', accent: 'teal' }
  }

  if (phase === 'roundEnd') {
    return { label: 'Round End', sub: 'Processing status and cooldown ticks…', accent: 'frost' }
  }

  if (phase === 'coinFlip') {
    return { label: 'Battle Start', sub: 'Determining first actor…', accent: 'gold' }
  }

  if (phase === 'firstPlayerResolve' || phase === 'secondPlayerResolve') {
    return { label: 'Resolving Actions', sub: 'Queue locked.', accent: 'red' }
  }

  return { label: 'Enemy Command', sub: 'Waiting for enemy…', accent: 'red' }
}

const accentClasses: Record<PhaseInfo['accent'], { bar: string; label: string; dot: string }> = {
  teal: {
    bar: 'border-ca-teal/22 bg-[linear-gradient(90deg,rgba(6,220,194,0.06),rgba(6,220,194,0.03))]',
    label: 'text-ca-teal',
    dot: 'bg-ca-teal',
  },
  red: {
    bar: 'border-ca-red/22 bg-[linear-gradient(90deg,rgba(252,43,71,0.07),rgba(252,43,71,0.03))]',
    label: 'text-ca-red',
    dot: 'bg-ca-red',
  },
  gold: {
    bar: 'border-amber-300/22 bg-[linear-gradient(90deg,rgba(252,211,77,0.06),rgba(252,211,77,0.03))]',
    label: 'text-amber-300',
    dot: 'bg-amber-300',
  },
  frost: {
    bar: 'border-white/12 bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]',
    label: 'text-ca-text-2',
    dot: 'bg-white/50',
  },
}

export function BattlePhaseBar(props: BattlePhaseBarProps) {
  const { phase, round } = props
  const info = derivePhaseInfo(props)
  const styles = accentClasses[info.accent]
  const pulse = info.accent === 'teal' || (info.accent === 'red' && props.resolving)

  return (
    <div
      data-testid="battle-phase-bar"
      className={[
        'flex items-center gap-3 border-b px-3 py-1.5',
        styles.bar,
      ].join(' ')}
    >
      {/* Status dot */}
      <span
        className={[
          'h-1.5 w-1.5 shrink-0 rounded-full',
          styles.dot,
          pulse ? 'animate-pulse' : '',
        ].join(' ')}
        aria-hidden
      />

      {/* Round badge */}
      <span
        data-testid="battle-phase-bar-round"
        className="ca-mono-label shrink-0 rounded-[0.18rem] border border-white/10 bg-white/5 px-1.5 py-0.5 text-[0.52rem] text-ca-text-2"
      >
        R{round}
      </span>

      {/* Phase label */}
      <span
        data-testid="battle-phase-bar-label"
        className={['ca-mono-label text-[0.6rem] font-semibold tracking-[0.1em]', styles.label].join(' ')}
      >
        {props.phase === 'finished' ? 'MATCH CONCLUDED' : info.label.toUpperCase()}
      </span>

      {/* Sub-message */}
      {info.sub ? (
        <span
          data-testid="battle-phase-bar-sub"
          className="ca-mono-label truncate text-[0.52rem] text-ca-text-3"
        >
          {info.sub}
        </span>
      ) : null}

      {/* Resolving indicator */}
      {props.resolving ? (
        <span
          data-testid="battle-phase-bar-resolving"
          className="ml-auto shrink-0 ca-mono-label text-[0.52rem] text-ca-text-3"
        >
          LOCKED
        </span>
      ) : null}

      {/* Phase type tag — hidden on small screens */}
      {phase !== 'finished' && !props.resolving ? (
        <span className="ml-auto shrink-0 ca-mono-label hidden text-[0.5rem] text-ca-text-3 xl:block">
          {phase}
        </span>
      ) : null}
    </div>
  )
}
