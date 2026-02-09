import React, { useEffect, useState } from 'react'

function BattleResultScreen({
  result,
  rewards,
  onContinue,
  isPvp = false
}) {
  const [showRewards, setShowRewards] = useState(false)
  const [animationStep, setAnimationStep] = useState(0)

  useEffect(() => {
    // Victory/defeat animation
    const stepTimer = setTimeout(() => setAnimationStep(1), 100)
    // Show rewards after victory animation
    const rewardTimer = setTimeout(() => setShowRewards(true), 800)
    // Auto-continue after showing all rewards (optional, removed for user control)
    return () => {
      clearTimeout(stepTimer)
      clearTimeout(rewardTimer)
    }
  }, [])

  const isVictory = result === 'win'
  const resultTitle = isVictory ? '🏆 VICTORY! 🏆' : '💀 DEFEAT 💀'
  const resultColor = isVictory ? 'var(--accent)' : '#ff6b6b'

  return (
    <div className={`battle-result-overlay ${animationStep >= 1 ? 'show' : ''}`}>
      <div className={`battle-result-modal ${showRewards ? 'show-rewards' : ''}`}>
        {/* Result Title */}
        <div className="result-title" style={{ color: resultColor }}>
          {resultTitle}
        </div>

        {/* Battle Summary */}
        <div className="result-summary">
          <div className="summary-stat">
            <span className="stat-label">Turns Taken</span>
            <span className="stat-value">{rewards?.turns || 0}</span>
          </div>
          {isPvp && (
            <div className="summary-stat">
              <span className="stat-label">Rating Change</span>
              <span className={`stat-value ${rewards?.ratingDelta >= 0 ? 'positive' : 'negative'}`}>
                {rewards?.ratingDelta >= 0 ? '+' : ''}{rewards?.ratingDelta || 0}
              </span>
            </div>
          )}
        </div>

        {/* Rewards Section */}
        {showRewards && rewards && (
          <div className="rewards-section">
            <h3 className="rewards-title">Rewards Earned</h3>

            {/* Account XP */}
            <div className="reward-item account-xp">
              <span className="reward-icon">⭐</span>
              <div className="reward-details">
                <span className="reward-label">Account XP</span>
                <span className="reward-value">+{rewards.accountXpGain}</span>
              </div>
              {rewards.accountLevelUp && (
                <span className="level-up-badge">Level {rewards.accountLevel}!</span>
              )}
            </div>

            {/* Soft Currency */}
            {rewards.softCurrencyGain > 0 && (
              <div className="reward-item currency">
                <span className="reward-icon">💰</span>
                <div className="reward-details">
                  <span className="reward-label">Soft Currency</span>
                  <span className="reward-value">+{rewards.softCurrencyGain}</span>
                </div>
              </div>
            )}

            {/* Premium Currency */}
            {rewards.premiumCurrencyGain > 0 && (
              <div className="reward-item premium">
                <span className="reward-icon">💎</span>
                <div className="reward-details">
                  <span className="reward-label">Premium Currency</span>
                  <span className="reward-value">+{rewards.premiumCurrencyGain}</span>
                </div>
              </div>
            )}

            {/* Character XP */}
            {rewards.characters && rewards.characters.length > 0 && (
              <div className="character-rewards">
                <h4 className="characters-title">Character Progress</h4>
                {rewards.characters.map((char, idx) => (
                  <div key={idx} className="character-reward-item">
                    <div className="character-reward-left">
                      <span className="character-name">{char.name}</span>
                      <div className="character-xp-bar">
                        <div
                          className="character-xp-fill"
                          style={{ width: `${Math.min(100, (char.xp / char.xpNeeded) * 100)}%` }}
                        />
                      </div>
                      <span className="character-xp-text">
                        {char.xp} / {char.xpNeeded} XP
                      </span>
                    </div>
                    <div className="character-reward-right">
                      <span className="character-level">Lv {char.level}</span>
                      {char.levelUp && (
                        <span className="character-level-up">↑ Level Up!</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Achievements Unlocked */}
            {rewards.achievementsUnlocked && rewards.achievementsUnlocked.length > 0 && (
              <div className="achievements-unlocked">
                <h4 className="achievements-title">🏅 Achievements Unlocked!</h4>
                {rewards.achievementsUnlocked.map((achievement, idx) => (
                  <div key={idx} className="achievement-unlock-item">
                    <span className="achievement-icon">{achievement.icon}</span>
                    <div className="achievement-unlock-details">
                      <span className="achievement-name">{achievement.name}</span>
                      <span className="achievement-description">{achievement.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Continue Button */}
        <button className="result-continue-btn" onClick={onContinue}>
          {isVictory ? 'Continue' : 'Return'}
        </button>
      </div>
    </div>
  )
}

export default BattleResultScreen
