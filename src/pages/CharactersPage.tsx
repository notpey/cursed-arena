import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import {
  AbilityChip,
  IllustratedSiteCard,
  ReadoutTile,
  SiteSectionHeader,
  StylizedPortraitPlaceholder,
  battlePrepRoster,
} from '@/components/site/siteVisuals'
import type { CharacterRarity } from '@/types/characters'

type RarityFilter = 'ALL' | CharacterRarity

const rarityOptions: RarityFilter[] = ['ALL', 'SSR', 'SR', 'R']

export function CharactersPage() {
  const [rarity, setRarity] = useState<RarityFilter>('ALL')
  const [query, setQuery] = useState('')

  const visibleRoster = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return battlePrepRoster.filter((entry) => {
      if (rarity !== 'ALL' && entry.rarity !== rarity) return false
      if (!normalized) return true
      return `${entry.name} ${entry.role} ${entry.gradeLabel} ${entry.passiveLabel}`.toLowerCase().includes(normalized)
    })
  }, [query, rarity])

  return (
    <div className="space-y-3">
      <PageIntro />

      <IllustratedSiteCard>
        <div className="p-3">
          <SiteSectionHeader
            eyebrow="Roster Preview"
            title={`${visibleRoster.length} Fighters`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search roster"
                  className="w-40 rounded-[6px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none placeholder:text-ca-text-3 focus:border-ca-teal/35"
                />
                <div className="flex overflow-hidden rounded-[6px] border border-white/10 bg-black/20">
                  {rarityOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRarity(option)}
                      className={[
                        'ca-mono-label border-r border-white/8 px-2.5 py-2 text-[0.42rem] last:border-r-0',
                        rarity === option ? 'bg-ca-teal-wash text-ca-teal' : 'text-ca-text-3 hover:text-ca-text-2',
                      ].join(' ')}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            }
          />

          {visibleRoster.length > 0 ? (
            <div className="grid gap-2">
              {visibleRoster.map((entry) => (
                <CharacterArchiveRow key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="grid place-items-center rounded-[7px] border border-white/8 bg-white/[0.025] p-8">
              <StylizedPortraitPlaceholder label="NA" tone="frost" className="mb-3 h-16 w-16" />
              <p className="text-sm text-ca-text-3">No fighters match that filter.</p>
            </div>
          )}
        </div>
      </IllustratedSiteCard>
    </div>
  )
}

function PageIntro() {
  return (
    <section className="rounded-[7px] border border-white/10 bg-[rgba(30,28,36,0.58)] px-4 py-3">
      <p className="ca-mono-label text-[0.46rem] text-ca-teal">CHARACTERS / SKILLS</p>
      <h1 className="ca-display mt-1 text-[2.25rem] leading-none tracking-[0.06em] text-ca-text">Character Archive</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ca-text-2">
        Browse compact fighter files with square portraits, role summaries, grade, unlock status, and technique previews. Full individual character pages can build from this structure later.
      </p>
    </section>
  )
}

function CharacterArchiveRow({ entry }: { entry: (typeof battlePrepRoster)[number] }) {
  const abilities = entry.battleTemplate.abilities.slice(0, 2)

  return (
    <article className="grid gap-3 rounded-[7px] border border-white/8 bg-white/[0.025] p-3 transition duration-150 hover:-translate-y-0.5 hover:border-white/16 md:grid-cols-[5rem_minmax(0,1fr)]">
      <CharacterFacePortrait
        characterId={entry.id}
        name={entry.name}
        src={entry.facePortrait}
        rarity={entry.rarity}
        locked={entry.rarity === 'SSR'}
        size="lg"
        className="h-20 w-20 max-w-full md:w-auto"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-dotted border-white/12 pb-2">
          <div className="min-w-0">
            <p className="ca-display truncate text-[1.35rem] leading-none text-ca-text">{entry.name}</p>
            <p className="mt-1 text-xs leading-5 text-ca-text-3">{entry.role}</p>
          </div>
          <Link to="/characters" className="ca-mono-label text-[0.42rem] text-ca-teal">
            MORE ABOUT {entry.battleTemplate.shortName}
          </Link>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ca-text-2">{entry.battleTemplate.bio}</p>
        <div className="mt-3 grid gap-2 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="grid grid-cols-3 gap-2">
            <ReadoutTile label="HP" value={entry.battleTemplate.maxHp} />
            <ReadoutTile label="Grade" value={entry.gradeLabel.replace('SPECIAL ', 'S. ')} />
            <ReadoutTile label="Unlock" value={entry.rarity === 'SSR' ? 'Mission' : 'Open'} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {abilities.map((ability) => (
              <AbilityChip key={ability.id} ability={ability} />
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}
