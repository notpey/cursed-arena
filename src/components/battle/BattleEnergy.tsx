import {
  battleEnergyMeta,
  battleEnergyOrder,
  type BattleEnergyCost,
  type BattleEnergyPool,
  type BattleEnergyType,
} from '@/features/battle/energy'
import { cn } from '@/components/battle/battleDisplay'

function getCostEntries(cost: BattleEnergyCost) {
  return battleEnergyOrder.flatMap((type) => Array.from({ length: cost[type] ?? 0 }, () => type))
}

export function EnergyPip({ type, small = false }: { type: BattleEnergyType; small?: boolean }) {
  const meta = battleEnergyMeta[type]

  return (
    <span
      className={cn('rounded-full border shadow-[0_0_12px_var(--energy-glow)]', small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')}
      style={{
        backgroundColor: meta.color,
        borderColor: meta.border,
        boxShadow: `0 0 12px ${meta.glow}`,
      }}
      title={meta.label}
    />
  )
}

export function EnergyCostRow({ cost, compact = false }: { cost: BattleEnergyCost; compact?: boolean }) {
  const entries = getCostEntries(cost)
  if (entries.length === 0) return <span className="ca-mono-label text-[0.6rem] text-ca-text-3">FREE</span>

  return (
    <div className="flex flex-wrap items-center gap-1">
      {entries.map((type, index) => (
        <EnergyPip key={`${type}-${index}`} type={type} small={compact} />
      ))}
    </div>
  )
}

function FocusChip({
  type,
  active,
  available,
  disabled,
  onSelect,
}: {
  type: BattleEnergyType
  active: boolean
  available: boolean
  disabled: boolean
  onSelect?: (type: BattleEnergyType) => void
}) {
  const meta = battleEnergyMeta[type]

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect ? () => onSelect(type) : undefined}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-1 transition',
        active ? 'bg-[rgba(255,255,255,0.08)] text-ca-text' : 'bg-[rgba(255,255,255,0.03)] text-ca-text-3',
        disabled && 'cursor-default opacity-70',
        !disabled && 'hover:bg-[rgba(255,255,255,0.06)]',
      )}
      style={{
        borderColor: active ? meta.border : 'rgba(255,255,255,0.08)',
        boxShadow: active ? `0 0 14px ${meta.glow}` : 'none',
      }}
      title={available ? `${meta.label} focus ready` : `${meta.label} focus selected for next refresh`}
    >
      <EnergyPip type={type} small />
      <span className="ca-mono-label text-[0.6rem]">{meta.short}</span>
    </button>
  )
}

export function TeamEnergyReserve({
  pool,
  disabled = false,
  onSelectFocus,
}: {
  pool: BattleEnergyPool
  disabled?: boolean
  onSelectFocus?: (type: BattleEnergyType) => void
}) {
  const selectedFocus = pool.focus ?? 'technique'
  const totalCostHint = pool.focusAvailable ? '1 matching pip free this round' : 'focus bonus spent this round'

  return (
    <div className="rounded-[0.3rem] border border-white/10 bg-[rgba(10,10,15,0.84)] px-2.5 py-2 shadow-[0_8px_18px_rgba(0,0,0,0.2)] backdrop-blur-xl">
      <div className="grid gap-2 sm:grid-cols-[4.4rem_minmax(0,1fr)] sm:items-center">
        <div className="rounded-[0.25rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-2 py-1.5">
          <p className="ca-mono-label text-[0.6rem] text-ca-text-3">RESERVE</p>
          <div className="mt-1 flex items-end gap-1.5">
            <span className="ca-display text-[0.88rem] leading-none text-ca-text">{pool.reserve}</span>
            <span className="ca-mono-label text-[0.6rem] text-ca-text-3">CE</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="ca-mono-label text-[0.6rem] text-ca-text-3">ENERGY FOCUS</p>
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 ca-mono-label text-[0.22rem]',
                pool.focusAvailable
                  ? 'border-ca-teal/25 bg-ca-teal-wash text-ca-teal text-[0.6rem]'
                  : 'border-white/10 bg-white/5 text-ca-text-3 text-[0.6rem]',
              )}
            >
              {pool.focusAvailable ? 'READY' : 'SPENT'}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {battleEnergyOrder.map((type) => (
              <FocusChip
                key={type}
                type={type}
                active={selectedFocus === type}
                available={pool.focusAvailable}
                disabled={disabled}
                onSelect={onSelectFocus}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="ca-mono-label text-[0.6rem] text-ca-text-3">{totalCostHint.toUpperCase()}</span>
            <span className="ca-mono-label text-[0.6rem] text-ca-text-3">MAX {Math.max(0, pool.reserve + (pool.focusAvailable ? 1 : 0))} PIPS</span>
          </div>
        </div>
      </div>
    </div>
  )
}




