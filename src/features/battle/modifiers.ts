import type {
  BattleFighterState,
  BattleModifierDuration,
  BattleModifierFilter,
  BattleModifierInstance,
  BattleModifierMode,
  BattleModifierScope,
  BattleModifierStat,
  BattleModifierTemplate,
  BattleModifierValue,
  BattleSkillDamageType,
  BattleState,
  BattleStatuses,
  BattleStatus,
  BattleStatusKind,
  BattleTeamId,
} from '@/features/battle/types.ts'

function createModifierId(scope: BattleModifierScope, targetId: string | undefined, label: string, index: number) {
  return `modifier-${scope}-${targetId ?? 'global'}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`
}

function cloneModifierDuration(duration: BattleModifierDuration): BattleModifierDuration {
  if (duration.kind === 'rounds') {
    return { kind: 'rounds', remaining: duration.remaining }
  }

  return { ...duration }
}

function instantiateDuration(duration: BattleModifierTemplate['duration']): BattleModifierDuration {
  if (duration.kind === 'rounds') {
    return { kind: 'rounds', remaining: duration.rounds }
  }

  return { ...duration }
}

function getDurationValue(duration: BattleModifierDuration) {
  if (duration.kind === 'rounds') return Math.max(0, duration.remaining)
  if (duration.kind === 'permanent') return Number.MAX_SAFE_INTEGER
  return Number.MAX_SAFE_INTEGER - 1
}

function mergeDuration(current: BattleModifierDuration, next: BattleModifierDuration): BattleModifierDuration {
  if (current.kind === 'permanent' || next.kind === 'permanent') return { kind: 'permanent' }
  if (current.kind === 'untilRemoved' || next.kind === 'untilRemoved') return { kind: 'untilRemoved' }
  return { kind: 'rounds', remaining: Math.max(current.remaining, next.remaining) }
}

function mergeValue(current: BattleModifierValue, next: BattleModifierValue) {
  if (typeof current === 'number' && typeof next === 'number') {
    return Math.max(current, next)
  }

  if (typeof current === 'boolean' && typeof next === 'boolean') {
    return current || next
  }

  return next
}

function getModifierKey(modifier: Pick<BattleModifierInstance, 'scope' | 'targetId' | 'label' | 'stat' | 'mode' | 'statusKind' | 'tags' | 'damageClass'>) {
  return [
    modifier.scope,
    modifier.targetId ?? 'global',
    modifier.label,
    modifier.stat,
    modifier.mode,
    modifier.statusKind ?? 'none',
    modifier.damageClass ?? 'any',
    [...modifier.tags].sort().join('|'),
  ].join('::')
}

function isRoundModifier(duration: BattleModifierDuration): duration is Extract<BattleModifierDuration, { kind: 'rounds' }> {
  return duration.kind === 'rounds'
}

function getStatusValue(modifier: BattleModifierInstance) {
  return typeof modifier.value === 'number' ? modifier.value : 0
}

function buildStatus(kind: 'stun' | 'invincible', modifiers: BattleModifierInstance[]): BattleStatus | null
function buildStatus(kind: 'mark', modifiers: BattleModifierInstance[]): Extract<BattleStatus, { kind: 'mark' }> | null
function buildStatus(kind: 'burn', modifiers: BattleModifierInstance[]): Extract<BattleStatus, { kind: 'burn' }> | null
function buildStatus(kind: 'attackUp', modifiers: BattleModifierInstance[]): Extract<BattleStatus, { kind: 'attackUp' }> | null
function buildStatus(kind: BattleStatusKind, modifiers: BattleModifierInstance[]): BattleStatus | null {
  if (modifiers.length === 0) return null

  const duration = Math.max(...modifiers.map((modifier) => getDurationValue(modifier.duration)))
  if (duration <= 0) return null

  if (kind === 'stun' || kind === 'invincible') {
    return { kind, duration }
  }

  const amount = Math.max(...modifiers.map(getStatusValue))
  if (kind === 'mark') {
    return { kind: 'mark', duration, bonus: amount }
  }

  if (kind === 'burn') {
    return { kind: 'burn', duration, damage: amount }
  }

  return { kind: 'attackUp', duration, amount }
}

export function createModifiers(): BattleModifierInstance[] {
  return []
}

export function cloneModifiers(modifiers: BattleModifierInstance[]): BattleModifierInstance[] {
  return modifiers.map((modifier) => ({
    ...modifier,
    duration: cloneModifierDuration(modifier.duration),
    tags: [...modifier.tags],
    damageClass: modifier.damageClass,
  }))
}

export function createModifierInstance(
  template: BattleModifierTemplate,
  params: {
    sourceActorId?: string
    sourceAbilityId?: string
    scope?: BattleModifierScope
    targetId?: string
    nextIndex?: number
  } = {},
): BattleModifierInstance {
  const scope = params.scope ?? template.scope ?? 'fighter'
  const targetId = scope === 'fighter' ? params.targetId : undefined
  const id = createModifierId(scope, targetId, template.label, params.nextIndex ?? 0)

  return {
    id,
    label: template.label,
    sourceActorId: params.sourceActorId,
    sourceAbilityId: params.sourceAbilityId,
    scope,
    targetId,
    stat: template.stat,
    mode: template.mode,
    value: template.value,
    duration: instantiateDuration(template.duration),
    tags: [...template.tags],
    visible: template.visible ?? Boolean(template.statusKind),
    stacking: template.stacking ?? 'max',
    statusKind: template.statusKind,
    damageClass: template.damageClass,
  }
}

export function upsertModifier(modifiers: BattleModifierInstance[], next: BattleModifierInstance): BattleModifierInstance[] {
  if (next.stacking === 'stack') {
    return [...modifiers, next]
  }

  const key = getModifierKey(next)
  const currentIndex = modifiers.findIndex((modifier) => getModifierKey(modifier) === key)
  if (currentIndex === -1) {
    return [...modifiers, next]
  }

  if (next.stacking === 'replace') {
    return modifiers.map((modifier, index) => (index === currentIndex ? next : modifier))
  }

  return modifiers.map((modifier, index) => {
    if (index !== currentIndex) return modifier
    return {
      ...modifier,
      value: mergeValue(modifier.value, next.value),
      duration: mergeDuration(modifier.duration, next.duration),
      visible: modifier.visible || next.visible,
      tags: Array.from(new Set([...modifier.tags, ...next.tags])),
      sourceActorId: next.sourceActorId ?? modifier.sourceActorId,
      sourceAbilityId: next.sourceAbilityId ?? modifier.sourceAbilityId,
    }
  })
}

export function modifierMatchesFilter(modifier: BattleModifierInstance, filter: BattleModifierFilter) {
  if (filter.label && modifier.label !== filter.label) return false
  if (filter.scope && modifier.scope !== filter.scope) return false
  if (filter.stat && modifier.stat !== filter.stat) return false
  if (filter.sourceAbilityId && modifier.sourceAbilityId !== filter.sourceAbilityId) return false
  if (filter.sourceActorId && modifier.sourceActorId !== filter.sourceActorId) return false
  if (filter.statusKind && modifier.statusKind !== filter.statusKind) return false
  if ((filter.tags ?? []).some((tag) => !modifier.tags.includes(tag))) return false
  return true
}

export function sumNumericModifierValuesForClass(
  modifiers: BattleModifierInstance[],
  stat: BattleModifierStat,
  mode: Exclude<BattleModifierMode, 'set'>,
  incomingClass: BattleSkillDamageType | undefined,
  filter: { tags?: string[]; statusKind?: BattleStatusKind } = {},
) {
  return modifiers.reduce((total, modifier) => {
    if (modifier.stat !== stat || modifier.mode !== mode || typeof modifier.value !== 'number') return total
    if (modifier.damageClass && modifier.damageClass !== incomingClass) return total
    if (filter.statusKind && modifier.statusKind !== filter.statusKind) return total
    if ((filter.tags ?? []).some((tag) => !modifier.tags.includes(tag))) return total
    return total + modifier.value
  }, 0)
}

export function getNumericModifierMultiplierForClass(
  modifiers: BattleModifierInstance[],
  stat: BattleModifierStat,
  incomingClass: BattleSkillDamageType | undefined,
  filter: { tags?: string[]; statusKind?: BattleStatusKind } = {},
) {
  return modifiers.reduce((total, modifier) => {
    if (modifier.stat !== stat || modifier.mode !== 'multiplier' || typeof modifier.value !== 'number') return total
    if (modifier.damageClass && modifier.damageClass !== incomingClass) return total
    if (filter.statusKind && modifier.statusKind !== filter.statusKind) return total
    if ((filter.tags ?? []).some((tag) => !modifier.tags.includes(tag))) return total
    return total * modifier.value
  }, 1)
}

export function hasBooleanModifierForStat(
  modifiers: BattleModifierInstance[],
  stat: BattleModifierStat,
  expected: boolean,
) {
  return modifiers.some((modifier) => {
    if (modifier.stat !== stat || modifier.mode !== 'set' || typeof modifier.value !== 'boolean') return false
    return modifier.value === expected
  })
}

export function removeModifiers(modifiers: BattleModifierInstance[], filter: BattleModifierFilter) {
  const removed: BattleModifierInstance[] = []
  const next = modifiers.filter((modifier) => {
    if (!modifierMatchesFilter(modifier, filter)) return true
    removed.push(modifier)
    return false
  })

  return { modifiers: next, removed }
}

export function tickModifiers(modifiers: BattleModifierInstance[], round?: number) {
  const expired: BattleModifierInstance[] = []
  const next: BattleModifierInstance[] = []

  modifiers.forEach((modifier) => {
    if (!isRoundModifier(modifier.duration)) {
      next.push(modifier)
      return
    }

    // Skip the first end-of-round tick for disabling statuses so "stun for
    // N turns" reliably means N victim turns.
    if (round !== undefined && modifier.appliedInRound === round) {
      next.push(modifier)
      return
    }

    const updated: BattleModifierInstance = {
      ...modifier,
      duration: { kind: 'rounds', remaining: Math.max(0, modifier.duration.remaining - 1) },
    }

    if (updated.duration.kind === 'rounds' && updated.duration.remaining > 0) {
      next.push(updated)
      return
    }

    expired.push(updated)
  })

  return { modifiers: next, expired }
}

export function getTeamModifierBucket(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.playerTeamModifiers : state.enemyTeamModifiers
}

export function setTeamModifierBucket(state: BattleState, team: BattleTeamId, modifiers: BattleModifierInstance[]) {
  if (team === 'player') {
    state.playerTeamModifiers = modifiers
  } else {
    state.enemyTeamModifiers = modifiers
  }
}

export function getFighterModifierPool(state: BattleState, fighter: BattleFighterState) {
  return fighter.modifiers.concat(getTeamModifierBucket(state, fighter.team), state.battlefieldModifiers)
}

export function sumNumericModifierValues(
  modifiers: BattleModifierInstance[],
  stat: BattleModifierStat,
  mode: Exclude<BattleModifierMode, 'set'>,
  filter: { tags?: string[]; statusKind?: BattleStatusKind } = {},
) {
  return modifiers.reduce((total, modifier) => {
    if (modifier.stat !== stat || modifier.mode !== mode || typeof modifier.value !== 'number') return total
    if (filter.statusKind && modifier.statusKind !== filter.statusKind) return total
    if ((filter.tags ?? []).some((tag) => !modifier.tags.includes(tag))) return total
    return total + modifier.value
  }, 0)
}

export function getNumericModifierMultiplier(
  modifiers: BattleModifierInstance[],
  stat: BattleModifierStat,
  filter: { tags?: string[]; statusKind?: BattleStatusKind } = {},
) {
  return modifiers.reduce((total, modifier) => {
    if (modifier.stat !== stat || modifier.mode !== 'multiplier' || typeof modifier.value !== 'number') return total
    if (filter.statusKind && modifier.statusKind !== filter.statusKind) return total
    if ((filter.tags ?? []).some((tag) => !modifier.tags.includes(tag))) return total
    return total * modifier.value
  }, 1)
}

export function hasBooleanModifierValue(
  modifiers: BattleModifierInstance[],
  stat: BattleModifierStat,
  expected: boolean,
  filter: { statusKind?: BattleStatusKind } = {},
) {
  return modifiers.some((modifier) => {
    if (modifier.stat !== stat || modifier.mode !== 'set' || typeof modifier.value !== 'boolean') return false
    if (filter.statusKind && modifier.statusKind !== filter.statusKind) return false
    return modifier.value === expected
  })
}

export function hasModifierStatus(modifiers: BattleModifierInstance[], statusKind: BattleStatusKind) {
  return modifiers.some((modifier) => modifier.statusKind === statusKind)
}

export function buildStatusesFromModifiers(modifiers: BattleModifierInstance[]): BattleStatuses {
  const statuses: BattleStatuses = []
  const stun = buildStatus('stun', modifiers.filter((modifier) => modifier.statusKind === 'stun'))
  const invincible = buildStatus('invincible', modifiers.filter((modifier) => modifier.statusKind === 'invincible'))
  const mark = buildStatus('mark', modifiers.filter((modifier) => modifier.statusKind === 'mark'))
  const burn = buildStatus('burn', modifiers.filter((modifier) => modifier.statusKind === 'burn'))
  const attackUp = buildStatus('attackUp', modifiers.filter((modifier) => modifier.statusKind === 'attackUp'))

  if (stun) statuses.push(stun)
  if (invincible) statuses.push(invincible)
  if (mark) statuses.push(mark)
  if (burn) statuses.push(burn)
  if (attackUp) statuses.push(attackUp)

  return statuses
}

export function syncFighterStatusesFromModifiers(fighter: BattleFighterState) {
  fighter.statuses = buildStatusesFromModifiers(fighter.modifiers)
  return fighter
}

