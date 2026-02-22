import { Link } from 'react-router-dom'

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-ca-border-subtle/60 bg-[rgba(13,12,17,0.62)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="ca-mono-label text-[0.58rem] text-ca-text-disabled">Welcome Back, Playername</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <CurrencyPill icon="diamond" value="6,920" />
          <CurrencyPill icon="hex" value="$148,200" />
          <Link
            to="/profile"
            className="grid h-9 w-9 place-items-center rounded-full border border-ca-red/40 bg-gradient-to-br from-ca-red-wash-mid to-transparent p-[2px] transition hover:scale-[1.02]"
            aria-label="Profile"
          >
            <span className="grid h-full w-full place-items-center rounded-full bg-ca-surface text-[0.6rem] font-semibold text-ca-text">
              PN
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}

function CurrencyPill({ icon, value }: { icon: 'diamond' | 'hex'; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-ca-border-subtle bg-ca-overlay/55 px-3 py-1.5">
      <span
        className={[
          'grid h-4 w-4 place-items-center rounded-full border',
          icon === 'diamond'
            ? 'border-amber-400/30 text-amber-300'
            : 'border-ca-teal/30 text-ca-teal',
        ].join(' ')}
      >
        {icon === 'diamond' ? (
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current">
            <path d="M8 1 14 6 8 15 2 6 8 1Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.5">
            <path d="M8 1.5 13.5 4.7v6.6L8 14.5l-5.5-3.2V4.7L8 1.5Z" />
          </svg>
        )}
      </span>
      <span className="ca-mono-label text-[0.62rem] text-ca-text">{value}</span>
    </div>
  )
}
