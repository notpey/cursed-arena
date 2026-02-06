import React from 'react'

function RogueMode({
  rogueState,
  selectedTeam = [],
  onStart,
  onEnterFloor,
  onChooseBlessing,
  onChooseNode,
  onResolveEvent,
  onAbandon,
  onBack,
  rogueTokens = 0,
}) {
  const runActive = rogueState?.active
  const hasTeam = selectedTeam.length > 0
  const floor = rogueState?.floor || 0
  const maxFloors = rogueState?.maxFloors || 10
  const progress = maxFloors > 0 ? Math.min(100, Math.floor((floor / maxFloors) * 100)) : 0
  const blessings = rogueState?.blessings || []
  const pendingBlessings = rogueState?.pendingBlessings || []
  const nodeOptions = rogueState?.nodeOptions || []
  const pendingEvent = rogueState?.pendingEvent
  const activeModifiers = rogueState?.activeModifiers || []
  const selectedNode = rogueState?.selectedNode
  const synergies = rogueState?.synergies || []
  const status = rogueState?.status || 'idle'
  const reward = rogueState?.lastReward

  return (
    <div className="rogue-page">
      <div className="page-shell padded">
        <div className="rogue-header">
        <div className="rogue-header-left">
          <button className="rogue-back" onClick={onBack}>
            <span>←</span>
            <span>Back</span>
          </button>
          <div className="rogue-title">
            <h1>Simulated Curse</h1>
            <p>Ascend the tower, claim augments, survive the bosses.</p>
          </div>
        </div>
        <div className="rogue-header-right">
          <div className="rogue-token-badge">
            🜁 Rogue Tokens: {rogueTokens}
          </div>
          {runActive && (
            <button className="rogue-abandon ghost-btn" onClick={onAbandon}>
              Abandon Run
            </button>
          )}
        </div>
        </div>

        <div className="rogue-grid">
        <div className="rogue-panel rogue-main">
          <div className="rogue-progress">
            <div>
              <h2>Run Progress</h2>
              <p>Floor {floor} / {maxFloors}</p>
            </div>
            <div className="rogue-progress-bar">
              <div className="rogue-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {!runActive && (
            <div className="rogue-start">
              <h3>Begin a Run</h3>
              <p>Choose your best team and dive into a chain of escalating battles with powerful augments.</p>
              {!hasTeam && <div className="rogue-warning">Select a team on the Home screen first.</div>}
              <button className="btn-primary" onClick={onStart} disabled={!hasTeam}>
                Start Run
              </button>
            </div>
          )}

          {runActive && status === 'node-select' && (
            <div className="rogue-nodes">
              <h3>Choose Your Path</h3>
              <p>Select the next node for Floor {floor}.</p>
              <div className="rogue-node-grid">
                {nodeOptions.map(node => (
                  <button key={node.type} className="rogue-node-card" onClick={() => onChooseNode(node)}>
                    <h4>{node.name}</h4>
                    <p>{node.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {runActive && status === 'event' && pendingEvent && (
            <div className="rogue-event">
              <h3>{pendingEvent.name}</h3>
              <p>{pendingEvent.description}</p>
              <div className="rogue-event-options">
                {pendingEvent.options.map(option => (
                  <button key={option.id} className="rogue-event-card" onClick={() => onResolveEvent(option)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {runActive && status === 'ready' && (
            <div className="rogue-next">
              <h3>Next Encounter</h3>
              <p>
                {selectedNode?.type === 'boss' && 'Boss floor — expect a brutal fight.'}
                {selectedNode?.type === 'elite' && 'Elite floor — higher risk, higher reward.'}
                {selectedNode?.type === 'battle' && 'Standard floor — keep the momentum.'}
              </p>
              {activeModifiers.length > 0 && (
                <div className="rogue-modifiers">
                  {activeModifiers.map(mod => (
                    <span key={mod.id} className="rogue-modifier-chip">{mod.name}</span>
                  ))}
                </div>
              )}
              <button className="btn-primary" onClick={onEnterFloor}>
                Enter Floor {floor}
              </button>
            </div>
          )}

          {runActive && status === 'reward' && (
            <div className="rogue-reward">
              <h3>Floor Cleared</h3>
              <p>Choose one blessing to empower your run.</p>
              {reward && (
                <div className="rogue-reward-summary">
                  <span>+{reward.soft} Soft</span>
                  {reward.premium > 0 && <span>+{reward.premium} Premium</span>}
                  {reward.tokens > 0 && <span>+{reward.tokens} Tokens</span>}
                </div>
              )}
              <div className="rogue-blessings-grid">
                {pendingBlessings.map(blessing => (
                  <button
                    key={blessing.id}
                    className="rogue-blessing-card"
                    onClick={() => onChooseBlessing(blessing)}
                  >
                    <h4>{blessing.name}</h4>
                    <p>{blessing.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {runActive && status === 'complete' && (
            <div className="rogue-complete">
              <h3>Run Complete</h3>
              <p>You conquered the Simulated Curse. Claim your spoils and run again.</p>
              {reward && (
                <div className="rogue-reward-summary">
                  <span>+{reward.soft} Soft</span>
                  {reward.premium > 0 && <span>+{reward.premium} Premium</span>}
                  {reward.tokens > 0 && <span>+{reward.tokens} Tokens</span>}
                </div>
              )}
              <button className="btn-primary" onClick={onStart}>
                Start New Run
              </button>
            </div>
          )}

          {!runActive && status === 'failed' && (
            <div className="rogue-failed">
              <h3>Run Failed</h3>
              <p>The tower claimed your team. Recover and try again.</p>
              <button className="btn-primary" onClick={onStart} disabled={!hasTeam}>
                Start New Run
              </button>
            </div>
          )}
        </div>

        <div className="rogue-panel rogue-sidebar">
          <h2>Your Team</h2>
          {hasTeam ? (
            <div className="rogue-team-list">
              {selectedTeam.map(character => (
                <div key={character.id} className="rogue-team-card">
                  <span className="rogue-team-name">{character.name}</span>
                  <span className="rogue-team-rarity">{character.rarity}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rogue-muted">No team selected.</p>
          )}

          <div className="rogue-divider" />

          <h2>Blessings</h2>
          {blessings.length === 0 ? (
            <p className="rogue-muted">No blessings yet.</p>
          ) : (
            <div className="rogue-blessings-list">
              {blessings.map(blessing => (
                <div key={blessing.id} className="rogue-blessing-chip">
                  <strong>{blessing.name}</strong>
                  <span>{blessing.description}</span>
                </div>
              ))}
            </div>
          )}

          {synergies.length > 0 && (
            <>
              <div className="rogue-divider" />
              <h2>Synergies</h2>
              <div className="rogue-synergy-list">
                {synergies.map(synergy => (
                  <div key={synergy.id} className="rogue-synergy-chip">
                    <strong>{synergy.name}</strong>
                    <span>{synergy.description}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}

export default RogueMode
