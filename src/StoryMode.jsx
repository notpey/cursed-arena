import React, { useMemo } from 'react'

function StoryMode({
  chapter,
  completedNodes,
  activeNodeId,
  onSelectNode,
  onCompleteNode,
  onStartBattle,
  storyResult,
  onClearResult,
  onClaimRewards,
  rewardsClaimed,
}) {
  const nodes = chapter?.nodes || []
  const activeNode = nodes.find(node => node.id === activeNodeId) || nodes[0]

  const isUnlocked = (nodeId) => {
    if (!nodes.length) return false
    const index = nodes.findIndex(node => node.id === nodeId)
    if (index <= 0) return true
    return completedNodes.includes(nodes[index - 1].id)
  }

  const nodeStatus = useMemo(() => {
    const status = {}
    nodes.forEach(node => {
      status[node.id] = completedNodes.includes(node.id)
        ? 'completed'
        : isUnlocked(node.id)
        ? 'available'
        : 'locked'
    })
    return status
  }, [nodes, completedNodes])

  const canClaimRewards = completedNodes.length === nodes.length

  if (!chapter) {
    return (
      <div className="story-container">
        <div className="story-panel">Story mode not available.</div>
      </div>
    )
  }

  return (
    <div className="story-container">
      <div className="story-header">
        <div>
          <h1>{chapter.title}</h1>
          <span className="story-subtitle">{chapter.subtitle}</span>
        </div>
        <div className="story-progress">
          <span>{completedNodes.length}/{nodes.length} nodes cleared</span>
        </div>
      </div>

      <div className="story-layout">
        <div className="story-map">
          <div className="story-map-title">Chapter Map</div>
          <div className="story-map-nodes">
            {nodes.map((node, index) => (
              <button
                key={node.id}
                type="button"
                className={`story-node ${nodeStatus[node.id]} ${activeNodeId === node.id ? 'active' : ''}`}
                disabled={nodeStatus[node.id] === 'locked'}
                onClick={() => onSelectNode(node.id)}
              >
                {nodeStatus[node.id] === 'completed' && (
                  <div className="story-node-badge">✓</div>
                )}
                <div className="story-node-id">{node.id}</div>
                <div className="story-node-title">{node.title}</div>
                <div className={`story-node-type ${node.type}`}>
                  {node.type === 'battle' ? 'Battle' : 'Story'}
                </div>
                {index < nodes.length - 1 && <div className="story-node-link" />}
              </button>
            ))}
          </div>
        </div>

        <div className="story-detail">
          <div className="story-detail-header">
            <div>
              <h2>{activeNode?.title}</h2>
              <div className="story-location">{activeNode?.location}</div>
            </div>
            <div className={`story-status ${nodeStatus[activeNode?.id] || 'locked'}`}>
              {nodeStatus[activeNode?.id] === 'completed' ? 'Completed' : nodeStatus[activeNode?.id] === 'available' ? 'Available' : 'Locked'}
            </div>
          </div>

          {storyResult && storyResult.nodeId === activeNode?.id && (
            <div className={`story-result ${storyResult.result}`}>
              <strong>{storyResult.result === 'win' ? 'Objective Complete' : 'Defeat'}</strong>
              <p>{storyResult.result === 'win' ? 'Return to the story to continue.' : 'Try the battle again when you are ready.'}</p>
              <button className="mode-btn primary" onClick={onClearResult}>Continue</button>
            </div>
          )}

          {activeNode?.type === 'story' && (
            <div className="story-scroll">
              <div className="story-scene">
                {activeNode.lines?.map((line, index) => (
                  <div key={`${activeNode.id}-${index}`} className="story-line">
                    <span className="story-speaker">{line.speaker}</span>
                    <span className="story-text">{line.text}</span>
                  </div>
                ))}
                {activeNode.system && (
                  <div className="story-system">System: {activeNode.system}</div>
                )}
              </div>
              <div className="story-actions">
                <button
                  className="mode-btn primary"
                  onClick={() => onCompleteNode(activeNode.id)}
                  disabled={nodeStatus[activeNode.id] !== 'available'}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {activeNode?.type === 'battle' && (
            <div className="story-scroll">
              <div className="story-scene">
                {activeNode.intro?.map((line, index) => (
                  <div key={`${activeNode.id}-intro-${index}`} className="story-text">{line}</div>
                ))}
                {activeNode.battle && (
                  <div className="story-battle-info">
                    <div><strong>Mode:</strong> {activeNode.battle.mode}</div>
                    <div><strong>Objective:</strong> {activeNode.battle.objective}</div>
                    {activeNode.battle.type === 'survival' && (
                      <div><strong>Condition:</strong> Survive {activeNode.battle.turnLimit} turns.</div>
                    )}
                    {activeNode.battle.unlocks?.length > 0 && (
                      <div><strong>Unlock:</strong> {activeNode.battle.unlocks.join(', ')}</div>
                    )}
                  </div>
                )}
                {activeNode.battle?.prompts?.length > 0 && (
                  <div className="story-prompts">
                    {activeNode.battle.prompts.map((prompt, index) => (
                      <div key={`${activeNode.id}-prompt-${index}`} className="story-prompt">• {prompt}</div>
                    ))}
                  </div>
                )}
                {activeNode.outro?.length > 0 && (
                  <div className="story-outro">
                    <div className="story-outro-title">After Battle</div>
                    {activeNode.outro.map((line, index) => (
                      <div key={`${activeNode.id}-outro-${index}`} className="story-text">{line}</div>
                    ))}
                  </div>
                )}
              </div>
              <div className="story-actions">
                <button
                  className="mode-btn primary"
                  onClick={() => onStartBattle(activeNode)}
                  disabled={nodeStatus[activeNode.id] !== 'available'}
                >
                  Start Battle
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="story-footer">
        <div className="story-rewards">
          <h3>Chapter Rewards</h3>
          <div className="story-reward-grid">
            {chapter.rewards.map((reward, index) => (
              <div key={`${reward.label}-${index}`} className="story-reward-card">
                <span className="story-reward-label">{reward.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="story-preview">
          <h3>Next Chapter Preview</h3>
          {chapter.preview.map((line, index) => (
            <div key={`${chapter.id}-preview-${index}`} className="story-preview-line">{line}</div>
          ))}
          <button
            className="mode-btn ghost"
            onClick={onClaimRewards}
            disabled={rewardsClaimed || !canClaimRewards}
          >
            {rewardsClaimed ? 'Rewards Claimed' : canClaimRewards ? 'Claim Chapter Rewards' : 'Complete Chapter to Claim'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default StoryMode
