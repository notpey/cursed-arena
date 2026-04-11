import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { PlayerRole } from '@/features/player/store'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured'

export type ProfileRow = {
  id: string
  display_name: string | null
  role: PlayerRole | null
  avatar_url: string | null
}

export type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  isConfigured: boolean
  isAdmin: boolean
  error: string | null
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<{ error: string | null }>
  saveDisplayName: (displayName: string) => Promise<{ error: string | null }>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
