import { Outlet, useLocation } from 'react-router-dom'
import { AppShell, type NavItemKey } from '@/components/layout/AppShell'

const pathToNav: Record<string, NavItemKey> = {
  '/': 'home',
  '/battle': 'battle',
  '/roster': 'roster',
  '/summon': 'summon',
  '/story': 'story',
  '/inventory': 'inventory',
  '/profile': 'profile',
  '/settings': 'settings',
}

export function ShellLayout() {
  const location = useLocation()
  const pathname = location.pathname
  const activeNav =
    pathToNav[pathname] ??
    (pathname.startsWith('/roster')
      ? 'roster'
      : pathname.startsWith('/battle')
        ? 'battle'
        : pathname.startsWith('/profile')
          ? 'profile'
          : 'home')

  return (
    <AppShell activeNav={activeNav}>
      <Outlet />
    </AppShell>
  )
}
