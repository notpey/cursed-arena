import React, { useEffect, useMemo, useRef, useState } from 'react'
import { characters as defaultCharacters } from './characters'
import TeamSelect from './TeamSelect'
import BattleScreen from './BattleScreen'
import AuthGate from './AuthGate'
import { supabase } from './supabaseClient'
import ProfilePage from './ProfilePage'
import MissionsPage from './MissionsPage'
import ShopPage from './ShopPage'
import GachaPage from './GachaPage'
import InventoryPage from './InventoryPage'
import StoryMode from './StoryMode'
import AdminPanel from './AdminPanel'
import DailyRewards from './DailyRewards'
import Achievements from './Achievements'
import OpponentSelect from './OpponentSelect'
import BattleResultScreen from './BattleResultScreen'
import { storyChapters, storyEnemies } from './storyData'
import './App.css'

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

  const xpForLevel = (level) => 100 + level * 25

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

  const pushCombatEvent = (event) => {
    const id = `${Date.now()}-${Math.random()}`
    const payload = { id, ...event }
    setCombatEvents(prev => [...prev, payload])
    setTimeout(() => {
      setCombatEvents(prev => prev.filter(item => item.id !== id))
    }, 800)
  }

  const triggerShake = () => {
    setBattleShake(true)
    setTimeout(() => setBattleShake(false), 220)
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
  const isMyTurn = isPvp && pvpMatch?.turn_owner === session?.user?.id
  const storyChapter = useMemo(
    () => storyChapters.find(chapter => chapter.id === storyState.chapterId) || storyChapters[0],
    [storyState.chapterId]
  )
  const storyLoadedRef = useRef(false)

  const markStoryNodeCompleted = (nodeId) => {
    if (!nodeId) return
    setStoryState(prev => {
      if (prev.completedNodes.includes(nodeId)) return prev
      return {
        ...prev,
        completedNodes: [...prev.completedNodes, nodeId],
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
      return {
        ...prev,
        completedNodes: [...prev.completedNodes, nodeId],
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
    setBattleLog([
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
        { data: userMissionData },
        { data: offerData },
        { data: bannerData },
        { data: bannerItemData },
        { data: inventoryData },
        { data: itemData },
        { data: titleData },
      ] = await Promise.all([
        supabase.from('missions').select('*').order('id'),
        supabase.from('user_missions').select('*').eq('user_id', session.user.id),
        supabase.from('shop_offers').select('*').eq('active', true).order('id'),
        supabase.from('banners').select('*').order('id'),
        supabase.from('banner_items').select('*').order('banner_id'),
        supabase.from('user_inventory').select('*').eq('user_id', session.user.id),
        supabase.from('user_items').select('*').eq('user_id', session.user.id),
        supabase.from('user_titles').select('*').eq('user_id', session.user.id),
      ])

      setMissions(missionData || [])
      setUserMissions(userMissionData || [])
      setShopOffers(offerData || [])
      setBanners(bannerData || [])
      setBannerItems(bannerItemData || [])
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
    }

    loadMeta()
  }, [session])

  useEffect(() => {
    if (!session || missions.length === 0) return

    const ensureUserMissions = async () => {
      const existingIds = new Set(userMissions.map(entry => entry.mission_id))
      const missing = missions.filter(mission => !existingIds.has(mission.id))
      if (missing.length === 0) return

      const payload = missing.map(mission => ({
        user_id: session.user.id,
        mission_id: mission.id,
        progress: 0,
        claimed: false,
        updated_at: new Date().toISOString(),
      }))

      const { data } = await supabase.from('user_missions').insert(payload).select()
      if (data) {
        setUserMissions(prev => [...prev, ...data])
      }
    }

    ensureUserMissions()
  }, [missions, session, userMissions])

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

  const getRawDamage = (attacker, ability) => {
    const baseDamage = ability.damageBase ?? ability.damage ?? 0
    const scaling = ability.scaling || 0
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

  const applyDotEffects = (character, teamType, index, logs) => {
    if (!character.effects?.dots?.length) return
    character.effects.dots.forEach(dot => {
      if (dot.type === 'burn' || dot.type === 'poison') {
        const damage = Math.max(0, dot.damage || 0)
        if (damage > 0 && character.hp > 0) {
          character.hp = Math.max(0, character.hp - damage)
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

  const processTurnStart = (team, teamType) => {
    const nextTeam = deepCopy(team)
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
      setBattleLog(prev => [...prev, ...newLog])
    }
    setGameOver(result === 'win' ? 'win' : 'lose')

    if (storyBattleConfig) {
      if (result === 'win') {
        markStoryNodeCompleted(storyBattleConfig.nodeId)
      }
      setStoryResult({ nodeId: storyBattleConfig.nodeId, result })
      setStoryState(prev => ({ ...prev, activeNodeId: storyBattleConfig.nodeId }))
      return
    }

    awardProgress(result, teamSnapshot)
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


  const endPlayerTurn = (startPlayerTeam = playerTeam, startEnemyTeam = enemyTeam) => {
    let newLog = []
    let newEnemyTeam = deepCopy(startEnemyTeam)
    let newPlayerTeam = deepCopy(startPlayerTeam)

    const enemyTurnStart = processTurnStart(newEnemyTeam, 'enemy')
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

    const playerTurnStart = processTurnStart(newPlayerTeam, 'player')
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

    setBattleLog(prev => [...prev, ...newLog])
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

      const playerTurnStart = processTurnStart(newPlayerTeam, 'player')
      newPlayerTeam = playerTurnStart.team
      newLog.push(...playerTurnStart.logs)

      const enemyTurnStart = processTurnStart(newEnemyTeam, 'enemy')
      newEnemyTeam = enemyTurnStart.team
      newLog.push(...enemyTurnStart.logs)

      if (newEnemyTeam.every(e => e.hp <= 0)) {
        const finalState = {
          player1Team: isPlayer1 ? newPlayerTeam : newEnemyTeam,
          player2Team: isPlayer1 ? newEnemyTeam : newPlayerTeam,
          turn: pvpMatch.state?.turn || turn,
          log: [...baseLog, ...newLog, '👑 VICTORY!'],
        }
        await supabase
          .from('pvp_matches')
          .update({
            state: finalState,
            status: 'completed',
            winner_id: session.user.id,
            turn_owner: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pvpMatch.id)
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
        await supabase
          .from('pvp_matches')
          .update({
            state: finalState,
            status: 'completed',
            winner_id: opponentId,
            turn_owner: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pvpMatch.id)
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

      setBattleLog(nextState.log)
      setPlayerTeam(newPlayerTeam)
      setEnemyTeam(newEnemyTeam)
      setActedCharacters([])
      setTurn(nextTurn)

      await supabase.from('pvp_turns').insert({
        match_id: pvpMatch.id,
        user_id: session.user.id,
        turn_number: nextTurn - 1,
        actions: { queuedActions: actionsSnapshot },
      })

      await supabase
        .from('pvp_matches')
        .update({
          state: nextState,
          turn: nextTurn,
          turn_owner: opponentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pvpMatch.id)
      return
    }

    setBattleLog(prev => [...prev, ...newLog])
    endPlayerTurn(newPlayerTeam, newEnemyTeam)
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
    setBattleLog(["Battle Start! Queue actions, then End Turn."])
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
    setBattleLog(["Battle Start! Queue actions, then End Turn."])
    setGameOver(null)
    setTurn(1)
    setActedCharacters([])
    setPendingAbility(null)
    setQueuedActions([])
    setMatchSummary(null)
    setStoryBattleConfig(null)
    setView('story')
  }

  const startBattleWithOpponents = ({ opponents, difficulty }) => {
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
    setBattleLog([`Battle Start! Difficulty: ${difficulty.label}`])
    setActedCharacters([])
    setQueuedActions([])
    setStoryBattleConfig(null)
  }

  const syncBattleFromMatch = (match) => {
    if (!match || !session) return
    const isPlayer1 = match.player1_id === session.user.id
    const state = match.state || {}
    const player1Team = state.player1Team || buildTeamSnapshot(match.player1_team || [], false)
    const player2Team = state.player2Team || buildTeamSnapshot(match.player2_team || [], false)
    setPlayerTeam(deepCopy(isPlayer1 ? player1Team : player2Team))
    setEnemyTeam(deepCopy(isPlayer1 ? player2Team : player1Team))
    setBattleLog(state.log?.length ? state.log : ["PvP Match Start!"])
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
    setPvpStatus('searching')

    const teamIds = selectedPlayerTeam.map(character => character.id)
    const teamState = buildTeamSnapshot(teamIds, true)
    const myRating = profile?.rating || 1000

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
              await supabase
                .from('pvp_matches')
                .update({ player1_ready: true, updated_at: new Date().toISOString() })
                .eq('id', match.id)
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
      setPvpStatus('error')
      setTimeout(() => setPvpStatus(null), 3000)
    }
  }

  // Polling fallback to find matches (runs every 2s for 30s)
  const pollForMatch = async (mode, attempts = 0) => {
    if (attempts >= 15 || !session || pvpStatus !== 'searching') return

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

        // Confirm we're ready
        const isPlayer1 = match.player1_id === session.user.id
        if (isPlayer1 && !match.player1_ready) {
          await supabase
            .from('pvp_matches')
            .update({ player1_ready: true, updated_at: new Date().toISOString() })
            .eq('id', match.id)
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
    setTimeout(() => pollForMatch(mode, attempts + 1), 2000)
  }

  // Poll for both players to be ready (checks every 1s for 30s)
  const pollForMatchReady = async (matchId, attempts = 0) => {
    if (attempts >= 30 || !session) {
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
          await supabase
            .from('pvp_matches')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', matchId)
            .eq('status', 'waiting') // Atomic check
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
    setTimeout(() => pollForMatchReady(matchId, attempts + 1), 1000)
  }

  const startPvpQuick = () => startPvpQueue('quick')
  const startPvpRanked = () => startPvpQueue('ranked')

  const cancelPvpQueue = async () => {
    if (!session) return

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

  const awardProgress = async (result, teamSnapshot) => {
    if (!session) return

    const isStoryBattle = Boolean(storyBattleConfig)
    const isAiBattle = !pvpMatch && !isStoryBattle
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
    const ratingDelta = isPvp ? (result === 'win' ? 20 : -15) : 0
    const nextRating = isPvp ? Math.max(0, currentRating + ratingDelta) : currentRating
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

    await trackMissionProgress(result, characterLevelUps.length)

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

  const trackMissionProgress = async (result, levelUps = 0) => {
    if (!session || missions.length === 0) return

    const updates = []
    const nextUserMissions = [...userMissions]

    missions.forEach(mission => {
      const entryIndex = nextUserMissions.findIndex(entry => entry.mission_id === mission.id)
      if (entryIndex === -1) return
      const entry = nextUserMissions[entryIndex]
      if (entry.claimed) return

      const condition = mission.condition || 'match_any'
      const shouldProgress =
        condition === 'match_any' ||
        (condition === 'match_win' && result === 'win') ||
        (condition === 'match_loss' && result === 'lose') ||
        (condition === 'character_level_up' && levelUps > 0)

      if (!shouldProgress) return

      const increment = condition === 'character_level_up' ? levelUps : 1
      const nextProgress = Math.min(mission.target, entry.progress + increment)
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
  }

  const claimMission = async (missionId) => {
    if (!session) return
    const mission = missions.find(item => item.id === missionId)
    const entry = userMissions.find(item => item.mission_id === missionId)
    if (!mission || !entry || entry.claimed || entry.progress < mission.target) return

    const nextSoft = (profile?.soft_currency ?? 0) + mission.reward_soft
    const nextPremium = (profile?.premium_currency ?? 0) + mission.reward_premium

    const inventoryUpdates = []
    if (mission.reward_shard_character_id && mission.reward_shard_amount > 0) {
      const currentAmount = inventory[mission.reward_shard_character_id] || 0
      const nextAmount = currentAmount + mission.reward_shard_amount
      inventoryUpdates.push({
        user_id: session.user.id,
        character_id: mission.reward_shard_character_id,
        shard_amount: nextAmount,
        updated_at: new Date().toISOString(),
      })
      setInventory(prev => ({
        ...prev,
        [mission.reward_shard_character_id]: nextAmount,
      }))
    }

    await supabase
      .from('profiles')
      .update({
        soft_currency: nextSoft,
        premium_currency: nextPremium,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id)

    await supabase
      .from('user_missions')
      .update({ claimed: true, updated_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .eq('mission_id', missionId)

    if (inventoryUpdates.length > 0) {
      await supabase
        .from('user_inventory')
        .upsert(inventoryUpdates, { onConflict: 'user_id,character_id' })
    }

    setProfile(prev => ({
      ...(prev || {}),
      soft_currency: nextSoft,
      premium_currency: nextPremium,
    }))
    setUserMissions(prev =>
      prev.map(item => item.mission_id === missionId ? { ...item, claimed: true } : item)
    )
  }

  const claimDailyReward = async () => {
    if (!session || !dailyReward) return

    const today = new Date().toISOString().split('T')[0]
    const lastClaim = dailyReward.last_claim_date

    // Check if already claimed today
    if (lastClaim === today) return

    // Calculate new streak
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    const isConsecutive = lastClaim === yesterdayStr
    const newStreak = isConsecutive ? dailyReward.current_streak + 1 : 1
    const newLongest = Math.max(newStreak, dailyReward.longest_streak)

    // Calculate rewards
    const dayInCycle = ((newStreak - 1) % 7) + 1
    const rewardSchedule = {
      1: { soft: 50, premium: 0 },
      2: { soft: 75, premium: 0 },
      3: { soft: 100, premium: 5 },
      4: { soft: 125, premium: 0 },
      5: { soft: 150, premium: 10 },
      6: { soft: 200, premium: 0 },
      7: { soft: 300, premium: 25 },
    }
    const reward = rewardSchedule[dayInCycle]

    // Update daily reward record
    await supabase
      .from('daily_rewards')
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_claim_date: today,
        total_logins: dailyReward.total_logins + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', session.user.id)

    // Award currency
    const nextSoft = (profile?.soft_currency || 0) + reward.soft
    const nextPremium = (profile?.premium_currency || 0) + reward.premium

    await supabase
      .from('profiles')
      .update({
        soft_currency: nextSoft,
        premium_currency: nextPremium,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id)

    // Update local state
    setDailyReward(prev => ({
      ...prev,
      current_streak: newStreak,
      longest_streak: newLongest,
      last_claim_date: today,
      total_logins: prev.total_logins + 1,
    }))

    setProfile(prev => ({
      ...prev,
      soft_currency: nextSoft,
      premium_currency: nextPremium,
    }))

    // Track achievement progress
    trackAchievementProgress('login_streak', newStreak)
    trackAchievementProgress('total_logins', dailyReward.total_logins + 1)
  }

  const trackAchievementProgress = async (requirementType, currentValue) => {
    if (!session) return []

    // Find achievements that match this requirement type
    const relevantAchievements = achievements.filter(a =>
      a.requirement_type === requirementType &&
      currentValue >= a.requirement_target
    )

    if (relevantAchievements.length === 0) return []

    const now = new Date().toISOString()
    const upserts = []
    const newlyUnlocked = []

    relevantAchievements.forEach(achievement => {
      const existing = achievementProgress.find(p => p.achievement_id === achievement.id)

      if (!existing || !existing.is_completed) {
        newlyUnlocked.push(achievement)
        upserts.push({
          user_id: session.user.id,
          achievement_id: achievement.id,
          progress: currentValue,
          is_completed: true,
          completed_at: now,
          updated_at: now,
        })
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

    // Award currency
    const nextSoft = (profile?.soft_currency || 0) + achievement.reward_soft_currency
    const nextPremium = (profile?.premium_currency || 0) + achievement.reward_premium_currency

    await supabase
      .from('profiles')
      .update({
        soft_currency: nextSoft,
        premium_currency: nextPremium,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id)

    // Award title if applicable
    if (achievement.reward_title) {
      await supabase
        .from('user_titles')
        .upsert({
          user_id: session.user.id,
          title_id: achievement.id,
          unlocked: true,
        })
    }

    // Mark as claimed
    await supabase
      .from('achievement_progress')
      .update({
        rewards_claimed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', session.user.id)
      .eq('achievement_id', achievementId)

    // Update local state
    setProfile(prev => ({
      ...prev,
      soft_currency: nextSoft,
      premium_currency: nextPremium,
    }))

    setAchievementProgress(prev => prev.map(p =>
      p.achievement_id === achievementId
        ? { ...p, rewards_claimed: true }
        : p
    ))
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

    // Calculate new currency values
    const nextSoft = soft - offer.cost_soft + (offer.item_type === 'currency' ? (offer.soft_currency || 0) : 0)
    const nextPremium = premium - offer.cost_premium + (offer.item_type === 'currency' ? (offer.premium_currency || 0) : 0)

    const inventoryUpdates = []

    // Handle shard purchases
    if (offer.item_type === 'shards' && offer.character_id && offer.shard_amount > 0) {
      const currentAmount = inventory[offer.character_id] || 0
      const nextAmount = currentAmount + offer.shard_amount
      inventoryUpdates.push({
        user_id: session.user.id,
        character_id: offer.character_id,
        shard_amount: nextAmount,
        updated_at: new Date().toISOString(),
      })
    }

    try {
      // Update profile currency first
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          soft_currency: nextSoft,
          premium_currency: nextPremium,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id)

      if (profileError) {
        console.error('Failed to update profile:', profileError)
        return
      }

      // Update inventory if shards purchased
      if (inventoryUpdates.length > 0) {
        const { error: inventoryError } = await supabase
          .from('user_inventory')
          .upsert(inventoryUpdates, { onConflict: 'user_id,character_id' })

        if (inventoryError) {
          console.error('Failed to update inventory:', inventoryError)
          return
        }

        // Update local inventory state
        setInventory(prev => ({
          ...prev,
          [offer.character_id]: inventoryUpdates[0].shard_amount,
        }))
      }

      // Update local profile state
      setProfile(prev => ({
        ...(prev || {}),
        soft_currency: nextSoft,
        premium_currency: nextPremium,
      }))
    } catch (error) {
      console.error('Purchase failed:', error)
    }
  }

  const pullGacha = async (bannerId, options = {}) => {
    if (!session) return
    const premium = profile?.premium_currency ?? 0
    const fragmentCount = userItems.finger_fragment || 0
    const pullCost = 25
    const useFragment = options.useFragment === true

    // Validate currency/fragments before pull
    if (useFragment) {
      if (fragmentCount <= 0) return
    } else if (premium < pullCost) {
      return
    }

    const items = bannerItems.filter(item => item.banner_id === bannerId)
    if (items.length === 0) return

    // Weighted random selection
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0)
    let roll = Math.random() * totalWeight
    let selected = items[0]
    for (const item of items) {
      roll -= item.weight
      if (roll <= 0) {
        selected = item
        break
      }
    }

    const nextPremium = useFragment ? premium : premium - pullCost
    let nextSoft = profile?.soft_currency ?? 0
    const inventoryUpdates = []
    const characterUnlockIds = []

    // Handle currency rewards
    if (selected.item_type === 'currency') {
      nextSoft += selected.soft_currency || 0
    }

    // Handle shard rewards
    if (selected.item_type === 'shards' && selected.character_id) {
      const currentAmount = inventory[selected.character_id] || 0
      const nextAmount = currentAmount + (selected.shard_amount || 0)
      inventoryUpdates.push({
        user_id: session.user.id,
        character_id: selected.character_id,
        shard_amount: nextAmount,
        updated_at: new Date().toISOString(),
      })
      setInventory(prev => ({
        ...prev,
        [selected.character_id]: nextAmount,
      }))
    }

    // Handle character rewards (FIXED: now unlocks character + gives shards)
    if (selected.item_type === 'character' && selected.character_id) {
      const currentAmount = inventory[selected.character_id] || 0
      const nextAmount = currentAmount + 30
      inventoryUpdates.push({
        user_id: session.user.id,
        character_id: selected.character_id,
        shard_amount: nextAmount,
        updated_at: new Date().toISOString(),
      })
      setInventory(prev => ({
        ...prev,
        [selected.character_id]: nextAmount,
      }))

      // Track character for unlock if not already unlocked
      if (!progressByCharacterId[selected.character_id]) {
        characterUnlockIds.push(selected.character_id)
      }
    }

    try {
      // Update profile currency (deduct cost, add soft currency if applicable)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          soft_currency: nextSoft,
          premium_currency: nextPremium,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id)

      if (profileError) {
        console.error('Failed to update profile:', profileError)
        return
      }

      // Deduct fragment if used
      if (useFragment) {
        const nextFragments = Math.max(0, fragmentCount - 1)
        const { error: fragmentError } = await supabase
          .from('user_items')
          .upsert({
            user_id: session.user.id,
            item_id: 'finger_fragment',
            quantity: nextFragments,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,item_id' })

        if (fragmentError) {
          console.error('Failed to deduct fragment:', fragmentError)
          return
        }

        setUserItems(prev => ({ ...prev, finger_fragment: nextFragments }))
      }

      // Update inventory with shards
      if (inventoryUpdates.length > 0) {
        const { error: inventoryError } = await supabase
          .from('user_inventory')
          .upsert(inventoryUpdates, { onConflict: 'user_id,character_id' })

        if (inventoryError) {
          console.error('Failed to update inventory:', inventoryError)
        }
      }

      // Unlock character if pulled (create character_progress entry)
      if (characterUnlockIds.length > 0) {
        const payload = characterUnlockIds.map(id => ({
          user_id: session.user.id,
          character_id: id,
          level: 1,
          xp: 0,
          limit_break: 0,
          updated_at: new Date().toISOString(),
        }))

        const { data: unlockData, error: unlockError } = await supabase
          .from('character_progress')
          .upsert(payload, { onConflict: 'user_id,character_id' })
          .select('character_id, level, xp, limit_break')

        if (unlockError) {
          console.error('Failed to unlock character:', unlockError)
        } else if (unlockData) {
          setCharacterProgress(prev => {
            const next = { ...prev }
            unlockData.forEach(row => {
              next[row.character_id] = {
                level: row.level,
                xp: row.xp,
                limit_break: row.limit_break,
              }
            })
            return next
          })
        }
      }

      // Update local profile state
      setProfile(prev => ({
        ...(prev || {}),
        soft_currency: nextSoft,
        premium_currency: nextPremium,
      }))

      // Show gacha result
      setGachaResult(selected)

      // Track achievement progress
      // Count total gacha pulls
      const { count: gachaPullCount } = await supabase
        .from('match_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)

      if (gachaPullCount !== null) {
        trackAchievementProgress('gacha_pulls', gachaPullCount + 1)
      }

      // Track characters unlocked
      if (characterUnlockIds.length > 0) {
        const unlockedCount = Object.keys(progressByCharacterId).length + characterUnlockIds.length
        trackAchievementProgress('characters_unlocked', unlockedCount)
      }
    } catch (error) {
      console.error('Gacha pull failed:', error)
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

    const nextShards = currentShards - cost

    await supabase
      .from('user_inventory')
      .upsert({
        user_id: session.user.id,
        character_id: characterId,
        shard_amount: nextShards,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,character_id' })

    await supabase
      .from('character_progress')
      .upsert({
        user_id: session.user.id,
        character_id: characterId,
        level: currentProgress.level,
        xp: currentProgress.xp,
        limit_break: nextLevel,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,character_id' })

    setInventory(prev => ({ ...prev, [characterId]: nextShards }))
    setCharacterProgress(prev => ({
      ...prev,
      [characterId]: {
        ...currentProgress,
        limit_break: nextLevel,
      },
    }))

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
    { label: 'Daily', onClick: () => safeNavigate('daily'), active: view === 'daily', disabled: navLocked },
    { label: 'Achievements', onClick: () => safeNavigate('achievements'), active: view === 'achievements', disabled: navLocked },
    { label: 'Shop', onClick: () => safeNavigate('shop'), active: view === 'shop', disabled: navLocked },
    { label: 'Gacha', onClick: () => safeNavigate('gacha'), active: view === 'gacha', disabled: navLocked },
    { label: 'Inventory', onClick: () => safeNavigate('inventory'), active: view === 'inventory', disabled: navLocked },
    { label: 'Missions', onClick: () => safeNavigate('missions'), active: view === 'missions', disabled: navLocked },
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
            setBattleResult(null)
            resetGame()
          }}
          isPvp={isPvp}
        />
      )}
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
          setActedCharacters={setActedCharacters}
          endTurn={handleEndTurn}
          profile={profile}
          matchSummary={matchSummary}
          combatEvents={combatEvents}
          battleShake={battleShake}
          isPvp={isPvp}
          isMyTurn={isMyTurn}
          storyBattle={storyBattleConfig}
          onExitStory={exitStoryBattle}
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
      ) : view === 'missions' ? (
        <MissionsPage
          missions={missions}
          userMissions={userMissions}
          onBack={() => setView('team')}
          onClaim={claimMission}
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
      ) : view === 'daily' ? (
        <DailyRewards
          dailyReward={dailyReward}
          onClaim={claimDailyReward}
          onBack={() => setView('team')}
        />
      ) : view === 'achievements' ? (
        <Achievements
          achievements={achievements}
          progress={achievementProgress}
          onClaimReward={claimAchievementReward}
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
    </AuthGate>
  )
}

export default App
