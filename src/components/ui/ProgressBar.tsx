type ProgressBarProps = {
  value: number
  tone?: 'teal' | 'red' | 'gold'
  className?: string
}

export function ProgressBar({ value, tone = 'teal', className = '' }: ProgressBarProps) {
  const fillClass =
    tone === 'red'
      ? 'bg-gradient-to-r from-ca-red to-ca-red-glow'
      : tone === 'gold'
        ? 'bg-gradient-to-r from-amber-400 to-ca-gold'
        : 'bg-gradient-to-r from-ca-teal to-ca-teal-glow'

  return (
    <div className={`h-1.5 w-full rounded-full bg-ca-highlight/70 ${className}`.trim()}>
      <div
        className={`h-full rounded-full ${fillClass} transition-[width] duration-300`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

