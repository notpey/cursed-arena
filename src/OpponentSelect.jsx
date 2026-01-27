import React, { useState } from 'react'
import { getCharacterImage } from './imageConfig'

function OpponentSelect({ characters, onConfirm, onBack }) {
  const [difficulty, setDifficulty] = useState('normal')
  const [selectedOpponentIds, setSelectedOpponentIds] = useState([])
  const [mode, setMode] = useState('manual') // 'manual' or 'preset'

  const difficultySettings = {
    easy: {
      label: 'Easy',
      description: 'Opponents start at 70% stats',
      icon: '🟢',
      statMultiplier: 0.7,
      xpMultiplier: 0.8,
      currencyMultiplier: 0.8
    },
    normal: {
      label: 'Normal',
      description: 'Opponents start at 100% stats',
      icon: '🟡',
      statMultiplier: 1.0,
      xpMultiplier: 1.0,
      currencyMultiplier: 1.0
    },
    hard: {
      label: 'Hard',
      description: 'Opponents start at 130% stats',
      icon: '🔴',
      statMultiplier: 1.3,
      xpMultiplier: 1.3,
      currencyMultiplier: 1.5
    },
    extreme: {
      label: 'Extreme',
      description: 'Opponents start at 170% stats',
      icon: '⚫',
      statMultiplier: 1.7,
      xpMultiplier: 1.5,
      currencyMultiplier: 2.0
    }
  }

  const presetTeams = [
    {
      id: 'first_years',
      name: 'First Years',
      description: 'Yuji, Megumi, and Nobara',
      characterIds: [1, 2, 3],
      difficulty: 'easy'
    },
    {
      id: 'heavy_hitters',
      name: 'Heavy Hitters',
      description: 'Gojo, Nanami, and Todo',
      characterIds: [4, 5, 6],
      difficulty: 'hard'
    },
    {
      id: 'cursed_spirits',
      name: 'Cursed Spirits',
      description: 'Mahito, Jogo, and Hanami',
      characterIds: [7, 8, 9],
      difficulty: 'hard'
    },
    {
      id: 'random',
      name: 'Random Team',
      description: 'Random opponents at selected difficulty',
      characterIds: null,
      difficulty: null
    }
  ]

  const toggleOpponent = (charId) => {
    if (selectedOpponentIds.includes(charId)) {
      setSelectedOpponentIds(selectedOpponentIds.filter(id => id !== charId))
    } else if (selectedOpponentIds.length < 3) {
      setSelectedOpponentIds([...selectedOpponentIds, charId])
    }
  }

  const handleConfirm = () => {
    let finalOpponents = selectedOpponentIds

    if (mode === 'preset') {
      // Random team selected
      if (finalOpponents.length === 0) {
        const shuffled = [...characters].sort(() => Math.random() - 0.5)
        finalOpponents = shuffled.slice(0, 3).map(c => c.id)
      }
    }

    if (finalOpponents.length !== 3) return

    const selectedChars = characters.filter(c => finalOpponents.includes(c.id))
    onConfirm({
      opponents: selectedChars,
      difficulty: difficultySettings[difficulty]
    })
  }

  const selectPreset = (preset) => {
    setMode('preset')
    if (preset.characterIds) {
      setSelectedOpponentIds(preset.characterIds)
      if (preset.difficulty) {
        setDifficulty(preset.difficulty)
      }
    } else {
      // Random team
      const shuffled = [...characters].sort(() => Math.random() - 0.5)
      setSelectedOpponentIds(shuffled.slice(0, 3).map(c => c.id))
    }
  }

  const Portrait = ({ character }) => {
    const image = character.portraitUrl || getCharacterImage(character.name)

    return (
      <div className="opponent-portrait">
        {image ? (
          <img src={image} alt={character.name} className="opponent-portrait-img" />
        ) : (
          <div className="opponent-portrait-placeholder">
            <span className="opponent-portrait-initial">{character.name[0]}</span>
          </div>
        )}
      </div>
    )
  }

  const canStart = selectedOpponentIds.length === 3

  return (
    <div className="opponent-select-container">
      <div className="opponent-select-header">
        <button className="profile-back" onClick={onBack}>← Back</button>
        <h1>Select Opponents</h1>
      </div>

      <div className="opponent-select-content">
        {/* Difficulty Selector */}
        <section className="difficulty-section">
          <h2>Difficulty</h2>
          <div className="difficulty-grid">
            {Object.entries(difficultySettings).map(([key, setting]) => (
              <button
                key={key}
                className={`difficulty-card ${difficulty === key ? 'selected' : ''}`}
                onClick={() => setDifficulty(key)}
              >
                <div className="difficulty-icon">{setting.icon}</div>
                <div className="difficulty-label">{setting.label}</div>
                <div className="difficulty-description">{setting.description}</div>
                <div className="difficulty-rewards">
                  <span>XP: {Math.round(setting.xpMultiplier * 100)}%</span>
                  <span>💰: {Math.round(setting.currencyMultiplier * 100)}%</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Quick Select Presets */}
        <section className="presets-section">
          <h2>Quick Select</h2>
          <div className="presets-grid">
            {presetTeams.map(preset => (
              <button
                key={preset.id}
                className="preset-team-card"
                onClick={() => selectPreset(preset)}
              >
                <div className="preset-team-name">{preset.name}</div>
                <div className="preset-team-description">{preset.description}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Manual Character Selection */}
        <section className="manual-selection-section">
          <div className="section-header">
            <h2>Manual Selection</h2>
            <span className="selection-count">{selectedOpponentIds.length}/3 Selected</span>
          </div>
          <div className="opponent-grid">
            {characters.map(character => {
              const isSelected = selectedOpponentIds.includes(character.id)
              return (
                <div
                  key={character.id}
                  className={`opponent-card rarity-${character.rarity.toLowerCase()} ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    setMode('manual')
                    toggleOpponent(character.id)
                  }}
                >
                  {isSelected && (
                    <div className="card-selected-badge">✓</div>
                  )}
                  <Portrait character={character} />
                  <div className="opponent-card-name">{character.name}</div>
                  <div className="opponent-card-rarity">{character.rarity}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Start Battle Button */}
        <div className="opponent-confirm-section">
          <button
            className="opponent-confirm-btn"
            disabled={!canStart}
            onClick={handleConfirm}
          >
            {canStart ? `Start Battle (${difficultySettings[difficulty].label})` : 'Select 3 Opponents'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OpponentSelect
