import { useState } from 'react'
import type { ClanRecruitmentStatus, ClanVisibility, CreateClanInput } from '@/features/clans/types'

type CreateClanFormProps = {
  leaderId: string
  leaderDisplayName: string
  onSubmit: (input: CreateClanInput) => Promise<string | null>
}

export function CreateClanForm({ leaderId, leaderDisplayName, onSubmit }: CreateClanFormProps) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<ClanVisibility>('public')
  const [recruitmentStatus, setRecruitmentStatus] = useState<ClanRecruitmentStatus>('open')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedTag = tag.trim().toUpperCase()
    if (normalizedName.length < 3 || normalizedName.length > 32) return setError('Clan Name must be 3-32 characters.')
    if (!/^[A-Z0-9]{2,5}$/.test(normalizedTag)) return setError('Clan Tag must be 2-5 uppercase letters or numbers.')
    if (description.length > 280) return setError('Description must be 280 characters or fewer.')

    setBusy(true)
    setError(await onSubmit({ name: normalizedName, tag: normalizedTag, description, visibility, recruitmentStatus, leaderId, leaderDisplayName }))
    setBusy(false)
  }

  return (
    <form onSubmit={(event) => { void submit(event) }} className="ca-card space-y-4 p-5">
      {error ? <p className="rounded-md border border-ca-red/25 bg-ca-red-wash px-3 py-2 text-sm text-ca-red">{error}</p> : null}
      <Field label="Clan Name"><Input value={name} onChange={setName} maxLength={32} /></Field>
      <Field label="Clan Tag"><Input value={tag.toUpperCase()} onChange={(value) => setTag(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} maxLength={5} /></Field>
      <Field label="Description">
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={280} className="min-h-28 w-full rounded-md border border-white/10 bg-[rgba(15,16,22,0.62)] px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Visibility">
          <Select value={visibility} onChange={(value) => setVisibility(value as ClanVisibility)} options={['public', 'private']} />
        </Field>
        <Field label="Recruitment Status">
          <Select value={recruitmentStatus} onChange={(value) => setRecruitmentStatus(value as ClanRecruitmentStatus)} options={['open', 'invite-only', 'closed']} />
        </Field>
      </div>
      <button disabled={busy} className="ca-display rounded-lg border border-ca-red/35 bg-ca-red px-5 py-3 text-2xl text-white transition disabled:opacity-50">Create Clan</button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm text-ca-text-2">{label}</span>{children}</label>
}

function Input({ value, onChange, maxLength }: { value: string; onChange: (value: string) => void; maxLength?: number }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} className="w-full rounded-md border border-white/10 bg-[rgba(15,16,22,0.62)] px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35" />
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-white/10 bg-[rgba(15,16,22,0.92)] px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35">{options.map((option) => <option key={option}>{option}</option>)}</select>
}
