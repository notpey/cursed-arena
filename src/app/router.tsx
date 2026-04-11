import { Suspense, lazy, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'

const ShellLayout = lazy(async () => ({ default: (await import('@/app/ShellLayout')).ShellLayout }))
const HomePage = lazy(async () => ({ default: (await import('@/pages/HomePage')).HomePage }))
const BattlePage = lazy(async () => ({ default: (await import('@/pages/BattlePage')).BattlePage }))
const BattlePrepPage = lazy(async () => ({ default: (await import('@/pages/BattlePrepPage')).BattlePrepPage }))
const BattleResultsPage = lazy(async () => ({ default: (await import('@/pages/BattleResultsPage')).BattleResultsPage }))
const StoryPage = lazy(async () => ({ default: (await import('@/pages/StoryPage')).StoryPage }))
const ProfilePage = lazy(async () => ({ default: (await import('@/pages/ProfilePage')).ProfilePage }))
const SettingsPage = lazy(async () => ({ default: (await import('@/pages/SettingsPage')).SettingsPage }))
const NotFoundPage = lazy(async () => ({ default: (await import('@/pages/NotFoundPage')).NotFoundPage }))

const routeFallback = (
  <div className="grid min-h-screen place-items-center bg-[color:var(--bg-void)] px-6 text-ca-text">
    <div className="rounded-[10px] border border-white/10 bg-[rgba(18,18,26,0.92)] px-5 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.34)]">
      <p className="ca-mono-label text-[0.62rem] text-ca-text-2">LOADING ROUTE</p>
    </div>
  </div>
)

function withRouteSuspense(node: ReactNode) {
  return <Suspense fallback={routeFallback}>{node}</Suspense>
}

const shellRoutes = [
  { index: true, element: withRouteSuspense(<HomePage />) },
  { path: 'battle/prep', element: withRouteSuspense(<BattlePrepPage />) },
  { path: 'battle/results', element: withRouteSuspense(<BattleResultsPage />) },
  { path: 'story', element: withRouteSuspense(<StoryPage />) },
  { path: 'profile', element: withRouteSuspense(<ProfilePage />) },
  { path: 'settings', element: withRouteSuspense(<SettingsPage />) },
  { path: '*', element: withRouteSuspense(<NotFoundPage />) },
]

export const router = createBrowserRouter([
  {
    path: '/battle',
    element: withRouteSuspense(<BattlePage />),
  },
  {
    path: '/',
    element: withRouteSuspense(<ShellLayout />),
    children: shellRoutes,
  },
])
