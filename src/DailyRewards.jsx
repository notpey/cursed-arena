import React, { useState, useEffect } from 'react'

/**
 * Daily Login Rewards Component
 *
 * Features:
 * - 7-day reward calendar with escalating rewards
 * - Login streak tracking
 * - Claim button with animation
 * - Streak bonus multiplier
 */

function DailyRewards({ dailyReward, onClaim, onBack }) {
  const [claiming, setClaiming] = useState(false)
  const [justClaimed, setJustClaimed] = useState(false)

  const currentStreak = dailyReward?.current_streak || 0
  const longestStreak = dailyReward?.longest_streak || 0
  const totalLogins = dailyReward?.total_logins || 0
  const lastClaimDate = dailyReward?.last_claim_date

  // Check if user can claim today
  const today = new Date().toISOString().split('T')[0]
  const canClaim = lastClaimDate !== today

  // Calculate next claim day (1-7)
  const nextClaimDay = canClaim ? (currentStreak % 7) + 1 : ((currentStreak - 1) % 7) + 1

  // Daily reward schedule (escalates each day, resets weekly)
  const rewardSchedule = [
    { day: 1, soft: 50, premium: 0, icon: '💰' },
    { day: 2, soft: 75, premium: 0, icon: '💰' },
    { day: 3, soft: 100, premium: 5, icon: '💎' },
    { day: 4, soft: 125, premium: 0, icon: '💰' },
    { day: 5, soft: 150, premium: 10, icon: '💎' },
    { day: 6, soft: 200, premium: 0, icon: '💰' },
    { day: 7, soft: 300, premium: 25, icon: '✨' }, // Bonus day
  ]

  const handleClaim = async () => {
    if (!canClaim || claiming) return
    setClaiming(true)
    await onClaim?.()
    setClaiming(false)
    setJustClaimed(true)
    setTimeout(() => setJustClaimed(false), 3000)
  }

  return (
    <div className="daily-rewards-page">
      <div className="daily-rewards-header">
        <button className="daily-rewards-back" onClick={onBack}>
          <span>←</span>
          <span>Back</span>
        </button>
        <h1>Daily Login Rewards</h1>
      </div>

      <div className="daily-rewards-container">
        {/* Stats Section */}
        <div className="daily-rewards-stats">
          <div className="stat-card">
            <div className="stat-icon">🔥</div>
            <div className="stat-content">
              <div className="stat-value">{currentStreak}</div>
              <div className="stat-label">Current Streak</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🏆</div>
            <div className="stat-content">
              <div className="stat-value">{longestStreak}</div>
              <div className="stat-label">Longest Streak</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📅</div>
            <div className="stat-content">
              <div className="stat-value">{totalLogins}</div>
              <div className="stat-label">Total Logins</div>
            </div>
          </div>
        </div>

        {/* Reward Calendar */}
        <div className="reward-calendar">
          <h2>Weekly Rewards</h2>
          <div className="calendar-grid">
            {rewardSchedule.map((reward) => {
              const isToday = reward.day === nextClaimDay && canClaim
              const isClaimed = reward.day < nextClaimDay || (reward.day === nextClaimDay && !canClaim)
              const isUpcoming = reward.day > nextClaimDay || (reward.day === nextClaimDay && !canClaim && currentStreak === 0)

              return (
                <div
                  key={reward.day}
                  className={`calendar-day ${isToday ? 'today' : ''} ${isClaimed ? 'claimed' : ''} ${isUpcoming ? 'upcoming' : ''}`}
                >
                  <div className="day-header">
                    <span className="day-number">Day {reward.day}</span>
                    {isClaimed && <span className="claimed-badge">✓</span>}
                    {isToday && <span className="today-badge">Today</span>}
                  </div>
                  <div className="day-icon">{reward.icon}</div>
                  <div className="day-rewards">
                    {reward.soft > 0 && (
                      <div className="reward-item">
                        <span className="reward-icon">💰</span>
                        <span className="reward-amount">{reward.soft}</span>
                      </div>
                    )}
                    {reward.premium > 0 && (
                      <div className="reward-item premium">
                        <span className="reward-icon">💎</span>
                        <span className="reward-amount">{reward.premium}</span>
                      </div>
                    )}
                  </div>
                  {reward.day === 7 && <div className="bonus-badge">Bonus!</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Claim Button */}
        {canClaim ? (
          <button
            className={`claim-button ${claiming ? 'claiming' : ''} ${justClaimed ? 'claimed' : ''}`}
            onClick={handleClaim}
            disabled={claiming || justClaimed}
          >
            {claiming ? (
              <>
                <span className="button-spinner"></span>
                <span>Claiming...</span>
              </>
            ) : justClaimed ? (
              <>
                <span>✓</span>
                <span>Claimed!</span>
              </>
            ) : (
              <>
                <span>🎁</span>
                <span>Claim Today's Reward</span>
              </>
            )}
          </button>
        ) : (
          <div className="claim-cooldown">
            <div className="cooldown-icon">⏰</div>
            <div className="cooldown-text">
              <div className="cooldown-title">Already Claimed Today</div>
              <div className="cooldown-subtitle">Come back tomorrow for your next reward!</div>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="daily-rewards-info">
          <h3>How it Works</h3>
          <ul>
            <li>🎁 Login every day to claim rewards and build your streak</li>
            <li>🔥 Consecutive logins increase your rewards</li>
            <li>✨ Day 7 gives bonus premium currency!</li>
            <li>⚠️ Missing a day resets your streak to Day 1</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default DailyRewards
