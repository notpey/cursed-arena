import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AbilityChip,
  FeaturedFighterCard,
  FighterPortrait,
  IllustratedSiteCard,
  ReadoutTile,
  SiteSectionHeader,
  StylizedPortraitPlaceholder,
  battlePrepRoster,
  homeBgBase,
  siteArtBackgroundStyle,
} from '@/components/site/siteVisuals'
import type { CharacterRarity } from '@/types/characters'

type RarityFilter = 'ALL' | CharacterRarity

const rarityOptions: RarityFilter[] = ['ALL', 'SSR', 'SR', 'R']

export function CharactersPage() {
  const [rarity, setRarity] = useState<RarityFilter>('ALL')
  const [query, setQuery] = useState('')
  const selected = battlePrepRoster[0]

  const visibleRoster = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return battlePrepRoster.filter((entry) => {
      if (rarity !== 'ALL' && entry.rarity !== rarity) return false
      if (!normalized) return true
      return `${entry.name} ${entry.role} ${entry.gradeLabel} ${entry.passiveLabel}`.toLowerCase().includes(normalized)
    })
  }, [query, rarity])

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[10px] border border-white/10 bg-[rgba(14,15,20,0.28)] p-5">
        <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-28" style={siteArtBackgroundStyle(homeBgBase)} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(13,12,17,0.94),rgba(13,12,17,0.68)),radial-gradient(circle_at_88%_18%,rgba(250,39,66,0.14),transparent_46%)]" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
          <div>
            <p className="ca-mono-label text-[0.5rem] text-ca-teal">CHARACTER & SKILL ARCHIVE</p>
            <h1 className="ca-display mt-2 text-[3.1rem] leading-[0.9] text-ca-text sm:text-[4.5rem]">Characters</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-ca-text-2">
              Browse fighter roles, grades, passives, and technique previews. This index is structured for future full character pages while keeping the Naruto-Arena-style kit readability.
            </p>
          </div>
          <Link
            to="/battle/prep"
            className="ca-display rounded-[8px] border border-ca-red/45 bg-ca-red px-4 py-3 text-center text-[1.55rem] leading-none text-white"
          >
            Build Team
          </Link>
        </div>
      </section>

      {selected ? (
        <IllustratedSiteCard>
          <div className="grid gap-4 p-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
            <FighterPortrait entry={selected} className="aspect-[3/4]" />
            <div className="min-w-0">
              <SiteSectionHeader eyebrow="Featured Technique File" title={selected.name} />
              <p className="text-sm leading-6 text-ca-text-2">{selected.battleTemplate.bio}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <ReadoutTile label="HP" value={selected.battleTemplate.maxHp} />
                <ReadoutTile label="Grade" value={selected.gradeLabel} />
                <ReadoutTile label="Role" value={selected.role.split('/')[0] ?? selected.role} />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-4">
                {selected.battleTemplate.abilities.slice(0, 3).concat(selected.battleTemplate.ultimate).map((ability) => (
                  <AbilityChip key={ability.id} ability={ability} />
                ))}
              </div>
            </div>
          </div>
        </IllustratedSiteCard>
      ) : null}

      <IllustratedSiteCard>
        <div className="p-4">
          <SiteSectionHeader
            eyebrow="Roster Preview"
            title={`${visibleRoster.length} Fighters`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search roster"
                  className="w-40 rounded-[7px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none placeholder:text-ca-text-3 focus:border-ca-teal/35"
                />
                <div className="flex overflow-hidden rounded-[7px] border border-white/10 bg-black/20">
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {visibleRoster.map((entry) => (
                <FeaturedFighterCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="grid place-items-center rounded-[8px] border border-white/8 bg-white/[0.025] p-8">
              <StylizedPortraitPlaceholder label="NA" tone="frost" className="mb-3 h-16 w-16" />
              <p className="text-sm text-ca-text-3">No fighters match that filter.</p>
            </div>
          )}
        </div>
      </IllustratedSiteCard>
    </div>
  )
}
