import React from 'react'
import { getCharacterImage } from './imageConfig'

function TeamSelect({
  characters,
  selectedTeam,
  onSelect,
  onStartBattle,
  onStartPvpQuick,
  onStartPvpRanked,
  pvpStatus,
  characterProgress,
  teamPresets,
  onSavePreset,
  onApplyPreset,
}) {
  const isSelected = (charId) => selectedTeam.some(c => c.id === charId)
  const progressById = characterProgress || {}
  const canStart = selectedTeam.length === 3
  const selectedPreview = [0, 1, 2].map(index => selectedTeam[index]).filter(Boolean)
  const [search, setSearch] = React.useState('')
  const [focusedId, setFocusedId] = React.useState(characters[0]?.id || null)
  const [showPresets, setShowPresets] = React.useState(false)
  const [dragOverSlot, setDragOverSlot] = React.useState(null)

  const focusedCharacter = characters.find(character => character.id === focusedId) || characters[0]
  const focusedProgress = focusedCharacter ? (progressById[focusedCharacter.id] || { level: 1, xp: 0 }) : { level: 1, xp: 0 }
  const focusedXpNeeded = 100 + focusedProgress.level * 25
  const focusedXpPercent = Math.min(100, Math.floor((focusedProgress.xp / focusedXpNeeded) * 100))
  const filteredCharacters = characters.filter(character =>
    character.name.toLowerCase().includes(search.toLowerCase())
  )
  const teamFull = selectedTeam.length >= 3
  const focusedSelected = focusedCharacter ? isSelected(focusedCharacter.id) : false

  

  const handleSelect = (character) => {
    if (isSelected(character.id)) {
      onSelect(selectedTeam.filter(c => c.id !== character.id))
    } else if (selectedTeam.length < 3) {
      onSelect([...selectedTeam, character])
    }
  }

  const handleDrop = (slot, characterId) => {
    const character = characters.find(c => c.id === characterId)
    if (!character) return

    const nextTeam = [...selectedTeam]
    const existingIndex = nextTeam.findIndex(c => c.id === character.id)
    if (existingIndex >= 0) {
      nextTeam.splice(existingIndex, 1)
    }

    if (nextTeam.length < 3) {
      if (slot <= nextTeam.length) {
        nextTeam.splice(slot, 0, character)
      } else {
        nextTeam.push(character)
      }
    } else if (slot < 3) {
      nextTeam[slot] = character
    }

    onSelect(nextTeam.slice(0, 3))
  }

  const getRarityColor = (rarity) => {
    switch(rarity) {
      case 'UR': return 'linear-gradient(90deg, #ff6b6b, #feca57)'
      case 'SSR': return '#9b59b6'
      case 'SR': return '#3498db'
      default: return '#95a5a6'
    }
  }

  const Portrait = ({ character, size = 'normal' }) => {
    const image = getCharacterImage(character.name)
    
    return (
      <div className={`select-portrait ${size}`}>
        {image ? (
          <img src={image} alt={character.name} className="select-portrait-img" />
        ) : (
          <div className="select-portrait-placeholder">
            <span className="select-portrait-initial">{character.name[0]}</span>
          </div>
        )}
      </div>
    )
  }

  const skillCards = focusedCharacter
    ? [...focusedCharacter.abilities.slice(0, 3), focusedCharacter.ultimate].filter(Boolean)
    : []

  return (
    <div className="team-select-container">
      <div className="team-select-grid">
        <div className="team-left-column">
          <section className="character-details-panel">
            {focusedCharacter ? (
              <>
                <div className="details-header-row">
                  <div className="details-header-left">
                    <div className="details-portrait">
                      <Portrait character={focusedCharacter} />
                    </div>
                    <div className="details-meta">
                      <h2>{focusedCharacter.name}</h2>
                      <div className="details-grade" style={{ color: getRarityColor(focusedCharacter.rarity) }}>
                        {focusedCharacter.rarity} Grade
                      </div>
                      <div className="details-level">
                        Lv {focusedProgress.level}
                      </div>
                    </div>
                  </div>
                  <div className="details-header-right">
                    <button
                      className="details-primary-btn"
                      onClick={() => handleSelect(focusedCharacter)}
                      disabled={teamFull && !focusedSelected}
                    >
                      {focusedSelected ? '✓ Selected' : teamFull ? 'Squad Full' : 'Add to Squad'}
                    </button>
                  </div>
                </div>
                <div className="details-passive-line">
                  <span>Passive:</span> {focusedCharacter.passive.name} — {focusedCharacter.passive.description}
                </div>
                <div className="details-skills">
                  <div className="skills-grid">
                    {skillCards.map(skill => (
                      <div key={skill.id} className="skill-card">
                        <span className="skill-icon">⚡</span>
                        <span className="skill-name">{skill.name}</span>
                        <span className="skill-cost">💧 {skill.manaCost ?? 0} · ⏱️ {skill.cooldown}</span>
                        <div className="skill-tooltip">
                          <div className="skill-tooltip-title">{skill.name}</div>
                          <div className="skill-tooltip-desc">{skill.description}</div>
                          <div className="skill-tooltip-meta">
                            <span>Cost: {skill.manaCost ?? 0}</span>
                            <span>Cooldown: {skill.cooldown}</span>
                            <span>Type: {skill.type || 'Ability'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="details-empty">
                <div className="empty-state-icon">👁️</div>
                <div className="empty-state-text">Select a character to view details</div>
              </div>
            )}
          </section>

          <section className="character-roster-panel">
            <div className="section-header">
              <h2>Character Roster</h2>
              <span className="selection-count">{selectedTeam.length}/3 Selected</span>
            </div>

            <div className="roster-search-bar">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search sorcerers..."
                className="search-input"
              />
            </div>

            <div className="roster-grid-container">
              {filteredCharacters.map(character => {
                const progress = progressById[character.id] || { level: 1, xp: 0, limit_break: 0 }
                return (
                  <div
                    key={character.id}
                    className={`roster-character-card ${isSelected(character.id) ? 'is-selected' : ''} ${focusedId === character.id ? 'is-focused' : ''}`}
                    onClick={() => setFocusedId(character.id)}
                    onDoubleClick={() => handleSelect(character)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', String(character.id))
                    }}
                  >
                    {isSelected(character.id) && (
                      <div className="card-selected-badge">✓</div>
                    )}

                    <div className="card-portrait">
                      <Portrait character={character} size="small" />
                    </div>

                    <div className="card-info">
                      <div className="card-name">{character.name}</div>
                      <div className="card-rarity" style={{ color: getRarityColor(character.rarity) }}>
                        {character.rarity}
                      </div>
                      <div className="card-level">Lv {progress.level}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <div className="team-right-column">
          <section className="squad-panel">
            <div className="team-panel-header">
              <h2>Your Squad</h2>
              {selectedTeam.length > 0 && (
                <button className="clear-btn" onClick={() => onSelect([])}>
                  Clear All
                </button>
              )}
            </div>
            <div className="team-slots team-panel-slots">
              {[0, 1, 2].map(slot => (
                <div
                  key={slot}
                  className={`team-slot ${selectedTeam[slot] ? 'filled' : 'empty'} ${dragOverSlot === slot ? 'drag-over' : ''}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={() => setDragOverSlot(slot)}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(event) => {
                    event.preventDefault()
                    const droppedId = Number(event.dataTransfer.getData('text/plain'))
                    handleDrop(slot, droppedId)
                    setDragOverSlot(null)
                  }}
                >
                  {selectedTeam[slot] ? (
                    <>
                      <button
                        className="slot-remove"
                        onClick={() => onSelect(selectedTeam.filter((_, index) => index !== slot))}
                        title="Remove"
                      >
                        ✕
                      </button>

                      <div className="slot-portrait">
                        <Portrait character={selectedTeam[slot]} />
                      </div>

                      <div className="slot-info">
                        <div className="slot-name">{selectedTeam[slot].name}</div>
                        <div className="slot-rarity" style={{ color: getRarityColor(selectedTeam[slot].rarity) }}>
                          {selectedTeam[slot].rarity}
                        </div>
                        <div className="slot-level">
                          Lv {(progressById[selectedTeam[slot].id] || { level: 1 }).level}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="slot-empty-state">
                      <div className="empty-icon">+</div>
                      <div className="empty-text">Slot {slot + 1}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className={`team-ready-indicator ${canStart ? 'ready' : ''}`}>
              {canStart ? (
                <>
                  <span className="ready-icon">✓</span>
                  <span>Team Ready!</span>
                </>
              ) : (
                <span>Select {3 - selectedTeam.length} more</span>
              )}
            </div>
          </section>

          <section className="match-controls">
            <button
              className="match-primary-btn"
              disabled={!canStart || pvpStatus === 'searching'}
              onClick={onStartPvpQuick || onStartBattle}
            >
              {pvpStatus === 'searching' ? 'Searching...' : 'Quick PvP'}
            </button>
            <div className="match-secondary-buttons">
              <button
                className="match-secondary-btn"
                disabled={!canStart || pvpStatus === 'searching'}
                onClick={onStartPvpRanked}
              >
                Ranked PvP
              </button>
              <button
                className="match-secondary-btn"
                disabled={!canStart}
                onClick={onStartBattle}
              >
                Vs AI
              </button>
              <button className="match-secondary-btn" onClick={() => setShowPresets(prev => !prev)}>
                {showPresets ? 'Hide Teams' : 'Saved Teams'}
              </button>
              <button className="match-secondary-btn" disabled title="Coming soon">
                Random
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Presets Modal */}
      {showPresets && (
        <div className="presets-modal-overlay" onClick={() => setShowPresets(false)}>
          <div className="presets-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Saved Teams</h3>
              <button className="modal-close" onClick={() => setShowPresets(false)}>✕</button>
            </div>
            <div className="preset-cards">
              {[1, 2, 3].map(slot => {
                const preset = teamPresets?.[slot]
                const presetName = preset?.name || `Preset ${slot}`
                return (
                  <div key={slot} className="preset-card-modal">
                    <div className="preset-card-header">
                      <span className="preset-number">#{slot}</span>
                      <span className="preset-name">{presetName}</span>
                    </div>
                    <div className="preset-card-actions">
                      <button
                        className="preset-action-btn save"
                        onClick={() => {
                          onSavePreset?.(slot, presetName, selectedPreview.map(c => c.id))
                          setShowPresets(false)
                        }}
                        disabled={!canStart}
                      >
                        💾 Save Current
                      </button>
                      <button
                        className="preset-action-btn load"
                        onClick={() => {
                          preset?.character_ids && onApplyPreset?.(preset.character_ids)
                          setShowPresets(false)
                        }}
                        disabled={!preset?.character_ids?.length}
                      >
                        📥 Load
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamSelect
