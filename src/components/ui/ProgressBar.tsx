type ProgressBarProps = {
  value: number
  tone?: 'teal' | 'red' | 'gold' | 'green' | 'green-muted'
  className?: string
}

function hpFillClass(value: number, muted: boolean): string {
  if (value <= 25) return muted ? 'bg-ca-red/60' : 'bg-gradient-to-r from-ca-red to-ca-red-glow'
  if (value <= 50) return muted ? 'bg-amber-500/60' : 'bg-gradient-to-r from-amber-500 to-amber-400'
  return muted ? 'bg-green-800/80' : 'bg-gradient-to-r from-green-600 to-green-400'
}

export function ProgressBar({ value, tone = 'teal', className = '' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))

  const fillClass =
    tone === 'red'
      ? 'bg-gradient-to-r from-ca-red to-ca-red-glow'
      : tone === 'gold'
        ? 'bg-gradient-to-r from-amber-400 to-ca-gold'
        : tone === 'green'
          ? hpFillClass(clamped, false)
          : tone === 'green-muted'
            ? hpFillClass(clamped, true)
            : 'bg-gradient-to-r from-ca-teal to-ca-teal-glow'

  return (
    <div className={`w-full ${className}`.trim()}>
      <div
        className={`h-full animate-ca-bar-grow transition-[width,background-color] duration-300 ease-out ${fillClass}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
