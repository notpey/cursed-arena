import {
  battleEnergyExchangeCost,
  battleEnergyMeta,
  battleEnergyOrder,
  canExchangeEnergy,
  getEnergyCount,
  randomEnergyMeta,
  totalEnergyInPool,
  type BattleEnergyCost,
  type BattleEnergyPool,
  type BattleEnergyType,
} from '@/features/battle/energy'
import { cn } from '@/components/battle/battleDisplay'

function getCostEntries(cost: BattleEnergyCost): Array<BattleEnergyType | 'random'> {
  const typed = battleEnergyOrder.flatMap((type) => Array.from({ length: cost[type] ?? 0 }, (): BattleEnergyType => type))
  const random = Array.from({ length: cost.random ?? 0 }, (): 'random' => 'random')
  return [...typed, ...random]
}

export function EnergyPip({ type, small = false }: { type: BattleEnergyType | 'random'; small?: boolean }) {
  const meta = type === 'random' ? randomEnergyMeta : battleEnergyMeta[type]

  return (
    <span
      className={cn(
        'border shadow-[0_0_6px_var(--energy-glow)]',
        small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5',
        type === 'random' ? 'rounded-[0.15rem]' : 'rounded-full',
      )}
      style={{
        backgroundColor: meta.color,
        borderColor: meta.border,
        boxShadow: `0 0 6px ${meta.glow}`,
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

function ExchangeChip({
  type,
  count,
  disabled,
  canExchange,
  onExchange,
}: {
  type: BattleEnergyType
  count: number
  disabled: boolean
  canExchange: boolean
  onExchange?: (type: BattleEnergyType) => void
}) {
  const meta = battleEnergyMeta[type]

  return (
    <button
      type="button"
      disabled={disabled || !canExchange}
      onClick={onExchange ? () => onExchange(type) : undefined}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-1 transition',
        canExchange ? 'bg-[rgba(255,255,255,0.06)] text-ca-text' : 'bg-[rgba(255,255,255,0.03)] text-ca-text-3',
        disabled && 'cursor-default opacity-70',
        !disabled && canExchange && 'hover:bg-[rgba(255,255,255,0.09)]',
      )}
      style={{
        borderColor: canExchange ? meta.border : 'rgba(255,255,255,0.08)',
        boxShadow: canExchange ? `0 0 14px ${meta.glow}` : 'none',
      }}
      title={canExchange ? `Exchange ${battleEnergyExchangeCost} chakra into 1 ${meta.label}` : meta.label}
    >
      <EnergyPip type={type} small />
      <span className="ca-mono-label text-[0.6rem]">{meta.short}</span>
      <span className="ca-mono-label text-[0.6rem] text-ca-text">x{count}</span>
    </button>
  )
}

export function TeamEnergyReserve({
  pool,
  disabled = false,
  onExchangeEnergy,
}: {
  pool: BattleEnergyPool
  disabled?: boolean
  onExchangeEnergy?: (type: BattleEnergyType) => void
}) {
  const exchangeReady = canExchangeEnergy(pool)

  return (
    <div className="rounded-[0.3rem] border border-white/10 bg-[rgba(10,10,15,0.84)] px-2.5 py-2 shadow-[0_8px_18px_rgba(0,0,0,0.2)] backdrop-blur-xl">
      <div className="grid gap-2 sm:grid-cols-[4.4rem_minmax(0,1fr)] sm:items-center">
        <div className="rounded-[0.25rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-2 py-1.5">
          <p className="ca-mono-label text-[0.6rem] text-ca-text-3">TOTAL CE</p>
          <div className="mt-1 flex items-end gap-1.5">
            <span className="ca-display text-[0.88rem] leading-none text-ca-text">{totalEnergyInPool(pool)}</span>
            <span className="ca-mono-label text-[0.6rem] text-ca-text-3">PIPS</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="ca-mono-label text-[0.6rem] text-ca-text-3">EXCHANGE CHAKRA</p>
            <span className="rounded-full border border-ca-teal/25 bg-ca-teal-wash px-1.5 py-0.5 ca-mono-label text-[0.6rem] text-ca-teal">
              {battleEnergyExchangeCost} TO 1
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {battleEnergyOrder.map((type) => (
              <ExchangeChip
                key={type}
                type={type}
                count={getEnergyCount(pool, type)}
                disabled={disabled}
                canExchange={exchangeReady}
                onExchange={onExchangeEnergy}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="ca-mono-label text-[0.6rem] text-ca-text-3">
              {exchangeReady ? 'CLICK A TYPE TO CONVERT 5 CHAKRA INTO 1 CHOSEN PIP' : `BANK ${battleEnergyExchangeCost} CHAKRA TO ENABLE EXCHANGE`}
            </span>
            <span className="ca-mono-label text-[0.6rem] text-ca-text-3">CURRENT TOTAL {totalEnergyInPool(pool)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
