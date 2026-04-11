import { Navigate } from 'react-router-dom'
import { canAccessAdminPanel } from '@/config/features'
import { AdminControlPanelPage } from '@/pages/AdminControlPanelPage'
import { usePlayerState } from '@/features/player/store'

export function AdminRoute() {
  const { profile } = usePlayerState()
  return canAccessAdminPanel(profile.role) ? <AdminControlPanelPage /> : <Navigate to="/settings" replace />
}
