import React, { useState } from 'react'
import { characters } from './characters'
import './App.css'

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj))

function App() {
  const [playerTeam, setPlayerTeam] = useState(deepCopy(characters.slice(0, 3)))
  const [enemyTeam, setEnemyTeam] = useState(deepCopy(characters.slice(3, 6)))
  const [selectedAlly, setSelectedAlly] = useState(null)
  const [selectedEnemy, setSelectedEnemy] = useState(null)
  const [selectedAbility, setSelectedAbility] = useState(null)
  const [isUltimate, setIsUltimate] = useState(false)
  const [battleLog, setBattleLog] = useState(["Battle Start! Select an ally, an ability, then a target!"])
  const [gameOver, setGameOver] = useState(null)
  const [turn, setTurn] = useState(1)

  const applyPassives = (team, isStartOfTurn = false) => {
    const newTeam = deepCopy(team)
    const logs = []

    newTeam.forEach(char => {
      if (char.hp <= 0 || !char.passive) return

      if (isStartOfTurn) {
        // Regen passive
        if (char.passive.type === 'regen') {
          const healed = Math.min(char.passive.value, char.maxHp - char.hp)
          if (healed > 0) {
            char.hp = Math.min(char.maxHp, char.hp + char.passive.value)
            logs.push(`💚 ${char.name}'s ${char.passive.name} heals ${healed} HP!`)
          }
        }
        
        // Burn damage (for enemies with burn status)
        if (char.burning) {
          char.hp = Math.max(0, char.hp - char.burning)
          logs.push(`🔥 ${char.name} takes ${char.burning} burn damage!`)
          char.burning = 0
        }
      }
    })

    return { team: newTeam, logs }
  }

  const calculateDamage = (attacker, baseDamage) => {
    let damage = baseDamage
    
    // Attack buff
    if (attacker.attackBuff) {
      damage += attacker.attackBuff
    }
    
    // Passive damage boost
    if (attacker.passive?.type === 'damage-boost') {
      damage = Math.floor(damage * (1 + attacker.passive.value))
    }
    
    return damage
  }

  const selectAbility = (index, ultimate = false) => {
    setSelectedAbility(index)
    setIsUltimate(ultimate)
  }

  const executeAbility = () => {
    if (gameOver) return

    if (selectedAlly === null || selectedAbility === null) {
      setBattleLog(prev => [...prev, "⚠️ Select a character and an ability!"])
      return
    }

    const attacker = playerTeam[selectedAlly]
    const ability = isUltimate ? attacker.ultimate : attacker.abilities[selectedAbility]

    if (attacker.hp <= 0) {
      setBattleLog(prev => [...prev, `💀 ${attacker.name} is knocked out!`])
      return
    }

    if (ability.currentCooldown > 0) {
      setBattleLog(prev => [...prev, `⏳ ${ability.name} is on cooldown! (${ability.currentCooldown} turns)`])
      return
    }

    const needsTarget = ['attack', 'attack-stun', 'stun-only', 'ultimate-mahito'].includes(ability.type)
    if (needsTarget && selectedEnemy === null) {
      setBattleLog(prev => [...prev, "⚠️ Select an enemy target!"])
      return
    }

    if (needsTarget && enemyTeam[selectedEnemy].hp <= 0) {
      setBattleLog(prev => [...prev, `💀 That enemy is already defeated!`])
      return
    }

    let newLog = []
    let newEnemyTeam = deepCopy(enemyTeam)
    let newPlayerTeam = deepCopy(playerTeam)

    // Put ability on cooldown
    if (isUltimate) {
      newPlayerTeam[selectedAlly].ultimate.currentCooldown = ability.cooldown
    } else {
      newPlayerTeam[selectedAlly].abilities[selectedAbility].currentCooldown = ability.cooldown
    }

    // Execute based on ability type
    switch (ability.type) {
      case 'attack': {
        const target = newEnemyTeam[selectedEnemy]
        const damage = calculateDamage(attacker, ability.damage)
        target.hp = Math.max(0, target.hp - damage)
        newLog.push(`⚔️ ${attacker.name} uses ${ability.name} on ${target.name} for ${damage} damage!`)
        if (target.hp <= 0) newLog.push(`🎉 ${target.name} has been defeated!`)
        
        // Apply burn from Jogo's passive
        if (attacker.passive?.type === 'burn') {
          target.burning = attacker.passive.value
          newLog.push(`🔥 ${target.name} is burning!`)
        }
        break
      }
      
      case 'attack-all': {
        newLog.push(`🔥 ${attacker.name} uses ${ability.name}!`)
        const damage = calculateDamage(attacker, ability.damage)
        newEnemyTeam.forEach(enemy => {
          if (enemy.hp > 0) {
            enemy.hp = Math.max(0, enemy.hp - damage)
            newLog.push(`  → ${enemy.name} takes ${damage} damage!`)
            if (enemy.hp <= 0) newLog.push(`  🎉 ${enemy.name} has been defeated!`)
            
            if (attacker.passive?.type === 'burn') {
              enemy.burning = attacker.passive.value
            }
          }
        })
        break
      }

      case 'attack-stun': {
        const target = newEnemyTeam[selectedEnemy]
        const damage = calculateDamage(attacker, ability.damage)
        target.hp = Math.max(0, target.hp - damage)
        target.stunned = ability.stunDuration
        newLog.push(`⚡ ${attacker.name} uses ${ability.name} on ${target.name} for ${damage} damage and STUNS them!`)
        if (target.hp <= 0) newLog.push(`🎉 ${target.name} has been defeated!`)
        break
      }

      case 'stun-only': {
        const target = newEnemyTeam[selectedEnemy]
        target.stunned = ability.stunDuration
        newLog.push(`⚡ ${attacker.name} uses ${ability.name}! ${target.name} is STUNNED for ${ability.stunDuration} turns!`)
        break
      }

      case 'defensive': {
        newPlayerTeam[selectedAlly].invincible = 1
        newLog.push(`🛡️ ${attacker.name} uses ${ability.name} and becomes INVINCIBLE!`)
        break
      }

      case 'buff': {
        newPlayerTeam[selectedAlly].attackBuff = (newPlayerTeam[selectedAlly].attackBuff || 0) + ability.buffAmount
        newPlayerTeam[selectedAlly].buffDuration = ability.duration
        newLog.push(`💪 ${attacker.name} uses ${ability.name}! Attack boosted by ${ability.buffAmount}!`)
        break
      }

      case 'heal-self': {
        const healed = Math.min(ability.healAmount, attacker.maxHp - attacker.hp)
        newPlayerTeam[selectedAlly].hp = Math.min(attacker.maxHp, attacker.hp + ability.healAmount)
        newLog.push(`💚 ${attacker.name} uses ${ability.name} and heals for ${healed} HP!`)
        break
      }

      case 'heal-all': {
        newLog.push(`💚 ${attacker.name} uses ${ability.name}!`)
        newPlayerTeam.forEach(ally => {
          if (ally.hp > 0) {
            const healed = Math.min(ability.healAmount, ally.maxHp - ally.hp)
            ally.hp = Math.min(ally.maxHp, ally.hp + ability.healAmount)
            if (healed > 0) newLog.push(`  → ${ally.name} heals for ${healed} HP!`)
          }
        })
        break
      }

      case 'ultimate-megumi': {
        const damage = calculateDamage(attacker, ability.damage)
        newLog.push(`🌑 ${attacker.name} uses ${ability.name}!`)
        newEnemyTeam.forEach(enemy => {
          if (enemy.hp > 0) {
            enemy.hp = Math.max(0, enemy.hp - damage)
            newLog.push(`  → ${enemy.name} takes ${damage} damage!`)
            if (enemy.hp <= 0) newLog.push(`  🎉 ${enemy.name} has been defeated!`)
          }
        })
        newPlayerTeam.forEach(ally => {
          if (ally.hp > 0) {
            const healed = Math.min(ability.healAmount, ally.maxHp - ally.hp)
            ally.hp = Math.min(ally.maxHp, ally.hp + ability.healAmount)
            if (healed > 0) newLog.push(`  💚 ${ally.name} heals for ${healed} HP!`)
          }
        })
        break
      }

      case 'ultimate-mahito': {
        const target = newEnemyTeam[selectedEnemy]
        const damage = calculateDamage(attacker, ability.damage)
        target.hp = Math.max(0, target.hp - damage)
        newPlayerTeam[selectedAlly].invincible = 1
        newLog.push(`👹 ${attacker.name} uses ${ability.name}! Becomes INVINCIBLE and deals ${damage} to ${target.name}!`)
        if (target.hp <= 0) newLog.push(`🎉 ${target.name} has been defeated!`)
        break
      }

      default:
        break
    }

    // Check win condition
    if (newEnemyTeam.every(e => e.hp <= 0)) {
      newLog.push(`👑 VICTORY! You destroyed the enemy team!`)
      setBattleLog(prev => [...prev, ...newLog])
      setGameOver('win')
      setPlayerTeam(newPlayerTeam)
      setEnemyTeam(newEnemyTeam)
      return
    }

    // Apply start-of-turn passives for enemies
    const enemyPassiveResult = applyPassives(newEnemyTeam, true)
    newEnemyTeam = enemyPassiveResult.team
    newLog.push(...enemyPassiveResult.logs)

    // ENEMY TURN
    const aliveEnemies = newEnemyTeam.filter(e => e.hp > 0 && !e.stunned)
    const aliveAllies = newPlayerTeam.filter(a => a.hp > 0)

    if (aliveEnemies.length > 0 && aliveAllies.length > 0) {
      const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
      const enemyIndex = newEnemyTeam.findIndex(e => e.id === randomEnemy.id)
      
      // Combine abilities and ultimate for enemy selection
      const allAbilities = [...randomEnemy.abilities]
      if (randomEnemy.ultimate.currentCooldown === 0) {
        allAbilities.push({ ...randomEnemy.ultimate, isUlt: true })
      }
      
      const availableAbilities = allAbilities.filter(a => a.currentCooldown === 0)
      
      if (availableAbilities.length > 0) {
        const randomAbility = availableAbilities[Math.floor(Math.random() * availableAbilities.length)]
        
        // Put on cooldown
        if (randomAbility.isUlt) {
          newEnemyTeam[enemyIndex].ultimate.currentCooldown = randomAbility.cooldown
        } else {
          const abilityIndex = randomEnemy.abilities.findIndex(a => a.id === randomAbility.id)
          if (abilityIndex >= 0) {
            newEnemyTeam[enemyIndex].abilities[abilityIndex].currentCooldown = randomAbility.cooldown
          }
        }

        // Find target (prioritize low HP or random)
        const targetIndex = newPlayerTeam.findIndex(a => a.hp > 0)
        const target = newPlayerTeam[targetIndex]

        if (randomAbility.type === 'attack' || randomAbility.type === 'attack-stun') {
          // Check for dodge passive
          if (target.passive?.type === 'dodge-chance' && Math.random() < target.passive.value) {
            newLog.push(`💨 ${target.name} DODGES ${randomEnemy.name}'s ${randomAbility.name}!`)
          } else if (target.invincible) {
            newLog.push(`🛡️ ${randomEnemy.name} tries ${randomAbility.name} but ${target.name} is INVINCIBLE!`)
          } else {
            const damage = calculateDamage(randomEnemy, randomAbility.damage)
            target.hp = Math.max(0, target.hp - damage)
            newLog.push(`👊 ${randomEnemy.name} uses ${randomAbility.name} on ${target.name} for ${damage} damage!`)
            if (target.hp <= 0) newLog.push(`💀 ${target.name} has been knocked out!`)
            
            if (randomEnemy.passive?.type === 'burn') {
              target.burning = randomEnemy.passive.value
              newLog.push(`🔥 ${target.name} is burning!`)
            }
          }
        } else if (randomAbility.type === 'attack-all') {
          newLog.push(`🔥 ${randomEnemy.name} uses ${randomAbility.name}!`)
          const damage = calculateDamage(randomEnemy, randomAbility.damage)
          newPlayerTeam.forEach(ally => {
            if (ally.hp > 0) {
              if (ally.passive?.type === 'dodge-chance' && Math.random() < ally.passive.value) {
                newLog.push(`  💨 ${ally.name} DODGES!`)
              } else if (ally.invincible) {
                newLog.push(`  🛡️ ${ally.name} is INVINCIBLE!`)
              } else {
                ally.hp = Math.max(0, ally.hp - damage)
                newLog.push(`  → ${ally.name} takes ${damage} damage!`)
                if (ally.hp <= 0) newLog.push(`  💀 ${ally.name} has been knocked out!`)
              }
            }
          })
        } else if (randomAbility.type === 'heal-self') {
          const healed = Math.min(randomAbility.healAmount, randomEnemy.maxHp - randomEnemy.hp)
          newEnemyTeam[enemyIndex].hp = Math.min(randomEnemy.maxHp, randomEnemy.hp + randomAbility.healAmount)
          newLog.push(`💚 ${randomEnemy.name} uses ${randomAbility.name} and heals for ${healed} HP!`)
        } else if (randomAbility.type === 'defensive') {
          newEnemyTeam[enemyIndex].invincible = 1
          newLog.push(`🛡️ ${randomEnemy.name} uses ${randomAbility.name} and becomes INVINCIBLE!`)
        }
      }
    }

    // Stunned enemy messages
    newEnemyTeam.forEach(enemy => {
      if (enemy.stunned && enemy.hp > 0) {
        newLog.push(`😵 ${enemy.name} is STUNNED and can't act!`)
      }
    })

    // Apply start-of-turn passives for player (for next turn)
    const playerPassiveResult = applyPassives(newPlayerTeam, true)
    newPlayerTeam = playerPassiveResult.team
    newLog.push(...playerPassiveResult.logs)

    // Tick down cooldowns for player (with Gojo's passive)
    newPlayerTeam.forEach(char => {
      const cdReduction = char.passive?.type === 'cooldown-reduction' ? char.passive.value : 0
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
    })

    // Tick down cooldowns for enemies
    newEnemyTeam.forEach(char => {
      const cdReduction = char.passive?.type === 'cooldown-reduction' ? char.passive.value : 0
      char.abilities.forEach(ab => {
        if (ab.currentCooldown > 0) ab.currentCooldown = Math.max(0, ab.currentCooldown - 1 - cdReduction)
      })
      if (char.ultimate?.currentCooldown > 0) {
        char.ultimate.currentCooldown = Math.max(0, char.ultimate.currentCooldown - 1 - cdReduction)
      }
      if (char.stunned) char.stunned--
      if (char.invincible) char.invincible--
    })

    setPlayerTeam(newPlayerTeam)
    setEnemyTeam(newEnemyTeam)

    // Check lose condition
    if (newPlayerTeam.every(a => a.hp <= 0)) {
      newLog.push(`☠️ DEFEAT! Your team has been wiped out!`)
      setBattleLog(prev => [...prev, ...newLog])
      setGameOver('lose')
      return
    }

    setBattleLog(prev => [...prev, ...newLog])
    setSelectedAbility(null)
    setSelectedEnemy(null)
    setIsUltimate(false)
    setTurn(prev => prev + 1)
    setSelectedEnemy(null)
    setIsUltimate(false)
  }

  const resetGame = () => {
    setPlayerTeam(deepCopy(characters.slice(0, 3)))
    setEnemyTeam(deepCopy(characters.slice(3, 6)))
    setSelectedAlly(null)
    setSelectedEnemy(null)
    setSelectedAbility(null)
    setIsUltimate(false)
    setBattleLog(["Battle Start! Select an ally, an ability, then a target!"])
    setGameOver(null)
    setTurn(1)
  }

  const CharacterCard = ({ character, index, isPlayer, isSelected, onSelect }) => {
    const hpPercent = (character.hp / character.maxHp) * 100
    const isDead = character.hp <= 0
    
    return (
      <div 
        className={`character-card ${isSelected ? 'selected' : ''} ${isDead ? 'dead' : ''}`}
        onClick={() => !isDead && onSelect(index)}
      >
        <div className={`rarity-badge ${character.rarity.toLowerCase()}`}>{character.rarity}</div>
        {character.invincible > 0 && <div className="status-badge invincible">🛡️</div>}
        {character.stunned > 0 && <div className="status-badge stunned">😵</div>}
        {character.attackBuff > 0 && <div className="status-badge buffed">💪</div>}
        {character.burning > 0 && <div className="status-badge burning">🔥</div>}
        <h3>{character.name}</h3>
        <div className="passive-display">
          <span className="passive-label">⭐ {character.passive?.name}</span>
        </div>
        <div className="hp-bar-container">
          <div className="hp-bar" style={{ width: `${hpPercent}%` }} />
        </div>
        <p className="hp-text">{character.hp} / {character.maxHp}</p>
      </div>
    )
  }

  const selectedCharacter = selectedAlly !== null ? playerTeam[selectedAlly] : null

  return (
    <div className="battle-container">
      <h1>⚔️ CURSED ARENA ⚔️</h1>
      <p className="turn-counter">Turn {turn}</p>
      {gameOver && (
        <div className={`game-over-banner ${gameOver}`}>
          {gameOver === 'win' ? '👑 VICTORY! 👑' : '☠️ DEFEAT ☠️'}
          <button onClick={resetGame} className="reset-btn">Play Again</button>
        </div>
      )}
      
      <div className="battlefield">
        <div className="team player-team">
          <h2>Your Team</h2>
          <div className="character-list">
            {playerTeam.map((char, index) => (
              <CharacterCard
                key={char.id}
                character={char}
                index={index}
                isPlayer={true}
                isSelected={selectedAlly === index}
                onSelect={setSelectedAlly}
              />
            ))}
          </div>
        </div>

        <div className="battle-controls">
          {selectedCharacter && (
            <div className="ability-panel">
              <h3>{selectedCharacter.name}'s Abilities</h3>
              
              <div className="passive-info">
                <span className="passive-title">⭐ Passive: {selectedCharacter.passive?.name}</span>
                <span className="passive-desc">{selectedCharacter.passive?.description}</span>
              </div>

              <div className="ability-list">
                {selectedCharacter.abilities.map((ability, index) => (
                  <button
                    key={ability.id}
                    className={`ability-btn ${selectedAbility === index && !isUltimate ? 'selected' : ''} ${ability.currentCooldown > 0 ? 'on-cooldown' : ''}`}
                    onClick={() => ability.currentCooldown === 0 && selectAbility(index, false)}
                    disabled={ability.currentCooldown > 0}
                  >
                    <span className="ability-name">{ability.name}</span>
                    <span className="ability-desc">{ability.description}</span>
                    {ability.currentCooldown > 0 && (
                      <span className="cooldown-badge">CD: {ability.currentCooldown}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="ultimate-section">
                <button
                  className={`ability-btn ultimate-btn ${selectedAbility === 0 && isUltimate ? 'selected' : ''} ${selectedCharacter.ultimate.currentCooldown > 0 ? 'on-cooldown' : ''}`}
                  onClick={() => selectedCharacter.ultimate.currentCooldown === 0 && selectAbility(0, true)}
                  disabled={selectedCharacter.ultimate.currentCooldown > 0}
                >
                  <span className="ability-name">🔥 {selectedCharacter.ultimate.name}</span>
                  <span className="ability-desc">{selectedCharacter.ultimate.description}</span>
                  {selectedCharacter.ultimate.currentCooldown > 0 && (
                    <span className="cooldown-badge">CD: {selectedCharacter.ultimate.currentCooldown}</span>
                  )}
                </button>
              </div>
            </div>
          )}
          
          <button className="attack-btn" onClick={executeAbility} disabled={gameOver}>
            ⚔️ USE ABILITY
          </button>
        </div>

        <div className="team enemy-team">
          <h2>Enemy Team</h2>
          <div className="character-list">
            {enemyTeam.map((char, index) => (
              <CharacterCard
                key={char.id}
                character={char}
                index={index}
                isPlayer={false}
                isSelected={selectedEnemy === index}
                onSelect={setSelectedEnemy}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="battle-log">
        <h3>Battle Log</h3>
        <div className="log-entries">
          {battleLog.slice(-8).map((entry, i) => (
            <p key={i}>{entry}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App