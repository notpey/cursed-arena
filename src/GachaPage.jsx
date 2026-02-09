import React, { useMemo, useState, useEffect, useRef } from 'react'

function GachaPage({ banners, bannerItems, profile, items: userItems, characters, onBack, onPull, result, onClearResult }) {
  const [isPulling, setIsPulling] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const clearTimerRef = useRef(null)

  const premium = profile?.premium_currency ?? 0
  const fragments = userItems?.finger_fragment ?? 0
  const pullCost = 25
  const multiPullCount = 10
  const multiPullCost = pullCost * multiPullCount
  const activeBanner = useMemo(() => {
    if (!banners || banners.length === 0) return null
    const sorted = [...banners].sort((a, b) => {
      const aTime = a?.starts_at ? new Date(a.starts_at).getTime() : 0
      const bTime = b?.starts_at ? new Date(b.starts_at).getTime() : 0
      return bTime - aTime
    })
    return sorted[0]
  }, [banners])
  const items = activeBanner
    ? bannerItems.filter(item => item.banner_id === activeBanner.id)
    : []
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weight || 0), 0)
  const characterMap = useMemo(() => {
    const map = new Map()
    ;(characters || []).forEach(character => map.set(character.id, character))
    return map
  }, [characters])

  // Auto-show result with animation when result changes
  useEffect(() => {
    if (result) {
      setShowResult(true)
      setIsPulling(false)
    }
  }, [result])

  const handlePull = async (bannerId, options = {}) => {
    setIsPulling(true)
    setShowResult(false)
    const success = await onPull?.(bannerId, options)
    if (!success) {
      setIsPulling(false)
    }
  }

  const handleClearResult = () => {
    setShowResult(false)
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
    }
    clearTimerRef.current = setTimeout(() => {
      onClearResult?.()
    }, 300) // Wait for fade out animation
  }

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current)
      }
    }
  }, [])

  const results = Array.isArray(result) ? result : (result ? [result] : [])
  const isMultiResult = results.length > 1

  const formatItemLabel = (item) => {
    if (item.item_type === 'character' && item.character_id) {
      return characterMap.get(item.character_id)?.name || `Character #${item.character_id}`
    }
    if (item.item_type === 'shards' && item.character_id) {
      const name = characterMap.get(item.character_id)?.name || `Character #${item.character_id}`
      return `${name} Shards`
    }
    if (item.item_type === 'currency') {
      if (item.soft_currency > 0) return `Soft Currency`
      if (item.premium_currency > 0) return `Premium Currency`
    }
    return item.item_type
  }

  const getRarityClass = (item) => {
    if (item.item_type === 'character') return 'rarity-ssr'
    if (item.item_type === 'shards') return 'rarity-sr'
    return 'rarity-r'
  }

  return (
    <div className="gacha-page">
      <div className="gacha-header">
        <button className="gacha-back" onClick={onBack}>
          <span>←</span>
          <span>Back</span>
        </button>
        <div className="gacha-title">
          <h1>Summoning Portal</h1>
          <div className="gacha-currency-display">
            <div className="currency-badge premium">
              <span className="currency-icon">💎</span>
              <span className="currency-amount">{premium}</span>
            </div>
            <div className="currency-badge fragment">
              <span className="currency-icon">🎴</span>
              <span className="currency-amount">{fragments}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="gacha-container">
        {/* Main Banner Section */}
        <div className="gacha-main">
          <div className="banner-showcase">
            <div className="banner-art">
              <div className="banner-glow"></div>
              <div className="banner-content">
                <h2>{activeBanner ? activeBanner.name : 'No Active Banner'}</h2>
                <p>{activeBanner?.description || 'Check back soon for the next featured banner.'}</p>
              </div>
            </div>

            {!activeBanner && (
              <div className="banner-empty">
                <div className="empty-icon">✨</div>
                <p>No active summoning banner</p>
                <span>Check back soon!</span>
              </div>
            )}

            {/* Pull Buttons */}
            {activeBanner && (
              <div className="pull-actions">
                <button
                  className={`pull-button primary ${isPulling ? 'pulling' : ''}`}
                  onClick={() => handlePull(activeBanner.id)}
                  disabled={premium < pullCost || isPulling}
                >
                  <div className="pull-button-content">
                    <span className="pull-icon">💎</span>
                    <div className="pull-text">
                      <span className="pull-label">{isPulling ? 'Summoning...' : 'Single Summon'}</span>
                      <span className="pull-cost">{pullCost} Premium</span>
                    </div>
                  </div>
                  {premium < pullCost && <div className="pull-overlay">Insufficient Funds</div>}
                </button>

                <button
                  className={`pull-button primary multi ${isPulling ? 'pulling' : ''}`}
                  onClick={() => handlePull(activeBanner.id, { count: multiPullCount })}
                  disabled={premium < multiPullCost || isPulling}
                >
                  <div className="pull-button-content">
                    <span className="pull-icon">💎</span>
                    <div className="pull-text">
                      <span className="pull-label">{isPulling ? 'Summoning...' : `${multiPullCount}x Summon`}</span>
                      <span className="pull-cost">{multiPullCost} Premium</span>
                      <span className="pull-bonus">Boosted rates + guaranteed rare</span>
                    </div>
                  </div>
                  {premium < multiPullCost && <div className="pull-overlay">Insufficient Funds</div>}
                </button>

                <button
                  className={`pull-button fragment ${isPulling ? 'pulling' : ''}`}
                  onClick={() => handlePull(activeBanner.id, { useFragment: true })}
                  disabled={fragments <= 0 || isPulling}
                >
                  <div className="pull-button-content">
                    <span className="pull-icon">🎴</span>
                    <div className="pull-text">
                      <span className="pull-label">{isPulling ? 'Summoning...' : 'Fragment Summon'}</span>
                      <span className="pull-cost">1 Fragment</span>
                    </div>
                  </div>
                  {fragments <= 0 && <div className="pull-overlay">No Fragments</div>}
                </button>
              </div>
            )}

            {/* Pulling Animation */}
            {isPulling && !result && (
              <div className="summoning-animation">
                <div className="summon-circle">
                  <div className="summon-ring ring-1"></div>
                  <div className="summon-ring ring-2"></div>
                  <div className="summon-ring ring-3"></div>
                  <div className="summon-core"></div>
                </div>
                <p className="summon-text">Summoning...</p>
              </div>
            )}

            {/* Result Display */}
            {result && (
              <div className={`summon-result ${showResult ? 'revealed' : ''}`}>
                <button className="result-close" onClick={handleClearResult}>×</button>
                <div className="result-backdrop"></div>
                <div className={`result-card ${isMultiResult ? 'result-card-multi' : ''}`}>
                  {isMultiResult ? (
                    <>
                      <div className="result-header">
                        <div>
                          <div className="rarity-label">Summon Results</div>
                          <div className="result-name">{results.length} Pulls</div>
                        </div>
                      </div>
                      <div className="result-grid">
                        {results.map((item, index) => (
                          <div key={`${item.item_type}-${index}`} className={`result-tile ${getRarityClass(item)}`}>
                            <div className="result-tile-name">{formatItemLabel(item)}</div>
                            <div className="result-tile-rewards">
                              {item.item_type === 'character' && <span>+30 Shards</span>}
                              {item.item_type === 'shards' && <span>+{item.shard_amount} Shards</span>}
                              {item.soft_currency > 0 && <span>+{item.soft_currency} Soft</span>}
                              {item.premium_currency > 0 && <span>+{item.premium_currency} Premium</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`result-rarity ${getRarityClass(results[0])}`}>
                        {results[0].item_type === 'character' && (
                          <>
                            <div className="rarity-stars">★★★</div>
                            <div className="rarity-label">NEW CHARACTER</div>
                          </>
                        )}
                      </div>
                      <div className="result-name">{formatItemLabel(results[0])}</div>
                      <div className="result-rewards">
                        {results[0].item_type === 'character' && <span className="reward-badge">+30 Shards</span>}
                        {results[0].item_type === 'shards' && <span className="reward-badge">+{results[0].shard_amount} Shards</span>}
                        {results[0].soft_currency > 0 && <span className="reward-badge">+{results[0].soft_currency} Soft</span>}
                        {results[0].premium_currency > 0 && <span className="reward-badge">+{results[0].premium_currency} Premium</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drop Rates Sidebar */}
        <div className="gacha-sidebar">
          <div className="drop-rates">
            <h3>Drop Rates</h3>
            <div className="rates-list">
              {items.map((item, index) => {
                const rate = totalWeight > 0 ? ((item.weight || 0) / totalWeight * 100).toFixed(1) : 0
                return (
                  <div key={`${item.item_type}-${index}`} className={`rate-item ${getRarityClass(item)}`}>
                    <div className="rate-info">
                      <span className="rate-name">{formatItemLabel(item)}</span>
                      {item.item_type === 'shards' && <span className="rate-amount">×{item.shard_amount}</span>}
                      {item.soft_currency > 0 && <span className="rate-amount">×{item.soft_currency}</span>}
                      {item.premium_currency > 0 && <span className="rate-amount">×{item.premium_currency}</span>}
                    </div>
                    <div className="rate-bar">
                      <div className="rate-fill" style={{ width: `${rate}%` }}></div>
                    </div>
                    <span className="rate-percent">{rate}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GachaPage
