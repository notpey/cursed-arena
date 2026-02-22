import { NavLink } from 'react-router-dom'
import type { NavItemKey } from '@/components/layout/AppShell'

type SidebarNavProps = {
  activeNav: NavItemKey
}

type SidebarItem = {
  key: NavItemKey
  label: string
  to: string
}

const navItems: SidebarItem[] = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'battle', label: 'Battle', to: '/battle' },
  { key: 'roster', label: 'Roster', to: '/roster' },
  { key: 'summon', label: 'Summon', to: '/summon' },
  { key: 'story', label: 'Story', to: '/story' },
  { key: 'inventory', label: 'Inventory', to: '/inventory' },
]

export function SidebarNav({ activeNav }: SidebarNavProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-[72px] shrink-0 flex-col items-center border-r border-ca-border-subtle/70 bg-black/25 px-2 py-4 backdrop-blur-md">
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-ca-red/30 bg-gradient-to-br from-ca-red/90 to-ca-red-deep shadow-[0_0_18px_rgba(250,39,66,0.25)]" />

      <nav className="flex w-full flex-1 flex-col items-center gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            className={({ isActive }) =>
              [
                'group relative flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-2 transition',
                'border-transparent bg-white/[0.02] hover:border-ca-border hover:bg-white/[0.04]',
                isActive || activeNav === item.key ? 'border-ca-border bg-white/[0.05]' : '',
              ].join(' ')
            }
            end={item.to === '/'}
          >
            {({ isActive }) => (
              <>
                <span
                  className={[
                    'absolute inset-y-1 left-0 w-0.5 rounded-full bg-ca-red transition-opacity',
                    isActive || activeNav === item.key ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                />
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-ca-border-subtle bg-ca-surface/70">
                  <SidebarGlyph kind={item.key} />
                </span>
                <span className="ca-mono-label text-[0.45rem] leading-none text-ca-text-2">
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          [
            'group mt-2 flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-2 transition',
            isActive || activeNav === 'settings'
              ? 'border-ca-border bg-white/[0.05]'
              : 'border-transparent hover:border-ca-border hover:bg-white/[0.04]',
          ].join(' ')
        }
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-ca-border-subtle bg-ca-surface/70">
          <SidebarGlyph kind="settings" />
        </span>
        <span className="ca-mono-label text-[0.45rem] leading-none text-ca-text-2">Settings</span>
      </NavLink>
    </aside>
  )
}

function SidebarGlyph({ kind }: { kind: NavItemKey }) {
  const common = 'h-[18px] w-[18px] stroke-ca-text-2'

  switch (kind) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.8">
          <path d="M4 11.5L12 5l8 6.5" />
          <path d="M6.5 10.5V19h11v-8.5" />
        </svg>
      )
    case 'battle':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <path d="M6 7l11 11" />
          <path d="M10 4l3 3-2 2-3-3z" />
          <path d="M7 14l3 3-2 2-3-3z" />
          <path d="M17 7L6 18" />
        </svg>
      )
    case 'roster':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <circle cx="12" cy="8" r="3" />
          <path d="M5.5 19c1.4-3 4-4.5 6.5-4.5S17 16 18.5 19" />
        </svg>
      )
    case 'summon':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z" />
        </svg>
      )
    case 'story':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      )
    case 'inventory':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
          <path d="M9 8V6a3 3 0 1 1 6 0v2" />
          <path d="M9 12h6" />
        </svg>
      )
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.8v2.3M12 18.9v2.3M21.2 12h-2.3M5.1 12H2.8M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6M18.5 18.5l-1.6-1.6M7.1 7.1 5.5 5.5" />
        </svg>
      )
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <circle cx="12" cy="9" r="3.5" />
          <path d="M5.5 19c1.7-3.2 4.2-4.7 6.5-4.7s4.8 1.5 6.5 4.7" />
        </svg>
      )
  }
}
