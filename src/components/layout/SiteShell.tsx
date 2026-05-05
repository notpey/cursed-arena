import { Link, NavLink } from 'react-router-dom'
import { useState } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { battlePrepRoster } from '@/features/battle/prep'
import { adminPanelConfig, canAccessAdminPanel } from '@/config/features'
import { useAuth } from '@/features/auth/useAuth'
import {
  formatPremiumCurrency,
  formatSoftCurrency,
  usePlayerState,
} from '@/features/player/store'
import {
  readRecentMatchHistory,
} from '@/features/battle/matches'
import {
  FeaturedFighterCard,
  FighterPortrait,
  RecentBattleRow,
  SiteSectionHeader,
  homeBgBase,
  siteArtBackgroundStyle,
  sukunaHome,
} from '@/components/site/siteVisuals'

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
  detail: string
  to: string
  cta?: boolean
}

const primaryNavItems: SiteNavItem[] = [
  { key: 'play', label: 'Start Playing', detail: 'Team selection and queue', to: '/battle/prep', cta: true },
  { key: 'manual', label: 'Game Manual', detail: 'Rules, turns, energy', to: '/manual' },
  { key: 'characters', label: 'Characters & Skills', detail: 'Roster archive', to: '/characters' },
  { key: 'ladders', label: 'Ladders', detail: 'Sorcerers and clans', to: '/ladders' },
  { key: 'missions', label: 'Missions', detail: 'Unlock fighters', to: '/missions' },
  { key: 'clans', label: 'Clans', detail: 'Community houses', to: '/clans' },
  { key: 'profile', label: 'Profile', detail: 'Record and history', to: '/profile' },
]

export function SiteShell({ activeNav, children }: SiteShellProps) {
  const [navCollapsed, setNavCollapsed] = useState(false)

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[color:var(--bg-void)] text-ca-text">
      <SiteAtmosphere />
      <div
        className={[
          'relative grid min-h-screen w-full grid-cols-1 gap-4 px-3 py-3 lg:px-4 lg:py-4',
          navCollapsed ? 'lg:grid-cols-[5.25rem_minmax(0,1fr)]' : 'lg:grid-cols-[18rem_minmax(0,1fr)]',
        ].join(' ')}
      >
        <SiteHubRail activeNav={activeNav} collapsed={navCollapsed} onToggle={() => setNavCollapsed((value) => !value)} />

        <div className="min-w-0">
          <SiteHeaderBanner />
          <main className="mt-4 min-w-0">
            <SiteContentFrame>{children}</SiteContentFrame>
          </main>
        </div>
      </div>
    </div>
  )
}

function SiteAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 top-24 h-[34rem] w-[34rem] rounded-full bg-ca-red/8 blur-3xl" />
      <div className="absolute right-[-12rem] top-10 h-[36rem] w-[36rem] rounded-full bg-ca-teal/7 blur-3xl" />
      <div className="absolute left-[22%] top-0 h-px w-[52%] bg-[linear-gradient(90deg,transparent,rgba(228,230,239,0.18),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,12,17,0.28),rgba(13,12,17,0.72))]" />
      <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(228,230,239,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(228,230,239,0.1)_1px,transparent_1px)] [background-size:48px_48px]" />
    </div>
  )
}

function SiteHeaderBanner() {
  const { profile, economy } = usePlayerState()
  const featured = battlePrepRoster.find((entry) => entry.id === 'sukuna') ?? battlePrepRoster[0]

  return (
    <header className="relative min-h-[9.5rem] overflow-hidden rounded-[10px] border border-white/10 bg-[linear-gradient(135deg,rgba(30,28,38,0.92),rgba(18,16,24,0.88))] shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30" style={siteArtBackgroundStyle(homeBgBase)} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_12%_20%,rgba(250,39,66,0.16),transparent_58%),radial-gradient(58%_110%_at_90%_18%,rgba(5,216,189,0.13),transparent_60%),linear-gradient(90deg,rgba(13,12,17,0.94)_0%,rgba(13,12,17,0.7)_52%,rgba(13,12,17,0.34)_100%)]" />
      <div className="pointer-events-none absolute bottom-0 right-6 hidden h-[10rem] w-[12rem] sm:block">
        {featured ? (
          <img src={sukunaHome} alt="" className="absolute bottom-[-2.8rem] right-0 h-[15rem] w-auto opacity-90 drop-shadow-[0_18px_32px_rgba(0,0,0,0.45)]" draggable={false} />
        ) : null}
      </div>
      <div className="relative grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <Link to="/" className="inline-flex items-end gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[8px] border border-ca-red/35 bg-ca-red-wash-mid">
              <span className="ca-display text-[1.35rem] leading-none text-white">CA</span>
            </span>
            <span className="min-w-0">
              <span className="ca-display block text-[2.15rem] leading-none tracking-[0.06em] text-ca-text sm:text-[2.65rem]">
                Cursed-Arena
              </span>
              <span className="ca-mono-label mt-1 block text-[0.48rem] text-ca-text-3">
                3V3 CURSED TECHNIQUE BATTLE WEBSITE
              </span>
            </span>
          </Link>
          <div className="mt-4 hidden max-w-xl grid-cols-3 gap-2 sm:grid">
            {battlePrepRoster.slice(0, 3).map((entry) => (
              <Link key={entry.id} to="/characters" className="flex items-center gap-2 rounded-[7px] border border-white/8 bg-black/20 px-2 py-2 transition hover:border-white/16">
                <FighterPortrait entry={entry} className="h-10 w-10 shrink-0" imgClassName="top-[12%] w-[108%]" />
                <span className="min-w-0">
                  <span className="ca-display block truncate text-[0.95rem] leading-none text-ca-text">{entry.battleTemplate.shortName}</span>
                  <span className="ca-mono-label block truncate text-[0.34rem] text-ca-text-3">{entry.role}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="z-10 flex flex-wrap items-center gap-2 lg:justify-end">
          <CurrencyPill label="GEMS" value={formatPremiumCurrency(economy.gems)} tone="gold" />
          <CurrencyPill label="GOLD" value={formatSoftCurrency(economy.gold)} tone="teal" />
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-[8px] border border-white/10 bg-[rgba(255,255,255,0.035)] px-2.5 py-2 transition duration-150 hover:border-ca-teal/24"
          >
            <SquareAvatar
              src={profile.avatarUrl}
              alt={profile.displayName}
              fallbackLabel={profile.avatarLabel}
              size={28}
              className="rounded-full border-ca-red/30"
            />
            <span className="ca-mono-label max-w-[9rem] truncate text-[0.52rem] text-ca-text-2">
              {profile.displayName}
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}

function SiteHubRail({
  activeNav,
  collapsed,
  onToggle,
}: {
  activeNav: SiteNavKey
  collapsed: boolean
  onToggle: () => void
}) {
  const { profile } = useAuth()
  const featured = battlePrepRoster.find((entry) => entry.id === 'gojo') ?? battlePrepRoster[0]
  const navItems = [
    ...primaryNavItems,
    ...(adminPanelConfig.visibleInNav && canAccessAdminPanel(profile?.role)
      ? [{ key: 'admin' as const, label: 'Admin', detail: 'Control panel', to: '/admin' }]
      : []),
  ]

  return (
    <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
      <div className="flex h-full flex-col rounded-[10px] border border-white/10 bg-[rgba(20,18,27,0.82)] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div className="mb-3 flex items-center gap-2">
          <Link to="/" className="min-w-0 flex-1 overflow-hidden rounded-[8px] border border-white/8 bg-black/18">
            <div className={['relative bg-cover bg-center', collapsed ? 'h-11' : 'h-16'].join(' ')} style={siteArtBackgroundStyle(homeBgBase)}>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,12,17,0.85),rgba(13,12,17,0.32)),radial-gradient(circle_at_85%_20%,rgba(5,216,189,0.22),transparent_48%)]" />
          </div>
            {!collapsed ? (
              <div className="px-3 py-3">
                <p className="ca-mono-label text-[0.48rem] text-ca-text-3">SITE HUB</p>
                <p className="ca-display mt-1 text-[1.65rem] leading-none text-ca-text">Arena Archive</p>
              </div>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={onToggle}
            className="hidden h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-white/10 bg-white/[0.035] text-ca-text-2 transition hover:border-ca-teal/24 hover:text-ca-text lg:grid"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <span className="ca-display text-[1.1rem] leading-none">{collapsed ? '>' : '<'}</span>
          </button>
          </div>

        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {navItems.map((item) => (
            <NavButton key={item.key} item={item} activeNav={activeNav} collapsed={collapsed} />
          ))}
        </nav>

        {featured && !collapsed ? (
          <div className="mt-3 hidden border-t border-white/8 pt-3 lg:block">
            <SiteSectionHeader eyebrow="Featured Fighter" title="Technique File" />
            <FeaturedFighterCard entry={featured} compact />
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 border-t border-white/8 pt-3 sm:grid-cols-2 lg:grid-cols-1">
          <NavButton
            item={{ key: 'settings', label: 'Settings', detail: 'Account and system', to: '/settings' }}
            activeNav={activeNav}
            collapsed={collapsed}
          />
        </div>

        {!collapsed ? (
          <div className="mt-3 space-y-3 border-t border-white/8 pt-3">
            <SiteAccountBlock />
            <SiteActivityBlock />
          </div>
        ) : null}
      </div>
    </aside>
  )
}

function NavButton({
  item,
  activeNav,
  collapsed,
}: {
  item: SiteNavItem
  activeNav: SiteNavKey
  collapsed: boolean
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => {
        const active = isActive || activeNav === item.key
        return [
          'group relative rounded-[8px] border text-left transition duration-200 hover:-translate-y-0.5',
          collapsed ? 'grid h-12 place-items-center px-1 py-1' : 'px-3 py-2.5',
          item.cta
            ? 'border-ca-red/45 bg-[linear-gradient(180deg,rgba(250,39,66,0.98),rgba(196,29,51,0.94))] text-white shadow-[0_14px_30px_rgba(250,39,66,0.2)]'
            : active
              ? 'border-ca-teal/28 bg-ca-teal-wash text-ca-text'
              : 'border-white/8 bg-[rgba(255,255,255,0.025)] text-ca-text-2 hover:border-white/16 hover:bg-[rgba(255,255,255,0.045)]',
        ].join(' ')
      }}
    >
      {({ isActive }) => {
        const active = isActive || activeNav === item.key
        return (
          <>
            {!item.cta && active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-ca-red" /> : null}
            {collapsed ? (
              <span className="ca-display text-[1.05rem] leading-none tracking-[0.04em]" title={item.label}>
                {item.label.slice(0, 2)}
              </span>
            ) : (
              <>
                <span className="ca-display block text-[1.2rem] leading-none tracking-[0.04em]">{item.label}</span>
                <span className={['mt-1 block text-[0.72rem]', item.cta ? 'text-white/78' : 'text-ca-text-3'].join(' ')}>
                  {item.detail}
                </span>
              </>
            )}
          </>
        )
      }}
    </NavLink>
  )
}

function SiteAccountBlock() {
  const { profile } = usePlayerState()
  const { profile: authProfile, status } = useAuth()

  return (
    <SiteSideBlock title="Account">
      <div className="flex items-center gap-3">
        <SquareAvatar
          src={profile.avatarUrl}
          alt={profile.displayName}
          fallbackLabel={profile.avatarLabel}
          size={44}
          className="rounded-full border-ca-red/40"
        />
        <div className="min-w-0">
          <p className="ca-display truncate text-[1.55rem] leading-none text-ca-text">{profile.displayName}</p>
          <p className="ca-mono-label mt-1 text-[0.44rem] text-ca-text-3">
            {status === 'authenticated' ? authProfile?.role?.toUpperCase() ?? 'PLAYER' : 'LOCAL PROFILE'}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to="/profile" className="ca-display rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2 text-center text-[1rem] text-ca-text-2">
          Profile
        </Link>
        <Link to="/settings" className="ca-display rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2 text-center text-[1rem] text-ca-text-2">
          Settings
        </Link>
      </div>
    </SiteSideBlock>
  )
}

function SiteActivityBlock() {
  const recentMatches = readRecentMatchHistory().slice(0, 3)
  const teamEntries = battlePrepRoster.slice(0, 3)

  return (
    <SiteSideBlock title="Activity">
      <div className="relative overflow-hidden rounded-[8px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-2">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-[radial-gradient(circle_at_70%_30%,rgba(5,216,189,0.22),transparent_60%)]" />
        <p className="ca-mono-label relative text-[0.43rem] text-ca-teal">ARENA STATUS</p>
        <p className="ca-display relative mt-1 text-[1.55rem] leading-none text-ca-text">Queue Ready</p>
      </div>

      <div className="mt-3 space-y-2">
        {recentMatches.length > 0 ? (
          recentMatches.map((match) => (
            <RecentBattleRow key={match.id} match={match} entries={teamEntries} />
          ))
        ) : (
          <div className="rounded-[7px] border border-white/8 bg-white/[0.025] px-3 py-3">
            <div className="flex items-center gap-2">
              {teamEntries.map((entry) => (
                <FighterPortrait key={entry.id} entry={entry} className="h-8 w-8 rounded-full" imgClassName="top-[13%] w-[110%]" />
              ))}
            </div>
            <p className="mt-2 text-sm text-ca-text-3">Recent games will appear after your first match.</p>
          </div>
        )}
      </div>

      <Link to="/manual" className="mt-3 block rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.025)] px-3 py-3 transition duration-150 hover:border-ca-teal/22">
        <p className="ca-mono-label text-[0.43rem] text-ca-text-3">LATEST UPDATE</p>
        <p className="mt-1 text-sm text-ca-text-2">Manual and roster archive previews are now available.</p>
      </Link>
    </SiteSideBlock>
  )
}

function SiteSideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[10px] border border-white/10 bg-[rgba(20,18,27,0.72)] p-3 backdrop-blur-md">
      <p className="ca-mono-label border-b border-white/8 pb-2 text-[0.5rem] text-ca-text-3">{title}</p>
      <div className="pt-3">{children}</div>
    </section>
  )
}

function SiteContentFrame({ children }: PropsWithChildren) {
  return (
    <div className="min-h-[calc(100vh-8.25rem)] rounded-[10px] border border-white/10 bg-[rgba(18,16,24,0.62)] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:p-4">
      {children}
    </div>
  )
}

function CurrencyPill({ label, value, tone }: { label: string; value: string; tone: 'gold' | 'teal' }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-[rgba(255,255,255,0.035)] px-3 py-2">
      <p className={['ca-mono-label text-[0.4rem]', tone === 'gold' ? 'text-ca-gold' : 'text-ca-teal'].join(' ')}>
        {label}
      </p>
      <p className="ca-mono-label mt-1 text-[0.56rem] text-ca-text">{value}</p>
    </div>
  )
}
