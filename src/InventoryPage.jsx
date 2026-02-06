import React, { useMemo, useState } from 'react'
import { getCharacterImage } from './imageConfig'
import CharacterPage from './CharacterPage'

function InventoryPage({ characters, inventory, characterProgress, items, titles, onBack, onLimitBreak, limitBreakCost }) {
  const [activeTab, setActiveTab] = useState('characters')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [filter, setFilter] = useState('all')
  const itemEntries = Object.entries(items || {})
  const unlockedTitles = (titles || []).filter(title => title.unlocked)
  const normalizedSearch = search.trim().toLowerCase()

  const characterRows = useMemo(() => {
    return characters.map(character => {
      const progress = characterProgress[character.id]
      const shards = inventory[character.id] || 0
      const unlocked = Boolean(progress)
      const effectiveProgress = progress || { level: 1, xp: 0, limit_break: 0 }
      return {
        character,
        shards,
        unlocked,
        progress: effectiveProgress,
      }
    })
  }, [characters, characterProgress, inventory])

  const filteredCharacters = useMemo(() => {
    let next = characterRows
    if (filter === 'unlocked') {
      next = next.filter(row => row.unlocked)
    }
    if (filter === 'locked') {
      next = next.filter(row => !row.unlocked)
    }
    if (normalizedSearch) {
      next = next.filter(row => row.character.name.toLowerCase().includes(normalizedSearch))
    }
    const sorted = [...next]
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'level':
          return (b.progress.level || 1) - (a.progress.level || 1)
        case 'shards':
          return b.shards - a.shards
        case 'limit_break':
          return (b.progress.limit_break || 0) - (a.progress.limit_break || 0)
        default:
          return a.character.name.localeCompare(b.character.name)
      }
    })
    return sorted
  }, [characterRows, filter, normalizedSearch, sortKey])

  const renderCard = (row) => {
    const { character, shards, progress, unlocked } = row
    const nextLimit = progress.limit_break + 1
    const canLimitBreak = unlocked && nextLimit <= 5 && shards >= limitBreakCost(nextLimit)
    const image = character.portraitUrl || getCharacterImage(character.name)

    return (
      <div key={character.id} className={`inventory-card ${unlocked ? 'unlocked' : 'locked'}`}>
        <div className="inventory-portrait">
          {image ? <img src={image} alt={character.name} /> : <span>{character.name[0]}</span>}
        </div>
        <div className="inventory-info">
          <h4>{character.name}</h4>
          <div className="inventory-stats">
            <span>Lv {progress.level}</span>
            <span>LB {progress.limit_break}/5</span>
          </div>
          <div className="inventory-shards">
            Shards: {shards}
          </div>
          <button
            className="mission-claim"
            onClick={() => onLimitBreak?.(character.id)}
            disabled={!canLimitBreak}
          >
            {!unlocked ? 'Locked' : nextLimit > 5 ? 'Maxed' : `Limit Break (+${limitBreakCost(nextLimit)})`}
          </button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'characters', label: 'Roster' },
    { id: 'codex', label: 'Codex' },
    { id: 'items', label: 'Items' },
    { id: 'titles', label: 'Titles' },
  ]

  return (
    <div className="meta-page">
      <div className={`page-shell ${activeTab === 'codex' ? 'full-width' : ''}`}>
        <div className="page-header">
          <div>
            <h1>Inventory</h1>
            <p className="page-subtitle">Manage shards, items, and your codex.</p>
          </div>
          <div className="page-actions">
            <button className="ghost-btn" onClick={onBack}>← Back</button>
          </div>
        </div>
        <div className="inventory-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`inventory-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'characters' && (
          <>
            <div className="inventory-toolbar">
              <input
                className="inventory-search"
                type="search"
                placeholder="Search characters"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="inventory-select"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="unlocked">Unlocked</option>
                <option value="locked">Locked</option>
              </select>
              <select
                className="inventory-select"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value)}
              >
                <option value="name">Sort: Name</option>
                <option value="level">Sort: Level</option>
                <option value="shards">Sort: Shards</option>
                <option value="limit_break">Sort: Limit Break</option>
              </select>
            </div>
            <div className="meta-grid inventory-grid">
              {filteredCharacters.map(renderCard)}
            </div>
          </>
        )}

        {activeTab === 'codex' && (
          <div className="inventory-codex">
            <CharacterPage
              characters={characters}
              characterProgress={characterProgress}
              embedded
            />
          </div>
        )}

        {activeTab === 'items' && (
          <div className="meta-grid inventory-extras">
            <section className="inventory-section">
              <h2>Items</h2>
              {itemEntries.length === 0 ? (
                <p className="inventory-empty">No items yet.</p>
              ) : (
                <div className="inventory-item-grid">
                  {itemEntries.map(([itemId, quantity]) => (
                    <div key={itemId} className="inventory-item-card">
                      <strong>{itemId.replace(/_/g, ' ')}</strong>
                      <span>x{quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'titles' && (
          <div className="meta-grid inventory-extras">
            <section className="inventory-section">
              <h2>Titles</h2>
              {unlockedTitles.length === 0 ? (
                <p className="inventory-empty">No titles unlocked.</p>
              ) : (
                <div className="inventory-item-grid">
                  {unlockedTitles.map(title => (
                    <div key={title.title_id} className={`inventory-item-card ${title.active ? 'active' : ''}`}>
                      <strong>{title.title_id.replace(/_/g, ' ')}</strong>
                      <span>{title.active ? 'Active' : 'Unlocked'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default InventoryPage
