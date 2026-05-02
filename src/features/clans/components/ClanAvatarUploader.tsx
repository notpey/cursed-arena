import { useRef, useState } from 'react'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { removeClanAvatar, updateClanAvatarUrl, uploadClanAvatar } from '@/features/clans/client'
import type { ClanDetail } from '@/features/clans/types'

export function ClanAvatarUploader({ clan, canEdit, onChange }: { clan: ClanDetail; canEdit: boolean; onChange: (avatarUrl: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function upload(file: File | undefined) {
    if (!file || !canEdit) return
    setBusy(true)
    const result = await uploadClanAvatar(clan.clanId, file)
    if (result.error || !result.data) {
      setMessage(result.error ?? 'Avatar upload failed.')
      setBusy(false)
      return
    }
    const update = await updateClanAvatarUrl(clan.clanId, result.data.url)
    setBusy(false)
    if (update.error) return setMessage(update.error)
    onChange(result.data.url)
    setMessage('Clan Emblem updated.')
  }

  async function remove() {
    setBusy(true)
    const result = await removeClanAvatar(clan.clanId)
    setBusy(false)
    if (result.error) return setMessage(result.error)
    onChange(null)
    setMessage('Clan Emblem removed.')
  }

  return (
    <div className="rounded-[10px] border border-white/8 bg-black/15 p-3">
      <div className="flex flex-wrap items-center gap-4">
        <SquareAvatar src={clan.avatarUrl} alt={`${clan.name} emblem`} fallbackLabel={clan.tag} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ca-text-2">Clan avatars appear on clan profiles, ladder pages, and clan panels. Avatars are displayed as 100px squares with a 1px black border.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }} />
            <button type="button" disabled={!canEdit || busy} onClick={() => inputRef.current?.click()} className="ca-display rounded-lg border border-ca-teal/25 bg-ca-teal-wash px-4 py-3 text-xl text-ca-teal disabled:opacity-45">Upload Avatar</button>
            <button type="button" disabled={!canEdit || busy} onClick={() => { void remove() }} className="ca-mono-label rounded-lg border border-ca-red/25 px-4 py-3 text-[0.5rem] text-ca-red disabled:opacity-45">Remove Avatar</button>
          </div>
          {message ? <p className={`mt-2 text-sm ${message.includes('updated') || message.includes('removed') ? 'text-ca-teal' : 'text-ca-red'}`}>{message}</p> : null}
        </div>
      </div>
    </div>
  )
}
