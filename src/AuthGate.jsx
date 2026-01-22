import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
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
        .select('id, display_name, account_xp, account_level, rating, avatar_url, soft_currency, premium_currency')
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) setAuthError(error.message)
  }

  const handleSignUp = async () => {
    setAuthError('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) setAuthError(error.message)
  }

  const handleSaveProfile = async () => {
    if (!session) return
    if (!displayName.trim()) {
      setAuthError('Display name is required.')
      return
    }

    setAuthError('')
    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      display_name: displayName.trim(),
      updated_at: new Date().toISOString(),
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    const nextProfile = {
      id: session.user.id,
      display_name: displayName.trim(),
      account_xp: 0,
      account_level: 1,
      rating: 1000,
      avatar_url: null,
      soft_currency: 0,
      premium_currency: 0,
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
              placeholder="At least 6 characters"
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
              maxLength={20}
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
