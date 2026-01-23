import React, { useMemo } from 'react'

function GachaPage({ banners, bannerItems, profile, items: userItems, characters, onBack, onPull, result }) {
  const premium = profile?.premium_currency ?? 0
  const fragments = userItems?.finger_fragment ?? 0
  const pullCost = 100
  const activeBanner = banners[0]
  const items = activeBanner
    ? bannerItems.filter(item => item.banner_id === activeBanner.id)
    : []
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0)
  const characterMap = useMemo(() => {
    const map = new Map()
    ;(characters || []).forEach(character => map.set(character.id, character))
    return map
  }, [characters])

  const formatItemLabel = (item) => {
    if (item.item_type === 'character' && item.character_id) {
      return characterMap.get(item.character_id)?.name || `Character #${item.character_id}`
    }
    if (item.item_type === 'shards' && item.character_id) {
      const name = characterMap.get(item.character_id)?.name || `Character #${item.character_id}`
      return `${name} Shards x${item.shard_amount}`
    }
    if (item.item_type === 'currency') {
      if (item.soft_currency > 0) return `Soft x${item.soft_currency}`
      if (item.premium_currency > 0) return `Premium x${item.premium_currency}`
    }
    return item.item_type
  }

  return (
    <div className="meta-page">
      <div className="meta-header">
        <button className="profile-back" onClick={onBack}>← Back</button>
        <h1>Gacha</h1>
        <div className="meta-currency">
          <span>Premium {premium}</span>
        </div>
      </div>
      <div className="meta-grid">
        <section className="gacha-banner">
          <h3>{activeBanner ? activeBanner.name : 'No banner available'}</h3>
          <p>{activeBanner?.description || 'Check back soon for the next featured banner.'}</p>
          <button
            className="mode-btn primary"
            onClick={() => activeBanner && onPull?.(activeBanner.id)}
            disabled={!activeBanner || premium < pullCost}
          >
            Pull ({pullCost})
          </button>
          {!activeBanner && (
            <div className="gacha-empty">No active banners yet.</div>
          )}
          <button
            className="mode-btn ghost"
            onClick={() => activeBanner && onPull?.(activeBanner.id, { useFragment: true })}
            disabled={!activeBanner || fragments <= 0}
          >
            Pull (Fragment) · {fragments}
          </button>
          {result && (
            <div className="gacha-result">
              <strong>Result</strong>
              <span>{formatItemLabel(result)}</span>
              {result.premium_currency > 0 && <span>Premium x{result.premium_currency}</span>}
            </div>
          )}
        </section>
        <section className="gacha-items">
          <h4>Featured Drops</h4>
          <div className="gacha-grid">
            {items.map((item, index) => (
              <div key={`${item.item_type}-${index}`} className="gacha-card">
                <span>{item.item_type}</span>
                <strong>{formatItemLabel(item)}</strong>
                <em>{totalWeight > 0 ? `${((item.weight || 0) / totalWeight * 100).toFixed(1)}%` : '—'}</em>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default GachaPage
