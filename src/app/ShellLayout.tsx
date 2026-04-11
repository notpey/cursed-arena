import { Outlet, useLocation } from 'react-router-dom'
import { AppShell, type NavItemKey } from '@/components/layout/AppShell'

const pathToNav: Record<string, NavItemKey> = {
  '/': 'home',
  '/battle/prep': 'battle',
  '/story': 'story',
  '/profile': 'profile',
  '/settings': 'settings',
}

export function ShellLayout() {
  const location = useLocation()
  const pathname = location.pathname
  const activeNav =
    pathToNav[pathname] ??
    (pathname.startsWith('/battle')
      ? 'battle'
      : pathname.startsWith('/profile')
        ? 'profile'
        : pathname.startsWith('/story')
          ? 'story'
          : 'home')

  return (
    <AppShell activeNav={activeNav}>
      <Outlet />
    </AppShell>
  )
}

