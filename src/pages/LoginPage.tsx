import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import homeBgBase from '@/assets/backgrounds/home-bg-base.webp'

type AuthMode = 'login' | 'signup'

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<AuthMode>('login')

  // Login fields
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Signup fields
  const [signupUsername, setSignupUsername] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')

  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null)

  useEffect(() => {
    if (auth.status === 'authenticated' || auth.status === 'unconfigured') {
      navigate('/', { replace: true })
    }
  }, [auth.status, navigate])

  function switchMode(next: AuthMode) {
    setMode(next)
    setErrorMsg(null)
    setConfirmMsg(null)
    setLoginPassword('')
    setSignupPassword('')
    setSignupConfirm('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    if (!loginUsername.trim()) {
      setErrorMsg('Enter your username.')
      return
    }
    if (!loginPassword) {
      setErrorMsg('Enter your password.')
      return
    }

    setBusy(true)

    // Resolve username → email via the RPC, then sign in
    const { email, error: lookupError } = await auth.lookupEmailByUsername(loginUsername)
    if (lookupError) {
      setBusy(false)
      setErrorMsg(lookupError)
      return
    }
    if (!email) {
      setBusy(false)
      setErrorMsg('Username not found. Check your spelling or create an account.')
      return
    }

    const result = await auth.signInWithPassword(email, loginPassword)
    setBusy(false)
    if (result.error) {
      setErrorMsg(result.error)
    }
    // auth status change triggers the useEffect redirect
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    if (!signupUsername.trim()) {
      setErrorMsg('Choose a username.')
      return
    }
    if (!signupEmail.trim()) {
      setErrorMsg('Enter a recovery email address.')
      return
    }
    if (!signupPassword) {
      setErrorMsg('Choose a password.')
      return
    }
    if (signupPassword !== signupConfirm) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setBusy(true)
    const result = await auth.signUpWithPassword(signupEmail, signupPassword, signupUsername)
    setBusy(false)

    if (result.error) {
      setErrorMsg(result.error)
      return
    }

    if (result.needsEmailConfirmation) {
      setConfirmMsg(`Check ${signupEmail.trim()} and confirm your address before signing in.`)
      switchMode('login')
      setLoginUsername(signupUsername)
      return
    }
  }

  async function handleGoogle() {
    setErrorMsg(null)
    setBusy(true)
    const result = await auth.signInWithGoogle()
    if (result.error) {
      setBusy(false)
      setErrorMsg(result.error)
    }
  }

  if (auth.status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-[#08090d]">
        <p className="ca-mono-label text-[0.62rem] text-ca-text-3">LOADING SESSION…</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#08090d] text-ca-text">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.38]"
          style={{ backgroundImage: `url(${homeBgBase})` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,5,8,0.1),rgba(4,5,8,0.55))]" />
        <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-ca-red/8 blur-3xl" />
        <div className="absolute right-0 top-0 h-[28rem] w-[28rem] rounded-full bg-ca-teal/8 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          {/* Wordmark */}
          <div className="mb-8 text-center">
            <p className="ca-mono-label text-[0.52rem] tracking-[0.22em] text-ca-text-3">ENTER THE</p>
            <h1 className="ca-display mt-2 text-5xl text-ca-text">Cursed Arena</h1>
            <p key={mode} className="mt-2 text-[0.78rem] text-ca-text-3 animate-ca-fade-in">
              {mode === 'login'
                ? 'Sign in with your arena username.'
                : 'Create an account to start climbing the ladder.'}
            </p>
          </div>

          {/* Card */}
          <div className="rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,26,0.96),rgba(10,10,16,0.98))] shadow-[0_22px_54px_rgba(0,0,0,0.44)] animate-ca-slide-up">
            {/* Mode tabs */}
            <div className="flex border-b border-white/8">
              {(['login', 'signup'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => switchMode(tab)}
                  className={[
                    'flex-1 py-3 ca-mono-label text-[0.58rem] transition duration-150',
                    mode === tab
                      ? 'border-b-2 border-ca-teal text-ca-teal'
                      : 'text-ca-text-3 hover:text-ca-text-2',
                  ].join(' ')}
                >
                  {tab === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
                </button>
              ))}
            </div>

            <div className="p-6">
              {confirmMsg ? (
                <div className="mb-4 rounded-[0.35rem] border border-ca-teal/22 bg-ca-teal-wash px-3 py-2.5 animate-ca-slide-up">
                  <p className="text-[0.75rem] leading-5 text-ca-teal">{confirmMsg}</p>
                </div>
              ) : null}

              {errorMsg ? (
                <div className="mb-4 rounded-[0.35rem] border border-ca-red/22 bg-ca-red-wash px-3 py-2.5 animate-ca-slide-up">
                  <p className="text-[0.75rem] leading-5 text-ca-red">{errorMsg}</p>
                </div>
              ) : null}

              {mode === 'login' ? (
                <form key="login" onSubmit={handleLogin} className="space-y-3 animate-ca-fade-in">
                  <Field
                    label="Username"
                    type="text"
                    value={loginUsername}
                    onChange={setLoginUsername}
                    placeholder="Your arena name"
                    autoComplete="username"
                  />
                  <Field
                    label="Password"
                    type="password"
                    value={loginPassword}
                    onChange={setLoginPassword}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <ActionButton busy={busy} label="SIGN IN" />
                </form>
              ) : (
                <form key="signup" onSubmit={handleSignup} className="space-y-3 animate-ca-fade-in">
                  <Field
                    label="Username"
                    type="text"
                    value={signupUsername}
                    onChange={setSignupUsername}
                    placeholder="Your arena name"
                    autoComplete="username"
                  />
                  <div>
                    <Field
                      label="Recovery Email"
                      type="email"
                      value={signupEmail}
                      onChange={setSignupEmail}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                    <p className="mt-1 ca-mono-label text-[0.42rem] text-ca-text-3">
                      Used only for password recovery — not shown publicly.
                    </p>
                  </div>
                  <Field
                    label="Password"
                    type="password"
                    value={signupPassword}
                    onChange={setSignupPassword}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <Field
                    label="Confirm Password"
                    type="password"
                    value={signupConfirm}
                    onChange={setSignupConfirm}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <ActionButton busy={busy} label="CREATE ACCOUNT" />
                </form>
              )}

              <div className="mt-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/8" />
                <span className="ca-mono-label text-[0.48rem] text-ca-text-3">OR</span>
                <div className="h-px flex-1 bg-white/8" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-[0.4rem] border border-white/12 bg-[rgba(255,255,255,0.05)] px-4 py-2.5 text-[0.78rem] text-ca-text transition duration-150 hover:bg-[rgba(255,255,255,0.09)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string
  type: 'text' | 'email' | 'password'
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete?: string
}) {
  return (
    <div>
      <label className="mb-1 block ca-mono-label text-[0.5rem] text-ca-text-3">{label.toUpperCase()}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-[0.35rem] border border-white/12 bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-[0.85rem] text-ca-text placeholder:text-ca-text-3 outline-none transition focus:border-ca-teal/40 focus:bg-[rgba(255,255,255,0.07)]"
      />
    </div>
  )
}

function ActionButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-1 w-full rounded-[0.4rem] border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] py-2.5 ca-display text-[1rem] text-white transition duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? 'PLEASE WAIT…' : label}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
