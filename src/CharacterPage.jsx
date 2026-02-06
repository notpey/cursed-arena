import React, { useMemo, useState, useEffect } from 'react'
import { getCharacterImage } from './imageConfig'

const xpForLevel = (level) => 100 + level * 25

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

const getScalingStat = (ability) =>
  ability.scalingStat || (ability.damageType === 'cursed' ? 'cursedOutput' : 'attack')

const statLabel = (stat) => {
  switch (stat) {
    case 'maxHp':
      return 'HP'
    case 'maxMana':
      return 'Cursed Energy'
    case 'cursedOutput':
      return 'Cursed Technique'
    case 'cursedResistance':
      return 'Cursed Defense'
    default:
      return stat
  }
}

const buildScaledStats = (character, progress = {}) => {
  const level = progress.level || 1
  const limitBreak = progress.limit_break || 0
  const hpBonus = (level - 1) * 3 + limitBreak * 12
  const manaBonus = (level - 1) * 2 + limitBreak * 4
  const attackBonus = (level - 1) * 1 + limitBreak * 3
  const defenseBonus = (level - 1) * 1 + limitBreak * 2
  const outputBonus = (level - 1) * 1 + limitBreak * 3
  const resistanceBonus = (level - 1) * 1 + limitBreak * 2

  return {
    level,
    limitBreak,
    maxHp: character.maxHp + hpBonus,
    maxMana: character.maxMana + manaBonus,
    attack: character.attack + attackBonus,
    defense: (character.defense || 0) + defenseBonus,
    cursedOutput: (character.cursedOutput || 0) + outputBonus,
    cursedResistance: (character.cursedResistance || 0) + resistanceBonus,
    critChance: character.critChance || 0.05,
  }
}

const getAbilityScalingPreview = (ability, stats) => {
  const baseDamage = ability.damageBase ?? ability.damage ?? 0
  const scaling =
    typeof ability.scaling === 'number'
      ? ability.scaling
      : getDefaultScaling(ability)
  const scalingStat = getScalingStat(ability)

  if (!baseDamage && !scaling) return null
  const statValue = stats[scalingStat] || 0
  const scalingAmount = Math.floor(statValue * scaling)
  const total = Math.floor(baseDamage + scalingAmount)

  return {
    baseDamage,
    scalingPercent: Math.round(scaling * 100),
    scalingStat,
    scalingAmount,
    total,
  }
}

function CharacterPage({ characters = [], characterProgress = {}, onBack, embedded = false }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(characters[0]?.id || null)

  useEffect(() => {
    if (!selectedId && characters.length > 0) {
      setSelectedId(characters[0].id)
    }
  }, [characters, selectedId])

  const normalizedSearch = search.trim().toLowerCase()

  const rows = useMemo(() => {
    return characters
      .filter(character => !normalizedSearch || character.name.toLowerCase().includes(normalizedSearch))
      .map(character => ({
        character,
        progress: characterProgress[character.id] || { level: 1, xp: 0, limit_break: 0 },
        unlocked: Boolean(characterProgress[character.id]),
      }))
  }, [characters, characterProgress, normalizedSearch])

  const selectedRow = rows.find(row => row.character.id === selectedId) || rows[0]
  const character = selectedRow?.character
  const progress = selectedRow?.progress || { level: 1, xp: 0, limit_break: 0 }
  const stats = character ? buildScaledStats(character, progress) : null
  const xpNeeded = xpForLevel(progress.level || 1)

  const statRows = stats && character ? ([
    { label: 'HP', base: character.maxHp, current: stats.maxHp, bonus: stats.maxHp - character.maxHp },
    { label: 'Cursed Energy', base: character.maxMana, current: stats.maxMana, bonus: stats.maxMana - character.maxMana },
    { label: 'Attack', base: character.attack, current: stats.attack, bonus: stats.attack - character.attack },
    { label: 'Cursed Technique', base: character.cursedOutput || 0, current: stats.cursedOutput, bonus: stats.cursedOutput - (character.cursedOutput || 0) },
    { label: 'Defense', base: character.defense || 0, current: stats.defense, bonus: stats.defense - (character.defense || 0) },
    { label: 'Cursed Defense', base: character.cursedResistance || 0, current: stats.cursedResistance, bonus: stats.cursedResistance - (character.cursedResistance || 0) },
  ]) : []

  const abilities = character
    ? [...(character.abilities || []), character.ultimate].filter(Boolean)
    : []

  return (
    <div className={`character-page ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="meta-header">
          {onBack && <button className="profile-back" onClick={onBack}>← Back</button>}
          <h1>Character Codex</h1>
        </div>
      )}

      <div className="character-layout">
        <div className="character-list-panel">
          <div className="character-list-header">
            <h3>Roster</h3>
            <input
              className="character-search"
              type="search"
              placeholder="Search character"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="character-list">
            {rows.map(row => {
              const image = row.character.portraitUrl || getCharacterImage(row.character.name)
              return (
                <button
                  key={row.character.id}
                  className={`character-list-item ${selectedId === row.character.id ? 'active' : ''} ${row.unlocked ? 'unlocked' : 'locked'}`}
                  onClick={() => setSelectedId(row.character.id)}
                >
                  <div className="character-list-portrait">
                    {image ? <img src={image} alt={row.character.name} /> : <span>{row.character.name[0]}</span>}
                  </div>
                  <div className="character-list-info">
                    <strong>{row.character.name}</strong>
                    <span>Lv {row.progress.level} • LB {row.progress.limit_break}/5</span>
                  </div>
                  <span className="character-list-rarity">{row.character.rarity}</span>
                </button>
              )
            })}
          </div>
        </div>

        {character && stats && (
          <div className="character-detail-panel">
            <div className="character-detail-header">
              <div className="character-detail-title">
                <h2>{character.name}</h2>
                <p>{character.rarity} • Level {progress.level} • XP {progress.xp}/{xpNeeded}</p>
                <div className="character-detail-tags">
                  <span className="detail-tag">LB {progress.limit_break}/5</span>
                  <span className="detail-tag">Crit {Math.round((stats.critChance || 0) * 100)}%</span>
                </div>
              </div>
              <div className="character-detail-portrait">
                {character.portraitUrl || getCharacterImage(character.name) ? (
                  <img src={character.portraitUrl || getCharacterImage(character.name)} alt={character.name} />
                ) : (
                  <span>{character.name[0]}</span>
                )}
              </div>
            </div>

            <div className="character-detail-grid">
              <div className="character-stats">
                {statRows.map(row => (
                  <div key={row.label} className="character-stat-row">
                    <span>{row.label}</span>
                    <div className="character-stat-values">
                      <strong>{row.current}</strong>
                      <small>Base {row.base} (+{row.bonus})</small>
                    </div>
                  </div>
                ))}
              </div>

              <div className="character-growth">
                <h3>Growth per level</h3>
                <div className="growth-grid">
                  <span>HP +3</span>
                  <span>CE +2</span>
                  <span>ATK +1</span>
                  <span>CT +1</span>
                  <span>DEF +1</span>
                  <span>CD +1</span>
                </div>
                <h3>Limit Break bonus</h3>
                <div className="growth-grid">
                  <span>HP +12</span>
                  <span>CE +4</span>
                  <span>ATK +3</span>
                  <span>CT +3</span>
                  <span>DEF +2</span>
                  <span>CD +2</span>
                </div>
                <div className="growth-note">Crit/Dodge are global baselines and typically come from effects or blessings.</div>
              </div>
            </div>

            <div className="character-skills">
              <h3>Skills & Scaling</h3>
              <div className="character-skill-grid">
                {abilities.map(ability => {
                  const preview = getAbilityScalingPreview(ability, stats)
                  const scalingStat = preview ? statLabel(preview.scalingStat) : null
                  return (
                    <div key={ability.id} className="character-skill-card">
                      <div className="character-skill-header">
                        <strong>{ability.name}</strong>
                        {ability.cooldown != null && <span>CD {ability.cooldown}</span>}
                      </div>
                      <p>{ability.description}</p>
                      <div className="character-skill-meta">
                        <span>Cost {ability.manaCost || 0} CE</span>
                        {ability.damageType && <span>{ability.damageType === 'cursed' ? 'Cursed' : 'Physical'}</span>}
                      </div>
                      {preview && (
                        <div className="character-skill-scaling">
                          Damage: {preview.baseDamage} + {preview.scalingAmount} ({preview.scalingPercent}% {scalingStat}) = {preview.total}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CharacterPage
