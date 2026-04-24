import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { getTargetLabel } from '@/components/battle/battleDisplay'
import { getAbilityEnergyCost } from '@/features/battle/energy'
import {
  battlePrepRoster,
  battlePrepRosterById,
  persistPrepSelection,
  readPrepSelection,
  sanitizePrepTeamIds,
  stageBattleLaunch,
  type BattlePrepRosterEntry,
} from '@/features/battle/prep'
import type { BattleAbilityTemplate } from '@/features/battle/types'
import {
  battleMatchModes,
  createPracticeSession,
  getModeButtonLabel,
  getModeLabel,
  persistSelectedMatchMode,
  persistStagedBattleSession,
  readBattleProfileStats,
  readSelectedMatchMode,
  type BattleMatchMode,
} from '@/features/battle/matches'
import { createInitialBattleState } from '@/features/battle/engine'
import { createBattleSeed } from '@/features/battle/random'
import {
  searchPlayersByName,
  createChallenge,
  acceptChallenge,
  declineChallenge,
  subscribeToIncomingChallenges,
  joinMatchmakingQueue,
  leaveMatchmakingQueue,
  findAndCreateQueuedMatch,
  fetchActiveMatch,
  type ProfileSearchResult,
} from '@/features/multiplayer/client'
import type { MatchRow } from '@/features/multiplayer/types'
import { useAuth } from '@/features/auth/useAuth'
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
  return getSelectableAbilities(entry)[0]?.id ?? null
}

function formatAbilityClasses(ability: BattleAbilityTemplate) {
  const classes = [ability.kind.toUpperCase(), ...ability.classes]
  return Array.from(new Set(classes)).join(', ')
}

function getSelectableAbilities(entry: BattlePrepRosterEntry | null): BattleAbilityTemplate[] {
  if (!entry) return []
  return entry.battleTemplate.abilities
    .concat(entry.battleTemplate.ultimate)
    .filter((ability) => ability.kind !== 'pass')
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
          <img
            src={entry.battleTemplate.boardPortraitSrc}
            alt={entry.name}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-center"
            style={{
              opacity: entry.battleTemplate.boardPortraitFrame?.opacity ?? 1,
            }}
            draggable={false}
          />
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
  const { user, profile: authProfile } = useAuth()
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

  // ── Practice mode state ──────────────────────────────────────────────────
  const [practiceAiEnabled, setPracticeAiEnabled] = useState(true)
  const [practiceEnemyIds, setPracticeEnemyIds] = useState<Array<string | null>>(() => {
    const defaults = battlePrepRoster.slice(3, 6).map((e) => e.id)
    return [defaults[0] ?? null, defaults[1] ?? null, defaults[2] ?? null]
  })

  // ── Multiplayer private match state ─────────────────────────────────────
  const [privateOpen, setPrivateOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [selectedOpponent, setSelectedOpponent] = useState<ProfileSearchResult | null>(null)
  const [incomingChallenge, setIncomingChallenge] = useState<MatchRow | null>(null)
  const [mpError, setMpError] = useState<string | null>(null)
  const [mpLoading, setMpLoading] = useState(false)
  const visibleSearchResults = searchQuery.trim() ? searchResults : []

  // ── Matchmaking queue state (ranked / quick) ─────────────────────────────
  const [searching, setSearching] = useState(false)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [aiFallback, setAiFallback] = useState(false)
  const searchingRef = useRef(false)
  const searchAttemptsRef = useRef(0)

  // Timeout before falling back to AI: quick = 3 s, ranked = 45 s
  const POLL_INTERVAL_MS = 2_500
  const AI_FALLBACK_MS: Record<string, number> = { quick: 3_000, ranked: 45_000 }

  // Search debounce
  useEffect(() => {
    if (!searchQuery.trim()) return
    const t = window.setTimeout(async () => {
      const { data } = await searchPlayersByName(searchQuery, user?.id)
      setSearchResults(data)
    }, 300)
    return () => window.clearTimeout(t)
  }, [searchQuery, user?.id])

  // Listen for incoming challenges
  useEffect(() => {
    if (!user) return
    return subscribeToIncomingChallenges(user.id, (row) => {
      setIncomingChallenge(row)
    })
  }, [user])

  useEffect(() => {
    persistPrepSelection(teamIds)
  }, [teamIds])

  useEffect(() => {
    persistSelectedMatchMode(matchMode)
  }, [matchMode])

  // Leave the queue if the user navigates away while searching
  useEffect(() => {
    return () => {
      if (searchingRef.current && user) {
        searchingRef.current = false
        leaveMatchmakingQueue(user.id).catch(() => {})
      }
    }
  }, [user])

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
  useEffect(() => {
    if (!selectedEntry) return
    const abilityIds = getSelectableAbilities(selectedEntry)
      .map((ability) => ability.id)
    if (abilityIds.length === 0) return
    if (selectedAbilityId && abilityIds.includes(selectedAbilityId)) return
    setSelectedAbilityId(abilityIds[0])
  }, [selectedEntry, selectedAbilityId])

  const selectedAbility = selectedEntry
    ? getSelectableAbilities(selectedEntry).find((ability) => ability.id === selectedAbilityId) ??
      getSelectableAbilities(selectedEntry)[0] ??
      null
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

  async function handleEnterArena() {
    if (!isReady) return

    if (matchMode === 'practice') {
      const sanitized = sanitizePrepTeamIds(teamIds)
      const enemyIds = sanitizePrepTeamIds(practiceEnemyIds)
      const session = createPracticeSession(sanitized, { aiEnabled: practiceAiEnabled, enemyTeamIds: enemyIds })
      persistStagedBattleSession(session)
      navigate('/battle')
      return
    }

    if (matchMode === 'private') {
      setPrivateOpen(true)
      setMpError(null)
      setSearchQuery('')
      setSelectedOpponent(null)
      return
    }

    // Ranked / Quick — requires auth; join the matchmaking queue
    if (!user) {
      stageBattleLaunch(teamIds, matchMode)
      navigate('/battle')
      return
    }

    const sanitized = sanitizePrepTeamIds(teamIds)
    const displayName = authProfile?.display_name ?? 'Player'
    const lp = profileStats.lpCurrent

    setSearching(true)
    setQueueError(null)

    const { error: qErr } = await joinMatchmakingQueue({ playerId: user.id, mode: matchMode, teamIds: sanitized, displayName, lp })
    if (qErr) {
      setSearching(false)
      setQueueError(qErr)
      return
    }

    searchingRef.current = true
    searchAttemptsRef.current = 0
    setAiFallback(false)
    void pollForMatch({ playerId: user.id, mode: matchMode, teamIds: sanitized, displayName })
  }

  async function pollForMatch({
    playerId, mode, teamIds: sanitized, displayName,
  }: { playerId: string; mode: BattleMatchMode; teamIds: string[]; displayName: string }) {
    if (!searchingRef.current) return

    // Check if we've already been matched as Player B
    const { data: activeMatch } = await fetchActiveMatch(playerId)
    if (activeMatch) {
      searchingRef.current = false
      setSearching(false)
      navigate(`/battle/${activeMatch.id}`)
      return
    }

    // Try to be Player A and create a match with the oldest queued opponent
    const seed = createBattleSeed(mode, sanitized)
    const { data: match, error } = await findAndCreateQueuedMatch({
      playerId, mode, teamIds: sanitized, displayName, seed,
      buildInitialState: (playerATeam, playerBTeam, matchSeed) =>
        createInitialBattleState({ playerTeamIds: playerATeam, enemyTeamIds: playerBTeam, battleSeed: matchSeed }),
    })

    if (error) {
      searchingRef.current = false
      setSearching(false)
      setQueueError(error)
      return
    }

    if (match) {
      searchingRef.current = false
      setSearching(false)
      navigate(`/battle/${match.id}`)
      return
    }

    // No opponent yet — check timeout then retry
    if (searchingRef.current) {
      const attempts = searchAttemptsRef.current + 1
      searchAttemptsRef.current = attempts
      const limit = AI_FALLBACK_MS[mode] ?? 30_000

      if (attempts * POLL_INTERVAL_MS >= limit) {
        // Timeout — fall back to an AI match
        searchingRef.current = false
        setAiFallback(true)
        leaveMatchmakingQueue(playerId).catch(() => {})
        window.setTimeout(() => {
          setSearching(false)
          setAiFallback(false)
          stageBattleLaunch(sanitized, mode)
          navigate('/battle')
        }, 1200)
        return
      }

      window.setTimeout(() => {
        void pollForMatch({ playerId, mode, teamIds: sanitized, displayName })
      }, POLL_INTERVAL_MS)
    }
  }

  async function handleCancelSearch() {
    searchingRef.current = false
    setSearching(false)
    setQueueError(null)
    setAiFallback(false)
    if (user) await leaveMatchmakingQueue(user.id)
  }

  async function handleSendChallenge() {
    if (!selectedOpponent || !isReady || !user) return
    setMpLoading(true)
    setMpError(null)

    const sanitized = sanitizePrepTeamIds(teamIds)
    const seed = createBattleSeed('private', sanitized)
    const displayName = authProfile?.display_name ?? 'Player'

    const { data, error } = await createChallenge({
      playerAId: user.id,
      playerADisplayName: displayName,
      playerBId: selectedOpponent.id,
      playerBDisplayName: selectedOpponent.display_name ?? '',
      teamIds: sanitized,
      seed,
    })

    setMpLoading(false)

    if (error || !data) {
      setMpError(error ?? 'Failed to send challenge.')
      return
    }

    // Navigate to the battle page — WaitingForOpponentOverlay shows until they accept
    navigate(`/battle/${data.id}`)
  }

  async function handleAcceptChallenge() {
    if (!incomingChallenge || !isReady || !user) return
    setMpLoading(true)
    setMpError(null)

    const sanitized = sanitizePrepTeamIds(teamIds)
    const displayName = authProfile?.display_name ?? 'Player'

    const { data, error } = await acceptChallenge({
      matchId: incomingChallenge.id,
      displayName,
      teamIds: sanitized,
      buildInitialState: (playerATeam, playerBTeam, seed) =>
        createInitialBattleState({ playerTeamIds: playerATeam, enemyTeamIds: playerBTeam, battleSeed: seed }),
    })

    setMpLoading(false)

    if (error || !data) {
      setMpError(error ?? 'Failed to accept challenge.')
      return
    }

    navigate(`/battle/${data.id}`)
  }

  async function handleDeclineChallenge() {
    if (!incomingChallenge) return
    await declineChallenge(incomingChallenge.id)
    setIncomingChallenge(null)
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
                  key={selectedEntry.id}
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
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {battleMatchModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMatchMode(mode)}
                      className={[
                        'ca-display rounded-md border px-1.5 py-2.5 text-[0.82rem] leading-none transition duration-150 active:scale-[0.96]',
                        matchMode === mode
                          ? mode === 'practice'
                            ? 'border-ca-teal/35 bg-ca-teal-wash text-ca-teal shadow-[0_0_0_1px_rgba(5,216,189,0.12)]'
                            : 'border-ca-red/35 bg-ca-red-wash text-ca-text shadow-[0_0_0_1px_rgba(250,39,66,0.12)]'
                          : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2 hover:border-white/18',
                      ].join(' ')}
                    >
                      {getModeLabel(mode)}
                    </button>
                  ))}
                </div>

                {matchMode === 'practice' ? (
                  <PracticePanel
                    aiEnabled={practiceAiEnabled}
                    enemyIds={practiceEnemyIds}
                    isReady={isReady}
                    onToggleAi={() => setPracticeAiEnabled((v) => !v)}
                    onSetEnemyIds={setPracticeEnemyIds}
                    onStart={handleEnterArena}
                  />
                ) : searching ? (
                  <SearchingPanel
                    mode={matchMode}
                    error={queueError}
                    aiFallback={aiFallback}
                    onCancel={handleCancelSearch}
                  />
                ) : !privateOpen || matchMode !== 'private' ? (
                  <button
                    type="button"
                    onClick={handleEnterArena}
                    disabled={!isReady}
                    className="ca-display mt-4 w-full rounded-xl border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.96),rgba(186,17,41,0.94))] px-3 py-3 text-[1.18rem] text-white shadow-[0_12px_26px_rgba(250,39,66,0.18)] transition duration-150 enabled:hover:-translate-y-[1px] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-[rgba(30,30,36,0.6)] disabled:text-ca-text-disabled"
                  >
                    {getModeButtonLabel(matchMode)}
                  </button>
                ) : (
                  <ChallengePanel
                    searchQuery={searchQuery}
                    searchResults={visibleSearchResults}
                    selectedOpponent={selectedOpponent}
                    loading={mpLoading}
                    error={mpError}
                    isReady={isReady}
                    isLoggedIn={Boolean(user)}
                    onSearchChange={(v) => { setSearchQuery(v); setSelectedOpponent(null) }}
                    onSelectOpponent={setSelectedOpponent}
                    onChallenge={handleSendChallenge}
                    onCancel={() => { setPrivateOpen(false); setMpError(null); setSearchQuery(''); setSelectedOpponent(null) }}
                  />
                )}

                {incomingChallenge && (
                  <IncomingChallengeBar
                    challengerName={incomingChallenge.player_a_display_name}
                    loading={mpLoading}
                    isReady={isReady}
                    onAccept={handleAcceptChallenge}
                    onDecline={handleDeclineChallenge}
                  />
                )}
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
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 xl:grid-cols-[minmax(0,1fr)_15.5rem] xl:grid-rows-1">
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

            <aside className="flex min-h-0 shrink-0 flex-col rounded-[10px] border border-white/8 bg-[rgba(12,12,18,0.68)] p-3 xl:h-full">
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

// ── Practice panel ────────────────────────────────────────────────────────────

function PracticePanel({
  aiEnabled,
  enemyIds,
  isReady,
  onToggleAi,
  onSetEnemyIds,
  onStart,
}: {
  aiEnabled: boolean
  enemyIds: Array<string | null>
  isReady: boolean
  onToggleAi: () => void
  onSetEnemyIds: (ids: Array<string | null>) => void
  onStart: () => void
}) {
  return (
    <div className="mt-3 space-y-2">
      {/* AI toggle */}
      <div className="flex items-center justify-between rounded-[0.3rem] border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-2">
        <div>
          <p className="ca-display text-[0.78rem] leading-none text-ca-text">Enemy AI</p>
          <p className="mt-0.5 ca-mono-label text-[0.42rem] text-ca-text-3">
            {aiEnabled ? 'AI will play skills normally' : 'Enemy passes every turn — freeze-frame mode'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleAi}
          className={[
            'relative h-5 w-9 shrink-0 rounded-full border transition',
            aiEnabled
              ? 'border-ca-teal/50 bg-ca-teal/20'
              : 'border-white/15 bg-[rgba(255,255,255,0.05)]',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-0.5 h-4 w-4 rounded-full transition-all duration-200',
              aiEnabled ? 'left-[calc(100%-1.1rem)] bg-ca-teal' : 'left-0.5 bg-white/30',
            ].join(' ')}
          />
        </button>
      </div>

      {/* Enemy team picker */}
      <div className="rounded-[0.3rem] border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-2">
        <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Enemy Team</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {([0, 1, 2] as const).map((slot) => {
            const id = enemyIds[slot] ?? null
            const entry = id ? battlePrepRosterById[id] ?? null : null
            return (
              <div key={slot} className="relative">
                <select
                  value={id ?? ''}
                  onChange={(e) => {
                    const next = [...enemyIds]
                    next[slot] = e.target.value || null
                    onSetEnemyIds(next)
                  }}
                  className="w-full rounded-[0.25rem] border border-white/12 bg-[rgba(14,14,20,0.9)] px-2 py-1.5 ca-mono-label text-[0.48rem] text-ca-text-2 outline-none transition focus:border-ca-teal/40"
                >
                  <option value="">— Empty —</option>
                  {battlePrepRoster.map((r) => (
                    <option key={r.id} value={r.id}>{r.battleTemplate.shortName}</option>
                  ))}
                </select>
                {entry ? (
                  <p className="mt-0.5 truncate ca-mono-label text-[0.38rem] text-ca-text-3">{entry.role}</p>
                ) : (
                  <p className="mt-0.5 ca-mono-label text-[0.38rem] text-ca-text-3/50">Slot {slot + 1}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={!isReady}
        className="ca-display w-full rounded-xl border border-ca-teal/40 bg-[linear-gradient(180deg,rgba(5,216,189,0.22),rgba(5,216,189,0.1))] px-3 py-3 text-[1.18rem] text-ca-teal shadow-[0_8px_20px_rgba(5,216,189,0.1)] transition duration-150 enabled:hover:-translate-y-[1px] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-[rgba(30,30,36,0.6)] disabled:text-ca-text-disabled"
      >
        Start Practice
      </button>
    </div>
  )
}

// ── Challenge panel (username search) ────────────────────────────────────────

function ChallengePanel({
  searchQuery,
  searchResults,
  selectedOpponent,
  loading,
  error,
  isReady,
  isLoggedIn,
  onSearchChange,
  onSelectOpponent,
  onChallenge,
  onCancel,
}: {
  searchQuery: string
  searchResults: ProfileSearchResult[]
  selectedOpponent: ProfileSearchResult | null
  loading: boolean
  error: string | null
  isReady: boolean
  isLoggedIn: boolean
  onSearchChange: (v: string) => void
  onSelectOpponent: (p: ProfileSearchResult) => void
  onChallenge: () => void
  onCancel: () => void
}) {
  if (!isLoggedIn) {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-3 text-center">
        <p className="text-xs text-ca-text-2">Sign in to challenge a player.</p>
      </div>
    )
  }

  const canChallenge = Boolean(selectedOpponent) && isReady && !loading

  return (
    <div className="mt-4 space-y-2">
      <p className="ca-mono-label text-[0.42rem] text-ca-text-3">CHALLENGE A PLAYER</p>

      <input
        type="text"
        value={selectedOpponent ? selectedOpponent.display_name ?? '' : searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by username…"
        className="w-full rounded-[10px] border border-white/12 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition placeholder:text-ca-text-3 focus:border-ca-teal/35"
      />

      {/* Search results dropdown */}
      {searchResults.length > 0 && !selectedOpponent && (
        <div className="rounded-[10px] border border-white/10 bg-[rgba(14,14,22,0.96)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] animate-ca-slide-up">
          {searchResults.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onSelectOpponent(result)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ca-text transition hover:bg-white/8"
            >
              <span className="ca-display text-[0.85rem]">{result.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {selectedOpponent && (
        <p className="ca-mono-label text-[0.42rem] text-ca-teal">
          ✓ {selectedOpponent.display_name} selected
        </p>
      )}

      <button
        type="button"
        onClick={onChallenge}
        disabled={!canChallenge}
        className="ca-display w-full rounded-xl border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.96),rgba(186,17,41,0.94))] px-3 py-2.5 text-[1rem] text-white transition enabled:hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-[rgba(30,30,36,0.6)] disabled:text-ca-text-disabled"
      >
        {loading ? 'Sending…' : 'Send Challenge'}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="ca-mono-label w-full text-center text-[0.44rem] text-ca-text-3 transition hover:text-ca-text-2"
      >
        CANCEL
      </button>

      {error && <p className="ca-mono-label text-center text-[0.44rem] text-ca-red">{error}</p>}
    </div>
  )
}

// ── Incoming challenge banner ─────────────────────────────────────────────────

function IncomingChallengeBar({
  challengerName,
  loading,
  isReady,
  onAccept,
  onDecline,
}: {
  challengerName: string
  loading: boolean
  isReady: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <div className="mt-3 rounded-xl border border-ca-teal/25 bg-ca-teal-wash px-3 py-3">
      <p className="ca-mono-label text-[0.42rem] text-ca-teal">INCOMING CHALLENGE</p>
      <p className="mt-1 text-sm text-ca-text">
        <span className="ca-display">{challengerName}</span> wants to battle.
      </p>
      {!isReady && (
        <p className="ca-mono-label mt-1 text-[0.4rem] text-ca-text-3">Select your team to accept.</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={!isReady || loading}
          className="ca-display flex-1 rounded-lg border border-ca-teal/30 bg-ca-teal-wash px-2 py-2 text-[0.85rem] text-ca-teal transition enabled:hover:bg-ca-teal/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Accepting…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={loading}
          className="ca-display flex-1 rounded-lg border border-white/10 bg-[rgba(255,255,255,0.04)] px-2 py-2 text-[0.85rem] text-ca-text-2 transition enabled:hover:bg-white/8"
        >
          Decline
        </button>
      </div>
    </div>
  )
}

function SearchingPanel({
  mode,
  error,
  aiFallback,
  onCancel,
}: {
  mode: BattleMatchMode
  error: string | null
  aiFallback: boolean
  onCancel: () => void
}) {
  return (
    <div className={[
      'mt-4 rounded-[10px] border p-3 transition-colors',
      aiFallback
        ? 'border-amber-500/30 bg-amber-500/8'
        : 'border-ca-teal/22 bg-ca-teal-wash',
    ].join(' ')}>
      <div className="flex items-center gap-2">
        <span className={[
          'inline-block h-2 w-2 animate-pulse rounded-full',
          aiFallback ? 'bg-amber-400' : 'bg-ca-teal',
        ].join(' ')} />
        <p className={[
          'ca-mono-label text-[0.48rem]',
          aiFallback ? 'text-amber-400' : 'text-ca-teal',
        ].join(' ')}>
          {aiFallback
            ? 'NO OPPONENT FOUND — LAUNCHING AI MATCH…'
            : `SEARCHING FOR ${getModeLabel(mode).toUpperCase()} MATCH…`}
        </p>
      </div>
      <p className="ca-mono-label mt-1.5 text-[0.42rem] text-ca-text-3">
        {aiFallback
          ? 'No real opponents were available. Starting an AI battle instead.'
          : 'You\'ll be matched automatically when an opponent is found.'}
      </p>
      {error && (
        <p className="ca-mono-label mt-2 text-[0.42rem] text-ca-red">{error}</p>
      )}
      {!aiFallback && (
        <button
          type="button"
          onClick={onCancel}
          className="ca-mono-label mt-3 w-full rounded-lg border border-white/12 bg-[rgba(30,30,36,0.72)] px-3 py-2 text-[0.46rem] text-ca-text-2 transition hover:text-ca-text"
        >
          CANCEL SEARCH
        </button>
      )}
    </div>
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
  const abilities = getSelectableAbilities(entry)
  const style = rarityStyles[entry.rarity]

  return (
    <div className="grid h-full items-start gap-6 sm:grid-cols-[10rem_minmax(0,1fr)] xl:grid-cols-[10.75rem_minmax(0,1fr)] animate-ca-fade-in">
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

        <div className="relative mt-4 h-[18.5rem] overflow-hidden rounded-[16px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,13,19,0.9),rgba(9,9,14,0.78))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_28px_rgba(0,0,0,0.16)]">
          <div
            className="pointer-events-none absolute left-0 top-0 h-full w-1"
            style={{ background: `linear-gradient(180deg, ${style.text}, rgba(255,255,255,0))` }}
          />
          <div
            className="pointer-events-none absolute -left-12 top-0 h-40 w-40 rounded-full blur-3xl"
            style={{ background: `radial-gradient(circle, ${style.wash}, transparent 72%)` }}
          />
          <div className="relative grid h-full min-h-0 gap-4 md:grid-cols-[6.5rem_minmax(0,1fr)] md:items-start">
            <div className="overflow-hidden rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.04)] shadow-[0_12px_22px_rgba(0,0,0,0.18)]">
              {selectedAbility.icon.src ? (
                <img src={selectedAbility.icon.src} alt={selectedAbility.name} className="h-[6.5rem] w-[6.5rem] object-cover" />
              ) : (
                <div className="grid h-[6.5rem] w-[6.5rem] place-items-center bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))]">
                  <span className="ca-mono-label text-[0.7rem] text-ca-text-2">{selectedAbility.icon.label}</span>
                </div>
              )}
            </div>

            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="ca-mono-label text-[0.38rem] text-ca-text-3">Active Technique</p>
                  <p className="mt-2 font-[var(--font-display-alt)] text-[1.42rem] font-bold text-ca-text sm:text-[1.58rem]">{selectedAbility.name}</p>
                  <p className="mt-2 max-h-[7.25rem] max-w-3xl overflow-y-auto pr-1 text-[0.98rem] leading-6 text-ca-text-2">
                    {selectedAbility.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAbility.classes.includes('Ultimate') ? (
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
      className="group relative overflow-hidden rounded-[8px] border bg-[rgba(18,18,26,0.72)] text-left transition duration-150 hover:-translate-y-[1px] active:scale-[0.94]"
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
          'w-full rounded-[10px] border border-dashed bg-[rgba(255,255,255,0.02)] px-3 py-3 text-left transition duration-150',
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
        'w-full rounded-[10px] border bg-[rgba(255,255,255,0.03)] px-2.5 py-2.5 text-left transition duration-150',
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













