import React from 'react'

const tierForRating = (rating) => {
  if (rating >= 1700) return { name: 'Kage', color: '#f1c36a' }
  if (rating >= 1500) return { name: 'ANBU', color: '#58c1d8' }
  if (rating >= 1300) return { name: 'Jonin', color: '#62c189' }
  if (rating >= 1100) return { name: 'Chunin', color: '#e5c07b' }
  return { name: 'Genin', color: '#a7b0bf' }
}

const formatDate = (value) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function LadderPage({
  entries,
  status,
  error,
  season,
  currentUserId,
  currentRating,
  onRefresh,
  onBack,
}) {
  const userEntry = entries.find(entry => entry.user_id === currentUserId)
  const userRank = userEntry ? entries.findIndex(entry => entry.user_id === currentUserId) + 1 : null
  const tier = tierForRating(currentRating || 1000)
  const daysRemaining = season?.daysRemaining ?? 0

  return (
    <div className="ladder-page">
      <div className="ladder-header">
        <button className="ladder-back" onClick={onBack}>← Back</button>
        <div className="ladder-title">
          <h1>Ranked Ladder</h1>
          <span className="ladder-subtitle">Modern Arena Season Tracking</span>
        </div>
        <button className="ladder-refresh" onClick={onRefresh}>Refresh</button>
      </div>

      <div className="ladder-season">
        <div>
          <div className="season-label">Current Season</div>
          <div className="season-name">{season?.label || 'Season'}</div>
          <div className="season-dates">
            {formatDate(season?.start)} — {formatDate(season?.end)}
          </div>
        </div>
        <div className="season-countdown">
          <div className="countdown-value">{daysRemaining}</div>
          <div className="countdown-label">days left</div>
        </div>
      </div>

      <div className="ladder-summary">
        <div className="ladder-card">
          <div className="card-label">Your Rating</div>
          <div className="card-value">{currentRating ?? 1000}</div>
          <div className="card-meta" style={{ color: tier.color }}>{tier.name}</div>
        </div>
        <div className="ladder-card">
          <div className="card-label">Your Rank</div>
          <div className="card-value">{userRank ? `#${userRank}` : '—'}</div>
          <div className="card-meta">Top 100 only</div>
        </div>
        <div className="ladder-card">
          <div className="card-label">Season Status</div>
          <div className="card-value">Active</div>
          <div className="card-meta">Ranked queues open</div>
        </div>
      </div>

      <div className="ladder-table">
        <div className="ladder-table-header">
          <h3>Top Players</h3>
          <span>Ranked season leaderboard</span>
        </div>

        {status === 'loading' && (
          <div className="ladder-empty">Loading leaderboard…</div>
        )}
        {status === 'error' && (
          <div className="ladder-empty">{error || 'Leaderboard unavailable. Run the leaderboard SQL setup.'}</div>
        )}
        {status === 'ready' && entries.length === 0 && (
          <div className="ladder-empty">No ranked matches yet. Be the first.</div>
        )}

        {status === 'ready' && entries.length > 0 && (
          <div className="ladder-table-body">
            {entries.map((entry, index) => {
              const entryTier = tierForRating(entry.rating || 1000)
              const isCurrentUser = entry.user_id === currentUserId
              return (
                <div
                  key={`${entry.user_id}-${index}`}
                  className={`ladder-row ${isCurrentUser ? 'current-user' : ''}`}
                >
                  <div className="ladder-rank">#{index + 1}</div>
                  <div className="ladder-player">
                    <span className="ladder-name">
                      {entry.display_name || 'Unknown'}
                      {entry.is_bot && <span className="ladder-bot">BOT</span>}
                    </span>
                    <span className="ladder-tier" style={{ color: entryTier.color }}>{entryTier.name}</span>
                  </div>
                  <div className="ladder-rating">{entry.rating ?? 1000}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default LadderPage
