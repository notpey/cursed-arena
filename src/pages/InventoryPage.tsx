import { useEffect, useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ownedRosterCharacters } from '@/data/characters'
import type { CharacterRarity } from '@/types/characters'

type GearSlot = 'CROWN' | 'CORE' | 'GRASP' | 'RELIC'
type GearSlotFilter = 'ALL' | GearSlot
type GearSortKey = 'LEVEL' | 'RARITY' | 'SET'
type GearSetKey =
  | 'Malevolent Flame'
  | 'Cursed Resilience'
  | 'Jujutsu High'
  | 'Shadow Procession'
  | 'Exorcist Regalia'

type GearStat = {
  stat: string
  value: string
  upgradeDots: number[]
}

type EquipmentPiece = {
  id: string
  name: string
  setKey: GearSetKey
  slot: GearSlot
  rarity: CharacterRarity
  level: number
  levelCap: number
  mainStatLabel: string
  mainStatValue: string
  subStats: GearStat[]
  setBonuses: {
    twoPiece: string
    fourPiece: string
  }
  equippedById?: string
  equippedSetPieces?: number
  locked?: boolean
  materialCost: number
  goldCost: number
}

type SetTheme = {
  icon: string
  iconBg: string
  border: string
  glow: string
}

const setThemes: Record<GearSetKey, SetTheme> = {
  'Malevolent Flame': {
    icon: 'MF',
    iconBg:
      'linear-gradient(145deg, rgba(250,39,66,0.28), rgba(250,39,66,0.08) 45%, rgba(11,11,16,0.2))',
    border: 'rgba(250,39,66,0.32)',
    glow: 'rgba(250,39,66,0.14)',
  },
  'Cursed Resilience': {
    icon: 'CR',
    iconBg:
      'linear-gradient(145deg, rgba(5,216,189,0.24), rgba(5,216,189,0.08) 48%, rgba(11,11,16,0.2))',
    border: 'rgba(5,216,189,0.3)',
    glow: 'rgba(5,216,189,0.14)',
  },
  'Jujutsu High': {
    icon: 'JH',
    iconBg:
      'linear-gradient(145deg, rgba(245,166,35,0.24), rgba(245,166,35,0.08) 48%, rgba(11,11,16,0.2))',
    border: 'rgba(245,166,35,0.3)',
    glow: 'rgba(245,166,35,0.12)',
  },
  'Shadow Procession': {
    icon: 'SP',
    iconBg:
      'linear-gradient(145deg, rgba(80,120,255,0.2), rgba(80,120,255,0.07) 48%, rgba(11,11,16,0.2))',
    border: 'rgba(80,120,255,0.28)',
    glow: 'rgba(80,120,255,0.12)',
  },
  'Exorcist Regalia': {
    icon: 'ER',
    iconBg:
      'linear-gradient(145deg, rgba(228,230,239,0.18), rgba(228,230,239,0.05) 48%, rgba(11,11,16,0.2))',
    border: 'rgba(228,230,239,0.2)',
    glow: 'rgba(228,230,239,0.08)',
  },
}

const rarityBorder: Record<CharacterRarity, string> = {
  R: 'rgba(130,136,160,0.22)',
  SR: 'rgba(59,130,246,0.34)',
  SSR: 'rgba(250,39,66,0.38)',
}

const raritySortRank: Record<CharacterRarity, number> = {
  SSR: 3,
  SR: 2,
  R: 1,
}

const slotFilters: GearSlotFilter[] = ['ALL', 'CROWN', 'CORE', 'GRASP', 'RELIC']
const setFilterOptions: Array<GearSetKey | 'ALL SETS'> = [
  'ALL SETS',
  'Malevolent Flame',
  'Cursed Resilience',
  'Jujutsu High',
  'Shadow Procession',
  'Exorcist Regalia',
]
const sortOptions: GearSortKey[] = ['LEVEL', 'RARITY', 'SET']

const equippedCharacterById = Object.fromEntries(
  ownedRosterCharacters.map((character) => [character.id, character]),
)

function createEquipmentInventorySeed(): EquipmentPiece[] {
  return [
  makePiece('mf-crown-1', 'Flame Crest', 'Malevolent Flame', 'CROWN', 'SSR', 15, 'ATK%', '+46.6%', 'gojo', 2),
  makePiece('mf-core-1', 'Shrine Core', 'Malevolent Flame', 'CORE', 'SSR', 12, 'CT%', '+38.2%', 'yuji', 2),
  makePiece('mf-grasp-1', 'Execution Grasp', 'Malevolent Flame', 'GRASP', 'SR', 9, 'SPD', '+18', 'todo', 1),
  makePiece('mf-relic-1', 'Ash Relic', 'Malevolent Flame', 'RELIC', 'SR', 6, 'Skill DMG%', '+12.4%', undefined, 0),

  makePiece(
    'cr-crown-1',
    'Ward Crown',
    'Cursed Resilience',
    'CROWN',
    'SR',
    10,
    'HP%',
    '+34.2%',
    'nanami',
    2,
  ),
  makePiece(
    'cr-core-1',
    'Aegis Core',
    'Cursed Resilience',
    'CORE',
    'SSR',
    14,
    'DEF%',
    '+41.8%',
    'nanami',
    2,
  ),
  makePiece('cr-grasp-1', 'Steadfast Grip', 'Cursed Resilience', 'GRASP', 'SR', 8, 'HP', '+1240', 'panda', 2),
  makePiece('cr-relic-1', 'Barrier Token', 'Cursed Resilience', 'RELIC', 'R', 4, 'Tenacity%', '+6.2%', 'panda', 2),

  makePiece('jh-crown-1', 'Dean Insignia', 'Jujutsu High', 'CROWN', 'SSR', 13, 'CE Max%', '+36.1%', 'yuta', 2),
  makePiece('jh-core-1', 'Curriculum Core', 'Jujutsu High', 'CORE', 'SR', 11, 'ATK%', '+28.9%', 'kamo', 1),
  makePiece('jh-grasp-1', 'Faculty Grasp', 'Jujutsu High', 'GRASP', 'R', 5, 'Crit Rate%', '+7.1%', undefined, 0),
  makePiece('jh-relic-1', 'Archive Relic', 'Jujutsu High', 'RELIC', 'SR', 7, 'CE Regen%', '+9.4%', 'miwa', 1),

  makePiece(
    'sp-crown-1',
    'Ten Shadows Crest',
    'Shadow Procession',
    'CROWN',
    'SSR',
    15,
    'CT%',
    '+45.8%',
    'inumaki',
    3,
  ),
  makePiece('sp-core-1', 'Procession Core', 'Shadow Procession', 'CORE', 'SR', 12, 'ATK%', '+31.5%', 'choso', 2),
  makePiece('sp-grasp-1', 'Shikigami Grasp', 'Shadow Procession', 'GRASP', 'SR', 11, 'Skill Haste%', '+11.2%', 'inumaki', 1),
  makePiece('sp-relic-1', 'Umbra Relic', 'Shadow Procession', 'RELIC', 'R', 3, 'CE Max', '+92', undefined, 0),

  makePiece('er-crown-1', 'Regalia Crown', 'Exorcist Regalia', 'CROWN', 'SR', 9, 'ATK%', '+24.8%', 'maki', 2),
  makePiece('er-core-1', 'Regalia Core', 'Exorcist Regalia', 'CORE', 'SR', 9, 'Crit DMG%', '+19.6%', 'maki', 2),
  makePiece('er-grasp-1', 'Regalia Grasp', 'Exorcist Regalia', 'GRASP', 'R', 2, 'ACC%', '+5.0%', undefined, 0),
  makePiece('er-relic-1', 'Regalia Relic', 'Exorcist Regalia', 'RELIC', 'R', 6, 'HP%', '+14.2%', 'mai', 1),

  makePiece('mf-crown-2', 'Cinder Diadem', 'Malevolent Flame', 'CROWN', 'SR', 8, 'ATK%', '+21.4%', undefined, 0),
  makePiece('cr-core-2', 'Sanctum Heart', 'Cursed Resilience', 'CORE', 'R', 6, 'DEF%', '+16.9%', 'kamo', 1),
  makePiece('jh-relic-2', 'Campus Relic', 'Jujutsu High', 'RELIC', 'SR', 10, 'Skill DMG%', '+10.3%', 'yuta', 2),
  makePiece('sp-grasp-2', 'Night Procession Grip', 'Shadow Procession', 'GRASP', 'SSR', 13, 'ATK%', '+35.4%', 'choso', 2),
  ]
}

export function InventoryPage() {
  const [slotFilter, setSlotFilter] = useState<GearSlotFilter>('ALL')
  const [setFilter, setSetFilter] = useState<(typeof setFilterOptions)[number]>('ALL SETS')
  const [sortBy, setSortBy] = useState<GearSortKey>('LEVEL')
  const [pieces, setPieces] = useState<EquipmentPiece[]>(() => createEquipmentInventorySeed())
  const [selectedPieceId, setSelectedPieceId] = useState<string>(() => createEquipmentInventorySeed()[0]?.id ?? '')

  const filteredPieces = pieces
    .filter((piece) => (slotFilter === 'ALL' ? true : piece.slot === slotFilter))
    .filter((piece) => (setFilter === 'ALL SETS' ? true : piece.setKey === setFilter))
    .sort((a, b) => {
      if (sortBy === 'LEVEL') {
        return b.level - a.level || raritySortRank[b.rarity] - raritySortRank[a.rarity]
      }
      if (sortBy === 'RARITY') {
        return raritySortRank[b.rarity] - raritySortRank[a.rarity] || b.level - a.level
      }
      return a.setKey.localeCompare(b.setKey) || b.level - a.level
    })

  useEffect(() => {
    if (!filteredPieces.length) return
    if (!filteredPieces.some((piece) => piece.id === selectedPieceId)) {
      setSelectedPieceId(filteredPieces[0].id)
    }
  }, [filteredPieces, selectedPieceId])

  const selectedPiece =
    filteredPieces.find((piece) => piece.id === selectedPieceId) ??
    pieces.find((piece) => piece.id === selectedPieceId) ??
    null

  function clearFilters() {
    setSlotFilter('ALL')
    setSetFilter('ALL SETS')
    setSortBy('LEVEL')
  }

  function toggleLock(pieceId: string) {
    setPieces((current) =>
      current.map((piece) => (piece.id === pieceId ? { ...piece, locked: !piece.locked } : piece)),
    )
  }

  return (
    <section className="py-4 sm:py-6">
      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] xl:gap-5">
        <LeftEquipmentPanel
          pieces={filteredPieces}
          allCount={pieces.length}
          slotFilter={slotFilter}
          onSlotFilterChange={setSlotFilter}
          setFilter={setFilter}
          onSetFilterChange={setSetFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          selectedPieceId={selectedPieceId}
          onSelectPiece={setSelectedPieceId}
          onClearFilters={clearFilters}
        />

        <RightDetailPanel piece={selectedPiece} onToggleLock={toggleLock} />
      </div>
    </section>
  )
}

function LeftEquipmentPanel({
  pieces,
  allCount,
  slotFilter,
  onSlotFilterChange,
  setFilter,
  onSetFilterChange,
  sortBy,
  onSortByChange,
  selectedPieceId,
  onSelectPiece,
  onClearFilters,
}: {
  pieces: EquipmentPiece[]
  allCount: number
  slotFilter: GearSlotFilter
  onSlotFilterChange: (value: GearSlotFilter) => void
  setFilter: (typeof setFilterOptions)[number]
  onSetFilterChange: (value: (typeof setFilterOptions)[number]) => void
  sortBy: GearSortKey
  onSortByChange: (value: GearSortKey) => void
  selectedPieceId: string
  onSelectPiece: (pieceId: string) => void
  onClearFilters: () => void
}) {
  return (
    <section className="ca-card h-full min-h-0 border-white/8 bg-[rgba(14,15,20,0.2)] shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-white/6 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Equipment Inventory</p>
              <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">Cursed Seals</h1>
            </div>
            <p className="ca-mono-label pt-2 text-[0.55rem] text-ca-text-3">
              {pieces.length} / {allCount} PIECES
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <p className="ca-mono-label mb-2 text-[0.45rem] text-ca-text-3">Slot</p>
              <div className="flex flex-wrap gap-2">
                {slotFilters.map((slot) => {
                  const active = slotFilter === slot
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => onSlotFilterChange(slot)}
                      className={[
                        'ca-mono-label rounded-md border px-2.5 py-1.5 text-[0.46rem] transition',
                        active
                          ? 'border-ca-teal/35 bg-ca-teal-wash text-ca-teal'
                          : 'border-white/8 bg-[rgba(255,255,255,0.02)] text-ca-text-3 hover:border-white/12 hover:text-ca-text-2',
                      ].join(' ')}
                    >
                      {slot}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="ca-mono-label mb-2 block text-[0.45rem] text-ca-text-3">Set</span>
                <select
                  value={setFilter}
                  onChange={(event) =>
                    onSetFilterChange(event.target.value as (typeof setFilterOptions)[number])
                  }
                  className="ca-mono-label w-full rounded-md border border-white/10 bg-[rgba(14,15,21,0.6)] px-3 py-2 text-[0.5rem] text-ca-text outline-none transition focus:border-ca-teal/35"
                >
                  {setFilterOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="ca-mono-label mb-2 block text-[0.45rem] text-ca-text-3">Sort</span>
                <select
                  value={sortBy}
                  onChange={(event) => onSortByChange(event.target.value as GearSortKey)}
                  className="ca-mono-label w-full rounded-md border border-white/10 bg-[rgba(14,15,21,0.6)] px-3 py-2 text-[0.5rem] text-ca-text outline-none transition focus:border-ca-teal/35"
                >
                  {sortOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {pieces.length ? (
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 2xl:grid-cols-4">
              {pieces.map((piece) => (
                <EquipmentCard
                  key={piece.id}
                  piece={piece}
                  selected={selectedPieceId === piece.id}
                  onSelect={() => onSelectPiece(piece.id)}
                />
              ))}
            </div>
          ) : (
            <div className="grid h-full min-h-[18rem] place-items-center rounded-[10px] border border-dashed border-white/10 bg-[rgba(16,17,23,0.12)]">
              <div className="text-center">
                <p className="ca-display text-3xl text-ca-text-disabled">No Seals Found</p>
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="ca-mono-label mt-4 rounded-md border border-white/10 px-3 py-2 text-[0.52rem] text-ca-text-2 hover:border-ca-teal/35 hover:text-ca-teal"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function EquipmentCard({
  piece,
  selected,
  onSelect,
}: {
  piece: EquipmentPiece
  selected: boolean
  onSelect: () => void
}) {
  const theme = setThemes[piece.setKey]

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative text-left transition duration-200 hover:-translate-y-1"
    >
      <div
        className="rounded-[10px] border bg-[rgba(16,17,22,0.34)] p-2.5 shadow-[0_8px_18px_rgba(0,0,0,0.14)] backdrop-blur-sm transition duration-200"
        style={{
          borderColor: selected ? theme.border : rarityBorder[piece.rarity],
          boxShadow: selected
            ? `0 0 0 1px ${theme.border}, 0 10px 24px rgba(0,0,0,0.18), 0 0 24px ${theme.glow}`
            : `0 8px 18px rgba(0,0,0,0.14)`,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div
            className="grid h-9 w-9 place-items-center rounded-md border text-[0.58rem] font-semibold text-ca-text"
            style={{ background: theme.iconBg, borderColor: theme.border }}
          >
            <span className="ca-mono-label text-[0.42rem]">{theme.icon}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{piece.slot}</span>
            {piece.locked ? (
              <span className="ca-mono-label rounded border border-white/10 px-1 py-[1px] text-[0.35rem] text-ca-text-3">
                LOCK
              </span>
            ) : null}
          </div>
        </div>

        <p className="ca-mono-label mt-2 truncate text-[0.37rem] text-ca-text-disabled">{piece.setKey}</p>
        <p className="ca-mono-label mt-1 truncate text-[0.5rem] text-ca-text-2">
          {piece.mainStatLabel} {piece.mainStatValue}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="ca-mono-label rounded-md border border-white/8 bg-[rgba(255,255,255,0.02)] px-1.5 py-1 text-[0.38rem] text-ca-text-3">
            +{piece.level}
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: 4 }, (_, idx) => (
              <span
                key={`${piece.id}-dot-${idx}`}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    idx < Math.min(4, Math.ceil(piece.level / 4))
                      ? theme.border.replace('0.3', '0.9').replace('0.32', '0.9').replace('0.28', '0.9')
                      : 'rgba(228,230,239,0.08)',
                  boxShadow:
                    idx < Math.min(4, Math.ceil(piece.level / 4)) ? `0 0 8px ${theme.glow}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </button>
  )
}

function RightDetailPanel({
  piece,
  onToggleLock,
}: {
  piece: EquipmentPiece | null
  onToggleLock: (pieceId: string) => void
}) {
  if (!piece) {
    return (
      <section className="ca-card grid min-h-[24rem] place-items-center border-white/8 bg-[rgba(14,15,20,0.18)]">
        <div className="text-center">
          <p className="ca-display text-4xl text-ca-text-disabled">No Piece Selected</p>
          <p className="mt-2 text-sm text-ca-text-3">Adjust filters or choose a seal from the inventory grid.</p>
        </div>
      </section>
    )
  }

  const theme = setThemes[piece.setKey]
  const equippedBy = piece.equippedById ? equippedCharacterById[piece.equippedById] : null
  const setPiecesEquipped = piece.equippedSetPieces ?? 0
  const twoPieceActive = setPiecesEquipped >= 2
  const fourPieceActive = setPiecesEquipped >= 4
  const levelPct = (piece.level / piece.levelCap) * 100

  return (
    <section className="ca-card h-full min-h-0 border-white/8 bg-[rgba(14,15,20,0.18)] shadow-[0_14px_34px_rgba(0,0,0,0.16)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-white/6 px-4 py-4 sm:px-5">
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Selected Piece</p>
          <h2 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">Seal Detail</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
            <section className="rounded-[10px] border border-white/8 bg-[rgba(16,17,23,0.2)] p-4">
              <div className="grid gap-4 md:grid-cols-[auto_1fr]">
                <div
                  className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-xl border"
                  style={{
                    borderColor: theme.border,
                    background: `${theme.iconBg}, radial-gradient(circle at 20% 15%, rgba(228,230,239,0.08), transparent 55%)`,
                    boxShadow: `0 0 32px ${theme.glow}`,
                  }}
                >
                  <span className="ca-display text-4xl text-white/90">{theme.icon}</span>
                  <span className="ca-mono-label absolute bottom-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[0.42rem] text-ca-text-2">
                    {piece.slot}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="ca-display text-3xl text-ca-text sm:text-[2.1rem]">{piece.name}</p>
                  <p className="ca-mono-label mt-2 text-[0.52rem] text-ca-text-3">{piece.setKey}</p>
                  <p className="ca-mono-label mt-4 text-[0.55rem] text-ca-text-disabled">MAIN STAT</p>
                  <p className="ca-mono-label mt-2 text-[1.05rem] font-semibold text-ca-text sm:text-[1.2rem]">
                    {piece.mainStatLabel} {piece.mainStatValue}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[10px] border border-white/8 bg-[rgba(16,17,23,0.16)] p-4">
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">SUB-STATS</p>
              <div className="mt-3 space-y-2.5">
                {piece.subStats.map((stat) => (
                  <div
                    key={`${piece.id}-${stat.stat}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-white/6 bg-[rgba(255,255,255,0.02)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="ca-mono-label text-[0.45rem] text-ca-text-disabled">{stat.stat}</span>
                        <span className="ca-mono-label text-[0.53rem] text-ca-text-2">{stat.value}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, idx) => {
                          const filled = stat.upgradeDots.includes(idx + 1)
                          return (
                            <span
                              key={`${piece.id}-${stat.stat}-u-${idx}`}
                              className="h-1.5 w-1.5 rounded-full border"
                              style={{
                                background: filled ? theme.border : 'rgba(228,230,239,0.04)',
                                borderColor: filled ? theme.border : 'rgba(228,230,239,0.1)',
                                boxShadow: filled ? `0 0 8px ${theme.glow}` : 'none',
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[10px] border border-white/8 bg-[rgba(16,17,23,0.16)] p-4">
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">SET BONUS PREVIEW</p>
              <div className="mt-3 space-y-2">
                <SetBonusRow
                  label={`${piece.setKey} (${setPiecesEquipped}/4)`}
                  requirement="2-PIECE"
                  text={piece.setBonuses.twoPiece}
                  active={twoPieceActive}
                />
                <SetBonusRow
                  label={`${piece.setKey} (${setPiecesEquipped}/4)`}
                  requirement="4-PIECE"
                  text={piece.setBonuses.fourPiece}
                  active={fourPieceActive}
                />
              </div>
            </section>

            <section className="rounded-[10px] border border-white/8 bg-[rgba(16,17,23,0.16)] p-4">
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">CURRENTLY EQUIPPED BY</p>
              {equippedBy ? (
                <div className="mt-3 inline-flex items-center gap-3 rounded-lg border border-white/8 bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  <CharacterAvatarChip characterId={equippedBy.id} />
                  <div>
                    <p className="ca-display text-xl text-ca-text">{equippedBy.name}</p>
                    <p className="ca-mono-label text-[0.42rem] text-ca-text-3">ACTIVE LOADOUT</p>
                  </div>
                </div>
              ) : (
                <p className="ca-mono-label mt-3 text-[0.55rem] text-ca-text-disabled">UNEQUIPPED</p>
              )}
            </section>

            <section className="rounded-[10px] border border-white/8 bg-[rgba(16,17,23,0.16)] p-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ca-display rounded-lg border border-ca-teal/35 bg-ca-teal-wash px-4 py-2 text-xl text-ca-teal"
                >
                  Equip
                </button>
                <button
                  type="button"
                  className="ca-display rounded-lg border border-white/12 bg-[rgba(21,21,28,0.2)] px-4 py-2 text-xl text-ca-text"
                >
                  Upgrade
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLock(piece.id)}
                  className="ca-mono-label rounded-lg border border-white/12 bg-transparent px-3 py-2 text-[0.52rem] text-ca-text-2 hover:border-white/20"
                >
                  {piece.locked ? 'UNLOCK' : 'LOCK'}
                </button>
              </div>

              <div className="mt-4 rounded-[10px] border border-white/8 bg-[rgba(12,13,18,0.28)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="ca-mono-label text-[0.52rem] text-ca-text-2">
                    LEVEL +{piece.level} / +{piece.levelCap}
                  </p>
                  <p className="ca-mono-label text-[0.48rem] text-ca-text-3">
                    MATERIALS {piece.materialCost} · GOLD {piece.goldCost.toLocaleString()}
                  </p>
                </div>
                <ProgressBar value={levelPct} tone="gold" className="mt-3 h-2 bg-ca-highlight/55" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  )
}

function SetBonusRow({
  label,
  requirement,
  text,
  active,
}: {
  label: string
  requirement: '2-PIECE' | '4-PIECE'
  text: string
  active: boolean
}) {
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{
        borderColor: active ? 'rgba(5,216,189,0.22)' : 'rgba(228,230,239,0.08)',
        background: active ? 'rgba(5,216,189,0.06)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="ca-mono-label rounded-md border px-2 py-1 text-[0.42rem]"
          style={{
            borderColor: active ? 'rgba(5,216,189,0.28)' : 'rgba(228,230,239,0.12)',
            color: active ? 'var(--teal-primary)' : 'var(--text-tertiary)',
            background: active ? 'rgba(5,216,189,0.08)' : 'rgba(255,255,255,0.02)',
          }}
        >
          {requirement}
        </span>
        <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      </div>
      <p className={`mt-2 text-sm ${active ? 'text-ca-teal' : 'text-ca-text-2'}`}>{text}</p>
    </div>
  )
}

function CharacterAvatarChip({ characterId }: { characterId: string }) {
  const character = equippedCharacterById[characterId]

  if (!character) {
    return (
      <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-[rgba(255,255,255,0.03)] text-xs text-ca-text-3">
        ?
      </div>
    )
  }

  const frame = character.portraitFrame ?? {}
  const scale = frame.scale ?? 1.6
  const x = frame.x ?? '0%'
  const y = frame.y ?? '10%'

  return (
    <div className="relative h-10 w-10 overflow-hidden rounded-full border border-white/12 bg-[rgba(255,255,255,0.03)]">
      {character.renderSrc ? (
        <div
          className="absolute left-1/2 top-[6%] w-[90%]"
          style={{
            transform: `translate(-50%, 0) translate(${x}, ${y}) scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          <img src={character.renderSrc} alt={character.name} className="block h-auto w-full select-none" draggable={false} />
        </div>
      ) : (
        <div className="grid h-full w-full place-items-center">
          <span className="ca-mono-label text-[0.42rem] text-ca-text-3">
            {character.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </span>
        </div>
      )}
    </div>
  )
}

function makePiece(
  id: string,
  name: string,
  setKey: GearSetKey,
  slot: GearSlot,
  rarity: CharacterRarity,
  level: number,
  mainStatLabel: string,
  mainStatValue: string,
  equippedById?: string,
  equippedSetPieces?: number,
): EquipmentPiece {
  const levelCap = rarity === 'SSR' ? 15 : rarity === 'SR' ? 12 : 9
  const baseStats = substatPoolBySlot[slot]
  const subStats = baseStats.slice(0, 4).map((stat, idx) => ({
    stat,
    value: rollSubstatValue(stat, rarity, idx),
    upgradeDots: mockUpgradeDots(level, idx),
  }))

  return {
    id,
    name,
    setKey,
    slot,
    rarity,
    level,
    levelCap,
    mainStatLabel,
    mainStatValue,
    subStats,
    setBonuses: setBonusBySet[setKey],
    equippedById,
    equippedSetPieces,
    locked: rarity === 'SSR',
    materialCost: 6 + level * 2,
    goldCost: 2500 + level * 650,
  }
}

const substatPoolBySlot: Record<GearSlot, string[]> = {
  CROWN: ['ATK%', 'CRIT RATE%', 'CRIT DMG%', 'CT%', 'SPD'],
  CORE: ['HP%', 'DEF%', 'CE MAX%', 'SKILL DMG%', 'TENACITY%'],
  GRASP: ['ATK%', 'ACC%', 'SKILL HASTE%', 'CE REGEN%', 'SPD'],
  RELIC: ['HP%', 'DEF%', 'CT%', 'CE MAX', 'STATUS RES%'],
}

const setBonusBySet: Record<GearSetKey, { twoPiece: string; fourPiece: string }> = {
  'Malevolent Flame': {
    twoPiece: '+15% Skill Damage',
    fourPiece: 'After using an Ultimate, gain +20% ATK for 2 turns.',
  },
  'Cursed Resilience': {
    twoPiece: '+18% DEF',
    fourPiece: 'Gain a shield equal to 12% max HP at battle start.',
  },
  'Jujutsu High': {
    twoPiece: '+12% CE Max',
    fourPiece: 'Reduce first skill CE cost by 1 each battle.',
  },
  'Shadow Procession': {
    twoPiece: '+14% CT Potency',
    fourPiece: 'Inflicting debuffs grants +10% Skill Haste for 2 turns.',
  },
  'Exorcist Regalia': {
    twoPiece: '+10% Crit Rate',
    fourPiece: 'Critical hits restore 4 CE (once per turn).',
  },
}

function mockUpgradeDots(level: number, statIndex: number) {
  const thresholds = [3, 6, 9, 12, 15]
  return thresholds
    .map((threshold, idx) => ({ threshold, idx: idx + 1 }))
    .filter(({ threshold, idx }) => level >= threshold && (idx + statIndex) % 2 === 1)
    .map(({ idx }) => idx)
}

function rollSubstatValue(stat: string, rarity: CharacterRarity, index: number) {
  const tierMod = rarity === 'SSR' ? 1.3 : rarity === 'SR' ? 1.1 : 0.95
  const base = (index + 1) * 2.2 * tierMod

  if (stat.includes('%')) {
    return `+${(base + 1.6).toFixed(1)}%`
  }
  if (stat === 'SPD') {
    return `+${Math.round(base + 4)}`
  }
  if (stat === 'CE MAX') {
    return `+${Math.round(40 * tierMod + index * 12)}`
  }
  return `+${Math.round(base * 9 + 8)}`
}
