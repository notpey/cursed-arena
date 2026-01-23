import React from 'react'
import { getCharacterImage, getAbilityImage } from './imageConfig'

function BattleScreen({ 
  playerTeam, 
  enemyTeam, 
  selectedEnemy,
  setSelectedEnemy,
  queueAbility,
  queuedActions,
  removeQueuedAction,
  battleLog,
  turn,
  gameOver,
  resetGame,
  actedCharacters,
  pendingAbility,
  setPendingAbility,
  endTurn,
  profile,
  matchSummary,
  combatEvents,
  battleShake,
  isPvp,
  isMyTurn,
  storyBattle,
  onExitStory
}) {
  const [turnBanner, setTurnBanner] = React.useState(null)
  const [playerHpPreview, setPlayerHpPreview] = React.useState([])
  const [enemyHpPreview, setEnemyHpPreview] = React.useState([])
  const [showCombatFeed, setShowCombatFeed] = React.useState(false)
  const [showEndTurnConfirm, setShowEndTurnConfirm] = React.useState(false)
  const [draftQueue, setDraftQueue] = React.useState([])
  const playerHpRef = React.useRef([])
  const enemyHpRef = React.useRef([])
  const latestLog = battleLog?.[battleLog.length - 1] || ''
  const targetAbilityTypes = React.useMemo(
    () => new Set([
      'attack',
      'attack-stun',
      'stun-only',
      'ultimate-mahito',
      'attack-execute',
      'debuff-mark',
      'attack-all-primary-mark',
      'attack-random',
    ]),
    []
  )

  React.useEffect(() => {
    if (gameOver) return
    setTurnBanner('YOUR TURN')
    const timer = setTimeout(() => setTurnBanner(null), 1200)
    return () => clearTimeout(timer)
  }, [turn, gameOver])

  const updateHpPreview = (team, setPreview, ref) => {
    const next = team.map(member => member.hp)
    const prev = ref.current

    setPreview(current => {
      const updated = [...current]
      next.forEach((hp, idx) => {
        if (prev[idx] != null && hp < prev[idx]) {
          updated[idx] = prev[idx]
          setTimeout(() => {
            setPreview(inner => {
              const clone = [...inner]
              clone[idx] = hp
              return clone
            })
          }, 360)
        } else {
          updated[idx] = hp
        }
      })
      return updated
    })

    ref.current = next
  }

  React.useEffect(() => {
    updateHpPreview(playerTeam, setPlayerHpPreview, playerHpRef)
  }, [playerTeam])

  React.useEffect(() => {
    updateHpPreview(enemyTeam, setEnemyHpPreview, enemyHpRef)
  }, [enemyTeam])

  React.useEffect(() => {
    if (!pendingAbility?.needsTarget && setSelectedEnemy) {
      setSelectedEnemy(null)
    }
  }, [pendingAbility, setSelectedEnemy])
  
  const handleAbilityClick = (characterIndex, abilityIndex, isUltimate, ability, character) => {
    if (actedCharacters.includes(characterIndex)) return
    if (character.hp <= 0) return
    if (ability.currentCooldown > 0) return
    
    let energyCost = ability.manaCost || 0
    if (character.passive?.manaReduction) {
      energyCost = Math.floor(energyCost * (1 - character.passive.manaReduction))
    }
    if (character.mana < energyCost) return

    const needsTarget = targetAbilityTypes.has(ability.type)

    if (
      pendingAbility &&
      pendingAbility.characterIndex === characterIndex &&
      pendingAbility.abilityIndex === abilityIndex &&
      pendingAbility.isUltimate === isUltimate
    ) {
      setPendingAbility(null)
      setSelectedEnemy?.(null)
      return
    }

    if (needsTarget) {
      setPendingAbility({
        characterIndex,
        abilityIndex,
        isUltimate,
        ability,
        needsTarget
      })
      setSelectedEnemy?.(null)
      return
    }

    setPendingAbility(null)
    setSelectedEnemy?.(null)
    queueAbility(characterIndex, abilityIndex, isUltimate, null)
  }

  const handleEnemyClick = (enemyIndex) => {
    if (!pendingAbility || !pendingAbility.needsTarget) return
    if (!enemyTeam[enemyIndex] || enemyTeam[enemyIndex].hp <= 0) return
    
    setSelectedEnemy?.(enemyIndex)
    queueAbility(
      pendingAbility.characterIndex, 
      pendingAbility.abilityIndex, 
      pendingAbility.isUltimate, 
      enemyIndex
    )
    setPendingAbility(null)
  }

  const getLogClass = (entry) => {
    const text = entry.toLowerCase()
    if (text.includes('victory')) return 'log-win'
    if (text.includes('defeat') || text.includes('ko')) return 'log-lose'
    if (text.includes('heals') || entry.includes('💚')) return 'log-heal'
    if (text.includes('bound') || text.includes('binding') || entry.includes('⛓️')) return 'log-stun'
    if (text.includes('burn') || entry.includes('🔥')) return 'log-burn'
    if (text.includes('barrier') || entry.includes('🛡️')) return 'log-shield'
    if (text.includes('damage') || entry.includes('⚔️') || entry.includes('👊')) return 'log-hit'
    return ''
  }

  // Portrait Component with Image Support
  const Portrait = ({ character, size = 'normal' }) => {
    const image = getCharacterImage(character.name)
    const sizeClass = size === 'small' ? 'portrait-small' : ''
    
    return (
      <div className={`portrait-image-container ${sizeClass}`}>
        {image ? (
          <img src={image} alt={character.name} className="portrait-img" />
        ) : (
          <div className="portrait-placeholder">
            <span className="portrait-initial">{character.name[0]}</span>
            <span className="portrait-name-small">{character.name.substring(1, 4)}</span>
          </div>
        )}
      </div>
    )
  }

  // Ability Icon Component with Image Support
  const AbilityIcon = ({ ability, isUltimate }) => {
    const image = getAbilityImage(ability.id)
    
    return (
      <div className={`ability-icon-container ${isUltimate ? 'ultimate' : ''}`}>
        {image ? (
          <img src={image} alt={ability.name} className="ability-img" />
        ) : (
          <div className="ability-placeholder">
            <span className="ability-initial">{ability.name.substring(0, 2)}</span>
          </div>
        )}
        {isUltimate && <span className="ultimate-star">★</span>}
      </div>
    )
  }

  const CharacterRow = ({ character, index, isPlayer, onAbilityClick, actedCharacters, pendingAbility, hpPreview }) => {
    const hpPercent = (character.hp / character.maxHp) * 100
    const previewPercent = hpPreview != null ? (hpPreview / character.maxHp) * 100 : hpPercent
    const manaPercent = (character.mana / character.maxMana) * 100
    const isDead = character.hp <= 0
    const hasActed = actedCharacters.includes(index)
    const isSelectingTarget = pendingAbility && pendingAbility.characterIndex === index
    const isBottomRow = isPlayer && index === playerTeam.length - 1
    const level = character.level || 1
    const currentXp = character.xp || 0
    const xpNeeded = 100 + level * 25
    const xpPercent = Math.min(100, Math.floor((currentXp / xpNeeded) * 100))
    const queuedActionIndex = getQueuedActionIndex(index)
    const queuedAction = queuedActionIndex >= 0 ? queuedActions[queuedActionIndex] : null
    const queuedAbility = queuedAction
      ? (queuedAction.isUltimate ? character.ultimate : character.abilities[queuedAction.abilityIndex])
      : null
    const clearQueuedAction = () => {
      if (queuedActionIndex >= 0) {
        removeQueuedAction?.(queuedActionIndex)
      }
    }
    
    const getHpColor = () => {
      if (hpPercent > 50) return '#2ecc71'
      if (hpPercent > 25) return '#f1c40f'
      return '#e74c3c'
    }

    const bindingTurns = character.states?.binding || 0
    const sleepTurns = character.states?.sleep || 0
    const barrierValue = character.barrier?.value || 0
    const burnEffect = (character.effects?.dots || []).find(effect => effect.type === 'burn')
    const poisonEffect = (character.effects?.dots || []).find(effect => effect.type === 'poison')
    const speechMarks = character.stacks?.speechMark || 0
    const attackBuff = (character.effects?.buffs || []).find(effect => effect.stat === 'attack')
    const defenseBuff = (character.effects?.buffs || []).find(effect => effect.stat === 'defense')
    const hasStatusEffects = bindingTurns > 0 || sleepTurns > 0 || barrierValue > 0 || burnEffect || poisonEffect || speechMarks > 0
    const hasPlayerStatus = bindingTurns > 0 || sleepTurns > 0 || attackBuff || defenseBuff

    const rowEvents = (combatEvents || []).filter(event =>
      event.team === (isPlayer ? 'player' : 'enemy') && event.index === index
    )
    const bigHit = rowEvents.some(event => event.type === 'damage' && event.big)

    return (
      <div className={`character-row ${isDead ? 'dead' : ''} ${hasActed ? 'acted' : ''} ${isSelectingTarget ? 'selecting-target' : ''} ${rowEvents.length ? 'hit-flash' : ''} ${bigHit ? 'crit-flash' : ''}`}>
        {/* Character Portrait */}
        <div className={`portrait-container ${isSelectingTarget ? 'active' : ''}`}>
          <div className="portrait-frame">
            <Portrait character={character} />
            
            {/* Status Icons */}
            {hasStatusEffects && (
              <div className="status-icons">
                {barrierValue > 0 && <span className="status-icon invincible" title={`Barrier: ${barrierValue}`}>🛡️</span>}
                {burnEffect && <span className="status-icon burning" title={`Cursed Burn: ${burnEffect.damage} damage`}>🔥</span>}
                {poisonEffect && <span className="status-icon burning" title={`Cursed Poison: ${poisonEffect.damage} damage`}>☠️</span>}
                {speechMarks > 0 && <span className="status-icon marked" title={`Speech Mark: ${speechMarks} stack(s)`}>🎙️</span>}
              </div>
            )}

            {/* Rarity Badge */}
            <div className={`portrait-rarity ${character.rarity.toLowerCase()}`}>
              {character.rarity}
            </div>

            {/* Acted Overlay */}
            {hasActed && !isDead && (
              <div className="acted-overlay">
                <span>✓</span>
              </div>
            )}

            {/* Dead Overlay */}
            {isDead && (
              <div className="dead-overlay">
                <span>☠️</span>
              </div>
            )}
          </div>
          
          {/* Name */}
          <p className="portrait-name">{character.name}</p>

          {character.passive && (
            <div className="passive-indicator">
              <span className="passive-tag">Passive</span>
              <div className="passive-tooltip">
                <strong>{character.passive.name}</strong>
                <span>{character.passive.description}</span>
              </div>
            </div>
          )}
          
          {/* HP Bar */}
          <div className="portrait-hp-bar">
            <div 
              className="portrait-hp-preview" 
              style={{ width: `${previewPercent}%` }} 
            />
            <div 
              className="portrait-hp-fill" 
              style={{ width: `${hpPercent}%`, background: getHpColor() }} 
            />
            <span className="portrait-hp-text">{character.hp}</span>
          </div>
          
          {/* Cursed Energy Bar */}
          <div className="portrait-mana-bar">
            <div 
              className="portrait-mana-fill" 
              style={{ width: `${manaPercent}%` }} 
            />
            <span className="portrait-mana-text">{character.mana}</span>
          </div>
        </div>

        {/* Ability Cards */}
        {isPlayer && hasPlayerStatus && (
          <div className="player-status-row">
            {bindingTurns > 0 && (
              <span className="status-pill stunned">⛓️ Bound {bindingTurns}</span>
            )}
            {sleepTurns > 0 && (
              <span className="status-pill stunned">🌙 Sleep {sleepTurns}</span>
            )}
            {attackBuff && (
              <span className="status-pill buffed">💪 Attack Up</span>
            )}
            {defenseBuff && (
              <span className="status-pill buffed">🛡️ Defense Up</span>
            )}
          </div>
        )}

        {isPlayer && (
          <div className="ability-cards">
            <div
              className={`ability-card queue-slot ${queuedAction ? 'queued' : ''}`}
              onClick={queuedAction ? clearQueuedAction : undefined}
              title={queuedAction ? 'Click to un-queue' : 'Queued technique slot'}
            >
              <div className="ability-card-art">
                {queuedAbility ? (
                  <AbilityIcon ability={queuedAbility} isUltimate={queuedAction?.isUltimate} />
                ) : (
                  <div className="ability-placeholder">
                    <span className="ability-initial">Q</span>
                  </div>
                )}
              </div>
              <div className="ability-info">
                <div className="ability-name">{queuedAbility ? queuedAbility.name : 'Queued'}</div>
                <div className="ability-desc">
                  {queuedAction ? 'Click to clear' : 'Technique slot'}
                </div>
              </div>
              {queuedActionIndex >= 0 && (
                <span className="ability-queue-order">#{queuedActionIndex + 1}</span>
              )}
            </div>
            {character.abilities.map((ability, abilityIndex) => (
              <AbilityCard 
                key={ability.id}
                ability={ability}
                index={abilityIndex}
                isSelected={isSelectingTarget && !pendingAbility.isUltimate && pendingAbility.abilityIndex === abilityIndex}
                isQueued={queuedActions.some(action => action.characterIndex === index && action.abilityIndex === abilityIndex && !action.isUltimate)}
                queuedIndex={getQueuedIndex(index, abilityIndex, false)}
                onSelect={() => onAbilityClick(index, abilityIndex, false, ability, character)}
                disabled={hasActed || isDead || ability.currentCooldown > 0 || (ability.requiresGorillaCore && character.flags?.gorillaCoreTurns <= 0)}
                characterMana={character.mana}
                character={character}
                tooltipUp={isBottomRow}
              />
            ))}
            <AbilityCard 
              ability={character.ultimate}
              index={0}
              isSelected={isSelectingTarget && pendingAbility.isUltimate}
              isQueued={queuedActions.some(action => action.characterIndex === index && action.isUltimate)}
              queuedIndex={getQueuedIndex(index, 0, true)}
              onSelect={() => onAbilityClick(index, 0, true, character.ultimate, character)}
              disabled={hasActed || isDead || character.ultimate.currentCooldown > 0 || (character.ultimate.requiresGorillaCore && character.flags?.gorillaCoreTurns <= 0)}
              isUltimate={true}
              characterMana={character.mana}
              character={character}
              tooltipUp={isBottomRow}
            />
          </div>
        )}
        
        {/* Enemy Status Effects */}
        {!isPlayer && hasStatusEffects && (
          <div className="enemy-status-effects">
            {barrierValue > 0 && (
              <div className="status-badge invincible">
                <span className="status-emoji">🛡️</span>
                <span className="status-count">{Math.round(barrierValue)}</span>
              </div>
            )}
            {bindingTurns > 0 && (
              <div className="status-badge stunned">
                <span className="status-emoji">⛓️</span>
                <span className="status-count">{bindingTurns}</span>
              </div>
            )}
            {burnEffect && (
              <div className="status-badge burning">
                <span className="status-emoji">🔥</span>
                <span className="status-count">{burnEffect.damage}</span>
              </div>
            )}
            {speechMarks > 0 && (
              <div className="status-badge marked">
                <span className="status-emoji">🎙️</span>
                <span className="status-count">{speechMarks}</span>
              </div>
            )}
          </div>
        )}

        {rowEvents.length > 0 && (
          <div className="damage-floats">
            {rowEvents.map(event => (
              <span
                key={event.id}
                className={`damage-float ${event.type} ${event.big ? 'big' : ''}`}
              >
                {event.type === 'heal' ? `+${event.amount}` : `-${event.amount}`}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  const EnemyRow = ({ character, index, isSelected, onSelect, onHover, pendingAbility, hpPreview }) => {
    const hpPercent = (character.hp / character.maxHp) * 100
    const previewPercent = hpPreview != null ? (hpPreview / character.maxHp) * 100 : hpPercent
    const manaPercent = (character.mana / character.maxMana) * 100
    const isDead = character.hp <= 0
    const canBeTargeted = pendingAbility && pendingAbility.needsTarget && !isDead
    
    const getHpColor = () => {
      if (hpPercent > 50) return '#2ecc71'
      if (hpPercent > 25) return '#f1c40f'
      return '#e74c3c'
    }

    const bindingTurns = character.states?.binding || 0
    const sleepTurns = character.states?.sleep || 0
    const barrierValue = character.barrier?.value || 0
    const burnEffect = (character.effects?.dots || []).find(effect => effect.type === 'burn')
    const poisonEffect = (character.effects?.dots || []).find(effect => effect.type === 'poison')
    const speechMarks = character.stacks?.speechMark || 0
    const hasStatusEffects = bindingTurns > 0 || sleepTurns > 0 || barrierValue > 0 || burnEffect || poisonEffect || speechMarks > 0

    const rowEvents = (combatEvents || []).filter(event =>
      event.team === 'enemy' && event.index === index
    )
    const bigHit = rowEvents.some(event => event.type === 'damage' && event.big)

    return (
      <div 
        className={`character-row enemy ${isDead ? 'dead' : ''} ${isSelected ? 'selected' : ''} ${canBeTargeted ? 'targetable' : ''} ${rowEvents.length ? 'hit-flash' : ''} ${bigHit ? 'crit-flash' : ''}`}
        onClick={() => canBeTargeted && onSelect(index)}
        onMouseEnter={() => canBeTargeted && onHover?.(index)}
        onMouseLeave={() => canBeTargeted && onHover?.(null)}
      >
        {/* Character Portrait */}
        <div className={`portrait-container ${canBeTargeted ? 'targetable' : ''}`}>
          <div className="portrait-frame">
            <Portrait character={character} />

            {/* Rarity Badge */}
            <div className={`portrait-rarity ${character.rarity.toLowerCase()}`}>
              {character.rarity}
            </div>

            {/* Dead Overlay */}
            {isDead && (
              <div className="dead-overlay">
                <span>☠️</span>
              </div>
            )}

            {/* Target Indicator */}
            {canBeTargeted && (
              <div className="target-indicator">
                <span>⚔️</span>
              </div>
            )}
          </div>
          
          {/* Name */}
          <p className="portrait-name">{character.name}</p>
          
          {/* HP Bar */}
          <div className="portrait-hp-bar">
            <div 
              className="portrait-hp-preview" 
              style={{ width: `${previewPercent}%` }} 
            />
            <div 
              className="portrait-hp-fill" 
              style={{ width: `${hpPercent}%`, background: getHpColor() }} 
            />
            <span className="portrait-hp-text">{character.hp}</span>
          </div>
          
          {/* Cursed Energy Bar */}
          <div className="portrait-mana-bar">
            <div 
              className="portrait-mana-fill" 
              style={{ width: `${manaPercent}%` }} 
            />
            <span className="portrait-mana-text">{character.mana}</span>
          </div>
        </div>

        {/* Enemy Status Effects */}
        {hasStatusEffects && (
          <div className="enemy-status-effects">
            {barrierValue > 0 && (
              <div className="status-badge invincible">
                <span className="status-emoji">🛡️</span>
                <span className="status-count">{Math.round(barrierValue)}</span>
              </div>
            )}
            {bindingTurns > 0 && (
              <div className="status-badge stunned">
                <span className="status-emoji">⛓️</span>
                <span className="status-count">{bindingTurns}</span>
              </div>
            )}
            {burnEffect && (
              <div className="status-badge burning">
                <span className="status-emoji">🔥</span>
                <span className="status-count">{burnEffect.damage}</span>
              </div>
            )}
            {poisonEffect && (
              <div className="status-badge burning">
                <span className="status-emoji">☠️</span>
                <span className="status-count">{poisonEffect.damage}</span>
              </div>
            )}
            {speechMarks > 0 && (
              <div className="status-badge marked">
                <span className="status-emoji">🎙️</span>
                <span className="status-count">{speechMarks}</span>
              </div>
            )}
          </div>
        )}

        {rowEvents.length > 0 && (
          <div className="damage-floats">
            {rowEvents.map(event => (
              <span
                key={event.id}
                className={`damage-float ${event.type} ${event.big ? 'big' : ''}`}
              >
                {event.type === 'heal' ? `+${event.amount}` : `-${event.amount}`}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  const AbilityCard = ({ ability, index, isSelected, isQueued, queuedIndex, onSelect, disabled, isUltimate, characterMana, character, tooltipUp }) => {
    let energyCost = ability.manaCost || 0
    if (character.passive?.manaReduction) {
      energyCost = Math.floor(energyCost * (1 - character.passive.manaReduction))
    }
    const notEnoughMana = characterMana < energyCost
    const isDisabled = disabled || notEnoughMana
    const needsTarget = targetAbilityTypes.has(ability.type)
    
    return (
      <div 
        className={`ability-card ${isSelected ? 'selected' : ''} ${isQueued ? 'queued' : ''} ${isDisabled ? 'disabled' : ''} ${isUltimate ? 'ultimate' : ''} ${notEnoughMana ? 'no-mana' : ''} ${needsTarget ? 'needs-target' : ''} ${tooltipUp ? 'tooltip-up' : ''}`}
        onClick={() => !isDisabled && onSelect()}
      >
        {queuedIndex && (
          <span className="ability-queue-order">#{queuedIndex}</span>
        )}
        {needsTarget && (
          <span className="ability-target-tag" title="Requires a target">🎯</span>
        )}
        <div className="ability-card-art">
          <AbilityIcon ability={ability} isUltimate={isUltimate} />
        </div>

        <div className="ability-name" title={ability.name}>{ability.name}</div>
        
        {/* Cooldown Overlay */}
        {ability.currentCooldown > 0 && (
          <div className="ability-cooldown-overlay">
            <span>{ability.currentCooldown}</span>
            <span className="ability-cooldown-label">CD</span>
          </div>
        )}
        
        {/* Mana Cost */}
        <div className={`ability-mana-cost ${notEnoughMana ? 'not-enough' : ''}`}>
          <span>🌀{energyCost}</span>
        </div>
        
        {/* Tooltip */}
        <div className="ability-tooltip">
          <div className="tooltip-header">
            <h4>{ability.name}</h4>
            {isUltimate && <span className="tooltip-ultimate">DOMAIN EXPANSION</span>}
          </div>
          <p>{ability.description}</p>
          <div className="tooltip-stats">
            <span className={notEnoughMana ? 'not-enough' : ''}>🌀 {energyCost}</span>
            <span>⏱️ {ability.cooldown} CD</span>
            {needsTarget && <span>🎯 Target</span>}
          </div>
        </div>
      </div>
    )
  }

  const alivePlayerCount = playerTeam.filter(c => c.hp > 0).length
  const actedCount = actedCharacters.length
  const playerName = profile?.display_name || 'Player'
  const playerAvatar = profile?.avatar_url || null
  const playerLevel = profile?.account_level || 1
  const enemyName = isPvp ? 'Opponent' : 'Cursed AI'
  const enemySubtitle = isPvp ? (isMyTurn ? 'Awaiting Turn' : 'Taking Turn') : 'Awaiting Turn'
  const queuedLabel = (action) => {
    const character = playerTeam[action.characterIndex]
    if (!character) return 'Unknown'
    const ability = action.isUltimate ? character.ultimate : character.abilities[action.abilityIndex]
    const target = action.enemyIndex != null ? enemyTeam[action.enemyIndex]?.name : null
    return `${character.name}: ${ability?.name || 'Technique'}${target ? ` → ${target}` : ''}`
  }
  const getQueuedIndex = (characterIndex, abilityIndex, isUltimate) => {
    const index = queuedActions.findIndex(action => (
      action.characterIndex === characterIndex &&
      action.isUltimate === isUltimate &&
      (isUltimate || action.abilityIndex === abilityIndex)
    ))
    return index === -1 ? null : index + 1
  }
  const getQueuedActionIndex = (characterIndex) => (
    queuedActions.findIndex(action => action.characterIndex === characterIndex)
  )

  const openEndTurnConfirm = () => {
    if (isPvp && !isMyTurn) return
    setDraftQueue(queuedActions)
    setShowEndTurnConfirm(true)
  }

  const confirmEndTurn = () => {
    setShowEndTurnConfirm(false)
    endTurn(draftQueue)
  }

  const handleQueueDragStart = (index) => (event) => {
    event.dataTransfer.setData('text/plain', String(index))
  }

  const handleQueueDragOver = (event) => {
    event.preventDefault()
  }

  const handleQueueDrop = (index) => (event) => {
    event.preventDefault()
    const fromIndex = Number(event.dataTransfer.getData('text/plain'))
    if (Number.isNaN(fromIndex)) return
    setDraftQueue(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
  }

  return (
    <div className={`battle-screen ${battleShake ? 'screen-shake' : ''} ${pendingAbility?.needsTarget ? 'targeting-active' : ''}`}>
      <div className="battle-background"></div>

      {turnBanner && (
        <div className="turn-banner">
          <span>{turnBanner}</span>
        </div>
      )}
      
      {/* Battle HUD */}
      <div className="battle-hud">
        <div className="hud-side">
          <div className="team-indicator player">
            <span>Your Team</span>
            <div className="team-indicator-meta">
              <div className="team-avatar">
                {playerAvatar ? <img src={playerAvatar} alt={playerName} /> : <span>{playerName.slice(0, 1)}</span>}
              </div>
              <div>
                <div className="team-name">{playerName}</div>
                <div className="team-subtitle">Lv {playerLevel}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="hud-center">
          <div className="turn-display">
            <span className="turn-label">TURN</span>
            <span className="turn-number">{turn}</span>
          </div>
          <button
            className="end-turn-btn"
            onClick={openEndTurnConfirm}
            disabled={isPvp && !isMyTurn}
          >
            {isPvp && !isMyTurn ? 'Waiting...' : 'End Turn'}
          </button>
          <div className="combat-feed-ticker">
            <span className="ticker-label">FEED</span>
            <span className="ticker-text">{latestLog || 'Awaiting first strike...'}</span>
            <button className="combat-feed-btn" onClick={() => setShowCombatFeed(true)}>
              Combat Feed
            </button>
          </div>
        </div>

        <div className="hud-side right">
          <div className="team-indicator enemy">
            <span>Enemy Team</span>
            <div className="team-indicator-meta">
              <div>
                <div className="team-name">{enemyName}</div>
                <div className="team-subtitle">{enemySubtitle}</div>
              </div>
              <div className="team-avatar">
                <span>{isPvp ? 'VS' : 'AI'}</span>
              </div>
            </div>
          </div>
        </div>

        {pendingAbility && pendingAbility.needsTarget && (
          <div className="targeting-prompt">
            <span>🎯 Select a target for {pendingAbility.ability.name}!</span>
            <button className="cancel-btn" onClick={() => setPendingAbility(null)}>Cancel</button>
          </div>
        )}
      </div>

      {/* Game Over */}
      {gameOver && (
        <div className={`game-over-overlay ${gameOver}`}>
          <div className="game-over-content">
            <h1>{gameOver === 'win' ? '👑 VICTORY! 👑' : '☠️ DEFEAT ☠️'}</h1>
            {!storyBattle && matchSummary && (
              <div className="match-summary">
                <div className="summary-row">
                  <span>Account XP</span>
                  <strong>+{matchSummary.accountGain} (Lv {matchSummary.accountLevel})</strong>
                </div>
                <div className="summary-row">
                  <span>Character XP</span>
                  <strong>+{matchSummary.characterGain} each</strong>
                </div>
                <div className="summary-row">
                  <span>Rating</span>
                  <strong>{matchSummary.ratingDelta >= 0 ? '+' : ''}{matchSummary.ratingDelta} → {matchSummary.rating}</strong>
                </div>
                <div className="summary-xp-bar">
                  <div
                    className="summary-xp-fill"
                    style={{ width: `${Math.min(100, Math.floor((matchSummary.accountXp / matchSummary.accountNeeded) * 100))}%` }}
                  />
                </div>
                {matchSummary.characterLevelUps.length > 0 && (
                  <div className="summary-levelups">
                    {matchSummary.characterLevelUps.map(levelUp => (
                      <span key={levelUp.name}>{levelUp.name} → Lv {levelUp.level}</span>
                    ))}
                  </div>
                )}
                {matchSummary.characterSummaries?.length > 0 && (
                  <div className="summary-characters">
                    {matchSummary.characterSummaries.map(character => {
                      const image = getCharacterImage(character.name)
                      const percent = Math.min(100, Math.floor((character.xp / character.xpNeeded) * 100))
                      return (
                        <div key={character.id} className="summary-character">
                          <div className="summary-portrait">
                            {image ? (
                              <img src={image} alt={character.name} />
                            ) : (
                              <span>{character.name[0]}</span>
                            )}
                          </div>
                          <div className="summary-char-info">
                            <div className="summary-char-name">{character.name}</div>
                            <div className="summary-char-level">Lv {character.level} • {character.xp}/{character.xpNeeded} XP</div>
                            <div className="summary-char-bar">
                              <div className="summary-char-fill" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {storyBattle ? (
              <div className="battle-result-actions">
                <button onClick={onExitStory} className="play-again-btn" disabled={!onExitStory}>Return to Story</button>
              </div>
            ) : (
              <button onClick={resetGame} className="play-again-btn">Play Again</button>
            )}
          </div>
        </div>
      )}

      {/* Main Battle Area */}
      <div className={`battle-main ${storyBattle ? 'battle-main-story' : ''} ${(playerTeam.length <= 1 && enemyTeam.length <= 2) ? 'battle-main-compact' : ''}`}>
        <div className="battle-team-row">
          <div className="team-container player-side">
            {playerTeam.map((char, index) => (
              <CharacterRow
                key={char.id}
                character={char}
                index={index}
                isPlayer={true}
                onAbilityClick={handleAbilityClick}
                actedCharacters={actedCharacters}
                pendingAbility={pendingAbility}
                hpPreview={playerHpPreview[index]}
              />
            ))}
          </div>

          <div className="team-container enemy-side">
            {enemyTeam.map((char, index) => (
              <EnemyRow
                key={char.id}
                character={char}
                index={index}
                isSelected={selectedEnemy === index}
                onSelect={handleEnemyClick}
                onHover={setSelectedEnemy}
                pendingAbility={pendingAbility}
                hpPreview={enemyHpPreview[index]}
              />
            ))}
          </div>
        </div>
      </div>

      {showCombatFeed && (
        <div className="combat-feed-overlay" onClick={() => setShowCombatFeed(false)}>
          <div className="combat-feed-panel" onClick={(event) => event.stopPropagation()}>
            <div className="combat-feed-header">
              <div>
                <h3>Combat Feed</h3>
                <p>Latest combat events</p>
              </div>
              <button className="combat-feed-close" onClick={() => setShowCombatFeed(false)}>
                ✕
              </button>
            </div>
            <div className="combat-feed-body">
              {battleLog.length === 0 ? (
                <div className="combat-feed-empty">No events yet.</div>
              ) : (
                battleLog.slice().reverse().map((entry, i) => (
                  <p key={`${entry}-${i}`} className={`${getLogClass(entry)} ${i === 0 ? 'latest' : ''}`}>
                    {entry}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showEndTurnConfirm && (
        <div className="end-turn-overlay" onClick={() => setShowEndTurnConfirm(false)}>
          <div className="end-turn-panel" onClick={(event) => event.stopPropagation()}>
            <div className="end-turn-header">
              <div>
                <h3>Confirm End Turn</h3>
                <p>Drag to reorder your queued techniques.</p>
              </div>
              <button className="end-turn-close" onClick={() => setShowEndTurnConfirm(false)}>✕</button>
            </div>
            <div className="end-turn-body">
              {draftQueue.length === 0 ? (
                <div className="end-turn-empty">No actions queued. End turn anyway?</div>
              ) : (
                <div className="end-turn-list">
                  {draftQueue.map((action, index) => (
                    <div
                      key={`${action.characterIndex}-${action.abilityIndex}-${action.isUltimate}-${index}`}
                      className="end-turn-item"
                      draggable
                      onDragStart={handleQueueDragStart(index)}
                      onDragOver={handleQueueDragOver}
                      onDrop={handleQueueDrop(index)}
                    >
                      <span className="drag-handle">⋮⋮</span>
                      <span className="queue-order">{index + 1}</span>
                      <span className="queue-text">{queuedLabel(action)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="end-turn-actions">
              <button className="secondary-btn" onClick={() => setShowEndTurnConfirm(false)}>Cancel</button>
              <button className="primary-btn" onClick={confirmEndTurn}>
                {draftQueue.length === 0 ? 'End Turn' : 'Confirm & End Turn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BattleScreen
