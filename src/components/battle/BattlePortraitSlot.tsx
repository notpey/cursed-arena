import { ProgressBar } from '@/components/ui/ProgressBar'
import { isAlive } from '@/features/battle/engine'
import { hasStatus } from '@/features/battle/statuses'
import type { BattleFighterState } from '@/features/battle/types'
import { cn, getAccentStyles, type DisplayAccent } from '@/components/battle/battleDisplay'

function rarityBorder(rarity: BattleFighterState['rarity']) {
  if (rarity === 'UR') return 'border-ca-red/60'
  if (rarity === 'SSR') return 'border-amber-300/60'
  if (rarity === 'SR') return 'border-orange-300/50'
  return 'border-white/20'
}

function rarityWash(rarity: BattleFighterState['rarity']) {
  if (rarity === 'UR') return 'bg-[radial-gradient(circle_at_50%_30%,rgba(255,54,95,0.18),transparent_70%)]'
  if (rarity === 'SSR') return 'bg-[radial-gradient(circle_at_50%_30%,rgba(252,211,77,0.16),transparent_70%)]'
  if (rarity === 'SR') return 'bg-[radial-gradient(circle_at_50%_30%,rgba(251,146,60,0.14),transparent_70%)]'
  return 'bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_70%)]'
}

function rarityTextColor(rarity: BattleFighterState['rarity']) {
  if (rarity === 'UR') return 'text-ca-red/70'
  if (rarity === 'SSR') return 'text-amber-300/70'
  if (rarity === 'SR') return 'text-orange-300/60'
  return 'text-white/40'
}

function PortraitSquare({
  fighter,
  dimmed = false,
  size = '4.2rem',
  mirrored = false,
}: {
  fighter: BattleFighterState
  dimmed?: boolean
  size?: string
  mirrored?: boolean
}) {
  const initial = fighter.shortName[0]?.toUpperCase() ?? '?'
  const portraitMode = Boolean(
    fighter.boardPortraitSrc &&
      (fighter.boardPortraitSrc !== fighter.renderSrc || fighter.boardPortraitSrc.startsWith('data:image')),
  )
  const frame = portraitMode ? {} : fighter.boardPortraitFrame ?? {}
  const portraitScale = frame.scale ?? 1
  const portraitX = frame.x ?? '0%'
  const portraitY = frame.y ?? '0%'
  const portraitOpacity = frame.opacity ?? 1
  const portraitWidth = frame.maxWidth ?? '100%'

  return (
    <div
      className={cn(
        'relative aspect-square overflow-hidden rounded-[0.2rem] border-2 bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))]',
        rarityBorder(fighter.rarity),
        dimmed && 'opacity-45 saturate-75',
      )}
      style={{ width: size }}
    >
      <div className={cn('absolute inset-0', rarityWash(fighter.rarity))} />

      {fighter.boardPortraitSrc ? (
        <div className="absolute inset-0 overflow-hidden">
          {portraitMode ? (
            <img
              src={fighter.boardPortraitSrc}
              alt={fighter.shortName}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
              style={{
                opacity: portraitOpacity,
                transform: mirrored ? 'scaleX(-1)' : undefined,
              }}
              draggable={false}
            />
          ) : (
            <img
              src={fighter.boardPortraitSrc}
              alt={fighter.shortName}
              className="pointer-events-none absolute left-1/2 top-0 h-full max-w-none select-none object-cover"
              style={{
                width: portraitWidth,
                opacity: portraitOpacity,
                transform: `translate(-50%, 0) translate(${portraitX}, ${portraitY}) scale(${mirrored ? -portraitScale : portraitScale}, ${portraitScale})`,
                transformOrigin: 'top center',
              }}
              draggable={false}
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.26))]" />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span
            className={cn('ca-display select-none text-[1.6rem] leading-none', rarityTextColor(fighter.rarity))}
            style={{ fontSize: size === '3.8rem' ? '1.3rem' : '1.6rem' }}
          >
            {initial}
          </span>
        </div>
      )}

      {!fighter.boardPortraitSrc ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-[linear-gradient(180deg,transparent,rgba(5,5,8,0.55))]" />
      )}

      {!isAlive(fighter) ? (
        <div className="absolute inset-0 grid place-items-center bg-black/72">
          <span className="text-[1.8rem] font-black text-white/40">X</span>
        </div>
      ) : null}
    </div>
  )
}

export function BattlePortraitSlot({
  fighter,
  accent,
  active = false,
  targetable = false,
  selectedTarget = false,
  muted = false,
  compact = false,
  mirrored = false,
  showName = false,
  hideHp = false,
  statusLabels = [],
  carryoverLabels = [],
  onClick,
}: {
  fighter: BattleFighterState
  accent: DisplayAccent
  active?: boolean
  targetable?: boolean
  selectedTarget?: boolean
  muted?: boolean
  compact?: boolean
  mirrored?: boolean
  showName?: boolean
  hideHp?: boolean
  statusLabels?: string[]
  carryoverLabels?: string[]
  onClick?: () => void
}) {
  const accentStyles = getAccentStyles(accent)
  const hpValue = (fighter.hp / fighter.maxHp) * 100
  const portraitSize = compact ? '3.8rem' : '6rem'
  const statusTag = fighter.hp <= 0
    ? 'KO'
    : hasStatus(fighter.statuses, 'stun')
      ? 'STUN'
      : hasStatus(fighter.statuses, 'invincible')
        ? 'VOID'
        : null

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group relative w-fit text-left transition',
        muted && 'opacity-35 saturate-75',
        !isAlive(fighter) && 'opacity-55 grayscale',
        onClick ? 'cursor-pointer hover:-translate-y-[1px]' : 'cursor-default',
      )}
    >
      {carryoverLabels.length > 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-2 flex-wrap justify-center gap-0.5">
          {carryoverLabels.slice(0, 2).map((label) => (
            <span key={`${fighter.instanceId}-carry-${label}`} className="rounded-full border border-amber-300/24 bg-amber-300/12 px-1.5 py-0.5 ca-mono-label text-[0.42rem] text-amber-200 shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          'rounded-[0.2rem] p-0.5 transition',
          active && accentStyles.glow,
          targetable && 'shadow-[0_0_0_2px_rgba(255,209,102,0.5),0_0_18px_rgba(255,209,102,0.2)]',
          selectedTarget && 'shadow-[0_0_0_2px_rgba(255,255,255,0.55),0_0_18px_rgba(255,255,255,0.2)]',
        )}
      >
        <PortraitSquare fighter={fighter} dimmed={muted} size={portraitSize} mirrored={mirrored} />
      </div>

      {statusTag ? (
        <span className="pointer-events-none absolute right-0 top-0 rounded-full border border-white/12 bg-black/60 px-1.5 py-0.5 ca-mono-label text-[0.42rem] text-amber-200 shadow-[0_4px_10px_rgba(0,0,0,0.24)]">
          {statusTag}
        </span>
      ) : null}

      {targetable ? (
        <span className="pointer-events-none absolute left-0 top-0 rounded-full border border-amber-300/30 bg-amber-300/12 px-1.5 py-0.5 ca-mono-label text-[0.42rem] text-amber-200 shadow-[0_4px_10px_rgba(0,0,0,0.24)]">
          TARGET
        </span>
      ) : null}

      {showName ? <p className="mt-1 ca-display truncate text-[0.62rem] leading-none text-ca-text">{fighter.shortName.toUpperCase()}</p> : null}

      {!hideHp ? (
        <div className="mt-1" style={{ width: portraitSize }}>
          <div className="relative overflow-hidden rounded-[0.1rem] border border-white/10 bg-black/60">
            <ProgressBar value={hpValue} tone="green" className="h-[0.85rem] bg-black/60" />
            <span className="absolute inset-0 flex items-center justify-center ca-mono-label text-[0.5rem] text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
              {fighter.hp}/{fighter.maxHp}
            </span>
          </div>
        </div>
      ) : null}

      {statusLabels.length > 0 ? (
        <div className="mt-0.5 flex flex-wrap gap-0.5" style={{ width: portraitSize }}>
          {statusLabels.slice(0, 2).map((label) => (
            <span key={`${fighter.instanceId}-${label}`} className="rounded-[0.1rem] border border-white/10 bg-black/45 px-1 py-0.5 ca-mono-label text-[0.42rem] text-ca-text">
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  )
}
