import React from 'react'

function ShopPage({ offers, profile, onBack, onPurchase }) {
  const soft = profile?.soft_currency ?? 0
  const premium = profile?.premium_currency ?? 0

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
          {offers.map(offer => (
            <div key={offer.id} className="shop-card">
              <h4>{offer.name}</h4>
              <p>{offer.description}</p>
              <div className="shop-cost">
                <span>Soft {offer.cost_soft}</span>
                <span>Premium {offer.cost_premium}</span>
              </div>
              <button
                className="mission-claim"
                onClick={() => onPurchase?.(offer.id)}
                disabled={(soft < offer.cost_soft) || (premium < offer.cost_premium)}
              >
                Buy
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

export default ShopPage
