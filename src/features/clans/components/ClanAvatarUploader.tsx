import { useState } from 'react'
import { SquareAvatar } from '@/components/ui/SquareAvatar'
import { removeClanAvatar, updateClanAvatarUrl } from '@/features/clans/client'
import { validateImageUrl } from '@/features/images/imageUrl'
import type { ClanDetail } from '@/features/clans/types'

export function ClanAvatarUploader({
  clan,
  canEdit,
  onChange,
}: {
  clan: ClanDetail
  canEdit: boolean
  onChange: (avatarUrl: string | null) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!canEdit) return
    const validation = validateImageUrl(inputValue, { allowEmpty: false })
    if (!validation.ok) {
      setMessage(validation.error)
      return
    }
    setBusy(true)
    const result = await updateClanAvatarUrl(clan.clanId, validation.url)
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    onChange(validation.url)
    setInputValue('')
    setMessage('Clan Emblem updated.')
  }

  async function remove() {
    if (!canEdit) return
    setBusy(true)
    const result = await removeClanAvatar(clan.clanId)
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    onChange(null)
    setMessage('Clan Emblem removed.')
  }

  const isSuccess = message === 'Clan Emblem updated.' || message === 'Clan Emblem removed.'

  return (
    <div className="rounded-[10px] border border-white/8 bg-black/15 p-3">
      <div className="flex flex-wrap items-center gap-4">
        <SquareAvatar src={clan.avatarUrl} alt={`${clan.name} emblem`} fallbackLabel={clan.tag} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ca-text-2">
            Clan avatars appear on clan profiles, ladder pages, and clan panels as 100px squares with a 1px black border.
          </p>
          <p className="mt-1 text-xs text-ca-text-3">
            Upload your clan emblem to <span className="text-ca-text-2">Imgur</span> or another image host, then paste the direct image URL below.
            For Imgur, use an <span className="text-ca-text-2">i.imgur.com</span> link ending in .png, .jpg, .gif, or .webp.
          </p>
          {canEdit && (
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
          )}
          {message ? (
            <p className={`mt-2 text-sm ${isSuccess ? 'text-ca-teal' : 'text-ca-red'}`}>{message}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
