import { useEffect, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { canAccessAdminPanel } from '@/config/features'
import { AuthContext, type AuthStatus, type ProfileRow } from '@/features/auth/context'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import {
  defaultPlayerState,
  normalizeAvatarLabel,
  normalizePlayerRole,
  updatePlayerState,
} from '@/features/player/store'

function resolveRedirectUrl() {
  const configuredSiteUrl = import.meta.env.VITE_SITE_URL?.trim()
  if (configuredSiteUrl) return configuredSiteUrl
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:5173'
}

function deriveDisplayName(user: User) {
  const metadata = user.user_metadata ?? {}
  const candidates = [
    metadata.display_name,
    metadata.full_name,
    metadata.name,
    metadata.user_name,
    metadata.preferred_username,
    user.email?.split('@')[0],
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  return defaultPlayerState.profile.displayName
}

function deriveAvatarUrl(user: User) {
  const metadata = user.user_metadata ?? {}
  const candidates = [metadata.avatar_url, metadata.picture]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  return null
}

function buildAccountLinks(user: User | null) {
  const providers = new Set((user?.identities ?? []).map((identity) => identity.provider))

  return {
    google: providers.has('google'),
    apple: providers.has('apple'),
    email: Boolean(user?.email),
  }
}

function applySignedOutPlayerState() {
  updatePlayerState((next) => {
    next.profile.displayName = defaultPlayerState.profile.displayName
    next.profile.playerId = defaultPlayerState.profile.playerId
    next.profile.title = defaultPlayerState.profile.title
    next.profile.avatarLabel = defaultPlayerState.profile.avatarLabel
    next.profile.role = defaultPlayerState.profile.role
    next.settings.accountLinks = {
      google: false,
      apple: false,
      email: false,
    }
  })
}

function applyAuthenticatedPlayerState(user: User, profile: ProfileRow | null) {
  const displayName = (profile?.display_name?.trim() || deriveDisplayName(user)).trim()
  const role = normalizePlayerRole(profile?.role)
  const accountLinks = buildAccountLinks(user)

  updatePlayerState((next) => {
    next.profile.displayName = displayName
    next.profile.playerId = `#${user.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`
    next.profile.avatarLabel = normalizeAvatarLabel(next.profile.avatarLabel, displayName)
    next.profile.role = role
    next.settings.accountLinks = accountLinks
  })
}

async function fetchProfile(user: User) {
  const client = getSupabaseClient()
  if (!client) return { data: null as ProfileRow | null, error: 'Supabase is not configured.' }

  const payload = {
    id: user.id,
    display_name: deriveDisplayName(user),
    avatar_url: deriveAvatarUrl(user),
    updated_at: new Date().toISOString(),
  }

  const upsertResult = await client.from('profiles').upsert(payload, { onConflict: 'id' })
  if (upsertResult.error) {
    return { data: null as ProfileRow | null, error: upsertResult.error.message }
  }

  const query = await client
    .from('profiles')
    .select('id, display_name, role, avatar_url')
    .eq('id', user.id)
    .maybeSingle<ProfileRow>()

  if (query.error) {
    return { data: null as ProfileRow | null, error: query.error.message }
  }

  return { data: query.data ?? null, error: null }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured() ? 'loading' : 'unconfigured')
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) {
      applySignedOutPlayerState()
      return
    }

    let disposed = false

    async function syncSession(nextSession: Session | null) {
      if (disposed) return

      setSession(nextSession)
      const nextUser = nextSession?.user ?? null
      setUser(nextUser)

      if (!nextUser) {
        setProfile(null)
        setStatus('unauthenticated')
        setError(null)
        applySignedOutPlayerState()
        return
      }

      setStatus('loading')
      const result = await fetchProfile(nextUser)
      if (disposed) return

      if (result.error) {
        setProfile(null)
        setStatus('authenticated')
        setError(result.error)
        applyAuthenticatedPlayerState(nextUser, null)
        return
      }

      setProfile(result.data)
      setStatus('authenticated')
      setError(null)
      applyAuthenticatedPlayerState(nextUser, result.data)
    }

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setStatus('unauthenticated')
        setError(sessionError.message)
        return
      }

      void syncSession(data.session)
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession)
    })

    return () => {
      disposed = true
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithPassword(email: string, password: string) {
    const client = getSupabaseClient()
    if (!client) return { error: 'Supabase is not configured.' }

    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password) return { error: 'Enter both email and password.' }

    const { error: signInError } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    const nextError = signInError?.message ?? null
    setError(nextError)
    return { error: nextError }
  }

  async function signUpWithPassword(email: string, password: string, displayName: string) {
    const client = getSupabaseClient()
    if (!client) return { error: 'Supabase is not configured.', needsEmailConfirmation: false }

    const normalizedEmail = email.trim()
    const normalizedDisplayName = displayName.trim() || normalizedEmail.split('@')[0] || defaultPlayerState.profile.displayName
    if (!normalizedEmail || !password) return { error: 'Enter email and password to create an account.', needsEmailConfirmation: false }

    const { data, error: signUpError } = await client.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: resolveRedirectUrl(),
        data: {
          display_name: normalizedDisplayName,
          full_name: normalizedDisplayName,
          name: normalizedDisplayName,
        },
      },
    })

    const nextError = signUpError?.message ?? null
    setError(nextError)

    const needsEmailConfirmation = Boolean(data.user && !data.session)
    return { error: nextError, needsEmailConfirmation }
  }

  async function signInWithGoogle() {
    const client = getSupabaseClient()
    if (!client) return { error: 'Supabase is not configured.' }

    const { error: signInError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: resolveRedirectUrl(),
      },
    })

    const nextError = signInError?.message ?? null
    setError(nextError)
    return { error: nextError }
  }

  async function lookupEmailByUsername(username: string) {
    const client = getSupabaseClient()
    if (!client) return { email: null, error: 'Supabase is not configured.' }

    const { data, error: rpcError } = await client.rpc('get_email_by_username', {
      p_username: username.trim(),
    })

    if (rpcError) return { email: null, error: rpcError.message }
    return { email: (data as string | null) ?? null, error: null }
  }

  async function signOut() {
    const client = getSupabaseClient()
    if (!client) return { error: null }

    const { error: signOutError } = await client.auth.signOut()
    const nextError = signOutError?.message ?? null
    setError(nextError)
    return { error: nextError }
  }

  async function saveDisplayName(displayName: string) {
    const client = getSupabaseClient()
    if (!client || !user) return { error: null }

    const normalizedDisplayName = displayName.trim() || deriveDisplayName(user)

    const { error: userError } = await client.auth.updateUser({
      data: {
        display_name: normalizedDisplayName,
        full_name: normalizedDisplayName,
        name: normalizedDisplayName,
      },
    })

    if (userError) {
      setError(userError.message)
      return { error: userError.message }
    }

    const { error: profileError } = await client
      .from('profiles')
      .update({
        display_name: normalizedDisplayName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    const nextError = profileError?.message ?? null
    setError(nextError)

    if (!nextError) {
      const nextProfile = profile ? { ...profile, display_name: normalizedDisplayName } : profile
      setProfile(nextProfile)
      applyAuthenticatedPlayerState(user, nextProfile)
    }

    return { error: nextError }
  }

  const value = {
    status,
    session,
    user,
    profile,
    isConfigured: isSupabaseConfigured(),
    isAdmin: canAccessAdminPanel(profile?.role),
    error,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signOut,
    saveDisplayName,
    lookupEmailByUsername,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
