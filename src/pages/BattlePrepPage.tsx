import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { getTargetLabel } from '@/components/battle/battleDisplay'
import { getAbilityEnergyCost } from '@/features/battle/energy'
import {
  battlePrepRoster,
  battlePrepRosterById,
  persistPrepSelection,
  readPrepSelection,
  stageBattleLaunch,
  type BattlePrepRosterEntry,
} from '@/features/battle/prep'
import type { BattleAbilityTemplate } from '@/features/battle/types'
import {
  battleMatchModes,
  getModeButtonLabel,
  getModeLabel,
  persistSelectedMatchMode,
  readBattleProfileStats,
  readSelectedMatchMode,
  type BattleMatchMode,
} from '@/features/battle/matches'
import type { CharacterRarity } from '@/types/characters'

type PrepSortKey = 'NAME' | 'RARITY' | 'ROLE'

type PrepRoleFilter = 'ALL' | (string & {})

const sortOptions: PrepSortKey[] = ['NAME', 'RARITY', 'ROLE']
const roleOptions = ['ALL', ...Array.from(new Set(battlePrepRoster.map((entry) => entry.role)))] as PrepRoleFilter[]

const rarityRank: Record<CharacterRarity, number> = {
  SSR: 3,
  SR: 2,
  R: 1,
}

const rarityStyles: Record<CharacterRarity, { border: string; wash: string; text: string }> = {
  SSR: {
    border: 'rgba(250,39,66,0.34)',
    wash: 'rgba(250,39,66,0.12)',
    text: 'var(--red-primary)',
  },
  SR: {
    border: 'rgba(59,130,246,0.3)',
    wash: 'rgba(59,130,246,0.1)',
    text: 'var(--rarity-rare)',
  },
  R: {
    border: 'rgba(107,107,128,0.22)',
    wash: 'rgba(107,107,128,0.08)',
    text: 'var(--text-secondary)',
  },
}

function getExplicitTeamIds(teamIds: Array<string | null>) {
  return teamIds
    .filter((teamId): teamId is string => Boolean(teamId && battlePrepRosterById[teamId]))
    .filter((teamId, index, list) => list.indexOf(teamId) === index)
}

function getPreferredAssignSlot(teamIds: Array<string | null>, focusedSlot: number) {
  if (!teamIds[focusedSlot]) return focusedSlot
  const emptyIndex = teamIds.findIndex((teamId) => teamId === null)
  return emptyIndex >= 0 ? emptyIndex : focusedSlot
}

function getDefaultAbilityId(entry: BattlePrepRosterEntry | null) {
  if (!entry) return null
  return entry.battleTemplate.abilities[0]?.id ?? entry.battleTemplate.ultimate.id
}

function formatAbilityClasses(ability: BattleAbilityTemplate) {
  const classes = [ability.kind.toUpperCase(), ...ability.tags.filter((tag) => tag !== 'ULT')]
  return Array.from(new Set(classes)).join(', ')
}

function PortraitThumb({
  entry,
  sizeClass,
  labelClass = 'text-[0.36rem]',
  bordered = true,
  showLabel = false,
}: {
  entry: BattlePrepRosterEntry
  sizeClass: string
  labelClass?: string
  bordered?: boolean
  showLabel?: boolean
}) {
  const style = rarityStyles[entry.rarity]
  const initial = entry.battleTemplate.shortName[0]?.toUpperCase() ?? '?'
  const portraitMode = Boolean(
    entry.battleTemplate.boardPortraitSrc &&
      (entry.battleTemplate.boardPortraitSrc !== entry.battleTemplate.renderSrc || entry.battleTemplate.boardPortraitSrc.startsWith('data:image')),
  )
  const frame = portraitMode ? {} : entry.battleTemplate.boardPortraitFrame ?? {}
  const portraitScale = frame.scale ?? 1
  const portraitX = frame.x ?? '0%'
  const portraitY = frame.y ?? '0%'
  const portraitOpacity = frame.opacity ?? 1
  const portraitWidth = frame.maxWidth ?? '100%'

  return (
    <div
      className={`relative overflow-hidden rounded-[8px] bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))] ${bordered ? 'border' : ''} ${sizeClass}`}
      style={{ borderColor: bordered ? style.border : 'transparent' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${style.wash}, transparent 70%)`,
        }}
      />

      {entry.battleTemplate.boardPortraitSrc ? (
        <div className="absolute inset-0 overflow-hidden">
          {portraitMode ? (
            <img
              src={entry.battleTemplate.boardPortraitSrc}
              alt={entry.name}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
              style={{ opacity: portraitOpacity }}
              draggable={false}
            />
          ) : (
            <img
              src={entry.battleTemplate.boardPortraitSrc}
              alt={entry.name}
              className="pointer-events-none absolute left-1/2 top-0 h-full max-w-none select-none object-cover"
              style={{
                width: portraitWidth,
                opacity: portraitOpacity,
                transform: `translate(-50%, 0) translate(${portraitX}, ${portraitY}) scale(${portraitScale})`,
                transformOrigin: 'top center',
              }}
              draggable={false}
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.24))]" />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span
            className="ca-display select-none leading-none"
            style={{
              color: style.text,
              fontSize: 'clamp(1.35rem, 2.4vw, 2rem)',
              opacity: 0.72,
            }}
          >
            {initial}
          </span>
        </div>
      )}

      {showLabel ? (
        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(8,8,12,0.94))] px-1.5 pb-1.5 pt-5">
          <p className={`ca-mono-label truncate text-ca-text-2 ${labelClass}`}>{entry.battleTemplate.shortName}</p>
        </div>
      ) : null}
    </div>
  )
}

export function BattlePrepPage() {
  const navigate = useNavigate()
  const [searchValue, setSearchValue] = useState('')
  const [sortBy, setSortBy] = useState<PrepSortKey>('NAME')
  const [roleFilter, setRoleFilter] = useState<PrepRoleFilter>('ALL')
  const [teamIds, setTeamIds] = useState<Array<string | null>>(() => {
    const initial = readPrepSelection()
    return [initial[0] ?? null, initial[1] ?? null, initial[2] ?? null]
  })
  const [focusedSlot, setFocusedSlot] = useState(0)
  const [selectedRosterId, setSelectedRosterId] = useState<string>(
    () => readPrepSelection()[0] ?? battlePrepRoster[0]?.id ?? '',
  )
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null)
  const [matchMode, setMatchMode] = useState<BattleMatchMode>(() => readSelectedMatchMode())
  const [profileStats] = useState(() => readBattleProfileStats())

  useEffect(() => {
    persistPrepSelection(teamIds)
  }, [teamIds])

  useEffect(() => {
    persistSelectedMatchMode(matchMode)
  }, [matchMode])

  const visibleRoster = useMemo(() => {
    const query = searchValue.trim().toLowerCase()

    return battlePrepRoster
      .filter((entry) => {
        if (roleFilter !== 'ALL' && entry.role !== roleFilter) return false
        return query ? `${entry.name} ${entry.role} ${entry.passiveLabel}`.toLowerCase().includes(query) : true
      })
      .sort((left, right) => {
        if (sortBy === 'RARITY') {
          if (rarityRank[right.rarity] !== rarityRank[left.rarity]) {
            return rarityRank[right.rarity] - rarityRank[left.rarity]
          }
          return left.name.localeCompare(right.name)
        }

        if (sortBy === 'ROLE') {
          if (left.role !== right.role) {
            return left.role.localeCompare(right.role)
          }
          return left.name.localeCompare(right.name)
        }

        return left.name.localeCompare(right.name)
      })
  }, [roleFilter, searchValue, sortBy])

  const explicitTeamIds = getExplicitTeamIds(teamIds)
  const teamEntries = teamIds.map((teamId) => (teamId ? battlePrepRosterById[teamId] ?? null : null))
  const winRate = Math.round((profileStats.wins / Math.max(1, profileStats.matchesPlayed)) * 100)
  const selectedEntry =
    battlePrepRosterById[selectedRosterId] ?? teamEntries[focusedSlot] ?? battlePrepRoster[0] ?? null
  const selectedAbility = selectedEntry
    ? selectedEntry.battleTemplate.abilities
        .concat(selectedEntry.battleTemplate.ultimate)
        .find((ability) => ability.id === selectedAbilityId) ??
      selectedEntry.battleTemplate.abilities[0] ??
      selectedEntry.battleTemplate.ultimate
    : null
  const isReady = explicitTeamIds.length === 3

  function handleAssignCharacter(characterId: string) {
    setSelectedRosterId(characterId)
    setSelectedAbilityId(getDefaultAbilityId(battlePrepRosterById[characterId] ?? null))

    const existingIndex = teamIds.findIndex((teamId) => teamId === characterId)
    if (existingIndex >= 0) {
      setFocusedSlot(existingIndex)
      return
    }

    const nextSlot = getPreferredAssignSlot(teamIds, focusedSlot)
    setTeamIds((current) => {
      const next = [...current]
      next[nextSlot] = characterId
      return next
    })
    setFocusedSlot(nextSlot)
  }

  function handleSelectSlot(slotIndex: number) {
    setFocusedSlot(slotIndex)
    const entry = teamEntries[slotIndex]
    if (entry) {
      setSelectedRosterId(entry.id)
      setSelectedAbilityId(getDefaultAbilityId(entry))
    }
  }

  function handleClearSlot(slotIndex: number) {
    setTeamIds((current) => {
      const next = [...current]
      next[slotIndex] = null
      return next
    })
  }

  function handleEnterArena() {
    if (!isReady) return
    stageBattleLaunch(teamIds, matchMode)
    navigate('/battle')
  }

  return (
    <section className="relative h-[calc(100vh-6.75rem)] overflow-hidden py-2 sm:py-3">
      <div className="pointer-events-none absolute -left-20 top-12 h-64 w-64 rounded-full bg-ca-red/8 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-ca-teal/8 blur-3xl" />

      <div className="relative z-10 flex h-full min-h-0 flex-col gap-3 pt-2">
        <section className="relative shrink-0 overflow-hidden rounded-[14px] border border-white/8 bg-[linear-gradient(135deg,rgba(20,19,28,0.96),rgba(11,11,17,0.92))] p-3 shadow-[0_20px_44px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:p-4">
          <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-ca-red/8 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-ca-teal/8 blur-3xl" />
          <div className="relative grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="rounded-[12px] border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-4">
              {selectedEntry && selectedAbility ? (
                <SelectedFighterPanel
                  entry={selectedEntry}
                  selectedAbility={selectedAbility}
                  selectedAbilityId={selectedAbilityId}
                  onSelectAbility={setSelectedAbilityId}
                />
              ) : null}
            </div>

            <div className="flex h-full flex-col rounded-[12px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,14,20,0.88),rgba(10,10,16,0.78))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_28px_rgba(0,0,0,0.14)]">
                <div className="flex items-center justify-between gap-2">
                  <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Queue Mode</p>
                  <span className="ca-mono-label rounded-md border border-white/10 px-2 py-1 text-[0.38rem] text-ca-text-3">
                    {getModeLabel(matchMode)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {battleMatchModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMatchMode(mode)}
                      className={[
                        'ca-display rounded-md border px-1.5 py-2.5 text-[0.82rem] leading-none transition',
                        matchMode === mode
                          ? 'border-ca-red/35 bg-ca-red-wash text-ca-text shadow-[0_0_0_1px_rgba(250,39,66,0.12)]'
                          : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2 hover:border-white/18',
                      ].join(' ')}
                    >
                      {getModeLabel(mode)}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleEnterArena}
                  disabled={!isReady}
                  className="ca-display mt-4 w-full rounded-xl border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.96),rgba(186,17,41,0.94))] px-3 py-3 text-[1.18rem] text-white shadow-[0_12px_26px_rgba(250,39,66,0.18)] transition enabled:hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-[rgba(30,30,36,0.6)] disabled:text-ca-text-disabled"
                >
                  {getModeButtonLabel(matchMode)}
                </button>
              </div>

              <div className="mt-3 flex-1 rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,16,24,0.88),rgba(10,10,16,0.76))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_28px_rgba(0,0,0,0.12)]">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Battle Record</p>
                <div className="mt-3 rounded-[12px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="ca-display text-[2.15rem] leading-none text-ca-text">{profileStats.rank}</p>
                  <p className="ca-mono-label mt-2 text-[0.4rem] text-ca-text-3">Current Ladder Placement</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <RecordStat label="Wins" value={String(profileStats.wins)} />
                  <RecordStat label="Losses" value={String(profileStats.losses)} />
                  <RecordStat label="Win %" value={`${winRate}%`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-hidden rounded-[12px] border border-white/8 bg-[linear-gradient(135deg,rgba(18,18,26,0.9),rgba(12,12,18,0.84))] p-3 shadow-[0_16px_34px_rgba(0,0,0,0.16)] backdrop-blur-sm sm:p-4">
          <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_15.5rem]">
            <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <input
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search fighter, role, passive"
                    className="w-full max-w-md rounded-[10px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2.5 text-sm text-ca-text outline-none transition placeholder:text-ca-text-3 focus:border-ca-teal/35"
                  />
                  <div className="flex items-center gap-2">
                    <label className="ca-mono-label text-[0.44rem] text-ca-text-3" htmlFor="prep-role">
                      Role
                    </label>
                    <select
                      id="prep-role"
                      value={roleFilter}
                      onChange={(event) => setRoleFilter(event.target.value as PrepRoleFilter)}
                      className="ca-mono-label rounded-md border border-white/10 bg-[rgba(15,15,21,0.5)] px-2 py-1.5 text-[0.46rem] text-ca-text outline-none transition focus:border-ca-teal/35"
                    >
                      {roleOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="ca-mono-label text-[0.44rem] text-ca-text-3" htmlFor="prep-sort">
                      Sort
                    </label>
                    <select
                      id="prep-sort"
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as PrepSortKey)}
                      className="ca-mono-label rounded-md border border-white/10 bg-[rgba(15,15,21,0.5)] px-2 py-1.5 text-[0.46rem] text-ca-text outline-none transition focus:border-ca-teal/35"
                    >
                      {sortOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="ca-mono-label text-[0.46rem] text-ca-text-3">{visibleRoster.length} AVAILABLE</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain">
                <div className="grid auto-rows-max content-start grid-cols-5 gap-1.5 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-8 2xl:grid-cols-8">
                  {visibleRoster.map((entry) => (
                    <RosterTile
                      key={entry.id}
                      entry={entry}
                      active={selectedRosterId === entry.id}
                      inTeam={teamIds.includes(entry.id)}
                      onClick={() => handleAssignCharacter(entry.id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <aside className="flex h-full min-h-0 flex-col rounded-[10px] border border-white/8 bg-[rgba(12,12,18,0.68)] p-3">
              <div className="shrink-0">
                <p className="ca-mono-label text-[0.48rem] text-ca-text-3">Your Team</p>
                <h2 className="ca-display mt-1.5 text-[2rem] leading-none text-ca-text">3 Slots</h2>
              </div>

              <div className="mt-3 space-y-2">
                {teamEntries.map((entry, index) => (
                  <TeamSlotCard
                    key={`prep-slot-${index}`}
                    slotIndex={index}
                    entry={entry}
                    focused={focusedSlot === index}
                    onSelect={() => handleSelectSlot(index)}
                    onClear={() => handleClearSlot(index)}
                  />
                ))}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </section>
  )
}

function RecordStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-white/8 bg-[rgba(255,255,255,0.035)] px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="ca-mono-label text-[0.36rem] text-ca-text-3">{label}</p>
      <p className="ca-display mt-1.5 text-[1.1rem] leading-none text-ca-text">{value}</p>
    </div>
  )
}

function SelectedFighterPanel({
  entry,
  selectedAbility,
  selectedAbilityId,
  onSelectAbility,
}: {
  entry: BattlePrepRosterEntry
  selectedAbility: BattleAbilityTemplate
  selectedAbilityId: string | null
  onSelectAbility: (abilityId: string) => void
}) {
  const abilities = entry.battleTemplate.abilities.concat(entry.battleTemplate.ultimate)
  const style = rarityStyles[entry.rarity]

  return (
    <div className="grid h-full items-start gap-6 sm:grid-cols-[10rem_minmax(0,1fr)] xl:grid-cols-[10.75rem_minmax(0,1fr)]">
      <div className="relative inline-flex rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_34px_rgba(0,0,0,0.18)]">
        <div
          className="pointer-events-none absolute inset-3 rounded-[14px] blur-2xl"
          style={{ background: `radial-gradient(circle at 35% 25%, ${style.wash}, transparent 72%)` }}
        />
        <div className="pointer-events-none absolute inset-[11px] rounded-[15px] border border-white/6" />
        <div className="relative overflow-hidden rounded-[14px]">
          <PortraitThumb entry={entry} sizeClass="h-36 w-36 sm:h-40 sm:w-40 xl:h-[10.25rem] xl:w-[10.25rem]" />
        </div>
      </div>

      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-[16px] border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div
            className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full blur-3xl"
            style={{ background: `radial-gradient(circle, ${style.wash}, transparent 72%)` }}
          />
          <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="ca-mono-label rounded-md border px-2 py-1 text-[0.42rem]"
                  style={{ borderColor: style.border, background: style.wash, color: style.text }}
                >
                  {entry.gradeLabel}
                </span>
                <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.42rem] text-ca-text-3">
                  {entry.role}
                </span>
              </div>

              <h2 className="ca-display mt-3 text-[2.65rem] leading-[0.86] text-ca-text sm:text-[3.05rem]">{entry.name}</h2>
              <div className="mt-3 h-[3px] w-28 rounded-full" style={{ background: style.text, boxShadow: `0 0 18px ${style.wash}` }} />
              <p className="mt-3 max-w-2xl text-[1rem] leading-6 text-ca-text-2">{entry.passiveLabel}</p>
            </div>

            <div className="rounded-[14px] border border-white/8 bg-[rgba(7,7,12,0.34)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="ca-mono-label text-[0.38rem] text-ca-text-3">Technique Loadout</p>
                <span className="ca-mono-label text-[0.36rem] text-ca-text-3">4 SKILLS</span>
              </div>
              <div className="flex flex-wrap gap-2.5 xl:justify-end">
                {abilities.map((ability) => {
                  const active = selectedAbilityId === ability.id
                  return (
                    <button
                      key={ability.id}
                      type="button"
                      onClick={() => onSelectAbility(ability.id)}
                      className={[
                        'group relative h-[4.45rem] w-[4.45rem] overflow-hidden rounded-[12px] border transition duration-200',
                        active
                          ? 'border-ca-red/40 shadow-[0_0_0_1px_rgba(250,39,66,0.18),0_12px_24px_rgba(250,39,66,0.12)]'
                          : 'border-white/10 bg-[rgba(255,255,255,0.03)] hover:border-white/18 hover:-translate-y-[1px]',
                      ].join(' ')}
                      aria-label={ability.name}
                    >
                      {ability.icon.src ? (
                        <img src={ability.icon.src} alt={ability.name} className="absolute inset-0 h-full w-full object-cover transition duration-200 group-hover:scale-[1.04]" />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))]">
                          <span className="ca-mono-label text-[0.62rem] text-ca-text-2">{ability.icon.label}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.22))]" />
                      {active ? (
                        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-ca-red shadow-[0_0_12px_rgba(250,39,66,0.45)]" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-[16px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,13,19,0.9),rgba(9,9,14,0.78))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_28px_rgba(0,0,0,0.16)]">
          <div
            className="pointer-events-none absolute left-0 top-0 h-full w-1"
            style={{ background: `linear-gradient(180deg, ${style.text}, rgba(255,255,255,0))` }}
          />
          <div
            className="pointer-events-none absolute -left-12 top-0 h-40 w-40 rounded-full blur-3xl"
            style={{ background: `radial-gradient(circle, ${style.wash}, transparent 72%)` }}
          />
          <div className="relative grid gap-4 md:grid-cols-[6.5rem_minmax(0,1fr)] md:items-start">
            <div className="overflow-hidden rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.04)] shadow-[0_12px_22px_rgba(0,0,0,0.18)]">
              {selectedAbility.icon.src ? (
                <img src={selectedAbility.icon.src} alt={selectedAbility.name} className="h-[6.5rem] w-[6.5rem] object-cover" />
              ) : (
                <div className="grid h-[6.5rem] w-[6.5rem] place-items-center bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))]">
                  <span className="ca-mono-label text-[0.7rem] text-ca-text-2">{selectedAbility.icon.label}</span>
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="ca-mono-label text-[0.38rem] text-ca-text-3">Active Technique</p>
                  <p className="mt-2 font-[var(--font-display-alt)] text-[1.42rem] font-bold text-ca-text sm:text-[1.58rem]">{selectedAbility.name}</p>
                  <p className="mt-2 max-w-3xl text-[0.98rem] leading-6 text-ca-text-2">{selectedAbility.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAbility.tags.includes('ULT') ? (
                    <span className="ca-mono-label rounded-md border border-amber-400/22 bg-amber-400/10 px-2 py-1 text-[0.4rem] text-amber-300">
                      ULT
                    </span>
                  ) : null}
                  <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.42rem] text-ca-text-3">
                    CD {selectedAbility.cooldown || '-'}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <MetaPill label="Cost">
                  <EnergyCostRow cost={getAbilityEnergyCost(selectedAbility)} compact />
                </MetaPill>
                <MetaPill label="Target">
                  <span className="ca-mono-label text-[0.48rem] text-ca-text-2">{getTargetLabel(selectedAbility)}</span>
                </MetaPill>
                <MetaPill label="Classes">
                  <span className="ca-mono-label text-[0.48rem] text-ca-text-2">{formatAbilityClasses(selectedAbility)}</span>
                </MetaPill>
                <MetaPill label="Cooldown">
                  <span className="ca-mono-label text-[0.48rem] text-ca-text-2">{selectedAbility.cooldown || 'NONE'}</span>
                </MetaPill>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RosterTile({
  entry,
  active,
  inTeam,
  onClick,
}: {
  entry: BattlePrepRosterEntry
  active: boolean
  inTeam: boolean
  onClick: () => void
}) {
  const style = rarityStyles[entry.rarity]

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-[8px] border bg-[rgba(18,18,26,0.72)] text-left transition duration-200 hover:-translate-y-[1px]"
      style={{
        borderColor: active ? style.border : 'rgba(228,230,239,0.1)',
        boxShadow: active ? `0 0 0 1px ${style.border}` : 'none',
      }}
    >
      <PortraitThumb entry={entry} sizeClass="aspect-square w-full" labelClass="text-[0.3rem]" bordered={false} />
      {inTeam ? (
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-ca-teal/25 bg-ca-teal shadow-[0_0_10px_rgba(5,216,189,0.28)]" />
      ) : null}
    </button>
  )
}

function TeamSlotCard({
  slotIndex,
  entry,
  focused,
  onSelect,
  onClear,
}: {
  slotIndex: number
  entry: BattlePrepRosterEntry | null
  focused: boolean
  onSelect: () => void
  onClear: () => void
}) {
  const label = `SLOT ${slotIndex + 1}`

  if (!entry) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={[
          'w-full rounded-[10px] border border-dashed bg-[rgba(255,255,255,0.02)] px-3 py-3 text-left transition',
          focused ? 'border-ca-teal/35' : 'border-white/10 hover:border-white/18',
        ].join(' ')}
      >
        <p className="ca-mono-label text-[0.4rem] text-ca-text-3">{label}</p>
        <p className="ca-display mt-1.5 text-[1.32rem] leading-none text-ca-text-disabled">Empty</p>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full rounded-[10px] border bg-[rgba(255,255,255,0.03)] px-2.5 py-2.5 text-left transition',
        focused ? 'border-ca-teal/35 shadow-[0_0_0_1px_rgba(5,216,189,0.16)]' : 'border-white/10 hover:border-white/18',
      ].join(' ')}
    >
      <div className="grid grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-2.5">
        <PortraitThumb entry={entry} sizeClass="h-[3rem] w-[2.6rem]" labelClass="text-[0.3rem]" bordered={false} />
        <div className="min-w-0">
          <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</p>
          <p className="ca-display mt-1 text-[1.08rem] leading-none text-ca-text">{entry.battleTemplate.shortName}</p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClear()
          }}
          className="grid h-7 w-7 place-items-center rounded-md border border-white/10 text-[0.72rem] text-ca-text-3 transition hover:border-white/18 hover:text-ca-text"
          aria-label="Clear slot"
        >
          X
        </button>
      </div>
    </button>
  )
}

function MetaPill({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</p>
      <div className="mt-2 min-h-[1rem]">{children}</div>
    </div>
  )
}













