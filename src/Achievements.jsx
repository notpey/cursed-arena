import React, { useState, useMemo } from 'react'

/**
 * Achievements Component
 *
 * Features:
 * - Achievement list with progress bars
 * - Category filtering (All, Battle, PvP, Collection, etc.)
 * - Claim rewards button
 * - Progress tracking
 * - Rarity-based styling
 */

function Achievements({ achievements, progress, onClaimReward, onBack, embedded = false }) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [claimingId, setClaimingId] = useState(null)

  const categories = [
    { id: 'all', label: 'All', icon: '📋' },
    { id: 'battle', label: 'Battle', icon: '⚔️' },
    { id: 'pvp', label: 'PvP', icon: '🏆' },
    { id: 'collection', label: 'Collection', icon: '🎭' },
    { id: 'progression', label: 'Progress', icon: '📈' },
    { id: 'economy', label: 'Economy', icon: '💰' },
    { id: 'story', label: 'Story', icon: '📜' },
    { id: 'daily', label: 'Daily', icon: '📅' },
    { id: 'special', label: 'Special', icon: '✨' },
  ]

  // Merge achievements with progress data
  const achievementsWithProgress = useMemo(() => {
    return achievements.map(achievement => {
      const userProgress = progress.find(p => p.achievement_id === achievement.id)
      return {
        ...achievement,
        progress: userProgress?.progress || 0,
        is_completed: userProgress?.is_completed || false,
        rewards_claimed: userProgress?.rewards_claimed || false,
        completed_at: userProgress?.completed_at,
      }
    })
  }, [achievements, progress])

  // Filter by category
  const filteredAchievements = useMemo(() => {
    if (selectedCategory === 'all') return achievementsWithProgress
    return achievementsWithProgress.filter(a => a.category === selectedCategory)
  }, [achievementsWithProgress, selectedCategory])

  // Stats
  const stats = useMemo(() => {
    const completed = achievementsWithProgress.filter(a => a.is_completed).length
    const total = achievementsWithProgress.length
    const totalSoftEarned = achievementsWithProgress
      .filter(a => a.rewards_claimed)
      .reduce((sum, a) => sum + a.reward_soft_currency, 0)
    const totalPremiumEarned = achievementsWithProgress
      .filter(a => a.rewards_claimed)
      .reduce((sum, a) => sum + a.reward_premium_currency, 0)

    return { completed, total, totalSoftEarned, totalPremiumEarned }
  }, [achievementsWithProgress])

  const handleClaimReward = async (achievementId) => {
    setClaimingId(achievementId)
    await onClaimReward?.(achievementId)
    setClaimingId(null)
  }

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'legendary': return 'linear-gradient(135deg, #ff6b6b, #feca57)'
      case 'epic': return 'linear-gradient(135deg, #a29bfe, #fd79a8)'
      case 'rare': return 'linear-gradient(135deg, #74b9ff, #a29bfe)'
      default: return 'linear-gradient(135deg, #95a5a6, #bdc3c7)'
    }
  }

  return (
    <div className={`achievements-page ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="achievements-header">
          {onBack && (
            <button className="achievements-back" onClick={onBack}>
              <span>←</span>
              <span>Back</span>
            </button>
          )}
          <h1>Achievements</h1>
        </div>
      )}

      <div className="achievements-container">
        {/* Stats Section */}
        <div className="achievements-stats">
          <div className="stat-card">
            <div className="stat-icon">🏆</div>
            <div className="stat-content">
              <div className="stat-value">{stats.completed} / {stats.total}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <div className="stat-value">{stats.totalSoftEarned.toLocaleString()}</div>
              <div className="stat-label">Soft Earned</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💎</div>
            <div className="stat-content">
              <div className="stat-value">{stats.totalPremiumEarned}</div>
              <div className="stat-label">Premium Earned</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <div className="stat-value">{Math.round((stats.completed / stats.total) * 100)}%</div>
              <div className="stat-label">Completion</div>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="category-filter">
          {categories.map(category => {
            const count = category.id === 'all'
              ? achievementsWithProgress.length
              : achievementsWithProgress.filter(a => a.category === category.id).length

            return (
              <button
                key={category.id}
                className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.id)}
              >
                <span className="category-icon">{category.icon}</span>
                <span className="category-label">{category.label}</span>
                <span className="category-count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Achievements List */}
        <div className="achievements-list">
          {filteredAchievements.length === 0 ? (
            <div className="achievements-empty">
              <div className="empty-icon">🏆</div>
              <div className="empty-text">No achievements in this category</div>
            </div>
          ) : (
            filteredAchievements.map(achievement => {
              const progressPercent = Math.min(100, (achievement.progress / achievement.requirement_target) * 100)
              const canClaim = achievement.is_completed && !achievement.rewards_claimed
              const isClaiming = claimingId === achievement.id

              return (
                <div
                  key={achievement.id}
                  className={`achievement-card ${achievement.is_completed ? 'completed' : ''} ${achievement.rewards_claimed ? 'claimed' : ''}`}
                  style={{ borderImage: getRarityColor(achievement.rarity) }}
                >
                  <div className="achievement-icon-wrapper">
                    <div className="achievement-icon">{achievement.icon || '🏆'}</div>
                    {achievement.is_completed && <div className="completion-badge">✓</div>}
                  </div>

                  <div className="achievement-content">
                    <div className="achievement-header">
                      <div className="achievement-title">
                        <h3>{achievement.name}</h3>
                        <span className={`rarity-badge rarity-${achievement.rarity}`}>{achievement.rarity}</span>
                      </div>
                      <p className="achievement-description">{achievement.description}</p>
                    </div>

                    <div className="achievement-progress">
                      <div className="progress-bar-container">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                      <div className="progress-text">
                        {achievement.progress} / {achievement.requirement_target}
                      </div>
                    </div>

                    <div className="achievement-footer">
                      <div className="achievement-rewards">
                        {achievement.reward_soft_currency > 0 && (
                          <div className="reward-badge">
                            <span className="reward-icon">💰</span>
                            <span>{achievement.reward_soft_currency}</span>
                          </div>
                        )}
                        {achievement.reward_premium_currency > 0 && (
                          <div className="reward-badge premium">
                            <span className="reward-icon">💎</span>
                            <span>{achievement.reward_premium_currency}</span>
                          </div>
                        )}
                        {achievement.reward_title && (
                          <div className="reward-badge title">
                            <span className="reward-icon">🎖️</span>
                            <span>{achievement.reward_title}</span>
                          </div>
                        )}
                      </div>

                      {canClaim && (
                        <button
                          className={`claim-reward-btn ${isClaiming ? 'claiming' : ''}`}
                          onClick={() => handleClaimReward(achievement.id)}
                          disabled={isClaiming}
                        >
                          {isClaiming ? 'Claiming...' : 'Claim Reward'}
                        </button>
                      )}

                      {achievement.rewards_claimed && (
                        <div className="claimed-badge">Claimed ✓</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default Achievements
