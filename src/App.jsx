import React, { useEffect, useMemo, useRef, useState } from 'react'
import { characters as defaultCharacters } from './characters'
import TeamSelect from './TeamSelect'
import BattleScreen from './BattleScreen'
import AuthGate from './AuthGate'
import { supabase } from './supabaseClient'
import ProfilePage from './ProfilePage'
import OpponentSelect from './OpponentSelect'
import BattleResultScreen from './BattleResultScreen'
import { storyChapters, storyEnemies } from './storyData'
import './App.css'

const ShopPage = React.lazy(() => import('./ShopPage'))
const GachaPage = React.lazy(() => import('./GachaPage'))
const InventoryPage = React.lazy(() => import('./InventoryPage'))
const StoryMode = React.lazy(() => import('./StoryMode'))
const AdminPanel = React.lazy(() => import('./AdminPanel'))
const LadderPage = React.lazy(() => import('./LadderPage'))
const RogueMode = React.lazy(() => import('./RogueMode'))
const ProgressHub = React.lazy(() => import('./ProgressHub'))

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj))

function App() {
  const [playerTeam, setPlayerTeam] = useState([])
  const [enemyTeam, setEnemyTeam] = useState([])
  const [selectedEnemy, setSelectedEnemy] = useState(null)
  const [battleLog, setBattleLog] = useState(["Battle Start! Queue actions, then End Turn."])
  const [gameOver, setGameOver] = useState(null)
  const [turn, setTurn] = useState(1)
  const [gamePhase, setGamePhase] = useState('select')
  const [selectedPlayerTeam, setSelectedPlayerTeam] = useState([])
  const [actedCharacters, setActedCharacters] = useState([])
  const [pendingAbility, setPendingAbility] = useState(null)
  const [queuedActions, setQueuedActions] = useState([])
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [characterProgress, setCharacterProgress] = useState({})
  const [characterCatalog, setCharacterCatalog] = useState(defaultCharacters)
  const [levelUpToast, setLevelUpToast] = useState(null)
  const [matchHistory, setMatchHistory] = useState([])
  const [view, setView] = useState('team')
  const [teamPresets, setTeamPresets] = useState({})
  const [matchSummary, setMatchSummary] = useState(null)
  const [missions, setMissions] = useState([])
  const [userMissions, setUserMissions] = useState([])
  const [shopOffers, setShopOffers] = useState([])
  const [banners, setBanners] = useState([])
  const [bannerItems, setBannerItems] = useState([])
  const [inventory, setInventory] = useState({})
  const [userItems, setUserItems] = useState({})
  const [userTitles, setUserTitles] = useState([])
  const [gachaResult, setGachaResult] = useState(null)
  const [combatEvents, setCombatEvents] = useState([])
  const [battleShake, setBattleShake] = useState(false)
  const [battleSpeed, setBattleSpeed] = useState(1)
  const [autoBattle, setAutoBattle] = useState(false)
  const [storyState, setStoryState] = useState({
    chapterId: 'chapter-1',
    activeNodeId: '1-1',
    completedNodes: [],
  })
  const [storyBattleConfig, setStoryBattleConfig] = useState(null)
  const [storyResult, setStoryResult] = useState(null)
  const [storyRewardsClaimed, setStoryRewardsClaimed] = useState(false)
  const [storyLoaded, setStoryLoaded] = useState(false)
  const [pvpMatch, setPvpMatch] = useState(null)
  const [pvpStatus, setPvpStatus] = useState(null)
  const [pvpChannel, setPvpChannel] = useState(null)
  const [dailyReward, setDailyReward] = useState(null)
  const [achievements, setAchievements] = useState([])
  const [achievementProgress, setAchievementProgress] = useState([])
  const [battleResult, setBattleResult] = useState(null)
  const [leaderboardEntries, setLeaderboardEntries] = useState([])
  const [leaderboardStatus, setLeaderboardStatus] = useState('idle')
  const [leaderboardError, setLeaderboardError] = useState(null)
  const [rankedBotMatch, setRankedBotMatch] = useState(null)
  const [rogueState, setRogueState] = useState({
    active: false,
    floor: 0,
    maxFloors: 10,
    blessings: [],
    pendingBlessings: [],
    nodeOptions: [],
    selectedNode: null,
    activeModifiers: [],
    pendingEvent: null,
    synergies: [],
    status: 'idle',
    seed: null,
    teamSnapshot: null,
    lastReward: null,
  })

  const battleStatsRef = useRef({ abilitiesUsed: 0, damageDealt: 0, damageTaken: 0 })
  const winStreakRef = useRef(0)
  const pvpMatchIdRef = useRef(null)
  const pendingRankedQueueRef = useRef(null)
  const pvpSearchingRef = useRef(false)
  const autoBattleTimerRef = useRef(null)
  const autoBattleTurnRef = useRef(null)
  const rogueTeamRef = useRef(null)
  const rogueResultRef = useRef(null)
  const combatEventQueueRef = useRef([])
  const combatEventFlushRef = useRef(null)
  const battleLogBufferRef = useRef([])
  const battleLogFlushRef = useRef(null)
  const pvpPollTimersRef = useRef({ match: null, ready: null })

  const getSeasonInfo = (date = new Date()) => {
    const year = date.getUTCFullYear()
    const monthIndex = date.getUTCMonth()
    const seasonStart = new Date(Date.UTC(year, monthIndex, 1))
    const seasonEnd = new Date(Date.UTC(year, monthIndex + 1, 1))
    const seasonId = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    const daysRemaining = Math.max(0, Math.ceil((seasonEnd - date) / 86400000))
    return {
      id: seasonId,
      label: `Season ${seasonId}`,
      start: seasonStart,
      end: seasonEnd,
      daysRemaining,
    }
  }

  const xpForLevel = (level) => 100 + level * 25

  const resetBattleStats = () => {
    battleStatsRef.current = { abilitiesUsed: 0, damageDealt: 0, damageTaken: 0 }
  }

  const getBattleStats = () =>
    battleStatsRef.current || { abilitiesUsed: 0, damageDealt: 0, damageTaken: 0 }

  const clearAutoBattleTimer = () => {
    if (autoBattleTimerRef.current) {
      clearTimeout(autoBattleTimerRef.current)
      autoBattleTimerRef.current = null
    }
  }

  const clearPvpPollTimers = () => {
    if (pvpPollTimersRef.current.match) {
      clearTimeout(pvpPollTimersRef.current.match)
      pvpPollTimersRef.current.match = null
    }
    if (pvpPollTimersRef.current.ready) {
      clearTimeout(pvpPollTimersRef.current.ready)
      pvpPollTimersRef.current.ready = null
    }
  }

  useEffect(() => {
    return () => clearPvpPollTimers()
  }, [])

  const applyXpGain = (currentLevel, currentXp, gain) => {
    let level = Math.max(1, currentLevel || 1)
    let xp = Math.max(0, currentXp || 0) + gain
    let needed = xpForLevel(level)
    while (xp >= needed) {
      xp -= needed
      level += 1
      needed = xpForLevel(level)
    }
    return { level, xp }
  }

  const flushBattleLog = () => {
    const queued = battleLogBufferRef.current
    if (queued.length === 0) return
    battleLogBufferRef.current = []
    setBattleLog(prev => [...prev, ...queued])
  }

  const scheduleBattleLogFlush = () => {
    if (battleLogFlushRef.current) return
    const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : null
    battleLogFlushRef.current = raf
      ? raf(() => {
          battleLogFlushRef.current = null
          flushBattleLog()
        })
      : setTimeout(() => {
          battleLogFlushRef.current = null
          flushBattleLog()
        }, 16)
  }

  const cancelBattleLogFlush = () => {
    if (!battleLogFlushRef.current) return
    const raf = typeof window !== 'undefined' ? window.cancelAnimationFrame : null
    if (raf) {
      raf(battleLogFlushRef.current)
    } else {
      clearTimeout(battleLogFlushRef.current)
    }
    battleLogFlushRef.current = null
  }

  const appendBattleLog = (entries) => {
    if (!entries || entries.length === 0) return
    battleLogBufferRef.current.push(...entries)
    scheduleBattleLogFlush()
  }

  const resetBattleLog = (entries) => {
    battleLogBufferRef.current = []
    cancelBattleLogFlush()
    setBattleLog(entries)
  }

  const flushCombatEvents = () => {
    const queued = combatEventQueueRef.current
    if (queued.length === 0) return
    combatEventQueueRef.current = []
    setCombatEvents(prev => [...prev, ...queued])
  }

  const scheduleCombatEventFlush = () => {
    if (combatEventFlushRef.current) return
    const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : null
    combatEventFlushRef.current = raf
      ? raf(() => {
          combatEventFlushRef.current = null
          flushCombatEvents()
        })
      : setTimeout(() => {
          combatEventFlushRef.current = null
          flushCombatEvents()
        }, 16)
  }

  const pushCombatEvent = (event) => {
    const speed = Math.max(1, battleSpeed || 1)
    const id = `${Date.now()}-${Math.random()}`
    const payload = { id, ...event }
    combatEventQueueRef.current.push(payload)
    scheduleCombatEventFlush()
    setTimeout(() => {
      setCombatEvents(prev => prev.filter(item => item.id !== id))
    }, Math.max(300, Math.floor(800 / speed)))
  }

  const triggerShake = () => {
    const speed = Math.max(1, battleSpeed || 1)
    setBattleShake(true)
    setTimeout(() => setBattleShake(false), Math.max(120, Math.floor(220 / speed)))
  }

  const ensureCombatState = (character) => {
    const next = character
    if (!next.effects) {
      next.effects = { buffs: [], debuffs: [], dots: [], barriers: [] }
    }
    if (!next.states) {
      next.states = { binding: 0, sleep: 0 }
    }
    if (!next.stacks) {
      next.stacks = { speechMark: 0 }
    }
    if (!next.counters) {
      next.counters = { techniqueCount: 0 }
    }
    if (!next.flags) {
      next.flags = { gorillaCoreTurns: 0, flowStateTurns: 0, nextBasicDouble: false }
    }
    if (!next.barrier) {
      next.barrier = { value: 0, duration: 0 }
    }
    return next
  }

  const scaledCharacter = (character, progress) => {
    const level = progress?.level || 1
    const limitBreak = progress?.limit_break || 0
    const hpBonus = (level - 1) * 3 + limitBreak * 12
    const manaBonus = (level - 1) * 2 + limitBreak * 4
    const attackBonus = (level - 1) * 1 + limitBreak * 3
    const defenseBonus = (level - 1) * 1 + limitBreak * 2
    const outputBonus = (level - 1) * 1 + limitBreak * 3
    const resistanceBonus = (level - 1) * 1 + limitBreak * 2

    const next = {
      ...deepCopy(character),
      level,
      xp: progress?.xp || 0,
      limit_break: limitBreak,
      maxHp: character.maxHp + hpBonus,
      hp: character.maxHp + hpBonus,
      maxMana: character.maxMana + manaBonus,
      mana: character.maxMana + manaBonus,
      attack: character.attack + attackBonus,
      defense: (character.defense || 0) + defenseBonus,
      cursedOutput: (character.cursedOutput || 0) + outputBonus,
      cursedResistance: (character.cursedResistance || 0) + resistanceBonus,
    }
    return ensureCombatState(next)
  }

  const buildTeamSnapshot = (teamIds, useProgress = false) =>
    teamIds
      .map(id => characterCatalog.find(character => character.id === id))
      .filter(Boolean)
      .map(character =>
        useProgress
          ? scaledCharacter(character, progressByCharacterId[character.id])
          : ensureCombatState(deepCopy(character))
      )

  const progressByCharacterId = useMemo(() => characterProgress, [characterProgress])
  const isPvp = Boolean(pvpMatch)
  const isRankedMatch = isPvp || Boolean(rankedBotMatch)
  const isMyTurn = isPvp && pvpMatch?.turn_owner === session?.user?.id
  const canAutoBattle = !isRankedMatch
  const seasonInfo = useMemo(() => getSeasonInfo(new Date()), [])
  const storyChapter = useMemo(
    () => storyChapters.find(chapter => chapter.id === storyState.chapterId) || storyChapters[0],
    [storyState.chapterId]
  )
  const storyLoadedRef = useRef(false)

  const clampValue = (value, min, max) => Math.max(min, Math.min(max, value))
  const isActiveWindow = (row, now = new Date()) => {
    if (!row) return false
    const startsAt = row.starts_at ? new Date(row.starts_at) : null
    const endsAt = row.ends_at ? new Date(row.ends_at) : null
    if (startsAt && startsAt > now) return false
    if (endsAt && endsAt < now) return false
    return true
  }

  const rogueBlessings = useMemo(
    () => ([
      {
        id: 'fury',
        name: 'Crimson Fury',
        description: '+12% Attack for all allies.',
        tags: ['assault'],
        effect: { type: 'stat', stat: 'attack', value: 0.12, isPercent: true },
      },
      {
        id: 'bulwark',
        name: 'Stoneward Pact',
        description: '+10% Defense for all allies.',
        tags: ['guard'],
        effect: { type: 'stat', stat: 'defense', value: 0.1, isPercent: true },
      },
      {
        id: 'clarity',
        name: 'Cursed Clarity',
        description: '+15 Max Mana for all allies.',
        tags: ['arcane'],
        effect: { type: 'stat', stat: 'maxMana', value: 15, isPercent: false },
      },
      {
        id: 'deadeye',
        name: 'Deadeye Sigil',
        description: '+8% Crit Chance for all allies.',
        tags: ['precision'],
        effect: { type: 'stat', stat: 'critChance', value: 0.08, isPercent: false },
      },
      {
        id: 'ward',
        name: 'Ward of Sentries',
        description: 'Start each battle with a 30 HP barrier.',
        tags: ['guard'],
        effect: { type: 'barrier', value: 30, duration: 2 },
      },
      {
        id: 'surge',
        name: 'Vital Surge',
        description: 'Heal 12% HP after each floor.',
        tags: ['vitality'],
        effect: { type: 'postBattleHeal', value: 0.12 },
      },
      {
        id: 'spark',
        name: 'Cursed Spark',
        description: 'Restore 20 Mana at battle start.',
        tags: ['arcane'],
        effect: { type: 'startMana', value: 20 },
      },
      {
        id: 'hex',
        name: 'Ruinous Hex',
        description: 'Enemies take +8% damage.',
        tags: ['hex'],
        effect: { type: 'enemyDebuff', stat: 'damageAmp', value: 0.08 },
      },
    ]),
    []
  )

  const rogueSynergies = useMemo(
    () => ([
      {
        id: 'assault',
        name: 'Assault Sigil',
        tag: 'assault',
        threshold: 2,
        description: '+6% Attack (2 Assault blessings)',
        effect: { type: 'stat', stat: 'attack', value: 0.06, isPercent: true },
      },
      {
        id: 'guard',
        name: 'Guardian Sigil',
        tag: 'guard',
        threshold: 2,
        description: '+6% Defense (2 Guard blessings)',
        effect: { type: 'stat', stat: 'defense', value: 0.06, isPercent: true },
      },
      {
        id: 'arcane',
        name: 'Arcane Sigil',
        tag: 'arcane',
        threshold: 2,
        description: '+10 Max Mana (2 Arcane blessings)',
        effect: { type: 'stat', stat: 'maxMana', value: 10, isPercent: false },
      },
      {
        id: 'precision',
        name: 'Precision Sigil',
        tag: 'precision',
        threshold: 2,
        description: '+5% Crit Chance (2 Precision blessings)',
        effect: { type: 'stat', stat: 'critChance', value: 0.05, isPercent: false },
      },
      {
        id: 'vitality',
        name: 'Vitality Sigil',
        tag: 'vitality',
        threshold: 2,
        description: '+8% HP recovery between floors',
        effect: { type: 'postBattleHeal', value: 0.08 },
      },
      {
        id: 'hex',
        name: 'Hex Sigil',
        tag: 'hex',
        threshold: 2,
        description: 'Enemies take +6% damage',
        effect: { type: 'enemyDebuff', stat: 'damageAmp', value: 0.06 },
      },
    ]),
    []
  )

  const rogueEliteModifiers = useMemo(
    () => ([
      {
        id: 'juggernaut',
        name: 'Juggernaut',
        description: 'Enemies gain 25% HP and 15% Defense.',
        stats: { hp: 1.25, defense: 1.15 },
        barrier: 0,
      },
      {
        id: 'ravager',
        name: 'Ravager',
        description: 'Enemies gain 20% Attack and 10% Speed.',
        stats: { attack: 1.2, speed: 1.1 },
        barrier: 0,
      },
      {
        id: 'sorcery',
        name: 'Sorcery Surge',
        description: 'Enemies gain 25% Cursed Technique.',
        stats: { cursedOutput: 1.25 },
        barrier: 0,
      },
      {
        id: 'shielded',
        name: 'Shielded',
        description: 'Enemies begin with a 40 HP barrier.',
        stats: {},
        barrier: 40,
      },
    ]),
    []
  )

  const rogueEvents = useMemo(
    () => ([
      {
        id: 'blood-pact',
        name: 'Blood Pact',
        description: 'Trade your vitality for power.',
        options: [
          { id: 'pact-blessing', label: 'Sacrifice 15% HP, gain a random blessing', effect: 'sacrificeBlessing' },
          { id: 'pact-escape', label: 'Leave with 2 Rogue Tokens', effect: 'token' },
        ],
      },
      {
        id: 'forbidden-altar',
        name: 'Forbidden Altar',
        description: 'A cursed altar hums with energy.',
        options: [
          { id: 'altar-wealth', label: 'Gain 250 Soft Currency', effect: 'soft' },
          { id: 'altar-mana', label: 'Restore team mana and gain a blessing', effect: 'manaBlessing' },
        ],
      },
    ]),
    []
  )

  const rollRogueBlessings = (existing, count = 3) => {
    const existingIds = new Set((existing || []).map(item => item.id))
    const pool = rogueBlessings.filter(item => !existingIds.has(item.id))
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(count, shuffled.length))
  }

  const getRogueSynergies = (blessings) => {
    const counts = {}
    ;(blessings || []).forEach(blessing => {
      ;(blessing.tags || []).forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1
      })
    })
    return rogueSynergies.filter(synergy => (counts[synergy.tag] || 0) >= synergy.threshold)
  }

  const rollRogueNodes = (floor) => {
    if (floor % 5 === 0) {
      return [{
        type: 'boss',
        name: 'Boss Gate',
        description: 'A cursed champion awaits.',
      }]
    }
    const options = [
      { type: 'battle', name: 'Battle', description: 'Standard encounter.' },
      { type: 'elite', name: 'Elite', description: 'Harder fight, better rewards.' },
      { type: 'treasure', name: 'Treasure', description: 'Claim a relic without a fight.' },
      { type: 'event', name: 'Event', description: 'A risky opportunity.' },
    ]
    return options.sort(() => Math.random() - 0.5).slice(0, 3)
  }
  const toggleBattleSpeed = () => {
    setBattleSpeed(prev => (prev >= 2 ? 1 : 2))
  }
  const toggleAutoBattle = () => {
    if (!canAutoBattle) return
    setAutoBattle(prev => !prev)
  }

  const seedFromString = (value) => {
    let hash = 0
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i)
      hash |= 0
    }
    return hash >>> 0
  }

  const mulberry32 = (seed) => () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const buildBotLeaderboard = (seasonId, existingEntries = [], targetCount = 50) => {
    if (existingEntries.length >= targetCount) return existingEntries

    const botNames = [
      'Shadow', 'Bladewind', 'Sandfox', 'Ironleaf', 'Stormfang', 'Nightveil',
      'Ashen', 'Crimson', 'Silent', 'Steel', 'Moonlit', 'Frost', 'Viper',
      'Drift', 'Ember', 'Specter', 'Dawn', 'Torrent', 'Rogue', 'Vortex',
    ]

    const ratings = existingEntries.map(entry => entry.rating ?? 1000)
    const meanRating = ratings.length
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : 1300
    const maxRating = ratings.length ? Math.max(...ratings) : 1750
    const minRating = ratings.length ? Math.min(...ratings) : 950
    const spread = Math.max(160, Math.floor((maxRating - minRating) / 2))

    const seed = seedFromString(`${seasonId}-${existingEntries.length}`)
    const rng = mulberry32(seed)
    const botsNeeded = targetCount - existingEntries.length
    const bots = []

    for (let i = 0; i < botsNeeded; i += 1) {
      const roll = rng()
      let rating = Math.round(meanRating + (rng() - 0.5) * spread * 2)
      if (roll > 0.92) {
        rating = Math.round(maxRating + 80 + rng() * 120)
      } else if (roll < 0.2) {
        rating = Math.round(minRating - rng() * 120)
      }
      rating = clampValue(rating, 900, 1950)

      const name = `${botNames[i % botNames.length]} Bot ${i + 1}`
      bots.push({
        user_id: `bot-${seasonId}-${i + 1}`,
        display_name: name,
        rating,
        updated_at: new Date().toISOString(),
        is_bot: true,
      })
    }

    const combined = [...existingEntries, ...bots]
    return combined.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  }

  const createRankedBot = (playerRating, roster) => {
    const botNames = [
      'Shadowblade', 'Ironleaf', 'Silent Fang', 'Stormveil', 'Crimson Echo',
      'Obsidian', 'Dawnstrike', 'Voidstep', 'Frostbite', 'Nightweaver',
    ]
    const seed = seedFromString(`${seasonInfo.id}-${session?.user?.id}-${Date.now()}`)
    const rng = mulberry32(seed)
    const name = botNames[Math.floor(rng() * botNames.length)]
    const ratingOffset = Math.round((rng() - 0.5) * 220)
    const rating = clampValue((playerRating || 1000) + ratingOffset, 900, 1900)

    const rarityRank = { UR: 4, SSR: 3, SR: 2, R: 1 }
    const sortedRoster = [...roster].sort((a, b) => (rarityRank[b.rarity] || 0) - (rarityRank[a.rarity] || 0))
    const poolSize = rating >= 1600 ? 5 : rating >= 1400 ? 6 : rating >= 1200 ? 7 : sortedRoster.length
    const pool = sortedRoster.slice(0, Math.max(3, poolSize))

    const team = []
    while (team.length < 3 && pool.length > 0) {
      const index = Math.floor(rng() * pool.length)
      team.push(pool.splice(index, 1)[0])
    }

    return {
      id: `ranked-bot-${seed}`,
      name,
      rating,
      team,
    }
  }

  const trackStoryProgress = (nodeId, nextCompletedNodes) => {
    if (!nodeId) return
    trackMissionProgress({ storyNodesCompleted: 1 })

    const chapterNumber = storyChapter?.id?.split('-')[1]
    const chapterNodes = storyChapter?.nodes || []
    const isChapterComplete = chapterNodes.length > 0 &&
      chapterNodes.every(node => nextCompletedNodes.includes(node.id))

    if (isChapterComplete && chapterNumber) {
      trackMissionProgress({ chapterCompleted: chapterNumber })
    }

    const completedChapters = storyChapters.filter(chapter =>
      chapter.nodes.every(node => nextCompletedNodes.includes(node.id))
    ).length
    trackAchievementProgress('chapters_completed', completedChapters)
  }

  const loadLeaderboard = async () => {
    if (!session) return
    setLeaderboardStatus('loading')
    setLeaderboardError(null)
    const { data, error } = await supabase
      .from('pvp_leaderboard')
      .select('user_id, display_name, rating, updated_at')
      .eq('season_id', seasonInfo.id)
      .order('rating', { ascending: false })
      .limit(100)

    if (error) {
      setLeaderboardStatus('error')
      setLeaderboardError(error.message)
      return
    }

    const combined = buildBotLeaderboard(seasonInfo.id, data || [], 50)
    setLeaderboardEntries(combined)
    setLeaderboardStatus('ready')
  }

  const upsertLeaderboardEntry = async (ratingValue) => {
    if (!session || !profile) return
    const payload = {
      user_id: session.user.id,
      season_id: seasonInfo.id,
      display_name: profile.display_name || 'Player',
      rating: ratingValue ?? profile.rating ?? 1000,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('pvp_leaderboard')
      .upsert(payload, { onConflict: 'user_id,season_id' })

    if (error) {
      console.error('Failed to sync leaderboard:', error)
    }
  }

  const startRankedBotMatch = (teamIds, teamState, myRating) => {
    if (!teamState?.length || !characterCatalog.length) return
    const bot = createRankedBot(myRating, characterCatalog)
    let botTeam = bot.team.map(character => ensureCombatState(deepCopy(character)))
    if (botTeam.length < 3) {
      const fallback = characterCatalog
        .filter(character => !botTeam.some(member => member.id === character.id))
        .slice(0, 3 - botTeam.length)
        .map(character => ensureCombatState(deepCopy(character)))
      botTeam = [...botTeam, ...fallback]
    }

    setRankedBotMatch({
      id: bot.id,
      name: bot.name,
      rating: bot.rating,
      teamIds: bot.team.map(character => character.id),
    })

    setPlayerTeam(teamState)
    setEnemyTeam(botTeam)
    setGamePhase('battle')
    resetBattleLog([`Ranked Bot Match vs ${bot.name} (Rating ${bot.rating})`])
    setActedCharacters([])
    setQueuedActions([])
    setStoryBattleConfig(null)
    setPvpStatus(null)
    setPvpMatch(null)
    pvpSearchingRef.current = false
    resetBattleStats()

    if (pvpChannel) {
      pvpChannel.unsubscribe()
      setPvpChannel(null)
    }

    supabase.from('pvp_queue').delete().eq('user_id', session?.user?.id)
  }

  const markStoryNodeCompleted = (nodeId) => {
    if (!nodeId) return
    setStoryState(prev => {
      if (prev.completedNodes.includes(nodeId)) return prev
      const nextCompleted = [...prev.completedNodes, nodeId]
      trackStoryProgress(nodeId, nextCompleted)
      return {
        ...prev,
        completedNodes: nextCompleted,
      }
    })
  }

  const advanceStoryNode = (nodeId) => {
    if (!nodeId) return
    setStoryState(prev => {
      const nodes = storyChapter?.nodes || []
      const index = nodes.findIndex(node => node.id === nodeId)
      const nextActive = nodes[index + 1]?.id || nodeId
      return {
        ...prev,
        activeNodeId: nextActive,
      }
    })
  }

  const completeStoryNode = (nodeId) => {
    setStoryState(prev => {
      if (prev.completedNodes.includes(nodeId)) return prev
      const nodes = storyChapter?.nodes || []
      const index = nodes.findIndex(node => node.id === nodeId)
      const nextActive = nodes[index + 1]?.id || nodeId
      const nextCompleted = [...prev.completedNodes, nodeId]
      trackStoryProgress(nodeId, nextCompleted)
      return {
        ...prev,
        completedNodes: nextCompleted,
        activeNodeId: nextActive,
      }
    })
  }

  const resolveStoryUnit = (unitId) => {
    if (!unitId) return null
    if (storyEnemies[unitId]) return deepCopy(storyEnemies[unitId])
    const match = characterCatalog.find(character => character.id === unitId || character.name === unitId)
    return match ? deepCopy(match) : null
  }

  const applyStoryBuffs = (character, buffs) => {
    if (!buffs) return character
    const next = { ...character }
    if (buffs.hpBonus) {
      next.maxHp += buffs.hpBonus
      next.hp += buffs.hpBonus
    }
    if (buffs.manaBonus) {
      next.maxMana += buffs.manaBonus
      next.mana += buffs.manaBonus
    }
    if (buffs.attackBonus) {
      next.attack += buffs.attackBonus
    }
    return next
  }

  const startStoryBattle = (node) => {
    if (!node?.battle) return
    const battleConfig = node.battle
    resetBattleStats()
    pvpMatchIdRef.current = null
    const playerTeamRaw = battleConfig.playerIds.map(id => resolveStoryUnit(id)).filter(Boolean)
    const enemyTeamRaw = battleConfig.enemyIds.map(id => resolveStoryUnit(id)).filter(Boolean)
    const buffMap = battleConfig.playerBuffs || {}

    const leveledTeam = playerTeamRaw.map(character => {
      if (typeof character.id === 'number') {
        const base = scaledCharacter(character, progressByCharacterId[character.id])
        return applyStoryBuffs(base, buffMap[character.name])
      }
      return applyStoryBuffs(character, buffMap[character.name])
    })

    setPlayerTeam(leveledTeam)
    setEnemyTeam(enemyTeamRaw)
    setStoryBattleConfig({
      nodeId: node.id,
      objective: battleConfig.objective,
      type: battleConfig.type || 'standard',
      turnLimit: battleConfig.turnLimit,
      enemyCannotDie: battleConfig.enemyCannotDie,
      prompts: battleConfig.prompts || [],
      mode: battleConfig.mode,
    })
    setStoryResult(null)
    setGamePhase('battle')
    resetBattleLog([
      `Story Battle: ${node.title}`,
      `Objective: ${battleConfig.objective}`,
      ...battleConfig.prompts.map(prompt => `Tip: ${prompt}`),
    ])
    setTurn(1)
    setActedCharacters([])
    setQueuedActions([])
  }

  const clearStoryResult = () => {
    if (storyResult?.result === 'win' && storyResult.nodeId) {
      advanceStoryNode(storyResult.nodeId)
    }
    setStoryResult(null)
  }

  const claimStoryRewards = async () => {
    if (storyRewardsClaimed || !storyChapter) return
    const softReward = storyChapter.rewards.find(reward => reward.type === 'soft_currency')
    const premiumReward = storyChapter.rewards.find(reward => reward.type === 'premium_currency')
    const softGain = softReward?.amount || 0
    const premiumGain = premiumReward?.amount || 0
    const characterRewards = storyChapter.rewards.filter(reward => reward.type === 'character')
    const itemRewards = storyChapter.rewards.filter(reward => reward.type === 'item')
    const titleRewards = storyChapter.rewards.filter(reward => reward.type === 'title')

    if (session && (softGain > 0 || premiumGain > 0)) {
      const nextSoft = (profile?.soft_currency || 0) + softGain
      const nextPremium = (profile?.premium_currency || 0) + premiumGain
      await supabase
        .from('profiles')
        .update({
          soft_currency: nextSoft,
          premium_currency: nextPremium,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id)
      setProfile(prev => ({
        ...(prev || {}),
        soft_currency: nextSoft,
        premium_currency: nextPremium,
      }))
    }

    if (session && characterRewards.length > 0) {
      const unlockIds = characterRewards
        .map(reward => reward.character_id)
        .filter(Boolean)

      if (unlockIds.length > 0) {
        const existing = new Set(Object.keys(progressByCharacterId).map(Number))
        const missing = unlockIds.filter(id => !existing.has(id))
        if (missing.length > 0) {
          const unlockedCount = Object.keys(progressByCharacterId).length + missing.length
          const payload = missing.map(id => ({
            user_id: session.user.id,
            character_id: id,
            level: 1,
            xp: 0,
            limit_break: 0,
            updated_at: new Date().toISOString(),
          }))
          const { data } = await supabase
            .from('character_progress')
            .upsert(payload, { onConflict: 'user_id,character_id' })
            .select('character_id, level, xp, limit_break')

          if (data) {
            setCharacterProgress(prev => {
              const next = { ...prev }
              data.forEach(row => {
                next[row.character_id] = {
                  level: row.level,
                  xp: row.xp,
                  limit_break: row.limit_break,
                }
              })
              return next
            })
            trackAchievementProgress('characters_unlocked', unlockedCount)
            trackMissionProgress({ charactersUnlocked: unlockedCount })
          }
        }
      }
    }

    if (session && itemRewards.length > 0) {
      const itemUpdates = []
      const itemState = { ...userItems }

      itemRewards.forEach(reward => {
        if (!reward.item_id || !reward.amount) return
        const nextAmount = (itemState[reward.item_id] || 0) + reward.amount
        itemState[reward.item_id] = nextAmount
        itemUpdates.push({
          user_id: session.user.id,
          item_id: reward.item_id,
          quantity: nextAmount,
          updated_at: new Date().toISOString(),
        })
      })

      if (itemUpdates.length > 0) {
        await supabase
          .from('user_items')
          .upsert(itemUpdates, { onConflict: 'user_id,item_id' })
        setUserItems(itemState)
      }
    }

    if (session && titleRewards.length > 0) {
      const titleUpdates = titleRewards
        .map(reward => reward.title_id)
        .filter(Boolean)
        .map(titleId => ({
          user_id: session.user.id,
          title_id: titleId,
          unlocked: true,
          active: false,
          updated_at: new Date().toISOString(),
        }))

      if (titleUpdates.length > 0) {
        const { data } = await supabase
          .from('user_titles')
          .upsert(titleUpdates, { onConflict: 'user_id,title_id' })
          .select()
        if (data) {
          setUserTitles(prev => {
            const merged = [...prev]
            data.forEach(row => {
              if (!merged.some(item => item.title_id === row.title_id)) {
                merged.push(row)
              }
            })
            return merged
          })
        }
      }
    }

    if (softGain > 0) {
      trackMissionProgress({ softCurrencyEarned: softGain })
    }

    setStoryRewardsClaimed(true)
  }

  useEffect(() => {
    if (!session) {
      setCharacterProgress({})
      setCharacterCatalog(defaultCharacters)
      setMatchHistory([])
      setTeamPresets({})
      setMissions([])
      setUserMissions([])
      setShopOffers([])
      setBanners([])
      setBannerItems([])
      setInventory({})
      setUserItems({})
      setUserTitles([])
      setStoryLoaded(false)
      storyLoadedRef.current = false
      return
    }

    const loadProgress = async () => {
      const { data, error } = await supabase
        .from('character_progress')
        .select('character_id, level, xp, limit_break')
        .eq('user_id', session.user.id)

      if (error) return

      const next = {}
      data.forEach(row => {
        next[row.character_id] = { level: row.level, xp: row.xp, limit_break: row.limit_break }
      })
      setCharacterProgress(next)
    }

    loadProgress()
  }, [session])

  useEffect(() => {
    if (!session) return

    const loadCharacters = async () => {
      const { data: characterRows } = await supabase
        .from('characters')
        .select('id, name, rarity, max_hp, max_mana, attack, defense, cursed_output, cursed_resistance, crit_chance, portrait_url, card_art_url')
        .order('id')
      const { data: skillRows } = await supabase
        .from('character_skills')
        .select('id, character_id, skill_key, skill_type, slot, name, description, payload, image_url')
        .order('character_id')

      if (!characterRows || characterRows.length === 0) {
        setCharacterCatalog(defaultCharacters)
        return
      }

      const byCharacter = new Map()
      ;(skillRows || []).forEach(row => {
        if (!byCharacter.has(row.character_id)) {
          byCharacter.set(row.character_id, [])
        }
        byCharacter.get(row.character_id).push(row)
      })

      const buildSkill = (row) => {
        const payload = row.payload || {}
        return {
          id: row.skill_key || `skill-${row.id}`,
          name: row.name,
          description: row.description,
          ...payload,
          currentCooldown: 0,
        }
      }

      const nextCatalog = characterRows.map(row => {
        const skills = byCharacter.get(row.id) || []
        const abilities = skills
          .filter(skill => skill.skill_type === 'ability')
          .sort((a, b) => (a.slot || 0) - (b.slot || 0))
          .map(buildSkill)
        const ultimateRow = skills.find(skill => skill.skill_type === 'ultimate')
        const passiveRow = skills.find(skill => skill.skill_type === 'passive')

        const next = {
          id: row.id,
          name: row.name,
          maxHp: row.max_hp,
          hp: row.max_hp,
          maxMana: row.max_mana,
          mana: row.max_mana,
          attack: row.attack,
          defense: row.defense ?? 0,
          cursedOutput: row.cursed_output ?? 0,
          cursedResistance: row.cursed_resistance ?? 0,
          critChance: row.crit_chance ?? 0,
          rarity: row.rarity,
          portraitUrl: row.portrait_url,
          cardArtUrl: row.card_art_url,
          passive: passiveRow
            ? {
                id: passiveRow.skill_key || `passive-${passiveRow.id}`,
                name: passiveRow.name,
                description: passiveRow.description,
                ...(passiveRow.payload || {}),
              }
            : null,
          abilities,
          ultimate: ultimateRow ? buildSkill(ultimateRow) : null,
        }
        return ensureCombatState(next)
      })

      setCharacterCatalog(nextCatalog)
    }

    loadCharacters()
  }, [session])

  useEffect(() => {
    if (!session) return

    const loadStoryProgress = async () => {
      setStoryLoaded(false)
      const { data, error } = await supabase
        .from('story_progress')
        .select('chapter_id, active_node_id, completed_nodes, rewards_claimed')
        .eq('user_id', session.user.id)
        .eq('chapter_id', storyState.chapterId)
        .maybeSingle()

      if (!error && data) {
        setStoryState(prev => ({
          ...prev,
          chapterId: data.chapter_id || prev.chapterId,
          activeNodeId: data.active_node_id || prev.activeNodeId,
          completedNodes: Array.isArray(data.completed_nodes) ? data.completed_nodes : prev.completedNodes,
        }))
        setStoryRewardsClaimed(Boolean(data.rewards_claimed))
      } else {
        setStoryRewardsClaimed(false)
      }

      setStoryLoaded(true)
      storyLoadedRef.current = true
    }

    loadStoryProgress()
  }, [session, storyState.chapterId])

  useEffect(() => {
    if (!session || !storyLoadedRef.current) return

    const payload = {
      user_id: session.user.id,
      chapter_id: storyState.chapterId,
      active_node_id: storyState.activeNodeId,
      completed_nodes: storyState.completedNodes,
      rewards_claimed: storyRewardsClaimed,
      updated_at: new Date().toISOString(),
    }

    supabase.from('story_progress').upsert(payload, { onConflict: 'user_id,chapter_id' })
  }, [session, storyState.chapterId, storyState.activeNodeId, storyState.completedNodes, storyRewardsClaimed])

  useEffect(() => {
    if (!session) return

    const loadPresets = async () => {
      const { data, error } = await supabase
        .from('team_presets')
        .select('slot, name, character_ids')
        .eq('user_id', session.user.id)

      if (error) return
      const nextPresets = {}
      data.forEach(row => {
        nextPresets[row.slot] = row
      })
      setTeamPresets(nextPresets)
    }

    loadPresets()
  }, [session])

  useEffect(() => {
    if (!session) return

    const loadMeta = async () => {
      const [
        { data: missionData },
        { data: offerData },
        { data: bannerData },
        { data: bannerItemData },
        { data: inventoryData },
        { data: itemData },
        { data: titleData },
      ] = await Promise.all([
        supabase.from('missions').select('*').order('id'),
        supabase.from('shop_offers').select('*').eq('active', true).order('id'),
        supabase.from('banners').select('*').order('id'),
        supabase.from('banner_items').select('*').order('banner_id'),
        supabase.from('user_inventory').select('*').eq('user_id', session.user.id),
        supabase.from('user_items').select('*').eq('user_id', session.user.id),
        supabase.from('user_titles').select('*').eq('user_id', session.user.id),
      ])

      const now = new Date()
      const activeMissions = (missionData || []).filter(mission => isActiveWindow(mission, now))
      const activeBanners = (bannerData || []).filter(banner => isActiveWindow(banner, now))
      const activeBannerIds = new Set(activeBanners.map(banner => banner.id))
      const activeBannerItems = (bannerItemData || []).filter(item => activeBannerIds.has(item.banner_id))

      setMissions(activeMissions)
      setShopOffers(offerData || [])
      setBanners(activeBanners)
      setBannerItems(activeBannerItems)
      const nextInventory = {}
      ;(inventoryData || []).forEach(row => {
        nextInventory[row.character_id] = row.shard_amount
      })
      setInventory(nextInventory)
      const nextItems = {}
      ;(itemData || []).forEach(row => {
        nextItems[row.item_id] = row.quantity
      })
      setUserItems(nextItems)
      setUserTitles(titleData || [])

      const { data: syncedMissions, error: syncError } = await supabase.rpc('sync_user_missions')
      if (syncError) {
        console.error('Failed to sync missions:', syncError)
      } else if (syncedMissions) {
        setUserMissions(syncedMissions)
      }
    }

    loadMeta()
  }, [session])

  const refreshInventory = async () => {
    if (!session) return
    const { data } = await supabase
      .from('user_inventory')
      .select('*')
      .eq('user_id', session.user.id)
    const nextInventory = {}
    ;(data || []).forEach(row => {
      nextInventory[row.character_id] = row.shard_amount
    })
    setInventory(nextInventory)
  }

  const refreshUserItems = async () => {
    if (!session) return
    const { data } = await supabase
      .from('user_items')
      .select('*')
      .eq('user_id', session.user.id)
    const nextItems = {}
    ;(data || []).forEach(row => {
      nextItems[row.item_id] = row.quantity
    })
    setUserItems(nextItems)
  }

  const refreshUserTitles = async () => {
    if (!session) return
    const { data } = await supabase
      .from('user_titles')
      .select('*')
      .eq('user_id', session.user.id)
    setUserTitles(data || [])
  }

  const refreshCharacterProgress = async () => {
    if (!session) return
    const { data } = await supabase
      .from('character_progress')
      .select('character_id, level, xp, limit_break')
      .eq('user_id', session.user.id)
    const next = {}
    ;(data || []).forEach(row => {
      next[row.character_id] = { level: row.level, xp: row.xp, limit_break: row.limit_break }
    })
    setCharacterProgress(next)
  }

  useEffect(() => {
    if (!session) return

    const loadMatchHistory = async () => {
      const { data, error } = await supabase
        .from('match_history')
        .select('id, result, turns, rating_delta, account_xp_gain, character_xp_gain, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) return
      setMatchHistory(data || [])
    }

    loadMatchHistory()
  }, [session])

  // Load daily rewards
  useEffect(() => {
    if (!session) return

    const loadDailyReward = async () => {
      const { data } = await supabase
        .from('daily_rewards')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (data) {
        setDailyReward(data)
      } else {
        // Create initial record
        const { data: newRecord } = await supabase
          .from('daily_rewards')
          .insert({ user_id: session.user.id })
          .select()
          .single()
        setDailyReward(newRecord)
      }
    }

    loadDailyReward()
  }, [session])

  // Load achievements
  useEffect(() => {
    if (!session) return

    const loadAchievements = async () => {
      const [achievementsRes, progressRes] = await Promise.all([
        supabase.from('achievements').select('*').order('category'),
        supabase.from('achievement_progress').select('*').eq('user_id', session.user.id)
      ])

      setAchievements(achievementsRes.data || [])
      setAchievementProgress(progressRes.data || [])
    }

    loadAchievements()
  }, [session])

  useEffect(() => {
    if (!session || !profile) return
    upsertLeaderboardEntry(profile.rating ?? 1000)
  }, [session, profile?.id, profile?.rating, profile?.display_name, seasonInfo.id])

  useEffect(() => {
    if (view !== 'ladder') return
    loadLeaderboard()
  }, [view, session, seasonInfo.id])

  const getEffectsForStat = (character, stat) => {
    const buffs = (character.effects?.buffs || []).filter(effect => effect.stat === stat)
    const debuffs = (character.effects?.debuffs || []).filter(effect => effect.stat === stat)
    return [...buffs, ...debuffs]
  }

  const getStatValue = (character, stat) => {
    const base = character[stat] || 0
    const modifiers = getEffectsForStat(character, stat)
    const percent = modifiers.filter(effect => effect.isPercent).reduce((sum, effect) => sum + effect.value, 0)
    const flat = modifiers.filter(effect => !effect.isPercent).reduce((sum, effect) => sum + effect.value, 0)
    return Math.max(0, Math.floor(base * (1 + percent) + flat))
  }

  const getModifierPercent = (character, stat) => {
    const modifiers = getEffectsForStat(character, stat)
    return modifiers.reduce((sum, effect) => sum + effect.value, 0)
  }

  const addEffect = (character, bucket, effect) => {
    ensureCombatState(character)
    character.effects[bucket].push({
      id: `${effect.stat}-${Date.now()}-${Math.random()}`,
      duration: effect.duration ?? 1,
      ...effect,
    })
  }

  const removeOneDebuff = (character) => {
    ensureCombatState(character)
    if (character.effects.debuffs.length === 0) return false
    character.effects.debuffs.shift()
    return true
  }

  const getEnergyCost = (attacker, ability) => {
    let cost = ability.manaCost || 0
    if (attacker.passive?.manaReduction) {
      cost = Math.floor(cost * (1 - attacker.passive.manaReduction))
    }
    if (attacker.flags?.flowStateTurns > 0) {
      cost = Math.max(0, cost - 10)
    }
    return cost
  }

  const getDefaultScaling = (ability) => {
    switch (ability.type) {
      case 'attack-all':
        return 0.16
      case 'attack-all-primary-mark':
        return 0.15
      case 'attack-stun':
        return 0.18
      case 'attack-execute':
        return 0.22
      case 'attack-random':
        return 0.16
      case 'ultimate-mahito':
        return 0.25
      case 'attack':
      default:
        return 0.2
    }
  }

  const getRawDamage = (attacker, ability) => {
    const baseDamage = ability.damageBase ?? ability.damage ?? 0
    const scaling =
      typeof ability.scaling === 'number'
        ? ability.scaling
        : getDefaultScaling(ability)
    const scalingStat =
      ability.scalingStat || (ability.damageType === 'cursed' ? 'cursedOutput' : 'attack')
    const statValue = getStatValue(attacker, scalingStat)
    let raw = Math.floor(baseDamage + statValue * scaling)
    if (attacker.passive?.type === 'damage-boost') {
      raw = Math.floor(raw * (1 + attacker.passive.value))
    }
    return raw
  }

  const applyDamage = (attacker, target, ability, damageType, baseDamage, teamType, targetIndex, logs, options = {}) => {
    const defenseStat = damageType === 'cursed' ? 'cursedResistance' : 'defense'
    const defense = getStatValue(target, defenseStat)
    let mitigated = Math.floor(baseDamage * (100 / (100 + defense)))
    const amp = getModifierPercent(target, 'damageAmp')
    const reduction = getModifierPercent(target, 'damageReduction')
    mitigated = Math.floor(mitigated * Math.max(0, 1 + amp - reduction))
    if (options.crit) {
      mitigated = Math.floor(mitigated * (ability.critMultiplier || 1.5))
    }

    let remaining = mitigated
    if (target.barrier?.value > 0) {
      const absorbed = Math.min(target.barrier.value, remaining)
      target.barrier.value -= absorbed
      remaining -= absorbed
      if (logs && absorbed > 0) {
        logs.push(`🛡️ ${target.name}'s cursed barrier absorbs ${absorbed} damage.`)
      }
    }

    if (remaining > 0) {
      target.hp = Math.max(0, target.hp - remaining)
      if (teamType === 'enemy') {
        battleStatsRef.current.damageDealt += remaining
      } else if (teamType === 'player') {
        battleStatsRef.current.damageTaken += remaining
      }
      emitDamage(teamType, targetIndex, remaining, remaining >= 45)
      if (logs) {
        logs.push(`⚔️ ${attacker.name} → ${ability.name} → ${target.name} for ${remaining} damage${options.crit ? ' (CRIT)' : ''}!`)
      }
      if (target.states?.sleep > 0) {
        target.states.sleep = 0
        logs.push(`💥 ${target.name} is jolted awake!`)
      }
    }
    return remaining
  }

  const applyRogueBlessingsToTeam = (team, blessings = [], synergies = []) => {
    const combined = [...blessings, ...synergies]
    const applied = deepCopy(team)
    combined.forEach(blessing => {
      const effect = blessing.effect || {}
      if (effect.type === 'stat') {
        applied.forEach(character => {
          if (effect.stat === 'maxMana') {
            const gain = effect.value || 0
            character.maxMana += gain
            character.mana = Math.min(character.maxMana, character.mana + gain)
            return
          }
          if (effect.stat === 'maxHp') {
            const gain = effect.value || 0
            character.maxHp += gain
            character.hp = Math.min(character.maxHp, character.hp + gain)
            return
          }
          addEffect(character, 'buffs', {
            stat: effect.stat,
            value: effect.value,
            isPercent: Boolean(effect.isPercent),
            duration: 99,
          })
        })
      }
      if (effect.type === 'barrier') {
        applied.forEach(character => {
          character.barrier.value += effect.value || 0
          character.barrier.duration = Math.max(character.barrier.duration || 0, effect.duration || 2)
        })
      }
      if (effect.type === 'startMana') {
        applied.forEach(character => {
          const gain = effect.value || 0
          character.mana = Math.min(character.maxMana, character.mana + gain)
        })
      }
    })
    return applied
  }

  const applyRogueBlessingsToEnemies = (team, blessings = [], synergies = []) => {
    const combined = [...blessings, ...synergies]
    const applied = deepCopy(team)
    combined.forEach(blessing => {
      const effect = blessing.effect || {}
      if (effect.type === 'enemyDebuff') {
        applied.forEach(character => {
          addEffect(character, 'debuffs', {
            stat: effect.stat,
            value: effect.value,
            isPercent: true,
            duration: 99,
          })
        })
      }
    })
    return applied
  }

  const applyRogueRecovery = (team, blessings = [], synergies = []) => {
    const combined = [...blessings, ...synergies]
    const healed = deepCopy(team)
    const baseHeal = 0.15
    const bonusHeal = combined
      .filter(blessing => blessing.effect?.type === 'postBattleHeal')
      .reduce((sum, blessing) => sum + (blessing.effect?.value || 0), 0)
    const healPercent = baseHeal + bonusHeal

    healed.forEach(character => {
      if (character.hp <= 0) return
      character.hp = Math.min(character.maxHp, Math.floor(character.hp + character.maxHp * healPercent))
      character.mana = Math.min(character.maxMana, character.mana + 20)
    })

    return healed
  }

  const applyDotEffects = (character, teamType, index, logs) => {
    if (!character.effects?.dots?.length) return
    character.effects.dots.forEach(dot => {
      if (dot.type === 'burn' || dot.type === 'poison') {
        const damage = Math.max(0, dot.damage || 0)
        if (damage > 0 && character.hp > 0) {
          character.hp = Math.max(0, character.hp - damage)
          if (teamType === 'enemy') {
            battleStatsRef.current.damageDealt += damage
          } else if (teamType === 'player') {
            battleStatsRef.current.damageTaken += damage
          }
          emitDamage(teamType, index, damage, false)
          logs.push(`🔥 ${character.name} suffers ${damage} ${dot.type === 'burn' ? 'cursed burn' : 'cursed poison'} damage!`)
        }
      }
    })
  }

  const applySpeechMark = (target, stacks, logs) => {
    ensureCombatState(target)
    target.stacks.speechMark = Math.min(3, (target.stacks.speechMark || 0) + stacks)
    if (target.stacks.speechMark >= 3) {
      addEffect(target, 'debuffs', { stat: 'damageAmp', value: 0.3, isPercent: true, duration: 2 })
      target.stacks.speechMark = 0
      logs.push(`📣 ${target.name} is overwhelmed by Speech Mark!`)
    } else {
      logs.push(`📣 ${target.name} gains Speech Mark (${target.stacks.speechMark}/3).`)
    }
  }

  const applyTargetEffects = (attacker, target, ability, logs) => {
    if (ability.speechMarkStacks) {
      applySpeechMark(target, ability.speechMarkStacks, logs)
    }
    if (ability.defenseDebuffPercent) {
      addEffect(target, 'debuffs', {
        stat: 'defense',
        value: -ability.defenseDebuffPercent,
        isPercent: true,
        duration: ability.defenseDebuffDuration || 2,
      })
      logs.push(`🔻 ${target.name}'s Defense is weakened!`)
    }
    if (ability.attackDebuffPercent) {
      addEffect(target, 'debuffs', {
        stat: 'attack',
        value: -ability.attackDebuffPercent,
        isPercent: true,
        duration: ability.attackDebuffDuration || 2,
      })
      logs.push(`🔻 ${target.name}'s Attack is lowered!`)
    }
    if (ability.damageAmp) {
      addEffect(target, 'debuffs', {
        stat: 'damageAmp',
        value: ability.damageAmp,
        isPercent: true,
        duration: ability.damageAmpDuration || 2,
      })
      logs.push(`🎯 ${target.name} is exposed to curse amplification!`)
    }
    if (ability.selfDefenseBuffPercent) {
      addEffect(attacker, 'buffs', {
        stat: 'defense',
        value: ability.selfDefenseBuffPercent,
        isPercent: true,
        duration: ability.selfDefenseBuffDuration || 2,
      })
      logs.push(`🛡️ ${attacker.name}'s Defense rises!`)
    }
    if (ability.selfAttackBuffPercent) {
      addEffect(attacker, 'buffs', {
        stat: 'attack',
        value: ability.selfAttackBuffPercent,
        isPercent: true,
        duration: ability.selfAttackBuffDuration || 2,
      })
      logs.push(`💪 ${attacker.name}'s Attack surges!`)
    }
  }

  const processTurnStart = (team, teamType, options = {}) => {
    const mutate = options.mutate === true
    const nextTeam = mutate ? team : deepCopy(team)
    const logs = []

    nextTeam.forEach((char, idx) => {
      ensureCombatState(char)
      if (char.hp <= 0) return

      applyDotEffects(char, teamType, idx, logs)

      if (char.passive?.type === 'regen') {
        const healed = Math.min(char.passive.value, char.maxHp - char.hp)
        if (healed > 0) {
          char.hp = Math.min(char.maxHp, char.hp + char.passive.value)
          logs.push(`💚 ${char.name}'s ${char.passive.name} restores ${healed} HP!`)
          emitHeal(teamType, idx, healed)
        }
      }

      const cdReduction = char.passive?.type === 'cooldown-reduction' ? char.passive.value : 0
      if (char.hp > 0 && char.passive?.type !== 'heavenly-restriction') {
        char.mana = Math.min(char.maxMana, char.mana + 25)
      }

      char.abilities.forEach(ab => {
        if (ab.currentCooldown > 0) ab.currentCooldown = Math.max(0, ab.currentCooldown - 1 - cdReduction)
      })
      if (char.ultimate?.currentCooldown > 0) {
        char.ultimate.currentCooldown = Math.max(0, char.ultimate.currentCooldown - 1 - cdReduction)
      }

      if (char.states.binding) char.states.binding = Math.max(0, char.states.binding - 1)
      if (char.states.sleep) char.states.sleep = Math.max(0, char.states.sleep - 1)

      if (char.flags.gorillaCoreTurns > 0) {
        char.flags.gorillaCoreTurns -= 1
        if (char.flags.gorillaCoreTurns === 0) {
          const healed = Math.floor(char.maxHp * 0.15)
          char.hp = Math.min(char.maxHp, char.hp + healed)
          logs.push(`🦍 ${char.name}'s Gorilla Core fades → +${healed} HP!`)
          emitHeal(teamType, idx, healed)
          char.counters.techniqueCount = 0
        }
      }

      if (char.flags.flowStateTurns > 0) {
        char.flags.flowStateTurns -= 1
      }

      if (char.barrier?.duration > 0) {
        char.barrier.duration -= 1
        if (char.barrier.duration <= 0) {
          char.barrier.value = 0
        }
      }

      const decrementBucket = (bucket) => {
        char.effects[bucket] = char.effects[bucket]
          .map(effect => ({ ...effect, duration: effect.duration - 1 }))
          .filter(effect => effect.duration > 0)
      }
      decrementBucket('buffs')
      decrementBucket('debuffs')
      decrementBucket('dots')
    })

    return { team: nextTeam, logs }
  }

  const finalizeBattle = (result, teamSnapshot, newLog = []) => {
    if (newLog.length > 0) {
      appendBattleLog(newLog)
    }
    setGameOver(result === 'win' ? 'win' : 'lose')

    if (rogueState.active) {
      rogueTeamRef.current = deepCopy(teamSnapshot)
      rogueResultRef.current = result
    }

    const battleStats = getBattleStats()
    const nextWinStreak = result === 'win' ? winStreakRef.current + 1 : 0
    winStreakRef.current = nextWinStreak
    const perfectVictory = result === 'win' && battleStats.damageTaken === 0
    const aliveCount = teamSnapshot.filter(character => character.hp > 0).length
    const clutchVictory = result === 'win' && aliveCount === 1 && teamSnapshot.some(character => character.hp === 1)

    if (storyBattleConfig) {
      if (result === 'win') {
        markStoryNodeCompleted(storyBattleConfig.nodeId)
      }
      setStoryResult({ nodeId: storyBattleConfig.nodeId, result })
      setStoryState(prev => ({ ...prev, activeNodeId: storyBattleConfig.nodeId }))
      trackMissionProgress({
        result,
        battlesPlayed: 1,
        abilitiesUsed: battleStats.abilitiesUsed,
        damageDealt: battleStats.damageDealt,
        perfectVictory,
        winStreak: nextWinStreak,
        damageDealtSingleBattle: battleStats.damageDealt,
        abilitiesUsedSingleBattle: battleStats.abilitiesUsed,
        teamSnapshot,
      })
      if (perfectVictory) {
        const previous = getAchievementProgressValue('perfect_victories')
        trackAchievementProgress('perfect_victories', previous + 1)
      }
      if (clutchVictory) {
        const previous = getAchievementProgressValue('clutch_victories')
        trackAchievementProgress('clutch_victories', previous + 1)
      }
      trackAchievementProgress('win_streak', nextWinStreak)
      resetBattleStats()
      return
    }

    awardProgress(result, teamSnapshot, {
      battleStats,
      winStreak: nextWinStreak,
      perfectVictory,
      clutchVictory,
    })
    resetBattleStats()
  }

  const emitDamage = (teamType, index, amount, big = false) => {
    if (amount <= 0 || index == null) return
    pushCombatEvent({ team: teamType, index, amount, type: 'damage', big })
    if (big) triggerShake()
  }

  const emitHeal = (teamType, index, amount) => {
    if (amount <= 0 || index == null) return
    pushCombatEvent({ team: teamType, index, amount, type: 'heal' })
  }

  const applyAbilityToTeams = (characterIndex, abilityIndex, isUltimate, enemyIndex, newPlayerTeam, newEnemyTeam) => {
    const attacker = newPlayerTeam[characterIndex]
    if (!attacker || attacker.hp <= 0) return { logs: [] }

    ensureCombatState(attacker)
    if (attacker.states.binding > 0 || attacker.states.sleep > 0) {
      return { logs: [`⛓️ ${attacker.name} is bound and cannot act!`] }
    }

    const ability = isUltimate ? attacker.ultimate : attacker.abilities[abilityIndex]
    if (!ability) return { logs: [] }

    let newLog = []
    const isGorillaCoreActive = attacker.flags.gorillaCoreTurns > 0

    if (ability.requiresGorillaCore && !isGorillaCoreActive) {
      return { logs: [`⛔ ${attacker.name} cannot use ${ability.name} without Gorilla Core.`] }
    }

    // Put ability on cooldown
    if (isUltimate) {
      newPlayerTeam[characterIndex].ultimate.currentCooldown = ability.cooldown
    } else {
      newPlayerTeam[characterIndex].abilities[abilityIndex].currentCooldown = ability.cooldown
    }

    // Deduct cursed energy
    const energyCost = getEnergyCost(attacker, ability)
    if (attacker.mana < energyCost) {
      return { logs: [`⛔ ${attacker.name} doesn't have enough cursed energy for ${ability.name}.`] }
    }
    newPlayerTeam[characterIndex].mana -= energyCost
    battleStatsRef.current.abilitiesUsed += 1

    const rollCrit = () => {
      if (ability.guaranteedCrit) return true
      const critChance = (attacker.critChance || 0) + (attacker.passive?.critBonus || 0) + getModifierPercent(attacker, 'critChance')
      return Math.random() < critChance
    }

    const shouldDodge = (target) =>
      target.passive?.type === 'dodge-chance' && Math.random() < target.passive.value

    switch (ability.type) {
      case 'attack': {
        if (ability.coreAllEnemies && isGorillaCoreActive) {
          newLog.push(`🦍 ${attacker.name}'s Gorilla Core amplifies ${ability.name}!`)
          const rawDamage = getRawDamage(attacker, ability)
          newEnemyTeam.forEach((enemy, idx) => {
            if (enemy.hp > 0) {
              const crit = rollCrit()
              applyDamage(attacker, enemy, ability, ability.damageType || 'physical', rawDamage, 'enemy', idx, newLog, { crit })
              applyTargetEffects(attacker, enemy, ability, newLog)
            }
          })
          break
        }

        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        if (shouldDodge(target)) {
          newLog.push(`💨 ${target.name} DODGES ${attacker.name}'s ${ability.name}!`)
        } else {
          const crit = rollCrit()
          const rawDamage = getRawDamage(attacker, ability)
          applyDamage(attacker, target, ability, ability.damageType || 'physical', rawDamage, 'enemy', enemyIndex, newLog, { crit })
          if (isGorillaCoreActive && ability.coreDefenseDebuffPercent) {
            addEffect(target, 'debuffs', {
              stat: 'defense',
              value: -ability.coreDefenseDebuffPercent,
              isPercent: true,
              duration: ability.coreDefenseDebuffDuration || 2,
            })
            newLog.push(`🔻 ${target.name}'s Defense is shattered by Gorilla Core!`)
          } else {
            applyTargetEffects(attacker, target, ability, newLog)
          }
          if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)

          if (attacker.passive?.type === 'burn') {
            addEffect(target, 'dots', { stat: 'dot', type: 'burn', damage: attacker.passive.value, duration: 2 })
            newLog.push(`🔥 ${target.name} is afflicted with Cursed Burn!`)
          }

          const shouldDoubleHit =
            (attacker.passive?.type === 'double-hit' && Math.random() < attacker.passive.value) ||
            (ability.isBasic && attacker.flags.flowStateTurns > 0) ||
            (ability.isBasic && attacker.flags.nextBasicDouble)
          if (shouldDoubleHit) {
            applyDamage(attacker, target, ability, ability.damageType || 'physical', rawDamage, 'enemy', enemyIndex, newLog, { crit })
            attacker.flags.nextBasicDouble = false
            if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
          }

          if (ability.onCritCooldownReduction && crit) {
            attacker.abilities.forEach((skill, idx) => {
              if (idx > 0 && skill.currentCooldown > 0) {
                skill.currentCooldown = Math.max(0, skill.currentCooldown - 1)
              }
            })
            newLog.push(`⚡ ${attacker.name}'s momentum reduces cooldowns!`)
          }
        }
        break
      }

      case 'attack-execute': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        if (shouldDodge(target)) {
          newLog.push(`💨 ${target.name} DODGES ${attacker.name}'s ${ability.name}!`)
        } else {
          const rawDamage = getRawDamage(attacker, ability)
          let finalRaw = rawDamage
          if (target.hp / target.maxHp < ability.threshold) {
            finalRaw += ability.bonusDamage || 0
            newLog.push(`💀 Weak point strike!`)
          }
          const crit = rollCrit()
          applyDamage(attacker, target, ability, ability.damageType || 'physical', finalRaw, 'enemy', enemyIndex, newLog, { crit })
          applyTargetEffects(attacker, target, ability, newLog)
          if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
        }
        break
      }
      
      case 'attack-all': {
        if (isUltimate) {
          newLog.push(`🌀 ${attacker.name} unleashes Domain Expansion: ${ability.name}!`)
        } else {
          newLog.push(`🔥 ${attacker.name} uses ${ability.name}!`)
        }
        let hitCount = 0
        const rawDamage = isGorillaCoreActive && ability.coreDamageBase
          ? Math.floor(
              (ability.coreDamageBase || 0) +
                getStatValue(attacker, ability.scalingStat || 'attack') * (ability.coreScaling || ability.scaling || 0)
            )
          : getRawDamage(attacker, ability)
        newEnemyTeam.forEach((enemy, idx) => {
          if (enemy.hp > 0) {
            if (shouldDodge(enemy)) {
              newLog.push(`  💨 ${enemy.name} DODGES!`)
            } else {
              const crit = rollCrit()
              applyDamage(attacker, enemy, ability, ability.damageType || 'physical', rawDamage, 'enemy', idx, newLog, { crit })
              applyTargetEffects(attacker, enemy, ability, newLog)
              hitCount += 1
              if (ability.speechMarkAllStacks) {
                applySpeechMark(enemy, ability.speechMarkAllStacks, newLog)
              }
              if (ability.bindingAllDuration) {
                enemy.states.binding = ability.bindingAllDuration
              }
              if (isGorillaCoreActive && ability.coreBindDuration) {
                enemy.states.binding = ability.coreBindDuration
              }
              if (enemy.hp <= 0) newLog.push(`  🎉 ${enemy.name} defeated!`)
            }
          }
        })
        if (ability.energyRestorePerHit && hitCount > 0) {
          const restore = hitCount * ability.energyRestorePerHit
          attacker.mana = Math.min(attacker.maxMana, attacker.mana + restore)
          newLog.push(`⚡ ${attacker.name} recovers ${restore} cursed energy.`)
        }
        if (ability.recoilPercent) {
          const recoil = Math.floor(attacker.maxHp * ability.recoilPercent)
          attacker.hp = Math.max(1, attacker.hp - recoil)
          newLog.push(`🩸 ${attacker.name} suffers ${recoil} recoil.`)
          emitDamage('player', characterIndex, recoil, false)
        }
        break
      }

      case 'attack-stun': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        if (shouldDodge(target)) {
          newLog.push(`💨 ${target.name} DODGES ${attacker.name}'s ${ability.name}!`)
        } else {
          const crit = rollCrit()
          const rawDamage = getRawDamage(attacker, ability)
          applyDamage(attacker, target, ability, ability.damageType || 'physical', rawDamage, 'enemy', enemyIndex, newLog, { crit })
          applyTargetEffects(attacker, target, ability, newLog)
          target.states.binding = ability.bindingDuration || ability.stunDuration || 1
          newLog.push(`⛓️ ${target.name} is bound!`)
          if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
        }
        break
      }

      case 'stun-only': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        target.states.binding = ability.bindingDuration || ability.stunDuration || 1
        newLog.push(`⛓️ ${attacker.name} → ${ability.name} → ${target.name} bound for ${ability.bindingDuration || ability.stunDuration} turn(s)!`)
        break
      }

      case 'defensive': {
        const barrierValue = ability.barrierValue || Math.max(30, Math.floor(attacker.maxHp * 0.35))
        newPlayerTeam[characterIndex].barrier.value += barrierValue
        newPlayerTeam[characterIndex].barrier.duration = Math.max(newPlayerTeam[characterIndex].barrier.duration, ability.barrierDuration || 1)
        newLog.push(`🛡️ ${attacker.name} raises a Cursed Barrier (${barrierValue}).`)
        break
      }

      case 'buff': {
        addEffect(newPlayerTeam[characterIndex], 'buffs', {
          stat: ability.buffStat || 'attack',
          value: ability.buffAmount ?? 0,
          isPercent: Boolean(ability.isPercent),
          duration: ability.duration || 2,
        })
        newLog.push(`💪 ${attacker.name} uses ${ability.name} → ${ability.buffStat || 'Attack'} reinforced!`)
        break
      }

      case 'buff-self-damage': {
        addEffect(newPlayerTeam[characterIndex], 'buffs', {
          stat: ability.buffStat || 'attack',
          value: ability.buffAmount ?? 0,
          isPercent: Boolean(ability.isPercent),
          duration: ability.duration || 2,
        })
        newPlayerTeam[characterIndex].hp = Math.max(1, newPlayerTeam[characterIndex].hp - (ability.selfDamage || 0))
        newLog.push(`💪 ${attacker.name} pushes beyond limits, trading HP for power!`)
        emitDamage('player', characterIndex, ability.selfDamage || 0, false)
        break
      }

      case 'heal-self': {
        const healValue = ability.healPercent
          ? Math.floor(attacker.maxHp * ability.healPercent)
          : ability.healAmount
        const healed = Math.min(healValue, attacker.maxHp - attacker.hp)
        newPlayerTeam[characterIndex].hp = Math.min(attacker.maxHp, attacker.hp + healed)
        newLog.push(`💚 ${attacker.name} uses ${ability.name} → +${healed} HP!`)
        emitHeal('player', characterIndex, healed)
        if (ability.cleanseDebuff) {
          const removed = removeOneDebuff(newPlayerTeam[characterIndex])
          if (removed) newLog.push(`✨ ${attacker.name} cleanses an affliction!`)
        }
        if (ability.resetTechniqueCounter) {
          newPlayerTeam[characterIndex].counters.techniqueCount = 0
          newLog.push(`🔄 ${attacker.name}'s technique counter resets.`)
        }
        break
      }

      case 'heal-all': {
        newLog.push(`💚 ${attacker.name} uses ${ability.name}!`)
        newPlayerTeam.forEach(ally => {
          if (ally.hp > 0) {
            const healValue = ability.healPercent
              ? Math.floor(ally.maxHp * ability.healPercent)
              : ability.healAmount
            const healed = Math.min(healValue, ally.maxHp - ally.hp)
            ally.hp = Math.min(ally.maxHp, ally.hp + healed)
            if (healed > 0) newLog.push(`  → ${ally.name} +${healed} HP!`)
            if (healed > 0) {
              const allyIndex = newPlayerTeam.findIndex(member => member.id === ally.id)
              emitHeal('player', allyIndex, healed)
            }
          }
        })
        break
      }

      case 'ultimate-megumi': {
        const damage = getRawDamage(attacker, ability)
        newLog.push(`🌑 ${attacker.name} unveils Domain Expansion: ${ability.name}!`)
        newEnemyTeam.forEach((enemy, idx) => {
          if (enemy.hp > 0) {
            applyDamage(attacker, enemy, ability, ability.damageType || 'cursed', damage, 'enemy', idx, newLog)
            if (enemy.hp <= 0) newLog.push(`  🎉 ${enemy.name} defeated!`)
          }
        })
        newPlayerTeam.forEach((ally, idx) => {
          if (ally.hp > 0) {
            const healValue = ability.healPercent
              ? Math.floor(ally.maxHp * ability.healPercent)
              : ability.healAmount
            const healed = Math.min(healValue, ally.maxHp - ally.hp)
            ally.hp = Math.min(ally.maxHp, ally.hp + healed)
            if (healed > 0) newLog.push(`  💚 ${ally.name} +${healed} HP!`)
            if (healed > 0) emitHeal('player', idx, healed)
          }
        })
        break
      }

      case 'ultimate-mahito': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        newPlayerTeam[characterIndex].barrier.value += Math.max(40, Math.floor(attacker.maxHp * 0.25))
        newPlayerTeam[characterIndex].barrier.duration = Math.max(newPlayerTeam[characterIndex].barrier.duration, 1)
        const rawDamage = getRawDamage(attacker, ability)
        applyDamage(attacker, target, ability, ability.damageType || 'cursed', rawDamage, 'enemy', enemyIndex, newLog)
        if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
        break
      }

      case 'debuff-mark': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        addEffect(target, 'debuffs', {
          stat: 'damageAmp',
          value: ability.damageAmp ?? 0.15,
          isPercent: true,
          duration: ability.duration || 2,
        })
        newLog.push(`🎯 ${attacker.name} → ${ability.name} → ${target.name} is afflicted!`)
        break
      }

      case 'attack-all-primary-mark': {
        const primary = newEnemyTeam[enemyIndex]
        if (!primary || primary.hp <= 0) break
        newLog.push(`🔊 ${attacker.name} releases ${ability.name}!`)
        const rawDamage = getRawDamage(attacker, ability)
        newEnemyTeam.forEach((enemy, idx) => {
          if (enemy.hp > 0) {
            applyDamage(attacker, enemy, ability, ability.damageType || 'cursed', rawDamage, 'enemy', idx, newLog)
          }
        })
        if (ability.applySpeechMark) {
          primary.stacks.speechMark = Math.min(3, primary.stacks.speechMark + 1)
          if (primary.stacks.speechMark >= 3) {
            addEffect(primary, 'debuffs', { stat: 'damageAmp', value: 0.3, isPercent: true, duration: 2 })
            primary.stacks.speechMark = 0
            newLog.push(`📣 ${primary.name} is overwhelmed by Speech Mark!`)
          } else {
            newLog.push(`📣 ${primary.name} gains a Speech Mark stack (${primary.stacks.speechMark}/3).`)
          }
        }
        break
      }

      case 'attack-random': {
        const candidates = newEnemyTeam
          .map((enemy, idx) => ({ enemy, idx }))
          .filter(item => item.enemy.hp > 0)
        const count = Math.min(ability.targetCount || 2, candidates.length)
        for (let i = 0; i < count; i += 1) {
          const pickIndex = Math.floor(Math.random() * candidates.length)
          const pick = candidates.splice(pickIndex, 1)[0]
          const rawDamage = getRawDamage(attacker, ability)
          applyDamage(attacker, pick.enemy, ability, ability.damageType || 'physical', rawDamage, 'enemy', pick.idx, newLog)
          applyTargetEffects(attacker, pick.enemy, ability, newLog)
        }
        break
      }

      case 'utility': {
        newLog.push(`🔄 ${attacker.name} uses ${ability.name}!`)
        break
      }

      case 'buff-ally': {
        const aliveAllies = newPlayerTeam.filter((a, i) => a.hp > 0 && i !== characterIndex)
        if (aliveAllies.length > 0) {
          const randomAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)]
          const allyIndex = newPlayerTeam.findIndex(a => a.id === randomAlly.id)
          addEffect(newPlayerTeam[allyIndex], 'buffs', {
            stat: ability.buffStat || 'attack',
            value: ability.buffAmount ?? 0,
            isPercent: Boolean(ability.isPercent),
            duration: ability.duration || 2,
          })
          newLog.push(`💪 ${attacker.name} → ${ability.name} → ${randomAlly.name} reinforced!`)
        }
        break
      }

      default:
        break
    }

    if (ability.grantFlowStateTurns) {
      attacker.flags.flowStateTurns = Math.max(attacker.flags.flowStateTurns, ability.grantFlowStateTurns)
      newLog.push(`🌊 ${attacker.name} enters Flow State!`)
    }

    if (ability.setNextBasicDouble) {
      attacker.flags.nextBasicDouble = true
      newLog.push(`⚔️ ${attacker.name}'s next basic strike will hit twice!`)
    }

    if (attacker.passive?.type === 'gorilla-core' && !ability.isBasic) {
      attacker.counters.techniqueCount += 1
      if (attacker.counters.techniqueCount >= 3 && attacker.flags.gorillaCoreTurns === 0) {
        attacker.flags.gorillaCoreTurns = 2
        attacker.counters.techniqueCount = 0
        newLog.push(`🦍 ${attacker.name} awakens Gorilla Core!`)
      }
    }

    if (attacker.passive?.type === 'heavenly-restriction') {
      const gain = (ability.isBasic ? 15 : 0) + 10
      attacker.mana = Math.min(attacker.maxMana, attacker.mana + gain)
      newLog.push(`⚡ ${attacker.name} recovers ${gain} cursed energy.`)
    }

    return { logs: newLog }
  }

  const queueAbility = (characterIndex, abilityIndex, isUltimate, enemyIndex) => {
    if (gameOver) return
    if (isPvp && !isMyTurn) return
    setQueuedActions(prev => [...prev, { characterIndex, abilityIndex, isUltimate, enemyIndex }])
    setActedCharacters(prev => [...prev, characterIndex])
    setPendingAbility(null)
  }

  const removeQueuedAction = (actionIndex) => {
    setQueuedActions(prev => {
      const next = prev.filter((_, index) => index !== actionIndex)
      const remainingByChar = new Set(next.map(action => action.characterIndex))
      setActedCharacters(current => current.filter(charIndex => remainingByChar.has(charIndex)))
      return next
    })
  }

  const autoTargetAbilityTypes = new Set([
    'attack',
    'attack-stun',
    'stun-only',
    'ultimate-mahito',
    'attack-execute',
    'debuff-mark',
    'attack-all-primary-mark',
    'attack-random',
  ])

  const offensiveAbilityTypes = new Set([
    'attack',
    'attack-stun',
    'attack-execute',
    'attack-all',
    'attack-all-primary-mark',
    'attack-random',
    'ultimate-mahito',
  ])

  const pickAutoAbility = (character) => {
    const abilities = (character.abilities || []).map((ability, abilityIndex) => ({
      ability,
      abilityIndex,
      isUltimate: false,
    }))
    if (character.ultimate) {
      abilities.push({ ability: character.ultimate, abilityIndex: 0, isUltimate: true })
    }

    const available = abilities.filter(({ ability }) => {
      if (!ability || ability.currentCooldown > 0) return false
      if (ability.requiresGorillaCore && character.flags?.gorillaCoreTurns <= 0) return false
      const cost = getEnergyCost(character, ability)
      return cost <= character.mana
    })

    if (available.length === 0) return null

    const scored = available.map(entry => {
      const base = entry.ability.damageBase ?? entry.ability.damage ?? 0
      const offenseBoost = offensiveAbilityTypes.has(entry.ability.type) ? 8 : 0
      const aoeBoost = ['attack-all', 'attack-all-primary-mark'].includes(entry.ability.type) ? 6 : 0
      const ultimateBoost = entry.isUltimate ? 20 : 0
      const supportPenalty = ['defensive', 'utility', 'heal-self'].includes(entry.ability.type) ? -4 : 0
      return { ...entry, score: base + offenseBoost + aoeBoost + ultimateBoost + supportPenalty }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored[0]
  }

  const selectAutoTarget = (team) => {
    let targetIndex = null
    let lowestHp = Infinity
    team.forEach((member, index) => {
      if (member.hp > 0 && member.hp < lowestHp) {
        lowestHp = member.hp
        targetIndex = index
      }
    })
    return targetIndex
  }

  const buildAutoActions = (currentPlayerTeam, currentEnemyTeam) => {
    const actions = []
    currentPlayerTeam.forEach((character, characterIndex) => {
      if (!character || character.hp <= 0) return
      if (character.states?.binding > 0 || character.states?.sleep > 0) return
      const pick = pickAutoAbility(character)
      if (!pick) return
      const needsTarget = autoTargetAbilityTypes.has(pick.ability.type)
      const enemyIndex = needsTarget ? selectAutoTarget(currentEnemyTeam) : null
      actions.push({
        characterIndex,
        abilityIndex: pick.abilityIndex,
        isUltimate: pick.isUltimate,
        enemyIndex,
      })
    })
    return actions
  }


  const endPlayerTurn = (startPlayerTeam = playerTeam, startEnemyTeam = enemyTeam, options = {}) => {
    const mutate = options.mutate === true
    let newLog = []
    let newEnemyTeam = mutate ? startEnemyTeam : deepCopy(startEnemyTeam)
    let newPlayerTeam = mutate ? startPlayerTeam : deepCopy(startPlayerTeam)

    const enemyTurnStart = processTurnStart(newEnemyTeam, 'enemy', { mutate: true })
    newEnemyTeam = enemyTurnStart.team
    newLog.push(...enemyTurnStart.logs)

    // Enemy turn - each alive enemy acts
    const aliveEnemies = newEnemyTeam.filter(e => e.hp > 0 && e.states?.binding === 0)
    
    aliveEnemies.forEach(enemy => {
      const enemyIndex = newEnemyTeam.findIndex(e => e.id === enemy.id)
      const aliveAllies = newPlayerTeam.filter(a => a.hp > 0)
      
      if (aliveAllies.length === 0) return

      const allAbilities = [...enemy.abilities]
      if (enemy.ultimate?.currentCooldown === 0) {
        allAbilities.push({ ...enemy.ultimate, isUlt: true })
      }
      
      const availableAbilities = allAbilities.filter(a => {
        if (a.currentCooldown !== 0) return false
        if (a.requiresGorillaCore && enemy.flags?.gorillaCoreTurns <= 0) return false
        return (getEnergyCost(enemy, a) || 0) <= enemy.mana
      })
      
      if (availableAbilities.length > 0) {
        const randomAbility = availableAbilities[Math.floor(Math.random() * availableAbilities.length)]
        
        // Put on cooldown and deduct cursed energy
        if (randomAbility.isUlt) {
          newEnemyTeam[enemyIndex].ultimate.currentCooldown = randomAbility.cooldown
        } else {
          const abilityIndex = enemy.abilities.findIndex(a => a.id === randomAbility.id)
          if (abilityIndex >= 0) {
            newEnemyTeam[enemyIndex].abilities[abilityIndex].currentCooldown = randomAbility.cooldown
          }
        }
        const energyCost = getEnergyCost(enemy, randomAbility)
        newEnemyTeam[enemyIndex].mana -= energyCost

        // Find target
        const targetIndex = newPlayerTeam.findIndex(a => a.hp > 0)
        const target = newPlayerTeam[targetIndex]

        if (randomAbility.type === 'attack' || randomAbility.type === 'attack-execute' || randomAbility.type === 'attack-stun') {
          if (target.passive?.type === 'dodge-chance' && Math.random() < target.passive.value) {
            newLog.push(`💨 ${target.name} DODGES ${enemy.name}'s ${randomAbility.name}!`)
          } else {
            const rawDamage = getRawDamage(enemy, randomAbility)
            applyDamage(enemy, target, randomAbility, randomAbility.damageType || 'physical', rawDamage, 'player', targetIndex, newLog)
            applyTargetEffects(enemy, target, randomAbility, newLog)
            if (randomAbility.type === 'attack-stun') {
              target.states.binding = randomAbility.bindingDuration || randomAbility.stunDuration || 1
              newLog.push(`⛓️ ${target.name} is bound!`)
            }
            if (target.hp <= 0) newLog.push(`💀 ${target.name} KO'd!`)
          }
        } else if (randomAbility.type === 'attack-all') {
          if (randomAbility.isUlt) {
            newLog.push(`🌀 ${enemy.name} unleashes Domain Expansion: ${randomAbility.name}!`)
          } else {
            newLog.push(`🔥 ${enemy.name} uses ${randomAbility.name}!`)
          }
          const rawDamage = getRawDamage(enemy, randomAbility)
          newPlayerTeam.forEach((ally, idx) => {
            if (ally.hp > 0) {
              applyDamage(enemy, ally, randomAbility, randomAbility.damageType || 'physical', rawDamage, 'player', idx, newLog)
              applyTargetEffects(enemy, ally, randomAbility, newLog)
              if (ally.hp <= 0) newLog.push(`  💀 ${ally.name} KO'd!`)
            }
          })
        } else if (randomAbility.type === 'attack-all-primary-mark') {
          const rawDamage = getRawDamage(enemy, randomAbility)
          newPlayerTeam.forEach((ally, idx) => {
            if (ally.hp > 0) {
              applyDamage(enemy, ally, randomAbility, randomAbility.damageType || 'cursed', rawDamage, 'player', idx, newLog)
            }
          })
          if (target && target.hp > 0 && randomAbility.applySpeechMark) {
            applySpeechMark(target, 1, newLog)
          }
        } else if (randomAbility.type === 'attack-random') {
          const candidates = newPlayerTeam
            .map((ally, idx) => ({ ally, idx }))
            .filter(item => item.ally.hp > 0)
          const count = Math.min(randomAbility.targetCount || 2, candidates.length)
          for (let i = 0; i < count; i += 1) {
            const pickIndex = Math.floor(Math.random() * candidates.length)
            const pick = candidates.splice(pickIndex, 1)[0]
            const rawDamage = getRawDamage(enemy, randomAbility)
            applyDamage(enemy, pick.ally, randomAbility, randomAbility.damageType || 'physical', rawDamage, 'player', pick.idx, newLog)
            applyTargetEffects(enemy, pick.ally, randomAbility, newLog)
          }
        } else if (randomAbility.type === 'heal-self') {
          const healValue = randomAbility.healPercent
            ? Math.floor(enemy.maxHp * randomAbility.healPercent)
            : randomAbility.healAmount
          const healed = Math.min(healValue, enemy.maxHp - enemy.hp)
          newEnemyTeam[enemyIndex].hp = Math.min(enemy.maxHp, enemy.hp + healed)
          newLog.push(`💚 ${enemy.name} heals ${healed} HP!`)
          emitHeal('enemy', enemyIndex, healed)
        } else if (randomAbility.type === 'defensive') {
          const barrierValue = randomAbility.barrierValue || Math.max(30, Math.floor(enemy.maxHp * 0.35))
          newEnemyTeam[enemyIndex].barrier.value += barrierValue
          newEnemyTeam[enemyIndex].barrier.duration = Math.max(newEnemyTeam[enemyIndex].barrier.duration, randomAbility.barrierDuration || 1)
          newLog.push(`🛡️ ${enemy.name} raises a barrier!`)
        }

        if (enemy.passive?.type === 'heavenly-restriction') {
          const gain = (randomAbility.isBasic ? 15 : 0) + 10
          newEnemyTeam[enemyIndex].mana = Math.min(enemy.maxMana, newEnemyTeam[enemyIndex].mana + gain)
          newLog.push(`⚡ ${enemy.name} recovers ${gain} cursed energy.`)
        }
      }
    })

    // Stunned enemy messages
    newEnemyTeam.forEach(enemy => {
      if (enemy.states?.binding && enemy.hp > 0) {
        newLog.push(`⛓️ ${enemy.name} is bound and misses their turn!`)
      }
    })

    const playerTurnStart = processTurnStart(newPlayerTeam, 'player', { mutate: true })
    newPlayerTeam = playerTurnStart.team
    newLog.push(...playerTurnStart.logs)

    setPlayerTeam(newPlayerTeam)
    setEnemyTeam(newEnemyTeam)

    // Check lose condition
    if (newPlayerTeam.every(a => a.hp <= 0)) {
      newLog.push(`☠️ DEFEAT!`)
      finalizeBattle('lose', startPlayerTeam, newLog)
      return
    }

    appendBattleLog(newLog)
    setActedCharacters([])
    setTurn(prev => prev + 1)
  }

  const handleEndTurn = async (overrideActions = null) => {
    if (gamePhase !== 'battle' || gameOver) return
    if (isPvp && !isMyTurn) return
    setPendingAbility(null)
    
    let newEnemyTeam = deepCopy(enemyTeam)
    let newPlayerTeam = deepCopy(playerTeam)
    let newLog = []
    const actionsToRun = overrideActions ?? queuedActions
    const actionsSnapshot = [...actionsToRun]

    actionsToRun.forEach(action => {
      const result = applyAbilityToTeams(
        action.characterIndex,
        action.abilityIndex,
        action.isUltimate,
        action.enemyIndex,
        newPlayerTeam,
        newEnemyTeam
      )
      newLog.push(...result.logs)
    })

    setQueuedActions([])

    if (storyBattleConfig?.enemyCannotDie) {
      let prevented = false
      newEnemyTeam.forEach(enemy => {
        if (enemy.hp <= 0) {
          prevented = true
          enemy.hp = 1
        }
      })
      if (prevented) {
        newLog.push('🛑 The enemy cannot be defeated yet.')
      }
    }

    const canWinByDefeat = !storyBattleConfig || storyBattleConfig.type !== 'survival'
    if (canWinByDefeat && newEnemyTeam.every(e => e.hp <= 0)) {
      newLog.push(`👑 VICTORY!`)
      finalizeBattle('win', newPlayerTeam, newLog)
      return
    }

    if (isPvp && pvpMatch && session) {
      const isPlayer1 = pvpMatch.player1_id === session.user.id
      const opponentId = isPlayer1 ? pvpMatch.player2_id : pvpMatch.player1_id
      const baseLog = pvpMatch.state?.log || battleLog

      const playerTurnStart = processTurnStart(newPlayerTeam, 'player', { mutate: true })
      newPlayerTeam = playerTurnStart.team
      newLog.push(...playerTurnStart.logs)

      const enemyTurnStart = processTurnStart(newEnemyTeam, 'enemy', { mutate: true })
      newEnemyTeam = enemyTurnStart.team
      newLog.push(...enemyTurnStart.logs)

      if (newEnemyTeam.every(e => e.hp <= 0)) {
        const finalState = {
          player1Team: isPlayer1 ? newPlayerTeam : newEnemyTeam,
          player2Team: isPlayer1 ? newEnemyTeam : newPlayerTeam,
          turn: pvpMatch.state?.turn || turn,
          log: [...baseLog, ...newLog, '👑 VICTORY!'],
        }
        const { error: winError } = await supabase.rpc('pvp_complete_match', {
          match_id: pvpMatch.id,
          final_state: finalState,
          winner_id: session.user.id,
        })
        if (winError) {
          console.error('Failed to complete match:', winError)
          setPvpStatus('error')
          appendBattleLog([...newLog, 'Match update failed. Try again.'])
          return
        }
        finalizeBattle('win', newPlayerTeam, [])
        return
      }

      if (newPlayerTeam.every(e => e.hp <= 0)) {
        const finalState = {
          player1Team: isPlayer1 ? newPlayerTeam : newEnemyTeam,
          player2Team: isPlayer1 ? newEnemyTeam : newPlayerTeam,
          turn: pvpMatch.state?.turn || turn,
          log: [...baseLog, ...newLog, '☠️ DEFEAT!'],
        }
        const { error: loseError } = await supabase.rpc('pvp_complete_match', {
          match_id: pvpMatch.id,
          final_state: finalState,
          winner_id: opponentId,
        })
        if (loseError) {
          console.error('Failed to complete match:', loseError)
          setPvpStatus('error')
          appendBattleLog([...newLog, 'Match update failed. Try again.'])
          return
        }
        finalizeBattle('lose', newPlayerTeam, [])
        return
      }

      const nextTurn = (pvpMatch.state?.turn || turn) + 1
      const nextState = {
        player1Team: isPlayer1 ? newPlayerTeam : newEnemyTeam,
        player2Team: isPlayer1 ? newEnemyTeam : newPlayerTeam,
        turn: nextTurn,
        log: [...baseLog, ...newLog],
      }

      const { error: submitError } = await supabase.rpc('pvp_submit_turn', {
        match_id: pvpMatch.id,
        next_state: nextState,
        next_turn: nextTurn,
        actions: { queuedActions: actionsSnapshot },
      })
      if (submitError) {
        console.error('Failed to submit turn:', submitError)
        setPvpStatus('error')
        appendBattleLog([...newLog, 'Turn submission failed. Try again.'])
        return
      }

      resetBattleLog(nextState.log)
      setPlayerTeam(newPlayerTeam)
      setEnemyTeam(newEnemyTeam)
      setActedCharacters([])
      setTurn(nextTurn)
      return
    }

    appendBattleLog(newLog)
    endPlayerTurn(newPlayerTeam, newEnemyTeam, { mutate: true })
  }

  useEffect(() => {
    if (!autoBattle) return
    if (!canAutoBattle) {
      setAutoBattle(false)
      return
    }
    setQueuedActions([])
    setActedCharacters([])
    setPendingAbility(null)
  }, [autoBattle, canAutoBattle])

  useEffect(() => {
    if (!autoBattle || !canAutoBattle) {
      clearAutoBattleTimer()
      autoBattleTurnRef.current = null
      return
    }
    if (gamePhase !== 'battle' || gameOver) {
      clearAutoBattleTimer()
      return
    }
    if (autoBattleTurnRef.current === turn) return

    const actions = buildAutoActions(playerTeam, enemyTeam)
    autoBattleTurnRef.current = turn
    clearAutoBattleTimer()
    const speed = Math.max(1, battleSpeed || 1)
    const delay = Math.max(220, Math.floor(450 / speed))

    autoBattleTimerRef.current = setTimeout(() => {
      handleEndTurn(actions)
    }, delay)

    return () => clearAutoBattleTimer()
  }, [autoBattle, canAutoBattle, gamePhase, gameOver, turn, playerTeam, enemyTeam, battleSpeed])

  const resetBattleState = () => {
    setGamePhase('select')
    setPlayerTeam([])
    setEnemyTeam([])
    setSelectedEnemy(null)
    resetBattleLog(["Battle Start! Queue actions, then End Turn."])
    setGameOver(null)
    setTurn(1)
    setActedCharacters([])
    setPendingAbility(null)
    setQueuedActions([])
    setMatchSummary(null)
    setStoryBattleConfig(null)
    setPvpMatch(null)
    setPvpStatus(null)
    setBattleResult(null)
    setRankedBotMatch(null)
    resetBattleStats()
    pvpMatchIdRef.current = null
    pvpSearchingRef.current = false
    pendingRankedQueueRef.current = null
    autoBattleTurnRef.current = null
    clearAutoBattleTimer()
    clearPvpPollTimers()
    if (pvpChannel) {
      pvpChannel.unsubscribe()
      setPvpChannel(null)
    }
  }

  const startRogueRun = () => {
    if (selectedPlayerTeam.length === 0) return
    const seed = Date.now()
    const nextFloor = 1
    setRogueState({
      active: true,
      floor: nextFloor,
      maxFloors: 10,
      blessings: [],
      pendingBlessings: [],
      nodeOptions: rollRogueNodes(nextFloor),
      selectedNode: null,
      activeModifiers: [],
      pendingEvent: null,
      synergies: [],
      status: 'node-select',
      seed,
      teamSnapshot: null,
      lastReward: null,
    })
    rogueTeamRef.current = null
    rogueResultRef.current = null
    setView('rogue')
  }

  const abandonRogueRun = () => {
    setRogueState(prev => ({
      ...prev,
      active: false,
      status: 'idle',
      floor: 0,
      blessings: [],
      pendingBlessings: [],
      nodeOptions: [],
      selectedNode: null,
      activeModifiers: [],
      pendingEvent: null,
      synergies: [],
      teamSnapshot: null,
      lastReward: null,
    }))
    rogueTeamRef.current = null
    rogueResultRef.current = null
  }

  const rollRogueModifiers = (floor, nodeType) => {
    if (nodeType === 'boss') return rogueEliteModifiers.sort(() => Math.random() - 0.5).slice(0, 2)
    if (nodeType === 'elite') return rogueEliteModifiers.sort(() => Math.random() - 0.5).slice(0, 1)
    return []
  }

  const generateRogueEnemyTeam = (floor, nodeType, modifiers = []) => {
    const pool = characterCatalog.length > 0 ? characterCatalog : defaultCharacters
    const enemyCount = Math.min(3, pool.length)
    const selected = [...pool].sort(() => Math.random() - 0.5).slice(0, enemyCount)
    const baseMultiplier = 0.9 + floor * 0.08
    const bossMultiplier = nodeType === 'boss' ? 1.35 : 1
    const eliteMultiplier = nodeType === 'elite' ? 1.2 : 1
    const multiplier = baseMultiplier * bossMultiplier * eliteMultiplier

    return selected.map(character => {
      const baseChar = ensureCombatState(deepCopy(character))
      let hp = Math.floor(baseChar.hp * multiplier)
      let defense = Math.floor(baseChar.defense * multiplier)
      let attack = Math.floor(baseChar.attack * multiplier)
      let cursedOutput = Math.floor(baseChar.cursedOutput * multiplier)
      let cursedResistance = Math.floor(baseChar.cursedResistance * multiplier)
      let speed = Math.floor(baseChar.speed * multiplier)

      modifiers.forEach(mod => {
        const stats = mod.stats || {}
        if (stats.hp) hp = Math.floor(hp * stats.hp)
        if (stats.defense) defense = Math.floor(defense * stats.defense)
        if (stats.attack) attack = Math.floor(attack * stats.attack)
        if (stats.cursedOutput) cursedOutput = Math.floor(cursedOutput * stats.cursedOutput)
        if (stats.cursedResistance) cursedResistance = Math.floor(cursedResistance * stats.cursedResistance)
        if (stats.speed) speed = Math.floor(speed * stats.speed)
      })

      baseChar.hp = hp
      baseChar.maxHp = baseChar.hp
      baseChar.mana = Math.floor(baseChar.mana * multiplier)
      baseChar.maxMana = baseChar.mana
      baseChar.attack = attack
      baseChar.defense = defense
      baseChar.cursedOutput = cursedOutput
      baseChar.cursedResistance = cursedResistance
      baseChar.speed = speed

      modifiers.forEach(mod => {
        if (mod.barrier) {
          baseChar.barrier.value += mod.barrier
          baseChar.barrier.duration = Math.max(baseChar.barrier.duration || 0, 2)
        }
      })
      return baseChar
    })
  }

  const grantRogueReward = async (reward) => {
    if (!reward) return
    const softGain = reward.soft || 0
    const premiumGain = reward.premium || 0
    const tokenGain = reward.tokens || 0

    if (session && profile) {
      const nextSoft = (profile.soft_currency || 0) + softGain
      const nextPremium = (profile.premium_currency || 0) + premiumGain
      const { error } = await supabase
        .from('profiles')
        .update({
          soft_currency: nextSoft,
          premium_currency: nextPremium,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id)
      if (!error) {
        setProfile(prev => ({
          ...(prev || {}),
          soft_currency: nextSoft,
          premium_currency: nextPremium,
        }))
      }
    }

    if (session && tokenGain > 0) {
      const nextTokens = (userItems?.rogue_token || 0) + tokenGain
      await supabase
        .from('user_items')
        .upsert({
          user_id: session.user.id,
          item_id: 'rogue_token',
          quantity: nextTokens,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,item_id' })
      setUserItems(prev => ({ ...prev, rogue_token: nextTokens }))
    }

    setRogueState(prev => ({ ...prev, lastReward: reward }))
  }

  const chooseRogueNode = (node) => {
    if (!rogueState.active) return
    if (node.type === 'treasure') {
      const reward = { soft: 150 + rogueState.floor * 15, premium: 0, tokens: 2 }
      grantRogueReward(reward)
      const nextBlessing = rollRogueBlessings(rogueState.blessings, 1)
      setRogueState(prev => ({
        ...prev,
        status: 'reward',
        pendingBlessings: nextBlessing,
        selectedNode: node,
        nodeOptions: [],
        activeModifiers: [],
        pendingEvent: null,
      }))
      return
    }

    if (node.type === 'event') {
      const event = rogueEvents[Math.floor(Math.random() * rogueEvents.length)]
      setRogueState(prev => ({
        ...prev,
        status: 'event',
        pendingEvent: event,
        selectedNode: node,
        nodeOptions: [],
      }))
      return
    }

    setRogueState(prev => ({
      ...prev,
      status: 'ready',
      selectedNode: node,
      nodeOptions: [],
      activeModifiers: [],
      pendingEvent: null,
    }))
  }

  const resolveRogueEvent = async (option) => {
    if (!rogueState.active || !rogueState.pendingEvent) return
    const result = option.effect
    const nextBlessings = []
    let reward = null
    let teamSnapshot = rogueState.teamSnapshot

    if (result === 'sacrificeBlessing') {
      if (teamSnapshot) {
        const nextTeam = deepCopy(teamSnapshot)
        nextTeam.forEach(member => {
          member.hp = Math.max(1, Math.floor(member.hp * 0.85))
        })
        teamSnapshot = nextTeam
      }
      nextBlessings.push(...rollRogueBlessings(rogueState.blessings, 1))
    }

    if (result === 'token') {
      reward = { soft: 0, premium: 0, tokens: 2 }
    }

    if (result === 'soft') {
      reward = { soft: 250, premium: 0, tokens: 0 }
    }

    if (result === 'manaBlessing') {
      if (teamSnapshot) {
        const nextTeam = deepCopy(teamSnapshot)
        nextTeam.forEach(member => {
          member.mana = Math.min(member.maxMana, member.mana + 30)
        })
        teamSnapshot = nextTeam
      }
      nextBlessings.push(...rollRogueBlessings(rogueState.blessings, 1))
    }

    if (reward) {
      await grantRogueReward(reward)
    }

    const nextFloor = nextBlessings.length > 0 ? rogueState.floor : rogueState.floor + 1
    const shouldComplete = nextFloor > rogueState.maxFloors

    setRogueState(prev => ({
      ...prev,
      floor: nextFloor > prev.maxFloors ? prev.maxFloors : nextFloor,
      status: shouldComplete ? 'complete' : (nextBlessings.length > 0 ? 'reward' : 'node-select'),
      pendingBlessings: nextBlessings,
      pendingEvent: null,
      teamSnapshot,
      selectedNode: null,
      activeModifiers: [],
      nodeOptions: shouldComplete || nextBlessings.length > 0 ? [] : rollRogueNodes(nextFloor),
    }))
    if (shouldComplete) {
      setView('rogue')
    }
  }

  const startRogueBattle = () => {
    if (!rogueState.active) return
    if (selectedPlayerTeam.length === 0 && !rogueState.teamSnapshot) return

    resetBattleStats()
    const selectedNode = rogueState.selectedNode || { type: 'battle' }
    const modifiers = rollRogueModifiers(rogueState.floor, selectedNode.type)
    const baseTeam = rogueState.teamSnapshot
      ? deepCopy(rogueState.teamSnapshot)
      : selectedPlayerTeam.map(character =>
          scaledCharacter(character, progressByCharacterId[character.id])
        )

    let playerSnapshot = baseTeam.map(character => ensureCombatState(deepCopy(character)))
    const synergies = getRogueSynergies(rogueState.blessings)
    playerSnapshot = applyRogueBlessingsToTeam(playerSnapshot, rogueState.blessings, synergies)

    let enemySnapshot = generateRogueEnemyTeam(rogueState.floor, selectedNode.type, modifiers)
    enemySnapshot = applyRogueBlessingsToEnemies(enemySnapshot, rogueState.blessings, synergies)

    setPlayerTeam(playerSnapshot)
    setEnemyTeam(enemySnapshot)
    setGamePhase('battle')
    resetBattleLog([
      `Roguelike Floor ${rogueState.floor}${selectedNode.type === 'boss' ? ' — Boss' : ''}`,
    ])
    setActedCharacters([])
    setQueuedActions([])
    setStoryBattleConfig(null)
    setRogueState(prev => ({
      ...prev,
      status: 'in-battle',
      activeModifiers: modifiers,
      selectedNode,
      synergies,
    }))
  }

  const handleRogueBattleContinue = async () => {
    const result = rogueResultRef.current || battleResult?.result
    const teamSnapshot = rogueTeamRef.current || playerTeam
    setBattleResult(null)
    resetBattleState()

    if (!rogueState.active) return

    if (result !== 'win') {
      setRogueState(prev => ({
        ...prev,
        active: false,
        status: 'failed',
        pendingBlessings: [],
        teamSnapshot: null,
      }))
      setView('rogue')
      return
    }

    const synergies = getRogueSynergies(rogueState.blessings)
    const healedTeam = applyRogueRecovery(teamSnapshot, rogueState.blessings, synergies)
    const isFinal = rogueState.floor >= rogueState.maxFloors
    const nodeType = rogueState.selectedNode?.type || 'battle'
    const reward = {
      soft: 120 + rogueState.floor * 20 + (nodeType === 'elite' ? 60 : 0) + (nodeType === 'boss' ? 120 : 0),
      premium: nodeType === 'boss' ? 2 : 0,
      tokens: 2 + (nodeType === 'elite' ? 2 : 0) + (nodeType === 'boss' ? 5 : 0),
    }

    await grantRogueReward(reward)

    if (isFinal) {
      setRogueState(prev => ({
        ...prev,
        status: 'complete',
        teamSnapshot: healedTeam,
        pendingBlessings: [],
        lastReward: reward,
        selectedNode: null,
      }))
      setView('rogue')
      return
    }

    const blessingCount = nodeType === 'elite' ? 4 : 3
    const nextBlessings = rollRogueBlessings(rogueState.blessings, blessingCount)
    setRogueState(prev => ({
      ...prev,
      status: 'reward',
      pendingBlessings: nextBlessings,
      teamSnapshot: healedTeam,
      lastReward: reward,
      selectedNode: null,
    }))
    setView('rogue')
  }

  const chooseRogueBlessing = (blessing) => {
    if (!rogueState.active) return
    const nextFloor = rogueState.floor + 1
    const nextBlessings = [...rogueState.blessings, blessing]
    const nextSynergies = getRogueSynergies(nextBlessings)
    setRogueState(prev => ({
      ...prev,
      floor: nextFloor,
      blessings: nextBlessings,
      pendingBlessings: [],
      status: 'node-select',
      nodeOptions: rollRogueNodes(nextFloor),
      selectedNode: null,
      activeModifiers: [],
      pendingEvent: null,
      synergies: nextSynergies,
    }))
  }

  useEffect(() => {
    if (!storyBattleConfig || gamePhase !== 'battle' || gameOver) return
    if (storyBattleConfig.type !== 'survival') return
    if (turn > storyBattleConfig.turnLimit) {
      const newLog = [`✅ Objective complete! Survived ${storyBattleConfig.turnLimit} turns.`]
      finalizeBattle('win', playerTeam, newLog)
    }
  }, [turn, storyBattleConfig, gamePhase, gameOver, playerTeam])

  const resetGame = () => {
    setGamePhase('select')
    setSelectedPlayerTeam([])
    setPlayerTeam([])
    setEnemyTeam([])
    setSelectedEnemy(null)
    resetBattleLog(["Battle Start! Queue actions, then End Turn."])
    setGameOver(null)
    setTurn(1)
    setActedCharacters([])
    setPendingAbility(null)
    setQueuedActions([])
    setMatchSummary(null)
    setStoryBattleConfig(null)
    setPvpMatch(null)
    setPvpStatus(null)
    setBattleResult(null)
    setRankedBotMatch(null)
    resetBattleStats()
    pvpMatchIdRef.current = null
    pvpSearchingRef.current = false
    pendingRankedQueueRef.current = null
    autoBattleTurnRef.current = null
    clearAutoBattleTimer()
    clearPvpPollTimers()
    if (pvpChannel) {
      pvpChannel.unsubscribe()
      setPvpChannel(null)
    }
  }

  const exitStoryBattle = () => {
    setGamePhase('select')
    setPlayerTeam([])
    setEnemyTeam([])
    setSelectedEnemy(null)
    resetBattleLog(["Battle Start! Queue actions, then End Turn."])
    setGameOver(null)
    setTurn(1)
    setActedCharacters([])
    setPendingAbility(null)
    setQueuedActions([])
    setMatchSummary(null)
    setStoryBattleConfig(null)
    setView('story')
    setRankedBotMatch(null)
    resetBattleStats()
    pvpSearchingRef.current = false
    pendingRankedQueueRef.current = null
    autoBattleTurnRef.current = null
    clearAutoBattleTimer()
    clearPvpPollTimers()
  }

  const startBattleWithOpponents = ({ opponents, difficulty }) => {
    resetBattleStats()
    pvpMatchIdRef.current = null
    setRankedBotMatch(null)
    // Scale player team based on their progress
    const leveledTeam = selectedPlayerTeam.map(character =>
      scaledCharacter(character, progressByCharacterId[character.id])
    )
    setPlayerTeam(leveledTeam)

    // Scale enemy team based on difficulty
    const enemyTeam = opponents.map(character => {
      const baseChar = deepCopy(character)
      const multiplier = difficulty.statMultiplier

      // Apply difficulty multiplier to base stats
      baseChar.hp = Math.floor(baseChar.hp * multiplier)
      baseChar.currentHp = baseChar.hp
      baseChar.mana = Math.floor(baseChar.mana * multiplier)
      baseChar.currentMana = baseChar.mana
      baseChar.attack = Math.floor(baseChar.attack * multiplier)
      baseChar.defense = Math.floor(baseChar.defense * multiplier)
      baseChar.speed = Math.floor(baseChar.speed * multiplier)

      // Store difficulty info for rewards calculation
      baseChar.difficultyMultiplier = {
        xp: difficulty.xpMultiplier,
        currency: difficulty.currencyMultiplier
      }

      return ensureCombatState(baseChar)
    })

    setEnemyTeam(enemyTeam)
    setGamePhase('battle')
    resetBattleLog([`Battle Start! Difficulty: ${difficulty.label}`])
    setActedCharacters([])
    setQueuedActions([])
    setStoryBattleConfig(null)
  }

  const syncBattleFromMatch = (match) => {
    if (!match || !session) return
    setRankedBotMatch(null)
    if (pvpMatchIdRef.current !== match.id) {
      resetBattleStats()
      pvpMatchIdRef.current = match.id
    }
    const isPlayer1 = match.player1_id === session.user.id
    const state = match.state || {}
    const player1Team = state.player1Team || buildTeamSnapshot(match.player1_team || [], false)
    const player2Team = state.player2Team || buildTeamSnapshot(match.player2_team || [], false)
    setPlayerTeam(deepCopy(isPlayer1 ? player1Team : player2Team))
    setEnemyTeam(deepCopy(isPlayer1 ? player2Team : player1Team))
    resetBattleLog(state.log?.length ? state.log : ["PvP Match Start!"])
    setTurn(state.turn || match.turn || 1)
    setQueuedActions([])
    setActedCharacters([])
    setPendingAbility(null)
    setGameOver(null)
    setGamePhase('battle')
    setStoryBattleConfig(null)
  }

  const subscribeToMatch = (matchId) => {
    if (!matchId) return
    if (pvpChannel) {
      pvpChannel.unsubscribe()
    }
    const channel = supabase
      .channel(`pvp-match-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pvp_matches', filter: `id=eq.${matchId}` },
        (payload) => {
          setPvpMatch(payload.new)
          syncBattleFromMatch(payload.new)
          if (payload.new.status === 'completed' && payload.new.winner_id && session) {
            const result = payload.new.winner_id === session.user.id ? 'win' : 'lose'
            finalizeBattle(result, playerTeam, [])
          }
        }
      )
      .subscribe()
    setPvpChannel(channel)
  }

  const startPvpQueue = async (mode) => {
    if (!session || selectedPlayerTeam.length < 3) return
    clearPvpPollTimers()
    setPvpStatus('searching')
    setRankedBotMatch(null)
    pvpSearchingRef.current = true

    const teamIds = selectedPlayerTeam.map(character => character.id)
    const teamState = buildTeamSnapshot(teamIds, true)
    const myRating = profile?.rating || 1000
    pendingRankedQueueRef.current = mode === 'ranked' ? { teamIds, teamState, rating: myRating } : null

    // Clean up old queue entries first
    await supabase.from('pvp_queue').delete().eq('user_id', session.user.id)

    // Find ELO-appropriate opponent (±200 rating for ranked, anyone for quick)
    const ratingRange = mode === 'ranked' ? 200 : 999999
    const { data: opponentRows } = await supabase
      .from('pvp_queue')
      .select('*')
      .eq('mode', mode)
      .neq('user_id', session.user.id)
      .gte('rating', myRating - ratingRange)
      .lte('rating', myRating + ratingRange)
      .order('created_at', { ascending: true })
      .limit(1)

    const opponent = opponentRows?.[0]

    if (opponent) {
      pvpSearchingRef.current = false
      // IMMEDIATE MATCH FOUND - Create match with 'waiting' status
      try {
        // Delete both queue entries atomically
        await Promise.all([
          supabase.from('pvp_queue').delete().eq('id', opponent.id),
          supabase.from('pvp_queue').delete().eq('user_id', session.user.id)
        ])

        const opponentTeam = Array.isArray(opponent.team_state) && opponent.team_state.length
          ? opponent.team_state
          : buildTeamSnapshot(opponent.team_ids || [], false)

        const payload = {
          mode,
          player1_id: opponent.user_id,
          player2_id: session.user.id,
          player1_team: opponent.team_ids || [],
          player2_team: teamIds,
          player1_rating: opponent.rating || 1000,
          player2_rating: myRating,
          state: {
            player1Team: opponentTeam,
            player2Team: teamState,
            turn: 1,
            log: ["PvP Match Start! Queue actions, then End Turn."],
          },
          turn: 1,
          turn_owner: opponent.user_id,
          status: 'waiting', // Player 1 needs to confirm
          player1_ready: false,
          player2_ready: true, // Player 2 (us) is ready
          updated_at: new Date().toISOString(),
        }

        const { data: matchData, error: insertError } = await supabase
          .from('pvp_matches')
          .insert(payload)
          .select()
          .single()

        if (insertError) throw insertError

        if (matchData) {
          setPvpMatch(matchData)
          setPvpStatus('match_found')

          // Start polling for Player 1 confirmation
          pollForMatchReady(matchData.id)
        }
      } catch (error) {
        console.error('Failed to create match:', error)
        setPvpStatus('error')
        setTimeout(() => setPvpStatus(null), 3000)
      }
      return
    }

    // NO OPPONENT - Join queue and wait
    try {
      await supabase.from('pvp_queue').insert({
        user_id: session.user.id,
        mode,
        team_ids: teamIds,
        team_state: teamState,
        rating: myRating,
      })

      setPvpStatus('searching')

      // Set up Realtime subscription for match creation
      if (pvpChannel) {
        pvpChannel.unsubscribe()
        setPvpChannel(null)
      }

      const lobbyChannel = supabase
        .channel(`pvp-lobby-${session.user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pvp_matches' }, async (payload) => {
          const match = payload.new
          if (match.player1_id === session.user.id || match.player2_id === session.user.id) {
            setPvpMatch(match)
            setPvpStatus('match_found')

            // We are Player 1, confirm we're ready
            const isPlayer1 = match.player1_id === session.user.id
            if (isPlayer1) {
              await supabase.rpc('pvp_set_ready', { match_id: match.id })
            }

            // Clean up queue and start polling for both players ready
            await supabase.from('pvp_queue').delete().eq('user_id', session.user.id)
            lobbyChannel.unsubscribe()
            pollForMatchReady(match.id)
          }
        })
        .subscribe()

      setPvpChannel(lobbyChannel)

      // Start polling as fallback (checks every 2 seconds)
      pollForMatch(mode)
    } catch (error) {
      console.error('Failed to join queue:', error)
      pvpSearchingRef.current = false
      setPvpStatus('error')
      setTimeout(() => setPvpStatus(null), 3000)
    }
  }

  // Polling fallback to find matches (runs every 2s for 30s)
  const pollForMatch = async (mode, attempts = 0) => {
    if (!session || !pvpSearchingRef.current) return

    if (mode === 'ranked' && attempts >= 6) {
      const queued = pendingRankedQueueRef.current
      if (queued && queued.teamState?.length) {
        startRankedBotMatch(queued.teamIds, queued.teamState, queued.rating)
        pendingRankedQueueRef.current = null
        return
      }
    }

    if (attempts >= 15) return

    try {
      const { data: matches } = await supabase
        .from('pvp_matches')
        .select('*')
        .or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
        .limit(1)

      if (matches && matches.length > 0) {
        const match = matches[0]
        setPvpMatch(match)
        setPvpStatus('match_found')
        pvpSearchingRef.current = false
        clearPvpPollTimers()

        // Confirm we're ready
        const isPlayer1 = match.player1_id === session.user.id
        if (isPlayer1 && !match.player1_ready) {
          await supabase.rpc('pvp_set_ready', { match_id: match.id })
        }

        // Clean up and start waiting for both ready
        await supabase.from('pvp_queue').delete().eq('user_id', session.user.id)
        if (pvpChannel) {
          pvpChannel.unsubscribe()
          setPvpChannel(null)
        }
        pollForMatchReady(match.id)
        return
      }
    } catch (error) {
      console.error('Poll error:', error)
    }

    // Continue polling
    clearTimeout(pvpPollTimersRef.current.match)
    pvpPollTimersRef.current.match = setTimeout(() => pollForMatch(mode, attempts + 1), 2000)
  }

  // Poll for both players to be ready (checks every 1s for 30s)
  const pollForMatchReady = async (matchId, attempts = 0) => {
    if (attempts >= 30 || !session) {
      pvpSearchingRef.current = false
      setPvpStatus('timeout')
      setTimeout(() => setPvpStatus(null), 3000)
      return
    }

    try {
      const { data: match } = await supabase
        .from('pvp_matches')
        .select('*')
        .eq('id', matchId)
        .single()

      if (!match) {
        pvpSearchingRef.current = false
        setPvpStatus('error')
        setTimeout(() => setPvpStatus(null), 3000)
        return
      }

      // Check if both players are ready
      if (match.player1_ready && match.player2_ready && match.status === 'waiting') {
        // Transition to active state
        const isPlayer1 = match.player1_id === session.user.id

        // Only Player 1 updates to active (prevents race condition)
        if (isPlayer1) {
          const { error: activateError } = await supabase.rpc('pvp_activate_match', { match_id: matchId })
          if (activateError) {
            console.error('Failed to activate match:', activateError)
          }
        }

        // Wait a moment for update to propagate
        setTimeout(async () => {
          const { data: activeMatch } = await supabase
            .from('pvp_matches')
            .select('*')
            .eq('id', matchId)
            .single()

          if (activeMatch && activeMatch.status === 'active') {
            setPvpMatch(activeMatch)
            setPvpStatus(null)
            pvpSearchingRef.current = false
            clearPvpPollTimers()
            syncBattleFromMatch(activeMatch)
            subscribeToMatch(activeMatch.id)
          }
        }, 500)
        return
      }
    } catch (error) {
      console.error('Ready poll error:', error)
    }

    // Continue polling
    clearTimeout(pvpPollTimersRef.current.ready)
    pvpPollTimersRef.current.ready = setTimeout(() => pollForMatchReady(matchId, attempts + 1), 1000)
  }

  const startPvpQuick = () => startPvpQueue('quick')
  const startPvpRanked = () => startPvpQueue('ranked')

  const cancelPvpQueue = async () => {
    if (!session) return
    clearPvpPollTimers()

    // Clean up queue entry
    await supabase.from('pvp_queue').delete().eq('user_id', session.user.id)

    // Unsubscribe from lobby channel
    if (pvpChannel) {
      pvpChannel.unsubscribe()
      setPvpChannel(null)
    }

    // Reset status
    setPvpStatus(null)
    setPvpMatch(null)
    setRankedBotMatch(null)
    pendingRankedQueueRef.current = null
    pvpSearchingRef.current = false
  }

  const saveTeamPreset = async (slot, name, characterIds) => {
    if (!session) return
    const payload = {
      user_id: session.user.id,
      slot,
      name: name || `Preset ${slot}`,
      character_ids: characterIds,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('team_presets')
      .upsert(payload, { onConflict: 'user_id,slot' })

    if (!error) {
      setTeamPresets(prev => ({
        ...prev,
        [slot]: payload,
      }))
    }
  }

  const applyTeamPreset = (characterIds) => {
    const nextTeam = characterIds
      .map(id => characterCatalog.find(character => character.id === id))
      .filter(Boolean)
    setSelectedPlayerTeam(nextTeam)
  }

  const awardProgress = async (result, teamSnapshot, battleContext = {}) => {
    if (!session) return

    const battleStats = battleContext.battleStats || getBattleStats()
    const perfectVictory = battleContext.perfectVictory ?? (result === 'win' && battleStats.damageTaken === 0)
    const winStreak = battleContext.winStreak ?? (result === 'win' ? winStreakRef.current : 0)
    const aliveCount = teamSnapshot.filter(character => character.hp > 0).length
    const clutchVictory = battleContext.clutchVictory ??
      (result === 'win' && aliveCount === 1 && teamSnapshot.some(character => character.hp === 1))

    const isStoryBattle = Boolean(storyBattleConfig)
    const isAiBattle = !pvpMatch && !isStoryBattle
    const isRanked = Boolean(pvpMatch) || Boolean(rankedBotMatch)
    let xpMultiplier = 1
    let currencyMultiplier = 1

    if (isAiBattle) {
      const difficulty = enemyTeam.find(member => member?.difficultyMultiplier)?.difficultyMultiplier
      if (difficulty) {
        xpMultiplier = difficulty.xp || 1
        currencyMultiplier = difficulty.currency || 1
      }
    }

    const baseAccountGain = result === 'win' ? 60 : 40
    const baseCharacterGain = result === 'win' ? 35 : 25
    const baseSoftCurrencyGain = result === 'win' ? 50 : 20
    const basePremiumCurrencyGain = result === 'win' ? 2 : 0

    const accountGain = Math.max(0, Math.round(baseAccountGain * xpMultiplier))
    const characterGain = Math.max(0, Math.round(baseCharacterGain * xpMultiplier))
    const softCurrencyGain = Math.max(0, Math.round(baseSoftCurrencyGain * currencyMultiplier))
    const premiumCurrencyGain = Math.max(0, Math.round(basePremiumCurrencyGain * currencyMultiplier))

    const currentAccountLevel = profile?.account_level || 1
    const currentAccountXp = profile?.account_xp || 0
    const currentRating = profile?.rating ?? 1000
    const currentSoftCurrency = profile?.soft_currency || 0
    const currentPremiumCurrency = profile?.premium_currency || 0
    const nextAccount = applyXpGain(currentAccountLevel, currentAccountXp, accountGain)
    const ratingDelta = isRanked ? (result === 'win' ? 20 : -15) : 0
    const nextRating = isRanked ? Math.max(0, currentRating + ratingDelta) : currentRating
    const nextSoftCurrency = currentSoftCurrency + softCurrencyGain
    const nextPremiumCurrency = currentPremiumCurrency + premiumCurrencyGain

    const toastMessages = []
    if (nextAccount.level > currentAccountLevel) {
      toastMessages.push(`Account leveled up to ${nextAccount.level}!`)
    }

    setProfile(prev => ({
      ...(prev || {}),
      account_level: nextAccount.level,
      account_xp: nextAccount.xp,
      rating: nextRating,
      soft_currency: nextSoftCurrency,
      premium_currency: nextPremiumCurrency,
    }))

    const updatedProgress = { ...progressByCharacterId }
    const upserts = []
    const characterLevelUps = []
    const characterSummaries = []

    teamSnapshot.forEach(character => {
      const current = updatedProgress[character.id] || { level: 1, xp: 0, limit_break: 0 }
      const next = applyXpGain(current.level, current.xp, characterGain)
      updatedProgress[character.id] = { ...current, ...next }
      if (next.level > current.level) {
        toastMessages.push(`${character.name} reached Lv ${next.level}!`)
        characterLevelUps.push({ name: character.name, level: next.level })
      }
      characterSummaries.push({
        id: character.id,
        name: character.name,
        level: next.level,
        xp: next.xp,
        xpNeeded: xpForLevel(next.level),
      })
      upserts.push({
        user_id: session.user.id,
        character_id: character.id,
        level: next.level,
        xp: next.xp,
        limit_break: current.limit_break || 0,
        updated_at: new Date().toISOString(),
      })
    })

    setCharacterProgress(updatedProgress)

    await supabase
      .from('profiles')
      .update({
        account_level: nextAccount.level,
        account_xp: nextAccount.xp,
        rating: nextRating,
        soft_currency: nextSoftCurrency,
        premium_currency: nextPremiumCurrency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id)

    if (isRanked) {
      await upsertLeaderboardEntry(nextRating)
    }

    if (upserts.length > 0) {
      await supabase
        .from('character_progress')
        .upsert(upserts, { onConflict: 'user_id,character_id' })
    }

    await supabase
      .from('match_history')
      .insert({
        user_id: session.user.id,
        result,
        turns: turn,
        rating_delta: ratingDelta,
        account_xp_gain: accountGain,
        character_xp_gain: characterGain,
      })
      .select()
      .then(({ data, error }) => {
        if (!error && data) {
          setMatchHistory(prev => [...data, ...prev].slice(0, 20))
        }
      })

    if (toastMessages.length > 0) {
      setLevelUpToast(toastMessages.join(' '))
      setTimeout(() => {
        setLevelUpToast(null)
      }, 2800)
    }

    const characterXpGained = characterGain * teamSnapshot.length
    await trackMissionProgress({
      result,
      isPvp: isRanked,
      battlesPlayed: 1,
      abilitiesUsed: battleStats.abilitiesUsed,
      damageDealt: battleStats.damageDealt,
      characterXpGained,
      perfectVictory,
      levelUps: characterLevelUps.length,
      softCurrencyEarned: softCurrencyGain,
      winStreak,
      rating: isRanked ? nextRating : null,
      accountLevel: nextAccount.level,
      teamSnapshot,
      damageDealtSingleBattle: battleStats.damageDealt,
      abilitiesUsedSingleBattle: battleStats.abilitiesUsed,
    })

    const unlockedAchievements = []

    // Track achievements
    if (result === 'win') {
      // Count total wins (need to query match_history for accurate count)
      const { count } = await supabase
        .from('match_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('result', 'win')

      if (count !== null) {
        unlockedAchievements.push(...await trackAchievementProgress('battles_won', count))
      }
    }

    if (isRanked && result === 'win') {
      const { count } = await supabase
        .from('match_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('result', 'win')
        .neq('rating_delta', 0)

      if (count !== null) {
        unlockedAchievements.push(...await trackAchievementProgress('pvp_wins', count))
      }
    }

    if (isRanked) {
      unlockedAchievements.push(...await trackAchievementProgress('rating_reached', nextRating))
    }

    unlockedAchievements.push(...await trackAchievementProgress('win_streak', winStreak))

    if (perfectVictory) {
      const previous = getAchievementProgressValue('perfect_victories')
      unlockedAchievements.push(...await trackAchievementProgress('perfect_victories', previous + 1))
    }

    if (clutchVictory) {
      const previous = getAchievementProgressValue('clutch_victories')
      unlockedAchievements.push(...await trackAchievementProgress('clutch_victories', previous + 1))
    }

    // Track account level achievement
    unlockedAchievements.push(...await trackAchievementProgress('account_level', nextAccount.level))

    // Track character max level if any reached max
    const maxLevelCount = teamSnapshot.reduce((count, character) => {
      const progress = updatedProgress[character.id]
      return progress && progress.level >= 50 ? count + 1 : count
    }, 0)
    if (maxLevelCount > 0) {
      unlockedAchievements.push(...await trackAchievementProgress('max_level_characters', maxLevelCount))
    }

    const characterRewards = characterSummaries.map(char => ({
      ...char,
      levelUp: characterLevelUps.some(lu => lu.name === char.name)
    }))

    const achievementsUnlocked = Array.from(
      new Map(unlockedAchievements.map(achievement => [achievement.id, achievement])).values()
    ).map(achievement => ({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon || '🏅',
    }))

    const rewardData = {
      turns: turn,
      accountXpGain: accountGain,
      accountLevel: nextAccount.level,
      accountLevelUp: nextAccount.level > currentAccountLevel,
      softCurrencyGain,
      premiumCurrencyGain,
      ratingDelta,
      characters: characterRewards,
      achievementsUnlocked,
    }

    setMatchSummary({
      result,
      accountGain,
      characterGain,
      accountLevel: nextAccount.level,
      accountXp: nextAccount.xp,
      accountNeeded: xpForLevel(nextAccount.level),
      ratingDelta,
      rating: nextRating,
      characterLevelUps,
      characterSummaries,
    })

    setBattleResult({ result, rewards: rewardData })
  }

  const trackMissionProgress = async (event = {}) => {
    if (!session || missions.length === 0 || userMissions.length === 0) return

    const {
      result,
      isPvp = false,
      battlesPlayed = 0,
      abilitiesUsed = 0,
      damageDealt = 0,
      characterXpGained = 0,
      perfectVictory = false,
      levelUps = 0,
      softCurrencyEarned = 0,
      gachaPulls = 0,
      login = 0,
      loginDays = 0,
      storyNodesCompleted = 0,
      rating = null,
      winStreak = null,
      charactersUnlocked = null,
      accountLevel = null,
      teamSnapshot = [],
      damageDealtSingleBattle = null,
      abilitiesUsedSingleBattle = null,
      chapterCompleted = null,
    } = event

    const updates = []
    const nextUserMissions = [...userMissions]
    const missionById = new Map(missions.map(mission => [mission.id, mission]))

    const teamHasTag = (tag) => {
      if (!tag) return true
      const normalized = String(tag).toLowerCase()
      return teamSnapshot.some(character => {
        const name = String(character?.name || '').toLowerCase()
        const id = String(character?.id || '').toLowerCase()
        return name.includes(normalized) || id === normalized
      })
    }

    missions.forEach(mission => {
      const entryIndex = nextUserMissions.findIndex(entry => entry.mission_id === mission.id)
      if (entryIndex === -1) return
      const entry = nextUserMissions[entryIndex]
      if (entry.claimed) return

      let increment = 0
      let absoluteValue = null

      switch (mission.condition) {
        case 'match_any':
        case 'battles_played':
        case 'total_battles':
          increment = battlesPlayed
          break
        case 'match_win':
        case 'battles_won':
          if (result === 'win' && teamHasTag(mission.condition_value)) {
            increment = 1
          }
          break
        case 'pvp_battles_won':
          if (isPvp && result === 'win') {
            increment = 1
          }
          break
        case 'abilities_used':
          increment = abilitiesUsed
          break
        case 'abilities_used_single_battle':
          absoluteValue = abilitiesUsedSingleBattle ?? abilitiesUsed
          break
        case 'damage_dealt':
          increment = damageDealt
          break
        case 'damage_dealt_single_battle':
          absoluteValue = damageDealtSingleBattle ?? damageDealt
          break
        case 'character_xp_gained':
          increment = characterXpGained
          break
        case 'perfect_victories':
          increment = perfectVictory ? 1 : 0
          break
        case 'login':
          increment = login
          break
        case 'login_days':
          increment = loginDays
          break
        case 'gacha_pulls':
          increment = gachaPulls
          break
        case 'character_level_up':
        case 'characters_leveled':
          increment = levelUps
          break
        case 'story_nodes_completed':
          increment = storyNodesCompleted
          break
        case 'soft_currency_earned':
          increment = softCurrencyEarned
          break
        case 'pvp_rating':
          absoluteValue = rating
          break
        case 'win_streak':
          absoluteValue = winStreak
          break
        case 'all_characters_unlocked':
          absoluteValue = charactersUnlocked
          break
        case 'story_chapter_complete':
          if (chapterCompleted && String(mission.condition_value) === String(chapterCompleted)) {
            absoluteValue = 1
          }
          break
        case 'account_level':
          absoluteValue = accountLevel
          break
        default:
          break
      }

      let nextProgress = entry.progress
      if (increment > 0) {
        nextProgress = Math.min(mission.target, entry.progress + increment)
      } else if (absoluteValue !== null && absoluteValue !== undefined) {
        nextProgress = Math.min(mission.target, Math.max(entry.progress, absoluteValue))
      }

      if (nextProgress === entry.progress) return

      nextUserMissions[entryIndex] = { ...entry, progress: nextProgress }
      updates.push({
        user_id: session.user.id,
        mission_id: mission.id,
        progress: nextProgress,
        claimed: entry.claimed,
        updated_at: new Date().toISOString(),
      })
    })

    if (updates.length === 0) return

    await supabase.from('user_missions').upsert(updates, { onConflict: 'user_id,mission_id' })
    setUserMissions(nextUserMissions)

    const completedCount = nextUserMissions.reduce((count, entry) => {
      const mission = missionById.get(entry.mission_id)
      if (!mission) return count
      return entry.progress >= mission.target ? count + 1 : count
    }, 0)
    trackAchievementProgress('missions_completed', completedCount)
  }

  const claimMission = async (missionId) => {
    if (!session) return
    const mission = missions.find(item => item.id === missionId)
    const entry = userMissions.find(item => item.mission_id === missionId)
    if (!mission || !entry || entry.claimed || entry.progress < mission.target) return

    const { data, error } = await supabase.rpc('claim_mission_reward', {
      p_mission_id: missionId,
    })
    if (error) {
      console.error('Failed to claim mission:', error)
      return
    }

    if (typeof data?.soft_currency === 'number' || typeof data?.premium_currency === 'number') {
      setProfile(prev => ({
        ...(prev || {}),
        soft_currency: data?.soft_currency ?? prev?.soft_currency ?? 0,
        premium_currency: data?.premium_currency ?? prev?.premium_currency ?? 0,
      }))
    }

    if (data?.reward_shard_character_id && data?.reward_shard_amount) {
      setInventory(prev => ({
        ...prev,
        [data.reward_shard_character_id]: (prev[data.reward_shard_character_id] || 0) + data.reward_shard_amount,
      }))
    }

    setUserMissions(prev =>
      prev.map(item => item.mission_id === missionId ? { ...item, claimed: true } : item)
    )

    if (mission.reward_soft > 0) {
      trackMissionProgress({ softCurrencyEarned: mission.reward_soft })
    }
  }

  const claimDailyReward = async () => {
    if (!session || !dailyReward) return

    const { data, error } = await supabase.rpc('claim_daily_reward')
    if (error) {
      console.error('Failed to claim daily reward:', error)
      return
    }

    setDailyReward(prev => ({
      ...(prev || {}),
      current_streak: data.current_streak,
      longest_streak: data.longest_streak,
      last_claim_date: data.last_claim_date,
      total_logins: data.total_logins,
    }))

    setProfile(prev => ({
      ...(prev || {}),
      soft_currency: data.soft_currency ?? prev?.soft_currency ?? 0,
      premium_currency: data.premium_currency ?? prev?.premium_currency ?? 0,
    }))

    trackAchievementProgress('login_streak', data.current_streak)
    trackAchievementProgress('total_logins', data.total_logins)
    trackMissionProgress({
      login: 1,
      loginDays: 1,
      softCurrencyEarned: data.reward_soft || 0,
    })
  }

  const getAchievementProgressValue = (requirementType) => {
    const relevantIds = achievements
      .filter(achievement => achievement.requirement_type === requirementType)
      .map(achievement => achievement.id)
    if (relevantIds.length === 0) return 0
    const values = achievementProgress
      .filter(entry => relevantIds.includes(entry.achievement_id))
      .map(entry => entry.progress || 0)
    return values.length > 0 ? Math.max(...values) : 0
  }

  const trackAchievementProgress = async (requirementType, currentValue) => {
    if (!session) return []

    // Find achievements that match this requirement type
    const relevantAchievements = achievements.filter(a =>
      a.requirement_type === requirementType
    )

    if (relevantAchievements.length === 0) return []

    const now = new Date().toISOString()
    const upserts = []
    const newlyUnlocked = []

    relevantAchievements.forEach(achievement => {
      const existing = achievementProgress.find(p => p.achievement_id === achievement.id)
      const previousProgress = existing?.progress || 0
      const nextProgress = Math.max(previousProgress, currentValue)
      const isCompleted = nextProgress >= achievement.requirement_target
      const completedAt = isCompleted ? (existing?.completed_at || now) : (existing?.completed_at || null)

      if (!existing || nextProgress !== previousProgress || (isCompleted && !existing.is_completed)) {
        upserts.push({
          user_id: session.user.id,
          achievement_id: achievement.id,
          progress: nextProgress,
          is_completed: isCompleted,
          completed_at: completedAt,
          rewards_claimed: existing?.rewards_claimed ?? false,
          updated_at: now,
        })
      }

      if (isCompleted && !existing?.is_completed) {
        newlyUnlocked.push(achievement)
      }
    })

    if (upserts.length === 0) return []

    await supabase
      .from('achievement_progress')
      .upsert(upserts, { onConflict: 'user_id,achievement_id' })

    // Refresh progress
    const { data } = await supabase
      .from('achievement_progress')
      .select('*')
      .eq('user_id', session.user.id)
    setAchievementProgress(data || [])
    return newlyUnlocked
  }

  const claimAchievementReward = async (achievementId) => {
    if (!session) return

    const achievement = achievements.find(a => a.id === achievementId)
    if (!achievement) return

    const progress = achievementProgress.find(p => p.achievement_id === achievementId)
    if (!progress || !progress.is_completed || progress.rewards_claimed) return
    const { data, error } = await supabase.rpc('claim_achievement_reward', {
      p_achievement_id: achievementId,
    })
    if (error) {
      console.error('Failed to claim achievement:', error)
      return
    }

    setProfile(prev => ({
      ...(prev || {}),
      soft_currency: data?.soft_currency ?? prev?.soft_currency ?? 0,
      premium_currency: data?.premium_currency ?? prev?.premium_currency ?? 0,
    }))

    setAchievementProgress(prev => prev.map(p =>
      p.achievement_id === achievementId
        ? { ...p, rewards_claimed: true }
        : p
    ))

    if (achievement.reward_soft_currency > 0) {
      trackMissionProgress({ softCurrencyEarned: achievement.reward_soft_currency })
    }

    if (achievement.reward_title) {
      refreshUserTitles()
    }
  }

  const purchaseOffer = async (offerId) => {
    if (!session) return
    const offer = shopOffers.find(item => item.id === offerId)
    if (!offer) return

    const soft = profile?.soft_currency ?? 0
    const premium = profile?.premium_currency ?? 0

    // Validate can afford
    if (soft < offer.cost_soft || premium < offer.cost_premium) {
      console.error('Insufficient funds')
      return
    }

    try {
      const { data, error } = await supabase.rpc('purchase_shop_offer', {
        p_offer_id: offer.id,
      })

      if (error) {
        console.error('Failed to purchase offer:', error)
        return
      }

      if (typeof data?.soft_currency === 'number' || typeof data?.premium_currency === 'number') {
        setProfile(prev => ({
          ...(prev || {}),
          soft_currency: data?.soft_currency ?? prev?.soft_currency ?? 0,
          premium_currency: data?.premium_currency ?? prev?.premium_currency ?? 0,
        }))
      }

      if (data?.character_id && data?.shard_amount) {
        setInventory(prev => ({
          ...prev,
          [data.character_id]: (prev[data.character_id] || 0) + data.shard_amount,
        }))
      }
    } catch (error) {
      console.error('Purchase failed:', error)
    }
  }

  const pullGacha = async (bannerId, options = {}) => {
    if (!session || !bannerId) return false
    const useFragment = options.useFragment === true
    const pullCount = Math.max(1, Number(options.count) || 1)
    if (useFragment && pullCount > 1) return false

    const preUnlocked = new Set(Object.keys(progressByCharacterId).map(id => Number(id)))

    try {
      const { data, error } = await supabase.rpc('gacha_pull', {
        p_banner_id: bannerId,
        p_pull_count: pullCount,
        p_use_fragment: useFragment,
      })
      if (error) {
        console.error('Gacha pull failed:', error)
        return false
      }

      const results = Array.isArray(data?.results) ? data.results : []
      const softCurrencyEarned = results
        .filter(item => item?.item_type === 'currency')
        .reduce((sum, item) => sum + (item.soft_currency || 0), 0)

      const characterUnlockIds = new Set(
        results
          .filter(item => item?.item_type === 'character' && item.character_id != null)
          .map(item => Number(item.character_id))
          .filter(id => !preUnlocked.has(id))
      )

      setGachaResult(results)

      if (typeof data?.soft_currency === 'number' || typeof data?.premium_currency === 'number') {
        setProfile(prev => ({
          ...(prev || {}),
          soft_currency: data?.soft_currency ?? prev?.soft_currency ?? 0,
          premium_currency: data?.premium_currency ?? prev?.premium_currency ?? 0,
        }))
      }

      if (data?.fragments != null) {
        setUserItems(prev => ({ ...prev, finger_fragment: data.fragments }))
      }

      await Promise.all([refreshInventory(), refreshCharacterProgress(), refreshUserItems()])

      const previousGachaPulls = getAchievementProgressValue('gacha_pulls')
      trackAchievementProgress('gacha_pulls', previousGachaPulls + pullCount)
      trackMissionProgress({
        gachaPulls: pullCount,
        softCurrencyEarned,
      })

      if (characterUnlockIds.size > 0) {
        const unlockedCount = Object.keys(progressByCharacterId).length + characterUnlockIds.size
        trackAchievementProgress('characters_unlocked', unlockedCount)
        trackMissionProgress({ charactersUnlocked: unlockedCount })
      }
      return true
    } catch (error) {
      console.error('Gacha pull failed:', error)
      return false
    }
  }

  const limitBreakCost = (nextLevel) => nextLevel * 25

  const setActiveTitle = async (titleId) => {
    if (!session || !titleId) return
    const updates = userTitles.map(title => ({
      user_id: session.user.id,
      title_id: title.title_id,
      unlocked: title.unlocked,
      active: title.title_id === titleId,
      updated_at: new Date().toISOString(),
    }))
    if (updates.length === 0) return

    const { data } = await supabase
      .from('user_titles')
      .upsert(updates, { onConflict: 'user_id,title_id' })
      .select()
    if (data) setUserTitles(data)
  }

  const applyLimitBreak = async (characterId) => {
    if (!session) return
    const currentShards = inventory[characterId] || 0
    const currentProgress = characterProgress[characterId] || { level: 1, xp: 0, limit_break: 0 }
    const nextLevel = currentProgress.limit_break + 1
    if (nextLevel > 5) return

    const cost = limitBreakCost(nextLevel)
    if (currentShards < cost) return

    const { data, error } = await supabase.rpc('apply_limit_break', {
      p_character_id: characterId,
    })
    if (error) {
      console.error('Failed to apply limit break:', error)
      return
    }

    if (data?.shard_amount != null) {
      setInventory(prev => ({ ...prev, [characterId]: data.shard_amount }))
    }

    if (data?.limit_break != null) {
      setCharacterProgress(prev => ({
        ...prev,
        [characterId]: {
          ...currentProgress,
          limit_break: data.limit_break,
        },
      }))
    }

    // Track achievement progress for limit breaks
    const totalLimitBreaks = Object.values(characterProgress).reduce((sum, prog) => sum + (prog.limit_break || 0), 0) + 1
    trackAchievementProgress('limit_breaks', totalLimitBreaks)
  }

  const goHome = () => {
    setView('team')
    if (gamePhase === 'battle') {
      resetGame()
    }
  }

  const safeNavigate = (nextView) => {
    if (gamePhase === 'battle') {
      resetGame()
    }
    setView(nextView)
  }

  const navLocked = gamePhase === 'battle'
  const isAdmin = profile?.role === 'admin'

  const navItems = [
    { label: 'Home', onClick: goHome, active: view === 'team' && gamePhase === 'select' },
    { label: 'Story', onClick: () => safeNavigate('story'), active: view === 'story', disabled: navLocked },
    { label: 'Rogue', onClick: () => safeNavigate('rogue'), active: view === 'rogue', disabled: navLocked },
    { label: 'Ladder', onClick: () => safeNavigate('ladder'), active: view === 'ladder', disabled: navLocked },
    { label: 'Progress', onClick: () => safeNavigate('progress'), active: view === 'progress', disabled: navLocked },
    { label: 'Gacha', onClick: () => safeNavigate('gacha'), active: view === 'gacha', disabled: navLocked },
    { label: 'Shop', onClick: () => safeNavigate('shop'), active: view === 'shop', disabled: navLocked },
    { label: 'Inventory', onClick: () => safeNavigate('inventory'), active: view === 'inventory', disabled: navLocked },
    ...(isAdmin ? [{ label: 'Admin', onClick: () => safeNavigate('admin'), active: view === 'admin', disabled: navLocked }] : []),
  ]

  const canOpenProfile = gamePhase !== 'battle'

  return (
    <AuthGate
      onSession={setSession}
      onProfile={setProfile}
      navItems={navItems}
      onProfileClick={canOpenProfile ? () => safeNavigate('profile') : null}
      compact={gamePhase === 'battle'}
    >
      {levelUpToast && (
        <div className="level-toast">
          <span>{levelUpToast}</span>
        </div>
      )}
      {battleResult && (
        <BattleResultScreen
          result={battleResult.result}
          rewards={battleResult.rewards}
          onContinue={() => {
            if (rogueState.active) {
              handleRogueBattleContinue()
              return
            }
            setBattleResult(null)
            resetGame()
          }}
          isPvp={isRankedMatch}
        />
      )}
      <React.Suspense fallback={<div className="page-loading">Loading...</div>}>
        {gamePhase === 'battle' ? (
          <BattleScreen
            playerTeam={playerTeam}
            enemyTeam={enemyTeam}
            selectedEnemy={selectedEnemy}
            setSelectedEnemy={setSelectedEnemy}
            queueAbility={queueAbility}
            queuedActions={queuedActions}
            removeQueuedAction={removeQueuedAction}
            battleLog={battleLog}
            turn={turn}
            gameOver={gameOver}
            resetGame={resetGame}
            actedCharacters={actedCharacters}
            pendingAbility={pendingAbility}
            setPendingAbility={setPendingAbility}
            endTurn={handleEndTurn}
            profile={profile}
            matchSummary={matchSummary}
            combatEvents={combatEvents}
            battleShake={battleShake}
            isPvp={isPvp}
            isMyTurn={isMyTurn}
            storyBattle={storyBattleConfig}
            onExitStory={exitStoryBattle}
            battleSpeed={battleSpeed}
            onToggleSpeed={toggleBattleSpeed}
            autoBattle={autoBattle}
            onToggleAutoBattle={toggleAutoBattle}
            autoBattleDisabled={!canAutoBattle}
          />
        ) : view === 'profile' ? (
          <ProfilePage
            profile={profile}
            matchHistory={matchHistory}
            onBack={() => setView('team')}
            onProfileUpdate={setProfile}
            titles={userTitles}
            onSetActiveTitle={setActiveTitle}
          />
        ) : view === 'inventory' ? (
          <InventoryPage
            characters={characterCatalog}
            inventory={inventory}
            characterProgress={characterProgress}
            items={userItems}
            titles={userTitles}
            onBack={() => setView('team')}
            onLimitBreak={applyLimitBreak}
            limitBreakCost={limitBreakCost}
          />
        ) : view === 'shop' ? (
          <ShopPage
            offers={shopOffers}
            profile={profile}
            onBack={() => setView('team')}
            onPurchase={purchaseOffer}
          />
        ) : view === 'gacha' ? (
          <GachaPage
            banners={banners}
            bannerItems={bannerItems}
            profile={profile}
            items={userItems}
            characters={characterCatalog}
            onBack={() => setView('team')}
            onPull={pullGacha}
            result={gachaResult}
            onClearResult={() => setGachaResult(null)}
          />
        ) : view === 'progress' ? (
          <ProgressHub
            dailyReward={dailyReward}
            onClaimDaily={claimDailyReward}
            missions={missions}
            userMissions={userMissions}
            onClaimMission={claimMission}
            achievements={achievements}
            achievementProgress={achievementProgress}
            onClaimAchievement={claimAchievementReward}
          />
        ) : view === 'rogue' ? (
          <RogueMode
            rogueState={rogueState}
            selectedTeam={selectedPlayerTeam}
            onStart={startRogueRun}
            onEnterFloor={startRogueBattle}
            onChooseBlessing={chooseRogueBlessing}
            onChooseNode={chooseRogueNode}
            onResolveEvent={resolveRogueEvent}
            onAbandon={abandonRogueRun}
            onBack={() => setView('team')}
            rogueTokens={userItems?.rogue_token || 0}
          />
        ) : view === 'story' ? (
          <StoryMode
            chapter={storyChapter}
            completedNodes={storyState.completedNodes}
            activeNodeId={storyState.activeNodeId}
            onSelectNode={(nodeId) => setStoryState(prev => ({ ...prev, activeNodeId: nodeId }))}
            onCompleteNode={completeStoryNode}
            onStartBattle={startStoryBattle}
            storyResult={storyResult}
            onClearResult={clearStoryResult}
            onClaimRewards={claimStoryRewards}
            rewardsClaimed={storyRewardsClaimed}
          />
        ) : view === 'ladder' ? (
          <LadderPage
            entries={leaderboardEntries}
            status={leaderboardStatus}
            error={leaderboardError}
            season={seasonInfo}
            currentUserId={session?.user?.id}
            currentRating={profile?.rating ?? 1000}
            onRefresh={loadLeaderboard}
            onBack={() => setView('team')}
          />
        ) : view === 'opponent-select' ? (
          <OpponentSelect
            characters={characterCatalog}
            onConfirm={startBattleWithOpponents}
            onBack={() => setView('team')}
          />
        ) : view === 'admin' && isAdmin ? (
          <AdminPanel
            profile={profile}
            characters={characterCatalog}
            onBack={() => setView('team')}
          />
        ) : (
          <TeamSelect
            characters={characterCatalog}
            selectedTeam={selectedPlayerTeam}
            onSelect={setSelectedPlayerTeam}
            onStartBattle={() => setView('opponent-select')}
            onStartPvpQuick={startPvpQuick}
            onStartPvpRanked={startPvpRanked}
            onCancelPvpQueue={cancelPvpQueue}
            pvpStatus={pvpStatus}
            characterProgress={characterProgress}
            teamPresets={teamPresets}
            onSavePreset={saveTeamPreset}
            onApplyPreset={applyTeamPreset}
          />
        )}
      </React.Suspense>
    </AuthGate>
  )
}

export default App
