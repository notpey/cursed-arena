import { SquareAvatar } from '@/components/ui/SquareAvatar'

export type PlayerIdentityBadgeProps = {
  avatarUrl?: string | null
  displayName: string
  clanTag?: string | null
  level?: number | null
  rankTitle?: string | null
  ladderRank?: number | null
  side?: 'player' | 'opponent'
  compact?: boolean
}

export function PlayerIdentityBadge({
  avatarUrl,
  displayName,
  clanTag,
  level,
  rankTitle,
  ladderRank,
  side = 'player',
  compact = false,
}: PlayerIdentityBadgeProps) {
  const mirrored = side === 'opponent'
  const toneClass = side === 'player' ? 'border-ca-teal/20 bg-ca-teal-wash text-ca-teal' : 'border-ca-red/20 bg-ca-red-wash text-ca-red'
  const avatarSize = compact ? 64 : 72
  const hasRankMeta = level || rankTitle

  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${mirrored ? 'flex-row-reverse text-right' : ''}`}>
      <SquareAvatar
        src={avatarUrl}
        alt={`${displayName} avatar`}
        fallbackLabel={displayName}
        size={avatarSize}
        className="shadow-[0_8px_18px_rgba(0,0,0,0.28)]"
      />
      <div className="min-w-0">
        <div className={`inline-flex max-w-full items-center gap-1.5 rounded-[0.18rem] border px-2 py-1 ${toneClass}`}>
          <p className="ca-display truncate text-[1rem] leading-none">{displayName}</p>
          {clanTag ? <span className="ca-mono-label shrink-0 text-[0.48rem]">[{clanTag}]</span> : null}
        </div>
        {hasRankMeta ? (
          <p className="mt-1 hidden truncate text-[0.72rem] text-ca-text-2 sm:block">
            {level ? `Level ${level}` : null}
            {level && rankTitle ? ' / ' : null}
            {rankTitle ?? null}
          </p>
        ) : null}
        {ladderRank ? (
          <p className="mt-0.5 hidden ca-mono-label text-[0.48rem] text-ca-text-3 md:block">Rank #{ladderRank}</p>
        ) : null}
      </div>
    </div>
  )
}
