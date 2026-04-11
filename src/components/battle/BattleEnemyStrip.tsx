import { BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import { cn, getAccentStyles, getStatusPills, toneClasses } from '@/components/battle/battleDisplay'
import type { BattleFighterState } from '@/features/battle/types'

export function BattleEnemyStrip({
  fighter,
  selectedTarget = false,
  targetable = false,
  muted = false,
  summary,
  onActorClick,
}: {
  fighter: BattleFighterState
  selectedTarget?: boolean
  targetable?: boolean
  muted?: boolean
  summary: string
  onActorClick?: () => void
}) {
  const accentStyles = getAccentStyles('red')
  const statuses = getStatusPills(fighter)
  const portraitStatusLabels = statuses.slice(0, 2).map((pill) => pill.label)
  const knockedOut = fighter.hp <= 0
  const intentLabel = summary === 'Ready' ? 'UNKNOWN' : summary
  const passiveLabel = fighter.passiveEffects?.[0]?.label ?? 'NONE'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[0.3rem] border bg-[rgba(8,8,12,0.95)] shadow-[0_14px_24px_rgba(0,0,0,0.16)] transition',
        targetable ? 'border-white/25 ring-1 ring-white/25' : 'border-white/10',
        selectedTarget && 'ring-2 ring-white/40',
        knockedOut && 'opacity-55 grayscale',
      )}
    >
      <div className="grid gap-2.5 p-2.5 lg:grid-cols-[minmax(0,1fr)_10.4rem] lg:items-stretch">
        <div className="order-2 rounded-[0.25rem] border border-white/8 bg-[rgba(255,255,255,0.03)] p-2.5 lg:order-1">
          <div className="grid h-full gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div className="rounded-[0.25rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-2.5 py-2">
              <p className="ca-mono-label text-[0.6rem] text-ca-text-3">INTENT</p>
              <p className="mt-1 ca-display text-[0.7rem] leading-none text-ca-text">{intentLabel.toUpperCase()}</p>
            </div>
            <div className="rounded-[0.25rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-2.5 py-2">
              <p className="ca-mono-label text-[0.6rem] text-ca-text-3">PASSIVE</p>
              <p className="mt-1 ca-display text-[0.7rem] leading-none text-ca-text">{passiveLabel.toUpperCase()}</p>
            </div>
            <div className="rounded-[0.25rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-2.5 py-2">
              <p className="ca-mono-label text-[0.6rem] text-ca-text-3">ROLE</p>
              <p className="mt-1 ca-display text-[0.7rem] leading-none text-ca-text">{fighter.role.toUpperCase()}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 justify-start lg:justify-end">
            {statuses.length > 0 ? (
              statuses.map((pill) => (
                <span key={`${fighter.instanceId}-${pill.label}`} className={cn('ca-mono-label rounded-full border px-1 py-0.5 text-[0.22rem]', toneClasses(pill.tone))}>
                  {pill.label}
                </span>
              ))
            ) : (
              <span className="ca-mono-label text-[0.6rem] text-ca-text-3">NO ACTIVE EFFECTS</span>
            )}
          </div>
        </div>

        <div className="order-1 rounded-[0.25rem] border border-white/8 bg-[rgba(255,255,255,0.03)] p-2.5 lg:order-2">
          <div className="flex items-center gap-2.5 flex-row-reverse">
            <BattlePortraitSlot
              fighter={fighter}
              accent="red"
              mirrored
              targetable={targetable}
              selectedTarget={selectedTarget}
              muted={muted}
              compact
              statusLabels={portraitStatusLabels}
              onClick={onActorClick}
            />
            <div className="min-w-0 flex-1 text-right">
              <p className="ca-mono-label text-[0.6rem] text-ca-text-3">{fighter.affiliationLabel.toUpperCase()}</p>
              <p className="mt-1 truncate ca-display text-[0.78rem] leading-none text-ca-text">{fighter.battleTitle.toUpperCase()}</p>
              <div className="mt-2 flex flex-wrap justify-end gap-1">
                {targetable ? <span className="rounded-full border border-white/20 bg-white/8 px-1.5 py-0.5 ca-mono-label text-[0.6rem] text-ca-text">TARGET</span> : null}
                {knockedOut ? <span className={cn('rounded-full border px-1.5 py-0.5 ca-mono-label text-[0.6rem]', accentStyles.border, accentStyles.wash, accentStyles.text)}>KO</span> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
