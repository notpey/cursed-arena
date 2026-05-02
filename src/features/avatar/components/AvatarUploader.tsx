import { useRef, useState } from 'react'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { removePlayerAvatar, updatePlayerAvatarUrl, uploadPlayerAvatar } from '@/features/avatar/client'

export function AvatarUploader({
  userId,
  displayName,
  avatarUrl,
  fallbackLabel,
  onChange,
}: {
  userId: string
  displayName: string
  avatarUrl?: string | null
  fallbackLabel?: string
  onChange: (avatarUrl: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    const result = await uploadPlayerAvatar(userId, file)
    if (result.error || !result.data) {
      setBusy(false)
      setMessage(result.error ?? 'Avatar upload failed.')
      return
    }
    const update = await updatePlayerAvatarUrl(userId, result.data.url)
    setBusy(false)
    if (update.error) return setMessage(update.error)
    onChange(result.data.url)
    setMessage('Avatar updated.')
  }

  async function remove() {
    setBusy(true)
    const result = await removePlayerAvatar(userId)
    setBusy(false)
    if (result.error) return setMessage(result.error)
    onChange(null)
    setMessage('Avatar removed.')
  }

  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-3 py-3">
      <div className="flex flex-wrap items-center gap-4">
        <SquareAvatar src={avatarUrl} alt={displayName} fallbackLabel={fallbackLabel ?? displayName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ca-text-2">Custom avatars are identity assets only and display outside battle as 100px squares.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }} />
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="ca-display rounded-lg border border-ca-teal/25 bg-ca-teal-wash px-4 py-3 text-xl text-ca-teal disabled:opacity-45">Upload Avatar</button>
            <button type="button" disabled={busy} onClick={() => { void remove() }} className="ca-mono-label rounded-lg border border-ca-red/25 px-4 py-3 text-[0.5rem] text-ca-red disabled:opacity-45">Remove Avatar</button>
          </div>
          {message ? <p className={`mt-2 text-sm ${message.includes('updated') || message.includes('removed') ? 'text-ca-teal' : 'text-ca-red'}`}>{message}</p> : null}
        </div>
      </div>
    </div>
  )
}
