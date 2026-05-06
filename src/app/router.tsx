import { Suspense, lazy, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AuthGate } from '@/app/AuthGate'

const ShellLayout = lazy(async () => ({ default: (await import('@/app/ShellLayout')).ShellLayout }))
const AdminRoute = lazy(async () => ({ default: (await import('@/app/AdminRoute')).AdminRoute }))
const LoginPage = lazy(async () => ({ default: (await import('@/pages/LoginPage')).LoginPage }))
const HomePage = lazy(async () => ({ default: (await import('@/pages/HomePage')).HomePage }))
const ManualPage = lazy(async () => ({ default: (await import('@/pages/ManualPage')).ManualPage }))
const CharactersPage = lazy(async () => ({ default: (await import('@/pages/CharactersPage')).CharactersPage }))
const CharacterDetailPage = lazy(async () => ({ default: (await import('@/pages/CharacterDetailPage')).CharacterDetailPage }))
const BattlePage = lazy(async () => ({ default: (await import('@/pages/BattlePage')).BattlePage }))
const BattlePrepPage = lazy(async () => ({ default: (await import('@/pages/BattlePrepPage')).BattlePrepPage }))
const BattleResultsPage = lazy(async () => ({ default: (await import('@/pages/BattleResultsPage')).BattleResultsPage }))
const MissionsPage = lazy(async () => ({ default: (await import('@/pages/MissionsPage')).MissionsPage }))
const ClansPage = lazy(async () => ({ default: (await import('@/pages/ClansPage')).ClansPage }))
const CreateClanPage = lazy(async () => ({ default: (await import('@/pages/CreateClanPage')).CreateClanPage }))
const ClanProfilePage = lazy(async () => ({ default: (await import('@/pages/ClanProfilePage')).ClanProfilePage }))
const ClanPanelPage = lazy(async () => ({ default: (await import('@/pages/ClanPanelPage')).ClanPanelPage }))
const LadderPage = lazy(async () => ({ default: (await import('@/pages/LadderPage')).LadderPage }))
const ProfilePage = lazy(async () => ({ default: (await import('@/pages/ProfilePage')).ProfilePage }))
const SettingsPage = lazy(async () => ({ default: (await import('@/pages/SettingsPage')).SettingsPage }))
const NotFoundPage = lazy(async () => ({ default: (await import('@/pages/NotFoundPage')).NotFoundPage }))
const GameClientShell = lazy(async () => ({ default: (await import('@/components/layout/GameClientShell')).GameClientShell }))

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
  { path: 'manual', element: withRouteSuspense(<ManualPage />) },
  { path: 'characters', element: withRouteSuspense(<CharactersPage />) },
  { path: 'characters/:id', element: withRouteSuspense(<CharacterDetailPage />) },
  { path: 'battle/prep', element: withRouteSuspense(<BattlePrepPage />) },
  { path: 'battle/results', element: withRouteSuspense(<BattleResultsPage />) },
  { path: 'missions', element: withRouteSuspense(<MissionsPage />) },
  { path: 'ladders', element: withRouteSuspense(<LadderPage />) },
  { path: 'clans', element: withRouteSuspense(<ClansPage />) },
  { path: 'clans/create', element: withRouteSuspense(<CreateClanPage />) },
  { path: 'clans/:clanId', element: withRouteSuspense(<ClanProfilePage />) },
  { path: 'clan-panel', element: withRouteSuspense(<ClanPanelPage />) },
  { path: 'profile', element: withRouteSuspense(<ProfilePage />) },
  { path: 'settings', element: withRouteSuspense(<SettingsPage />) },
  { path: 'admin', element: withRouteSuspense(<AdminRoute />) },
  { path: '*', element: withRouteSuspense(<NotFoundPage />) },
]

export const router = createBrowserRouter([
  // Public — no auth required
  {
    path: '/login',
    element: withRouteSuspense(<LoginPage />),
  },
  // Protected battle routes
  {
    path: '/battle',
    element: (
      <AuthGate>
        {withRouteSuspense(
          <GameClientShell mode="battle">
            <BattlePage />
          </GameClientShell>,
        )}
      </AuthGate>
    ),
  },
  {
    path: '/battle/:matchId',
    element: (
      <AuthGate>
        {withRouteSuspense(
          <GameClientShell mode="battle">
            <BattlePage />
          </GameClientShell>,
        )}
      </AuthGate>
    ),
  },
  // Protected shell
  {
    path: '/',
    element: (
      <AuthGate>
        {withRouteSuspense(<ShellLayout />)}
      </AuthGate>
    ),
    children: shellRoutes,
  },
])
