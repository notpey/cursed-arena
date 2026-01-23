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
    <div className="shop-page">
      <div className="shop-header">
        <button className="shop-back" onClick={onBack}>
          <span>←</span>
          <span>Back</span>
        </button>
        <div className="shop-title">
          <h1>Item Shop</h1>
          <div className="shop-currency-display">
            <div className="currency-badge soft">
              <span className="currency-icon">💰</span>
              <span className="currency-amount">{soft.toLocaleString()}</span>
            </div>
            <div className="currency-badge premium">
              <span className="currency-icon">💎</span>
              <span className="currency-amount">{premium.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="shop-container">
        {offers.length === 0 ? (
          <div className="shop-empty-state">
            <div className="empty-icon">🏪</div>
            <h2>Shop is Restocking</h2>
            <p>Check back soon for new items!</p>
          </div>
        ) : (
          <div className="shop-offers-grid">
            {offers.map(offer => {
              const canAfford = soft >= offer.cost_soft && premium >= offer.cost_premium
              const isPurchasing = purchasingId === offer.id
              const wasJustPurchased = lastPurchased === offer.id

              return (
                <div key={offer.id} className={`shop-offer-card ${wasJustPurchased ? 'just-purchased' : ''} ${!canAfford ? 'locked' : ''}`}>
                  <div className="offer-header">
                    <h3>{offer.name}</h3>
                    {wasJustPurchased && <div className="purchased-badge">✓ Purchased</div>}
                  </div>

                  <div className="offer-body">
                    <p className="offer-description">{offer.description}</p>

                    <div className="offer-rewards">
                      <div className="rewards-label">You Get:</div>
                      <div className="rewards-list">
                        {offer.item_type === 'shards' && offer.shard_amount > 0 && (
                          <div className="reward-item">
                            <span className="reward-icon">🎴</span>
                            <span className="reward-text">{offer.shard_amount} Character Shards</span>
                          </div>
                        )}
                        {offer.item_type === 'currency' && (
                          <>
                            {offer.soft_currency > 0 && (
                              <div className="reward-item">
                                <span className="reward-icon">💰</span>
                                <span className="reward-text">{offer.soft_currency.toLocaleString()} Soft Currency</span>
                              </div>
                            )}
                            {offer.premium_currency > 0 && (
                              <div className="reward-item">
                                <span className="reward-icon">💎</span>
                                <span className="reward-text">{offer.premium_currency.toLocaleString()} Premium Currency</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="offer-footer">
                    <div className="offer-price">
                      {offer.cost_soft > 0 && (
                        <div className={`price-tag soft ${soft < offer.cost_soft ? 'insufficient' : ''}`}>
                          <span className="price-icon">💰</span>
                          <span className="price-value">{offer.cost_soft.toLocaleString()}</span>
                        </div>
                      )}
                      {offer.cost_premium > 0 && (
                        <div className={`price-tag premium ${premium < offer.cost_premium ? 'insufficient' : ''}`}>
                          <span className="price-icon">💎</span>
                          <span className="price-value">{offer.cost_premium.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    <button
                      className={`offer-buy-button ${wasJustPurchased ? 'purchased' : ''} ${!canAfford ? 'disabled' : ''}`}
                      onClick={() => handlePurchase(offer.id)}
                      disabled={!canAfford || isPurchasing}
                    >
                      {isPurchasing ? (
                        <>
                          <span className="button-spinner"></span>
                          <span>Purchasing...</span>
                        </>
                      ) : wasJustPurchased ? (
                        <>
                          <span>✓</span>
                          <span>Purchased!</span>
                        </>
                      ) : canAfford ? (
                        <>
                          <span>🛒</span>
                          <span>Purchase</span>
                        </>
                      ) : (
                        <>
                          <span>🔒</span>
                          <span>Insufficient Funds</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ShopPage
