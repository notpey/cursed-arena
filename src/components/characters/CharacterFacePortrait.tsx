import { getCharacterFacePortrait } from '@/data/characterFacePortraits'

type CharacterFacePortraitProps = {
  characterId?: string
  name: string
  src?: string
  rarity?: string
  locked?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClass: Record<NonNullable<CharacterFacePortraitProps['size']>, string> = {
  xs: 'h-8 w-8',
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
}

const rarityTone: Record<string, { border: string; text: string; wash: string }> = {
  SSR: { border: 'border-ca-red/40', text: 'text-ca-red', wash: 'from-ca-red/18' },
  SR: { border: 'border-blue-400/35', text: 'text-blue-300', wash: 'from-blue-500/16' },
  R: { border: 'border-white/16', text: 'text-ca-text-2', wash: 'from-white/10' },
  UR: { border: 'border-ca-gold/40', text: 'text-ca-gold', wash: 'from-ca-gold/18' },
}

export function CharacterFacePortrait({
  characterId,
  name,
  src,
  rarity = 'R',
  locked = false,
  size = 'md',
  className = '',
}: CharacterFacePortraitProps) {
  const registeredSrc = characterId ? getCharacterFacePortrait(characterId) : undefined
  const faceSrc = src ?? registeredSrc
  const tone = rarityTone[rarity] ?? rarityTone.R
  const initials = getInitials(name)

  return (
    <div
      className={[
        'relative shrink-0 overflow-hidden rounded-[6px] border bg-[linear-gradient(180deg,rgba(31,29,40,0.96),rgba(10,10,16,0.98))]',
        sizeClass[size],
        tone.border,
        className,
      ].join(' ')}
      title={name}
    >
      {faceSrc ? (
        <img src={faceSrc} alt={name} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <>
          <div className={`absolute inset-0 bg-gradient-to-br ${tone.wash} via-transparent to-ca-teal/10`} />
          <div className="absolute inset-x-2 top-2 h-px bg-current opacity-20" />
          <div className="absolute inset-x-3 bottom-2 h-px bg-current opacity-15" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(228,230,239,0.24)_1px,transparent_1px),linear-gradient(90deg,rgba(228,230,239,0.18)_1px,transparent_1px)] [background-size:10px_10px]" />
          <span className={`ca-display absolute inset-0 grid place-items-center leading-none tracking-[0.06em] ${tone.text} ${size === 'xs' || size === 'sm' ? 'text-[1rem]' : size === 'lg' ? 'text-[1.9rem]' : 'text-[1.45rem]'}`}>
            {initials}
          </span>
        </>
      )}
      {locked ? (
        <div className="absolute inset-0 grid place-items-center bg-black/46">
          <span className="ca-mono-label rounded-[4px] border border-ca-gold/35 bg-ca-gold/12 px-1.5 py-1 text-[0.34rem] text-ca-gold">
            LOCK
          </span>
        </div>
      ) : null}
    </div>
  )
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'CA'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}
