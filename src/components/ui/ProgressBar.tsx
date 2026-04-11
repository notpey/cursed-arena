type ProgressBarProps = {
  value: number
  tone?: 'teal' | 'red' | 'gold' | 'green' | 'green-muted'
  className?: string
}

export function ProgressBar({ value, tone = 'teal', className = '' }: ProgressBarProps) {
  const fillClass =
    tone === 'red'
      ? 'bg-gradient-to-r from-ca-red to-ca-red-glow'
      : tone === 'gold'
        ? 'bg-gradient-to-r from-amber-400 to-ca-gold'
        : tone === 'green'
          ? 'bg-gradient-to-r from-green-600 to-green-400'
          : tone === 'green-muted'
            ? 'bg-gradient-to-r from-green-800 to-green-600'
            : 'bg-gradient-to-r from-ca-teal to-ca-teal-glow'

  return (
    <div className={`w-full ${className}`.trim()}>
      <div
        className={`h-full ${fillClass} transition-[width] duration-300`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
