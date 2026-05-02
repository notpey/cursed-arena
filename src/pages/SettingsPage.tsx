import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { AvatarUploader } from '@/features/avatar/components/AvatarUploader'
import {
  defaultPlayerState,
  normalizeAvatarLabel,
  updatePlayerState,
  usePlayerState,
  type AnimationSpeed,
  type AutoBattleSpeed,
  type PlayerProfile,
  type PlayerSettings,
  type QualityPreset,
} from '@/features/player/store'

type SaveFlashState = 'idle' | 'saved' | 'reset'
type AccountFlashState = 'idle' | 'saved' | 'signed-out' | 'error' | 'confirm'
type AuthFormMode = 'login' | 'signup'

export function SettingsPage() {
  const playerState = usePlayerState()
  const auth = useAuth()
  const [profileDraft, setProfileDraft] = useState<PlayerProfile>(playerState.profile)
  const [settingsDraft, setSettingsDraft] = useState<PlayerSettings>(playerState.settings)
  const [copiedId, setCopiedId] = useState(false)
  const [saveFlash, setSaveFlash] = useState<SaveFlashState>('idle')
  const [authMode, setAuthMode] = useState<AuthFormMode>('login')
  const [emailInput, setEmailInput] = useState(auth.user?.email ?? '')
  const [passwordInput, setPasswordInput] = useState('')
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('')
  const [signupDisplayName, setSignupDisplayName] = useState('')
  const [accountFlash, setAccountFlash] = useState<AccountFlashState>('idle')
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const [accountBusy, setAccountBusy] = useState(false)

  useEffect(() => {
    setProfileDraft(playerState.profile)
    setSettingsDraft(playerState.settings)
  }, [playerState])

  useEffect(() => {
    setEmailInput(auth.user?.email ?? '')
  }, [auth.user?.email])

  useEffect(() => {
    if (!copiedId) return
    const timer = window.setTimeout(() => setCopiedId(false), 1400)
    return () => window.clearTimeout(timer)
  }, [copiedId])

  useEffect(() => {
    if (saveFlash === 'idle') return
    const timer = window.setTimeout(() => setSaveFlash('idle'), 1500)
    return () => window.clearTimeout(timer)
  }, [saveFlash])

  useEffect(() => {
    if (accountFlash === 'idle') return
    const timer = window.setTimeout(() => setAccountFlash('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [accountFlash])

  const avatarPreviewLabel = useMemo(
    () => normalizeAvatarLabel(profileDraft.avatarLabel, profileDraft.displayName),
    [profileDraft.avatarLabel, profileDraft.displayName],
  )

  async function copyPlayerId() {
    try {
      await navigator.clipboard.writeText(profileDraft.playerId)
      setCopiedId(true)
    } catch {
      setCopiedId(false)
    }
  }

  async function saveChanges() {
    updatePlayerState((next) => {
      next.profile = {
        ...profileDraft,
        displayName: profileDraft.displayName.trim() || defaultPlayerState.profile.displayName,
        title: profileDraft.title.trim() || defaultPlayerState.profile.title,
        avatarLabel: normalizeAvatarLabel(profileDraft.avatarLabel, profileDraft.displayName),
        avatarUrl: profileDraft.avatarUrl,
      }
      next.settings = settingsDraft
    })

    if (auth.status === 'authenticated') {
      const result = await auth.saveDisplayName(profileDraft.displayName)
      if (result.error) {
        setAccountFlash('error')
        setAccountMessage(result.error)
      }
    }

    setSaveFlash('saved')
  }

  function resetToDefaults() {
    updatePlayerState((next) => {
      next.profile = { ...defaultPlayerState.profile }
      next.settings = { ...defaultPlayerState.settings }
    })
    setSaveFlash('reset')
  }

  async function handlePasswordLogin() {
    setAccountBusy(true)
    const result = await auth.signInWithPassword(emailInput, passwordInput)
    setAccountBusy(false)

    if (result.error) {
      setAccountFlash('error')
      setAccountMessage(result.error)
      return
    }

    setAccountMessage(null)
    setPasswordInput('')
  }

  async function handleSignup() {
    if (passwordInput !== confirmPasswordInput) {
      setAccountFlash('error')
      setAccountMessage('Password confirmation does not match.')
      return
    }

    setAccountBusy(true)
    const result = await auth.signUpWithPassword(emailInput, passwordInput, signupDisplayName)
    setAccountBusy(false)

    if (result.error) {
      setAccountFlash('error')
      setAccountMessage(result.error)
      return
    }

    setPasswordInput('')
    setConfirmPasswordInput('')

    if (result.needsEmailConfirmation) {
      setAccountFlash('confirm')
      setAccountMessage(`Account created. Check ${emailInput.trim()} and confirm your email before logging in.`)
      setAuthMode('login')
      return
    }

    setAccountFlash('saved')
    setAccountMessage('Account created and signed in.')
  }

  async function handleGoogle() {
    setAccountBusy(true)
    const result = await auth.signInWithGoogle()
    if (result.error) {
      setAccountBusy(false)
      setAccountFlash('error')
      setAccountMessage(result.error)
    }
  }

  async function handleSignOut() {
    setAccountBusy(true)
    const result = await auth.signOut()
    setAccountBusy(false)

    if (result.error) {
      setAccountFlash('error')
      setAccountMessage(result.error)
      return
    }

    setAccountFlash('signed-out')
    setAccountMessage('Signed out of Supabase.')
  }

  const authStatusLabel =
    auth.status === 'authenticated'
      ? 'SYNCED'
      : auth.status === 'loading'
        ? 'SYNCING'
        : auth.status === 'unconfigured'
          ? 'OFFLINE'
          : 'SIGNED OUT'

  return (
    <section className="py-4 sm:py-6">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-4 rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Settings</p>
              <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">System</h1>
              <p className="mt-2 text-sm text-ca-text-3">
                Configure account, audio, graphics, and gameplay behavior. Auth now syncs through Supabase while the rest of these controls stay local.
              </p>
            </div>
            {saveFlash !== 'idle' ? (
              <span className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-3 py-2 text-[0.48rem] text-ca-teal animate-ca-fade-in">
                {saveFlash === 'saved' ? 'SETTINGS SAVED' : 'DEFAULTS RESTORED'}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <SettingsSection title="Account">
            <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="ca-mono-label text-[0.46rem] text-ca-text-3">Supabase Auth</p>
                  <p className="mt-2 text-sm text-ca-text-2">
                    {auth.status === 'authenticated'
                      ? `Signed in as ${auth.user?.email ?? profileDraft.displayName}.`
                      : auth.status === 'unconfigured'
                        ? 'Supabase environment variables are missing.'
                        : 'Use email and password to log in. New accounts still require email confirmation through Supabase.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={auth.status === 'authenticated' ? 'teal' : auth.status === 'loading' ? 'frost' : 'red'}>
                    {authStatusLabel}
                  </Badge>
                  {auth.profile?.role ? <Badge tone={auth.profile.role === 'admin' ? 'red' : 'teal'}>{auth.profile.role.toUpperCase()}</Badge> : null}
                </div>
              </div>

              {accountMessage || auth.error ? (
                <p className={`mt-3 text-sm animate-ca-slide-up ${accountFlash === 'error' || auth.error ? 'text-ca-red' : 'text-ca-teal'}`}>
                  {accountMessage ?? auth.error}
                </p>
              ) : null}

              {auth.status !== 'authenticated' ? (
                <div className="mt-4 space-y-4">
                  <div className="inline-flex overflow-hidden rounded-md border border-white/10 bg-[rgba(15,16,22,0.42)]">
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className={[
                        'ca-mono-label border-r border-white/8 px-4 py-2 text-[0.5rem] transition',
                        authMode === 'login' ? 'bg-white/[0.06] text-ca-text' : 'text-ca-text-3 hover:bg-white/[0.03]',
                      ].join(' ')}
                    >
                      LOG IN
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('signup')}
                      className={[
                        'ca-mono-label px-4 py-2 text-[0.5rem] transition',
                        authMode === 'signup' ? 'bg-white/[0.06] text-ca-text' : 'text-ca-text-3 hover:bg-white/[0.03]',
                      ].join(' ')}
                    >
                      CREATE ACCOUNT
                    </button>
                  </div>

                  <div key={authMode} className="grid gap-3 sm:grid-cols-2 animate-ca-fade-in">
                    <Field label="Email">
                      <TextInput
                        value={emailInput}
                        onChange={setEmailInput}
                        placeholder="you@domain.com"
                        type="email"
                      />
                    </Field>

                    {authMode === 'signup' ? (
                      <Field label="Display Name">
                        <TextInput
                          value={signupDisplayName}
                          onChange={setSignupDisplayName}
                          placeholder="Your in-game name"
                        />
                      </Field>
                    ) : (
                      <Field label="Password">
                        <TextInput
                          value={passwordInput}
                          onChange={setPasswordInput}
                          placeholder="Password"
                          type="password"
                        />
                      </Field>
                    )}
                  </div>

                  {authMode === 'signup' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Password">
                        <TextInput
                          value={passwordInput}
                          onChange={setPasswordInput}
                          placeholder="Create a password"
                          type="password"
                        />
                      </Field>
                      <Field label="Confirm Password">
                        <TextInput
                          value={confirmPasswordInput}
                          onChange={setConfirmPasswordInput}
                          placeholder="Repeat password"
                          type="password"
                        />
                      </Field>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => { void (authMode === 'login' ? handlePasswordLogin() : handleSignup()) }}
                      disabled={!auth.isConfigured || accountBusy || auth.status === 'loading'}
                      className="ca-display rounded-lg border border-ca-teal/35 bg-ca-teal-wash px-4 py-3 text-2xl text-ca-teal transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {authMode === 'login' ? 'LOG IN' : 'CREATE'}
                    </button>

                    <button
                      type="button"
                      onClick={() => { void handleGoogle() }}
                      disabled={!auth.isConfigured || accountBusy || auth.status === 'loading'}
                      className="ca-mono-label rounded-lg border border-white/10 bg-[rgba(255,255,255,0.02)] px-4 py-3 text-[0.55rem] text-ca-text-2 transition duration-150 hover:border-white/16 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      CONTINUE WITH GOOGLE
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-white/8 bg-[rgba(0,0,0,0.16)] px-3 py-3">
                  <div>
                    <p className="ca-mono-label text-[0.44rem] text-ca-text-3">Connected Account</p>
                    <p className="mt-1 text-sm text-ca-text">{auth.user?.email ?? profileDraft.displayName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void handleSignOut() }}
                    disabled={accountBusy}
                    className="ca-mono-label rounded-lg border border-ca-red/25 bg-transparent px-4 py-3 text-[0.55rem] text-ca-red transition duration-150 hover:bg-ca-red-wash active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    SIGN OUT
                  </button>
                </div>
              )}
            </div>

            <Field label="Display Name">
              <TextInput
                value={profileDraft.displayName}
                onChange={(value) => setProfileDraft((current) => ({ ...current, displayName: value }))}
                placeholder="Display name"
              />
            </Field>

            <Field label="Player Title">
              <TextInput
                value={profileDraft.title}
                onChange={(value) => setProfileDraft((current) => ({ ...current, title: value }))}
                placeholder="Player title"
              />
            </Field>

            <Field label="Player ID">
              <div className="flex gap-2">
                <TextInput value={profileDraft.playerId} readOnly />
                <button
                  type="button"
                  onClick={copyPlayerId}
                  className="ca-mono-label shrink-0 rounded-md border border-white/10 px-3 py-2 text-[0.5rem] text-ca-text-2 transition duration-150 hover:border-ca-teal/30 hover:text-ca-teal active:scale-[0.95]"
                >
                  {copiedId ? 'COPIED' : 'COPY'}
                </button>
              </div>
            </Field>

            <Field label="Avatar Label">
              <div className="flex items-center gap-3 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-3 py-3">
                <SquareAvatar src={profileDraft.avatarUrl} alt={profileDraft.displayName} fallbackLabel={avatarPreviewLabel} size={56} />
                <TextInput
                  value={profileDraft.avatarLabel}
                  onChange={(value) => setProfileDraft((current) => ({ ...current, avatarLabel: value }))}
                  placeholder="Auto"
                  maxLength={2}
                />
              </div>
            </Field>

            <Field label="Profile Avatar">
              <AvatarUploader
                userId={auth.user?.id ?? 'local-user'}
                displayName={profileDraft.displayName}
                avatarUrl={profileDraft.avatarUrl}
                fallbackLabel={avatarPreviewLabel}
                onChange={(avatarUrl) => {
                  setProfileDraft((current) => ({ ...current, avatarUrl }))
                  updatePlayerState((next) => {
                    next.profile.avatarUrl = avatarUrl
                  })
                }}
              />
            </Field>
          </SettingsSection>

          <SettingsSection title="Audio">
            <SliderRow
              label="Master Volume"
              value={settingsDraft.audio.master}
              onChange={(value) => setSettingsDraft((current) => ({ ...current, audio: { ...current.audio, master: value } }))}
            />
            <SliderRow
              label="Music Volume"
              value={settingsDraft.audio.music}
              onChange={(value) => setSettingsDraft((current) => ({ ...current, audio: { ...current.audio, music: value } }))}
            />
            <SliderRow
              label="SFX Volume"
              value={settingsDraft.audio.sfx}
              onChange={(value) => setSettingsDraft((current) => ({ ...current, audio: { ...current.audio, sfx: value } }))}
            />
            <SliderRow
              label="Voice Volume"
              value={settingsDraft.audio.voice}
              onChange={(value) => setSettingsDraft((current) => ({ ...current, audio: { ...current.audio, voice: value } }))}
            />
          </SettingsSection>

          <SettingsSection title="Graphics">
            <Field label="Quality Preset">
              <SegmentedControl<QualityPreset>
                options={['LOW', 'MEDIUM', 'HIGH']}
                value={settingsDraft.graphics.qualityPreset}
                onChange={(value) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    graphics: { ...current.graphics, qualityPreset: value },
                  }))
                }
              />
            </Field>

            <Field label="Animation Speed">
              <SegmentedControl<AnimationSpeed>
                options={['1x', '1.5x', '2x']}
                value={settingsDraft.graphics.animationSpeed}
                onChange={(value) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    graphics: { ...current.graphics, animationSpeed: value },
                  }))
                }
              />
            </Field>

            <ToggleRow
              label="Skip Ultimate animations"
              checked={settingsDraft.graphics.skipUltimates}
              onChange={(checked) =>
                setSettingsDraft((current) => ({
                  ...current,
                  graphics: { ...current.graphics, skipUltimates: checked },
                }))
              }
            />
            <ToggleRow
              label="Reduce particle effects"
              checked={settingsDraft.graphics.reduceParticles}
              onChange={(checked) =>
                setSettingsDraft((current) => ({
                  ...current,
                  graphics: { ...current.graphics, reduceParticles: checked },
                }))
              }
            />
          </SettingsSection>

          <SettingsSection title="Notifications">
            <ToggleRow
              label="Push notifications"
              checked={settingsDraft.notifications.push}
              onChange={(checked) =>
                setSettingsDraft((current) => ({
                  ...current,
                  notifications: { ...current.notifications, push: checked },
                }))
              }
            />
            <ToggleRow
              label="Energy refill alert"
              checked={settingsDraft.notifications.energyRefill}
              onChange={(checked) =>
                setSettingsDraft((current) => ({
                  ...current,
                  notifications: { ...current.notifications, energyRefill: checked },
                }))
              }
            />
            <ToggleRow
              label="Banner ending reminder"
              checked={settingsDraft.notifications.bannerReminder}
              onChange={(checked) =>
                setSettingsDraft((current) => ({
                  ...current,
                  notifications: { ...current.notifications, bannerReminder: checked },
                }))
              }
            />
          </SettingsSection>

          <SettingsSection title="Gameplay">
            <Field label="Auto-battle default speed">
              <select
                value={settingsDraft.gameplay.autoBattleDefaultSpeed}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    gameplay: {
                      ...current.gameplay,
                      autoBattleDefaultSpeed: event.target.value as AutoBattleSpeed,
                    },
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-[rgba(15,16,22,0.62)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
              >
                {(['NORMAL (1x)', 'FAST (1.5x)', 'MAX (2x)'] as AutoBattleSpeed[]).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <ToggleRow
              label="Confirm before spending gems"
              checked={settingsDraft.gameplay.confirmBeforeSpendingGems}
              onChange={(checked) =>
                setSettingsDraft((current) => ({
                  ...current,
                  gameplay: { ...current.gameplay, confirmBeforeSpendingGems: checked },
                }))
              }
            />
            <ToggleRow
              label="Show damage numbers"
              checked={settingsDraft.gameplay.showDamageNumbers}
              onChange={(checked) =>
                setSettingsDraft((current) => ({
                  ...current,
                  gameplay: { ...current.gameplay, showDamageNumbers: checked },
                }))
              }
            />
          </SettingsSection>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={() => { void saveChanges() }}
            className="ca-display rounded-lg border border-ca-teal/35 bg-ca-teal-wash px-4 py-3 text-2xl text-ca-teal shadow-[0_0_18px_rgba(5,216,189,0.08)] transition duration-150 active:scale-[0.97]"
          >
            {saveFlash === 'saved' ? 'Saved' : 'Save Changes'}
          </button>

          <button
            type="button"
            onClick={resetToDefaults}
            className="ca-mono-label rounded-lg border border-ca-red/25 bg-transparent px-4 py-3 text-[0.55rem] text-ca-red transition duration-150 hover:bg-ca-red-wash active:scale-[0.97]"
          >
            RESET DEFAULTS
          </button>
        </div>
      </div>
    </section>
  )
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
      <h2 className="ca-display border-b border-white/6 pb-3 text-2xl text-ca-text">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[0.8rem] text-ca-text-2">{label}</span>
      {children}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  readOnly = false,
  maxLength,
  type = 'text',
}: {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  maxLength?: number
  type?: 'text' | 'email' | 'password'
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      placeholder={placeholder}
      readOnly={readOnly}
      maxLength={maxLength}
      className="w-full rounded-md border border-white/10 bg-[rgba(15,16,22,0.62)] px-3 py-2 text-sm text-ca-text outline-none transition placeholder:text-ca-text-disabled focus:border-ca-teal/35"
    />
  )
}

function Badge({ tone, children }: { tone: 'red' | 'teal' | 'frost'; children: ReactNode }) {
  const toneClass = tone === 'red'
    ? 'border-ca-red/25 bg-ca-red-wash text-ca-red'
    : tone === 'teal'
      ? 'border-ca-teal/25 bg-ca-teal-wash text-ca-teal'
      : 'border-white/12 bg-white/5 text-ca-text-2'

  return <span className={`ca-mono-label rounded-md border px-2 py-1 text-[0.44rem] ${toneClass}`}>{children}</span>
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[0.8rem] text-ca-text-2">{label}</span>
        <span className="ca-mono-label text-[0.5rem] text-ca-text">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="ca-slider w-full"
        style={{ '--slider-fill': `${value}%` } as CSSProperties}
      />
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[0.8rem] text-ca-text-2">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-6 w-10 rounded-full border transition duration-200',
          checked ? 'border-ca-teal/35 bg-ca-teal-wash' : 'border-white/10 bg-ca-highlight/65',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-all duration-200',
            checked ? 'left-[20px]' : 'left-[3px]',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex w-full overflow-hidden rounded-md border border-white/10 bg-[rgba(15,16,22,0.42)]">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={[
              'flex-1 border-r px-3 py-2 text-sm transition duration-150 last:border-r-0 active:scale-[0.95]',
              active
                ? 'border-ca-teal/25 bg-[rgba(255,255,255,0.03)] text-ca-text shadow-[inset_0_0_0_1px_rgba(5,216,189,0.22)]'
                : 'border-white/8 text-ca-text-2 hover:bg-[rgba(255,255,255,0.02)]',
            ].join(' ')}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
