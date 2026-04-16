import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-[#08090d]">
        <p className="ca-mono-label text-[0.62rem] text-ca-text-3">LOADING SESSION…</p>
      </div>
    )
  }

  // 'unconfigured' means Supabase env vars aren't set — allow through in local dev
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
