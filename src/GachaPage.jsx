import React from 'react'

function GachaPage({ banners, bannerItems, profile, items: userItems, onBack, onPull, result }) {
  const premium = profile?.premium_currency ?? 0
  const fragments = userItems?.finger_fragment ?? 0
  const pullCost = 100
  const activeBanner = banners[0]
  const items = activeBanner
    ? bannerItems.filter(item => item.banner_id === activeBanner.id)
    : []

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
          <p>{activeBanner?.description}</p>
          <button
            className="mode-btn primary"
            onClick={() => activeBanner && onPull?.(activeBanner.id)}
            disabled={!activeBanner || premium < pullCost}
          >
            Pull ({pullCost})
          </button>
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
              <span>{result.item_type}</span>
              {result.character_id && <span>Character #{result.character_id}</span>}
              {result.shard_amount > 0 && <span>Shards x{result.shard_amount}</span>}
              {result.soft_currency > 0 && <span>Soft x{result.soft_currency}</span>}
            </div>
          )}
        </section>
        <section className="gacha-items">
          <h4>Featured Drops</h4>
          <div className="gacha-grid">
            {items.map((item, index) => (
              <div key={`${item.item_type}-${index}`} className="gacha-card">
                <span>{item.item_type}</span>
                <strong>
                  {item.character_id ? `Character #${item.character_id}` : ''}
                  {item.shard_amount > 0 ? ` Shards x${item.shard_amount}` : ''}
                  {item.soft_currency > 0 ? ` Soft x${item.soft_currency}` : ''}
                  {item.premium_currency > 0 ? ` Premium x${item.premium_currency}` : ''}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default GachaPage
