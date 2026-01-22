import React from 'react'
import { getCharacterImage } from './imageConfig'

function InventoryPage({ characters, inventory, characterProgress, onBack, onLimitBreak, limitBreakCost }) {
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
    </div>
  )
}

export default InventoryPage
