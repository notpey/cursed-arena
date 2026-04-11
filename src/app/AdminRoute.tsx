import { Navigate } from 'react-router-dom'
import { canAccessAdminPanel } from '@/config/features'
import { useAuth } from '@/features/auth/useAuth'
import { AdminControlPanelPage } from '@/pages/AdminControlPanelPage'

function RouteFallback() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-ca-text">
      <div className="rounded-[10px] border border-white/10 bg-[rgba(18,18,26,0.92)] px-5 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.34)]">
        <p className="ca-mono-label text-[0.62rem] text-ca-text-2">VERIFYING ACCESS</p>
      </div>
    </div>
  )
}

export function AdminRoute() {
  const { status, profile } = useAuth()

  if (status === 'loading') return <RouteFallback />
  return canAccessAdminPanel(profile?.role) ? <AdminControlPanelPage /> : <Navigate to="/settings" replace />
}
