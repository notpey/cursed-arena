import { Link, NavLink } from 'react-router-dom'
import type { PropsWithChildren, ReactNode } from 'react'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { adminPanelConfig, canAccessAdminPanel } from '@/config/features'
import { useAuth } from '@/features/auth/useAuth'
import { usePlayerState } from '@/features/player/store'
import homeBgBase from '@/assets/backgrounds/home-bg-base.webp'

export type SiteNavKey =
  | 'home'
  | 'play'
  | 'manual'
  | 'characters'
  | 'missions'
  | 'ladders'
  | 'clans'
  | 'clan-panel'
  | 'profile'
  | 'settings'
  | 'admin'

type SiteShellProps = PropsWithChildren<{
  activeNav: SiteNavKey
}>

type SiteNavItem = {
  key: SiteNavKey
  label: string
  to: string
  cta?: boolean
}

const primaryNavItems: SiteNavItem[] = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'manual', label: 'Game Manual', to: '/manual' },
  { key: 'characters', label: 'Characters & Skills', to: '/characters' },
  { key: 'missions', label: 'Missions', to: '/missions' },
  { key: 'ladders', label: 'Ladders', to: '/ladders' },
  { key: 'clans', label: 'Clans', to: '/clans' },
  { key: 'profile', label: 'Profile', to: '/profile' },
  { key: 'settings', label: 'Settings', to: '/settings' },
]

export function SiteShell({ activeNav, children }: SiteShellProps) {
  return (
    <div className="min-h-screen bg-[color:var(--bg-void)] text-ca-text">
      {/* Background — battle-screen texture at low opacity */}
      <div className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-[0.15]" style={{ backgroundImage: `url(${homeBgBase})` }} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_34%,rgba(250,39,66,0.06),transparent_38%),radial-gradient(circle_at_84%_24%,rgba(5,216,189,0.06),transparent_36%),linear-gradient(180deg,rgba(4,5,8,0.22),rgba(4,5,8,0.52))]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(228,230,239,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(228,230,239,0.12)_1px,transparent_1px)] [background-size:52px_52px]" />

      <div className="relative mx-auto w-full max-w-[1120px] px-3 py-4 sm:px-4">
        <SiteMasthead />
        <div className="mt-3 flex gap-3 items-start">
          <SiteSidebar activeNav={activeNav} />
          <main className="min-w-0 flex-1">
            {/* Main content frame — flat, readable */}
            <div className="rounded-[5px] border border-white/10 bg-[rgba(16,14,22,0.78)] min-h-[calc(100vh-8rem)]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

// ─── Masthead ─────────────────────────────────────────────────────────────────

function SiteMasthead() {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-[rgba(18,16,26,0.90)] px-4 py-3 rounded-[5px]">
      <Link to="/" className="flex items-center gap-3 min-w-0">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] border border-ca-red/35 bg-ca-red-wash-mid">
          <span className="ca-display text-[1.1rem] leading-none text-white">CA</span>
        </span>
        <span className="min-w-0">
          <span className="ca-display block text-[1.9rem] leading-none tracking-[0.06em] text-ca-text sm:text-[2.1rem]">
            Cursed-Arena
          </span>
          <span className="ca-mono-label block text-[0.44rem] text-ca-text-3 tracking-[0.12em]">
            CURSED TECHNIQUE BATTLE ARENA
          </span>
        </span>
      </Link>

      {/* Right: compact account pill */}
      <MastheadAccountPill />
    </header>
  )
}

function MastheadAccountPill() {
  const { profile } = usePlayerState()
  return (
    <Link
      to="/profile"
      className="flex shrink-0 items-center gap-2.5 rounded-[5px] border border-white/12 bg-[rgba(255,255,255,0.04)] px-3 py-2 transition hover:border-ca-teal/28 hover:bg-[rgba(255,255,255,0.06)]"
    >
      <SquareAvatar
        src={profile.avatarUrl}
        alt={profile.displayName}
        fallbackLabel={profile.avatarLabel}
        size={32}
        className="rounded-[4px] border-ca-red/40"
      />
      <div className="min-w-0 hidden sm:block">
        <p className="ca-display truncate text-[1rem] leading-none text-ca-text">
          {profile.displayName}
        </p>
        <p className="ca-mono-label mt-0.5 text-[0.42rem] text-ca-text-3">VIEW PROFILE</p>
      </div>
    </Link>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function SiteSidebar({ activeNav }: { activeNav: SiteNavKey }) {
  const { profile } = useAuth()
  const navItems: SiteNavItem[] = [
    ...primaryNavItems,
    ...(adminPanelConfig.visibleInNav && canAccessAdminPanel(profile?.role)
      ? [{ key: 'admin' as const, label: 'Admin', to: '/admin' }]
      : []),
  ]

  return (
    <aside className="w-[236px] shrink-0 lg:sticky lg:top-4 lg:self-start">
      <div className="rounded-[5px] border border-white/10 bg-[rgba(18,16,26,0.90)]">
        {/* Start Playing CTA — most prominent */}
        <div className="p-3">
          <NavButton
            item={{ key: 'play', label: 'Start Playing', to: '/battle/prep', cta: true }}
            activeNav={activeNav}
          />
        </div>

        <SidebarDivider />

        {/* Main navigation */}
        <nav className="p-3 grid gap-0.5">
          {navItems.map((item) => (
            <NavButton key={item.key} item={item} activeNav={activeNav} />
          ))}
        </nav>

        <SidebarDivider />

        {/* Account module */}
        <div className="p-3">
          <SidebarAccountBlock />
        </div>

        <SidebarDivider />

        {/* Latest update blurb */}
        <div className="p-3">
          <SidebarUpdateBlurb />
        </div>
      </div>
    </aside>
  )
}

function SidebarDivider() {
  return <div className="border-t border-dotted border-white/10" />
}

function SidebarSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="ca-mono-label mb-2 text-[0.44rem] text-ca-text-3 px-1 uppercase tracking-[0.12em]">
      {children}
    </p>
  )
}

function SidebarAccountBlock() {
  const { profile } = usePlayerState()
  const { profile: authProfile, status } = useAuth()

  return (
    <div>
      <SidebarSectionLabel>Account</SidebarSectionLabel>
      <div className="flex items-center gap-2.5 px-1 py-1">
        <SquareAvatar
          src={profile.avatarUrl}
          alt={profile.displayName}
          fallbackLabel={profile.avatarLabel}
          size={40}
          className="rounded-[5px] border-ca-red/35 shrink-0"
        />
        <div className="min-w-0">
          <p className="ca-display truncate text-[1.15rem] leading-none text-ca-text">
            {profile.displayName}
          </p>
          <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-text-3">
            {status === 'authenticated' ? authProfile?.role?.toUpperCase() ?? 'PLAYER' : 'LOCAL PROFILE'}
          </p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <Link
          to="/profile"
          className="ca-mono-label block rounded-[4px] border border-white/8 bg-white/[0.025] px-2 py-2 text-center text-[0.44rem] text-ca-text-3 transition hover:border-ca-teal/20 hover:text-ca-text-2"
        >
          Profile
        </Link>
        <Link
          to="/settings"
          className="ca-mono-label block rounded-[4px] border border-white/8 bg-white/[0.025] px-2 py-2 text-center text-[0.44rem] text-ca-text-3 transition hover:border-ca-teal/20 hover:text-ca-text-2"
        >
          Settings
        </Link>
      </div>
    </div>
  )
}


function SidebarUpdateBlurb() {
  return (
    <Link
      to="/manual"
      className="block rounded-[4px] border border-white/8 bg-white/[0.018] px-3 py-2.5 transition hover:border-white/16"
    >
      <p className="ca-mono-label text-[0.42rem] text-ca-text-3 uppercase tracking-[0.1em]">
        Latest Update
      </p>
      <p className="mt-1.5 text-[0.73rem] leading-[1.5] text-ca-text-2">
        Manual and roster previews are now available.
      </p>
    </Link>
  )
}

// ─── Nav Button ───────────────────────────────────────────────────────────────

function NavButton({
  item,
  activeNav,
}: {
  item: SiteNavItem
  activeNav: SiteNavKey
}) {
  if (item.cta) {
    return (
      <NavLink
        to={item.to}
        className="block rounded-[4px] border border-ca-red/50 bg-[linear-gradient(180deg,rgba(250,39,66,0.95),rgba(196,29,51,0.90))] px-3 py-3 text-center transition duration-150 hover:brightness-110"
      >
        <span className="ca-display block text-[1.1rem] leading-none tracking-[0.05em] text-white">
          {item.label}
        </span>
      </NavLink>
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => {
        const active = isActive || activeNav === item.key
        return [
          'group relative block rounded-[4px] border px-3 py-2 transition duration-150',
          active
            ? 'border-white/14 bg-white/[0.055] text-ca-text'
            : 'border-transparent text-ca-text-3 hover:border-white/8 hover:bg-white/[0.025] hover:text-ca-text-2',
        ].join(' ')
      }}
    >
      {({ isActive }) => {
        const active = isActive || activeNav === item.key
        return (
          <>
            {active ? (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-ca-red" />
            ) : null}
            <span className="ca-display block text-[1rem] leading-none tracking-[0.04em]">
              {item.label}
            </span>
          </>
        )
      }}
    </NavLink>
  )
}
