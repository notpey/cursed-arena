type ClanPanelCardProps = {
  title: string
  description: string
  actions: string[]
  access: 'full' | 'readonly' | 'locked'
  children?: React.ReactNode
}

export function ClanPanelCard({ title, description, actions, access, children }: ClanPanelCardProps) {
  const locked = access === 'locked'
  return (
    <article className={`ca-card p-4 transition ${locked ? 'opacity-55' : 'ca-card-hover'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="ca-display text-3xl text-ca-text">{title}</h2>
          <p className="mt-2 text-sm text-ca-text-2">{description}</p>
        </div>
        <span className={`ca-mono-label rounded-md border px-2 py-1 text-[0.42rem] ${access === 'full' ? 'border-ca-teal/25 bg-ca-teal-wash text-ca-teal' : access === 'readonly' ? 'border-white/10 bg-white/[0.03] text-ca-text-3' : 'border-ca-red/20 bg-ca-red-wash text-ca-red'}`}>
          {access === 'full' ? 'AVAILABLE' : access === 'readonly' ? 'VIEW ONLY' : 'LOCKED'}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button key={action} type="button" disabled={access !== 'full'} className="ca-mono-label rounded-lg border border-white/10 bg-ca-overlay px-3 py-2 text-[0.5rem] text-ca-text-2 transition hover:border-ca-teal/25 disabled:cursor-not-allowed disabled:opacity-45">
            {action}
          </button>
        ))}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  )
}
