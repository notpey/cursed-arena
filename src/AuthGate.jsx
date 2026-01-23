import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { validateEmail, validatePassword, validateDisplayName } from './validation'
import './App.css'

function AuthGate({ children, onSession, onProfile, navItems = [], onProfileClick, compact = false }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session ?? null)
      setLoading(false)
    }

    init()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setProfile(null)
      setAuthError('')
      if (onSession) onSession(newSession)
    })

    return () => {
      mounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      if (!session) return
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, account_xp, account_level, rating, avatar_url, soft_currency, premium_currency, role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) {
        setAuthError(error.message)
        return
      }

      setProfile(data || null)
      if (onProfile) onProfile(data || null)
    }

    loadProfile()
  }, [session])

  const handleSignIn = async () => {
    setAuthError('')

    // Validate email
    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      setAuthError(emailValidation.error)
      return
    }

    // Validate password (basic check for sign in)
    if (!password || password.length === 0) {
      setAuthError('Password is required')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailValidation.value,
      password,
    })

    if (error) {
      // Provide user-friendly error messages
      if (error.message.includes('Invalid login credentials')) {
        setAuthError('Invalid email or password. Please try again.')
      } else if (error.message.includes('Email not confirmed')) {
        setAuthError('Please confirm your email address before signing in.')
      } else {
        setAuthError(error.message)
      }
    }
  }

  const handleSignUp = async () => {
    setAuthError('')

    // Validate email
    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      setAuthError(emailValidation.error)
      return
    }

    // Validate password with strength requirements
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      setAuthError(passwordValidation.error)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: emailValidation.value,
      password: passwordValidation.value,
    })

    if (error) {
      // Provide user-friendly error messages
      if (error.message.includes('already registered')) {
        setAuthError('This email is already registered. Please sign in instead.')
      } else if (error.message.includes('invalid email')) {
        setAuthError('Please enter a valid email address.')
      } else {
        setAuthError(error.message)
      }
    } else {
      setAuthError('') // Clear any previous errors
      // Optionally show success message
    }
  }

  const handleSaveProfile = async () => {
    if (!session) return

    setAuthError('')

    // Validate display name
    const nameValidation = validateDisplayName(displayName)
    if (!nameValidation.valid) {
      setAuthError(nameValidation.error)
      return
    }

    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      display_name: nameValidation.value,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      // Provide user-friendly error messages
      if (error.message.includes('duplicate key')) {
        setAuthError('This display name is already taken. Please choose another.')
      } else if (error.message.includes('violates')) {
        setAuthError('Display name contains invalid characters.')
      } else {
        setAuthError(`Failed to save profile: ${error.message}`)
      }
      return
    }

    const nextProfile = {
      id: session.user.id,
      display_name: nameValidation.value,
      account_xp: 0,
      account_level: 1,
      rating: 1000,
      avatar_url: null,
      soft_currency: 0,
      premium_currency: 0,
      role: 'player',
    }
    setProfile(nextProfile)
    if (onProfile) onProfile(nextProfile)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    if (onProfile) onProfile(null)
    if (onSession) onSession(null)
  }

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-panel">
          <div className="auth-logo">⚔️</div>
          <h1>CURSED ARENA</h1>
          <p className="auth-subtitle">Loading your experience...</p>
          <div className="auth-loading">
            <div className="auth-loading-bar"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-panel">
          <div className="auth-logo">⚔️</div>
          <h1>CURSED ARENA</h1>
          <p className="auth-subtitle">Sign in or create an account to save your progress and compete with others.</p>
          <label className="auth-label">
            <span className="auth-label-text">Email Address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              placeholder="you@example.com"
            />
          </label>
          <label className="auth-label">
            <span className="auth-label-text">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              placeholder="At least 8 characters, include number & letter"
            />
          </label>
          {authError && <p className="auth-error">⚠️ {authError}</p>}
          <div className="auth-actions">
            <button className="auth-btn primary" onClick={handleSignIn}>
              <span>Sign In</span>
            </button>
            <button className="auth-btn secondary" onClick={handleSignUp}>
              <span>Create Account</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="auth-screen">
        <div className="auth-panel">
          <div className="auth-logo">🎮</div>
          <h1>WELCOME WARRIOR</h1>
          <p className="auth-subtitle">Choose a display name to begin your journey in the Cursed Arena.</p>
          <label className="auth-label">
            <span className="auth-label-text">Display Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="auth-input"
              placeholder="Your in-game name"
              maxLength={32}
            />
          </label>
          {authError && <p className="auth-error">⚠️ {authError}</p>}
          <div className="auth-actions">
            <button className="auth-btn primary" onClick={handleSaveProfile}>
              <span>Start Playing</span>
            </button>
            <button className="auth-btn secondary" onClick={handleSignOut}>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const accountLevel = profile?.account_level || 1
  const accountXp = profile?.account_xp || 0
  const accountNeeded = 100 + accountLevel * 25
  const avatarInitial = profile?.display_name?.[0]?.toUpperCase() || '?'

  return (
    <div className="auth-wrapper">
      <div className={`auth-bar ${compact ? 'compact' : ''}`}>
        <button
          className="auth-user-card"
          type="button"
          onClick={onProfileClick}
          disabled={!onProfileClick}
        >
          <div className="auth-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} />
            ) : (
              <span>{avatarInitial}</span>
            )}
          </div>
          <div className="auth-user-meta">
            <span className="auth-user-name">{profile.display_name}</span>
            <span className="auth-user-level">Lv {accountLevel} • {accountXp}/{accountNeeded} XP</span>
          </div>
        </button>

        <div className="auth-center">
          <div className="auth-title">Cursed Arena</div>
          {navItems.length > 0 && (
            <div className="auth-nav">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`auth-nav-btn ${item.active ? 'active' : ''}`}
                  onClick={item.onClick}
                  disabled={item.disabled}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="auth-actions">
          <div className="auth-currency">
            <span>Soft {profile?.soft_currency ?? 0}</span>
            <span>Premium {profile?.premium_currency ?? 0}</span>
          </div>
          {!compact && (
            <button className="auth-link" onClick={handleSignOut}>Sign Out</button>
          )}
        </div>
      </div>
      <div className="auth-content">
        {children}
      </div>
    </div>
  )
}

export default AuthGate
