import { NavLink } from 'react-router-dom'
import type { NavItemKey } from '@/components/layout/AppShell'
import { adminPanelConfig, canAccessAdminPanel } from '@/config/features'
import { useAuth } from '@/features/auth/useAuth'

type SidebarNavProps = {
  activeNav: NavItemKey
}

type SidebarItem = {
  key: NavItemKey
  label: string
  to: string
}

const primaryNavItems: SidebarItem[] = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'battle', label: 'Battle', to: '/battle/prep' },
  { key: 'missions', label: 'Missions', to: '/missions' },
  { key: 'profile', label: 'Profile', to: '/profile' },
]

const secondaryNavItems: SidebarItem[] = [
  { key: 'settings', label: 'Settings', to: '/settings' },
  { key: 'admin', label: 'Admin', to: '/admin' },
]

export function SidebarNav({ activeNav }: SidebarNavProps) {
  const { profile } = useAuth()
  const navItems = [
    ...primaryNavItems,
    ...secondaryNavItems.filter((item) => {
      if (item.key !== 'admin') return true
      return adminPanelConfig.visibleInNav && canAccessAdminPanel(profile?.role)
    }),
  ]

  return (
    <aside className="sticky top-0 flex h-screen w-[72px] shrink-0 flex-col items-center border-r border-ca-border-subtle/70 bg-black/25 px-2 py-4 backdrop-blur-md">
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-ca-red/30 bg-gradient-to-br from-ca-red/90 to-ca-red-deep shadow-[0_0_18px_rgba(250,39,66,0.25)]">
        <span className="ca-display text-[0.7rem] font-black tracking-widest text-white/90">CA</span>
      </div>

      <nav className="flex w-full flex-1 flex-col items-center gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            className={({ isActive }) =>
              [
                'group relative flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-2 transition duration-150',
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
                    'absolute inset-y-1 left-0 w-0.5 rounded-full bg-ca-red transition-opacity duration-200',
                    isActive || activeNav === item.key ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                />
                <span
                  className={[
                    'grid h-8 w-8 place-items-center rounded-lg border transition-colors duration-150',
                    isActive || activeNav === item.key
                      ? 'border-ca-red/20 bg-ca-red-wash [&_svg]:stroke-white'
                      : 'border-ca-border-subtle bg-ca-surface/70',
                  ].join(' ')}
                >
                  <SidebarGlyph kind={item.key} />
                </span>
                <span
                  className={[
                    'ca-mono-label text-[0.45rem] leading-none transition-colors duration-150',
                    isActive || activeNav === item.key ? 'text-ca-text' : 'text-ca-text-2',
                  ].join(' ')}
                >
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
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
    case 'missions':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <path d="M9 12l2 2 4-4" />
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M4 9h16" />
        </svg>
      )
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.8v2.3M12 18.9v2.3M21.2 12h-2.3M5.1 12H2.8M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6M18.5 18.5l-1.6-1.6M7.1 7.1 5.5 5.5" />
        </svg>
      )
    case 'admin':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <path d="M12 3.5 5.5 6v5.4c0 4.2 2.5 7.1 6.5 9.1 4-2 6.5-4.9 6.5-9.1V6L12 3.5Z" />
          <path d="M9.2 11.9 11 13.7l3.8-4.1" />
        </svg>
      )
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <circle cx="12" cy="9" r="3.5" />
          <path d="M5.5 19c1.7-3.2 4.2-4.7 6.5-4.7s4.8 1.5 6.5 4.7" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} strokeWidth="1.6">
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
  }
}
