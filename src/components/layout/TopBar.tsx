import { Link, useLocation } from 'react-router-dom'
import {
  formatPremiumCurrency,
  formatSoftCurrency,
  usePlayerState,
} from '@/features/player/store'

type RouteIdentity = {
  section: string
  page: string
}

const routeIdentity: Record<string, RouteIdentity> = {
  '/': { section: 'Home', page: 'Dashboard' },
  '/battle/prep': { section: 'Battle', page: 'Arena Lobby' },
  '/battle': { section: 'Battle', page: 'Match' },
  '/battle/results': { section: 'Battle', page: 'Results' },
  '/missions': { section: 'Missions', page: 'Unlock Missions' },
  '/profile': { section: 'Profile', page: 'Player Card' },
  '/settings': { section: 'Settings', page: 'System' },
  '/admin': { section: 'Settings', page: 'Admin Control Panel' },
}

export function TopBar() {
  const location = useLocation()
  const { profile, economy } = usePlayerState()
  const identity = routeIdentity[location.pathname] ?? resolveRouteIdentity(location.pathname)

  return (
    <header className="sticky top-0 z-20 border-b border-ca-border-subtle/60 bg-[rgba(13,12,17,0.62)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="ca-mono-label truncate text-[0.56rem] text-ca-text-disabled">
            Welcome Back, {profile.displayName}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{identity.section}</span>
            <span className="ca-mono-label text-[0.38rem] text-ca-text-3">/</span>
            <span className="ca-display truncate text-[1.1rem] leading-none text-ca-text">{identity.page}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <CurrencyPill icon="diamond" value={formatPremiumCurrency(economy.gems)} />
          <CurrencyPill icon="hex" value={formatSoftCurrency(economy.gold)} />
          <Link
            to="/profile"
            className="grid h-9 w-9 place-items-center rounded-full border border-ca-red/40 bg-gradient-to-br from-ca-red-wash-mid to-transparent p-[2px] transition duration-150 hover:scale-[1.02] hover:border-ca-red/60 hover:shadow-[0_0_12px_rgba(250,39,66,0.18)] active:scale-[0.96]"
            aria-label="Profile"
          >
            <span className="grid h-full w-full place-items-center rounded-full bg-ca-surface text-[0.6rem] font-semibold text-ca-text">
              {profile.avatarLabel}
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}

function resolveRouteIdentity(pathname: string): RouteIdentity {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return routeIdentity['/']

  const section = toTitle(parts[0])
  const page = toTitle(parts[parts.length - 1])
  return { section, page }
}

function toTitle(value: string) {
  return value
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
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

