import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  authoredBattleContent,
  battleRoster,
  defaultBattleSetup,
} from '@/features/battle/data'
import {
  clearDraftBattleContent,
  clearPublishedBattleContent,
  createContentSnapshot,
  publishBattleContent,
  readDraftBattleContent,
  saveDraftBattleContent,
  type BattleContentSnapshot,
} from '@/features/battle/contentStore'
import { battleEnergyMeta, battleEnergyOrder, getAbilityEnergyCost } from '@/features/battle/energy'
import { validateBattleContent } from '@/features/battle/validation'
import type {
  BattleAbilityKind,
  BattleAbilityTag,
  BattleAbilityTemplate,
  BattleFighterTemplate,
  BattleTargetRule,
  PassiveEffect,
  PassiveTrigger,
  SkillEffect,
} from '@/features/battle/types'

const abilityKinds: BattleAbilityKind[] = ['attack', 'heal', 'defend', 'buff', 'debuff', 'utility', 'pass']
const targetRules: BattleTargetRule[] = ['none', 'self', 'enemy-single', 'enemy-all', 'ally-single', 'ally-all']
const passiveTriggers: PassiveTrigger[] = ['onDealDamage', 'onRoundStart', 'whileAlive', 'onTargetBelow']
const tagOptions: BattleAbilityTag[] = ['ATK', 'HEAL', 'BUFF', 'DEBUFF', 'UTILITY', 'ULT']
const effectTypes: SkillEffect['type'][] = ['damage', 'heal', 'invulnerable', 'attackUp', 'stun', 'mark', 'burn', 'cooldownReduction', 'damageBoost']
const effectTargets: SkillEffect['target'][] = ['inherit', 'self', 'all-allies', 'all-enemies']
const rarityOptions: BattleFighterTemplate['rarity'][] = ['R', 'SR', 'SSR', 'UR']
const liveContent = createContentSnapshot(battleRoster, {
  playerTeamIds: defaultBattleSetup.playerTeamIds,
  enemyTeamIds: defaultBattleSetup.enemyTeamIds,
})

const adminSelectionStorageKey = 'ca-admin-selection-v1'

type AdminSelection = {
  fighterId: string
  abilityId: string | null
  passiveIndex: number
}

function readAdminSelection(): AdminSelection | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(adminSelectionStorageKey)
    if (!raw) return null
    return JSON.parse(raw) as AdminSelection
  } catch {
    return null
  }
}

function writeAdminSelection(selection: AdminSelection) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(adminSelectionStorageKey, JSON.stringify(selection))
  } catch {
    // ignore storage write failures
  }
}

function cloneSnapshot(snapshot: BattleContentSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as BattleContentSnapshot
}

function deriveAbilityLabel(name: string) {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

function resolveAbilityTone(kind: BattleAbilityTemplate['kind'], tags: BattleAbilityTemplate['tags']) {
  if (tags.includes('ULT')) return 'gold' as const
  if (kind === 'heal' || tags.includes('HEAL')) return 'teal' as const
  if (kind === 'debuff' || tags.includes('DEBUFF')) return 'red' as const
  if (kind === 'buff' || kind === 'defend' || kind === 'utility' || tags.includes('UTILITY')) return 'teal' as const
  if (kind === 'pass') return 'frost' as const
  return 'red' as const
}

function syncAbilityPresentation(ability: BattleAbilityTemplate) {
  ability.icon = {
    src: ability.icon?.src,
    label: deriveAbilityLabel(ability.name),
    tone: resolveAbilityTone(ability.kind, ability.tags),
  }
}

function createEffect(type: SkillEffect['type'] = 'damage'): SkillEffect {
  switch (type) {
    case 'damage':
      return { type: 'damage', power: 20, target: 'inherit' }
    case 'heal':
      return { type: 'heal', power: 18, target: 'inherit' }
    case 'invulnerable':
      return { type: 'invulnerable', duration: 1, target: 'inherit' }
    case 'attackUp':
      return { type: 'attackUp', amount: 10, duration: 1, target: 'inherit' }
    case 'stun':
      return { type: 'stun', duration: 1, target: 'inherit' }
    case 'mark':
      return { type: 'mark', bonus: 15, duration: 1, target: 'inherit' }
    case 'burn':
      return { type: 'burn', damage: 8, duration: 2, target: 'inherit' }
    case 'cooldownReduction':
      return { type: 'cooldownReduction', amount: 1, target: 'inherit' }
    case 'damageBoost':
      return { type: 'damageBoost', amount: 0.2, target: 'inherit' }
  }
}


function formatEffectTarget(target: SkillEffect['target']) {
  if (target === 'inherit') return 'the skill target'
  if (target === 'self') return 'self'
  if (target === 'all-allies') return 'all allies'
  return 'all enemies'
}

function describeEffect(effect: SkillEffect) {
  switch (effect.type) {
    case 'damage':
      return `Deals ${effect.power} damage to ${formatEffectTarget(effect.target)}.`
    case 'heal':
      return `Restores ${effect.power} HP to ${formatEffectTarget(effect.target)}.`
    case 'invulnerable':
      return `Makes ${formatEffectTarget(effect.target)} invulnerable for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'attackUp':
      return `Adds ${effect.amount} bonus damage to ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'stun':
      return `Stuns ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`
    case 'mark':
      return `Marks ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}; follow-up hits gain ${effect.bonus} bonus damage.`
    case 'burn':
      return `Burns ${formatEffectTarget(effect.target)} for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}; each tick deals ${effect.damage} damage.`
    case 'cooldownReduction':
      return `Reduces cooldowns by ${effect.amount} for ${formatEffectTarget(effect.target)}.`
    case 'damageBoost':
      return `Boosts outgoing damage for ${formatEffectTarget(effect.target)} by ${Math.round(effect.amount * 100)}%.`
  }
}

function describePassive(passive: PassiveEffect) {
  const thresholdText =
    passive.trigger === 'onTargetBelow' && typeof passive.threshold === 'number'
      ? ` under ${Math.round(passive.threshold * 100)}% HP`
      : ''
  return `${passive.label}: ${passive.trigger}${thresholdText}.`.trim()
}

function explainCostRule(ability: BattleAbilityTemplate) {
  if (ability.kind === 'pass') return 'Passive abilities are free.'
  if (ability.energyCost && Object.keys(ability.energyCost).length > 0) return 'This skill is using a manually authored cost override.'
  if (ability.tags.includes('ULT')) return 'Ultimates always cost CT 1 + VOW 1 + MEN 1.'
  if (ability.kind === 'heal') {
    return ability.targetRule === 'ally-all' ? 'Group healing adds CT on top of MEN.' : 'Single-target healing costs MEN 1.'
  }
  if (ability.kind === 'defend') return 'Defend skills cost CT 1.'
  if (ability.kind === 'buff') return 'Buff skills cost VOW 1.'
  if (ability.kind === 'debuff') return 'Debuffs cost VOW 1 + MEN 1.'
  if (ability.kind === 'utility') return 'Utility skills cost CT 1 + MEN 1.'
  if (ability.targetRule === 'enemy-all') return 'AoE attacks cost PHY 1 + CT 1.'
  if (ability.tags.includes('DEBUFF')) return 'Attack skills with DEBUFF tags cost PHY 1 + VOW 1.'
  return 'Standard attacks cost PHY 1.'
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createBlankAbility(id: string, name: string, overrides: Partial<BattleAbilityTemplate> = {}): BattleAbilityTemplate {
  const ability: BattleAbilityTemplate = {
    id,
    name,
    description: 'Describe what this technique does in battle.',
    kind: 'attack',
    targetRule: 'enemy-single',
    tags: ['ATK'],
    icon: { label: deriveAbilityLabel(name), tone: 'red' },
    cooldown: 1,
    effects: [{ type: 'damage', power: 30, target: 'inherit' }],
    ...overrides,
  }
  syncAbilityPresentation(ability)
  return ability
}

function createBlankFighter(index: number): BattleFighterTemplate {
  const shortName = 'Fighter ' + index
  return {
    id: 'fighter-' + index,
    name: 'New Fighter ' + index,
    shortName,
    rarity: 'SR',
    role: 'Hybrid',
    affiliationLabel: 'Custom',
    battleTitle: 'Arena Recruit',
    bio: 'New combatant awaiting authored battle identity.',
    renderSrc: '',
    boardPortraitSrc: '',
    maxHp: 100,
    passiveEffects: [
      {
        label: 'New Passive',
        trigger: 'whileAlive',
        effects: [{ type: 'damageBoost', amount: 0.1, target: 'self' }],
      },
    ],
    abilities: [
      createBlankAbility('fighter-' + index + '-skill-1', 'New Strike'),
      createBlankAbility('fighter-' + index + '-skill-2', 'New Technique', { kind: 'utility', targetRule: 'self', tags: ['UTILITY'], effects: [createEffect('cooldownReduction')] }),
    ],
    ultimate: createBlankAbility('fighter-' + index + '-ultimate', 'New Ultimate', {
      kind: 'attack',
      targetRule: 'enemy-all',
      tags: ['ATK', 'ULT'],
      cooldown: 5,
      effects: [{ type: 'damage', power: 60, target: 'all-enemies' }],
    }),
  }
}

function normalizeFighterImport(input: BattleFighterTemplate): BattleFighterTemplate {
  const fighter = JSON.parse(JSON.stringify(input)) as BattleFighterTemplate
  fighter.passiveEffects = fighter.passiveEffects ?? []
  fighter.abilities = fighter.abilities ?? []
  fighter.abilities.forEach(syncAbilityPresentation)
  syncAbilityPresentation(fighter.ultimate)
  return fighter
}

function sanitizeDefaultSetup(snapshot: BattleContentSnapshot) {
  const rosterIds = snapshot.roster.map((fighter) => fighter.id)
  if (rosterIds.length === 0) return

  const fillTeam = (teamIds: string[]) =>
    teamIds.map((id, index) => (rosterIds.includes(id) ? id : rosterIds[Math.min(index, rosterIds.length - 1)] ?? rosterIds[0]))

  snapshot.defaultSetup.playerTeamIds = fillTeam(snapshot.defaultSetup.playerTeamIds)
  snapshot.defaultSetup.enemyTeamIds = fillTeam(snapshot.defaultSetup.enemyTeamIds)
}

export function AdminControlPanelPage() {
  const [draft, setDraft] = useState<BattleContentSnapshot>(() => readDraftBattleContent(liveContent))
  const [selectedFighterId, setSelectedFighterId] = useState(() => {
    const saved = readAdminSelection()
    if (saved && liveContent.roster.some((fighter) => fighter.id === saved.fighterId)) {
      return saved.fighterId
    }
    return liveContent.roster[0]?.id ?? ''
  })
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(() => readAdminSelection()?.abilityId ?? null)
  const [selectedPassiveIndex, setSelectedPassiveIndex] = useState(() => readAdminSelection()?.passiveIndex ?? 0)
  const [creatorView, setCreatorView] = useState<'edit' | 'preview'>('edit')
  const [statusFlash, setStatusFlash] = useState<string | null>(null)
  const [fighterJsonDraft, setFighterJsonDraft] = useState('')

  const selectedFighter = draft.roster.find((fighter) => fighter.id === selectedFighterId) ?? draft.roster[0] ?? null
  const selectedAbilityIdResolved = selectedFighter
    ? selectedFighter.abilities.concat(selectedFighter.ultimate).map((ability) => ability.id).includes(selectedAbilityId ?? '')
      ? selectedAbilityId
      : selectedFighter.abilities[0]?.id ?? selectedFighter.ultimate.id
    : null
  const selectedAbility = selectedFighter
    ? selectedFighter.abilities.concat(selectedFighter.ultimate).find((ability) => ability.id === selectedAbilityIdResolved) ??
      selectedFighter.abilities[0] ??
      selectedFighter.ultimate
    : null
  const selectedPassiveIndexResolved = selectedFighter && (selectedFighter.passiveEffects?.length ?? 0) > selectedPassiveIndex ? selectedPassiveIndex : 0
  const selectedPassive = selectedFighter?.passiveEffects?.[selectedPassiveIndexResolved] ?? null

  useEffect(() => {
    if (!statusFlash) return
    const timeout = window.setTimeout(() => setStatusFlash(null), 1800)
    return () => window.clearTimeout(timeout)
  }, [statusFlash])

  useEffect(() => {
    writeAdminSelection({
      fighterId: selectedFighterId,
      abilityId: selectedAbilityId,
      passiveIndex: selectedPassiveIndex,
    })
  }, [selectedFighterId, selectedAbilityId, selectedPassiveIndex])

  const validationReport = useMemo(
    () => validateBattleContent(draft.roster, draft.defaultSetup),
    [draft],
  )
  const abilityCount = useMemo(
    () => draft.roster.reduce((total, fighter) => total + fighter.abilities.length + 1, 0),
    [draft.roster],
  )
  const passiveCount = useMemo(
    () => draft.roster.reduce((total, fighter) => total + (fighter.passiveEffects?.length ?? 0), 0),
    [draft.roster],
  )
  const effectTypeCounts = useMemo(
    () =>
      countEffectTypes(
        draft.roster.flatMap((fighter) => fighter.abilities.concat(fighter.ultimate).flatMap((ability) => ability.effects ?? [])),
      ),
    [draft.roster],
  )
  const passiveTriggerCounts = useMemo(
    () => countPassiveTriggers(draft.roster.flatMap((fighter) => fighter.passiveEffects ?? [])),
    [draft.roster],
  )
  const liveMatchesDraft = JSON.stringify(liveContent) === JSON.stringify(draft)

  function updateDraft(mutator: (next: BattleContentSnapshot) => void) {
    setDraft((current) => {
      const next = cloneSnapshot(current)
      mutator(next)
      next.updatedAt = Date.now()
      return next
    })
  }

  function updateSelectedFighter(mutator: (fighter: BattleFighterTemplate) => void) {
    if (!selectedFighter) return
    updateDraft((next) => {
      const fighter = next.roster.find((entry) => entry.id === selectedFighter.id)
      if (!fighter) return
      mutator(fighter)
    })
  }

  function updateAbilityById(abilityId: string, mutator: (ability: BattleAbilityTemplate) => void) {
    if (!selectedFighter) return
    updateSelectedFighter((fighter) => {
      if (fighter.ultimate.id === abilityId) {
        mutator(fighter.ultimate)
        syncAbilityPresentation(fighter.ultimate)
        return
      }
      const ability = fighter.abilities.find((entry) => entry.id === abilityId)
      if (ability) {
        mutator(ability)
        syncAbilityPresentation(ability)
      }
    })
  }

  function updateAbilityEffectsById(abilityId: string, effects: SkillEffect[]) {
    updateAbilityById(abilityId, (ability) => {
      ability.effects = effects.map((effect) => JSON.parse(JSON.stringify(effect)) as SkillEffect)
    })
  }

  function updateSelectedPassive(mutator: (passive: PassiveEffect) => void) {
    if (!selectedFighter || !selectedPassive) return
    updateSelectedFighter((fighter) => {
      const passive = fighter.passiveEffects?.[selectedPassiveIndexResolved]
      if (passive) mutator(passive)
    })
  }

  function updateSelectedPassiveEffects(mutator: (effects: SkillEffect[]) => SkillEffect[]) {
    updateSelectedPassive((passive) => {
      passive.effects = mutator((passive.effects ?? []).map((effect) => JSON.parse(JSON.stringify(effect)) as SkillEffect))
    })
  }

  async function handleImageImport(apply: (value: string) => void, file: File | null, successMessage: string) {
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      apply(dataUrl)
      setStatusFlash(successMessage)
    } catch {
      setStatusFlash('UPLOAD FAILED')
    }
  }

  function handleAddPassive() {
    updateSelectedFighter((fighter) => {
      fighter.passiveEffects = [...(fighter.passiveEffects ?? []), { label: 'New Passive', trigger: 'whileAlive', effects: [createEffect('damageBoost')] }]
    })
    setSelectedPassiveIndex(selectedFighter?.passiveEffects?.length ?? 0)
    setStatusFlash('PASSIVE ADDED')
  }

  function handleRemovePassive() {
    if (!selectedFighter || !selectedPassive) return
    updateSelectedFighter((fighter) => {
      fighter.passiveEffects = (fighter.passiveEffects ?? []).filter((_, index) => index !== selectedPassiveIndexResolved)
    })
    setSelectedPassiveIndex(Math.max(0, selectedPassiveIndexResolved - 1))
    setStatusFlash('PASSIVE REMOVED')
  }

  function handleAddFighter() {
    const fighter = createBlankFighter(draft.roster.length + 1)
    updateDraft((next) => {
      next.roster.push(fighter)
      sanitizeDefaultSetup(next)
    })
    setSelectedFighterId(fighter.id)
    setSelectedAbilityId(fighter.abilities[0]?.id ?? fighter.ultimate.id)
    setSelectedPassiveIndex(0)
    setFighterJsonDraft(JSON.stringify(fighter, null, 2))
    setStatusFlash('FIGHTER ADDED')
  }

  function handleDuplicateFighter() {
    if (!selectedFighter) return
    const copy = normalizeFighterImport(selectedFighter)
    const baseId = slugify(copy.id || copy.shortName || copy.name) || 'fighter-copy'
    let nextId = baseId + '-copy'
    let suffix = 2
    while (draft.roster.some((fighter) => fighter.id === nextId)) {
      nextId = baseId + '-copy-' + suffix
      suffix += 1
    }
    copy.id = nextId
    copy.name = copy.name + ' Copy'
    copy.shortName = copy.shortName + ' Copy'
    copy.abilities = copy.abilities.map((ability, index) => createBlankAbility(nextId + '-skill-' + (index + 1), ability.name, { ...ability, id: nextId + '-skill-' + (index + 1) }))
    copy.ultimate = createBlankAbility(nextId + '-ultimate', copy.ultimate.name, { ...copy.ultimate, id: nextId + '-ultimate' })

    updateDraft((next) => {
      next.roster.push(copy)
      sanitizeDefaultSetup(next)
    })
    setSelectedFighterId(copy.id)
    setSelectedAbilityId(copy.abilities[0]?.id ?? copy.ultimate.id)
    setSelectedPassiveIndex(0)
    setFighterJsonDraft(JSON.stringify(copy, null, 2))
    setStatusFlash('FIGHTER DUPLICATED')
  }

  function handleDeleteFighter() {
    if (!selectedFighter || draft.roster.length <= 1) {
      setStatusFlash('KEEP ONE FIGHTER')
      return
    }

    const fallback = draft.roster.find((fighter) => fighter.id !== selectedFighter.id) ?? null
    updateDraft((next) => {
      next.roster = next.roster.filter((fighter) => fighter.id !== selectedFighter.id)
      sanitizeDefaultSetup(next)
    })
    setSelectedFighterId(fallback?.id ?? '')
    setSelectedAbilityId(fallback?.abilities[0]?.id ?? fallback?.ultimate.id ?? null)
    setSelectedPassiveIndex(0)
    setFighterJsonDraft('')
    setStatusFlash('FIGHTER DELETED')
  }

  function handleCopyFighterJson() {
    if (!selectedFighter) return
    const payload = JSON.stringify(selectedFighter, null, 2)
    setFighterJsonDraft(payload)
    void navigator.clipboard.writeText(payload).then(
      () => setStatusFlash('FIGHTER JSON COPIED'),
      () => setStatusFlash('COPY FAILED'),
    )
  }

  function handleImportFighter(mode: 'append' | 'replace') {
    try {
      const parsed = normalizeFighterImport(JSON.parse(fighterJsonDraft) as BattleFighterTemplate)
      updateDraft((next) => {
        if (mode === 'replace' && selectedFighter) {
          next.roster = next.roster.map((fighter) => (fighter.id === selectedFighter.id ? parsed : fighter))
        } else {
          let nextId = parsed.id || slugify(parsed.shortName || parsed.name) || 'fighter-import'
          let suffix = 2
          while (next.roster.some((fighter) => fighter.id === nextId)) {
            nextId = (parsed.id || 'fighter-import') + '-' + suffix
            suffix += 1
          }
          parsed.id = nextId
          next.roster.push(parsed)
        }
        sanitizeDefaultSetup(next)
      })
      setSelectedFighterId(parsed.id)
      setSelectedAbilityId(parsed.abilities[0]?.id ?? parsed.ultimate.id)
      setSelectedPassiveIndex(0)
      setStatusFlash(mode === 'replace' ? 'FIGHTER REPLACED' : 'FIGHTER IMPORTED')
    } catch {
      setStatusFlash('INVALID FIGHTER JSON')
    }
  }

  function handleAddAbility() {
    if (!selectedFighter) return
    const ability = createBlankAbility(selectedFighter.id + '-skill-' + (selectedFighter.abilities.length + 1), 'New Ability')
    updateSelectedFighter((fighter) => {
      fighter.abilities.push(ability)
    })
    setSelectedAbilityId(ability.id)
    setStatusFlash('ABILITY ADDED')
  }

  function handleDuplicateAbility() {
    if (!selectedFighter || !selectedAbility) return
    if (selectedFighter.ultimate.id === selectedAbility.id) {
      setStatusFlash('DUPLICATE NORMAL SKILLS ONLY')
      return
    }

    const duplicate = createBlankAbility(selectedFighter.id + '-skill-' + (selectedFighter.abilities.length + 1), selectedAbility.name + ' Copy', { ...JSON.parse(JSON.stringify(selectedAbility)), id: selectedFighter.id + '-skill-' + (selectedFighter.abilities.length + 1) })
    updateSelectedFighter((fighter) => {
      fighter.abilities.push(duplicate)
    })
    setSelectedAbilityId(duplicate.id)
    setStatusFlash('ABILITY DUPLICATED')
  }

  function handleDeleteAbility() {
    if (!selectedFighter || !selectedAbility) return
    if (selectedFighter.ultimate.id === selectedAbility.id) {
      setStatusFlash('KEEP AN ULTIMATE')
      return
    }
    if (selectedFighter.abilities.length <= 1) {
      setStatusFlash('KEEP ONE SKILL')
      return
    }
    const fallback = selectedFighter.abilities.find((ability) => ability.id !== selectedAbility.id) ?? null
    updateSelectedFighter((fighter) => {
      fighter.abilities = fighter.abilities.filter((ability) => ability.id !== selectedAbility.id)
    })
    setSelectedAbilityId(fallback?.id ?? selectedFighter.ultimate.id)
    setStatusFlash('ABILITY REMOVED')
  }

  function updateJsonField<T>(raw: string, apply: (value: T) => void, successMessage: string) {
    try {
      const parsed = JSON.parse(raw) as T
      apply(parsed)
      setStatusFlash(successMessage)
    } catch {
      setStatusFlash('INVALID JSON')
    }
  }

  function handleSaveDraft() {
    const saved = saveDraftBattleContent(draft)
    setDraft(saved)
    setStatusFlash('DRAFT SAVED')
  }

  function handleResetDraft() {
    clearDraftBattleContent()
    setDraft(cloneSnapshot(liveContent))
    setStatusFlash('DRAFT RESET')
  }

  function handleRestoreAuthored() {
    clearDraftBattleContent()
    setDraft(cloneSnapshot(authoredBattleContent))
    setStatusFlash('AUTHORED RESTORED')
  }

  function handlePublish() {
    if (validationReport.errors.length > 0) {
      setStatusFlash('FIX VALIDATION')
      return
    }

    writeAdminSelection({
      fighterId: selectedFighterId,
      abilityId: selectedAbilityId,
      passiveIndex: selectedPassiveIndex,
    })
    publishBattleContent(draft)
    window.location.reload()
  }

  function handleRevertPublished() {
    clearPublishedBattleContent()
    clearDraftBattleContent()
    window.location.reload()
  }

  return (
    <section className="py-4 sm:py-6">
      <div className="space-y-4">
        <header className="rounded-[10px] border border-white/8 bg-[rgba(14,15,20,0.16)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Internal Tools</p>
              <h1 className="ca-display mt-2 text-4xl text-ca-text sm:text-5xl">Admin Control Panel</h1>
              <p className="mt-2 max-w-3xl text-sm text-ca-text-3">
                Local draft editor for battle content. Drafts save to local storage, and publish applies them as the live
                battle content source on reload.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/settings"
                className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] px-4 py-2.5 text-[1rem] text-ca-text"
              >
                Back To Settings
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Fighters" value={`${draft.roster.length}`} tone="teal" />
          <MetricCard label="Abilities" value={`${abilityCount}`} tone="frost" />
          <MetricCard label="Passives" value={`${passiveCount}`} tone="gold" />
          <MetricCard label="Validation Issues" value={`${validationReport.errors.length}`} tone={validationReport.errors.length > 0 ? 'red' : 'teal'} />
        </section>

        <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Draft State</p>
              <p className="ca-display mt-2 text-3xl text-ca-text">Local Publish Flow</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] px-4 py-2.5 text-[1rem] text-ca-text"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={handleResetDraft}
                className="ca-display rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-2.5 text-[1rem] text-ca-text-2"
              >
                Reset Draft
              </button>
              <button
                type="button"
                onClick={handleRestoreAuthored}
                className="ca-display rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-2.5 text-[1rem] text-ca-text-2"
              >
                Restore Authored
              </button>
              <button
                type="button"
                onClick={handlePublish}
                className="ca-display rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] px-4 py-2.5 text-[1rem] text-white"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={handleRevertPublished}
                className="ca-display rounded-lg border border-ca-teal/22 bg-ca-teal-wash px-4 py-2.5 text-[1rem] text-ca-teal"
              >
                Revert Live
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill label={liveMatchesDraft ? 'MATCHES LIVE' : 'DRAFT CHANGED'} tone={liveMatchesDraft ? 'teal' : 'gold'} />
            <StatusPill label={validationReport.errors.length > 0 ? 'VALIDATION BLOCKED' : 'READY TO PUBLISH'} tone={validationReport.errors.length > 0 ? 'red' : 'teal'} />
            {statusFlash ? <StatusPill label={statusFlash} tone="frost" /> : null}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Fighters</p>
            <p className="ca-display mt-2 text-3xl text-ca-text">Registry</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleAddFighter} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">
                ADD FIGHTER
              </button>
              <button type="button" onClick={handleDuplicateFighter} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">
                DUPLICATE
              </button>
              <button type="button" onClick={handleDeleteFighter} disabled={!selectedFighter || draft.roster.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1.5 text-[0.42rem] text-ca-red disabled:opacity-50">
                DELETE
              </button>
            </div>
            <div className="mt-4 space-y-2 max-h-[44vh] overflow-y-auto pr-1">
              {draft.roster.map((fighter) => (
                <button
                  key={fighter.id}
                  type="button"
                  onClick={() => {
                    setSelectedFighterId(fighter.id)
                    setFighterJsonDraft(JSON.stringify(fighter, null, 2))
                  }}
                  className={[
                    'w-full rounded-[10px] border px-3 py-3 text-left transition',
                    selectedFighterId === fighter.id
                      ? 'border-ca-teal/28 bg-ca-teal-wash'
                      : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/15',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="ca-display text-[1.1rem] text-ca-text">{fighter.shortName}</p>
                      <p className="mt-1 text-xs text-ca-text-3">{fighter.role}</p>
                    </div>
                    <span className="ca-mono-label text-[0.38rem] text-ca-text-3">{fighter.id}</span>
                  </div>
                </button>
              ))}
            </div>
            <details className="mt-4 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
              <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">FIGHTER JSON</summary>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleCopyFighterJson} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">
                    COPY SELECTED JSON
                  </button>
                  <button type="button" onClick={() => handleImportFighter('append')} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">
                    IMPORT AS NEW
                  </button>
                  <button type="button" onClick={() => handleImportFighter('replace')} disabled={!selectedFighter} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">
                    REPLACE SELECTED
                  </button>
                </div>
                <TextAreaField label="Fighter JSON" value={fighterJsonDraft} onChange={setFighterJsonDraft} rows={14} mono />
              </div>
            </details>
          </section>

          <section className="space-y-4">
            {selectedFighter ? (
              <>
                <EditorCard title="Character Creator" subtitle={selectedFighter.shortName.toUpperCase()}>
                  <div className="mb-4 inline-flex gap-1 rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] p-1">
                    <button
                      type="button"
                      onClick={() => setCreatorView('edit')}
                      className={[
                        'ca-mono-label rounded px-3 py-1.5 text-[0.42rem] transition',
                        creatorView === 'edit' ? 'bg-ca-teal-wash text-ca-teal' : 'text-ca-text-3 hover:text-ca-text-2',
                      ].join(' ')}
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatorView('preview')}
                      className={[
                        'ca-mono-label rounded px-3 py-1.5 text-[0.42rem] transition',
                        creatorView === 'preview' ? 'bg-ca-teal-wash text-ca-teal' : 'text-ca-text-3 hover:text-ca-text-2',
                      ].join(' ')}
                    >
                      PREVIEW
                    </button>
                  </div>
                  {creatorView === 'preview' ? (
                    <FighterProfilePreview fighter={selectedFighter} />
                  ) : (
                  <div className="space-y-5">
                    <div className="overflow-hidden rounded-[14px] border border-white/8 bg-[linear-gradient(135deg,rgba(250,39,66,0.12),rgba(250,39,66,0.02)_28%,rgba(5,216,189,0.08)_72%,rgba(255,255,255,0.03))] px-4 py-4 lg:px-5">
                      <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
                        <div className="space-y-3">
                          <div className="rounded-[12px] border border-white/10 bg-[rgba(8,9,14,0.8)] p-2 shadow-[0_18px_44px_rgba(0,0,0,0.26)]">
                            <PortraitPreview fighter={selectedFighter} />
                          </div>
                          <AssetField
                            fieldId={`fighter-portrait-${selectedFighter.id}`}
                            label="Portrait Image"
                            value={selectedFighter.boardPortraitSrc}
                            onChange={(value) => updateSelectedFighter((fighter) => { fighter.boardPortraitSrc = value })}
                            onImport={(file) => handleImageImport((value) => updateSelectedFighter((fighter) => { fighter.boardPortraitSrc = value }), file, 'PORTRAIT UPDATED')}
                            helper="Square crop. Recommended 512x512."
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <InputField label="Name" value={selectedFighter.name} onChange={(value) => updateSelectedFighter((fighter) => { fighter.name = value })} />
                            <InputField label="Short Name" value={selectedFighter.shortName} onChange={(value) => updateSelectedFighter((fighter) => { fighter.shortName = value })} />
                            <InputField label="Role" value={selectedFighter.role} onChange={(value) => updateSelectedFighter((fighter) => { fighter.role = value })} />
                            <SelectField label="Rarity" value={selectedFighter.rarity} options={rarityOptions.map((value) => ({ value, label: value }))} onChange={(value) => updateSelectedFighter((fighter) => { fighter.rarity = value as BattleFighterTemplate['rarity'] })} />
                            <InputField label="Affiliation" value={selectedFighter.affiliationLabel} onChange={(value) => updateSelectedFighter((fighter) => { fighter.affiliationLabel = value })} />
                            <NumberField label="Max HP" value={selectedFighter.maxHp} onChange={(value) => updateSelectedFighter((fighter) => { fighter.maxHp = value })} />
                          </div>
                          <TextAreaField label="Bio" value={selectedFighter.bio} onChange={(value) => updateSelectedFighter((fighter) => { fighter.bio = value })} rows={3} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="ca-mono-label text-[0.42rem] text-ca-text-3">SKILLS AND ULTIMATE</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={handleAddAbility} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">
                            ADD SKILL
                          </button>
                          <button type="button" onClick={handleDuplicateAbility} disabled={!selectedAbility || selectedFighter.ultimate.id === selectedAbility.id} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.42rem] text-ca-text-2 disabled:opacity-50">
                            DUPLICATE SELECTED
                          </button>
                          <button type="button" onClick={handleDeleteAbility} disabled={!selectedAbility || selectedFighter.ultimate.id === selectedAbility.id || selectedFighter.abilities.length <= 1} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1.5 text-[0.42rem] text-ca-red disabled:opacity-50">
                            DELETE SELECTED
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-3">
                        {selectedFighter.abilities.concat(selectedFighter.ultimate).map((ability) => {
                          const isUltimate = selectedFighter.ultimate.id === ability.id
                          const active = selectedAbility?.id === ability.id
                          return (
                            <SkillEditorCard
                              key={ability.id}
                              ability={ability}
                              isUltimate={isUltimate}
                              active={active}
                              onSelect={() => setSelectedAbilityId(ability.id)}
                              onUpdate={(mutator) => updateAbilityById(ability.id, mutator)}
                              onUpdateEffects={(effects) => updateAbilityEffectsById(ability.id, effects)}
                              onImportIcon={(file) => handleImageImport((value) => updateAbilityById(ability.id, (current) => { current.icon.src = value }), file, 'ABILITY ICON UPDATED')}
                              onAdvancedEffectsJson={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateAbilityById(ability.id, (current) => { current.effects = parsed }), 'ABILITY EFFECTS UPDATED')}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  )}
                </EditorCard>


                <EditorCard title="Passive Editor" subtitle={selectedPassive?.label ?? 'NO PASSIVE'}>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleAddPassive} className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2 py-1 text-[0.42rem] text-ca-teal">
                        ADD PASSIVE
                      </button>
                      <button type="button" onClick={handleRemovePassive} disabled={!selectedPassive} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2 py-1 text-[0.42rem] text-ca-red disabled:opacity-50">
                        REMOVE PASSIVE
                      </button>
                    </div>
                    {(selectedFighter.passiveEffects?.length ?? 0) > 0 && selectedPassive ? (
                      <>
                        <SelectField
                          label="Selected Passive"
                          value={`${selectedPassiveIndexResolved}`}
                          options={(selectedFighter.passiveEffects ?? []).map((passive, index) => ({ value: `${index}`, label: passive.label }))}
                          onChange={(value) => setSelectedPassiveIndex(Number(value))}
                        />
                        <div className="grid gap-3 md:grid-cols-2">
                          <InputField label="Label" value={selectedPassive.label} onChange={(value) => updateSelectedPassive((passive) => { passive.label = value })} />
                          <SelectField
                            label="Trigger"
                            value={selectedPassive.trigger}
                            options={passiveTriggers.map((value) => ({ value, label: value.toUpperCase() }))}
                            onChange={(value) => updateSelectedPassive((passive) => { passive.trigger = value as PassiveTrigger })}
                          />
                          {selectedPassive.trigger === 'onTargetBelow' ? (
                            <NumberField
                              label="Threshold (%)"
                              value={Math.round((selectedPassive.threshold ?? 0.4) * 100)}
                              onChange={(value) => updateSelectedPassive((passive) => { passive.threshold = value > 0 ? value / 100 : undefined })}
                            />
                          ) : null}
                        </div>
                        <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                          <p className="ca-mono-label text-[0.4rem] text-ca-text-3">PASSIVE SUMMARY</p>
                          <p className="mt-2 text-sm leading-6 text-ca-text-2">{describePassive(selectedPassive)}</p>
                        </div>
                        <EffectListEditor
                          title="Passive Results"
                          helper="These rows fire whenever the passive trigger condition is met."
                          effects={selectedPassive.effects}
                          onChange={(effects) => updateSelectedPassiveEffects(() => effects)}
                          advancedJson={JSON.stringify(selectedPassive.effects, null, 2)}
                          onAdvancedJsonChange={(value) => updateJsonField<SkillEffect[]>(value, (parsed) => updateSelectedPassive((passive) => { passive.effects = parsed }), 'PASSIVE EFFECTS UPDATED')}
                        />
                      </>
                    ) : (
                      <p className="text-sm text-ca-text-3">This fighter has no passive effects authored.</p>
                    )}
                  </div>
                </EditorCard>

                <EditorCard title="Default Match Setup" subtitle="Launch Teams">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TeamSelectGroup
                      title="Player Team"
                      values={draft.defaultSetup.playerTeamIds}
                      roster={draft.roster}
                      accent="teal"
                      onChange={(slotIndex, value) =>
                        updateDraft((next) => {
                          next.defaultSetup.playerTeamIds[slotIndex] = value
                        })
                      }
                    />
                    <TeamSelectGroup
                      title="Enemy Team"
                      values={draft.defaultSetup.enemyTeamIds}
                      roster={draft.roster}
                      accent="red"
                      onChange={(slotIndex, value) =>
                        updateDraft((next) => {
                          next.defaultSetup.enemyTeamIds[slotIndex] = value
                        })
                      }
                    />
                  </div>
                </EditorCard>
              </>
            ) : null}
          </section>

          <section className="space-y-4">
            {selectedFighter && selectedAbility ? (
              <EditorCard title="Live Preview" subtitle={selectedFighter.shortName.toUpperCase()}>
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[5rem_minmax(0,1fr)]">
                    <PortraitPreview fighter={selectedFighter} compact />
                    <div>
                      <p className="ca-display text-[1.35rem] text-ca-text">{selectedAbility.name}</p>
                      <p className="mt-1 text-sm leading-6 text-ca-text-2">{selectedAbility.description}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(selectedAbility.effects ?? []).map((effect, index) => (
                      <div key={`${selectedAbility.id}-summary-${index}`} className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
                        <p className="ca-mono-label text-[0.36rem] text-ca-text-3">EFFECT {index + 1}</p>
                        <p className="mt-1 text-sm leading-6 text-ca-text-2">{describeEffect(effect)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </EditorCard>
            ) : null}

            <EditorCard title="Authoring Guide" subtitle="Images + Costs">
              <div className="space-y-3 text-sm leading-6 text-ca-text-2">
                <GuideRow label="Portrait" copy="Recommended 512x512. Preferred master 1024x1024. Square crop with face or upper torso centered." />
                <GuideRow label="Skill Icon" copy="Recommended 256x256. Preferred master 512x512. Keep the subject centered and avoid tiny embedded text." />
                <GuideRow label="Skill Cost" copy="You can now author cost manually. If manual cost is empty, the game falls back to the automatic cost rules." />
              </div>
            </EditorCard>

            <EditorCard title="Validation" subtitle={validationReport.errors.length > 0 ? 'Fix Before Publish' : 'Ready'}>
              <div className="space-y-2.5 max-h-[36vh] overflow-y-auto pr-1">
                {validationReport.errors.length > 0 ? (
                  validationReport.errors.map((error) => (
                    <div key={error} className="rounded-[10px] border border-ca-red/15 bg-ca-red-wash px-3 py-2 text-sm text-ca-text-2">
                      {error}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[10px] border border-ca-teal/18 bg-ca-teal-wash px-3 py-3 text-sm text-ca-text-2">
                    Draft content passes validation.
                  </div>
                )}
              </div>
            </EditorCard>

            <EditorCard title="Mechanics Inventory" subtitle="Draft Coverage">
              <div className="space-y-4">
                <InventoryBlock title="Skill Effects" items={effectTypeCounts} />
                <InventoryBlock title="Passive Triggers" items={passiveTriggerCounts} />
              </div>
            </EditorCard>
          </section>
        </div>
      </div>
    </section>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: 'teal' | 'red' | 'gold' | 'frost' }) {
  const toneClass =
    tone === 'teal'
      ? 'border-ca-teal/18 bg-ca-teal-wash text-ca-teal'
      : tone === 'red'
        ? 'border-ca-red/18 bg-ca-red-wash text-ca-red'
        : tone === 'gold'
          ? 'border-amber-400/18 bg-amber-400/10 text-amber-300'
          : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text'

  return (
    <div className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4">
      <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</p>
      <p className="ca-display mt-2 text-4xl text-ca-text">{value}</p>
      <span className={`mt-3 inline-flex rounded-md border px-2 py-1 ca-mono-label text-[0.4rem] ${toneClass}`}>{label.toUpperCase()}</span>
    </div>
  )
}

function EditorCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">{title}</p>
          <p className="ca-display mt-2 text-3xl text-ca-text">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
      />
    </label>
  )
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
  mono = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
  mono?: boolean
}) {
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={[
          'mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition focus:border-ca-teal/35"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TeamSelectGroup({
  title,
  values,
  roster,
  accent,
  onChange,
}: {
  title: string
  values: string[]
  roster: BattleFighterTemplate[]
  accent: 'teal' | 'red'
  onChange: (slotIndex: number, value: string) => void
}) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{title}</p>
      <div className="mt-3 space-y-3">
        {values.map((value, index) => (
          <label key={`${title}-${index}`} className="block">
            <span className="ca-mono-label text-[0.38rem] text-ca-text-3">SLOT {index + 1}</span>
            <select
              value={value}
              onChange={(event) => onChange(index, event.target.value)}
              className={[
                'mt-2 w-full rounded-[8px] border bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition',
                accent === 'teal' ? 'border-ca-teal/18 focus:border-ca-teal/35' : 'border-ca-red/18 focus:border-ca-red/35',
              ].join(' ')}
            >
              {roster.map((fighter) => (
                <option key={`${title}-${fighter.id}`} value={fighter.id}>
                  {fighter.shortName}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}

function StatusPill({ label, tone }: { label: string; tone: 'teal' | 'red' | 'gold' | 'frost' }) {
  const className =
    tone === 'teal'
      ? 'border-ca-teal/18 bg-ca-teal-wash text-ca-teal'
      : tone === 'red'
        ? 'border-ca-red/18 bg-ca-red-wash text-ca-red'
        : tone === 'gold'
          ? 'border-amber-400/18 bg-amber-400/10 text-amber-300'
          : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2'

  return <span className={`ca-mono-label rounded-md border px-2 py-1 text-[0.42rem] ${className}`}>{label}</span>
}

function InventoryBlock({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  return (
    <div>
      <p className="ca-mono-label text-[0.44rem] text-ca-text-3">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.label}
            className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.4rem] text-ca-text-2"
          >
            {item.label} x{item.count}
          </span>
        ))}
      </div>
    </div>
  )
}

function AssetField({
  fieldId,
  label,
  value,
  onChange,
  onImport,
  helper,
}: {
  fieldId: string
  label: string
  value: string
  onChange: (value: string) => void
  onImport: (file: File | null) => void
  helper: string
}) {
  return (
    <div>
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste an image URL or data URI"
        className="mt-2 w-full rounded-[8px] border border-white/10 bg-[rgba(11,11,18,0.72)] px-3 py-2 text-sm text-ca-text outline-none transition placeholder:text-ca-text-3 focus:border-ca-teal/35"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <label htmlFor={fieldId} className="ca-mono-label cursor-pointer rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.42rem] text-ca-teal">
          Upload Image
        </label>
        <input
          id={fieldId}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void onImport(event.target.files?.[0] ?? null)
            event.currentTarget.value = ''
          }}
        />
        <button type="button" onClick={() => onChange('')} className="ca-mono-label rounded-md border border-white/10 px-2.5 py-1.5 text-[0.42rem] text-ca-text-2">
          Clear
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-ca-text-3">{helper}</p>
    </div>
  )
}

function PortraitPreview({ fighter, compact = false }: { fighter: BattleFighterTemplate; compact?: boolean }) {
  const initial = fighter.shortName[0]?.toUpperCase() ?? '?'
  const portraitMode = Boolean(
    fighter.boardPortraitSrc &&
      (fighter.boardPortraitSrc !== fighter.renderSrc || fighter.boardPortraitSrc.startsWith('data:image')),
  )
  const frame = portraitMode ? {} : fighter.boardPortraitFrame ?? {}
  const scale = frame.scale ?? 1
  const x = frame.x ?? '0%'
  const y = frame.y ?? '0%'
  const opacity = frame.opacity ?? 1
  const width = frame.maxWidth ?? '100%'
  const sizeClass = compact ? 'h-[5rem] w-[5rem]' : 'h-[8rem] w-[8rem]'

  return (
    <div className={`relative overflow-hidden rounded-[8px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,28,0.95),rgba(8,8,12,0.98))] ${sizeClass}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(5,216,189,0.08),transparent_70%)]" />
      {fighter.boardPortraitSrc ? (
        portraitMode ? (
          <img
            src={fighter.boardPortraitSrc}
            alt={fighter.name}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            style={{ opacity }}
            draggable={false}
          />
        ) : (
          <img
            src={fighter.boardPortraitSrc}
            alt={fighter.name}
            className="pointer-events-none absolute left-1/2 top-0 h-full max-w-none select-none object-cover"
            style={{
              width,
              opacity,
              transform: `translate(-50%, 0) translate(${x}, ${y}) scale(${scale})`,
              transformOrigin: 'top center',
            }}
            draggable={false}
          />
        )
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span className="ca-display text-[2rem] text-white/35">{initial}</span>
        </div>
      )}
    </div>
  )
}

function AbilityTilePreview({ ability, large = false }: { ability: BattleAbilityTemplate; large?: boolean }) {
  const sizeClass = large ? 'h-[7.5rem] w-[7.5rem]' : 'h-[6rem] w-[6rem]'

  return (
    <div className={[
      'relative overflow-hidden rounded-[10px] border border-white/12 bg-[rgba(12,12,18,0.85)]',
      sizeClass,
    ].join(' ')}>
      {ability.icon.src ? <img src={ability.icon.src} alt={ability.name} className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.35))]" />
      <div className="absolute inset-0 grid place-items-center">
        {!ability.icon.src ? <span className="ca-mono-label text-[0.62rem] text-ca-text-2">{ability.icon.label}</span> : null}
      </div>
      <div className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-black/55 px-1.5 py-0.5">
        <span className="ca-mono-label text-[0.36rem] text-white">{ability.icon.label}</span>
      </div>
    </div>
  )
}

function FighterProfilePreview({ fighter }: { fighter: BattleFighterTemplate }) {
  const rarityTone: 'red' | 'teal' | 'frost' =
    fighter.rarity === 'SSR' || fighter.rarity === 'UR' ? 'red' : fighter.rarity === 'SR' ? 'teal' : 'frost'

  return (
    <div className="space-y-3">
      <div className="grid gap-4 rounded-[12px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,15,20,0.65),rgba(14,15,20,0.4))] px-4 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_6rem]">
        <div className="flex justify-center sm:justify-start">
          <PortraitPreview fighter={fighter} />
        </div>
        <div className="min-w-0">
          <p className="ca-display text-[1.8rem] leading-none text-ca-text sm:text-[2.1rem]">{fighter.name}</p>
          <p className="ca-mono-label mt-1 text-[0.42rem] text-ca-text-3">{fighter.battleTitle?.toUpperCase() ?? fighter.role.toUpperCase()}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusPill label={fighter.rarity} tone={rarityTone} />
            <StatusPill label={fighter.role.toUpperCase()} tone="frost" />
            <StatusPill label={fighter.affiliationLabel.toUpperCase()} tone="teal" />
          </div>
          <p className="mt-3 text-sm leading-6 text-ca-text-2">{fighter.bio}</p>
        </div>
        <div className="flex items-start justify-end">
          <div className="rounded-[10px] border border-white/10 bg-[rgba(8,9,14,0.6)] px-3 py-2 text-right">
            <p className="ca-mono-label text-[0.42rem] text-ca-text-3">HP POOL</p>
            <p className="ca-display mt-1 text-3xl text-ca-text">{fighter.maxHp}</p>
          </div>
        </div>
      </div>

      {(fighter.passiveEffects ?? []).map((passive, index) => (
        <div key={`${passive.label}-${index}`} className="rounded-[10px] border border-ca-teal/22 bg-ca-teal-wash px-3 py-3">
          <p className="ca-mono-label text-[0.42rem] text-ca-teal">PASSIVE — {passive.label.toUpperCase()}</p>
          <p className="mt-2 text-sm leading-6 text-ca-text-2">{describePassive(passive)}</p>
        </div>
      ))}

      <div className="grid gap-2 xl:grid-cols-2">
        {fighter.abilities.concat(fighter.ultimate).map((ability) => (
          <SkillProfileRow key={ability.id} ability={ability} isUltimate={fighter.ultimate.id === ability.id} />
        ))}
      </div>
    </div>
  )
}

function SkillProfileRow({ ability, isUltimate }: { ability: BattleAbilityTemplate; isUltimate: boolean }) {
  const costEntries = Object.entries(getAbilityEnergyCost(ability))
  const targetLabel = ability.targetRule.toUpperCase().replace(/-/g, ' ')

  return (
    <div
      className={[
        'overflow-hidden rounded-[10px] border',
        isUltimate ? 'border-amber-400/25 bg-[rgba(250,180,60,0.05)]' : 'border-white/10 bg-[rgba(255,255,255,0.03)]',
      ].join(' ')}
    >
      <div
        className={[
          'flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2',
          isUltimate
            ? 'bg-[linear-gradient(90deg,rgba(218,160,55,0.85),rgba(150,100,25,0.88))]'
            : 'bg-[linear-gradient(90deg,rgba(250,39,66,0.85),rgba(179,22,43,0.9))]',
        ].join(' ')}
      >
        <div className="min-w-0">
          <p className="ca-display truncate text-[1rem] leading-none text-white">{ability.name || 'Untitled Skill'}</p>
          <p className="ca-mono-label mt-1 text-[0.36rem] text-white/75">
            {isUltimate ? 'ULTIMATE TECHNIQUE' : 'CORE SKILL'} · CD {ability.cooldown}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-1">
          {costEntries.length > 0 ? (
            costEntries.map(([type, value]) => (
              <span key={type} className="ca-mono-label rounded-md border border-white/25 bg-black/30 px-1.5 py-0.5 text-[0.36rem] text-white">
                {battleEnergyMeta[type as keyof typeof battleEnergyMeta].short} {value}
              </span>
            ))
          ) : (
            <span className="ca-mono-label rounded-md border border-white/25 bg-black/30 px-1.5 py-0.5 text-[0.36rem] text-white">FREE</span>
          )}
        </div>
      </div>
      <div className="flex gap-3 px-3 py-2.5">
        <div className="flex-shrink-0">
          <AbilityTilePreview ability={ability} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-ca-text-2">{ability.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {ability.tags.map((tag) => (
              <StatusPill key={tag} label={tag} tone={tag === 'ULT' ? 'gold' : tag === 'DEBUFF' ? 'red' : 'teal'} />
            ))}
            <StatusPill label={targetLabel} tone="frost" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SkillEditorCard({
  ability,
  isUltimate,
  active,
  onSelect,
  onUpdate,
  onUpdateEffects,
  onImportIcon,
  onAdvancedEffectsJson,
}: {
  ability: BattleAbilityTemplate
  isUltimate: boolean
  active: boolean
  onSelect: () => void
  onUpdate: (mutator: (ability: BattleAbilityTemplate) => void) => void
  onUpdateEffects: (effects: SkillEffect[]) => void
  onImportIcon: (file: File | null) => void
  onAdvancedEffectsJson: (value: string) => void
}) {
  return (
    <div
      onFocus={onSelect}
      className={[
        'rounded-[14px] border transition',
        active
          ? 'border-ca-red/28 bg-[rgba(250,39,66,0.08)] shadow-[0_16px_38px_rgba(0,0,0,0.24)]'
          : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/14',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-3 rounded-t-[14px] border-b border-white/8 bg-[linear-gradient(90deg,rgba(250,39,66,0.9),rgba(179,22,43,0.92))] px-3 py-2.5 text-left"
      >
        <div>
          <p className="ca-display text-[1.1rem] leading-none text-white">{ability.name || 'Untitled Skill'}</p>
          <p className="ca-mono-label mt-1 text-[0.38rem] text-white/75">{isUltimate ? 'ULTIMATE TECHNIQUE' : 'CORE SKILL'}</p>
        </div>
        <span className="ca-mono-label rounded-md border border-white/18 bg-black/20 px-2 py-1 text-[0.38rem] text-white">CD {ability.cooldown}</span>
      </button>
      <div className="space-y-3 px-3 py-3 sm:px-4">
        <div className="grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="flex justify-center md:justify-start">
            <AbilityTilePreview ability={ability} large />
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <InputField label="Skill Name" value={ability.name} onChange={(value) => onUpdate((current) => { current.name = value; syncAbilityPresentation(current) })} />
              <NumberField label="Cooldown" value={ability.cooldown} onChange={(value) => onUpdate((current) => { current.cooldown = value })} />
              <SelectField
                label="Skill Logic"
                value={ability.kind}
                options={abilityKinds.map((value) => ({ value, label: value.toUpperCase() }))}
                onChange={(value) => onUpdate((current) => { current.kind = value as BattleAbilityKind; syncAbilityPresentation(current) })}
              />
              <SelectField
                label="Targeting"
                value={ability.targetRule}
                options={targetRules.map((value) => ({ value, label: value.toUpperCase() }))}
                onChange={(value) => onUpdate((current) => { current.targetRule = value as BattleTargetRule })}
              />
            </div>
            <InputField
              label="Tags (comma separated)"
              value={ability.tags.join(', ')}
              onChange={(value) => onUpdate((current) => {
                current.tags = value
                  .split(',')
                  .map((part) => part.trim().toUpperCase())
                  .filter((part): part is BattleAbilityTag => tagOptions.includes(part as BattleAbilityTag))
                syncAbilityPresentation(current)
              })}
            />
            <TextAreaField label="Skill Copy" value={ability.description} onChange={(value) => onUpdate((current) => { current.description = value })} rows={3} />
          </div>
        </div>

        <AssetField
          fieldId={`ability-icon-${ability.id}`}
          label="Skill Icon"
          value={ability.icon.src ?? ''}
          onChange={(value) => onUpdate((current) => { current.icon.src = value || undefined })}
          onImport={onImportIcon}
          helper="Square icon. Recommended 256x256."
        />

        <SkillCostPanel ability={ability} onUpdate={onUpdate} />

        <EffectListEditor
          title="Technique Results"
          helper="Use effect rows to describe the real in-battle outcome of this skill."
          effects={ability.effects ?? []}
          onChange={onUpdateEffects}
          advancedJson={JSON.stringify(ability.effects ?? [], null, 2)}
          onAdvancedJsonChange={onAdvancedEffectsJson}
        />
      </div>
    </div>
  )
}

function SkillCostPanel({
  ability,
  onUpdate,
}: {
  ability: BattleAbilityTemplate
  onUpdate: (mutator: (ability: BattleAbilityTemplate) => void) => void
}) {
  const manual = Boolean(ability.energyCost)
  const costEntries = Object.entries(getAbilityEnergyCost(ability))

  return (
    <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="ca-mono-label text-[0.4rem] text-ca-text-3">SKILL COST</p>
        <button
          type="button"
          onClick={() => onUpdate((current) => { current.energyCost = current.energyCost ? undefined : {} })}
          className={[
            'ca-mono-label rounded-md border px-2 py-1 text-[0.38rem] transition',
            manual
              ? 'border-ca-teal/22 bg-ca-teal-wash text-ca-teal'
              : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-2',
          ].join(' ')}
        >
          {manual ? 'MANUAL' : 'AUTO'}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {costEntries.length > 0 ? (
          costEntries.map(([type, value]) => (
            <span key={type} className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.38rem] text-ca-text-2">
              {battleEnergyMeta[type as keyof typeof battleEnergyMeta].short} {value}
            </span>
          ))
        ) : (
          <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.38rem] text-ca-text-2">FREE</span>
        )}
      </div>
      {manual ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {battleEnergyOrder.map((type) => (
            <NumberField
              key={`${ability.id}-${type}`}
              label={battleEnergyMeta[type].short}
              value={ability.energyCost?.[type] ?? 0}
              onChange={(value) => onUpdate((current) => {
                const next = { ...(current.energyCost ?? {}) }
                const sanitized = Math.max(0, Math.floor(value))
                if (sanitized === 0) {
                  delete next[type]
                } else {
                  next[type] = sanitized
                }
                current.energyCost = Object.keys(next).length > 0 ? next : {}
              })}
            />
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-ca-text-2">{explainCostRule(ability)}</p>
    </div>
  )
}

function EffectListEditor({
  title,
  helper,
  effects,
  onChange,
  advancedJson,
  onAdvancedJsonChange,
}: {
  title: string
  helper: string
  effects: SkillEffect[]
  onChange: (effects: SkillEffect[]) => void
  advancedJson: string
  onAdvancedJsonChange: (value: string) => void
}) {
  function addEffect(type: SkillEffect['type']) {
    onChange([...effects, createEffect(type)])
  }

  function updateEffect(index: number, effect: SkillEffect) {
    onChange(effects.map((entry, entryIndex) => (entryIndex === index ? effect : entry)))
  }

  function removeEffect(index: number) {
    onChange(effects.filter((_, entryIndex) => entryIndex !== index))
  }

  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
      <div>
        <p className="ca-mono-label text-[0.42rem] text-ca-text-3">{title}</p>
        <p className="mt-1 text-xs leading-5 text-ca-text-2">{helper}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['damage', 'heal', 'stun', 'burn', 'mark', 'attackUp', 'cooldownReduction', 'damageBoost'].map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addEffect(type as SkillEffect['type'])}
            className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.38rem] text-ca-text-2 hover:border-ca-teal/25 hover:text-ca-teal"
          >
            ADD {type.replace(/([A-Z])/g, ' $1').toUpperCase()}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {effects.length > 0 ? (
          effects.map((effect, index) => (
            <EffectRowEditor key={`${effect.type}-${index}`} effect={effect} index={index} onChange={(next) => updateEffect(index, next)} onRemove={() => removeEffect(index)} />
          ))
        ) : (
          <div className="rounded-[8px] border border-dashed border-white/10 px-3 py-3 text-sm text-ca-text-3">No effect rows yet. Use the add buttons above.</div>
        )}
      </div>
      <details className="mt-3 rounded-[8px] border border-white/8 bg-[rgba(11,11,18,0.6)] px-3 py-2">
        <summary className="ca-mono-label cursor-pointer text-[0.42rem] text-ca-text-2">Advanced JSON</summary>
        <div className="mt-3">
          <TextAreaField label="Effects JSON" value={advancedJson} onChange={onAdvancedJsonChange} rows={8} mono />
        </div>
      </details>
    </div>
  )
}

function EffectRowEditor({
  effect,
  index,
  onChange,
  onRemove,
}: {
  effect: SkillEffect
  index: number
  onChange: (effect: SkillEffect) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-[rgba(11,11,18,0.72)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="ca-mono-label text-[0.42rem] text-ca-text-3">Effect {index + 1}</p>
        <button type="button" onClick={onRemove} className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-2 py-1 text-[0.38rem] text-ca-red">REMOVE</button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SelectField label="Type" value={effect.type} options={effectTypes.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...createEffect(value as SkillEffect['type']), target: effect.target })} />
        <SelectField label="Target" value={effect.target} options={effectTargets.map((value) => ({ value, label: value.toUpperCase() }))} onChange={(value) => onChange({ ...effect, target: value as SkillEffect['target'] })} />
        {effect.type === 'damage' || effect.type === 'heal' ? <NumberField label={effect.type === 'damage' ? 'Damage' : 'Healing'} value={effect.power} onChange={(value) => onChange({ ...effect, power: value })} /> : null}
        {effect.type === 'invulnerable' || effect.type === 'stun' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'attackUp' ? <NumberField label="Damage Bonus" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'attackUp' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'mark' ? <NumberField label="Bonus Damage" value={effect.bonus} onChange={(value) => onChange({ ...effect, bonus: value })} /> : null}
        {effect.type === 'mark' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'burn' ? <NumberField label="Tick Damage" value={effect.damage} onChange={(value) => onChange({ ...effect, damage: value })} /> : null}
        {effect.type === 'burn' ? <NumberField label="Duration" value={effect.duration} onChange={(value) => onChange({ ...effect, duration: value })} /> : null}
        {effect.type === 'cooldownReduction' ? <NumberField label="Cooldowns Reduced" value={effect.amount} onChange={(value) => onChange({ ...effect, amount: value })} /> : null}
        {effect.type === 'damageBoost' ? <NumberField label="Boost %" value={Math.round(effect.amount * 100)} onChange={(value) => onChange({ ...effect, amount: value / 100 })} /> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-ca-text-2">{describeEffect(effect)}</p>
    </div>
  )
}

function GuideRow({ label, copy }: { label: string; copy: string }) {
  return (
    <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</p>
      <p className="mt-1 text-sm leading-6 text-ca-text-2">{copy}</p>
    </div>
  )
}

function countEffectTypes(effects: SkillEffect[]) {
  const counts = new Map<string, number>()
  effects.forEach((effect) => {
    counts.set(effect.type, (counts.get(effect.type) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label: label.toUpperCase(), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function countPassiveTriggers(passives: PassiveEffect[]) {
  const counts = new Map<string, number>()
  passives.forEach((passive) => {
    counts.set(passive.trigger, (counts.get(passive.trigger) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label: label.toUpperCase(), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}
