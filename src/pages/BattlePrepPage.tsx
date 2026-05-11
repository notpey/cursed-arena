import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { playSoundEffect, setVolumesFromSettings } from '@/features/audio/audioManager'
import { useNavigate } from 'react-router-dom'
import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { getTargetLabel } from '@/components/battle/battleDisplay'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import { getAbilityEnergyCost } from '@/features/battle/energy'
import {
  persistPrepSelection,
  readPrepSelection,
  sanitizePrepTeamIds,
  stageBattleLaunch,
  type BattlePrepRosterEntry,
} from '@/features/battle/prep'
import { useBattleRoster, useBattleRosterById } from '@/features/battle/contentStore'
import type { BattleAbilityTemplate } from '@/features/battle/types'
import {
  createPracticeSession,
  getModeLabel,
  persistSelectedMatchMode,
  persistStagedBattleSession,
  readBattleProfileStats,
  readSelectedMatchMode,
  clearOnlineMatchmakingLocalState,
  type BattleMatchMode,
} from '@/features/battle/matches'
import { createInitialBattleState } from '@/features/battle/engine'
import { getUnlockMissionForFighter } from '@/features/missions/unlocks'
import {
  useAdminUnlockOverrides,
  getEffectiveUnlockedSet,
} from '@/features/missions/effectiveUnlocks'
import { useEffectiveMissionProgress } from '@/features/missions/missionProgressStore'
import { createBattleSeed } from '@/features/battle/random'
import homeBgBase from '@/assets/backgrounds/home-bg-base.webp'
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
  abandonStaleMatches,
  cleanupMatchmakingStateForPlayer,
  cleanupStaleQueueRows,
  type ProfileSearchResult,
} from '@/features/multiplayer/client'
import type { MatchRow } from '@/features/multiplayer/types'
import { useAuth } from '@/features/auth/useAuth'
import { usePlayerState } from '@/features/player/store'
import type { CharacterRarity } from '@/types/characters'

type PrepSortKey = 'LORE' | 'NAME' | 'RARITY'

type PrepRoleFilter = 'ALL' | (string & {})

const loreOrderIds = [
  'yuji', 'megumi', 'nobara', 'junpei', 'maki', 'panda', 'toge',
  'todo', 'miwa', 'mai', 'momo', 'noritoshi',
  'nanami', 'gojo', 'yaga', 'shoko', 'ijichi',
  'sukuna', 'mahito', 'jogo', 'hanami',
  'mechamaru',
]

const sortOptions: PrepSortKey[] = ['LORE', 'NAME', 'RARITY']

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

function getExplicitTeamIds(teamIds: Array<string | null>, rosterById: Record<string, BattlePrepRosterEntry>) {
  return teamIds
    .filter((teamId): teamId is string => Boolean(teamId && rosterById[teamId]))
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
  const classes = [ability.kind.toUpperCase(), ...ability.classes]
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
  const portraitSrc = normalizeBattleAssetSrc(entry.battleTemplate.boardPortraitSrc)

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

      {portraitSrc ? (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={portraitSrc}
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
  const battlePrepRoster = useBattleRoster()
  const battlePrepRosterById = useBattleRosterById()
  const roleOptions = useMemo(
    () => ['ALL', ...Array.from(new Set(battlePrepRoster.map((entry) => entry.role)))] as PrepRoleFilter[],
    [battlePrepRoster],
  )
  const [searchValue, setSearchValue] = useState('')
  const [sortBy, setSortBy] = useState<PrepSortKey>('LORE')
  const [roleFilter, setRoleFilter] = useState<PrepRoleFilter>('ALL')
  const [rosterPage, setRosterPage] = useState(0)
  const [teamIds, setTeamIds] = useState<Array<string | null>>(() => {
    const initial = readPrepSelection(battlePrepRosterById)
    return [initial[0] ?? null, initial[1] ?? null, initial[2] ?? null]
  })
  const [focusedSlot, setFocusedSlot] = useState(0)
  const [selectedRosterId, setSelectedRosterId] = useState<string>(
    () => readPrepSelection(battlePrepRosterById)[0] ?? battlePrepRoster[0]?.id ?? '',
  )
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null)
  const [matchMode, setMatchMode] = useState<BattleMatchMode>(() => readSelectedMatchMode())
  const [profileStats] = useState(() => readBattleProfileStats())

  // ── Unlock state (account-backed mission progress + admin overrides) ────
  const missionProgress = useEffectiveMissionProgress(user)
  const adminOverrides = useAdminUnlockOverrides(user)

  // ── Practice mode state ──────────────────────────────────────────────────
  const [practiceAiEnabled, setPracticeAiEnabled] = useState(true)
  const [practiceEnemyIds, setPracticeEnemyIds] = useState<Array<string | null>>([null, null, null])
  const [practiceOpen, setPracticeOpen] = useState(false)

  // ── Multiplayer private match state ─────────────────────────────────────
  const [privateOpen, setPrivateOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [selectedOpponent, setSelectedOpponent] = useState<ProfileSearchResult | null>(null)
  const [incomingChallenge, setIncomingChallenge] = useState<MatchRow | null>(null)
  const [mpError, setMpError] = useState<string | null>(null)
  const [mpLoading, setMpLoading] = useState(false)
  const visibleSearchResults = searchQuery.trim() ? searchResults : []

  // ── Audio ────────────────────────────────────────────────────────────────
  const { settings: playerSettings } = usePlayerState()
  // Guard so match-found plays exactly once per navigation, not per re-render.
  const matchFoundPlayedRef = useRef(false)

  useEffect(() => {
    setVolumesFromSettings(playerSettings.audio)
  }, [playerSettings.audio])

  // ── Matchmaking queue state (ranked / quick) ─────────────────────────────
  const [searching, setSearching] = useState(false)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [aiFallback, setAiFallback] = useState(false)
  const searchingRef = useRef(false)
  const searchAttemptsRef = useRef(0)
  const searchSessionIdRef = useRef(0)

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
    persistPrepSelection(teamIds, battlePrepRosterById)
  }, [teamIds, battlePrepRosterById])

  useEffect(() => {
    persistSelectedMatchMode(matchMode)
  }, [matchMode])

  // Leave the queue if the user navigates away while searching
  useEffect(() => {
    return () => {
      if (searchingRef.current && user) {
        searchSessionIdRef.current += 1
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

        if (sortBy === 'LORE') {
          const li = loreOrderIds.indexOf(left.id)
          const ri = loreOrderIds.indexOf(right.id)
          const lrank = li === -1 ? loreOrderIds.length : li
          const rrank = ri === -1 ? loreOrderIds.length : ri
          return lrank - rrank
        }

        return left.name.localeCompare(right.name)
      })
  }, [battlePrepRoster, roleFilter, searchValue, sortBy])

  const unlockedFighterIds = useMemo(
    () => getEffectiveUnlockedSet(battlePrepRoster.map((e) => e.id), missionProgress, adminOverrides),
    [battlePrepRoster, missionProgress, adminOverrides],
  )

  const explicitTeamIds = getExplicitTeamIds(teamIds, battlePrepRosterById)
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

  function handleRosterDragStart(event: DragEvent, characterId: string) {
    event.dataTransfer.setData('application/x-cursed-roster-id', characterId)
    event.dataTransfer.effectAllowed = 'copy'
  }

  function handleTeamSlotDragStart(event: DragEvent, slotIndex: number) {
    event.dataTransfer.setData('application/x-cursed-team-slot', String(slotIndex))
    event.dataTransfer.effectAllowed = 'move'
  }

  function handleTeamSlotDrop(event: DragEvent, slotIndex: number) {
    event.preventDefault()
    const rosterId = event.dataTransfer.getData('application/x-cursed-roster-id')
    const sourceSlot = event.dataTransfer.getData('application/x-cursed-team-slot')

    if (rosterId && battlePrepRosterById[rosterId] && unlockedFighterIds.has(rosterId)) {
      setSelectedRosterId(rosterId)
      setSelectedAbilityId(getDefaultAbilityId(battlePrepRosterById[rosterId]))
      setTeamIds((current) => {
        const next = [...current]
        const existingIndex = next.findIndex((teamId) => teamId === rosterId)
        if (existingIndex >= 0) next[existingIndex] = null
        next[slotIndex] = rosterId
        return next
      })
      setFocusedSlot(slotIndex)
      return
    }

    if (sourceSlot !== '') {
      const from = Number(sourceSlot)
      if (!Number.isInteger(from) || from === slotIndex) return
      setTeamIds((current) => {
        const next = [...current]
        const moved = next[from]
        next[from] = next[slotIndex]
        next[slotIndex] = moved
        return next
      })
      setFocusedSlot(slotIndex)
    }
  }

  function handleRosterDrop(event: DragEvent) {
    event.preventDefault()
    const sourceSlot = event.dataTransfer.getData('application/x-cursed-team-slot')
    if (sourceSlot === '') return
    const slotIndex = Number(sourceSlot)
    if (!Number.isInteger(slotIndex)) return
    handleClearSlot(slotIndex)
  }

  function playMatchFound() {
    if (matchFoundPlayedRef.current) return
    matchFoundPlayedRef.current = true
    playSoundEffect('matchFound')
  }

  async function handleEnterArena(modeOverride?: BattleMatchMode) {
    const selectedMode = modeOverride ?? matchMode
    if (!isReady) return

    if (selectedMode === 'practice') {
      const sanitized = sanitizePrepTeamIds(teamIds, battlePrepRosterById)
      const enemyIds = sanitizePrepTeamIds(practiceEnemyIds, battlePrepRosterById)
      const session = createPracticeSession(sanitized, { aiEnabled: practiceAiEnabled, enemyTeamIds: enemyIds })
      persistStagedBattleSession(session)
      playMatchFound()
      navigate('/battle')
      return
    }

    if (selectedMode === 'private') {
      setPrivateOpen(true)
      setMpError(null)
      setSearchQuery('')
      setSelectedOpponent(null)
      return
    }

    // Ranked / Quick — requires auth; join the matchmaking queue
    if (!user) {
      stageBattleLaunch(teamIds, selectedMode, battlePrepRosterById)
      playMatchFound()
      navigate('/battle')
      return
    }

    const sanitized = sanitizePrepTeamIds(teamIds, battlePrepRosterById)
    const displayName = authProfile?.display_name ?? 'Player'
    setSearching(true)
    setQueueError(null)
    clearOnlineMatchmakingLocalState()

    const sessionId = searchSessionIdRef.current + 1
    searchSessionIdRef.current = sessionId

    const cleanup = await cleanupMatchmakingStateForPlayer(user.id, { mode: selectedMode })
    if (sessionId !== searchSessionIdRef.current) return
    if (cleanup.error) {
      setSearching(false)
      setQueueError(cleanup.error)
      return
    }

    const active = await fetchActiveMatch(user.id, { mode: selectedMode })
    if (sessionId !== searchSessionIdRef.current) return
    if (active.error) {
      setSearching(false)
      setQueueError(active.error)
      return
    }
    if (active.data) {
      searchingRef.current = false
      setSearching(false)
      playMatchFound()
      navigate(`/battle/${active.data.id}`)
      return
    }

    const { error: qErr } = await joinMatchmakingQueue({ playerId: user.id, mode: selectedMode, teamIds: sanitized, displayName, experience: profileStats.experience })
    if (sessionId !== searchSessionIdRef.current) return
    if (qErr) {
      setSearching(false)
      setQueueError(qErr)
      return
    }

    searchingRef.current = true
    searchAttemptsRef.current = 0
    setAiFallback(false)
    void pollForMatch({ playerId: user.id, mode: selectedMode, teamIds: sanitized, displayName, sessionId })
  }

  async function pollForMatch({
    playerId, mode, teamIds: sanitized, displayName, sessionId,
  }: { playerId: string; mode: BattleMatchMode; teamIds: string[]; displayName: string; sessionId: number }) {
    if (!searchingRef.current || sessionId !== searchSessionIdRef.current) return

    // Clean up any zombie in_progress matches before checking for an active one
    await abandonStaleMatches(playerId)
    await cleanupStaleQueueRows(mode)
    if (!searchingRef.current || sessionId !== searchSessionIdRef.current) return

    // Check if we've already been matched as Player B
    const { data: activeMatch } = await fetchActiveMatch(playerId, { mode })
    if (!searchingRef.current || sessionId !== searchSessionIdRef.current) return
    if (activeMatch) {
      searchingRef.current = false
      setSearching(false)
      playMatchFound()
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
    if (!searchingRef.current || sessionId !== searchSessionIdRef.current) return

    if (error) {
      searchingRef.current = false
      setSearching(false)
      setQueueError(error)
      return
    }

    if (match) {
      searchingRef.current = false
      setSearching(false)
      playMatchFound()
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
          if (sessionId !== searchSessionIdRef.current) return
          setSearching(false)
          setAiFallback(false)
          stageBattleLaunch(sanitized, mode, battlePrepRosterById)
          playMatchFound()
          navigate('/battle')
        }, 1200)
        return
      }

      window.setTimeout(() => {
        void pollForMatch({ playerId, mode, teamIds: sanitized, displayName, sessionId })
      }, POLL_INTERVAL_MS)
    }
  }

  async function handleCancelSearch() {
    searchSessionIdRef.current += 1
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

    const sanitized = sanitizePrepTeamIds(teamIds, battlePrepRosterById)
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
    playMatchFound()
    navigate(`/battle/${data.id}`)
  }

  async function handleAcceptChallenge() {
    if (!incomingChallenge || !isReady || !user) return
    setMpLoading(true)
    setMpError(null)

    const sanitized = sanitizePrepTeamIds(teamIds, battlePrepRosterById)
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

    playMatchFound()
    navigate(`/battle/${data.id}`)
  }

  async function handleDeclineChallenge() {
    if (!incomingChallenge) return
    await declineChallenge(incomingChallenge.id)
    setIncomingChallenge(null)
  }

  return (
    <section className="relative h-full overflow-hidden py-2 sm:py-3">
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 top-14 z-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.48] saturate-[1.05] contrast-[1.05]"
          style={{ backgroundImage: `url(${homeBgBase})` }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_24%,rgba(252,43,71,0.26),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(6,220,194,0.18),transparent_36%),radial-gradient(circle_at_52%_92%,rgba(155,109,255,0.1),transparent_40%),linear-gradient(135deg,rgba(16,4,9,0.72)_0%,rgba(5,5,9,0.77)_46%,rgba(13,8,20,0.7)_100%)] animate-ca-ambient" />
        <div className="absolute -inset-x-24 inset-y-0 bg-[linear-gradient(105deg,transparent_0%,rgba(252,43,71,0.075)_33%,rgba(6,220,194,0.068)_51%,transparent_70%)] opacity-90 animate-ca-energy-sweep" />
        <div className="absolute inset-0 opacity-34 [background-image:linear-gradient(115deg,rgba(252,43,71,0.11)_0_1px,transparent_1px_42px),linear-gradient(25deg,rgba(6,220,194,0.07)_0_1px,transparent_1px_56px)]" />
        <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-ca-red/18 blur-3xl animate-ca-ambient" />
        <div className="absolute right-0 top-4 h-80 w-80 rounded-full bg-ca-teal/14 blur-3xl animate-ca-ambient" />
      </div>

      {/*
        ── Naruto-Arena Character Selection blueprint ───────────────────────
        D + E = top character info & skill detail panel
        F     = central match buttons (Ladder / Quick / Private + Practice)
        C     = bottom-left compact paginated roster grid
        A + B = bottom-right player info + selected team
      */}
      {(() => {
        const ROSTER_PAGE_SIZE = 21
        const pageCount = Math.max(1, Math.ceil(visibleRoster.length / ROSTER_PAGE_SIZE))
        const currentPage = Math.min(rosterPage, pageCount - 1)
        const rosterSlice = visibleRoster.slice(currentPage * ROSTER_PAGE_SIZE, currentPage * ROSTER_PAGE_SIZE + ROSTER_PAGE_SIZE)

        function startWithMode(mode: BattleMatchMode) {
          setMatchMode(mode)
          if (mode === 'practice') {
            setPrivateOpen(false)
            setPracticeOpen(true)
            return
          }
          if (mode === 'private') {
            setPracticeOpen(false)
            setPrivateOpen(true)
            setMpError(null)
            setSearchQuery('')
            setSelectedOpponent(null)
            return
          }
          setPracticeOpen(false)
          setPrivateOpen(false)
          void handleEnterArena(mode)
        }

        const abilities = selectedEntry ? selectedEntry.battleTemplate.abilities.concat(selectedEntry.battleTemplate.ultimate) : []
        const selectedEntryStyle = selectedEntry ? rarityStyles[selectedEntry.rarity] : null
        const portraitSrc = selectedEntry ? normalizeBattleAssetSrc(selectedEntry.battleTemplate.boardPortraitSrc) : null

        return (
          <div className="relative z-10 mx-auto flex h-full min-h-0 w-[calc(100%-1.5rem)] max-w-[82rem] flex-col gap-3 pt-2">
            {/* ── D + E. CHARACTER INFO + SKILL DETAIL (top panel) ────────── */}
            <section className="relative shrink-0 overflow-hidden rounded-[10px] border border-white/16 bg-[linear-gradient(135deg,rgba(31,28,42,0.92),rgba(12,11,18,0.96)_46%,rgba(6,6,10,0.95))] shadow-[0_18px_42px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.065)] backdrop-blur-sm">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(250,39,66,0.45),rgba(228,230,239,0.12),rgba(5,216,189,0.35))]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_28%,rgba(250,39,66,0.1),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(5,216,189,0.08),transparent_36%)]" />
              {selectedEntryStyle ? (
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-1"
                  style={{ background: `linear-gradient(180deg, ${selectedEntryStyle.text}, rgba(255,255,255,0))` }}
                />
              ) : null}

              {selectedEntry && selectedAbility ? (
                <div key={selectedEntry.id} className="relative p-3 animate-ca-soft-pop">
                  {/* D. Character info — portrait + name + role + passive + skill row */}
                  <div className="grid grid-cols-[6.75rem_minmax(0,1fr)_auto] items-start gap-3.5">
                    {/* Portrait */}
                    <div className="relative h-[6.75rem] w-[6.75rem] overflow-hidden rounded-[7px] border border-white/14 bg-[linear-gradient(180deg,rgba(38,36,48,0.7),rgba(9,9,14,0.86))] shadow-[0_12px_24px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.07)]">
                      {selectedEntryStyle ? (
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{ background: `radial-gradient(circle at 50% 30%, ${selectedEntryStyle.wash}, transparent 70%)` }}
                        />
                      ) : null}
                      {portraitSrc ? (
                        <img src={portraitSrc} alt={selectedEntry.name} className="relative h-full w-full object-contain object-center" draggable={false} />
                      ) : (
                        <div className="relative grid h-full w-full place-items-center">
                          <span className="ca-display text-[1.65rem]" style={{ color: selectedEntryStyle?.text }}>{selectedEntry.battleTemplate.shortName[0]}</span>
                        </div>
                      )}
                    </div>

                    {/* Name + role + passive */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="ca-mono-label rounded-[3px] border px-1.5 py-0.5 text-[0.42rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                          style={{ borderColor: selectedEntryStyle?.border, background: selectedEntryStyle?.wash, color: selectedEntryStyle?.text }}
                        >
                          {selectedEntry.gradeLabel}
                        </span>
                        <span className="ca-mono-label max-w-[18rem] truncate rounded-[3px] border border-white/10 bg-[rgba(255,255,255,0.045)] px-1.5 py-0.5 text-[0.42rem] text-ca-text-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                          {selectedEntry.role}
                        </span>
                      </div>
                      <h2 className="ca-display mt-2 truncate text-[1.9rem] leading-none text-ca-text drop-shadow-[0_2px_0_rgba(0,0,0,0.55)]">{selectedEntry.name}</h2>
                      <p className="mt-2 line-clamp-2 max-w-[36rem] text-[0.82rem] leading-snug text-ca-text-2">{selectedEntry.passiveLabel}</p>
                    </div>

                    {/* Skill icon row — Naruto-Arena style compact icons */}
                    <div className="flex shrink-0 gap-1.5 rounded-[6px] border border-white/8 bg-[rgba(8,8,13,0.42)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      {abilities.map((ability) => {
                        const active = selectedAbilityId === ability.id || (selectedAbilityId === null && ability.id === selectedAbility.id)
                        const abilityIcon = normalizeBattleAssetSrc(ability.icon.src)
                        return (
                          <button
                            key={ability.id}
                            type="button"
                            onClick={() => setSelectedAbilityId(ability.id)}
                            className={[
                              'ca-motion-smooth relative h-[2.85rem] w-[2.85rem] overflow-hidden rounded-[4px] border transition duration-150',
                              active
                                ? 'border-ca-red/70 -translate-y-[2px] scale-[1.06] shadow-[0_0_0_1px_rgba(250,39,66,0.38),0_10px_22px_rgba(250,39,66,0.24)] animate-ca-selected-breathe'
                                : 'border-white/14 bg-[rgba(255,255,255,0.035)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:-translate-y-[2px] hover:scale-[1.03] hover:border-white/30',
                            ].join(' ')}
                            title={ability.name}
                            aria-label={ability.name}
                          >
                            {abilityIcon ? (
                              <img src={abilityIcon} alt={ability.name} className="absolute inset-0 h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full w-full place-items-center bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))]">
                                <span className="ca-mono-label text-[0.5rem] text-ca-text-2">{ability.icon.label}</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.22))]" />
                            {active ? <div className="absolute inset-x-0 bottom-0 h-[2px] bg-ca-red" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Inner divider */}
                  <div className="my-3 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />

                  {/* E. Skill detail — name + cost (upper-right), description, classes (lower-left) + cooldown (lower-right) */}
                  <div className="relative overflow-hidden rounded-[8px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,8,14,0.66),rgba(18,16,24,0.72))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-ca-red/70" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,rgba(250,39,66,0.18),rgba(5,216,189,0.16),transparent)]" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-[var(--font-display-alt)] text-[1.22rem] font-extrabold leading-none text-ca-red">{selectedAbility.name}</p>
                        <p className="mt-2 line-clamp-2 text-[0.82rem] leading-snug text-ca-text-2">{selectedAbility.description}</p>
                      </div>
                      <div className="shrink-0 rounded-[5px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                        <p className="ca-mono-label text-[0.36rem] tracking-[0.12em] text-ca-text-3">Energy Cost</p>
                        <div className="mt-1"><EnergyCostRow cost={getAbilityEnergyCost(selectedAbility)} compact /></div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="ca-mono-label text-[0.4rem] tracking-[0.12em] text-ca-text-3">Classes</p>
                        <p className="ca-mono-label mt-0.5 text-[0.5rem] tracking-[0.06em] text-ca-text-2">
                          {formatAbilityClasses(selectedAbility)} · TARGET {getTargetLabel(selectedAbility)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="ca-mono-label text-[0.4rem] tracking-[0.12em] text-ca-text-3">Cooldown</p>
                        <p className="ca-mono-label mt-0.5 text-[0.5rem] tracking-[0.06em] text-ca-text-2">{selectedAbility.cooldown || 'NONE'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid place-items-center px-4 py-8 text-center">
                  <p className="ca-display text-[1rem] leading-tight text-ca-text-2">Select a fighter to preview their skills.</p>
                </div>
              )}
            </section>

            {/* ── F. MATCH BUTTONS (central row, Naruto-Arena style) ──────── */}
            <section className="relative shrink-0 overflow-hidden rounded-[9px] border border-white/12 bg-[linear-gradient(180deg,rgba(26,24,34,0.82),rgba(7,7,11,0.86))] px-3 py-2.5 shadow-[0_12px_26px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.055)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(250,39,66,0.38),rgba(5,216,189,0.28),transparent)]" />
              <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
                {(['ranked', 'quick', 'private'] as const).map((mode) => {
                  const active = matchMode === mode
                  const disabled = !isReady || searching
                  const label = mode === 'ranked' ? 'Start Ladder Game' : mode === 'quick' ? 'Start Quick Game' : 'Start Private Game'
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={disabled}
                      onClick={() => startWithMode(mode)}
                      title={!isReady ? 'Select 3 fighters first' : label}
                      className={[
                        'ca-display ca-motion-smooth relative w-[12.5rem] rounded-[5px] border px-3 py-2.5 text-center text-[0.95rem] leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-150 hover:-translate-y-[2px] active:scale-[0.975]',
                        disabled
                          ? 'border-white/10 bg-[rgba(255,255,255,0.04)] text-ca-text-3 cursor-not-allowed opacity-55'
                          : active
                            ? 'border-ca-red/60 bg-[linear-gradient(180deg,rgba(250,39,66,0.28),rgba(250,39,66,0.09))] text-ca-text shadow-[0_0_0_1px_rgba(250,39,66,0.24),0_10px_22px_rgba(250,39,66,0.16),0_8px_18px_rgba(0,0,0,0.36)] hover:brightness-110 animate-ca-selected-breathe'
                            : 'border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] text-ca-text hover:border-white/30 hover:bg-[rgba(255,255,255,0.08)]',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  )
                })}
                {/* Practice — smaller secondary option */}
                <button
                  type="button"
                  onClick={() => startWithMode('practice')}
                  disabled={!isReady}
                  title={!isReady ? 'Select 3 fighters first' : 'Practice vs CPU'}
                  className={[
                    'ca-mono-label ca-motion-smooth rounded-[4px] border px-3 py-2 text-[0.5rem] tracking-[0.12em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-150 hover:-translate-y-[2px] active:scale-[0.975]',
                    !isReady
                      ? 'border-white/8 bg-[rgba(255,255,255,0.03)] text-ca-text-3 cursor-not-allowed opacity-55'
                      : matchMode === 'practice'
                        ? 'border-ca-teal/50 bg-ca-teal-wash text-ca-teal animate-ca-selected-breathe'
                        : 'border-white/14 bg-[rgba(255,255,255,0.04)] text-ca-text-2 hover:border-ca-teal/35 hover:text-ca-teal',
                  ].join(' ')}
                >
                  + Practice
                </button>
              </div>
              {!isReady ? (
                <p className="mt-1.5 text-center ca-mono-label text-[0.46rem] tracking-[0.12em] text-ca-text-3">
                  Select 3 fighters to enable match buttons
                </p>
              ) : null}
            </section>

            {/* ── Bottom row: C roster (left) + A player info + B team (right) ── */}
            <section className="min-h-0 flex-1 overflow-hidden">
              <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
                {/* ── C. CHARACTER ROSTER — compact paginated grid ───────── */}
                <div className="relative flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-white/14 bg-[linear-gradient(180deg,rgba(24,22,32,0.86),rgba(7,7,12,0.92))] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-sm">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(250,39,66,0.22),rgba(228,230,239,0.08),rgba(5,216,189,0.18))]" />
                  {/* Slim filter row */}
                  <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-white/8 bg-[rgba(8,8,13,0.48)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <input
                      value={searchValue}
                      onChange={(event) => { setSearchValue(event.target.value); setRosterPage(0) }}
                      placeholder="Search"
                      className="w-[8rem] rounded-[4px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-2 py-1 text-[0.7rem] text-ca-text outline-none transition placeholder:text-ca-text-3 focus:border-ca-teal/35"
                    />
                    <select
                      value={roleFilter}
                      onChange={(event) => { setRoleFilter(event.target.value as PrepRoleFilter); setRosterPage(0) }}
                      className="ca-mono-label rounded-[4px] border border-white/10 bg-[rgba(15,15,21,0.5)] px-1.5 py-1 text-[0.42rem] text-ca-text outline-none transition focus:border-ca-teal/35"
                      title="Filter by role"
                    >
                      {roleOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <select
                      value={sortBy}
                      onChange={(event) => { setSortBy(event.target.value as PrepSortKey); setRosterPage(0) }}
                      className="ca-mono-label rounded-[4px] border border-white/10 bg-[rgba(15,15,21,0.5)] px-1.5 py-1 text-[0.42rem] text-ca-text outline-none transition focus:border-ca-teal/35"
                      title="Sort"
                    >
                      {sortOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <p className="ml-auto ca-mono-label text-[0.42rem] tracking-[0.1em] text-ca-text-3">
                      {visibleRoster.length} AVAILABLE
                    </p>
                  </div>

                  {/* Grid — 7 cols × 3 rows = 21 per page */}
                  <div
                    className="mt-2.5 min-h-0 flex-1 overflow-hidden rounded-[7px] border border-white/8 bg-[linear-gradient(180deg,rgba(7,7,12,0.74),rgba(16,15,22,0.62))] p-2 shadow-[inset_0_0_22px_rgba(0,0,0,0.28)]"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleRosterDrop}
                  >
                    <div className="grid h-full auto-rows-fr grid-cols-7 gap-2">
                      {rosterSlice.map((entry) => {
                        const isLocked = !unlockedFighterIds.has(entry.id)
                        return (
                          <RosterTile
                            key={entry.id}
                            entry={entry}
                            active={selectedRosterId === entry.id}
                            inTeam={teamIds.includes(entry.id)}
                            locked={isLocked}
                            lockMissionName={isLocked ? (getUnlockMissionForFighter(entry.id)?.name ?? null) : null}
                            onClick={isLocked ? undefined : () => handleAssignCharacter(entry.id)}
                            onDragStart={(event) => handleRosterDragStart(event, entry.id)}
                          />
                        )
                      })}
                    </div>
                  </div>

                  {/* Pagination — page arrows like Naruto-Arena */}
                  {pageCount > 1 ? (
                    <div className="mt-2 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setRosterPage((p) => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="ca-display ca-motion-smooth rounded-[4px] border border-white/12 bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[0.8rem] leading-none text-ca-text transition hover:-translate-y-[2px] hover:scale-[1.08] hover:border-white/24 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="Previous page"
                      >
                        ◀
                      </button>
                      <span className="ca-mono-label text-[0.5rem] tracking-[0.14em] text-ca-text-2 tabular-nums">
                        PAGE {currentPage + 1} / {pageCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRosterPage((p) => Math.min(pageCount - 1, p + 1))}
                        disabled={currentPage >= pageCount - 1}
                        className="ca-display ca-motion-smooth rounded-[4px] border border-white/12 bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[0.8rem] leading-none text-ca-text transition hover:-translate-y-[2px] hover:scale-[1.08] hover:border-white/24 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="Next page"
                      >
                        ▶
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* ── A + B. PLAYER INFO + SELECTED TEAM (right column) ──── */}
                <aside className="relative flex min-h-0 flex-col gap-2.5 overflow-hidden rounded-[10px] border border-white/14 bg-[linear-gradient(180deg,rgba(18,16,26,0.82),rgba(5,5,9,0.88))] p-2 shadow-[0_14px_34px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(5,216,189,0.24),rgba(250,39,66,0.18),transparent)]" />
                  {/* A. Player info */}
                  <div className="relative shrink-0">
                    <PlayerInfoPanel profileName={authProfile?.display_name ?? 'PLAYER'} stats={profileStats} winRate={winRate} />
                  </div>

                  {/* B. Selected team — 3 prominent slots, clearly the team you're locking in */}
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[9px] border border-white/12 bg-[linear-gradient(180deg,rgba(30,28,38,0.82),rgba(11,10,17,0.9))] p-3 shadow-[0_12px_26px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(5,216,189,0.32),transparent)]" />
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="ca-display text-[1.1rem] leading-none text-ca-text">Your Team</p>
                      <p className={['ca-mono-label text-[0.46rem] tracking-[0.14em]', isReady ? 'text-ca-teal' : 'text-ca-text-3'].join(' ')}>
                        {explicitTeamIds.length}/3 READY
                      </p>
                    </div>
                    <div className="mt-2.5 grid min-h-0 flex-1 grid-rows-3 gap-2.5">
                      {teamEntries.map((entry, index) => (
                        <TeamSlotCard
                          key={`prep-slot-${index}`}
                          slotIndex={index}
                          entry={entry}
                          focused={focusedSlot === index}
                          expanded
                          onSelect={() => handleSelectSlot(index)}
                          onClear={() => handleClearSlot(index)}
                          onDragStart={(event) => handleTeamSlotDragStart(event, index)}
                          onDrop={(event) => handleTeamSlotDrop(event, index)}
                        />
                      ))}
                    </div>
                    <p className="mt-2 ca-mono-label text-center text-[0.42rem] tracking-[0.1em] text-ca-text-3">
                      Drag fighters here · double-click to remove
                    </p>
                  </div>
                </aside>
              </div>
            </section>
          </div>
        )
      })()}

      {searching ? (
        <PrepDialog title="Matchmaking" onClose={() => { void handleCancelSearch() }}>
          <SearchingPanel
            mode={matchMode}
            error={queueError}
            aiFallback={aiFallback}
            onCancel={handleCancelSearch}
          />
        </PrepDialog>
      ) : null}

      {privateOpen && matchMode === 'private' ? (
        <PrepDialog title="Private Match" onClose={() => { setPrivateOpen(false); setMpError(null); setSearchQuery(''); setSelectedOpponent(null) }}>
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
        </PrepDialog>
      ) : null}

      {practiceOpen ? (
        <PrepDialog title="Practice Setup" onClose={() => setPracticeOpen(false)}>
          <PracticePanel
            roster={battlePrepRoster}
            rosterById={battlePrepRosterById}
            aiEnabled={practiceAiEnabled}
            enemyIds={practiceEnemyIds}
            isReady={isReady}
            onToggleAi={() => setPracticeAiEnabled((v) => !v)}
            onSetEnemyIds={setPracticeEnemyIds}
            onStart={() => { setPracticeOpen(false); void handleEnterArena('practice') }}
          />
        </PrepDialog>
      ) : null}

      {incomingChallenge ? (
        <PrepDialog title="Incoming Challenge" onClose={handleDeclineChallenge}>
          <IncomingChallengeBar
            challengerName={incomingChallenge.player_a_display_name}
            loading={mpLoading}
            isReady={isReady}
            onAccept={handleAcceptChallenge}
            onDecline={handleDeclineChallenge}
          />
        </PrepDialog>
      ) : null}
    </section>
  )
}

// ── Practice panel ────────────────────────────────────────────────────────────

function PrepDialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[rgba(5,6,10,0.7)] px-4 backdrop-blur-[3px] animate-ca-fade-in">
      <div className="relative w-full max-w-[25rem] overflow-hidden rounded-[10px] border border-white/12 bg-[linear-gradient(180deg,rgba(30,28,38,0.98),rgba(13,12,18,0.99))] shadow-[0_24px_70px_rgba(0,0,0,0.55)] animate-ca-slide-up">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(250,39,66,0.1),transparent_44%),radial-gradient(circle_at_right,rgba(5,216,189,0.08),transparent_44%)]" />
        <div className="relative flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <p className="ca-display text-[1.15rem] leading-none text-ca-text">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-[4px] border border-white/10 bg-[rgba(255,255,255,0.04)] text-[0.72rem] text-ca-text-3 transition duration-300 hover:border-white/20 hover:text-ca-text"
            aria-label="Close dialog"
          >
            X
          </button>
        </div>
        <div className="relative px-4 pb-4 pt-1">{children}</div>
      </div>
    </div>
  )
}

function PlayerInfoPanel({
  profileName,
  stats,
  winRate,
}: {
  profileName: string
  stats: ReturnType<typeof readBattleProfileStats>
  winRate: number
}) {
  return (
    <div className="relative overflow-hidden rounded-[9px] border border-white/12 bg-[linear-gradient(180deg,rgba(30,28,38,0.78),rgba(9,9,15,0.86))] px-3 py-3 shadow-[0_10px_22px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-ca-red/65" />
      <div className="grid grid-cols-[3.1rem_minmax(0,1fr)] items-center gap-3">
      <div className="grid h-12 w-12 place-items-center rounded-[6px] border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.16),rgba(250,39,66,0.06))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <span className="ca-display text-[1rem] text-ca-red">{profileName.slice(0, 2).toUpperCase()}</span>
      </div>
      <div className="min-w-0">
        <p className="ca-display truncate text-[1.22rem] leading-none text-ca-text">{profileName}</p>
        <p className="ca-mono-label mt-1 truncate text-[0.42rem] text-ca-text-3">Lv {stats.level} {stats.rankTitle}</p>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <RecordStat label="Wins" value={String(stats.wins)} compact />
          <RecordStat label="Losses" value={String(stats.losses)} compact />
          <RecordStat label="Win %" value={`${winRate}%`} compact />
        </div>
      </div>
      </div>
    </div>
  )
}

function PracticePanel({
  roster,
  rosterById,
  aiEnabled,
  enemyIds,
  isReady,
  onToggleAi,
  onSetEnemyIds,
  onStart,
}: {
  roster: BattlePrepRosterEntry[]
  rosterById: Record<string, BattlePrepRosterEntry>
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
            const entry = id ? rosterById[id] ?? null : null
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
                  {roster.map((r) => (
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

function RecordStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={['rounded-[6px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', compact ? 'px-1.5 py-1.5' : 'px-2.5 py-2.5'].join(' ')}>
      <p className="ca-mono-label text-[0.36rem] text-ca-text-3">{label}</p>
      <p className={['ca-display leading-none text-ca-text', compact ? 'mt-1 text-[0.88rem]' : 'mt-1.5 text-[1.1rem]'].join(' ')}>{value}</p>
    </div>
  )
}

function RosterTile({
  entry,
  active,
  inTeam,
  locked = false,
  lockMissionName = null,
  onClick,
  onDragStart,
}: {
  entry: BattlePrepRosterEntry
  active: boolean
  inTeam: boolean
  locked?: boolean
  lockMissionName?: string | null
  onClick?: () => void
  onDragStart: (event: DragEvent) => void
}) {
  const style = rarityStyles[entry.rarity]

  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      draggable={!locked}
      onDragStart={locked ? undefined : onDragStart}
      disabled={locked}
      title={locked && lockMissionName ? `Locked — complete mission: ${lockMissionName}` : undefined}
      className={[
        'group ca-motion-smooth relative overflow-hidden rounded-[5px] border bg-[linear-gradient(180deg,rgba(30,28,38,0.72),rgba(12,12,18,0.86))] text-left shadow-[0_4px_10px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-150 hover:-translate-y-[2px] hover:scale-[1.015] hover:brightness-110 active:scale-[0.94]',
        active && !locked ? 'animate-ca-selected-breathe' : '',
      ].join(' ')}
      style={{
        borderColor: locked ? 'rgba(228,230,239,0.06)' : active ? style.border : inTeam ? 'rgba(5,216,189,0.34)' : 'rgba(228,230,239,0.1)',
        boxShadow: active && !locked ? `0 0 0 1px ${style.border}, 0 10px 18px rgba(0,0,0,0.28)` : undefined,
      }}
    >
      <div className={locked ? 'opacity-30 grayscale' : undefined}>
        <PortraitThumb entry={entry} sizeClass="aspect-square w-full" labelClass="text-[0.3rem]" bordered={false} showLabel />
      </div>
      {!locked ? (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] shadow-[0_0_10px_currentColor]"
          style={{ background: style.text, opacity: 0.85 }}
          aria-hidden
        />
      ) : null}
      {locked ? (
        <div className="absolute inset-0 grid place-items-center bg-[rgba(0,0,0,0.35)]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-[1.1rem] w-[1.1rem] text-white/40">
            <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
          </svg>
        </div>
      ) : null}
      {!locked && inTeam ? (
        <span className="absolute right-1 top-1 rounded-[2px] border border-ca-teal/35 bg-[rgba(5,216,189,0.16)] px-1 py-0.5 ca-mono-label text-[0.34rem] text-ca-teal shadow-[0_0_10px_rgba(5,216,189,0.22)]">
          IN
        </span>
      ) : null}
      {active && !locked ? <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: style.text }} /> : null}
    </button>
  )
}

function TeamSlotCard({
  slotIndex,
  entry,
  focused,
  compact = false,
  expanded = false,
  onSelect,
  onClear,
  onDragStart,
  onDrop,
}: {
  slotIndex: number
  entry: BattlePrepRosterEntry | null
  focused: boolean
  compact?: boolean
  expanded?: boolean
  onSelect: () => void
  onClear: () => void
  onDragStart: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
}) {
  const label = `SLOT ${slotIndex + 1}`

  if (!entry) {
    return (
      <button
        type="button"
        onClick={onSelect}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className={[
          'ca-motion-smooth w-full rounded-[5px] border border-dashed bg-[rgba(255,255,255,0.02)] text-left transition duration-150 hover:-translate-y-[2px] hover:bg-[rgba(255,255,255,0.04)]',
          expanded ? 'h-full min-h-[5.5rem] px-3 py-3' : compact ? 'h-[5.35rem] px-2 py-2.5' : 'px-3 py-3',
          focused ? 'border-ca-teal/42 shadow-[0_0_0_1px_rgba(5,216,189,0.16)] animate-ca-selected-breathe' : 'border-white/10 hover:border-white/20',
        ].join(' ')}
      >
        <p className="ca-mono-label text-[0.4rem] text-ca-text-3">{label}</p>
        <p className={['ca-display mt-1.5 leading-none text-ca-text-disabled', expanded ? 'text-[1.45rem]' : compact ? 'text-[1rem]' : 'text-[1.32rem]'].join(' ')}>Empty</p>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.preventDefault()
        onClear()
      }}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      title="Double-click to remove. Drag to reorder or drop back into the roster."
      className={[
        'ca-motion-smooth w-full rounded-[6px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition duration-150 hover:-translate-y-[2px] hover:bg-[rgba(255,255,255,0.05)]',
        expanded ? 'h-full min-h-[5.5rem] overflow-hidden px-3 py-3' : compact ? 'h-[5.35rem] overflow-hidden px-2 py-2.5' : 'px-2.5 py-2.5',
        focused ? 'border-ca-teal/42 shadow-[0_0_0_1px_rgba(5,216,189,0.22),0_0_18px_rgba(5,216,189,0.12)] animate-ca-selected-breathe' : 'border-white/10 hover:border-white/20',
      ].join(' ')}
    >
      {expanded ? (
        <div className="grid h-full min-h-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-3">
          <PortraitThumb entry={entry} sizeClass="h-[4.25rem] w-[4.25rem]" labelClass="text-[0.28rem]" bordered={false} />
          <div className="min-w-0">
            <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</p>
            <p className="ca-display mt-1 truncate text-[1.18rem] leading-none text-ca-text">{entry.battleTemplate.shortName}</p>
            <p className="mt-1 truncate text-[0.66rem] leading-none text-ca-text-3">{entry.role}</p>
          </div>
        </div>
      ) : compact ? (
        <div className="grid h-full min-h-0 grid-cols-[3.55rem_minmax(0,1fr)] items-center gap-2">
          <PortraitThumb entry={entry} sizeClass="h-[3.55rem] w-[3.55rem]" labelClass="text-[0.26rem]" bordered={false} />
          <div className="min-w-0">
            <p className="ca-mono-label text-[0.36rem] text-ca-text-3">{label}</p>
            <p className="ca-display mt-1 truncate text-[1rem] leading-none text-ca-text">{entry.battleTemplate.shortName}</p>
          </div>
        </div>
      ) : (
        <div className="grid items-center gap-2.5 grid-cols-[2.6rem_minmax(0,1fr)]">
          <PortraitThumb entry={entry} sizeClass="h-[3rem] w-[2.6rem]" labelClass="text-[0.3rem]" bordered={false} />
          <div className="min-w-0">
            <p className="ca-mono-label text-[0.36rem] text-ca-text-3">{label}</p>
            <p className="ca-display mt-1 truncate text-[1.08rem] leading-none text-ca-text">{entry.battleTemplate.shortName}</p>
          </div>
        </div>
      )}
    </button>
  )
}
