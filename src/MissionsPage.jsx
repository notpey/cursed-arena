import React from 'react'

function MissionsPage({ missions, userMissions, onBack, onClaim, embedded = false }) {
  const progressById = new Map(userMissions.map(entry => [entry.mission_id, entry]))

  const groupByType = (type) => missions.filter(mission => mission.type === type)

  const renderMission = (mission) => {
    const progress = progressById.get(mission.id)
    const current = progress?.progress ?? 0
    const claimed = progress?.claimed ?? false
    const percent = Math.min(100, Math.floor((current / mission.target) * 100))

    return (
      <div key={mission.id} className="mission-card">
        <div>
          <h4>{mission.title}</h4>
          <p>{mission.description}</p>
          <div className="mission-progress">
            <div className="mission-progress-bar">
              <div className="mission-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <span>{current}/{mission.target}</span>
          </div>
        </div>
        <div className="mission-reward">
          <span>Soft +{mission.reward_soft}</span>
          <span>Premium +{mission.reward_premium}</span>
          {mission.reward_shard_character_id && mission.reward_shard_amount > 0 && (
            <span>Shard +{mission.reward_shard_amount}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`meta-page ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="meta-header">
          {onBack && <button className="profile-back" onClick={onBack}>← Back</button>}
          <h1>Missions</h1>
        </div>
      )}

      <div className={`meta-grid ${embedded ? 'embedded' : ''}`}>
        <section>
          <h3>Daily</h3>
          <div className="mission-list">
            {groupByType('daily').map(mission => (
              <div key={mission.id}>
                {renderMission(mission)}
                <button
                  className="mission-claim"
                  onClick={() => onClaim?.(mission.id)}
                  disabled={
                    (progressById.get(mission.id)?.claimed ?? false) ||
                    (progressById.get(mission.id)?.progress ?? 0) < mission.target
                  }
                >
                  {progressById.get(mission.id)?.claimed ? 'Claimed' : 'Claim Reward'}
                </button>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>Weekly</h3>
          <div className="mission-list">
            {groupByType('weekly').map(mission => (
              <div key={mission.id}>
                {renderMission(mission)}
                <button
                  className="mission-claim"
                  onClick={() => onClaim?.(mission.id)}
                  disabled={
                    (progressById.get(mission.id)?.claimed ?? false) ||
                    (progressById.get(mission.id)?.progress ?? 0) < mission.target
                  }
                >
                  {progressById.get(mission.id)?.claimed ? 'Claimed' : 'Claim Reward'}
                </button>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>Limited Time</h3>
          <div className="mission-list">
            {groupByType('limited').map(mission => (
              <div key={mission.id}>
                {renderMission(mission)}
                <button
                  className="mission-claim"
                  onClick={() => onClaim?.(mission.id)}
                  disabled={
                    (progressById.get(mission.id)?.claimed ?? false) ||
                    (progressById.get(mission.id)?.progress ?? 0) < mission.target
                  }
                >
                  {progressById.get(mission.id)?.claimed ? 'Claimed' : 'Claim Reward'}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default MissionsPage
