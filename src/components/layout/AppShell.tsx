import type { PropsWithChildren } from 'react'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { TopBar } from '@/components/layout/TopBar'
import homeBgBase from '@/assets/backgrounds/home-bg-base.png'

export type NavItemKey =
  | 'home'
  | 'battle'
  | 'roster'
  | 'summon'
  | 'story'
  | 'inventory'
  | 'profile'
  | 'settings'

type AppShellProps = PropsWithChildren<{
  activeNav: NavItemKey
}>

export function AppShell({ activeNav, children }: AppShellProps) {
  const isHome = activeNav === 'home'

  return (
    <div className="relative min-h-screen bg-[color:var(--bg-void)] text-ca-text">
      {isHome ? <HomeRouteBackdrop /> : <DefaultAtmosphere />}

      <div className="relative flex min-h-screen">
        <SidebarNav activeNav={activeNav} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopBar />
          <main
            className={
              activeNav === 'home'
                ? 'flex-1 min-h-0 overflow-hidden px-4 sm:px-6 lg:px-8'
                : 'flex-1 px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8'
            }
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

function DefaultAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-ca-red/10 blur-3xl" />
      <div className="absolute right-0 top-0 h-[30rem] w-[30rem] rounded-full bg-ca-teal/10 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
    </div>
  )
}

function HomeRouteBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-y-0 left-[72px] right-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.43]"
          style={{ backgroundImage: `url(${homeBgBase})`, backgroundPosition: 'center center' }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(78%_70%_at_78%_42%,rgba(228,230,239,0.15),transparent_63%),radial-gradient(58%_54%_at_83%_22%,rgba(5,216,189,0.05),transparent_62%)]" />

        <div className="absolute inset-y-0 left-0 w-[38%] bg-[linear-gradient(90deg,rgba(6,7,12,0.78)_0%,rgba(7,8,14,0.66)_18%,rgba(8,10,16,0.48)_34%,rgba(8,10,16,0.24)_54%,rgba(8,10,16,0.08)_72%,rgba(8,10,16,0)_100%)]" />

        <div className="absolute inset-y-0 left-[5%] w-[28%] bg-[radial-gradient(70%_100%_at_50%_35%,rgba(8,10,18,0.18),rgba(8,10,18,0.52)_70%,rgba(7,8,12,0.74)_100%)] blur-3xl" />
        <div className="absolute inset-y-0 left-[17%] w-[17%] bg-[radial-gradient(65%_100%_at_50%_50%,rgba(16,18,30,0.02),rgba(8,10,18,0.28)_65%,rgba(7,8,12,0.42)_100%)] blur-2xl" />

        <div className="absolute inset-x-0 top-0 h-[16%] bg-[linear-gradient(180deg,rgba(7,8,12,0.62),rgba(7,8,12,0.1),rgba(7,8,12,0))]" />
        <div className="absolute inset-x-0 bottom-0 h-[24%] bg-[linear-gradient(180deg,rgba(8,9,14,0)_0%,rgba(8,9,14,0.16)_28%,rgba(8,9,14,0.48)_64%,rgba(8,9,14,0.8)_100%)]" />

        <div className="absolute inset-0 opacity-25 [background:radial-gradient(55%_85%_at_22%_38%,rgba(34,38,72,0.18),transparent_60%),radial-gradient(45%_65%_at_34%_68%,rgba(37,43,86,0.12),transparent_62%),radial-gradient(55%_55%_at_88%_50%,rgba(228,230,239,0.05),transparent_70%)]" />

        <div className="absolute inset-0 bg-[radial-gradient(120%_65%_at_50%_-5%,rgba(0,0,0,0.26),transparent_55%),radial-gradient(120%_70%_at_110%_100%,rgba(0,0,0,0.3),transparent_52%)]" />
      </div>
    </div>
  )
}
