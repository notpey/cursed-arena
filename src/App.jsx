import React, { useEffect, useMemo, useState } from 'react'
import { characters } from './characters'
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

  const scaledCharacter = (character, progress) => {
    const level = progress?.level || 1
    const limitBreak = progress?.limit_break || 0
    const hpBonus = (level - 1) * 3 + limitBreak * 12
    const manaBonus = (level - 1) * 2 + limitBreak * 4
    const attackBonus = (level - 1) * 1 + limitBreak * 3

    return {
      ...deepCopy(character),
      level,
      xp: progress?.xp || 0,
      limit_break: limitBreak,
      maxHp: character.maxHp + hpBonus,
      hp: character.maxHp + hpBonus,
      maxMana: character.maxMana + manaBonus,
      mana: character.maxMana + manaBonus,
      attack: character.attack + attackBonus,
    }
  }

  const progressByCharacterId = useMemo(() => characterProgress, [characterProgress])
  const storyChapter = useMemo(
    () => storyChapters.find(chapter => chapter.id === storyState.chapterId) || storyChapters[0],
    [storyState.chapterId]
  )

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
    const match = characters.find(character => character.id === unitId || character.name === unitId)
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
      completeStoryNode(storyResult.nodeId)
    }
    setStoryResult(null)
  }

  const claimStoryRewards = async () => {
    if (storyRewardsClaimed || !storyChapter) return
    const softReward = storyChapter.rewards.find(reward => reward.type === 'soft_currency')
    const premiumReward = storyChapter.rewards.find(reward => reward.type === 'premium_currency')
    const softGain = softReward?.amount || 0
    const premiumGain = premiumReward?.amount || 0

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

    setStoryRewardsClaimed(true)
  }

  useEffect(() => {
    if (!session) {
      setCharacterProgress({})
      setMatchHistory([])
      setTeamPresets({})
      setMissions([])
      setUserMissions([])
      setShopOffers([])
      setBanners([])
      setBannerItems([])
      setInventory({})
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
      const [{ data: missionData }, { data: userMissionData }, { data: offerData }, { data: bannerData }, { data: bannerItemData }, { data: inventoryData }] = await Promise.all([
        supabase.from('missions').select('*').order('id'),
        supabase.from('user_missions').select('*').eq('user_id', session.user.id),
        supabase.from('shop_offers').select('*').eq('active', true).order('id'),
        supabase.from('banners').select('*').order('id'),
        supabase.from('banner_items').select('*').order('banner_id'),
        supabase.from('user_inventory').select('*').eq('user_id', session.user.id),
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

  const applyPassives = (team, isStartOfTurn = false, teamType = 'player') => {
    const newTeam = deepCopy(team)
    const logs = []

    newTeam.forEach(char => {
      if (char.hp <= 0 || !char.passive) return

      if (isStartOfTurn) {
        if (char.passive.type === 'regen') {
          const healed = Math.min(char.passive.value, char.maxHp - char.hp)
          if (healed > 0) {
            char.hp = Math.min(char.maxHp, char.hp + char.passive.value)
            logs.push(`💚 ${char.name}'s ${char.passive.name} heals ${healed} HP!`)
            pushCombatEvent({ team: teamType, index: newTeam.findIndex(item => item.id === char.id), amount: healed, type: 'heal' })
          }
        }
        
        if (char.burning) {
          char.hp = Math.max(0, char.hp - char.burning)
          logs.push(`🔥 ${char.name} takes ${char.burning} burn damage!`)
          pushCombatEvent({ team: teamType, index: newTeam.findIndex(item => item.id === char.id), amount: char.burning, type: 'damage' })
          char.burning = 0
        }
      }
    })

    return { team: newTeam, logs }
  }

  const calculateDamage = (attacker, baseDamage) => {
    let damage = baseDamage
    
    if (attacker.attackBuff) {
      damage += attacker.attackBuff
    }
    
    if (attacker.passive?.type === 'damage-boost') {
      damage = Math.floor(damage * (1 + attacker.passive.value))
    }
    
    return damage
  }

  const finalizeBattle = (result, teamSnapshot, newLog = []) => {
    if (newLog.length > 0) {
      setBattleLog(prev => [...prev, ...newLog])
    }
    setGameOver(result === 'win' ? 'win' : 'lose')

    if (storyBattleConfig) {
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

    if (attacker.stunned) {
      return { logs: [`😵 ${attacker.name} is stunned and cannot act!`] }
    }

    const ability = isUltimate ? attacker.ultimate : attacker.abilities[abilityIndex]
    if (!ability) return { logs: [] }

    let newLog = []

    // Put ability on cooldown
    if (isUltimate) {
      newPlayerTeam[characterIndex].ultimate.currentCooldown = ability.cooldown
    } else {
      newPlayerTeam[characterIndex].abilities[abilityIndex].currentCooldown = ability.cooldown
    }

    // Deduct mana
    let manaCost = ability.manaCost || 0
    if (attacker.passive?.manaReduction) {
      manaCost = Math.floor(manaCost * (1 - attacker.passive.manaReduction))
    }
    if (attacker.mana < manaCost) {
      return { logs: [`⛔ ${attacker.name} doesn't have enough mana for ${ability.name}.`] }
    }
    newPlayerTeam[characterIndex].mana -= manaCost

    // Execute ability based on type
    const shouldDodge = (target) =>
      target.passive?.type === 'dodge-chance' && Math.random() < target.passive.value

    const isBlocked = (target) => target.invincible

    switch (ability.type) {
      case 'attack': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        if (shouldDodge(target)) {
          newLog.push(`💨 ${target.name} DODGES ${attacker.name}'s ${ability.name}!`)
        } else if (isBlocked(target)) {
          newLog.push(`🛡️ ${target.name} blocks ${attacker.name}'s ${ability.name}!`)
        } else {
          let damage = calculateDamage(attacker, ability.damage)
          
          if (attacker.passive?.type === 'execute' && target.hp / target.maxHp < attacker.passive.threshold) {
            damage = Math.floor(damage * (1 + attacker.passive.value))
          }

          if (target.marked) damage += target.marked
          
          target.hp = Math.max(0, target.hp - damage)
          newLog.push(`⚔️ ${attacker.name} → ${ability.name} → ${target.name} for ${damage} damage!`)
          emitDamage('enemy', enemyIndex, damage, damage >= 45)
          if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
          
          if (attacker.passive?.type === 'burn') {
            target.burning = attacker.passive.value
            newLog.push(`🔥 ${target.name} is burning!`)
          }
          
          if (attacker.passive?.type === 'stacking-attack') {
            newPlayerTeam[characterIndex].attack += attacker.passive.value
            newLog.push(`💪 ${attacker.name}'s attack increases!`)
          }

          if (attacker.passive?.type === 'double-hit' && Math.random() < attacker.passive.value) {
            target.hp = Math.max(0, target.hp - damage)
            newLog.push(`✨ Resonance! Hits again for ${damage}!`)
            emitDamage('enemy', enemyIndex, damage, damage >= 45)
            if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
          }
        }
        break
      }

      case 'attack-execute': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        if (shouldDodge(target)) {
          newLog.push(`💨 ${target.name} DODGES ${attacker.name}'s ${ability.name}!`)
        } else if (isBlocked(target)) {
          newLog.push(`🛡️ ${target.name} blocks ${attacker.name}'s ${ability.name}!`)
        } else {
          let damage = calculateDamage(attacker, ability.damage)
          
          if (target.hp / target.maxHp < ability.threshold) {
            damage += ability.bonusDamage
            newLog.push(`💀 Weak point strike!`)
          }

          if (target.marked) damage += target.marked
          
          target.hp = Math.max(0, target.hp - damage)
          newLog.push(`⚔️ ${attacker.name} → ${ability.name} → ${target.name} for ${damage}!`)
          emitDamage('enemy', enemyIndex, damage, damage >= 45)
          if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
        }
        break
      }
      
      case 'attack-all': {
        newLog.push(`🔥 ${attacker.name} uses ${ability.name}!`)
        const damage = calculateDamage(attacker, ability.damage)
        newEnemyTeam.forEach((enemy, idx) => {
          if (enemy.hp > 0) {
            if (shouldDodge(enemy)) {
              newLog.push(`  💨 ${enemy.name} DODGES!`)
            } else if (isBlocked(enemy)) {
              newLog.push(`  🛡️ ${enemy.name} blocks!`)
            } else {
              let finalDamage = damage
              if (enemy.marked) finalDamage += enemy.marked
              enemy.hp = Math.max(0, enemy.hp - finalDamage)
              newLog.push(`  → ${enemy.name} takes ${finalDamage}!`)
              emitDamage('enemy', idx, finalDamage, finalDamage >= 45)
              if (enemy.hp <= 0) newLog.push(`  🎉 ${enemy.name} defeated!`)
              
              if (attacker.passive?.type === 'burn') {
                enemy.burning = attacker.passive.value
              }
            }
          }
        })
        break
      }

      case 'attack-stun': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        if (shouldDodge(target)) {
          newLog.push(`💨 ${target.name} DODGES ${attacker.name}'s ${ability.name}!`)
        } else if (isBlocked(target)) {
          newLog.push(`🛡️ ${target.name} blocks ${attacker.name}'s ${ability.name}!`)
        } else {
          let damage = calculateDamage(attacker, ability.damage)
          if (target.marked) damage += target.marked
          target.hp = Math.max(0, target.hp - damage)
          target.stunned = ability.stunDuration
          newLog.push(`⚡ ${attacker.name} → ${ability.name} → ${target.name} for ${damage} + STUN!`)
          emitDamage('enemy', enemyIndex, damage, damage >= 45)
          if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
        }
        break
      }

      case 'stun-only': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        target.stunned = ability.stunDuration
        newLog.push(`⚡ ${attacker.name} → ${ability.name} → ${target.name} STUNNED ${ability.stunDuration} turns!`)
        break
      }

      case 'defensive': {
        newPlayerTeam[characterIndex].invincible = 1
        newLog.push(`🛡️ ${attacker.name} uses ${ability.name} → INVINCIBLE!`)
        break
      }

      case 'buff': {
        newPlayerTeam[characterIndex].attackBuff = (newPlayerTeam[characterIndex].attackBuff || 0) + ability.buffAmount
        newPlayerTeam[characterIndex].buffDuration = ability.duration
        newLog.push(`💪 ${attacker.name} uses ${ability.name} → ATK +${ability.buffAmount}!`)
        break
      }

      case 'buff-self-damage': {
        newPlayerTeam[characterIndex].attackBuff = (newPlayerTeam[characterIndex].attackBuff || 0) + ability.buffAmount
        newPlayerTeam[characterIndex].buffDuration = ability.duration
        newPlayerTeam[characterIndex].hp = Math.max(1, newPlayerTeam[characterIndex].hp - ability.selfDamage)
        newLog.push(`💪 ${attacker.name} uses ${ability.name} → ATK +${ability.buffAmount}, -${ability.selfDamage} HP!`)
        emitDamage('player', characterIndex, ability.selfDamage, false)
        break
      }

      case 'heal-self': {
        const healed = Math.min(ability.healAmount, attacker.maxHp - attacker.hp)
        newPlayerTeam[characterIndex].hp = Math.min(attacker.maxHp, attacker.hp + ability.healAmount)
        newLog.push(`💚 ${attacker.name} uses ${ability.name} → +${healed} HP!`)
        emitHeal('player', characterIndex, healed)
        break
      }

      case 'heal-all': {
        newLog.push(`💚 ${attacker.name} uses ${ability.name}!`)
        newPlayerTeam.forEach(ally => {
          if (ally.hp > 0) {
            const healed = Math.min(ability.healAmount, ally.maxHp - ally.hp)
            ally.hp = Math.min(ally.maxHp, ally.hp + ability.healAmount)
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
        const damage = calculateDamage(attacker, ability.damage)
        newLog.push(`🌑 ${attacker.name} uses ${ability.name}!`)
        newEnemyTeam.forEach((enemy, idx) => {
          if (enemy.hp > 0) {
            enemy.hp = Math.max(0, enemy.hp - damage)
            newLog.push(`  → ${enemy.name} takes ${damage}!`)
            emitDamage('enemy', idx, damage, damage >= 45)
            if (enemy.hp <= 0) newLog.push(`  🎉 ${enemy.name} defeated!`)
          }
        })
        newPlayerTeam.forEach((ally, idx) => {
          if (ally.hp > 0) {
            const healed = Math.min(ability.healAmount, ally.maxHp - ally.hp)
            ally.hp = Math.min(ally.maxHp, ally.hp + ability.healAmount)
            if (healed > 0) newLog.push(`  💚 ${ally.name} +${healed} HP!`)
            if (healed > 0) emitHeal('player', idx, healed)
          }
        })
        break
      }

      case 'ultimate-mahito': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        newPlayerTeam[characterIndex].invincible = 1
        if (shouldDodge(target)) {
          newLog.push(`💨 ${target.name} DODGES ${attacker.name}'s ${ability.name}!`)
        } else if (isBlocked(target)) {
          newLog.push(`🛡️ ${target.name} blocks ${attacker.name}'s ${ability.name}!`)
        } else {
          let damage = calculateDamage(attacker, ability.damage)
          if (target.marked) damage += target.marked
          target.hp = Math.max(0, target.hp - damage)
          newLog.push(`👹 ${attacker.name} → ${ability.name} → INVINCIBLE + ${damage} to ${target.name}!`)
          emitDamage('enemy', enemyIndex, damage, damage >= 45)
          if (target.hp <= 0) newLog.push(`🎉 ${target.name} defeated!`)
        }
        break
      }

      case 'debuff-mark': {
        const target = newEnemyTeam[enemyIndex]
        if (!target || target.hp <= 0) break
        target.marked = ability.extraDamage
        target.markedDuration = ability.duration
        newLog.push(`🎯 ${attacker.name} → ${ability.name} → ${target.name} MARKED!`)
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
          newPlayerTeam[allyIndex].attackBuff = (newPlayerTeam[allyIndex].attackBuff || 0) + ability.buffAmount
          newPlayerTeam[allyIndex].buffDuration = ability.duration
          newLog.push(`💪 ${attacker.name} → ${ability.name} → ${randomAlly.name} ATK +${ability.buffAmount}!`)
        }
        break
      }

      default:
        break
    }

    return { logs: newLog }
  }

  const queueAbility = (characterIndex, abilityIndex, isUltimate, enemyIndex) => {
    if (gameOver) return
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

    // Apply enemy passives
    const enemyPassiveResult = applyPassives(newEnemyTeam, true, 'enemy')
    newEnemyTeam = enemyPassiveResult.team
    newLog.push(...enemyPassiveResult.logs)

    // Enemy turn - each alive enemy acts
    const aliveEnemies = newEnemyTeam.filter(e => e.hp > 0 && !e.stunned)
    
    aliveEnemies.forEach(enemy => {
      const enemyIndex = newEnemyTeam.findIndex(e => e.id === enemy.id)
      const aliveAllies = newPlayerTeam.filter(a => a.hp > 0)
      
      if (aliveAllies.length === 0) return

      const allAbilities = [...enemy.abilities]
      if (enemy.ultimate.currentCooldown === 0) {
        allAbilities.push({ ...enemy.ultimate, isUlt: true })
      }
      
      const availableAbilities = allAbilities.filter(a => a.currentCooldown === 0 && (a.manaCost || 0) <= enemy.mana)
      
      if (availableAbilities.length > 0) {
        const randomAbility = availableAbilities[Math.floor(Math.random() * availableAbilities.length)]
        
        // Put on cooldown and deduct mana
        if (randomAbility.isUlt) {
          newEnemyTeam[enemyIndex].ultimate.currentCooldown = randomAbility.cooldown
        } else {
          const abilityIndex = enemy.abilities.findIndex(a => a.id === randomAbility.id)
          if (abilityIndex >= 0) {
            newEnemyTeam[enemyIndex].abilities[abilityIndex].currentCooldown = randomAbility.cooldown
          }
        }
        newEnemyTeam[enemyIndex].mana -= (randomAbility.manaCost || 0)

        // Find target
        const targetIndex = newPlayerTeam.findIndex(a => a.hp > 0)
        const target = newPlayerTeam[targetIndex]

        if (randomAbility.type === 'attack' || randomAbility.type === 'attack-stun' || randomAbility.type === 'attack-execute') {
          if (target.passive?.type === 'dodge-chance' && Math.random() < target.passive.value) {
            newLog.push(`💨 ${target.name} DODGES ${enemy.name}'s ${randomAbility.name}!`)
          } else if (target.invincible) {
            newLog.push(`🛡️ ${target.name} blocks ${enemy.name}'s ${randomAbility.name}!`)
          } else {
            let damage = calculateDamage(enemy, randomAbility.damage)
            if (target.marked) damage += target.marked
            target.hp = Math.max(0, target.hp - damage)
            newLog.push(`👊 ${enemy.name} → ${randomAbility.name} → ${target.name} for ${damage}!`)
            emitDamage('player', targetIndex, damage, damage >= 45)
            if (target.hp <= 0) newLog.push(`💀 ${target.name} KO'd!`)
            
            if (enemy.passive?.type === 'burn') {
              target.burning = enemy.passive.value
            }
          }
        } else if (randomAbility.type === 'attack-all') {
          newLog.push(`🔥 ${enemy.name} uses ${randomAbility.name}!`)
          const damage = calculateDamage(enemy, randomAbility.damage)
          newPlayerTeam.forEach((ally, idx) => {
            if (ally.hp > 0) {
              if (ally.passive?.type === 'dodge-chance' && Math.random() < ally.passive.value) {
                newLog.push(`  💨 ${ally.name} DODGES!`)
              } else if (ally.invincible) {
                newLog.push(`  🛡️ ${ally.name} blocks!`)
              } else {
                let allyDamage = damage
                if (ally.marked) allyDamage += ally.marked
                ally.hp = Math.max(0, ally.hp - allyDamage)
                newLog.push(`  → ${ally.name} takes ${allyDamage}!`)
                emitDamage('player', idx, allyDamage, allyDamage >= 45)
                if (ally.hp <= 0) newLog.push(`  💀 ${ally.name} KO'd!`)
              }
            }
          })
        } else if (randomAbility.type === 'heal-self') {
          const healed = Math.min(randomAbility.healAmount, enemy.maxHp - enemy.hp)
          newEnemyTeam[enemyIndex].hp = Math.min(enemy.maxHp, enemy.hp + randomAbility.healAmount)
          newLog.push(`💚 ${enemy.name} heals ${healed} HP!`)
          emitHeal('enemy', enemyIndex, healed)
        } else if (randomAbility.type === 'defensive') {
          newEnemyTeam[enemyIndex].invincible = 1
          newLog.push(`🛡️ ${enemy.name} becomes INVINCIBLE!`)
        }
      }
    })

    // Stunned enemy messages
    newEnemyTeam.forEach(enemy => {
      if (enemy.stunned && enemy.hp > 0) {
        newLog.push(`😵 ${enemy.name} is STUNNED!`)
      }
    })

    // Apply player passives
    const playerPassiveResult = applyPassives(newPlayerTeam, true, 'player')
    newPlayerTeam = playerPassiveResult.team
    newLog.push(...playerPassiveResult.logs)

    // Tick cooldowns and effects for player
    newPlayerTeam.forEach(char => {
      const cdReduction = char.passive?.type === 'cooldown-reduction' ? char.passive.value : 0
      
      if (char.hp > 0) {
        char.mana = Math.min(char.maxMana, char.mana + 25)
      }
      
      char.abilities.forEach(ab => {
        if (ab.currentCooldown > 0) ab.currentCooldown = Math.max(0, ab.currentCooldown - 1 - cdReduction)
      })
      if (char.ultimate?.currentCooldown > 0) {
        char.ultimate.currentCooldown = Math.max(0, char.ultimate.currentCooldown - 1 - cdReduction)
      }
      if (char.invincible) char.invincible--
      if (char.buffDuration) {
        char.buffDuration--
        if (char.buffDuration <= 0) char.attackBuff = 0
      }
      if (char.markedDuration) {
        char.markedDuration--
        if (char.markedDuration <= 0) char.marked = 0
      }
    })

    // Tick cooldowns for enemies
    newEnemyTeam.forEach(char => {
      const cdReduction = char.passive?.type === 'cooldown-reduction' ? char.passive.value : 0
      
      if (char.hp > 0) {
        char.mana = Math.min(char.maxMana, char.mana + 25)
      }
      
      char.abilities.forEach(ab => {
        if (ab.currentCooldown > 0) ab.currentCooldown = Math.max(0, ab.currentCooldown - 1 - cdReduction)
      })
      if (char.ultimate?.currentCooldown > 0) {
        char.ultimate.currentCooldown = Math.max(0, char.ultimate.currentCooldown - 1 - cdReduction)
      }
      if (char.stunned) char.stunned--
      if (char.invincible) char.invincible--
      if (char.markedDuration) {
        char.markedDuration--
        if (char.markedDuration <= 0) char.marked = 0
      }
    })

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

  const handleEndTurn = () => {
    if (gamePhase !== 'battle' || gameOver) return
    setPendingAbility(null)
    
    let newEnemyTeam = deepCopy(enemyTeam)
    let newPlayerTeam = deepCopy(playerTeam)
    let newLog = []

    queuedActions.forEach(action => {
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

  const startBattle = () => {
    const leveledTeam = selectedPlayerTeam.map(character =>
      scaledCharacter(character, progressByCharacterId[character.id])
    )
    setPlayerTeam(leveledTeam)
    
    const availableEnemies = characters.filter(
      c => !selectedPlayerTeam.some(p => p.id === c.id)
    )
    const shuffled = [...availableEnemies].sort(() => Math.random() - 0.5)
    setEnemyTeam(deepCopy(shuffled.slice(0, 3)))
    
    setGamePhase('battle')
    setBattleLog(["Battle Start! Queue actions, then End Turn."])
    setActedCharacters([])
    setQueuedActions([])
    setStoryBattleConfig(null)
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
      .map(id => characters.find(character => character.id === id))
      .filter(Boolean)
    setSelectedPlayerTeam(nextTeam)
  }

  const awardProgress = async (result, teamSnapshot) => {
    if (!session) return

    const accountGain = result === 'win' ? 60 : 40
    const characterGain = result === 'win' ? 35 : 25

    const currentAccountLevel = profile?.account_level || 1
    const currentAccountXp = profile?.account_xp || 0
    const currentRating = profile?.rating ?? 1000
    const nextAccount = applyXpGain(currentAccountLevel, currentAccountXp, accountGain)
    const ratingDelta = result === 'win' ? 20 : -15
    const nextRating = Math.max(0, currentRating + ratingDelta)

    const toastMessages = []
    if (nextAccount.level > currentAccountLevel) {
      toastMessages.push(`Account leveled up to ${nextAccount.level}!`)
    }

    setProfile(prev => ({
      ...(prev || {}),
      account_level: nextAccount.level,
      account_xp: nextAccount.xp,
      rating: nextRating,
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

  const purchaseOffer = async (offerId) => {
    if (!session) return
    const offer = shopOffers.find(item => item.id === offerId)
    if (!offer) return

    const soft = profile?.soft_currency ?? 0
    const premium = profile?.premium_currency ?? 0
    if (soft < offer.cost_soft || premium < offer.cost_premium) return

    const nextSoft = soft - offer.cost_soft
    const nextPremium = premium - offer.cost_premium

    const inventoryUpdates = []
    if (offer.item_type === 'shards' && offer.character_id && offer.shard_amount > 0) {
      const currentAmount = inventory[offer.character_id] || 0
      const nextAmount = currentAmount + offer.shard_amount
      inventoryUpdates.push({
        user_id: session.user.id,
        character_id: offer.character_id,
        shard_amount: nextAmount,
        updated_at: new Date().toISOString(),
      })
      setInventory(prev => ({
        ...prev,
        [offer.character_id]: nextAmount,
      }))
    }

    if (offer.item_type === 'currency') {
      const addSoft = offer.soft_currency || 0
      const addPremium = offer.premium_currency || 0
      setProfile(prev => ({
        ...(prev || {}),
        soft_currency: nextSoft + addSoft,
        premium_currency: nextPremium + addPremium,
      }))
      await supabase
        .from('profiles')
        .update({
          soft_currency: nextSoft + addSoft,
          premium_currency: nextPremium + addPremium,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id)
    } else {
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

    if (inventoryUpdates.length > 0) {
      await supabase
        .from('user_inventory')
        .upsert(inventoryUpdates, { onConflict: 'user_id,character_id' })
    }
  }

  const pullGacha = async (bannerId) => {
    if (!session) return
    const premium = profile?.premium_currency ?? 0
    const pullCost = 100
    if (premium < pullCost) return

    const items = bannerItems.filter(item => item.banner_id === bannerId)
    if (items.length === 0) return

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

    const nextPremium = premium - pullCost
    let nextSoft = profile?.soft_currency ?? 0
    const inventoryUpdates = []

    if (selected.item_type === 'currency') {
      nextSoft += selected.soft_currency || 0
    }

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
    }

    await supabase
      .from('profiles')
      .update({
        soft_currency: nextSoft,
        premium_currency: nextPremium,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id)

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
    setGachaResult(selected)
  }

  const limitBreakCost = (nextLevel) => nextLevel * 25

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
  const navItems = [
    { label: 'Home', onClick: goHome, active: view === 'team' && gamePhase === 'select' },
    { label: 'Story', onClick: () => safeNavigate('story'), active: view === 'story', disabled: navLocked },
    { label: 'Shop', onClick: () => safeNavigate('shop'), active: view === 'shop', disabled: navLocked },
    { label: 'Gacha', onClick: () => safeNavigate('gacha'), active: view === 'gacha', disabled: navLocked },
    { label: 'Inventory', onClick: () => safeNavigate('inventory'), active: view === 'inventory', disabled: navLocked },
    { label: 'Missions', onClick: () => safeNavigate('missions'), active: view === 'missions', disabled: navLocked },
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
          storyBattle={storyBattleConfig}
          onExitStory={exitStoryBattle}
        />
      ) : view === 'profile' ? (
        <ProfilePage
          profile={profile}
          matchHistory={matchHistory}
          onBack={() => setView('team')}
          onProfileUpdate={setProfile}
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
          characters={characters}
          inventory={inventory}
          characterProgress={characterProgress}
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
          onBack={() => setView('team')}
          onPull={pullGacha}
          result={gachaResult}
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
      ) : (
        <TeamSelect
          characters={characters}
          selectedTeam={selectedPlayerTeam}
          onSelect={setSelectedPlayerTeam}
          onStartBattle={startBattle}
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
