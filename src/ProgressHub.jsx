import React, { useState } from 'react'
import DailyRewards from './DailyRewards'
import MissionsPage from './MissionsPage'
import Achievements from './Achievements'

function ProgressHub({
  dailyReward,
  onClaimDaily,
  missions,
  userMissions,
  onClaimMission,
  achievements,
  achievementProgress,
  onClaimAchievement,
}) {
  const [activeTab, setActiveTab] = useState('missions')
  const tabs = [
    { id: 'missions', label: 'Missions' },
    { id: 'daily', label: 'Daily' },
    { id: 'achievements', label: 'Achievements' },
  ]

  return (
    <div className="meta-page">
      <div className="page-shell">
        <div className="page-header">
          <div>
            <h1>Progress</h1>
            <p className="page-subtitle">Daily streaks, missions, and achievements.</p>
          </div>
        </div>

        <div className="progress-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`progress-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="progress-panel">
          {activeTab === 'missions' && (
            <MissionsPage
              missions={missions}
              userMissions={userMissions}
              onClaim={onClaimMission}
              embedded
            />
          )}
          {activeTab === 'daily' && (
            <DailyRewards
              dailyReward={dailyReward}
              onClaim={onClaimDaily}
              embedded
            />
          )}
          {activeTab === 'achievements' && (
            <Achievements
              achievements={achievements}
              progress={achievementProgress}
              onClaimReward={onClaimAchievement}
              embedded
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default ProgressHub
