import React, { useRef, useState } from 'react'
import { supabase } from './supabaseClient'

function ProfilePage({ profile, matchHistory, onBack, onProfileUpdate, titles, onSetActiveTitle }) {
  const displayName = profile?.display_name || 'Unknown'
  const accountLevel = profile?.account_level || 1
  const accountXp = profile?.account_xp || 0
  const rating = profile?.rating ?? 1000
  const xpNeeded = 100 + accountLevel * 25
  const xpPercent = Math.min(100, Math.floor((accountXp / xpNeeded) * 100))
  const wins = matchHistory.filter(match => match.result === 'win').length
  const losses = matchHistory.filter(match => match.result === 'lose').length
  const initials = displayName.slice(0, 2).toUpperCase()
  const activeTitle = (titles || []).find(title => title.active)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const handleAvatarSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !profile?.id) return

    setUploading(true)
    setUploadError('')

    const fileExt = file.name.split('.').pop()
    const filePath = `${profile.id}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setUploadError(uploadError.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
    const avatarUrl = data?.publicUrl || null

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', profile.id)

    if (updateError) {
      setUploadError(updateError.message)
      setUploading(false)
      return
    }

    onProfileUpdate?.({ ...profile, avatar_url: avatarUrl })
    setUploading(false)
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="profile-back" onClick={onBack}>← Back</button>
        <h1>Player Profile</h1>
      </div>

      <div className="profile-grid">
        <div className="profile-card primary">
          <div className="profile-hero">
            <div className="profile-avatar">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} />
              ) : (
                initials
              )}
            </div>
            <div>
              <h2>{displayName}</h2>
              <p className="profile-subtitle">
                Active • {activeTitle ? `Title: ${activeTitle.title_id.replace(/_/g, ' ')}` : 'Clanless'}
              </p>
              <div className="profile-avatar-actions">
                <button
                  className="profile-avatar-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload Avatar'}
                </button>
                {uploadError && <span className="profile-upload-error">{uploadError}</span>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="profile-avatar-input"
                  onChange={handleAvatarSelect}
                />
              </div>
            </div>
          </div>
          <div className="profile-stats">
            <div>
              <span>Account Level</span>
              <strong>Lv {accountLevel}</strong>
            </div>
            <div>
              <span>Rating</span>
              <strong>{rating}</strong>
            </div>
            <div>
              <span>Record</span>
              <strong>{wins}W / {losses}L</strong>
            </div>
          </div>
          <div className="profile-xp">
            <div className="profile-xp-text">Account XP {accountXp}/{xpNeeded}</div>
            <div className="profile-xp-bar">
              <div className="profile-xp-fill" style={{ width: `${xpPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="profile-card">
          <h3>Match History</h3>
          {matchHistory.length === 0 ? (
            <p className="profile-empty">No matches yet. Jump in and play!</p>
          ) : (
            <div className="match-list">
              {matchHistory.map(match => (
                <div key={match.id} className={`match-row ${match.result}`}>
                  <div className="match-result">{match.result === 'win' ? 'WIN' : 'LOSS'}</div>
                  <div className="match-meta">
                    <span>Turns: {match.turns ?? '-'}</span>
                    <span>Rating: {match.rating_delta >= 0 ? '+' : ''}{match.rating_delta}</span>
                  </div>
                  <div className="match-xp">
                    <span>Account +{match.account_xp_gain}</span>
                    <span>Team +{match.character_xp_gain}</span>
                  </div>
                  <div className="match-date">
                    {new Date(match.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="profile-card">
          <h3>Activity</h3>
          <div className="activity-grid">
            <div>
              <span>Status</span>
              <strong>Online</strong>
            </div>
            <div>
              <span>Clan</span>
              <strong>None</strong>
            </div>
            <div>
              <span>Favorite Mode</span>
              <strong>Unranked</strong>
            </div>
            <div>
              <span>Last Match</span>
              <strong>{matchHistory[0]?.result ? matchHistory[0].result.toUpperCase() : 'N/A'}</strong>
            </div>
          </div>
        </div>

        <div className="profile-card">
          <h3>Titles</h3>
          {(titles || []).length === 0 ? (
            <p className="profile-empty">No titles unlocked yet.</p>
          ) : (
            <div className="profile-title-grid">
              {(titles || []).map(title => (
                <button
                  key={title.title_id}
                  className={`profile-title-pill ${title.active ? 'active' : ''}`}
                  onClick={() => onSetActiveTitle?.(title.title_id)}
                  type="button"
                >
                  {title.title_id.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
