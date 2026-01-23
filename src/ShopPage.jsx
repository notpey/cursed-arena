import React, { useState } from 'react'

function ShopPage({ offers, profile, onBack, onPurchase }) {
  const [purchasingId, setPurchasingId] = useState(null)
  const [lastPurchased, setLastPurchased] = useState(null)

  const soft = profile?.soft_currency ?? 0
  const premium = profile?.premium_currency ?? 0

  const handlePurchase = async (offerId) => {
    setPurchasingId(offerId)
    setLastPurchased(null)
    await onPurchase?.(offerId)
    setPurchasingId(null)
    setLastPurchased(offerId)
    // Clear success indicator after 2 seconds
    setTimeout(() => setLastPurchased(null), 2000)
  }

  return (
    <div className="meta-page">
      <div className="meta-header">
        <button className="profile-back" onClick={onBack}>← Back</button>
        <h1>Shop</h1>
        <div className="meta-currency">
          <span>Soft {soft}</span>
          <span>Premium {premium}</span>
        </div>
      </div>
      <div className="meta-grid">
        <section className="shop-grid">
          {offers.length === 0 ? (
            <div className="shop-empty">The shop is restocking. Check back soon.</div>
          ) : (
            offers.map(offer => {
              const canAfford = soft >= offer.cost_soft && premium >= offer.cost_premium
              const isPurchasing = purchasingId === offer.id
              const wasJustPurchased = lastPurchased === offer.id

              return (
                <div key={offer.id} className={`shop-card ${wasJustPurchased ? 'purchased' : ''}`}>
                  <h4>{offer.name}</h4>
                  <p>{offer.description}</p>
                  <div className="shop-reward">
                    {offer.item_type === 'shards' && offer.shard_amount > 0 && (
                      <span className="shop-reward-item">+{offer.shard_amount} Shards</span>
                    )}
                    {offer.item_type === 'currency' && (
                      <>
                        {offer.soft_currency > 0 && <span className="shop-reward-item">+{offer.soft_currency} Soft</span>}
                        {offer.premium_currency > 0 && <span className="shop-reward-item">+{offer.premium_currency} Premium</span>}
                      </>
                    )}
                  </div>
                  <div className="shop-cost">
                    {offer.cost_soft > 0 && <span className={soft < offer.cost_soft ? 'insufficient' : ''}>Soft {offer.cost_soft}</span>}
                    {offer.cost_premium > 0 && <span className={premium < offer.cost_premium ? 'insufficient' : ''}>Premium {offer.cost_premium}</span>}
                  </div>
                  <button
                    className={`mission-claim ${wasJustPurchased ? 'success' : ''}`}
                    onClick={() => handlePurchase(offer.id)}
                    disabled={!canAfford || isPurchasing}
                  >
                    {isPurchasing ? 'Purchasing...' : wasJustPurchased ? '✓ Purchased!' : canAfford ? 'Buy' : 'Insufficient Funds'}
                  </button>
                </div>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}

export default ShopPage
