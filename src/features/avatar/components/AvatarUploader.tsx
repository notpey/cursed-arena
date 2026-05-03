import { useState } from 'react'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { removePlayerAvatar, updatePlayerAvatarUrl } from '@/features/avatar/client'
import { validateImageUrl } from '@/features/images/imageUrl'

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
  const [inputValue, setInputValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    const validation = validateImageUrl(inputValue, { allowEmpty: false })
    if (!validation.ok) {
      setMessage(validation.error)
      return
    }
    setBusy(true)
    const result = await updatePlayerAvatarUrl(userId, validation.url)
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    onChange(validation.url)
    setInputValue('')
    setMessage('Avatar updated.')
  }

  async function remove() {
    setBusy(true)
    const result = await removePlayerAvatar(userId)
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    onChange(null)
    setMessage('Avatar removed.')
  }

  const isSuccess = message === 'Avatar updated.' || message === 'Avatar removed.'

  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-3 py-3">
      <div className="flex flex-wrap items-center gap-4">
        <SquareAvatar src={avatarUrl} alt={displayName} fallbackLabel={fallbackLabel ?? displayName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ca-text-2">
            Custom avatars display outside battle as 100px squares. Upload your image to{' '}
            <span className="text-ca-text">Imgur</span> or another host, then paste the direct image URL below.
          </p>
          <p className="mt-1 text-xs text-ca-text-3">
            For Imgur, use an <span className="text-ca-text-2">i.imgur.com</span> link ending in .png, .jpg, .gif, or .webp.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="url"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setMessage(null) }}
              placeholder="https://i.imgur.com/example.png"
              disabled={busy}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition placeholder:text-ca-text-3 focus:border-ca-teal/35 disabled:opacity-45"
            />
            <button
              type="button"
              disabled={busy || !inputValue.trim()}
              onClick={() => { void save() }}
              className="ca-display rounded-lg border border-ca-teal/25 bg-ca-teal-wash px-4 py-2 text-xl text-ca-teal disabled:opacity-45"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { void remove() }}
              className="ca-mono-label rounded-lg border border-ca-red/25 px-4 py-2 text-[0.5rem] text-ca-red disabled:opacity-45"
            >
              Remove
            </button>
          </div>
          {message ? (
            <p className={`mt-2 text-sm ${isSuccess ? 'text-ca-teal' : 'text-ca-red'}`}>{message}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
