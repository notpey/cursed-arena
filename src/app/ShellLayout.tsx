import { Outlet, useLocation } from 'react-router-dom'
import { AppShell, type NavItemKey } from '@/components/layout/AppShell'

const pathToNav: Record<string, NavItemKey> = {
  '/': 'home',
  '/battle/prep': 'battle',
  '/story': 'story',
  '/profile': 'profile',
  '/settings': 'settings',
  '/admin': 'admin',
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
          : pathname.startsWith('/settings')
            ? 'settings'
            : pathname.startsWith('/admin')
              ? 'admin'
              : 'home')

  return (
    <AppShell activeNav={activeNav}>
      <div key={location.pathname} className="animate-ca-fade-in">
        <Outlet />
      </div>
    </AppShell>
  )
}
