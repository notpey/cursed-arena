import React from 'react'
import { getCharacterImage } from './imageConfig'

function InventoryPage({ characters, inventory, characterProgress, items, titles, onBack, onLimitBreak, limitBreakCost }) {
  const itemEntries = Object.entries(items || {})
  const unlockedTitles = (titles || []).filter(title => title.unlocked)
  const renderCard = (character) => {
    const shards = inventory[character.id] || 0
    const progress = characterProgress[character.id] || { level: 1, xp: 0, limit_break: 0 }
    const nextLimit = progress.limit_break + 1
    const canLimitBreak = nextLimit <= 5 && shards >= limitBreakCost(nextLimit)
    const image = getCharacterImage(character.name)

    return (
      <div key={character.id} className="inventory-card">
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
            {nextLimit > 5 ? 'Maxed' : `Limit Break (+${limitBreakCost(nextLimit)})`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="meta-page">
      <div className="meta-header">
        <button className="profile-back" onClick={onBack}>← Back</button>
        <h1>Inventory</h1>
      </div>
      <div className="meta-grid inventory-grid">
        {characters.map(renderCard)}
      </div>
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
    </div>
  )
}

export default InventoryPage
