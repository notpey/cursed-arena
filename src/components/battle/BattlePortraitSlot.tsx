import { useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { isAlive } from '@/features/battle/engine'
import { hasStatus } from '@/features/battle/statuses'
import type { BattleFighterState } from '@/features/battle/types'
import { cn, getAccentStyles, getActivePips, type ActiveEffectPip, type ActivePipTone, type DisplayAccent } from '@/components/battle/battleDisplay'

// ── Tone → border/glow ───────────────────────────────────────────────────────
function pipToneBorder(tone: ActivePipTone): string {
  switch (tone) {
    case 'burn':    return 'border-ca-red/60'
    case 'stun':    return 'border-amber-300/60'
    case 'heal':    return 'border-emerald-400/60'
    case 'buff':    return 'border-ca-teal/60'
    case 'debuff':  return 'border-purple-400/60'
    case 'void':    return 'border-sky-300/60'
    default:        return 'border-white/25'
  }
}

function pipToneGlow(tone: ActivePipTone): string {
  switch (tone) {
    case 'burn':    return 'shadow-[0_0_7px_rgba(250,39,66,0.55)]'
    case 'stun':    return 'shadow-[0_0_7px_rgba(252,211,77,0.5)]'
    case 'heal':    return 'shadow-[0_0_7px_rgba(52,211,153,0.5)]'
    case 'buff':    return 'shadow-[0_0_7px_rgba(5,216,189,0.5)]'
    case 'debuff':  return 'shadow-[0_0_7px_rgba(192,132,252,0.5)]'
    case 'void':    return 'shadow-[0_0_7px_rgba(125,211,252,0.5)]'
    default:        return 'shadow-[0_0_7px_rgba(255,255,255,0.15)]'
  }
}

function pipToneBadge(tone: ActivePipTone): string {
  switch (tone) {
    case 'burn':    return 'bg-ca-red text-white'
    case 'stun':    return 'bg-amber-400 text-black'
    case 'heal':    return 'bg-emerald-500 text-white'
    case 'buff':    return 'bg-ca-teal text-black'
    case 'debuff':  return 'bg-purple-500 text-white'
    case 'void':    return 'bg-sky-400 text-black'
    default:        return 'bg-white/30 text-white'
  }
}

// ── Icon tone → fallback bg ───────────────────────────────────────────────────
function iconToneFallbackBg(tone: import('@/features/battle/types').BattleBoardAccent): string {
  if (tone === 'teal')  return 'bg-[rgba(5,216,189,0.18)]'
  if (tone === 'red')   return 'bg-[rgba(250,39,66,0.18)]'
  if (tone === 'gold')  return 'bg-[rgba(252,211,77,0.18)]'
  return 'bg-[rgba(200,210,230,0.10)]'
}

function PipTooltip({ pip }: { pip: ActiveEffectPip }) {
  const border = pipToneBorder(pip.tone)
  return (
    <div className={cn(
      'pointer-events-none rounded-[0.3rem] border p-2 shadow-[0_8px_24px_rgba(0,0,0,0.65)] backdrop-blur-sm',
      border,
      'bg-[rgba(10,9,18,0.97)]',
    )}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="ca-display text-[0.72rem] leading-tight text-ca-text">{pip.label}</p>
        {pip.turnsLeft !== null ? (
          <span className={cn('shrink-0 rounded px-1 py-0.5 ca-mono-label text-[0.42rem] leading-none', pipToneBadge(pip.tone))}>
            {pip.turnsLeft}T
          </span>
        ) : null}
      </div>
      <ul className="space-y-0.5">
        {pip.lines.map((line, i) => (
          <li key={i} className="text-[0.6rem] leading-snug text-ca-text-2 before:mr-1 before:content-['-']">{line}</li>
        ))}
      </ul>
      <div className={cn(
        'absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r',
        border,
        'bg-[rgba(10,9,18,0.97)]',
      )} />
    </div>
  )
}

function ActivePip({ pip, mirrored = false }: { pip: ActiveEffectPip; mirrored?: boolean }) {
  const [hovered, setHovered] = useState(false)
  const border = pipToneBorder(pip.tone)
  const glow = pipToneGlow(pip.tone)
  const badgeCls = pipToneBadge(pip.tone)

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Main pip square — full-bleed icon */}
      <div className={cn(
        'relative h-[2.2rem] w-[2.2rem] shrink-0 cursor-default overflow-hidden rounded-[0.22rem] border-2 transition',
        border,
        hovered ? glow : '',
      )}>
        {pip.iconSrc ? (
          <img
            src={pip.iconSrc}
            alt={pip.label}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className={cn('absolute inset-0 grid place-items-center', iconToneFallbackBg(pip.iconTone))}>
            <span className="ca-mono-label text-[0.48rem] font-bold text-white/80 leading-none">{pip.iconLabel}</span>
          </div>
        )}

        {/* Bottom gradient scrim so badges are readable */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[0.75rem] bg-[linear-gradient(transparent,rgba(0,0,0,0.72))]" />

        {/* Turn badge — bottom-right */}
        {pip.turnsLeft !== null ? (
          <span className={cn(
            'pointer-events-none absolute bottom-[2px] right-[2px] z-10 rounded-[0.1rem] px-[3px] py-[1px] ca-mono-label text-[0.34rem] leading-none',
            badgeCls,
          )}>
            {pip.turnsLeft}
          </span>
        ) : null}

        {/* Stack count — center overlay */}
        {pip.stackCount !== null && pip.stackCount > 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="ca-display text-[0.9rem] font-black leading-none text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {pip.stackCount}
            </span>
          </div>
        ) : null}
      </div>

      {/* Tooltip — flips side when mirrored */}
      {hovered ? (
        <div className={cn(
          'pointer-events-none absolute bottom-[calc(100%+5px)] z-50 w-48',
          mirrored ? 'right-0' : 'left-1/2 -translate-x-1/2',
        )}>
          <PipTooltip pip={pip} />
        </div>
      ) : null}
    </div>
  )
}

export function ActiveEffectPips({
  fighter,
  mirrored = false,
  className,
}: {
  fighter: BattleFighterState
  mirrored?: boolean
  className?: string
}) {
  const pips = getActivePips(fighter)
  if (pips.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1', mirrored ? 'justify-end' : 'justify-start', className)}>
      {pips.map((pip) => (
        <ActivePip key={pip.key} pip={pip} mirrored={mirrored} />
      ))}
    </div>
  )
}

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
  sizeClass = 'w-[4.2rem]',
  mirrored = false,
}: {
  fighter: BattleFighterState
  dimmed?: boolean
  sizeClass?: string
  mirrored?: boolean
}) {
  const initial = fighter.shortName[0]?.toUpperCase() ?? '?'

  return (
    <div
      className={cn(
        'relative aspect-square overflow-hidden rounded-[0.2rem] border-2 bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))]',
        rarityBorder(fighter.rarity),
        dimmed && 'opacity-45 saturate-75',
        sizeClass,
      )}
    >
      <div className={cn('absolute inset-0', rarityWash(fighter.rarity))} />

      {fighter.boardPortraitSrc ? (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={fighter.boardPortraitSrc}
            alt={fighter.shortName}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
            draggable={false}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.26))]" />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span
            className={cn('ca-display select-none text-[1.6rem] leading-none', rarityTextColor(fighter.rarity))}
            style={{ fontSize: sizeClass.includes('3.2rem') ? '1.1rem' : sizeClass.includes('4.2rem') ? '1.3rem' : '1.6rem' }}
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
  carryoverLabels = [],
  timelineRole = null,
  timelineTone = null,
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
  carryoverLabels?: string[]
  timelineRole?: 'actor' | 'target' | null
  timelineTone?: 'red' | 'teal' | 'gold' | 'frost' | null
  onClick?: () => void
}) {
  const accentStyles = getAccentStyles(accent)
  const hpValue = (fighter.hp / fighter.maxHp) * 100
  // Responsive portrait sizes: smaller on narrow viewports, grow at sm+
  const portraitSizeClass = compact
    ? 'w-[3.2rem] sm:w-[3.8rem]'
    : 'w-[4.5rem] sm:w-[6rem]'
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
          timelineRole === 'actor' && timelineTone === 'red' && 'shadow-[0_0_0_2px_rgba(250,39,66,0.5),0_0_20px_rgba(250,39,66,0.2)]',
          timelineRole === 'actor' && timelineTone !== 'red' && 'shadow-[0_0_0_2px_rgba(5,216,189,0.5),0_0_20px_rgba(5,216,189,0.2)]',
          timelineRole === 'target' && 'shadow-[0_0_0_2px_rgba(252,211,77,0.45),0_0_20px_rgba(252,211,77,0.16)]',
        )}
      >
        <PortraitSquare fighter={fighter} dimmed={muted} sizeClass={portraitSizeClass} mirrored={mirrored} />
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
        <div className={cn('mt-1', portraitSizeClass)}>
          <div className="relative overflow-hidden rounded-[0.1rem] border border-white/10 bg-black/60">
            <ProgressBar value={hpValue} tone="green" className="h-[0.85rem] bg-black/60" />
            <span className="absolute inset-0 flex items-center justify-center ca-mono-label text-[0.5rem] text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
              {fighter.hp}/{fighter.maxHp}
            </span>
          </div>
        </div>
      ) : null}
    </button>
  )
}



