import { Link, NavLink } from 'react-router-dom'
import type { PropsWithChildren, ReactNode } from 'react'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { battlePrepRoster } from '@/features/battle/prep'
import { adminPanelConfig, canAccessAdminPanel } from '@/config/features'
import { useAuth } from '@/features/auth/useAuth'
import {
  formatPremiumCurrency,
  formatSoftCurrency,
  usePlayerState,
} from '@/features/player/store'
import { readRecentMatchHistory } from '@/features/battle/matches'
import {
  FeaturedFighterCard,
  RecentBattleRow,
  homeBgBase,
  siteArtBackgroundStyle,
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
  { key: 'play', label: 'Start Playing', detail: 'Team selection', to: '/battle/prep', cta: true },
  { key: 'manual', label: 'Game Manual', detail: 'Rules and energy', to: '/manual' },
  { key: 'characters', label: 'Characters & Skills', detail: 'Roster archive', to: '/characters' },
  { key: 'ladders', label: 'Ladders', detail: 'Rankings', to: '/ladders' },
  { key: 'missions', label: 'Missions', detail: 'Unlock fighters', to: '/missions' },
  { key: 'clans', label: 'Clans', detail: 'Community houses', to: '/clans' },
  { key: 'profile', label: 'Profile', detail: 'Record and history', to: '/profile' },
]

export function SiteShell({ activeNav, children }: SiteShellProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[color:var(--bg-void)] text-ca-text">
      <SiteAtmosphere />
      <div className="relative mx-auto w-full max-w-[1180px] px-3 py-4 sm:px-4">
        <SiteHeaderBanner />
        <div className="mt-3 grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <SiteHubRail activeNav={activeNav} />
          <main className="min-w-0">
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
      <div className="absolute -left-32 top-20 h-[28rem] w-[28rem] rounded-full bg-ca-red/7 blur-3xl" />
      <div className="absolute right-[-10rem] top-4 h-[30rem] w-[30rem] rounded-full bg-ca-teal/6 blur-3xl" />
      <div className="absolute left-[18%] top-0 h-px w-[56%] bg-[linear-gradient(90deg,transparent,rgba(228,230,239,0.16),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,12,17,0.18),rgba(13,12,17,0.76))]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(228,230,239,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(228,230,239,0.1)_1px,transparent_1px)] [background-size:48px_48px]" />
    </div>
  )
}

function SiteHeaderBanner() {
  const { profile, economy } = usePlayerState()
  const bannerFighters = battlePrepRoster.slice(0, 5)

  return (
    <header className="relative overflow-hidden rounded-[7px] border border-white/10 bg-[rgba(30,28,36,0.68)] shadow-[0_14px_34px_rgba(0,0,0,0.24)]">
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-24" style={siteArtBackgroundStyle(homeBgBase)} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(13,12,17,0.95),rgba(13,12,17,0.74)_58%,rgba(13,12,17,0.9)),radial-gradient(70%_140%_at_12%_20%,rgba(250,39,66,0.12),transparent_60%),radial-gradient(58%_120%_at_88%_22%,rgba(5,216,189,0.12),transparent_62%)]" />
      <div className="relative grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[6px] border border-ca-red/35 bg-ca-red-wash-mid">
            <span className="ca-display text-[1.25rem] leading-none text-white">CA</span>
          </span>
          <span className="min-w-0">
            <span className="ca-display block text-[2.1rem] leading-none tracking-[0.06em] text-ca-text sm:text-[2.55rem]">
              Cursed-Arena
            </span>
            <span className="ca-mono-label mt-1 block truncate text-[0.46rem] text-ca-text-3">
              3V3 CURSED TECHNIQUE BATTLE WEBSITE
            </span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <div className="hidden items-center gap-1.5 sm:flex">
            {bannerFighters.map((entry) => (
              <Link key={entry.id} to="/characters" title={entry.name}>
                <CharacterFacePortrait characterId={entry.id} name={entry.name} src={entry.facePortrait} rarity={entry.rarity} size="xs" />
              </Link>
            ))}
          </div>
          <CurrencyPill label="GEMS" value={formatPremiumCurrency(economy.gems)} tone="gold" />
          <CurrencyPill label="GOLD" value={formatSoftCurrency(economy.gold)} tone="teal" />
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-[7px] border border-white/10 bg-[rgba(255,255,255,0.035)] px-2 py-1.5 transition duration-150 hover:border-ca-teal/24"
          >
            <SquareAvatar
              src={profile.avatarUrl}
              alt={profile.displayName}
              fallbackLabel={profile.avatarLabel}
              size={28}
              className="rounded-[6px] border-ca-red/30"
            />
            <span className="ca-mono-label max-w-[8rem] truncate text-[0.48rem] text-ca-text-2">
              {profile.displayName}
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}

function SiteHubRail({ activeNav }: { activeNav: SiteNavKey }) {
  const { profile } = useAuth()
  const featured = battlePrepRoster.find((entry) => entry.id === 'gojo') ?? battlePrepRoster[0]
  const navItems = [
    ...primaryNavItems,
    ...(adminPanelConfig.visibleInNav && canAccessAdminPanel(profile?.role)
      ? [{ key: 'admin' as const, label: 'Admin', detail: 'Control panel', to: '/admin' }]
      : []),
  ]

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className="rounded-[7px] border border-white/10 bg-[rgba(20,18,27,0.86)] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.22)] backdrop-blur-md">
        <Link to="/" className="mb-3 block overflow-hidden rounded-[6px] border border-white/8 bg-black/18">
          <div className="relative h-14 bg-cover bg-center" style={siteArtBackgroundStyle(homeBgBase)}>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,12,17,0.88),rgba(13,12,17,0.35)),radial-gradient(circle_at_85%_20%,rgba(5,216,189,0.2),transparent_48%)]" />
          </div>
          <div className="px-3 py-2.5">
            <p className="ca-mono-label text-[0.44rem] text-ca-text-3">SITE HUB</p>
            <p className="ca-display mt-1 text-[1.35rem] leading-none text-ca-text">Arena Archive</p>
          </div>
        </Link>

        <nav className="grid gap-1.5">
          {navItems.map((item) => (
            <NavButton key={item.key} item={item} activeNav={activeNav} />
          ))}
        </nav>

        <div className="mt-3 border-t border-dotted border-white/12 pt-3">
          <NavButton
            item={{ key: 'settings', label: 'Settings', detail: 'Account', to: '/settings' }}
            activeNav={activeNav}
          />
        </div>

        <div className="mt-3 space-y-3 border-t border-dotted border-white/12 pt-3">
          <SiteAccountBlock />
          {featured ? (
            <SiteSideBlock title="Featured Fighter">
              <FeaturedFighterCard entry={featured} compact />
            </SiteSideBlock>
          ) : null}
          <SiteActivityBlock />
        </div>
      </div>
    </aside>
  )
}

function NavButton({
  item,
  activeNav,
}: {
  item: SiteNavItem
  activeNav: SiteNavKey
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => {
        const active = isActive || activeNav === item.key
        return [
          'group relative rounded-[6px] border px-2.5 py-2 text-left transition duration-200 hover:-translate-y-0.5',
          item.cta
            ? 'border-ca-red/45 bg-[linear-gradient(180deg,rgba(250,39,66,0.97),rgba(196,29,51,0.94))] text-white shadow-[0_10px_22px_rgba(250,39,66,0.16)]'
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
            <span className="ca-display block text-[1rem] leading-none tracking-[0.05em]">{item.label}</span>
            <span className={['mt-1 block text-[0.68rem]', item.cta ? 'text-white/78' : 'text-ca-text-3'].join(' ')}>
              {item.detail}
            </span>
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
          size={46}
          className="rounded-[7px] border-ca-red/40"
        />
        <div className="min-w-0">
          <p className="ca-display truncate text-[1.35rem] leading-none text-ca-text">{profile.displayName}</p>
          <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-text-3">
            {status === 'authenticated' ? authProfile?.role?.toUpperCase() ?? 'PLAYER' : 'LOCAL PROFILE'}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to="/profile" className="ca-display rounded-[6px] border border-white/10 bg-white/[0.035] px-3 py-2 text-center text-[0.9rem] text-ca-text-2 transition hover:border-ca-teal/20">
          Profile
        </Link>
        <Link to="/settings" className="ca-display rounded-[6px] border border-white/10 bg-white/[0.035] px-3 py-2 text-center text-[0.9rem] text-ca-text-2 transition hover:border-ca-teal/20">
          Settings
        </Link>
      </div>
    </SiteSideBlock>
  )
}

function SiteActivityBlock() {
  const recentMatches = readRecentMatchHistory().slice(0, 2)
  const teamEntries = battlePrepRoster.slice(0, 3)

  return (
    <SiteSideBlock title="Activity">
      <div className="rounded-[6px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-2">
        <p className="ca-mono-label text-[0.4rem] text-ca-teal">ARENA STATUS</p>
        <p className="ca-display mt-1 text-[1.25rem] leading-none text-ca-text">Queue Ready</p>
      </div>

      <div className="mt-2 space-y-2">
        {recentMatches.length > 0 ? (
          recentMatches.map((match) => (
            <RecentBattleRow key={match.id} match={match} entries={teamEntries} />
          ))
        ) : (
          <div className="rounded-[6px] border border-white/8 bg-white/[0.025] px-3 py-2">
            <div className="flex items-center gap-1.5">
              {teamEntries.map((entry) => (
                <CharacterFacePortrait key={entry.id} characterId={entry.id} name={entry.name} src={entry.facePortrait} rarity={entry.rarity} size="xs" />
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-ca-text-3">Recent games appear after your first match.</p>
          </div>
        )}
      </div>

      <Link to="/manual" className="mt-2 block rounded-[6px] border border-white/8 bg-[rgba(255,255,255,0.025)] px-3 py-2 transition duration-150 hover:border-ca-teal/22">
        <p className="ca-mono-label text-[0.4rem] text-ca-text-3">LATEST UPDATE</p>
        <p className="mt-1 text-xs leading-5 text-ca-text-2">Manual and roster previews are now available.</p>
      </Link>
    </SiteSideBlock>
  )
}

function SiteSideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="ca-mono-label border-b border-dotted border-white/12 pb-2 text-[0.46rem] text-ca-text-3">{title}</p>
      <div className="pt-2">{children}</div>
    </section>
  )
}

function SiteContentFrame({ children }: PropsWithChildren) {
  return (
    <div className="min-h-[calc(100vh-7.5rem)] rounded-[7px] border border-white/10 bg-[rgba(18,16,24,0.72)] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:p-4">
      {children}
    </div>
  )
}

function CurrencyPill({ label, value, tone }: { label: string; value: string; tone: 'gold' | 'teal' }) {
  return (
    <div className="rounded-[6px] border border-white/10 bg-[rgba(255,255,255,0.035)] px-2.5 py-1.5">
      <p className={['ca-mono-label text-[0.36rem]', tone === 'gold' ? 'text-ca-gold' : 'text-ca-teal'].join(' ')}>
        {label}
      </p>
      <p className="ca-mono-label mt-1 text-[0.5rem] text-ca-text">{value}</p>
    </div>
  )
}
