import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import {
  SitePanel,
  SitePanelHeader,
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
      return `${entry.name} ${entry.role} ${entry.gradeLabel} ${entry.passiveLabel}`
        .toLowerCase()
        .includes(normalized)
    })
  }, [query, rarity])

  return (
    <div className="p-4 space-y-3">
      {/* Page header */}
      <div className="border-b border-dotted border-white/12 pb-3">
        <p className="ca-mono-label text-[0.44rem] text-ca-text-3 tracking-[0.1em]">
          CHARACTERS / SKILLS
        </p>
        <h1 className="ca-display mt-1 text-[1.85rem] leading-none tracking-[0.05em] text-ca-text">
          Character Archive
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-[1.65] text-ca-text-2">
          Browse character files with face portraits, role summaries, grade, unlock status, and technique previews.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roster…"
          className="w-48 rounded-[4px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-ca-text outline-none placeholder:text-ca-text-3 focus:border-ca-teal/35"
        />
        <div className="flex overflow-hidden rounded-[4px] border border-white/10 bg-black/20">
          {rarityOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRarity(option)}
              className={[
                'ca-mono-label border-r border-white/8 px-3 py-2 text-[0.44rem] last:border-r-0 transition',
                rarity === option
                  ? 'bg-ca-teal-wash text-ca-teal'
                  : 'text-ca-text-3 hover:text-ca-text-2',
              ].join(' ')}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="ca-mono-label text-[0.44rem] text-ca-text-3">
          {visibleRoster.length} character{visibleRoster.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Character portrait grid */}
      <SitePanel>
        <SitePanelHeader eyebrow="Roster" title="Character Files" />
        {visibleRoster.length > 0 ? (
          <div className="px-4 pb-4 pt-3">
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 xl:grid-cols-10">
              {visibleRoster.map((entry) => (
                <Link key={entry.id} to={`/characters/${entry.id}`} className="group">
                  <CharacterFacePortrait
                    characterId={entry.id}
                    name={entry.name}
                    src={entry.facePortrait}
                    rarity={entry.rarity}
                    size="md"
                    className="h-auto w-full aspect-square"
                  />
                  <p className="ca-display mt-1.5 truncate text-center text-[0.72rem] leading-none text-ca-text-2 group-hover:text-ca-teal">
                    {entry.battleTemplate.shortName}
                  </p>
                  <p className="ca-mono-label mt-0.5 truncate text-center text-[0.38rem] text-ca-text-3">
                    {entry.rarity}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-ca-text-3">No characters match that filter.</p>
          </div>
        )}
      </SitePanel>
    </div>
  )
}
