import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import ConfirmDialog from './ConfirmDialog'
import { ToastContainer } from './Toast'
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
  damage: 0,
  manaCost: 0,
  targetType: 'single',
  damageType: 'physical',
  statusEffect: '',
  statusChance: 0,
  statusDuration: 0,
  image_url: '',
}

// Collapsible Section Component
function CollapsibleSection({ title, defaultOpen = true, children, badge }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={`collapsible-section ${isOpen ? 'open' : ''}`}>
      <button
        className="collapsible-header"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="collapsible-title">
          {title}
          {badge && <span className="section-badge">{badge}</span>}
        </span>
        <span className="collapsible-icon">{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && <div className="collapsible-content">{children}</div>}
    </div>
  )
}

// Tooltip Component
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false)

  return (
    <span className="tooltip-wrapper" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && <div className="tooltip-bubble">{text}</div>}
    </span>
  )
}

// Image Preview Component
function ImagePreview({ url, alt }) {
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  if (!url) {
    return (
      <div className="image-preview empty">
        <span>No image</span>
      </div>
    )
  }

  return (
    <div className="image-preview">
      {loading && <div className="image-loading">Loading...</div>}
      {error && <div className="image-error">Failed to load</div>}
      {!error && (
        <img
          src={url}
          alt={alt}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true)
            setLoading(false)
          }}
          style={{ display: loading ? 'none' : 'block' }}
        />
      )}
    </div>
  )
}

function AdminPanel({ profile, onBack, characters = [] }) {
  const [activeTab, setActiveTab] = useState('players')
  const [searchQuery, setSearchQuery] = useState('')
  const [toasts, setToasts] = useState([])
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false })

  // Players
  const [profiles, setProfiles] = useState([])
  const [profileDraft, setProfileDraft] = useState(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [characterRows, setCharacterRows] = useState([])
  const [shardCharacterId, setShardCharacterId] = useState(characters[0]?.id || 1)
  const [shardAmount, setShardAmount] = useState('0')

  // Characters
  const [dbCharacters, setDbCharacters] = useState([])
  const [characterDraft, setCharacterDraft] = useState({ ...emptyCharacter })
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [skillRows, setSkillRows] = useState([])
  const [skillDraft, setSkillDraft] = useState({ ...emptySkill })

  // Missions
  const [missions, setMissions] = useState([])
  const [missionDraft, setMissionDraft] = useState({ ...emptyMission })

  // Banners
  const [banners, setBanners] = useState([])
  const [bannerDraft, setBannerDraft] = useState({ ...emptyBanner })
  const [selectedBannerId, setSelectedBannerId] = useState('')
  const [bannerItems, setBannerItems] = useState([])
  const [bannerItemDraft, setBannerItemDraft] = useState({ ...emptyBannerItem })

  // Shop
  const [offers, setOffers] = useState([])
  const [offerDraft, setOfferDraft] = useState({ ...emptyOffer })

  const isAdmin = profile?.role === 'admin'

  const getRarityDefaults = (rarity) => {
    const key = String(rarity || '').toUpperCase()
    switch (key) {
      case 'SSR':
        return { weight: 2, shards: 20 }
      case 'SR':
        return { weight: 5, shards: 15 }
      case 'R':
        return { weight: 10, shards: 10 }
      case 'N':
        return { weight: 14, shards: 8 }
      default:
        return { weight: 8, shards: 12 }
    }
  }

  const resolveCharacterId = (value) => {
    if (value) return Number(value)
    return characters[0]?.id ? Number(characters[0].id) : null
  }

  const applyBannerPreset = (preset) => {
    const bannerId = Number(selectedBannerId || bannerItemDraft.banner_id) || null
    const characterId = resolveCharacterId(bannerItemDraft.character_id)
    const character = characters.find(c => c.id === Number(characterId))
    const defaults = getRarityDefaults(character?.rarity)

    if ((preset === 'character' || preset === 'shards') && !characterId) {
      showToast('Select a character first', 'error')
      return
    }

    if (preset === 'character') {
      setBannerItemDraft({
        ...emptyBannerItem,
        banner_id: bannerId,
        item_type: 'character',
        character_id: characterId,
        weight: defaults.weight,
        shard_amount: 0,
        soft_currency: 0,
        premium_currency: 0,
      })
      return
    }

    if (preset === 'shards') {
      setBannerItemDraft({
        ...emptyBannerItem,
        banner_id: bannerId,
        item_type: 'shards',
        character_id: characterId,
        shard_amount: defaults.shards,
        weight: Math.max(1, Math.round(defaults.weight * 1.5)),
        soft_currency: 0,
        premium_currency: 0,
      })
      return
    }

    if (preset === 'soft') {
      setBannerItemDraft({
        ...emptyBannerItem,
        banner_id: bannerId,
        item_type: 'currency',
        character_id: null,
        shard_amount: 0,
        soft_currency: 1000,
        premium_currency: 0,
        weight: 8,
      })
      return
    }

    if (preset === 'premium') {
      setBannerItemDraft({
        ...emptyBannerItem,
        banner_id: bannerId,
        item_type: 'currency',
        character_id: null,
        shard_amount: 0,
        soft_currency: 0,
        premium_currency: 5,
        weight: 4,
      })
    }
  }

  const applyOfferPreset = (preset) => {
    const characterId = resolveCharacterId(offerDraft.character_id)
    if (preset.includes('shards') && !characterId) {
      showToast('Select a character first', 'error')
      return
    }

    if (preset === 'shards-small') {
      setOfferDraft(prev => ({
        ...prev,
        item_type: 'shards',
        character_id: characterId,
        shard_amount: 10,
        soft_currency: 0,
        premium_currency: 0,
      }))
      return
    }

    if (preset === 'shards-large') {
      setOfferDraft(prev => ({
        ...prev,
        item_type: 'shards',
        character_id: characterId,
        shard_amount: 30,
        soft_currency: 0,
        premium_currency: 0,
      }))
      return
    }

    if (preset === 'soft-pack') {
      setOfferDraft(prev => ({
        ...prev,
        item_type: 'currency',
        character_id: null,
        shard_amount: 0,
        soft_currency: 5000,
        premium_currency: 0,
      }))
      return
    }

    if (preset === 'premium-pack') {
      setOfferDraft(prev => ({
        ...prev,
        item_type: 'currency',
        character_id: null,
        shard_amount: 0,
        soft_currency: 0,
        premium_currency: 10,
      }))
    }
  }

  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
  }

  const selectedProfile = useMemo(
    () => profiles.find(item => item.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  )

  // Filtered lists based on search
  const filteredProfiles = useMemo(() => {
    if (!searchQuery) return profiles
    const query = searchQuery.toLowerCase()
    return profiles.filter(p =>
      (p.display_name || '').toLowerCase().includes(query) ||
      (p.role || '').toLowerCase().includes(query)
    )
  }, [profiles, searchQuery])

  const filteredCharacters = useMemo(() => {
    if (!searchQuery) return dbCharacters
    const query = searchQuery.toLowerCase()
    return dbCharacters.filter(c =>
      (c.name || '').toLowerCase().includes(query) ||
      (c.rarity || '').toLowerCase().includes(query)
    )
  }, [dbCharacters, searchQuery])

  const filteredMissions = useMemo(() => {
    if (!searchQuery) return missions
    const query = searchQuery.toLowerCase()
    return missions.filter(m =>
      (m.title || '').toLowerCase().includes(query) ||
      (m.type || '').toLowerCase().includes(query)
    )
  }, [missions, searchQuery])

  const filteredBanners = useMemo(() => {
    if (!searchQuery) return banners
    const query = searchQuery.toLowerCase()
    return banners.filter(b =>
      (b.name || '').toLowerCase().includes(query)
    )
  }, [banners, searchQuery])

  const filteredOffers = useMemo(() => {
    if (!searchQuery) return offers
    const query = searchQuery.toLowerCase()
    return offers.filter(o =>
      (o.name || '').toLowerCase().includes(query) ||
      (o.description || '').toLowerCase().includes(query)
    )
  }, [offers, searchQuery])

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
  }, [selectedCharacterId])

  // Clear search when changing tabs
  useEffect(() => {
    setSearchQuery('')
  }, [activeTab])

  const handleProfileSave = async () => {
    if (!profileDraft) return
    try {
      const payload = {
        role: profileDraft.role,
        account_xp: Number(profileDraft.account_xp) || 0,
        account_level: Number(profileDraft.account_level) || 1,
        rating: Number(profileDraft.rating) || 0,
        soft_currency: Number(profileDraft.soft_currency) || 0,
        premium_currency: Number(profileDraft.premium_currency) || 0,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('profiles').update(payload).eq('id', profileDraft.id)
      if (error) throw error

      setProfiles(prev =>
        prev.map(item => (item.id === profileDraft.id ? { ...item, ...payload } : item))
      )
      showToast('Player profile updated successfully')
    } catch (error) {
      showToast('Failed to save player profile', 'error')
      console.error(error)
    }
  }

  const unlockedSet = useMemo(() => {
    return new Set(characterRows.map(row => row.character_id))
  }, [characterRows])

  const toggleCharacterUnlock = async (characterId, unlocked) => {
    if (!selectedProfileId) return
    try {
      if (unlocked) {
        const { error } = await supabase.from('character_progress').upsert(
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
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('character_progress')
          .delete()
          .eq('user_id', selectedProfileId)
          .eq('character_id', characterId)
        if (error) throw error
      }
      const { data } = await supabase
        .from('character_progress')
        .select('character_id, level, xp, limit_break')
        .eq('user_id', selectedProfileId)
      setCharacterRows(data || [])
      showToast(unlocked ? 'Character unlocked' : 'Character locked')
    } catch (error) {
      showToast('Failed to update character unlock', 'error')
      console.error(error)
    }
  }

  const applyShardAmount = async () => {
    if (!selectedProfileId) return
    try {
      const amount = Math.max(0, Number(shardAmount) || 0)
      const { error } = await supabase.from('user_inventory').upsert(
        {
          user_id: selectedProfileId,
          character_id: Number(shardCharacterId),
          shard_amount: amount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,character_id' }
      )
      if (error) throw error
      showToast(`Set shards to ${amount}`)
    } catch (error) {
      showToast('Failed to update shards', 'error')
      console.error(error)
    }
  }

  const saveCharacter = async () => {
    try {
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
      if (!payload.name) {
        showToast('Character name is required', 'warning')
        return
      }

      if (characterDraft.id) {
        const { error } = await supabase.from('characters').update(payload).eq('id', characterDraft.id)
        if (error) throw error
        showToast('Character updated successfully')
      } else {
        const { error } = await supabase.from('characters').insert(payload)
        if (error) throw error
        showToast('Character created successfully')
      }
      const { data } = await supabase.from('characters').select('*').order('id')
      setDbCharacters(data || [])
      setCharacterDraft({ ...emptyCharacter })
    } catch (error) {
      showToast('Failed to save character', 'error')
      console.error(error)
    }
  }

  const deleteCharacter = async (characterId, characterName) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Character',
      message: `Are you sure you want to delete "${characterName}"? This will also delete all associated skills and player progress.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('characters').delete().eq('id', characterId)
          if (error) throw error

          const { data } = await supabase.from('characters').select('*').order('id')
          setDbCharacters(data || [])
          setCharacterDraft({ ...emptyCharacter })
          setSelectedCharacterId('')
          showToast('Character deleted')
        } catch (error) {
          showToast('Failed to delete character', 'error')
          console.error(error)
        }
      },
      danger: true,
    })
  }

  const saveSkill = async () => {
    try {
      // Build payload from form fields instead of JSON
      const payloadData = {
        damage: Number(skillDraft.damage) || 0,
        manaCost: Number(skillDraft.manaCost) || 0,
        targetType: skillDraft.targetType || 'single',
        damageType: skillDraft.damageType || 'physical',
      }

      // Add status effect if specified
      if (skillDraft.statusEffect) {
        payloadData.statusEffect = skillDraft.statusEffect
        payloadData.statusChance = Number(skillDraft.statusChance) || 0
        payloadData.statusDuration = Number(skillDraft.statusDuration) || 0
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

      if (!payload.name || !payload.character_id) {
        showToast('Skill name is required', 'warning')
        return
      }

      if (skillDraft.id) {
        const { error } = await supabase.from('character_skills').update(payload).eq('id', skillDraft.id)
        if (error) throw error
        showToast('Skill updated successfully')
      } else {
        const { error } = await supabase.from('character_skills').insert(payload)
        if (error) throw error
        showToast('Skill created successfully')
      }

      const { data } = await supabase
        .from('character_skills')
        .select('*')
        .eq('character_id', Number(selectedCharacterId))
        .order('id')
      setSkillRows(data || [])
      setSkillDraft({ ...emptySkill })
    } catch (error) {
      showToast('Failed to save skill', 'error')
      console.error(error)
    }
  }

  const deleteSkill = async (skillId, skillName) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Skill',
      message: `Are you sure you want to delete "${skillName}"?`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('character_skills').delete().eq('id', skillId)
          if (error) throw error

          const { data } = await supabase
            .from('character_skills')
            .select('*')
            .eq('character_id', Number(selectedCharacterId))
            .order('id')
          setSkillRows(data || [])
          setSkillDraft({ ...emptySkill })
          showToast('Skill deleted')
        } catch (error) {
          showToast('Failed to delete skill', 'error')
          console.error(error)
        }
      },
      danger: true,
    })
  }

  const saveMission = async () => {
    try {
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
        const { error } = await supabase.from('missions').update(payload).eq('id', missionDraft.id)
        if (error) throw error
        showToast('Mission updated successfully')
      } else {
        const { error } = await supabase.from('missions').insert(payload)
        if (error) throw error
        showToast('Mission created successfully')
      }

      const { data } = await supabase.from('missions').select('*').order('id')
      setMissions(data || [])
      setMissionDraft({ ...emptyMission })
    } catch (error) {
      showToast('Failed to save mission', 'error')
      console.error(error)
    }
  }

  const deleteMission = async (missionId, missionTitle) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Mission',
      message: `Are you sure you want to delete "${missionTitle}"?`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('missions').delete().eq('id', missionId)
          if (error) throw error

          const { data } = await supabase.from('missions').select('*').order('id')
          setMissions(data || [])
          setMissionDraft({ ...emptyMission })
          showToast('Mission deleted')
        } catch (error) {
          showToast('Failed to delete mission', 'error')
          console.error(error)
        }
      },
      danger: true,
    })
  }

  const saveBanner = async () => {
    try {
      const payload = {
        ...bannerDraft,
        starts_at: toIsoString(bannerDraft.starts_at),
        ends_at: toIsoString(bannerDraft.ends_at),
      }

      if (bannerDraft.id) {
        const { error } = await supabase.from('banners').update(payload).eq('id', bannerDraft.id)
        if (error) throw error
        showToast('Banner updated successfully')
      } else {
        const { error } = await supabase.from('banners').insert(payload)
        if (error) throw error
        showToast('Banner created successfully')
      }

      const { data } = await supabase.from('banners').select('*').order('id')
      setBanners(data || [])
      setBannerDraft({ ...emptyBanner })
    } catch (error) {
      showToast('Failed to save banner', 'error')
      console.error(error)
    }
  }

  const deleteBanner = async (bannerId, bannerName) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Banner',
      message: `Are you sure you want to delete "${bannerName}"? This will also delete all banner items.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('banners').delete().eq('id', bannerId)
          if (error) throw error

          const { data } = await supabase.from('banners').select('*').order('id')
          setBanners(data || [])
          setBannerDraft({ ...emptyBanner })
          showToast('Banner deleted')
        } catch (error) {
          showToast('Failed to delete banner', 'error')
          console.error(error)
        }
      },
      danger: true,
    })
  }

  const saveBannerItem = async () => {
    try {
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
        const { error } = await supabase.from('banner_items').update(payload).eq('id', bannerItemDraft.id)
        if (error) throw error
        showToast('Banner item updated successfully')
      } else {
        const { error } = await supabase.from('banner_items').insert(payload)
        if (error) throw error
        showToast('Banner item created successfully')
      }

      const { data } = await supabase
        .from('banner_items')
        .select('*')
        .eq('banner_id', Number(selectedBannerId))
        .order('id')
      setBannerItems(data || [])
      setBannerItemDraft({ ...emptyBannerItem })
    } catch (error) {
      showToast('Failed to save banner item', 'error')
      console.error(error)
    }
  }

  const deleteBannerItem = async (itemId) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Banner Item',
      message: 'Are you sure you want to delete this banner item?',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('banner_items').delete().eq('id', itemId)
          if (error) throw error

          const { data } = await supabase
            .from('banner_items')
            .select('*')
            .eq('banner_id', Number(selectedBannerId))
            .order('id')
          setBannerItems(data || [])
          setBannerItemDraft({ ...emptyBannerItem })
          showToast('Banner item deleted')
        } catch (error) {
          showToast('Failed to delete banner item', 'error')
          console.error(error)
        }
      },
      danger: true,
    })
  }

  const saveOffer = async () => {
    try {
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
        const { error } = await supabase.from('shop_offers').update(payload).eq('id', offerDraft.id)
        if (error) throw error
        showToast('Shop offer updated successfully')
      } else {
        const { error } = await supabase.from('shop_offers').insert(payload)
        if (error) throw error
        showToast('Shop offer created successfully')
      }

      const { data } = await supabase.from('shop_offers').select('*').order('id')
      setOffers(data || [])
      setOfferDraft({ ...emptyOffer })
    } catch (error) {
      showToast('Failed to save shop offer', 'error')
      console.error(error)
    }
  }

  const deleteOffer = async (offerId, offerName) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Shop Offer',
      message: `Are you sure you want to delete "${offerName}"?`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('shop_offers').delete().eq('id', offerId)
          if (error) throw error

          const { data } = await supabase.from('shop_offers').select('*').order('id')
          setOffers(data || [])
          setOfferDraft({ ...emptyOffer })
          showToast('Shop offer deleted')
        } catch (error) {
          showToast('Failed to delete offer', 'error')
          console.error(error)
        }
      },
      danger: true,
    })
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
    <div className="admin-panel-wrapper">
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false })}
        danger={confirmDialog.danger}
      />

      {/* Sidebar Navigation */}
      <div className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h2>Admin Panel</h2>
        </div>
        <nav className="admin-nav">
          <button
            className={`admin-nav-item ${activeTab === 'players' ? 'active' : ''}`}
            onClick={() => setActiveTab('players')}
          >
            <span className="nav-icon">👥</span>
            <span className="nav-label">Players</span>
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'characters' ? 'active' : ''}`}
            onClick={() => setActiveTab('characters')}
          >
            <span className="nav-icon">⚔️</span>
            <span className="nav-label">Characters</span>
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'missions' ? 'active' : ''}`}
            onClick={() => setActiveTab('missions')}
          >
            <span className="nav-icon">📋</span>
            <span className="nav-label">Missions</span>
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'banners' ? 'active' : ''}`}
            onClick={() => setActiveTab('banners')}
          >
            <span className="nav-icon">✨</span>
            <span className="nav-label">Banners</span>
          </button>
          <button
            className={`admin-nav-item ${activeTab === 'shop' ? 'active' : ''}`}
            onClick={() => setActiveTab('shop')}
          >
            <span className="nav-icon">🏪</span>
            <span className="nav-label">Shop</span>
          </button>
        </nav>
        <button className="admin-sidebar-back" onClick={onBack}>
          <span>←</span>
          <span>Exit Admin</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="admin-content">
        {/* Header with search */}
        <div className="admin-content-header">
          <h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1>
          <div className="admin-search">
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-search-input"
            />
            {searchQuery && (
              <button className="admin-search-clear" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>
        </div>

        {/* Players Tab */}
        {activeTab === 'players' && (
          <div className="admin-layout">
            <div className="admin-panel-list">
              <div className="admin-panel-list-header">
                <h3>All Players</h3>
                <span className="item-count">{filteredProfiles.length}</span>
              </div>
              <div className="admin-panel-list-items">
                {filteredProfiles.map(item => (
                  <button
                    key={item.id}
                    className={`admin-card-item ${selectedProfileId === item.id ? 'active' : ''}`}
                    onClick={() => setSelectedProfileId(item.id)}
                  >
                    <div className="item-header">
                      <strong>{item.display_name || 'Unnamed'}</strong>
                      <span className={`badge ${item.role === 'admin' ? 'badge-admin' : 'badge-player'}`}>
                        {item.role}
                      </span>
                    </div>
                    <div className="item-meta">
                      <span>Level {item.account_level}</span>
                      <span>•</span>
                      <span>Rating {item.rating}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-panel-detail">
              {profileDraft ? (
                <>
                  <div className="admin-detail-header">
                    <h2>{profileDraft.display_name || 'Unnamed Player'}</h2>
                  </div>

                  <CollapsibleSection title="Account Settings" defaultOpen={true}>
                    <div className="admin-form">
                      <label className="form-field">
                        <span className="field-label">
                          Role
                          <Tooltip text="Admin role grants access to this panel">
                            <span className="help-icon">?</span>
                          </Tooltip>
                        </span>
                        <select
                          className="form-input"
                          value={profileDraft.role || 'player'}
                          onChange={(e) => setProfileDraft(prev => ({ ...prev, role: e.target.value }))}
                        >
                          <option value="player">Player</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>

                      <div className="form-row">
                        <label className="form-field">
                          <span className="field-label">Account Level</span>
                          <input
                            className="form-input"
                            type="number"
                            value={profileDraft.account_level ?? 1}
                            onChange={(e) => setProfileDraft(prev => ({ ...prev, account_level: e.target.value }))}
                          />
                        </label>

                        <label className="form-field">
                          <span className="field-label">Account XP</span>
                          <input
                            className="form-input"
                            type="number"
                            value={profileDraft.account_xp ?? 0}
                            onChange={(e) => setProfileDraft(prev => ({ ...prev, account_xp: e.target.value }))}
                          />
                        </label>
                      </div>

                      <label className="form-field">
                        <span className="field-label">Rating</span>
                        <input
                          className="form-input"
                          type="number"
                          value={profileDraft.rating ?? 1000}
                          onChange={(e) => setProfileDraft(prev => ({ ...prev, rating: e.target.value }))}
                        />
                      </label>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Currency" defaultOpen={true}>
                    <div className="admin-form">
                      <label className="form-field">
                        <span className="field-label">
                          💰 Soft Currency
                          <Tooltip text="Earned through gameplay, used for basic purchases">
                            <span className="help-icon">?</span>
                          </Tooltip>
                        </span>
                        <input
                          className="form-input"
                          type="number"
                          value={profileDraft.soft_currency ?? 0}
                          onChange={(e) => setProfileDraft(prev => ({ ...prev, soft_currency: e.target.value }))}
                        />
                      </label>

                      <label className="form-field">
                        <span className="field-label">
                          💎 Premium Currency
                          <Tooltip text="Premium currency for gacha and special items">
                            <span className="help-icon">?</span>
                          </Tooltip>
                        </span>
                        <input
                          className="form-input"
                          type="number"
                          value={profileDraft.premium_currency ?? 0}
                          onChange={(e) => setProfileDraft(prev => ({ ...prev, premium_currency: e.target.value }))}
                        />
                      </label>
                    </div>
                  </CollapsibleSection>

                  <div className="form-actions">
                    <button className="btn-primary" onClick={handleProfileSave}>
                      Save Changes
                    </button>
                  </div>

                  <CollapsibleSection title="Character Unlocks" defaultOpen={false} badge={unlockedSet.size}>
                    <div className="character-unlock-grid">
                      {characters.map(character => {
                        const unlocked = unlockedSet.has(character.id)
                        return (
                          <label key={character.id} className={`unlock-card ${unlocked ? 'unlocked' : 'locked'}`}>
                            <input
                              type="checkbox"
                              checked={unlocked}
                              onChange={(e) => toggleCharacterUnlock(character.id, e.target.checked)}
                            />
                            <span className="unlock-name">{character.name}</span>
                            <span className={`unlock-rarity rarity-${character.rarity?.toLowerCase()}`}>
                              {character.rarity}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Set Shards" defaultOpen={false}>
                    <div className="admin-form">
                      <label className="form-field">
                        <span className="field-label">Character</span>
                        <select
                          className="form-input"
                          value={shardCharacterId}
                          onChange={(e) => setShardCharacterId(e.target.value)}
                        >
                          {characters.map(character => (
                            <option key={character.id} value={character.id}>
                              {character.name} ({character.rarity})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="form-field">
                        <span className="field-label">Shard Amount</span>
                        <input
                          className="form-input"
                          type="number"
                          value={shardAmount}
                          onChange={(e) => setShardAmount(e.target.value)}
                        />
                      </label>

                      <button className="btn-primary" onClick={applyShardAmount}>
                        Apply Shards
                      </button>
                    </div>
                  </CollapsibleSection>
                </>
              ) : (
                <div className="admin-empty-state">
                  <p>Select a player to view details</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Characters Tab */}
        {activeTab === 'characters' && (
          <div className="admin-layout">
            <div className="admin-panel-list">
              <div className="admin-panel-list-header">
                <h3>All Characters</h3>
                <span className="item-count">{filteredCharacters.length}</span>
              </div>
              <div className="admin-panel-list-items">
                {filteredCharacters.map(character => (
                  <button
                    key={character.id}
                    className={`admin-card-item ${String(selectedCharacterId) === String(character.id) ? 'active' : ''}`}
                    onClick={() => setSelectedCharacterId(String(character.id))}
                  >
                    <div className="item-header">
                      <strong>{character.name}</strong>
                      <span className={`badge rarity-${character.rarity?.toLowerCase()}`}>
                        {character.rarity}
                      </span>
                    </div>
                    <div className="item-meta">
                      <span>HP {character.max_hp}</span>
                      <span>•</span>
                      <span>ATK {character.attack}</span>
                    </div>
                  </button>
                ))}
              </div>
              <button
                className="btn-secondary btn-block"
                onClick={() => {
                  setSelectedCharacterId('')
                  setCharacterDraft({ ...emptyCharacter })
                  setSkillDraft({ ...emptySkill })
                }}
              >
                + New Character
              </button>
            </div>

            <div className="admin-panel-detail">
              <div className="admin-detail-header">
                <h2>{characterDraft.id ? `Edit: ${characterDraft.name}` : 'New Character'}</h2>
              </div>

              <CollapsibleSection title="Basic Info" defaultOpen={true}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label required">Name</span>
                    <input
                      className="form-input"
                      value={characterDraft.name}
                      onChange={(e) => setCharacterDraft(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Character name"
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label required">Rarity</span>
                    <select
                      className="form-input"
                      value={characterDraft.rarity}
                      onChange={(e) => setCharacterDraft(prev => ({ ...prev, rarity: e.target.value }))}
                    >
                      <option value="UR">UR (Ultra Rare)</option>
                      <option value="SSR">SSR (Super Super Rare)</option>
                      <option value="SR">SR (Super Rare)</option>
                      <option value="R">R (Rare)</option>
                    </select>
                  </label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Combat Stats" defaultOpen={false}>
                <div className="admin-form">
                  <div className="form-row">
                    <label className="form-field">
                      <span className="field-label">Max HP</span>
                      <input
                        className="form-input"
                        type="number"
                        value={characterDraft.max_hp}
                        onChange={(e) => setCharacterDraft(prev => ({ ...prev, max_hp: e.target.value }))}
                      />
                    </label>

                    <label className="form-field">
                      <span className="field-label">Max Cursed Energy</span>
                      <input
                        className="form-input"
                        type="number"
                        value={characterDraft.max_mana}
                        onChange={(e) => setCharacterDraft(prev => ({ ...prev, max_mana: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label className="form-field">
                      <span className="field-label">Attack</span>
                      <input
                        className="form-input"
                        type="number"
                        value={characterDraft.attack}
                        onChange={(e) => setCharacterDraft(prev => ({ ...prev, attack: e.target.value }))}
                      />
                    </label>

                    <label className="form-field">
                      <span className="field-label">Defense</span>
                      <input
                        className="form-input"
                        type="number"
                        value={characterDraft.defense}
                        onChange={(e) => setCharacterDraft(prev => ({ ...prev, defense: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label className="form-field">
                      <span className="field-label">Cursed Output</span>
                      <input
                        className="form-input"
                        type="number"
                        value={characterDraft.cursed_output}
                        onChange={(e) => setCharacterDraft(prev => ({ ...prev, cursed_output: e.target.value }))}
                      />
                    </label>

                    <label className="form-field">
                      <span className="field-label">Cursed Resistance</span>
                      <input
                        className="form-input"
                        type="number"
                        value={characterDraft.cursed_resistance}
                        onChange={(e) => setCharacterDraft(prev => ({ ...prev, cursed_resistance: e.target.value }))}
                      />
                    </label>
                  </div>

                  <label className="form-field">
                    <span className="field-label">
                      Crit Chance
                      <Tooltip text="Value between 0 and 1 (e.g., 0.05 = 5%)">
                        <span className="help-icon">?</span>
                      </Tooltip>
                    </span>
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      value={characterDraft.crit_chance}
                      onChange={(e) => setCharacterDraft(prev => ({ ...prev, crit_chance: e.target.value }))}
                    />
                  </label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Visual Assets" defaultOpen={false}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label">Portrait URL</span>
                    <input
                      className="form-input"
                      value={characterDraft.portrait_url}
                      onChange={(e) => setCharacterDraft(prev => ({ ...prev, portrait_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </label>
                  <ImagePreview url={characterDraft.portrait_url} alt="Portrait" />

                  <label className="form-field">
                    <span className="field-label">Card Art URL</span>
                    <input
                      className="form-input"
                      value={characterDraft.card_art_url}
                      onChange={(e) => setCharacterDraft(prev => ({ ...prev, card_art_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </label>
                  <ImagePreview url={characterDraft.card_art_url} alt="Card Art" />
                </div>
              </CollapsibleSection>

              <div className="form-actions">
                <button className="btn-primary" onClick={saveCharacter}>
                  {characterDraft.id ? 'Save Changes' : 'Create Character'}
                </button>
                {characterDraft.id && (
                  <button
                    className="btn-danger"
                    onClick={() => deleteCharacter(characterDraft.id, characterDraft.name)}
                  >
                    Delete Character
                  </button>
                )}
              </div>

              {characterDraft.id && (
                <CollapsibleSection title="Techniques" defaultOpen={false} badge={skillRows.length}>
                  <div className="subsection-list">
                    {skillRows.map(skill => {
                      const typeLabel = skill.skill_type === 'ultimate'
                        ? 'Domain'
                        : skill.skill_type === 'ability'
                          ? 'Technique'
                          : 'Passive'
                      return (
                        <button
                          key={skill.id}
                          className={`subsection-item ${skillDraft.id === skill.id ? 'active' : ''}`}
                          onClick={() => {
                            const payload = skill.payload || {}
                            setSkillDraft({
                              id: skill.id,
                              skill_type: skill.skill_type,
                              slot: skill.slot ?? 1,
                              skill_key: skill.skill_key || '',
                              name: skill.name || '',
                              description: skill.description || '',
                              damage: payload.damage || 0,
                              manaCost: payload.manaCost || 0,
                              targetType: payload.targetType || 'single',
                              damageType: payload.damageType || 'physical',
                              statusEffect: payload.statusEffect || '',
                              statusChance: payload.statusChance || 0,
                              statusDuration: payload.statusDuration || 0,
                              image_url: skill.image_url || '',
                            })
                          }}
                        >
                          <div className="subsection-item-header">
                            <strong>{skill.name || skill.skill_key}</strong>
                            <span className="subsection-badge">{typeLabel}</span>
                          </div>
                          <div className="subsection-item-meta">
                            {skill.slot && <span>Slot {skill.slot}</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="admin-form">
                    <h4>{skillDraft.id ? 'Edit Technique' : 'New Technique'}</h4>

                    <label className="form-field">
                      <span className="field-label required">Technique Type</span>
                      <select
                        className="form-input"
                        value={skillDraft.skill_type}
                        onChange={(e) => setSkillDraft(prev => ({ ...prev, skill_type: e.target.value }))}
                      >
                        <option value="ability">Technique (active skill)</option>
                        <option value="ultimate">Domain (ultimate skill)</option>
                        <option value="passive">Passive (always active)</option>
                      </select>
                    </label>

                    {skillDraft.skill_type === 'ability' && (
                      <label className="form-field">
                        <span className="field-label">Slot</span>
                        <select
                          className="form-input"
                          value={skillDraft.slot}
                          onChange={(e) => setSkillDraft(prev => ({ ...prev, slot: e.target.value }))}
                        >
                          <option value="1">Slot 1</option>
                          <option value="2">Slot 2</option>
                          <option value="3">Slot 3</option>
                          <option value="4">Slot 4</option>
                        </select>
                      </label>
                    )}

                    <label className="form-field">
                      <span className="field-label required">Name</span>
                      <input
                        className="form-input"
                        value={skillDraft.name}
                        onChange={(e) => setSkillDraft(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Technique name"
                      />
                    </label>

                    <label className="form-field">
                      <span className="field-label">Description</span>
                      <textarea
                        className="form-textarea"
                        value={skillDraft.description}
                        onChange={(e) => setSkillDraft(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe what this technique does"
                      />
                    </label>

                    <div className="form-row">
                      <label className="form-field">
                        <span className="field-label">Damage</span>
                        <input
                          className="form-input"
                          type="number"
                          value={skillDraft.damage}
                          onChange={(e) => setSkillDraft(prev => ({ ...prev, damage: e.target.value }))}
                        />
                      </label>

                      <label className="form-field">
                        <span className="field-label">Cursed Energy Cost</span>
                        <input
                          className="form-input"
                          type="number"
                          value={skillDraft.manaCost}
                          onChange={(e) => setSkillDraft(prev => ({ ...prev, manaCost: e.target.value }))}
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label className="form-field">
                        <span className="field-label">Target Type</span>
                        <select
                          className="form-input"
                          value={skillDraft.targetType}
                          onChange={(e) => setSkillDraft(prev => ({ ...prev, targetType: e.target.value }))}
                        >
                          <option value="single">Single Enemy</option>
                          <option value="all">All Enemies</option>
                          <option value="self">Self</option>
                          <option value="ally">Single Ally</option>
                        </select>
                      </label>

                      <label className="form-field">
                        <span className="field-label">Damage Type</span>
                        <select
                          className="form-input"
                          value={skillDraft.damageType}
                          onChange={(e) => setSkillDraft(prev => ({ ...prev, damageType: e.target.value }))}
                        >
                          <option value="physical">Physical</option>
                          <option value="cursed">Cursed Energy</option>
                          <option value="true">True Damage</option>
                        </select>
                      </label>
                    </div>

                    <label className="form-field">
                      <span className="field-label">Status Effect (optional)</span>
                      <select
                        className="form-input"
                        value={skillDraft.statusEffect}
                        onChange={(e) => setSkillDraft(prev => ({ ...prev, statusEffect: e.target.value }))}
                      >
                        <option value="">None</option>
                        <option value="stun">Stun</option>
                        <option value="burn">Burn</option>
                        <option value="poison">Poison</option>
                        <option value="freeze">Freeze</option>
                        <option value="slow">Slow</option>
                      </select>
                    </label>

                    {skillDraft.statusEffect && (
                      <div className="form-row">
                        <label className="form-field">
                          <span className="field-label">Effect Chance (0-1)</span>
                          <input
                            className="form-input"
                            type="number"
                            step="0.1"
                            value={skillDraft.statusChance}
                            onChange={(e) => setSkillDraft(prev => ({ ...prev, statusChance: e.target.value }))}
                          />
                        </label>

                        <label className="form-field">
                          <span className="field-label">Duration (turns)</span>
                          <input
                            className="form-input"
                            type="number"
                            value={skillDraft.statusDuration}
                            onChange={(e) => setSkillDraft(prev => ({ ...prev, statusDuration: e.target.value }))}
                          />
                        </label>
                      </div>
                    )}

                    <label className="form-field">
                      <span className="field-label">Image URL (optional)</span>
                      <input
                        className="form-input"
                        value={skillDraft.image_url}
                        onChange={(e) => setSkillDraft(prev => ({ ...prev, image_url: e.target.value }))}
                        placeholder="https://..."
                      />
                    </label>

                    <div className="form-actions">
                      <button className="btn-primary" onClick={saveSkill}>
                        {skillDraft.id ? 'Save Technique' : 'Create Technique'}
                      </button>
                      {skillDraft.id && (
                        <button
                          className="btn-danger"
                          onClick={() => deleteSkill(skillDraft.id, skillDraft.name)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </CollapsibleSection>
              )}
            </div>
          </div>
        )}

        {/* Missions Tab */}
        {activeTab === 'missions' && (
          <div className="admin-layout">
            <div className="admin-panel-list">
              <div className="admin-panel-list-header">
                <h3>All Missions</h3>
                <span className="item-count">{filteredMissions.length}</span>
              </div>
              <div className="admin-panel-list-items">
                {filteredMissions.map(mission => (
                  <button
                    key={mission.id}
                    className={`admin-card-item ${missionDraft.id === mission.id ? 'active' : ''}`}
                    onClick={() => setMissionDraft({
                      ...mission,
                      starts_at: toDateInput(mission.starts_at),
                      ends_at: toDateInput(mission.ends_at),
                    })}
                  >
                    <div className="item-header">
                      <strong>{mission.title}</strong>
                      <span className={`badge badge-${mission.type}`}>
                        {mission.type}
                      </span>
                    </div>
                    <div className="item-meta">
                      <span>Target: {mission.target}</span>
                    </div>
                  </button>
                ))}
              </div>
              <button
                className="btn-secondary btn-block"
                onClick={() => setMissionDraft({ ...emptyMission })}
              >
                + New Mission
              </button>
            </div>

            <div className="admin-panel-detail">
              <div className="admin-detail-header">
                <h2>{missionDraft.id ? 'Edit Mission' : 'New Mission'}</h2>
              </div>

              <CollapsibleSection title="Basic Info" defaultOpen={true}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label required">Type</span>
                    <select
                      className="form-input"
                      value={missionDraft.type}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, type: e.target.value }))}
                    >
                      <option value="daily">Daily (resets every day)</option>
                      <option value="weekly">Weekly (resets every week)</option>
                      <option value="limited">Limited (one-time only)</option>
                    </select>
                  </label>

                  <label className="form-field">
                    <span className="field-label required">Title</span>
                    <input
                      className="form-input"
                      value={missionDraft.title}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Mission title"
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label">Description</span>
                    <textarea
                      className="form-textarea"
                      value={missionDraft.description}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe the mission objective"
                    />
                  </label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Conditions" defaultOpen={false}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label">
                      Condition
                      <Tooltip text="The type of action required (e.g., win_battle, use_ability, etc.)">
                        <span className="help-icon">?</span>
                      </Tooltip>
                    </span>
                    <input
                      className="form-input"
                      value={missionDraft.condition}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, condition: e.target.value }))}
                      placeholder="e.g., match_any, win_battle"
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label">
                      Condition Value
                      <Tooltip text="Additional parameter for the condition">
                        <span className="help-icon">?</span>
                      </Tooltip>
                    </span>
                    <input
                      className="form-input"
                      value={missionDraft.condition_value || ''}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, condition_value: e.target.value }))}
                      placeholder="Optional value"
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label">Target</span>
                    <input
                      className="form-input"
                      type="number"
                      value={missionDraft.target}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, target: e.target.value }))}
                    />
                  </label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Rewards" defaultOpen={false}>
                <div className="admin-form">
                  <div className="form-row">
                    <label className="form-field">
                      <span className="field-label">💰 Soft Currency</span>
                      <input
                        className="form-input"
                        type="number"
                        value={missionDraft.reward_soft}
                        onChange={(e) => setMissionDraft(prev => ({ ...prev, reward_soft: e.target.value }))}
                      />
                    </label>

                    <label className="form-field">
                      <span className="field-label">💎 Premium Currency</span>
                      <input
                        className="form-input"
                        type="number"
                        value={missionDraft.reward_premium}
                        onChange={(e) => setMissionDraft(prev => ({ ...prev, reward_premium: e.target.value }))}
                      />
                    </label>
                  </div>

                  <label className="form-field">
                    <span className="field-label">🎴 Character Shards (optional)</span>
                    <select
                      className="form-input"
                      value={missionDraft.reward_shard_character_id || ''}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, reward_shard_character_id: e.target.value || null }))}
                    >
                      <option value="">No shards</option>
                      {characters.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.rarity})
                        </option>
                      ))}
                    </select>
                  </label>

                  {missionDraft.reward_shard_character_id && (
                    <label className="form-field">
                      <span className="field-label">Shard Amount</span>
                      <input
                        className="form-input"
                        type="number"
                        value={missionDraft.reward_shard_amount}
                        onChange={(e) => setMissionDraft(prev => ({ ...prev, reward_shard_amount: e.target.value }))}
                      />
                    </label>
                  )}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Schedule" defaultOpen={false}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label">Starts At (optional)</span>
                    <input
                      className="form-input"
                      type="datetime-local"
                      value={missionDraft.starts_at || ''}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, starts_at: e.target.value }))}
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label">Ends At (optional)</span>
                    <input
                      className="form-input"
                      type="datetime-local"
                      value={missionDraft.ends_at || ''}
                      onChange={(e) => setMissionDraft(prev => ({ ...prev, ends_at: e.target.value }))}
                    />
                  </label>
                </div>
              </CollapsibleSection>

              <div className="form-actions">
                <button className="btn-primary" onClick={saveMission}>
                  {missionDraft.id ? 'Save Changes' : 'Create Mission'}
                </button>
                {missionDraft.id && (
                  <button
                    className="btn-danger"
                    onClick={() => deleteMission(missionDraft.id, missionDraft.title)}
                  >
                    Delete Mission
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Banners Tab */}
        {activeTab === 'banners' && (
          <div className="admin-layout">
            <div className="admin-panel-list">
              <div className="admin-panel-list-header">
                <h3>All Banners</h3>
                <span className="item-count">{filteredBanners.length}</span>
              </div>
              <div className="admin-panel-list-items">
                {filteredBanners.map(banner => (
                  <button
                    key={banner.id}
                    className={`admin-card-item ${bannerDraft.id === banner.id ? 'active' : ''}`}
                    onClick={() => {
                      setBannerDraft({
                        ...banner,
                        starts_at: toDateInput(banner.starts_at),
                        ends_at: toDateInput(banner.ends_at),
                      })
                      setSelectedBannerId(String(banner.id))
                    }}
                  >
                    <div className="item-header">
                      <strong>{banner.name}</strong>
                    </div>
                    <div className="item-meta">
                      <span>ID: {banner.id}</span>
                    </div>
                  </button>
                ))}
              </div>
              <button
                className="btn-secondary btn-block"
                onClick={() => setBannerDraft({ ...emptyBanner })}
              >
                + New Banner
              </button>
            </div>

            <div className="admin-panel-detail">
              <div className="admin-detail-header">
                <h2>{bannerDraft.id ? 'Edit Banner' : 'New Banner'}</h2>
              </div>

              <CollapsibleSection title="Banner Settings" defaultOpen={true}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label required">Name</span>
                    <input
                      className="form-input"
                      value={bannerDraft.name}
                      onChange={(e) => setBannerDraft(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Banner name"
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label">Description</span>
                    <textarea
                      className="form-textarea"
                      value={bannerDraft.description}
                      onChange={(e) => setBannerDraft(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe this banner"
                    />
                  </label>

                  <div className="form-row">
                    <label className="form-field">
                      <span className="field-label">Starts At</span>
                      <input
                        className="form-input"
                        type="datetime-local"
                        value={bannerDraft.starts_at || ''}
                        onChange={(e) => setBannerDraft(prev => ({ ...prev, starts_at: e.target.value }))}
                      />
                    </label>

                    <label className="form-field">
                      <span className="field-label">Ends At</span>
                      <input
                        className="form-input"
                        type="datetime-local"
                        value={bannerDraft.ends_at || ''}
                        onChange={(e) => setBannerDraft(prev => ({ ...prev, ends_at: e.target.value }))}
                      />
                    </label>
                  </div>
                </div>
              </CollapsibleSection>

              <div className="form-actions">
                <button className="btn-primary" onClick={saveBanner}>
                  {bannerDraft.id ? 'Save Changes' : 'Create Banner'}
                </button>
                {bannerDraft.id && (
                  <button
                    className="btn-danger"
                    onClick={() => deleteBanner(bannerDraft.id, bannerDraft.name)}
                  >
                    Delete Banner
                  </button>
                )}
              </div>

              {bannerDraft.id && (
                <CollapsibleSection title="Banner Items" defaultOpen={false} badge={bannerItems.length}>
                  <div className="quick-preset">
                    <div className="quick-preset-title">Quick presets</div>
                    <div className="quick-preset-row">
                      <select
                        className="form-input quick-preset-select"
                        value={bannerItemDraft.character_id || ''}
                        onChange={(e) => setBannerItemDraft(prev => ({ ...prev, character_id: e.target.value }))}
                      >
                        <option value="">Select character</option>
                        {characters.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.rarity})
                          </option>
                        ))}
                      </select>
                      <button className="btn-secondary" type="button" onClick={() => applyBannerPreset('character')}>
                        Feature Character
                      </button>
                      <button className="btn-secondary" type="button" onClick={() => applyBannerPreset('shards')}>
                        Shard Pack
                      </button>
                    </div>
                    <div className="quick-preset-row">
                      <button className="btn-secondary" type="button" onClick={() => applyBannerPreset('soft')}>
                        Soft Pack
                      </button>
                      <button className="btn-secondary" type="button" onClick={() => applyBannerPreset('premium')}>
                        Premium Pack
                      </button>
                    </div>
                    <p className="quick-preset-hint">Applies defaults so you can tweak weights/amounts below.</p>
                  </div>
                  <div className="subsection-list">
                    {bannerItems.map(item => (
                      <button
                        key={item.id}
                        className={`subsection-item ${bannerItemDraft.id === item.id ? 'active' : ''}`}
                        onClick={() => setBannerItemDraft({ ...item })}
                      >
                        <div className="subsection-item-header">
                          <strong>{item.item_type}</strong>
                          <span className="subsection-badge">Weight {item.weight}</span>
                        </div>
                        <div className="subsection-item-meta">
                          {item.character_id && <span>Character ID: {item.character_id}</span>}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="admin-form">
                    <h4>{bannerItemDraft.id ? 'Edit Item' : 'New Item'}</h4>

                    <label className="form-field">
                      <span className="field-label required">Item Type</span>
                      <select
                        className="form-input"
                        value={bannerItemDraft.item_type}
                        onChange={(e) => setBannerItemDraft(prev => ({ ...prev, item_type: e.target.value }))}
                      >
                        <option value="character">Character (full unlock)</option>
                        <option value="shards">Character Shards</option>
                        <option value="currency">Currency</option>
                        <option value="item">Item</option>
                        <option value="title">Title</option>
                      </select>
                    </label>

                    {(bannerItemDraft.item_type === 'character' || bannerItemDraft.item_type === 'shards') && (
                      <label className="form-field">
                        <span className="field-label required">Character</span>
                        <select
                          className="form-input"
                          value={bannerItemDraft.character_id || ''}
                          onChange={(e) => setBannerItemDraft(prev => ({ ...prev, character_id: e.target.value }))}
                        >
                          <option value="">Select character</option>
                          {characters.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.rarity})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {bannerItemDraft.item_type === 'shards' && (
                      <label className="form-field">
                        <span className="field-label">Shard Amount</span>
                        <input
                          className="form-input"
                          type="number"
                          value={bannerItemDraft.shard_amount}
                          onChange={(e) => setBannerItemDraft(prev => ({ ...prev, shard_amount: e.target.value }))}
                        />
                      </label>
                    )}

                    {bannerItemDraft.item_type === 'currency' && (
                      <>
                        <label className="form-field">
                          <span className="field-label">💰 Soft Currency</span>
                          <input
                            className="form-input"
                            type="number"
                            value={bannerItemDraft.soft_currency}
                            onChange={(e) => setBannerItemDraft(prev => ({ ...prev, soft_currency: e.target.value }))}
                          />
                        </label>

                        <label className="form-field">
                          <span className="field-label">💎 Premium Currency</span>
                          <input
                            className="form-input"
                            type="number"
                            value={bannerItemDraft.premium_currency}
                            onChange={(e) => setBannerItemDraft(prev => ({ ...prev, premium_currency: e.target.value }))}
                          />
                        </label>
                      </>
                    )}

                    <label className="form-field">
                      <span className="field-label">
                        Weight
                        <Tooltip text="Higher weight = more likely to be pulled">
                          <span className="help-icon">?</span>
                        </Tooltip>
                      </span>
                      <input
                        className="form-input"
                        type="number"
                        value={bannerItemDraft.weight}
                        onChange={(e) => setBannerItemDraft(prev => ({ ...prev, weight: e.target.value }))}
                      />
                    </label>

                    <div className="form-actions">
                      <button className="btn-primary" onClick={saveBannerItem}>
                        {bannerItemDraft.id ? 'Save Item' : 'Add Item'}
                      </button>
                      {bannerItemDraft.id && (
                        <button
                          className="btn-danger"
                          onClick={() => deleteBannerItem(bannerItemDraft.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </CollapsibleSection>
              )}
            </div>
          </div>
        )}

        {/* Shop Tab */}
        {activeTab === 'shop' && (
          <div className="admin-layout">
            <div className="admin-panel-list">
              <div className="admin-panel-list-header">
                <h3>All Offers</h3>
                <span className="item-count">{filteredOffers.length}</span>
              </div>
              <div className="admin-panel-list-items">
                {filteredOffers.map(offer => (
                  <button
                    key={offer.id}
                    className={`admin-card-item ${offerDraft.id === offer.id ? 'active' : ''}`}
                    onClick={() => setOfferDraft({ ...offer })}
                  >
                    <div className="item-header">
                      <strong>{offer.name}</strong>
                      <span className={`badge ${offer.active ? 'badge-success' : 'badge-inactive'}`}>
                        {offer.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="item-meta">
                      <span>{offer.item_type}</span>
                    </div>
                  </button>
                ))}
              </div>
              <button
                className="btn-secondary btn-block"
                onClick={() => setOfferDraft({ ...emptyOffer })}
              >
                + New Offer
              </button>
            </div>

            <div className="admin-panel-detail">
              <div className="admin-detail-header">
                <h2>{offerDraft.id ? 'Edit Offer' : 'New Offer'}</h2>
              </div>

              <div className="quick-preset">
                <div className="quick-preset-title">Quick presets</div>
                <div className="quick-preset-row">
                  <select
                    className="form-input quick-preset-select"
                    value={offerDraft.character_id || ''}
                    onChange={(e) => setOfferDraft(prev => ({ ...prev, character_id: e.target.value }))}
                  >
                    <option value="">Select character</option>
                    {characters.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.rarity})
                      </option>
                    ))}
                  </select>
                  <button className="btn-secondary" type="button" onClick={() => applyOfferPreset('shards-small')}>
                    Shard x10
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => applyOfferPreset('shards-large')}>
                    Shard x30
                  </button>
                </div>
                <div className="quick-preset-row">
                  <button className="btn-secondary" type="button" onClick={() => applyOfferPreset('soft-pack')}>
                    Soft Pack
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => applyOfferPreset('premium-pack')}>
                    Premium Pack
                  </button>
                </div>
                <p className="quick-preset-hint">Sets reward fields only; add name/description/cost below.</p>
              </div>

              <CollapsibleSection title="Basic Info" defaultOpen={true}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label required">Name</span>
                    <input
                      className="form-input"
                      value={offerDraft.name}
                      onChange={(e) => setOfferDraft(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Offer name"
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label">Description</span>
                    <textarea
                      className="form-textarea"
                      value={offerDraft.description}
                      onChange={(e) => setOfferDraft(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe this offer"
                    />
                  </label>

                  <label className="form-field">
                    <div className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={Boolean(offerDraft.active)}
                        onChange={(e) => setOfferDraft(prev => ({ ...prev, active: e.target.checked }))}
                      />
                      <span className="field-label">Active (visible in shop)</span>
                    </div>
                  </label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Cost" defaultOpen={false}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label">💰 Soft Currency Cost</span>
                    <input
                      className="form-input"
                      type="number"
                      value={offerDraft.cost_soft}
                      onChange={(e) => setOfferDraft(prev => ({ ...prev, cost_soft: e.target.value }))}
                    />
                  </label>

                  <label className="form-field">
                    <span className="field-label">💎 Premium Currency Cost</span>
                    <input
                      className="form-input"
                      type="number"
                      value={offerDraft.cost_premium}
                      onChange={(e) => setOfferDraft(prev => ({ ...prev, cost_premium: e.target.value }))}
                    />
                  </label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Rewards" defaultOpen={false}>
                <div className="admin-form">
                  <label className="form-field">
                    <span className="field-label required">Item Type</span>
                    <select
                      className="form-input"
                      value={offerDraft.item_type}
                      onChange={(e) => setOfferDraft(prev => ({ ...prev, item_type: e.target.value }))}
                    >
                      <option value="shards">Character Shards</option>
                      <option value="currency">Currency</option>
                      <option value="item">Item</option>
                    </select>
                  </label>

                  {offerDraft.item_type === 'shards' && (
                    <>
                      <label className="form-field">
                        <span className="field-label required">Character</span>
                        <select
                          className="form-input"
                          value={offerDraft.character_id || ''}
                          onChange={(e) => setOfferDraft(prev => ({ ...prev, character_id: e.target.value }))}
                        >
                          <option value="">Select character</option>
                          {characters.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.rarity})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="form-field">
                        <span className="field-label">Shard Amount</span>
                        <input
                          className="form-input"
                          type="number"
                          value={offerDraft.shard_amount}
                          onChange={(e) => setOfferDraft(prev => ({ ...prev, shard_amount: e.target.value }))}
                        />
                      </label>
                    </>
                  )}

                  {offerDraft.item_type === 'currency' && (
                    <>
                      <label className="form-field">
                        <span className="field-label">💰 Soft Currency Amount</span>
                        <input
                          className="form-input"
                          type="number"
                          value={offerDraft.soft_currency}
                          onChange={(e) => setOfferDraft(prev => ({ ...prev, soft_currency: e.target.value }))}
                        />
                      </label>

                      <label className="form-field">
                        <span className="field-label">💎 Premium Currency Amount</span>
                        <input
                          className="form-input"
                          type="number"
                          value={offerDraft.premium_currency}
                          onChange={(e) => setOfferDraft(prev => ({ ...prev, premium_currency: e.target.value }))}
                        />
                      </label>
                    </>
                  )}
                </div>
              </CollapsibleSection>

              <div className="form-actions">
                <button className="btn-primary" onClick={saveOffer}>
                  {offerDraft.id ? 'Save Changes' : 'Create Offer'}
                </button>
                {offerDraft.id && (
                  <button
                    className="btn-danger"
                    onClick={() => deleteOffer(offerDraft.id, offerDraft.name)}
                  >
                    Delete Offer
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminPanel
