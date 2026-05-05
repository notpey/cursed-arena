import { Outlet, useLocation } from 'react-router-dom'
import { GameClientShell } from '@/components/layout/GameClientShell'
import { SiteShell, type SiteNavKey } from '@/components/layout/SiteShell'

const pathToNav: Record<string, SiteNavKey> = {
  '/': 'home',
  '/manual': 'manual',
  '/characters': 'characters',
  '/missions': 'missions',
  '/ladders': 'ladders',
  '/clans': 'clans',
  '/clan-panel': 'clan-panel',
  '/profile': 'profile',
  '/settings': 'settings',
  '/admin': 'admin',
}

export function ShellLayout() {
  const location = useLocation()
  const pathname = location.pathname

  if (pathname === '/battle/prep') {
    return (
      <GameClientShell mode="prep">
        <Outlet />
      </GameClientShell>
    )
  }

  if (pathname === '/battle/results') {
    return (
      <GameClientShell mode="results">
        <Outlet />
      </GameClientShell>
    )
  }

  const activeNav =
    pathToNav[pathname] ??
    (pathname.startsWith('/profile')
      ? 'profile'
      : pathname.startsWith('/manual')
        ? 'manual'
        : pathname.startsWith('/characters')
          ? 'characters'
        : pathname.startsWith('/missions')
          ? 'missions'
          : pathname.startsWith('/ladders')
            ? 'ladders'
            : pathname.startsWith('/clans')
              ? 'clans'
              : pathname.startsWith('/clan-panel')
                ? 'clan-panel'
                : pathname.startsWith('/settings')
                  ? 'settings'
                  : pathname.startsWith('/admin')
                    ? 'admin'
                    : 'home')

  return (
    <SiteShell activeNav={activeNav}>
      <div key={location.pathname} className="h-full animate-ca-fade-in">
        <Outlet />
      </div>
    </SiteShell>
  )
}
