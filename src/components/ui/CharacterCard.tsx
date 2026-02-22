import { ProgressBar } from '@/components/ui/ProgressBar'
import type { CharacterRarity, CharacterRosterCard } from '@/types/characters'

export type { CharacterRarity, CharacterRosterCard }

type CharacterCardProps = {
  character: CharacterRosterCard
}

const rarityStyles: Record<
  CharacterRarity,
  { border: string; glow: string; wash: string; label: string; portraitGradient: string }
> = {
  R: {
    border: 'var(--rarity-common)',
    glow: 'rgba(107,107,128,0.24)',
    wash: 'rgba(107,107,128,0.12)',
    label: 'Grade 2',
    portraitGradient:
      'radial-gradient(circle at 22% 18%, rgba(107,107,128,0.24), transparent 58%), linear-gradient(180deg, rgba(69,67,83,0.25), rgba(30,28,36,0.96))',
  },
  SR: {
    border: 'var(--rarity-rare)',
    glow: 'rgba(59,130,246,0.24)',
    wash: 'rgba(59,130,246,0.12)',
    label: 'Grade 1',
    portraitGradient:
      'radial-gradient(circle at 22% 18%, rgba(59,130,246,0.24), transparent 58%), linear-gradient(180deg, rgba(38,55,94,0.28), rgba(30,28,36,0.96))',
  },
  SSR: {
    border: 'var(--red-primary)',
    glow: 'rgba(250,39,66,0.28)',
    wash: 'rgba(250,39,66,0.14)',
    label: 'Special Grade',
    portraitGradient:
      'radial-gradient(circle at 22% 18%, rgba(250,39,66,0.25), transparent 58%), linear-gradient(180deg, rgba(72,24,36,0.34), rgba(30,28,36,0.96))',
  },
}

export function CharacterCard({ character }: CharacterCardProps) {
  const rarity = rarityStyles[character.rarity]
  const initial = character.name.trim().charAt(0).toUpperCase()
  const portraitFrame = character.portraitFrame ?? {}
  const portraitScale = portraitFrame.scale ?? 1.56
  const portraitX = portraitFrame.x ?? '0%'
  const portraitY = portraitFrame.y ?? '10%'
  const portraitOpacity = portraitFrame.opacity ?? 1

  return (
    <article
      className="group relative overflow-hidden rounded-[10px] border bg-[rgba(30,28,36,0.62)] backdrop-blur-sm transition duration-200 hover:-translate-y-1"
      style={{
        borderColor: 'rgba(228,230,239,0.08)',
        boxShadow: '0 10px 20px rgba(0,0,0,0.14)',
        opacity: character.owned ? 1 : 0.42,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition duration-200 group-hover:opacity-100"
        style={{
          boxShadow: `inset 0 0 0 1px ${rarity.border}, 0 0 22px ${rarity.glow}`,
        }}
      />

      <div className="relative aspect-square overflow-hidden border-b border-white/5">
        <div className="absolute inset-0" style={{ background: rarity.portraitGradient }} />

        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(70% 55% at 72% 20%, rgba(228,230,239,0.08), transparent 66%), radial-gradient(55% 60% at 30% 72%, rgba(5,216,189,0.05), transparent 70%)',
          }}
        />

        {character.renderSrc ? (
          <img
            src={character.renderSrc}
            alt={character.owned ? character.name : ''}
            className={[
              'absolute inset-0 h-full w-full object-contain object-top select-none',
              character.owned ? '' : 'grayscale brightness-50 contrast-90',
            ].join(' ')}
            style={{
              opacity: portraitOpacity,
              transform: `translate(${portraitX}, ${portraitY}) scale(${portraitScale})`,
              transformOrigin: '50% 18%',
            }}
            draggable={false}
          />
        ) : null}

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="ca-display text-[2.4rem] text-white/[0.14]">{initial}</span>
        </div>

        {!character.owned ? (
          <div className="absolute inset-x-3 top-3 flex items-center justify-between">
            <span className="ca-mono-label rounded-md border border-white/10 bg-black/35 px-2 py-1 text-[0.42rem] text-ca-text-3">
              Locked
            </span>
            <span className="ca-mono-label rounded-md border border-white/10 bg-black/35 px-2 py-1 text-[0.42rem] text-ca-text-3">
              {rarity.label}
            </span>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: rarity.border }} />
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="ca-display leading-none text-[0.95rem] text-ca-text">{character.name}</h3>
          <span
            className="ca-mono-label shrink-0 rounded-md border px-1.5 py-1 text-[0.38rem]"
            style={{
              borderColor: rarity.wash,
              background: rarity.wash,
              color: rarity.border,
            }}
          >
            {character.rarity}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {character.archetypes.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="ca-mono-label rounded-[6px] border border-ca-teal/18 bg-ca-teal-wash px-1.5 py-1 text-[0.4rem] text-ca-teal"
            >
              {tag}
            </span>
          ))}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="ca-mono-label text-[0.45rem] text-ca-text-disabled">
              LV {character.level}
            </span>
            <span className="ca-mono-label text-[0.42rem] text-ca-text-3">
              {Math.round(character.levelProgress)}%
            </span>
          </div>
          <ProgressBar
            value={character.levelProgress}
            tone={character.owned ? 'teal' : 'gold'}
            className="h-1 bg-ca-highlight/50"
          />
        </div>

        <div className="flex items-center gap-1">
          {Array.from({ length: 6 }, (_, index) => {
            const filled = index < character.limitBreak
            return (
              <span
                key={`${character.id}-star-${index}`}
                className="inline-block h-1.5 w-1.5 rounded-full border"
                style={{
                  background: filled ? 'var(--warning)' : 'rgba(228,230,239,0.05)',
                  borderColor: filled ? 'rgba(245,166,35,0.4)' : 'rgba(228,230,239,0.12)',
                  boxShadow: filled ? '0 0 8px rgba(245,166,35,0.22)' : 'none',
                }}
              />
            )
          })}
        </div>
      </div>
    </article>
  )
}
