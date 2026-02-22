import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CharacterCard } from '@/components/ui/CharacterCard'
import { TOTAL_CHARACTER_CAP, ownedRosterCharacters } from '@/data/characters'
import type { Archetype, CharacterRarity } from '@/types/characters'

type SortKey = 'LEVEL' | 'RARITY' | 'RECENT'

const rarityFilters: Array<{ label: string; value: 'ALL' | CharacterRarity }> = [
  { label: 'ALL', value: 'ALL' },
  { label: 'SPECIAL GRADE', value: 'SSR' },
  { label: 'GRADE 1', value: 'SR' },
  { label: 'GRADE 2', value: 'R' },
]

const archetypeFilters: Archetype[] = [
  'STRIKER',
  'BLASTER',
  'GUARDIAN',
  'AMPLIFIER',
  'DISRUPTOR',
  'RESTORER',
]

const rarityRank: Record<CharacterRarity, number> = {
  SSR: 3,
  SR: 2,
  R: 1,
}

const rosterPool = ownedRosterCharacters
  .filter((character) => Boolean(character.renderSrc))
  .filter((character, index, list) => list.findIndex((item) => item.id === character.id) === index)

export function RosterPage() {
  const [rarityFilter, setRarityFilter] = useState<'ALL' | CharacterRarity>('ALL')
  const [archetypeFilter, setArchetypeFilter] = useState<Archetype | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('LEVEL')

  const ownedCount = ownedRosterCharacters.length

  const visibleCharacters = rosterPool
    .filter((character) => (rarityFilter === 'ALL' ? true : character.rarity === rarityFilter))
    .filter((character) => (archetypeFilter ? character.archetypes.includes(archetypeFilter) : true))
    .sort((a, b) => {
      if (sortBy === 'LEVEL') {
        if (b.level !== a.level) return b.level - a.level
        return b.levelProgress - a.levelProgress
      }

      if (sortBy === 'RARITY') {
        if (rarityRank[b.rarity] !== rarityRank[a.rarity]) return rarityRank[b.rarity] - rarityRank[a.rarity]
        return b.level - a.level
      }

      return b.obtainedOrder - a.obtainedOrder
    })

  const clearFilters = () => {
    setRarityFilter('ALL')
    setArchetypeFilter(null)
  }

  return (
    <section className="relative min-h-full overflow-auto py-4 sm:py-6">
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-ca-teal/10 blur-3xl" />

      <div className="relative z-10 space-y-5">
        <header className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="ca-mono-label text-[0.58rem] text-ca-text-3">Character Collection</p>
              <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">Roster</h1>
            </div>
            <p className="ca-mono-label text-[0.6rem] text-ca-text-3">
              {ownedCount} / {TOTAL_CHARACTER_CAP} Characters
            </p>
          </div>

          <div className="rounded-[10px] border border-white/8 bg-[rgba(17,17,23,0.22)] p-3 backdrop-blur-sm">
            <div className="flex flex-col gap-3">
              <FilterGroup label="Rarity">
                {rarityFilters.map((option) => (
                  <FilterChip
                    key={option.label}
                    active={rarityFilter === option.value}
                    onClick={() => setRarityFilter(option.value)}
                  >
                    {option.label}
                  </FilterChip>
                ))}
              </FilterGroup>

              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <FilterGroup label="Archetype">
                  {archetypeFilters.map((tag) => (
                    <FilterChip
                      key={tag}
                      active={archetypeFilter === tag}
                      onClick={() =>
                        setArchetypeFilter((current) => (current === tag ? null : tag))
                      }
                    >
                      {tag}
                    </FilterChip>
                  ))}
                </FilterGroup>

                <div className="flex items-center gap-2 self-start xl:self-auto">
                  <label className="ca-mono-label text-[0.52rem] text-ca-text-3" htmlFor="roster-sort">
                    Sort
                  </label>
                  <select
                    id="roster-sort"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as SortKey)}
                    className="ca-mono-label rounded-md border border-white/10 bg-[rgba(15,15,21,0.38)] px-2 py-1.5 text-[0.52rem] text-ca-text outline-none transition focus:border-ca-teal/40"
                  >
                    <option value="LEVEL">LEVEL</option>
                    <option value="RARITY">RARITY</option>
                    <option value="RECENT">RECENT</option>
                  </select>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ca-mono-label rounded-md border border-transparent px-2 py-1.5 text-[0.5rem] text-ca-text-3 hover:border-white/10 hover:text-ca-text-2"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {visibleCharacters.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {visibleCharacters.map((character) => (
              <Link
                key={character.id}
                to={`/roster/${character.id}`}
                className="block rounded-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ca-teal/40"
              >
                <CharacterCard character={character} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[22rem] place-items-center rounded-[10px] border border-white/8 bg-[rgba(15,15,21,0.18)]">
            <div className="text-center">
              <p className="ca-display text-4xl text-ca-text-disabled sm:text-5xl">
                No Characters Found
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="ca-mono-label mt-4 rounded-md border border-white/10 px-3 py-2 text-[0.58rem] text-ca-text-2 hover:border-ca-teal/25 hover:text-ca-teal"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

type FilterGroupProps = {
  label: string
  children: ReactNode
}

function FilterGroup({ label, children }: FilterGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="ca-mono-label text-[0.48rem] text-ca-text-3">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

type FilterChipProps = {
  active: boolean
  onClick: () => void
  children: ReactNode
}

function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'ca-mono-label rounded-md border px-2 py-1.5 text-[0.5rem] transition',
        active
          ? 'border-ca-teal/40 bg-ca-teal-wash text-ca-teal'
          : 'border-white/10 bg-transparent text-ca-text-3 hover:border-white/18 hover:text-ca-text-2',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
