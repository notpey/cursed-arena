import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const toDateInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const toIsoString = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const emptyMission = {
  type: 'daily',
  condition: 'match_any',
  condition_value: '',
  title: '',
  description: '',
  target: 1,
  reward_soft: 0,
  reward_premium: 0,
  reward_shard_character_id: null,
  reward_shard_amount: 0,
  starts_at: null,
  ends_at: null,
}

const emptyBanner = {
  name: '',
  description: '',
  starts_at: null,
  ends_at: null,
}

const emptyBannerItem = {
  banner_id: null,
  item_type: 'character',
  character_id: null,
  shard_amount: 0,
  soft_currency: 0,
  premium_currency: 0,
  weight: 1,
}

const emptyOffer = {
  name: '',
  description: '',
  cost_soft: 0,
  cost_premium: 0,
  item_type: 'shards',
  character_id: null,
  shard_amount: 0,
  soft_currency: 0,
  premium_currency: 0,
  active: true,
}

const emptyCharacter = {
  name: '',
  rarity: 'SR',
  max_hp: 80,
  max_mana: 100,
  attack: 20,
  defense: 20,
  cursed_output: 20,
  cursed_resistance: 20,
  crit_chance: 0.05,
  portrait_url: '',
  card_art_url: '',
}

const emptySkill = {
  skill_type: 'ability',
  slot: 1,
  skill_key: '',
  name: '',
  description: '',
  payloadText: '',
  image_url: '',
}

function AdminPanel({ profile, onBack, characters = [] }) {
  const [activeTab, setActiveTab] = useState('players')
  const [profiles, setProfiles] = useState([])
  const [profileDraft, setProfileDraft] = useState(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [characterRows, setCharacterRows] = useState([])
  const [shardCharacterId, setShardCharacterId] = useState(characters[0]?.id || 1)
  const [shardAmount, setShardAmount] = useState('0')

  const [dbCharacters, setDbCharacters] = useState([])
  const [characterDraft, setCharacterDraft] = useState({ ...emptyCharacter })
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [skillRows, setSkillRows] = useState([])
  const [skillDraft, setSkillDraft] = useState({ ...emptySkill })
  const [skillError, setSkillError] = useState('')

  const [missions, setMissions] = useState([])
  const [missionDraft, setMissionDraft] = useState({ ...emptyMission })

  const [banners, setBanners] = useState([])
  const [bannerDraft, setBannerDraft] = useState({ ...emptyBanner })
  const [selectedBannerId, setSelectedBannerId] = useState('')
  const [bannerItems, setBannerItems] = useState([])
  const [bannerItemDraft, setBannerItemDraft] = useState({ ...emptyBannerItem })

  const [offers, setOffers] = useState([])
  const [offerDraft, setOfferDraft] = useState({ ...emptyOffer })

  const isAdmin = profile?.role === 'admin'

  const selectedProfile = useMemo(
    () => profiles.find(item => item.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  )

  useEffect(() => {
    if (!characters?.length) return
    if (!shardCharacterId) {
      setShardCharacterId(characters[0].id)
    }
  }, [characters, shardCharacterId])

  useEffect(() => {
    if (!isAdmin) return
    const loadProfiles = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, role, account_xp, account_level, rating, soft_currency, premium_currency')
        .order('display_name')
      setProfiles(data || [])
      if (!selectedProfileId && data?.length) {
        setSelectedProfileId(data[0].id)
      }
    }
    loadProfiles()
  }, [isAdmin, selectedProfileId])

  useEffect(() => {
    if (!selectedProfile) {
      setProfileDraft(null)
      return
    }
    setProfileDraft({ ...selectedProfile })
  }, [selectedProfile])

  useEffect(() => {
    if (!selectedCharacterId) {
      setCharacterDraft({ ...emptyCharacter })
      return
    }
    const match = dbCharacters.find(item => String(item.id) === String(selectedCharacterId))
    if (!match) {
      setCharacterDraft({ ...emptyCharacter })
      return
    }
    setCharacterDraft({
      id: match.id,
      name: match.name || '',
      rarity: match.rarity || 'SR',
      max_hp: match.max_hp ?? 80,
      max_mana: match.max_mana ?? 100,
      attack: match.attack ?? 20,
      defense: match.defense ?? 20,
      cursed_output: match.cursed_output ?? 20,
      cursed_resistance: match.cursed_resistance ?? 20,
      crit_chance: match.crit_chance ?? 0.05,
      portrait_url: match.portrait_url || '',
      card_art_url: match.card_art_url || '',
    })
  }, [dbCharacters, selectedCharacterId])

  useEffect(() => {
    if (!selectedProfileId) {
      setCharacterRows([])
      return
    }
    const loadCharacterProgress = async () => {
      const { data } = await supabase
        .from('character_progress')
        .select('character_id, level, xp, limit_break')
        .eq('user_id', selectedProfileId)
      setCharacterRows(data || [])
    }
    loadCharacterProgress()
  }, [selectedProfileId])

  useEffect(() => {
    if (!isAdmin) return
    const loadMissions = async () => {
      const { data } = await supabase.from('missions').select('*').order('id')
      setMissions(data || [])
    }
    loadMissions()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    const loadBanners = async () => {
      const { data } = await supabase.from('banners').select('*').order('id')
      setBanners(data || [])
      if (!selectedBannerId && data?.length) {
        setSelectedBannerId(String(data[0].id))
      }
    }
    loadBanners()
  }, [isAdmin, selectedBannerId])

  useEffect(() => {
    if (!selectedBannerId) {
      setBannerItems([])
      return
    }
    const loadBannerItems = async () => {
      const { data } = await supabase
        .from('banner_items')
        .select('*')
        .eq('banner_id', Number(selectedBannerId))
        .order('id')
      setBannerItems(data || [])
    }
    loadBannerItems()
  }, [selectedBannerId])

  useEffect(() => {
    if (!isAdmin) return
    const loadOffers = async () => {
      const { data } = await supabase.from('shop_offers').select('*').order('id')
      setOffers(data || [])
    }
    loadOffers()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    const loadCharacters = async () => {
      const { data } = await supabase
        .from('characters')
        .select('*')
        .order('id')
      setDbCharacters(data || [])
      if (!selectedCharacterId && data?.length) {
        setSelectedCharacterId(String(data[0].id))
      }
    }
    loadCharacters()
  }, [isAdmin, selectedCharacterId])

  useEffect(() => {
    if (!selectedCharacterId) {
      setSkillRows([])
      return
    }
    const loadSkills = async () => {
      const { data } = await supabase
        .from('character_skills')
        .select('*')
        .eq('character_id', Number(selectedCharacterId))
        .order('id')
      setSkillRows(data || [])
    }
    loadSkills()
  }, [selectedCharacterId])

  useEffect(() => {
    setSkillDraft({ ...emptySkill })
    setSkillError('')
  }, [selectedCharacterId])

  const handleProfileSave = async () => {
    if (!profileDraft) return
    const payload = {
      role: profileDraft.role,
      account_xp: Number(profileDraft.account_xp) || 0,
      account_level: Number(profileDraft.account_level) || 1,
      rating: Number(profileDraft.rating) || 0,
      soft_currency: Number(profileDraft.soft_currency) || 0,
      premium_currency: Number(profileDraft.premium_currency) || 0,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('profiles').update(payload).eq('id', profileDraft.id)
    setProfiles(prev =>
      prev.map(item => (item.id === profileDraft.id ? { ...item, ...payload } : item))
    )
  }

  const unlockedSet = useMemo(() => {
    return new Set(characterRows.map(row => row.character_id))
  }, [characterRows])

  const toggleCharacterUnlock = async (characterId, unlocked) => {
    if (!selectedProfileId) return
    if (unlocked) {
      await supabase.from('character_progress').upsert(
        {
          user_id: selectedProfileId,
          character_id: characterId,
          level: 1,
          xp: 0,
          limit_break: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,character_id' }
      )
    } else {
      await supabase
        .from('character_progress')
        .delete()
        .eq('user_id', selectedProfileId)
        .eq('character_id', characterId)
    }
    const { data } = await supabase
      .from('character_progress')
      .select('character_id, level, xp, limit_break')
      .eq('user_id', selectedProfileId)
    setCharacterRows(data || [])
  }

  const applyShardAmount = async () => {
    if (!selectedProfileId) return
    const amount = Math.max(0, Number(shardAmount) || 0)
    await supabase.from('user_inventory').upsert(
      {
        user_id: selectedProfileId,
        character_id: Number(shardCharacterId),
        shard_amount: amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,character_id' }
    )
  }

  const saveCharacter = async () => {
    const payload = {
      name: characterDraft.name.trim(),
      rarity: characterDraft.rarity,
      max_hp: Number(characterDraft.max_hp) || 1,
      max_mana: Number(characterDraft.max_mana) || 1,
      attack: Number(characterDraft.attack) || 1,
      defense: Number(characterDraft.defense) || 0,
      cursed_output: Number(characterDraft.cursed_output) || 0,
      cursed_resistance: Number(characterDraft.cursed_resistance) || 0,
      crit_chance: Number(characterDraft.crit_chance) || 0,
      portrait_url: characterDraft.portrait_url?.trim() || null,
      card_art_url: characterDraft.card_art_url?.trim() || null,
    }
    if (!payload.name) return

    if (characterDraft.id) {
      await supabase.from('characters').update(payload).eq('id', characterDraft.id)
    } else {
      await supabase.from('characters').insert(payload)
    }
    const { data } = await supabase.from('characters').select('*').order('id')
    setDbCharacters(data || [])
    setCharacterDraft({ ...emptyCharacter })
  }

  const deleteCharacter = async (characterId) => {
    await supabase.from('characters').delete().eq('id', characterId)
    const { data } = await supabase.from('characters').select('*').order('id')
    setDbCharacters(data || [])
    setCharacterDraft({ ...emptyCharacter })
    setSelectedCharacterId('')
  }

  const saveSkill = async () => {
    setSkillError('')
    let payloadData = {}
    if (skillDraft.payloadText?.trim()) {
      try {
        payloadData = JSON.parse(skillDraft.payloadText)
      } catch (error) {
        setSkillError('Payload must be valid JSON.')
        return
      }
    }
    const skillKey =
      skillDraft.skill_key?.trim() ||
      `${selectedCharacterId}-${skillDraft.skill_type}-${skillDraft.slot || 0}`

    const payload = {
      character_id: Number(selectedCharacterId),
      skill_key: skillKey,
      skill_type: skillDraft.skill_type,
      slot: skillDraft.skill_type === 'ability' ? Number(skillDraft.slot) || 1 : null,
      name: skillDraft.name.trim(),
      description: skillDraft.description.trim(),
      payload: payloadData,
      image_url: skillDraft.image_url?.trim() || null,
    }

    if (!payload.name || !payload.character_id) return

    if (skillDraft.id) {
      await supabase.from('character_skills').update(payload).eq('id', skillDraft.id)
    } else {
      await supabase.from('character_skills').insert(payload)
    }

    const { data } = await supabase
      .from('character_skills')
      .select('*')
      .eq('character_id', Number(selectedCharacterId))
      .order('id')
    setSkillRows(data || [])
    setSkillDraft({ ...emptySkill })
  }

  const deleteSkill = async (skillId) => {
    await supabase.from('character_skills').delete().eq('id', skillId)
    const { data } = await supabase
      .from('character_skills')
      .select('*')
      .eq('character_id', Number(selectedCharacterId))
      .order('id')
    setSkillRows(data || [])
    setSkillDraft({ ...emptySkill })
  }

  const saveMission = async () => {
    const payload = {
      ...missionDraft,
      target: Number(missionDraft.target) || 1,
      reward_soft: Number(missionDraft.reward_soft) || 0,
      reward_premium: Number(missionDraft.reward_premium) || 0,
      reward_shard_character_id: missionDraft.reward_shard_character_id
        ? Number(missionDraft.reward_shard_character_id)
        : null,
      reward_shard_amount: Number(missionDraft.reward_shard_amount) || 0,
      starts_at: toIsoString(missionDraft.starts_at),
      ends_at: toIsoString(missionDraft.ends_at),
    }
    if (missionDraft.id) {
      await supabase.from('missions').update(payload).eq('id', missionDraft.id)
    } else {
      await supabase.from('missions').insert(payload)
    }
    const { data } = await supabase.from('missions').select('*').order('id')
    setMissions(data || [])
    setMissionDraft({ ...emptyMission })
  }

  const deleteMission = async (missionId) => {
    await supabase.from('missions').delete().eq('id', missionId)
    const { data } = await supabase.from('missions').select('*').order('id')
    setMissions(data || [])
    setMissionDraft({ ...emptyMission })
  }

  const saveBanner = async () => {
    const payload = {
      ...bannerDraft,
      starts_at: toIsoString(bannerDraft.starts_at),
      ends_at: toIsoString(bannerDraft.ends_at),
    }
    if (bannerDraft.id) {
      await supabase.from('banners').update(payload).eq('id', bannerDraft.id)
    } else {
      await supabase.from('banners').insert(payload)
    }
    const { data } = await supabase.from('banners').select('*').order('id')
    setBanners(data || [])
    setBannerDraft({ ...emptyBanner })
  }

  const deleteBanner = async (bannerId) => {
    await supabase.from('banners').delete().eq('id', bannerId)
    const { data } = await supabase.from('banners').select('*').order('id')
    setBanners(data || [])
    setBannerDraft({ ...emptyBanner })
  }

  const saveBannerItem = async () => {
    const payload = {
      ...bannerItemDraft,
      banner_id: Number(selectedBannerId || bannerItemDraft.banner_id),
      character_id: bannerItemDraft.character_id ? Number(bannerItemDraft.character_id) : null,
      shard_amount: Number(bannerItemDraft.shard_amount) || 0,
      soft_currency: Number(bannerItemDraft.soft_currency) || 0,
      premium_currency: Number(bannerItemDraft.premium_currency) || 0,
      weight: Number(bannerItemDraft.weight) || 1,
    }
    if (bannerItemDraft.id) {
      await supabase.from('banner_items').update(payload).eq('id', bannerItemDraft.id)
    } else {
      await supabase.from('banner_items').insert(payload)
    }
    const { data } = await supabase
      .from('banner_items')
      .select('*')
      .eq('banner_id', Number(selectedBannerId))
      .order('id')
    setBannerItems(data || [])
    setBannerItemDraft({ ...emptyBannerItem })
  }

  const deleteBannerItem = async (itemId) => {
    await supabase.from('banner_items').delete().eq('id', itemId)
    const { data } = await supabase
      .from('banner_items')
      .select('*')
      .eq('banner_id', Number(selectedBannerId))
      .order('id')
    setBannerItems(data || [])
    setBannerItemDraft({ ...emptyBannerItem })
  }

  const saveOffer = async () => {
    const payload = {
      ...offerDraft,
      cost_soft: Number(offerDraft.cost_soft) || 0,
      cost_premium: Number(offerDraft.cost_premium) || 0,
      character_id: offerDraft.character_id ? Number(offerDraft.character_id) : null,
      shard_amount: Number(offerDraft.shard_amount) || 0,
      soft_currency: Number(offerDraft.soft_currency) || 0,
      premium_currency: Number(offerDraft.premium_currency) || 0,
      active: Boolean(offerDraft.active),
    }
    if (offerDraft.id) {
      await supabase.from('shop_offers').update(payload).eq('id', offerDraft.id)
    } else {
      await supabase.from('shop_offers').insert(payload)
    }
    const { data } = await supabase.from('shop_offers').select('*').order('id')
    setOffers(data || [])
    setOfferDraft({ ...emptyOffer })
  }

  const deleteOffer = async (offerId) => {
    await supabase.from('shop_offers').delete().eq('id', offerId)
    const { data } = await supabase.from('shop_offers').select('*').order('id')
    setOffers(data || [])
    setOfferDraft({ ...emptyOffer })
  }

  if (!isAdmin) {
    return (
      <div className="meta-page">
        <div className="meta-header">
          <button className="profile-back" onClick={onBack}>← Back</button>
          <h1>Admin Control Panel</h1>
        </div>
        <div className="admin-panel admin-empty">
          You do not have admin access.
        </div>
      </div>
    )
  }

  return (
    <div className="meta-page">
      <div className="meta-header">
        <button className="profile-back" onClick={onBack}>← Back</button>
        <h1>Admin Control Panel</h1>
      </div>
      <div className="admin-tabs">
        {['players', 'characters', 'missions', 'banners', 'shop'].map(tab => (
          <button
            key={tab}
            type="button"
            className={`admin-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'players' && (
        <div className="admin-grid">
          <div className="admin-list">
            <h2>Players</h2>
            <select
              className="admin-select"
              value={selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
            >
              {profiles.map(item => (
                <option key={item.id} value={item.id}>
                  {item.display_name || item.id}
                </option>
              ))}
            </select>
            {profileDraft && (
              <div className="admin-form">
                <label>
                  <span>Role</span>
                  <select
                    value={profileDraft.role || 'player'}
                    onChange={(event) => setProfileDraft(prev => ({ ...prev, role: event.target.value }))}
                  >
                    <option value="player">player</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label>
                  <span>Account Level</span>
                  <input
                    type="number"
                    value={profileDraft.account_level ?? 1}
                    onChange={(event) => setProfileDraft(prev => ({ ...prev, account_level: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Account XP</span>
                  <input
                    type="number"
                    value={profileDraft.account_xp ?? 0}
                    onChange={(event) => setProfileDraft(prev => ({ ...prev, account_xp: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Rating</span>
                  <input
                    type="number"
                    value={profileDraft.rating ?? 1000}
                    onChange={(event) => setProfileDraft(prev => ({ ...prev, rating: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Soft Currency</span>
                  <input
                    type="number"
                    value={profileDraft.soft_currency ?? 0}
                    onChange={(event) => setProfileDraft(prev => ({ ...prev, soft_currency: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Premium Currency</span>
                  <input
                    type="number"
                    value={profileDraft.premium_currency ?? 0}
                    onChange={(event) => setProfileDraft(prev => ({ ...prev, premium_currency: event.target.value }))}
                  />
                </label>
                <button className="admin-btn" onClick={handleProfileSave}>Save Player</button>
              </div>
            )}
          </div>

          <div className="admin-detail">
            <h2>Character Unlocks</h2>
            <div className="admin-character-grid">
              {characters.map(character => {
                const unlocked = unlockedSet.has(character.id)
                return (
                  <label key={character.id} className={`admin-character ${unlocked ? 'unlocked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={unlocked}
                      onChange={(event) => toggleCharacterUnlock(character.id, event.target.checked)}
                    />
                    <span>{character.name}</span>
                  </label>
                )
              })}
            </div>
            <div className="admin-form compact">
              <h3>Set Shards</h3>
              <label>
                <span>Character</span>
                <select
                  value={shardCharacterId}
                  onChange={(event) => setShardCharacterId(event.target.value)}
                >
                  {characters.map(character => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Shard Amount</span>
                <input
                  type="number"
                  value={shardAmount}
                  onChange={(event) => setShardAmount(event.target.value)}
                />
              </label>
              <button className="admin-btn" onClick={applyShardAmount}>Apply Shards</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'characters' && (
        <div className="admin-grid">
          <div className="admin-list">
            <h2>Characters</h2>
            <div className="admin-scroll">
              {dbCharacters.map(character => (
                <button
                  key={character.id}
                  className={`admin-list-item ${String(selectedCharacterId) === String(character.id) ? 'active' : ''}`}
                  onClick={() => setSelectedCharacterId(String(character.id))}
                >
                  <strong>{character.name}</strong>
                  <span>{character.rarity}</span>
                </button>
              ))}
            </div>
            <button className="admin-btn" onClick={() => {
              setSelectedCharacterId('')
              setCharacterDraft({ ...emptyCharacter })
              setSkillDraft({ ...emptySkill })
            }}>
              New Character
            </button>
          </div>
          <div className="admin-detail">
            <h2>{characterDraft.id ? 'Edit Character' : 'New Character'}</h2>
            <div className="admin-form">
              <label>
                <span>Name</span>
                <input value={characterDraft.name} onChange={(event) => setCharacterDraft(prev => ({ ...prev, name: event.target.value }))} />
              </label>
              <label>
                <span>Rarity</span>
                <select value={characterDraft.rarity} onChange={(event) => setCharacterDraft(prev => ({ ...prev, rarity: event.target.value }))}>
                  <option value="UR">UR</option>
                  <option value="SSR">SSR</option>
                  <option value="SR">SR</option>
                  <option value="R">R</option>
                </select>
              </label>
              <label>
                <span>Max HP</span>
                <input type="number" value={characterDraft.max_hp} onChange={(event) => setCharacterDraft(prev => ({ ...prev, max_hp: event.target.value }))} />
              </label>
              <label>
                <span>Max Cursed Energy</span>
                <input type="number" value={characterDraft.max_mana} onChange={(event) => setCharacterDraft(prev => ({ ...prev, max_mana: event.target.value }))} />
              </label>
              <label>
                <span>Attack</span>
                <input type="number" value={characterDraft.attack} onChange={(event) => setCharacterDraft(prev => ({ ...prev, attack: event.target.value }))} />
              </label>
              <label>
                <span>Defense</span>
                <input type="number" value={characterDraft.defense} onChange={(event) => setCharacterDraft(prev => ({ ...prev, defense: event.target.value }))} />
              </label>
              <label>
                <span>Cursed Energy Output</span>
                <input type="number" value={characterDraft.cursed_output} onChange={(event) => setCharacterDraft(prev => ({ ...prev, cursed_output: event.target.value }))} />
              </label>
              <label>
                <span>Cursed Resistance</span>
                <input type="number" value={characterDraft.cursed_resistance} onChange={(event) => setCharacterDraft(prev => ({ ...prev, cursed_resistance: event.target.value }))} />
              </label>
              <label>
                <span>Crit Chance</span>
                <input type="number" step="0.01" value={characterDraft.crit_chance} onChange={(event) => setCharacterDraft(prev => ({ ...prev, crit_chance: event.target.value }))} />
              </label>
              <label>
                <span>Portrait URL</span>
                <input value={characterDraft.portrait_url} onChange={(event) => setCharacterDraft(prev => ({ ...prev, portrait_url: event.target.value }))} />
              </label>
              <label>
                <span>Card Art URL</span>
                <input value={characterDraft.card_art_url} onChange={(event) => setCharacterDraft(prev => ({ ...prev, card_art_url: event.target.value }))} />
              </label>
              <div className="admin-actions">
                <button className="admin-btn" onClick={saveCharacter}>Save Character</button>
                {characterDraft.id && (
                  <button className="admin-btn danger" onClick={() => deleteCharacter(characterDraft.id)}>Delete</button>
                )}
              </div>
            </div>

            {characterDraft.id && (
              <div className="admin-subsection">
                <h3>Techniques</h3>
                <div className="admin-scroll">
                  {skillRows.map(skill => {
                    const typeLabel = skill.skill_type === 'ultimate'
                      ? 'domain'
                      : skill.skill_type === 'ability'
                        ? 'technique'
                        : skill.skill_type
                    return (
                      <button
                        key={skill.id}
                        className={`admin-list-item ${skillDraft.id === skill.id ? 'active' : ''}`}
                        onClick={() => setSkillDraft({
                          id: skill.id,
                          skill_type: skill.skill_type,
                          slot: skill.slot ?? 1,
                          skill_key: skill.skill_key || '',
                          name: skill.name || '',
                          description: skill.description || '',
                          payloadText: JSON.stringify(skill.payload || {}, null, 2),
                          image_url: skill.image_url || '',
                        })}
                      >
                        <strong>{skill.name || skill.skill_key}</strong>
                        <span>{typeLabel}{skill.slot ? ` • Slot ${skill.slot}` : ''}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="admin-form">
                  <label>
                    <span>Technique Type</span>
                    <select value={skillDraft.skill_type} onChange={(event) => setSkillDraft(prev => ({ ...prev, skill_type: event.target.value }))}>
                      <option value="ability">technique</option>
                      <option value="ultimate">domain</option>
                      <option value="passive">passive</option>
                    </select>
                  </label>
                  {skillDraft.skill_type === 'ability' && (
                    <label>
                      <span>Slot</span>
                      <input type="number" value={skillDraft.slot} onChange={(event) => setSkillDraft(prev => ({ ...prev, slot: event.target.value }))} />
                    </label>
                  )}
                  <label>
                    <span>Technique Key</span>
                    <input value={skillDraft.skill_key} onChange={(event) => setSkillDraft(prev => ({ ...prev, skill_key: event.target.value }))} />
                  </label>
                  <label>
                    <span>Name</span>
                    <input value={skillDraft.name} onChange={(event) => setSkillDraft(prev => ({ ...prev, name: event.target.value }))} />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea value={skillDraft.description} onChange={(event) => setSkillDraft(prev => ({ ...prev, description: event.target.value }))} />
                  </label>
                  <label>
                    <span>Payload (JSON)</span>
                    <textarea className="admin-code" value={skillDraft.payloadText} onChange={(event) => setSkillDraft(prev => ({ ...prev, payloadText: event.target.value }))} />
                  </label>
                  <label>
                    <span>Image URL</span>
                    <input value={skillDraft.image_url} onChange={(event) => setSkillDraft(prev => ({ ...prev, image_url: event.target.value }))} />
                  </label>
                  {skillError && <div className="admin-error">{skillError}</div>}
                  <div className="admin-actions">
                    <button className="admin-btn" onClick={saveSkill}>Save Technique</button>
                    {skillDraft.id && (
                      <button className="admin-btn danger" onClick={() => deleteSkill(skillDraft.id)}>Delete</button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'missions' && (
        <div className="admin-grid">
          <div className="admin-list">
            <h2>Missions</h2>
            <div className="admin-scroll">
              {missions.map(mission => (
                <button
                  key={mission.id}
                  className={`admin-list-item ${missionDraft.id === mission.id ? 'active' : ''}`}
                  onClick={() => setMissionDraft({
                    ...mission,
                    starts_at: toDateInput(mission.starts_at),
                    ends_at: toDateInput(mission.ends_at),
                  })}
                >
                  <strong>{mission.title}</strong>
                  <span>{mission.type}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="admin-detail">
            <h2>{missionDraft.id ? 'Edit Mission' : 'New Mission'}</h2>
            <div className="admin-form">
              <label>
                <span>Type</span>
                <select value={missionDraft.type} onChange={(event) => setMissionDraft(prev => ({ ...prev, type: event.target.value }))}>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="limited">limited</option>
                </select>
              </label>
              <label>
                <span>Condition</span>
                <input value={missionDraft.condition} onChange={(event) => setMissionDraft(prev => ({ ...prev, condition: event.target.value }))} />
              </label>
              <label>
                <span>Condition Value</span>
                <input value={missionDraft.condition_value || ''} onChange={(event) => setMissionDraft(prev => ({ ...prev, condition_value: event.target.value }))} />
              </label>
              <label>
                <span>Title</span>
                <input value={missionDraft.title} onChange={(event) => setMissionDraft(prev => ({ ...prev, title: event.target.value }))} />
              </label>
              <label>
                <span>Description</span>
                <textarea value={missionDraft.description} onChange={(event) => setMissionDraft(prev => ({ ...prev, description: event.target.value }))} />
              </label>
              <label>
                <span>Target</span>
                <input type="number" value={missionDraft.target} onChange={(event) => setMissionDraft(prev => ({ ...prev, target: event.target.value }))} />
              </label>
              <label>
                <span>Reward Soft</span>
                <input type="number" value={missionDraft.reward_soft} onChange={(event) => setMissionDraft(prev => ({ ...prev, reward_soft: event.target.value }))} />
              </label>
              <label>
                <span>Reward Premium</span>
                <input type="number" value={missionDraft.reward_premium} onChange={(event) => setMissionDraft(prev => ({ ...prev, reward_premium: event.target.value }))} />
              </label>
              <label>
                <span>Shard Character ID</span>
                <input type="number" value={missionDraft.reward_shard_character_id || ''} onChange={(event) => setMissionDraft(prev => ({ ...prev, reward_shard_character_id: event.target.value }))} />
              </label>
              <label>
                <span>Shard Amount</span>
                <input type="number" value={missionDraft.reward_shard_amount} onChange={(event) => setMissionDraft(prev => ({ ...prev, reward_shard_amount: event.target.value }))} />
              </label>
              <label>
                <span>Starts At</span>
                <input type="datetime-local" value={missionDraft.starts_at || ''} onChange={(event) => setMissionDraft(prev => ({ ...prev, starts_at: event.target.value }))} />
              </label>
              <label>
                <span>Ends At</span>
                <input type="datetime-local" value={missionDraft.ends_at || ''} onChange={(event) => setMissionDraft(prev => ({ ...prev, ends_at: event.target.value }))} />
              </label>
              <div className="admin-actions">
                <button className="admin-btn" onClick={saveMission}>Save</button>
                {missionDraft.id && (
                  <button className="admin-btn danger" onClick={() => deleteMission(missionDraft.id)}>Delete</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'banners' && (
        <div className="admin-grid">
          <div className="admin-list">
            <h2>Banners</h2>
            <div className="admin-scroll">
              {banners.map(banner => (
                <button
                  key={banner.id}
                  className={`admin-list-item ${bannerDraft.id === banner.id ? 'active' : ''}`}
                  onClick={() => {
                    setBannerDraft({
                      ...banner,
                      starts_at: toDateInput(banner.starts_at),
                      ends_at: toDateInput(banner.ends_at),
                    })
                    setSelectedBannerId(String(banner.id))
                  }}
                >
                  <strong>{banner.name}</strong>
                  <span>{banner.id}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="admin-detail">
            <h2>{bannerDraft.id ? 'Edit Banner' : 'New Banner'}</h2>
            <div className="admin-form">
              <label>
                <span>Name</span>
                <input value={bannerDraft.name} onChange={(event) => setBannerDraft(prev => ({ ...prev, name: event.target.value }))} />
              </label>
              <label>
                <span>Description</span>
                <textarea value={bannerDraft.description} onChange={(event) => setBannerDraft(prev => ({ ...prev, description: event.target.value }))} />
              </label>
              <label>
                <span>Starts At</span>
                <input type="datetime-local" value={bannerDraft.starts_at || ''} onChange={(event) => setBannerDraft(prev => ({ ...prev, starts_at: event.target.value }))} />
              </label>
              <label>
                <span>Ends At</span>
                <input type="datetime-local" value={bannerDraft.ends_at || ''} onChange={(event) => setBannerDraft(prev => ({ ...prev, ends_at: event.target.value }))} />
              </label>
              <div className="admin-actions">
                <button className="admin-btn" onClick={saveBanner}>Save</button>
                {bannerDraft.id && (
                  <button className="admin-btn danger" onClick={() => deleteBanner(bannerDraft.id)}>Delete</button>
                )}
              </div>
            </div>

            <div className="admin-subsection">
              <h3>Banner Items</h3>
              <div className="admin-scroll">
                {bannerItems.map(item => (
                  <button
                    key={item.id}
                    className={`admin-list-item ${bannerItemDraft.id === item.id ? 'active' : ''}`}
                    onClick={() => setBannerItemDraft({ ...item })}
                  >
                    <strong>{item.item_type}</strong>
                    <span>Weight {item.weight}</span>
                  </button>
                ))}
              </div>
              <div className="admin-form">
                <label>
                  <span>Item Type</span>
                  <select value={bannerItemDraft.item_type} onChange={(event) => setBannerItemDraft(prev => ({ ...prev, item_type: event.target.value }))}>
                    <option value="character">character</option>
                    <option value="shards">shards</option>
                    <option value="currency">currency</option>
                    <option value="item">item</option>
                    <option value="title">title</option>
                  </select>
                </label>
                <label>
                  <span>Character ID</span>
                  <input type="number" value={bannerItemDraft.character_id || ''} onChange={(event) => setBannerItemDraft(prev => ({ ...prev, character_id: event.target.value }))} />
                </label>
                <label>
                  <span>Shard Amount</span>
                  <input type="number" value={bannerItemDraft.shard_amount} onChange={(event) => setBannerItemDraft(prev => ({ ...prev, shard_amount: event.target.value }))} />
                </label>
                <label>
                  <span>Soft Currency</span>
                  <input type="number" value={bannerItemDraft.soft_currency} onChange={(event) => setBannerItemDraft(prev => ({ ...prev, soft_currency: event.target.value }))} />
                </label>
                <label>
                  <span>Premium Currency</span>
                  <input type="number" value={bannerItemDraft.premium_currency} onChange={(event) => setBannerItemDraft(prev => ({ ...prev, premium_currency: event.target.value }))} />
                </label>
                <label>
                  <span>Weight</span>
                  <input type="number" value={bannerItemDraft.weight} onChange={(event) => setBannerItemDraft(prev => ({ ...prev, weight: event.target.value }))} />
                </label>
                <div className="admin-actions">
                  <button className="admin-btn" onClick={saveBannerItem}>Save Item</button>
                  {bannerItemDraft.id && (
                    <button className="admin-btn danger" onClick={() => deleteBannerItem(bannerItemDraft.id)}>Delete</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'shop' && (
        <div className="admin-grid">
          <div className="admin-list">
            <h2>Shop Offers</h2>
            <div className="admin-scroll">
              {offers.map(offer => (
                <button
                  key={offer.id}
                  className={`admin-list-item ${offerDraft.id === offer.id ? 'active' : ''}`}
                  onClick={() => setOfferDraft({ ...offer })}
                >
                  <strong>{offer.name}</strong>
                  <span>{offer.active ? 'Active' : 'Inactive'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="admin-detail">
            <h2>{offerDraft.id ? 'Edit Offer' : 'New Offer'}</h2>
            <div className="admin-form">
              <label>
                <span>Name</span>
                <input value={offerDraft.name} onChange={(event) => setOfferDraft(prev => ({ ...prev, name: event.target.value }))} />
              </label>
              <label>
                <span>Description</span>
                <textarea value={offerDraft.description} onChange={(event) => setOfferDraft(prev => ({ ...prev, description: event.target.value }))} />
              </label>
              <label>
                <span>Cost Soft</span>
                <input type="number" value={offerDraft.cost_soft} onChange={(event) => setOfferDraft(prev => ({ ...prev, cost_soft: event.target.value }))} />
              </label>
              <label>
                <span>Cost Premium</span>
                <input type="number" value={offerDraft.cost_premium} onChange={(event) => setOfferDraft(prev => ({ ...prev, cost_premium: event.target.value }))} />
              </label>
              <label>
                <span>Item Type</span>
                <input value={offerDraft.item_type} onChange={(event) => setOfferDraft(prev => ({ ...prev, item_type: event.target.value }))} />
              </label>
              <label>
                <span>Character ID</span>
                <input type="number" value={offerDraft.character_id || ''} onChange={(event) => setOfferDraft(prev => ({ ...prev, character_id: event.target.value }))} />
              </label>
              <label>
                <span>Shard Amount</span>
                <input type="number" value={offerDraft.shard_amount} onChange={(event) => setOfferDraft(prev => ({ ...prev, shard_amount: event.target.value }))} />
              </label>
              <label>
                <span>Soft Currency</span>
                <input type="number" value={offerDraft.soft_currency} onChange={(event) => setOfferDraft(prev => ({ ...prev, soft_currency: event.target.value }))} />
              </label>
              <label>
                <span>Premium Currency</span>
                <input type="number" value={offerDraft.premium_currency} onChange={(event) => setOfferDraft(prev => ({ ...prev, premium_currency: event.target.value }))} />
              </label>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(offerDraft.active)}
                  onChange={(event) => setOfferDraft(prev => ({ ...prev, active: event.target.checked }))}
                />
                <span>Active</span>
              </label>
              <div className="admin-actions">
                <button className="admin-btn" onClick={saveOffer}>Save</button>
                {offerDraft.id && (
                  <button className="admin-btn danger" onClick={() => deleteOffer(offerDraft.id)}>Delete</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel
