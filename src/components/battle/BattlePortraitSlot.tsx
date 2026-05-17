import { useEffect, useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import { isAlive } from '@/features/battle/engine'
import { hasStatus } from '@/features/battle/statuses'
import type { BattleFighterState, QueuedBattleAction } from '@/features/battle/types'
import { cn, getAccentStyles, getActivePips, type ActiveEffectLine, type ActiveEffectPip, type ActivePipTone, type DisplayAccent } from '@/components/battle/battleDisplay'

type FlashKind = 'damage' | 'heal' | 'shield-break' | null

/**
 * Tracks HP / shield deltas across renders so the portrait can flash a
 * damage / heal / shield-break overlay. Pure UI; the engine is unaware.
 *
 * The previous HP and shield are stored in state and updated together with
 * the flash whenever the inputs differ — React's "derive state from props"
 * pattern. A single effect clears the flash after the keyframe completes.
 */
function useHpFeedback(fighter: BattleFighterState): { flash: FlashKind; seq: number } {
  const currentShield = fighter.shield?.amount ?? 0
  const [snapshot, setSnapshot] = useState<{ hp: number; shield: number; flash: FlashKind; seq: number }>(() => ({
    hp: fighter.hp,
    shield: currentShield,
    flash: null,
    seq: 0,
  }))

  if (snapshot.hp !== fighter.hp || snapshot.shield !== currentShield) {
    let nextFlash: FlashKind = snapshot.flash
    if (snapshot.shield > 0 && currentShield === 0) nextFlash = 'shield-break'
    else if (fighter.hp < snapshot.hp) nextFlash = 'damage'
    else if (fighter.hp > snapshot.hp) nextFlash = 'heal'
    setSnapshot({
      hp: fighter.hp,
      shield: currentShield,
      flash: nextFlash,
      seq: nextFlash !== snapshot.flash || nextFlash !== null ? snapshot.seq + 1 : snapshot.seq,
    })
  }

  useEffect(() => {
    if (!snapshot.flash) return undefined
    const timer = window.setTimeout(() => {
      setSnapshot((s) => (s.flash ? { ...s, flash: null } : s))
    }, 540)
    return () => window.clearTimeout(timer)
  }, [snapshot.flash, snapshot.seq])

  return { flash: snapshot.flash, seq: snapshot.seq }
}

// ── Tone → border/glow ───────────────────────────────────────────────────────
function pipToneBorder(tone: ActivePipTone): string {
  switch (tone) {
    case 'burn':    return 'border-ca-red/50'
    case 'stun':    return 'border-amber-300/50'
    case 'heal':    return 'border-emerald-400/50'
    case 'buff':    return 'border-ca-teal/38'
    case 'debuff':  return 'border-purple-400/50'
    case 'void':    return 'border-sky-300/50'
    default:        return 'border-white/22'
  }
}

function pipToneGlow(tone: ActivePipTone): string {
  switch (tone) {
    case 'burn':    return 'shadow-[0_0_6px_rgba(252,43,71,0.48)]'
    case 'stun':    return 'shadow-[0_0_5px_rgba(252,211,77,0.4)]'
    case 'heal':    return 'shadow-[0_0_5px_rgba(52,211,153,0.4)]'
    case 'buff':    return 'shadow-[0_0_6px_rgba(6,220,194,0.38)]'
    case 'debuff':  return 'shadow-[0_0_5px_rgba(192,132,252,0.42)]'
    case 'void':    return 'shadow-[0_0_5px_rgba(125,211,252,0.4)]'
    default:        return 'shadow-[0_0_5px_rgba(255,255,255,0.12)]'
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

// ── Icon tone → fallback bg (kept subtle so skill art reads through) ─────────
function iconToneFallbackBg(tone: import('@/features/battle/types').BattleBoardAccent): string {
  if (tone === 'teal')  return 'bg-[rgba(6,220,194,0.075)]'
  if (tone === 'red')   return 'bg-[rgba(252,43,71,0.075)]'
  if (tone === 'gold')  return 'bg-[rgba(252,211,77,0.06)]'
  return 'bg-[rgba(200,210,230,0.04)]'
}

function lineDurationLabel(line: ActiveEffectLine): { text: string; cls: string } | null {
  if (line.permanent) return { text: 'INFINITE', cls: 'text-ca-text-3' }
  if (line.turnsLeft === null) return null
  if (line.turnsLeft <= 1) return { text: 'ENDS THIS TURN', cls: 'text-ca-red' }
  return { text: `${line.turnsLeft} TURNS LEFT`, cls: 'text-ca-text-3' }
}

function PipTooltip({ pip, tooltipDown = false }: { pip: ActiveEffectPip; tooltipDown?: boolean }) {
  const border = pipToneBorder(pip.tone)
  const badgeCls = pipToneBadge(pip.tone)
  const iconSrc = normalizeBattleAssetSrc(pip.iconSrc)

  // Show stack badge in header; omit turn count since each line shows its own duration
  const hasStackMeta = pip.stackCount !== null && pip.stackCount > 0

  return (
    <div className={cn(
      'pointer-events-none rounded-[0.55rem] border p-3 shadow-[0_22px_46px_rgba(0,0,0,0.62)] backdrop-blur-md',
      border,
      'bg-[radial-gradient(circle_at_10%_0%,rgba(5,216,189,0.1),transparent_42%),linear-gradient(180deg,rgba(18,16,28,0.99),rgba(8,7,14,0.99))]',
    )}>
      <div className="flex items-start gap-2.5">
        <div className={cn('relative h-10 w-10 shrink-0 overflow-hidden rounded-[0.24rem] border', border)}>
          {iconSrc ? (
            <img src={iconSrc} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className={cn('grid h-full w-full place-items-center', iconToneFallbackBg(pip.iconTone))}>
              <span className="ca-mono-label text-[0.62rem] font-bold text-white/80">{pip.iconLabel}</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-3 bg-[linear-gradient(transparent,rgba(0,0,0,0.72))]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="ca-display text-[1rem] leading-none tracking-[0.06em] text-ca-text">{pip.label.toUpperCase()}</p>
            {hasStackMeta ? (
              <span className={cn('rounded-[0.18rem] px-1.5 py-0.5 ca-mono-label text-[0.52rem] leading-none shrink-0', badgeCls)}>
                {pip.stackCount} STACK{pip.stackCount === 1 ? '' : 'S'}
              </span>
            ) : null}
          </div>

          {pip.lines.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {pip.lines.map((line, i) => {
                const dur = lineDurationLabel(line)
                return (
                  <li key={i}>
                    <p className="text-[0.72rem] leading-snug text-ca-text-2">
                      {'- '}{line.text}
                    </p>
                    {dur ? (
                      <p className={cn('mt-0.5 ca-mono-label text-[0.55rem] leading-none', dur.cls)}>
                        {dur.text}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>

      <div className={cn(
        'absolute left-1/2 h-3 w-3 -translate-x-1/2',
        tooltipDown
          ? '-top-[6px] rotate-[225deg] border-b border-r'
          : '-bottom-[6px] rotate-45 border-b border-r',
        border,
        'bg-[rgba(10,9,18,0.98)]',
      )} />
    </div>
  )
}

function ActivePip({ pip, mirrored = false, tooltipDown = false }: { pip: ActiveEffectPip; mirrored?: boolean; tooltipDown?: boolean }) {
  const [hovered, setHovered] = useState(false)
  const border = pipToneBorder(pip.tone)
  const glow = pipToneGlow(pip.tone)
  const iconSrc = normalizeBattleAssetSrc(pip.iconSrc)

  return (
    <div
      className={cn('relative', hovered && 'z-[260]')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Main pip square — full-bleed icon */}
      <div className={cn(
        'relative h-[1.65rem] w-[1.65rem] shrink-0 cursor-default overflow-hidden rounded-[0.18rem] border bg-black/55 transition duration-150',
        hovered ? `${border} ${glow} brightness-110` : 'border-white/16',
      )}>
        {iconSrc ? (
          <img
            src={iconSrc}
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
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_38%,rgba(0,0,0,0.24))]" />

        {/* Turn badge — bottom-right */}
        {/* Stack count — center overlay */}
        {pip.stackCount !== null && pip.stackCount > 0 ? (
          <div className="pointer-events-none absolute right-[1px] top-[1px] z-10 min-w-[0.78rem] rounded-[0.1rem] bg-black/76 px-[2px] py-[1px] text-center shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
            <span className="ca-mono-label text-[0.42rem] leading-none text-white">
              {pip.stackCount}
            </span>
          </div>
        ) : null}
      </div>

      {/* Tooltip — opens downward for player strips, upward for enemies */}
      {hovered ? (
        <div className={cn(
          'pointer-events-none absolute z-[260] w-80 max-w-[calc(100vw-2rem)]',
          tooltipDown
            ? 'top-[calc(100%+5px)]'
            : 'bottom-[calc(100%+5px)]',
          mirrored ? 'right-0' : 'left-1/2 -translate-x-1/2',
        )}>
          <PipTooltip pip={pip} tooltipDown={tooltipDown} />
        </div>
      ) : null}
    </div>
  )
}

export function ActiveEffectPips({
  fighter,
  mirrored = false,
  tooltipDown = false,
  column = false,
  hidden = false,
  className,
}: {
  fighter: BattleFighterState
  mirrored?: boolean
  tooltipDown?: boolean
  /** Stack pips vertically instead of wrapping horizontally */
  column?: boolean
  /** Suppress all pips (e.g. during skill/target selection) */
  hidden?: boolean
  className?: string
}) {
  const pips = getActivePips(fighter)

  if (hidden) {
    // Reserve column space so the layout doesn't jump during targeting
    if (column) {
      return <div className={cn('flex flex-col gap-1', mirrored ? 'items-end' : 'items-start', className)} />
    }
    return null
  }

  if (column) {
    return (
      <div className={cn('flex flex-col gap-1', mirrored ? 'items-end' : 'items-start', className)}>
        {pips.map((pip) => (
          <ActivePip key={pip.key} pip={pip} mirrored={mirrored} tooltipDown={tooltipDown} />
        ))}
      </div>
    )
  }

  if (pips.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1', mirrored ? 'justify-end' : 'justify-start', className)}>
      {pips.map((pip) => (
        <ActivePip key={pip.key} pip={pip} mirrored={mirrored} tooltipDown={tooltipDown} />
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

export type PortraitStateBadge = {
  key: string
  label: string
  title: string
  tone: 'red' | 'gold' | 'teal' | 'blue' | 'purple' | 'frost'
}

function portraitBadgeClasses(tone: PortraitStateBadge['tone']) {
  switch (tone) {
    case 'red': return 'border-ca-red/38 bg-ca-red/18 text-ca-red'
    case 'gold': return 'border-amber-300/36 bg-amber-300/14 text-amber-200'
    case 'teal': return 'border-ca-teal/34 bg-ca-teal/13 text-ca-teal'
    case 'blue': return 'border-sky-300/34 bg-sky-300/12 text-sky-200'
    case 'purple': return 'border-purple-300/36 bg-purple-300/13 text-purple-200'
    default: return 'border-white/16 bg-black/58 text-ca-text-2'
  }
}

/**
 * Portrait badge priority rules:
 * KO overrides every other tactical state. After that, action-denial states
 * lead, defensive/reaction states stay visible, and slower setup/debuff
 * states collapse behind +N when the portrait would become noisy.
 */
function getPortraitStateBadges(
  fighter: BattleFighterState,
  options: {
    queuedAction?: QueuedBattleAction
    delayedEffectCount?: number
  } = {},
): PortraitStateBadge[] {
  if (!isAlive(fighter)) {
    return [{ key: 'ko', label: 'KO', title: 'Defeated', tone: 'red' }]
  }

  const badges: PortraitStateBadge[] = []
  const add = (badge: PortraitStateBadge) => badges.push(badge)

  if (hasStatus(fighter.statuses, 'stun')) {
    add({ key: 'stun', label: 'STUN', title: 'Stunned — cannot use any skills this turn', tone: 'gold' })
  }
  if (fighter.classStuns.length > 0) {
    add({ key: 'class-lock', label: 'SEAL', title: 'Skill class sealed — certain skill types are unavailable', tone: 'gold' })
  }
  if (fighter.intentStuns.length > 0) {
    add({ key: 'intent-lock', label: 'LOCK', title: 'Skill intent locked — harmful or helpful skills are unavailable', tone: 'gold' })
  }
  if (hasStatus(fighter.statuses, 'invincible')) {
    add({ key: 'invulnerable', label: 'INVUL', title: 'Invulnerable — immune to all damage and harmful effects', tone: 'teal' })
  }
  if (fighter.shield && fighter.shield.amount > 0) {
    add({ key: 'shield', label: `${fighter.shield.amount}`, title: `${fighter.shield.amount} destructible defense — absorbs damage before HP is lost`, tone: 'blue' })
  }
  if (fighter.reactionGuards.some((guard) => guard.kind === 'counter' && guard.remainingRounds > 0 && guard.visible !== false)) {
    add({ key: 'counter', label: 'CNTR', title: 'Counter armed — will retaliate when targeted', tone: 'red' })
  }
  if (fighter.reactionGuards.some((guard) => guard.kind === 'reflect' && guard.remainingRounds > 0 && guard.visible !== false)) {
    add({ key: 'reflect', label: 'RFLT', title: 'Reflect armed — will reflect the next skill used on them', tone: 'teal' })
  }
  if (hasStatus(fighter.statuses, 'mark') || fighter.modifiers.some((modifier) => modifier.visible && modifier.statusKind === 'mark')) {
    add({ key: 'mark', label: 'MARK', title: 'Marked — a setup effect is active; hover pips for details', tone: 'purple' })
  }
  if (hasStatus(fighter.statuses, 'burn') || fighter.modifiers.some((modifier) => modifier.visible && modifier.statusKind === 'burn')) {
    add({ key: 'dot', label: 'AFFL', title: 'Affliction active — taking periodic damage; hover pips for details', tone: 'red' })
  }
  if (Object.values(fighter.stateModes).some(Boolean)) {
    add({ key: 'mode', label: 'MODE', title: 'Special form or mode active; hover pips for details', tone: 'teal' })
  }
  if (fighter.effectImmunities.length > 0) {
    add({ key: 'immunity', label: 'IMMU', title: 'Effect immunity active — certain effects cannot be applied', tone: 'blue' })
  }
  if ((options.delayedEffectCount ?? 0) > 0) {
    add({ key: 'delayed', label: 'DLY', title: `${options.delayedEffectCount} delayed effect${options.delayedEffectCount === 1 ? '' : 's'} incoming — hover pips for details`, tone: 'purple' })
  }
  if (options.queuedAction) {
    add({ key: 'queued', label: 'RDY', title: 'Technique queued and ready to resolve', tone: 'teal' })
  }

  return badges
}

function PortraitStateBadges({
  fighter,
  queuedAction,
  delayedEffectCount = 0,
}: {
  fighter: BattleFighterState
  queuedAction?: QueuedBattleAction
  delayedEffectCount?: number
}) {
  const badges = getPortraitStateBadges(fighter, { queuedAction, delayedEffectCount })
  const visible = badges.slice(0, 4)
  const overflow = badges.slice(4)
  const title = badges.map((badge) => badge.title).join('; ')

  if (badges.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute -left-1 -top-1 z-20 flex max-w-[calc(100%+0.5rem)] flex-wrap gap-0.5"
      title={title}
      aria-label={title}
    >
      {visible.map((badge) => (
        <span
          key={badge.key}
          className={cn('rounded-[0.12rem] border px-1 py-0.5 ca-mono-label text-[0.42rem] leading-none shadow-[0_4px_10px_rgba(0,0,0,0.34)] backdrop-blur-sm', portraitBadgeClasses(badge.tone))}
          title={badge.title}
        >
          {badge.label}
        </span>
      ))}
      {overflow.length > 0 ? (
        <span
          className="rounded-[0.12rem] border border-white/16 bg-black/62 px-1 py-0.5 ca-mono-label text-[0.42rem] leading-none text-ca-text-2 shadow-[0_4px_10px_rgba(0,0,0,0.34)]"
          title={overflow.map((badge) => badge.title).join('; ')}
        >
          +{overflow.length}
        </span>
      ) : null}
    </div>
  )
}

function PortraitSquare({
  fighter,
  dimmed = false,
  sizeClass = 'w-[4.2rem]',
  mirrored = false,
  flash = null,
  flashSeq = 0,
}: {
  fighter: BattleFighterState
  dimmed?: boolean
  sizeClass?: string
  mirrored?: boolean
  flash?: 'damage' | 'heal' | 'shield-break' | null
  flashSeq?: number
}) {
  const initial = fighter.shortName[0]?.toUpperCase() ?? '?'
  const portraitSrc = normalizeBattleAssetSrc(fighter.boardPortraitSrc)
  const stunned = isAlive(fighter) && hasStatus(fighter.statuses, 'stun')

  return (
    <div
      className={cn(
        'ca-motion-smooth relative aspect-square overflow-hidden rounded-[0.2rem] border-2 bg-[linear-gradient(180deg,rgba(16,15,24,0.96),rgba(5,5,9,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        rarityBorder(fighter.rarity),
        dimmed && 'opacity-45 saturate-75',
        sizeClass,
      )}
    >
      <div className={cn('absolute inset-0', rarityWash(fighter.rarity))} />

      {portraitSrc ? (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={portraitSrc}
            alt={fighter.shortName}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
            draggable={false}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.03),rgba(0,0,0,0.31))]" />
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

      {!portraitSrc ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-[linear-gradient(180deg,transparent,rgba(3,3,6,0.62))]" />
      )}

      {/* Stun shimmer — slow amber pulse overlay while stunned and alive */}
      {stunned ? (
        <div className="pointer-events-none absolute inset-0 bg-amber-300/15 animate-ca-stun-shimmer" />
      ) : null}

      {/* HP / shield feedback overlays — `key` includes seq so back-to-back
          hits of the same kind retrigger the keyframe. */}
      {flash === 'damage' ? (
        <div key={`d-${flashSeq}`} className="pointer-events-none absolute inset-0 bg-ca-red/45 animate-ca-flash-damage" />
      ) : null}
      {flash === 'heal' ? (
        <div key={`h-${flashSeq}`} className="pointer-events-none absolute inset-0 bg-emerald-400/40 animate-ca-flash-heal" />
      ) : null}
      {flash === 'shield-break' ? (
        <div key={`s-${flashSeq}`} className="pointer-events-none absolute inset-0 border-2 border-white/70 animate-ca-flash-shield" />
      ) : null}

      {!isAlive(fighter) ? (
        <div className="absolute inset-0 grid place-items-center bg-black/72 animate-ca-fade-in">
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
  sizeClass: sizeClassOverride,
  carryoverLabels = [],
  queuedAction,
  delayedEffectCount = 0,
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
  sizeClass?: string
  carryoverLabels?: string[]
  queuedAction?: QueuedBattleAction
  delayedEffectCount?: number
  timelineRole?: 'actor' | 'target' | null
  timelineTone?: 'red' | 'teal' | 'gold' | 'frost' | null
  onClick?: () => void
}) {
  const accentStyles = getAccentStyles(accent)
  const hpValue = (fighter.hp / fighter.maxHp) * 100
  const { flash, seq } = useHpFeedback(fighter)
  const portraitSizeClass = sizeClassOverride ?? (compact
    ? 'w-[3rem] sm:w-[3.45rem]'
    : 'w-[4rem] sm:w-[5.25rem]')

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group ca-motion-smooth relative w-fit text-left transition duration-200',
        muted && 'opacity-35 saturate-75',
        !isAlive(fighter) && 'opacity-55 grayscale',
        onClick ? 'cursor-pointer hover:-translate-y-[2px] hover:scale-[1.02]' : 'cursor-default',
        (active || selectedTarget || targetable) && 'animate-ca-selected-breathe',
        flash === 'damage' && 'animate-ca-shake-2px',
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
          'rounded-[0.2rem] p-0.5 transition duration-200',
          active && accentStyles.glow,
          targetable && 'shadow-[0_0_0_2px_rgba(255,209,102,0.58),0_0_22px_rgba(255,209,102,0.3)]',
          selectedTarget && 'shadow-[0_0_0_2px_rgba(255,255,255,0.62),0_0_22px_rgba(255,255,255,0.3)]',
          timelineRole === 'actor' && timelineTone === 'red' && 'shadow-[0_0_0_2px_rgba(252,43,71,0.5),0_0_20px_rgba(252,43,71,0.22)]',
          timelineRole === 'actor' && timelineTone !== 'red' && 'shadow-[0_0_0_2px_rgba(6,220,194,0.5),0_0_20px_rgba(6,220,194,0.22)]',
          timelineRole === 'target' && 'shadow-[0_0_0_2px_rgba(252,211,77,0.45),0_0_20px_rgba(252,211,77,0.16)]',
        )}
      >
        <PortraitSquare fighter={fighter} dimmed={muted} sizeClass={portraitSizeClass} mirrored={mirrored} flash={flash} flashSeq={seq} />
      </div>

      <PortraitStateBadges fighter={fighter} queuedAction={queuedAction} delayedEffectCount={delayedEffectCount} />

      {targetable ? (
        <span className="pointer-events-none absolute left-0 top-0 rounded-full border border-amber-300/30 bg-amber-300/12 px-1.5 py-0.5 ca-mono-label text-[0.42rem] text-amber-200 shadow-[0_4px_10px_rgba(0,0,0,0.24)] animate-ca-fade-in">
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



