import { Link, useLocation } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { usePlayerState } from '@/features/player/store'

type GameClientShellProps = PropsWithChildren<{
  mode: 'prep' | 'battle' | 'results'
}>

const modeLabels: Record<GameClientShellProps['mode'], { label: string; status: string }> = {
  prep: { label: 'Team Selection', status: 'Client Lobby' },
  battle: { label: 'Active Match', status: 'Battle Client' },
  results: { label: 'Results', status: 'Match Report' },
}

export function GameClientShell({ mode, children }: GameClientShellProps) {
  const { profile } = usePlayerState()
  const location = useLocation()

  if (mode === 'battle') {
    return <div className="bg-[#08090d] text-ca-text">{children}</div>
  }

  const identity = modeLabels[mode]

  return (
    <div className="relative min-h-screen overflow-hidden bg-[color:var(--bg-void)] text-ca-text">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-36 top-12 h-96 w-96 rounded-full bg-ca-red/9 blur-3xl" />
        <div className="absolute right-[-8rem] top-0 h-[30rem] w-[30rem] rounded-full bg-ca-teal/8 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,12,17,0.16),rgba(13,12,17,0.72))]" />
      </div>

      <header className="relative z-20 border-b border-white/10 bg-[rgba(13,12,17,0.82)] backdrop-blur-xl">
        <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[7px] border border-ca-red/35 bg-ca-red-wash-mid transition duration-150 hover:border-ca-red/55"
              aria-label="Back to site"
            >
              <span className="ca-display text-[1.05rem] leading-none text-white">CA</span>
            </Link>
            <div className="min-w-0">
              <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{identity.status}</p>
              <h1 className="ca-display truncate text-[1.45rem] leading-none text-ca-text sm:text-[1.75rem]">
                {identity.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="ca-display hidden rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[1rem] text-ca-text-2 transition duration-150 hover:border-white/18 hover:text-ca-text sm:inline-flex"
            >
              Back To Site
            </Link>
            <Link
              to="/profile"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-ca-surface text-[0.58rem] font-semibold transition duration-150 hover:border-ca-teal/35"
              aria-label="Profile"
            >
              {profile.avatarLabel}
            </Link>
          </div>
        </div>
      </header>

      <main key={location.pathname} className="relative z-10 h-[calc(100vh-3.5rem)] min-h-0 px-3 sm:px-4">
        <div className="h-full min-h-0 animate-ca-fade-in">{children}</div>
      </main>
    </div>
  )
}
