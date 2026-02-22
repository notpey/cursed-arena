import { useEffect, useState } from 'react'

type QualityPreset = 'LOW' | 'MEDIUM' | 'HIGH'
type AnimationSpeed = '1x' | '1.5x' | '2x'
type AutoBattleSpeed = 'NORMAL (1x)' | 'FAST (1.5x)' | 'MAX (2x)'

type SettingsState = {
  displayName: string
  playerId: string
  avatarLabel: string
  accountLinks: {
    google: boolean
    apple: boolean
    email: boolean
  }
  audio: {
    master: number
    music: number
    sfx: number
    voice: number
  }
  graphics: {
    qualityPreset: QualityPreset
    animationSpeed: AnimationSpeed
    skipUltimates: boolean
    reduceParticles: boolean
  }
  notifications: {
    push: boolean
    energyRefill: boolean
    bannerReminder: boolean
  }
  gameplay: {
    autoBattleDefaultSpeed: AutoBattleSpeed
    confirmBeforeSpendingGems: boolean
    showDamageNumbers: boolean
  }
}

const defaultSettings: SettingsState = {
  displayName: 'PLAYER_NAME',
  playerId: '#7742',
  avatarLabel: 'PN',
  accountLinks: {
    google: true,
    apple: false,
    email: true,
  },
  audio: {
    master: 82,
    music: 64,
    sfx: 76,
    voice: 71,
  },
  graphics: {
    qualityPreset: 'HIGH',
    animationSpeed: '1x',
    skipUltimates: false,
    reduceParticles: false,
  },
  notifications: {
    push: true,
    energyRefill: true,
    bannerReminder: true,
  },
  gameplay: {
    autoBattleDefaultSpeed: 'FAST (1.5x)',
    confirmBeforeSpendingGems: true,
    showDamageNumbers: true,
  },
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings)
  const [copiedId, setCopiedId] = useState(false)
  const [saveFlash, setSaveFlash] = useState<'idle' | 'saved'>('idle')

  useEffect(() => {
    if (!copiedId) return
    const timer = window.setTimeout(() => setCopiedId(false), 1400)
    return () => window.clearTimeout(timer)
  }, [copiedId])

  useEffect(() => {
    if (saveFlash !== 'saved') return
    const timer = window.setTimeout(() => setSaveFlash('idle'), 1500)
    return () => window.clearTimeout(timer)
  }, [saveFlash])

  async function copyPlayerId() {
    try {
      await navigator.clipboard.writeText(settings.playerId)
      setCopiedId(true)
    } catch {
      setCopiedId(false)
    }
  }

  function saveChanges() {
    setSaveFlash('saved')
  }

  return (
    <section className="py-4 sm:py-6">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-4 rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Settings</p>
          <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">System</h1>
          <p className="mt-2 text-sm text-ca-text-3">Configure account, audio, graphics, and gameplay behavior.</p>
        </div>

        <div className="space-y-4">
          <SettingsSection title="Account">
            <Field label="Display Name">
              <TextInput
                value={settings.displayName}
                onChange={(value) => setSettings((s) => ({ ...s, displayName: value }))}
                placeholder="Display name"
              />
            </Field>

            <Field label="Player ID">
              <div className="flex gap-2">
                <TextInput value={settings.playerId} readOnly />
                <button
                  type="button"
                  onClick={copyPlayerId}
                  className="ca-mono-label shrink-0 rounded-md border border-white/10 px-3 py-2 text-[0.5rem] text-ca-text-2 hover:border-ca-teal/30 hover:text-ca-teal"
                >
                  {copiedId ? 'COPIED' : 'COPY'}
                </button>
              </div>
            </Field>

            <Field label="Profile Avatar">
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full border border-ca-red/30 bg-gradient-to-br from-ca-red-wash-mid to-transparent">
                    <span className="ca-display text-lg text-ca-text">{settings.avatarLabel}</span>
                  </div>
                  <span className="text-sm text-ca-text-2">Current avatar</span>
                </div>
                <button
                  type="button"
                  className="ca-mono-label rounded-md border border-white/10 px-3 py-2 text-[0.5rem] text-ca-text-2 hover:border-ca-teal/30 hover:text-ca-teal"
                >
                  CHANGE
                </button>
              </div>
            </Field>

            <Field label="Link Accounts">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <LinkAccountButton
                  provider="Google"
                  linked={settings.accountLinks.google}
                  onToggle={() =>
                    setSettings((s) => ({
                      ...s,
                      accountLinks: { ...s.accountLinks, google: !s.accountLinks.google },
                    }))
                  }
                />
                <LinkAccountButton
                  provider="Apple"
                  linked={settings.accountLinks.apple}
                  onToggle={() =>
                    setSettings((s) => ({
                      ...s,
                      accountLinks: { ...s.accountLinks, apple: !s.accountLinks.apple },
                    }))
                  }
                />
                <LinkAccountButton
                  provider="Email"
                  linked={settings.accountLinks.email}
                  onToggle={() =>
                    setSettings((s) => ({
                      ...s,
                      accountLinks: { ...s.accountLinks, email: !s.accountLinks.email },
                    }))
                  }
                />
              </div>
            </Field>
          </SettingsSection>

          <SettingsSection title="Audio">
            <SliderRow
              label="Master Volume"
              value={settings.audio.master}
              onChange={(value) => setSettings((s) => ({ ...s, audio: { ...s.audio, master: value } }))}
            />
            <SliderRow
              label="Music Volume"
              value={settings.audio.music}
              onChange={(value) => setSettings((s) => ({ ...s, audio: { ...s.audio, music: value } }))}
            />
            <SliderRow
              label="SFX Volume"
              value={settings.audio.sfx}
              onChange={(value) => setSettings((s) => ({ ...s, audio: { ...s.audio, sfx: value } }))}
            />
            <SliderRow
              label="Voice Volume"
              value={settings.audio.voice}
              onChange={(value) => setSettings((s) => ({ ...s, audio: { ...s.audio, voice: value } }))}
            />
          </SettingsSection>

          <SettingsSection title="Graphics">
            <Field label="Quality Preset">
              <SegmentedControl<QualityPreset>
                options={['LOW', 'MEDIUM', 'HIGH']}
                value={settings.graphics.qualityPreset}
                onChange={(value) =>
                  setSettings((s) => ({ ...s, graphics: { ...s.graphics, qualityPreset: value } }))
                }
              />
            </Field>

            <Field label="Animation Speed">
              <SegmentedControl<AnimationSpeed>
                options={['1x', '1.5x', '2x']}
                value={settings.graphics.animationSpeed}
                onChange={(value) =>
                  setSettings((s) => ({ ...s, graphics: { ...s.graphics, animationSpeed: value } }))
                }
              />
            </Field>

            <ToggleRow
              label="Skip Ultimate animations"
              checked={settings.graphics.skipUltimates}
              onChange={(checked) =>
                setSettings((s) => ({ ...s, graphics: { ...s.graphics, skipUltimates: checked } }))
              }
            />
            <ToggleRow
              label="Reduce particle effects"
              checked={settings.graphics.reduceParticles}
              onChange={(checked) =>
                setSettings((s) => ({ ...s, graphics: { ...s.graphics, reduceParticles: checked } }))
              }
            />
          </SettingsSection>

          <SettingsSection title="Notifications">
            <ToggleRow
              label="Push notifications"
              checked={settings.notifications.push}
              onChange={(checked) =>
                setSettings((s) => ({ ...s, notifications: { ...s.notifications, push: checked } }))
              }
            />
            <ToggleRow
              label="Energy refill alert"
              checked={settings.notifications.energyRefill}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  notifications: { ...s.notifications, energyRefill: checked },
                }))
              }
            />
            <ToggleRow
              label="Banner ending reminder"
              checked={settings.notifications.bannerReminder}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  notifications: { ...s.notifications, bannerReminder: checked },
                }))
              }
            />
          </SettingsSection>

          <SettingsSection title="Gameplay">
            <Field label="Auto-battle default speed">
              <select
                value={settings.gameplay.autoBattleDefaultSpeed}
                onChange={(event) =>
                  setSettings((s) => ({
                    ...s,
                    gameplay: {
                      ...s.gameplay,
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
              checked={settings.gameplay.confirmBeforeSpendingGems}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  gameplay: { ...s.gameplay, confirmBeforeSpendingGems: checked },
                }))
              }
            />
            <ToggleRow
              label="Show damage numbers"
              checked={settings.gameplay.showDamageNumbers}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  gameplay: { ...s.gameplay, showDamageNumbers: checked },
                }))
              }
            />
          </SettingsSection>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={saveChanges}
            className="ca-display rounded-lg border border-ca-teal/35 bg-ca-teal-wash px-4 py-3 text-2xl text-ca-teal shadow-[0_0_18px_rgba(5,216,189,0.08)]"
          >
            {saveFlash === 'saved' ? 'Saved' : 'Save Changes'}
          </button>

          <button
            type="button"
            className="ca-mono-label rounded-lg border border-ca-red/25 bg-transparent px-4 py-3 text-[0.55rem] text-ca-red hover:bg-ca-red-wash"
          >
            LOG OUT
          </button>
        </div>
      </div>
    </section>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
      <h2 className="ca-display border-b border-white/6 pb-3 text-2xl text-ca-text">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
}: {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      placeholder={placeholder}
      readOnly={readOnly}
      className="w-full rounded-md border border-white/10 bg-[rgba(15,16,22,0.62)] px-3 py-2 text-sm text-ca-text outline-none transition placeholder:text-ca-text-disabled focus:border-ca-teal/35"
    />
  )
}

function LinkAccountButton({
  provider,
  linked,
  onToggle,
}: {
  provider: 'Google' | 'Apple' | 'Email'
  linked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'flex items-center justify-between rounded-md border px-3 py-2 text-left transition',
        linked
          ? 'border-ca-teal/25 bg-ca-teal-wash text-ca-text'
          : 'border-white/10 bg-[rgba(255,255,255,0.02)] text-ca-text-2 hover:border-white/16',
      ].join(' ')}
    >
      <span className="text-sm">{provider}</span>
      <span className={`ca-mono-label text-[0.45rem] ${linked ? 'text-ca-teal' : 'text-ca-text-3'}`}>
        {linked ? 'LINKED' : 'LINK'}
      </span>
    </button>
  )
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
        style={{ ['--slider-fill' as any]: `${value}%` }}
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
          'relative h-6 w-10 rounded-full border transition',
          checked
            ? 'border-ca-teal/35 bg-ca-teal-wash'
            : 'border-white/10 bg-ca-highlight/65',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition',
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
              'flex-1 border-r px-3 py-2 text-sm transition last:border-r-0',
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
