type SectionHeaderProps = {
  title: string
  actionLabel?: string
}

export function SectionHeader({ title, actionLabel = 'View All' }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="ca-display text-xl text-ca-text sm:text-2xl">{title}</h2>
      <button type="button" className="ca-mono-label text-[0.58rem] text-ca-text-3 hover:text-ca-text-2">
        {actionLabel} {'->'}
      </button>
    </div>
  )
}
