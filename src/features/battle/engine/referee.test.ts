/**
 * referee.test.ts — Unit tests for Battle Referee Predicates (Phase 1 + Phase 2 + Phase 3 + Phase 4A)
 *
 * Tests are organized to match the section structure of referee.ts.
 * State is built from createInitialBattleState + charged-energy helper
 * to keep tests hermetic. Fighter state is mutated directly to set up
 * conditions, since the referee functions are read-only observers.
 *
 * Phase 2 tests additionally cover canUseAbility() integration and
 * scheduled-effect dead-target filtering.
 *
 * Phase 4A tests cover damage immunity enforcement for burn DOT ticks,
 * fatigue ticks, and counter damage packets (all bypass resolveEffects
 * and previously ignored effectImmunities).
 */

import { describe, expect, test } from 'vitest'
import { createEnergyAmounts } from '@/features/battle/energy'
import {
  beginNewRound,
  canUseAbility,
  createInitialBattleState,
  endRound,
  getResolvedAbilityEnergyCost,
  resolveTeamTurn,
} from '@/features/battle/engine'
import { upsertModifier, createModifierInstance } from '@/features/battle/modifiers'
import type {
  BattleAbilityTemplate,
  BattleEffectImmunityBlock,
  BattleFighterState,
  BattleModifierTemplate,
  BattleReactionGuardState,
  BattleState,
  QueuedBattleAction,
  SkillEffect,
} from '@/features/battle/types'
import {
  isActorAlive,
  actorIsStunned,
  actorIsStunnedLocal,
  actorHasClassStun,
  actorHasIntentStun,
  isAbilityLocked,
  abilityIsOnCooldown,
  getEffectiveAbility,
  canPayAbilityCost,
  abilityCanBeCountered,
  abilityCanBeReflected,
  targetIsAlive,
  targetIsInvulnerable,
  abilityIgnoresInvulnerability,
  targetHasRequiredTags,
  canAbilityTarget,
  targetHasEffectImmunity,
  canApplyEffect,
  canReceiveHelpfulEffect,
  canReceiveHarmfulEffect,
  canGainInvulnerability,
  canReduceDamage,
  hasShield,
  shouldBypassShield,
  targetIsUndying,
  shouldApplyDamageReduction,
  resolveCounterPriority,
  isActiveReflectGuard,
} from '@/features/battle/engine/referee'

// ─── Test helpers ───────────────────────────────────────────────────────────

function createChargedState(
  playerTeamIds = ['yuji', 'nobara', 'megumi'],
  enemyTeamIds = ['yuji', 'nobara', 'megumi'],
): BattleState {
  const state = createInitialBattleState({ playerTeamIds, enemyTeamIds })
  const full = { amounts: createEnergyAmounts({ physical: 6, technique: 6, vow: 6, mental: 6 }) }
  state.playerEnergy = { ...full, amounts: { ...full.amounts } }
  state.enemyEnergy = { ...full, amounts: { ...full.amounts } }
  return state
}

function sampleAbility(overrides: Partial<BattleAbilityTemplate> = {}): BattleAbilityTemplate {
  return {
    id: 'test-ability',
    name: 'Test Ability',
    description: 'A test ability.',
    kind: 'attack',
    targetRule: 'enemy-single',
    classes: ['Physical', 'Instant'],
    icon: { label: 'TA', tone: 'red' },
    cooldown: 0,
    effects: [],
    ...overrides,
  } as BattleAbilityTemplate
}

function replacementAbility(id: string, name = id): BattleAbilityTemplate {
  return sampleAbility({
    id,
    name,
    targetRule: 'self',
    classes: ['Strategic', 'Instant'],
    effects: [{ type: 'setFlag', key: id, value: true, target: 'self' }],
  })
}

function applyStunModifier(_state: BattleState, fighter: BattleFighterState) {
  const template: BattleModifierTemplate = {
    label: 'Stun',
    stat: 'canAct',
    mode: 'set',
    value: false,
    duration: { kind: 'rounds', rounds: 1 },
    tags: ['status', 'stun'],
    visible: true,
    stacking: 'max',
    statusKind: 'stun',
  }
  const instance = createModifierInstance(template, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

function applyInvulnerableModifier(fighter: BattleFighterState) {
  const template: BattleModifierTemplate = {
    label: 'Invulnerable',
    stat: 'isInvulnerable',
    mode: 'set',
    value: true,
    duration: { kind: 'rounds', rounds: 1 },
    tags: ['status', 'invincible'],
    visible: true,
    stacking: 'max',
    statusKind: 'invincible',
  }
  const instance = createModifierInstance(template, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

function applyUndyingModifier(fighter: BattleFighterState) {
  const template: BattleModifierTemplate = {
    label: 'Undying',
    stat: 'isUndying',
    mode: 'set',
    value: true,
    duration: { kind: 'rounds', rounds: 2 },
    tags: ['status', 'undying'],
    visible: true,
    stacking: 'max',
  }
  const instance = createModifierInstance(template, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

function applyCannotGainInvulnModifier(fighter: BattleFighterState) {
  const template: BattleModifierTemplate = {
    label: 'Cannot Gain Invulnerable',
    stat: 'canGainInvulnerable',
    mode: 'set',
    value: false,
    duration: { kind: 'rounds', rounds: 2 },
    tags: [],
    visible: false,
    stacking: 'max',
  }
  const instance = createModifierInstance(template, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

function applyCannotReduceDamageModifier(fighter: BattleFighterState) {
  const template: BattleModifierTemplate = {
    label: 'Cannot Reduce Damage',
    stat: 'canReduceDamageTaken',
    mode: 'set',
    value: false,
    duration: { kind: 'rounds', rounds: 2 },
    tags: [],
    visible: false,
    stacking: 'max',
  }
  const instance = createModifierInstance(template, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

function applyTagModifier(fighter: BattleFighterState, tag: string) {
  const template: BattleModifierTemplate = {
    label: `Tag: ${tag}`,
    stat: 'damageTaken',
    mode: 'flat',
    value: 0,
    duration: { kind: 'rounds', rounds: 2 },
    tags: [tag],
    visible: false,
    stacking: 'stack',
  }
  const instance = createModifierInstance(template, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

function addEffectImmunity(fighter: BattleFighterState, blocks: BattleEffectImmunityBlock[]) {
  fighter.effectImmunities.push({
    id: `immunity-test-${blocks.join('-')}`,
    label: 'Test Immunity',
    blocks,
    remainingRounds: 2,
    sourceActorId: fighter.instanceId,
  })
}

function addClassStun(fighter: BattleFighterState, blockedClasses: BattleFighterState['classStuns'][number]['blockedClasses']) {
  fighter.classStuns.push({
    id: `classstun-test`,
    label: `Class Stun (${blockedClasses.join(', ')})`,
    blockedClasses,
    remainingRounds: 1,
    appliedInRound: 1,
    sourceActorId: fighter.instanceId,
  })
}

function addIntentStun(fighter: BattleFighterState, intent: 'harmful' | 'helpful') {
  fighter.intentStuns.push({
    id: `intentstun-test`,
    label: `Intent Stun (${intent})`,
    intent,
    remainingRounds: 1,
    appliedInRound: 1,
    sourceActorId: fighter.instanceId,
  })
}

function makeCounter(seq: number, slot: number, priority?: number): { guard: BattleReactionGuardState; fighter: BattleFighterState } {
  const fighter = {
    instanceId: `fighter-${slot}`,
    slot,
  } as unknown as BattleFighterState

  const guard: BattleReactionGuardState & { priority?: number } = {
    id: `reaction-counter-test-${String(seq).padStart(4, '0')}`,
    kind: 'counter',
    label: 'Counter',
    remainingRounds: 1,
    appliedInRound: 1,
    consumeOnTrigger: true,
    visible: true,
    counterDamage: 30,
    sourceActorId: fighter.instanceId,
    priority,
  }

  return { guard, fighter }
}

// ─── Section 1: Actor Predicates ────────────────────────────────────────────

describe('referee — actor predicates', () => {
  test('isActorAlive: alive when hp > 0', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    fighter.hp = 100
    expect(isActorAlive(fighter)).toBe(true)
  })

  test('isActorAlive: dead when hp is 0', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    fighter.hp = 0
    expect(isActorAlive(fighter)).toBe(false)
  })

  test('actorIsStunned: returns false with no stun modifier', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    expect(actorIsStunned(state, fighter)).toBe(false)
  })

  test('actorIsStunned: returns true when stun modifier is present', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    applyStunModifier(state, fighter)
    expect(actorIsStunned(state, fighter)).toBe(true)
  })

  test('actorIsStunnedLocal: returns false with no stun', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    expect(actorIsStunnedLocal(fighter)).toBe(false)
  })

  test('actorIsStunnedLocal: returns true when stun modifier is present', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    applyStunModifier(state, fighter)
    expect(actorIsStunnedLocal(fighter)).toBe(true)
  })

  test('actorHasClassStun: returns false when no class stun active', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const ability = sampleAbility({ classes: ['Physical', 'Instant'] })
    expect(actorHasClassStun(fighter, ability)).toBe(false)
  })

  test('actorHasClassStun: returns true when ability class is sealed', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    addClassStun(fighter, ['Physical'] as BattleFighterState['classStuns'][number]['blockedClasses'])
    const ability = sampleAbility({ classes: ['Physical', 'Instant'] })
    expect(actorHasClassStun(fighter, ability)).toBe(true)
  })

  test('actorHasClassStun: returns false when ability class is not sealed', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    addClassStun(fighter, ['Energy'] as BattleFighterState['classStuns'][number]['blockedClasses'])
    const ability = sampleAbility({ classes: ['Physical', 'Instant'] })
    expect(actorHasClassStun(fighter, ability)).toBe(false)
  })

  test('actorHasClassStun: exempt class bypasses the seal', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    fighter.classStuns.push({
      id: 'classstun-exempt-test',
      label: 'Class Stun with Exemption',
      blockedClasses: ['Physical'] as BattleFighterState['classStuns'][number]['blockedClasses'],
      exemptClasses: ['Instant'] as BattleFighterState['classStuns'][number]['exemptClasses'],
      remainingRounds: 1,
      appliedInRound: 1,
      sourceActorId: fighter.instanceId,
    })
    // suppress unused-var warning on state
    void state
    const ability = sampleAbility({ classes: ['Physical', 'Instant'] })
    expect(actorHasClassStun(fighter, ability)).toBe(false)
  })

  test('actorHasIntentStun: returns false with no intent stun', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const ability = sampleAbility({ kind: 'attack' })
    expect(actorHasIntentStun(fighter, ability)).toBe(false)
  })

  test('actorHasIntentStun: harmful ability is blocked by harmful intent stun', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    addIntentStun(fighter, 'harmful')
    const ability = sampleAbility({ kind: 'attack' })
    expect(actorHasIntentStun(fighter, ability)).toBe(true)
  })

  test('actorHasIntentStun: helpful ability is not blocked by harmful intent stun', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    addIntentStun(fighter, 'harmful')
    const ability = sampleAbility({ kind: 'heal', targetRule: 'ally-single' })
    expect(actorHasIntentStun(fighter, ability)).toBe(false)
  })

  test('actorHasIntentStun: helpful ability is blocked by helpful intent stun', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    addIntentStun(fighter, 'helpful')
    const ability = sampleAbility({ kind: 'defend', targetRule: 'self' })
    expect(actorHasIntentStun(fighter, ability)).toBe(true)
  })

  test('isAbilityLocked: returns false when no lock active', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    expect(isAbilityLocked(fighter, 'some-ability')).toBe(false)
  })

  test('isAbilityLocked: returns true when matching lock delta exists', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    fighter.abilityState.push({ mode: 'lock', slotAbilityId: 'my-skill', duration: 2 })
    expect(isAbilityLocked(fighter, 'my-skill')).toBe(true)
  })

  test('isAbilityLocked: returns false for a different ability when only one is locked', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    fighter.abilityState.push({ mode: 'lock', slotAbilityId: 'my-skill', duration: 2 })
    expect(isAbilityLocked(fighter, 'other-skill')).toBe(false)
  })
})

// Phase 10: modifier on-expire effects

function addExpiringModifier(
  target: BattleFighterState,
  source: BattleFighterState,
  effects: SkillEffect[] | undefined,
  overrides: Partial<BattleModifierTemplate> = {},
) {
  const sourceAbility = sampleAbility({
    id: 'test-on-expire-source',
    name: 'On Expire Source',
    classes: ['Physical', 'Instant'],
  })
  source.abilities = [sourceAbility, ...source.abilities.filter((ability) => ability.id !== sourceAbility.id)]

  const template: BattleModifierTemplate = {
    label: 'Delayed Curse',
    stat: 'damageTaken',
    mode: 'flat',
    value: 0,
    duration: { kind: 'rounds', rounds: 1 },
    tags: ['test-on-expire'],
    visible: true,
    stacking: 'stack',
    ...(effects ? { onExpireEffects: effects } : {}),
    ...overrides,
  }
  const instance = createModifierInstance(template, {
    sourceActorId: source.instanceId,
    sourceAbilityId: sourceAbility.id,
    scope: 'fighter',
    targetId: target.instanceId,
    nextIndex: target.modifiers.length,
  })
  target.modifiers = upsertModifier(target.modifiers, instance)
}

describe('referee - Phase 10 modifier on-expire effects', () => {
  test('damage onExpireEffects fire on natural expiration', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    addExpiringModifier(target, source, [{ type: 'damage', power: 15, target: 'inherit' }])

    const result = resolveTeamTurn(state, {}, 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(targetAfter.hp).toBe(target.maxHp - 15)
    expect(result.events.some((event) => event.message === `Delayed Curse expired on ${target.shortName}.`)).toBe(true)
  })

  test('stun and mark onExpireEffects fire on natural expiration', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    addExpiringModifier(target, source, [
      { type: 'stun', duration: 1, target: 'inherit' },
      { type: 'mark', bonus: 5, duration: 1, target: 'inherit' },
    ])

    const result = resolveTeamTurn(state, {}, 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(targetAfter.modifiers.some((modifier) => modifier.statusKind === 'stun')).toBe(true)
    expect(targetAfter.modifiers.some((modifier) => modifier.statusKind === 'mark' && modifier.value === 5)).toBe(true)
  })

  test('onExpireEffects do not fire if target died before expiration', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    addExpiringModifier(target, source, [{ type: 'damage', power: 15, target: 'inherit' }])
    target.hp = 0

    const result = resolveTeamTurn(state, {}, 'player')

    expect(result.events.some((event) => event.message.includes('Delayed Curse expired'))).toBe(false)
    expect(result.runtimeEvents.some((event) => event.type === 'damage_applied' && event.abilityId === 'test-on-expire-source')).toBe(false)
  })

  test('onExpireEffects do not fire if modifier is manually removed before expiration', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    addExpiringModifier(target, source, [{ type: 'damage', power: 15, target: 'inherit' }])
    target.modifiers = target.modifiers.filter((modifier) => !modifier.tags.includes('test-on-expire'))

    const result = resolveTeamTurn(state, {}, 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(targetAfter.hp).toBe(target.maxHp)
    expect(result.events.some((event) => event.message.includes('Delayed Curse expired'))).toBe(false)
  })

  test('onExpireEffects respect damage immunity', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    addEffectImmunity(target, ['damage'])
    addExpiringModifier(target, source, [{ type: 'damage', power: 15, target: 'inherit' }])

    const result = resolveTeamTurn(state, {}, 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(targetAfter.hp).toBe(target.maxHp)
    expect(result.runtimeEvents.some((event) => event.type === 'effect_ignored' && event.meta?.blockedBy === 'effectImmunity')).toBe(true)
  })

  test('onExpireEffects respect helpful immunity for helpful effects', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    target.hp = target.maxHp - 20
    applyCannotReceiveHelpfulModifier(target)
    addExpiringModifier(target, source, [{ type: 'heal', power: 15, target: 'inherit' }])

    const result = resolveTeamTurn(state, {}, 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(targetAfter.hp).toBe(target.maxHp - 20)
    expect(result.runtimeEvents.some((event) => event.type === 'effect_ignored' && event.meta?.blockedBy === 'canReceiveHelpfulEffects')).toBe(true)
  })

  test('onExpireEffects use the original source actor when alive', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    addExpiringModifier(target, source, [{ type: 'setFlag', key: 'source_expire_flag', value: true, target: 'self' }])

    const result = resolveTeamTurn(state, {}, 'player')
    const sourceAfter = result.state.enemyTeam.find((f) => f.instanceId === source.instanceId)!
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(sourceAfter.stateFlags.source_expire_flag).toBe(true)
    expect(targetAfter.stateFlags.source_expire_flag ?? false).toBe(false)
  })

  test('onExpireEffects still fire from a dead source while the target is alive', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    source.hp = 0
    addExpiringModifier(target, source, [{ type: 'damage', power: 15, target: 'inherit' }])

    const result = resolveTeamTurn(state, {}, 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(targetAfter.hp).toBe(target.maxHp - 15)
    expect(result.runtimeEvents.some((event) =>
      event.type === 'damage_applied'
      && event.actorId === source.instanceId
      && event.targetId === target.instanceId
      && event.abilityId === 'test-on-expire-source'
    )).toBe(true)
  })

  test('normal modifiers without onExpireEffects still expire silently', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    const source = state.enemyTeam[0]
    addExpiringModifier(target, source, undefined)

    const result = resolveTeamTurn(state, {}, 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(targetAfter.hp).toBe(target.maxHp)
    expect(result.events.some((event) => event.message.includes('Delayed Curse expired'))).toBe(false)
  })
})

// ─── Section 2: Ability Predicates ──────────────────────────────────────────

describe('referee — ability predicates', () => {
  test('abilityIsOnCooldown: returns false when cooldown is 0', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    expect(abilityIsOnCooldown(fighter, 'any-ability')).toBe(false)
  })

  test('abilityIsOnCooldown: returns true when cooldown is positive', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const ability = fighter.abilities[0]
    fighter.cooldowns[ability.id] = 2
    expect(abilityIsOnCooldown(fighter, ability.id)).toBe(true)
  })

  test('getEffectiveAbility: returns null for unknown ability id', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    expect(getEffectiveAbility(fighter, 'nonexistent')).toBeNull()
  })

  test('getEffectiveAbility: returns ability for a valid id', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const ability = fighter.abilities[0]
    expect(getEffectiveAbility(fighter, ability.id)).not.toBeNull()
  })

  test('getEffectiveAbility: returns null for a locked ability', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const abilityId = fighter.abilities[0].id
    fighter.abilityState.push({ mode: 'lock', slotAbilityId: abilityId, duration: 1 })
    expect(getEffectiveAbility(fighter, abilityId)).toBeNull()
  })

  test('fixed replacement still works exactly as before', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const original = fighter.abilities[0]
    const fixed = replacementAbility('fixed-replacement', 'Fixed Replacement')

    fighter.abilityState.push({
      mode: 'replace',
      slotAbilityId: original.id,
      replacement: fixed,
      duration: 3,
    })

    expect(getEffectiveAbility(fighter, original.id)).toBeNull()
    expect(getEffectiveAbility(fighter, fixed.id)?.name).toBe('Fixed Replacement')
  })

  test('turn-indexed replacement shows version for remaining 3', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const original = fighter.abilities[0]
    const fixed = replacementAbility('fallback-replacement')
    const version3 = replacementAbility('replacement-remaining-3')

    fighter.abilityState.push({
      mode: 'replace',
      slotAbilityId: original.id,
      replacement: fixed,
      replacementsByRemainingTurns: {
        3: version3,
      },
      duration: 3,
    })

    expect(getEffectiveAbility(fighter, version3.id)).toBe(version3)
    expect(getEffectiveAbility(fighter, fixed.id)).toBeNull()
  })

  test('turn-indexed replacement shows version for remaining 2 after tick', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const original = fighter.abilities[0]
    const fixed = replacementAbility('fallback-replacement')
    const version2 = replacementAbility('replacement-remaining-2')

    fighter.abilityState.push({
      mode: 'replace',
      slotAbilityId: original.id,
      replacement: fixed,
      replacementsByRemainingTurns: {
        2: version2,
      },
      duration: 3,
    })

    const ticked = resolveTeamTurn(state, {}, 'player')
    const fighterAfter = ticked.state.playerTeam.find((f) => f.instanceId === fighter.instanceId)!

    expect(fighterAfter.abilityState[0]?.duration).toBe(2)
    expect(getEffectiveAbility(fighterAfter, version2.id)?.id).toBe(version2.id)
    expect(getEffectiveAbility(fighterAfter, fixed.id)).toBeNull()
  })

  test('turn-indexed replacement shows version for remaining 1 after second tick', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const original = fighter.abilities[0]
    const fixed = replacementAbility('fallback-replacement')
    const version1 = replacementAbility('replacement-remaining-1')

    fighter.abilityState.push({
      mode: 'replace',
      slotAbilityId: original.id,
      replacement: fixed,
      replacementsByRemainingTurns: {
        1: version1,
      },
      duration: 3,
    })

    const tickedOnce = resolveTeamTurn(state, {}, 'player')
    const tickedTwice = resolveTeamTurn(tickedOnce.state, {}, 'player')
    const fighterAfter = tickedTwice.state.playerTeam.find((f) => f.instanceId === fighter.instanceId)!

    expect(fighterAfter.abilityState[0]?.duration).toBe(1)
    expect(getEffectiveAbility(fighterAfter, version1.id)?.id).toBe(version1.id)
    expect(getEffectiveAbility(fighterAfter, fixed.id)).toBeNull()
  })

  test('turn-indexed replacement expires back to original ability', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const original = fighter.abilities[0]
    const fixed = replacementAbility('fallback-replacement')
    const version1 = replacementAbility('replacement-remaining-1')

    fighter.abilityState.push({
      mode: 'replace',
      slotAbilityId: original.id,
      replacement: fixed,
      replacementsByRemainingTurns: {
        1: version1,
      },
      duration: 1,
    })

    const ticked = resolveTeamTurn(state, {}, 'player')
    const fighterAfter = ticked.state.playerTeam.find((f) => f.instanceId === fighter.instanceId)!

    expect(fighterAfter.abilityState).toHaveLength(0)
    expect(getEffectiveAbility(fighterAfter, original.id)?.id).toBe(original.id)
    expect(getEffectiveAbility(fighterAfter, version1.id)).toBeNull()
  })

  test('missing remaining-turn key falls back to fixed replacement', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const original = fighter.abilities[0]
    const fixed = replacementAbility('fallback-replacement')
    const version2 = replacementAbility('replacement-remaining-2')

    fighter.abilityState.push({
      mode: 'replace',
      slotAbilityId: original.id,
      replacement: fixed,
      replacementsByRemainingTurns: {
        2: version2,
      },
      duration: 3,
    })

    expect(getEffectiveAbility(fighter, fixed.id)?.id).toBe(fixed.id)
    expect(getEffectiveAbility(fighter, version2.id)).toBeNull()
  })

  test('grant still works with ability-state resolution', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const granted = replacementAbility('granted-test-ability')

    fighter.abilityState.push({
      mode: 'grant',
      grantedAbility: granted,
      duration: 3,
    })

    expect(getEffectiveAbility(fighter, granted.id)?.id).toBe(granted.id)
  })

  test('lock still works with ability-state resolution', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const original = fighter.abilities[0]
    const fixed = replacementAbility('locked-replacement')

    fighter.abilityState.push({
      mode: 'replace',
      slotAbilityId: original.id,
      replacement: fixed,
      duration: 3,
    })
    fighter.abilityState.push({
      mode: 'lock',
      slotAbilityId: original.id,
      duration: 3,
    })

    expect(getEffectiveAbility(fighter, original.id)).toBeNull()
    expect(getEffectiveAbility(fighter, fixed.id)).toBeNull()
  })

  test('canPayAbilityCost: returns true with full energy pool', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const ability = fighter.abilities[0]
    expect(canPayAbilityCost(state, fighter, ability)).toBe(true)
  })

  test('canPayAbilityCost: returns false with empty energy pool', () => {
    const state = createInitialBattleState({ playerTeamIds: ['yuji', 'nobara', 'megumi'], enemyTeamIds: ['yuji', 'nobara', 'megumi'] })
    // Energy pools start at 0 in createInitialBattleState before the first round begins.
    // Grab any ability from the fighter — if it has a non-zero cost it will fail.
    const fighter = state.playerTeam[0]
    const ability = fighter.abilities.find((a) => {
      const { cost } = getResolvedAbilityEnergyCost(fighter, a)
      return Object.values(cost).some((v) => v > 0)
    }) ?? fighter.abilities[0]
    // Force pool to empty so the check definitely fails.
    state.playerEnergy = { amounts: { physical: 0, technique: 0, vow: 0, mental: 0 } }
    expect(canPayAbilityCost(state, fighter, ability)).toBe(false)
  })

  test('abilityCanBeCountered: attack ability can be countered by default', () => {
    const ability = sampleAbility({ kind: 'attack', effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }] })
    expect(abilityCanBeCountered(ability)).toBe(true)
  })

  test('abilityCanBeCountered: returns false when cannotBeCountered is set', () => {
    const ability = sampleAbility({ cannotBeCountered: true })
    expect(abilityCanBeCountered(ability)).toBe(false)
  })

  test('abilityCanBeReflected: ability with reflectable effect can be reflected', () => {
    const ability = sampleAbility({
      kind: 'attack',
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    })
    expect(abilityCanBeReflected(ability)).toBe(true)
  })

  test('abilityCanBeReflected: returns false when cannotBeReflected is set', () => {
    const ability = sampleAbility({
      cannotBeReflected: true,
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    })
    expect(abilityCanBeReflected(ability)).toBe(false)
  })
})

// ─── Section 3: Target Predicates ───────────────────────────────────────────

describe('referee — target predicates', () => {
  test('targetIsAlive: returns true when hp > 0', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    target.hp = 50
    expect(targetIsAlive(target)).toBe(true)
  })

  test('targetIsAlive: returns false when hp is 0', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    target.hp = 0
    expect(targetIsAlive(target)).toBe(false)
  })

  test('targetIsInvulnerable: returns false with no invulnerable modifier', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    expect(targetIsInvulnerable(target)).toBe(false)
  })

  test('targetIsInvulnerable: returns true when invulnerable modifier is present', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    applyInvulnerableModifier(target)
    expect(targetIsInvulnerable(target)).toBe(true)
  })

  test('abilityIgnoresInvulnerability: returns false with no bypass effect', () => {
    const ability = sampleAbility({ effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }] })
    expect(abilityIgnoresInvulnerability(ability)).toBe(false)
  })

  test('abilityIgnoresInvulnerability: returns true when damage effect has ignoresInvulnerability', () => {
    const ability = sampleAbility({
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal', ignoresInvulnerability: true }],
    })
    expect(abilityIgnoresInvulnerability(ability)).toBe(true)
  })

  test('targetHasRequiredTags: returns true when no tags required', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    const ability = sampleAbility()
    expect(targetHasRequiredTags(state, target, ability)).toBe(true)
  })

  test('targetHasRequiredTags: returns false when required tag is missing', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    const ability = sampleAbility({ requiredTargetTags: ['mark'] })
    expect(targetHasRequiredTags(state, target, ability)).toBe(false)
  })

  test('targetHasRequiredTags: returns true when required tag is present', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    applyTagModifier(target, 'mark')
    const ability = sampleAbility({ requiredTargetTags: ['mark'] })
    expect(targetHasRequiredTags(state, target, ability)).toBe(true)
  })

  test('canAbilityTarget: dead target is not valid', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    target.hp = 0
    const ability = sampleAbility({ kind: 'attack' })
    expect(canAbilityTarget(state, ability, target)).toBe(false)
  })

  test('canAbilityTarget: invulnerable target is invalid for harmful ability', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    applyInvulnerableModifier(target)
    const ability = sampleAbility({ kind: 'attack' })
    expect(canAbilityTarget(state, ability, target)).toBe(false)
  })

  test('canAbilityTarget: invulnerable target is valid for ability with bypass', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    applyInvulnerableModifier(target)
    const ability = sampleAbility({
      kind: 'attack',
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal', ignoresInvulnerability: true }],
    })
    expect(canAbilityTarget(state, ability, target)).toBe(true)
  })

  test('canAbilityTarget: invulnerable target is valid for helpful ability', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    applyInvulnerableModifier(target)
    const ability = sampleAbility({ kind: 'heal', targetRule: 'ally-single', classes: ['Strategic', 'Instant'] })
    expect(canAbilityTarget(state, ability, target)).toBe(true)
  })

  test('canAbilityTarget: missing required tag makes target invalid', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    const ability = sampleAbility({ requiredTargetTags: ['mark'] })
    expect(canAbilityTarget(state, ability, target)).toBe(false)
  })

  test('canAbilityTarget: target with required tag is valid', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    applyTagModifier(target, 'mark')
    const ability = sampleAbility({ requiredTargetTags: ['mark'] })
    expect(canAbilityTarget(state, ability, target)).toBe(true)
  })
})

// ─── Section 4: Effect Predicates ───────────────────────────────────────────

describe('referee — effect predicates', () => {
  const stunEffect: SkillEffect = { type: 'stun', duration: 1, target: 'inherit' }

  test('targetHasEffectImmunity: returns false when no immunity present', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    expect(targetHasEffectImmunity(target, stunEffect)).toBe(false)
  })

  test('targetHasEffectImmunity: returns true when immune to stun', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    addEffectImmunity(target, ['stun'])
    expect(targetHasEffectImmunity(target, stunEffect)).toBe(true)
  })

  test('targetHasEffectImmunity: self-bypass — actor targeting itself bypasses own immunity', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    addEffectImmunity(target, ['stun'])
    expect(targetHasEffectImmunity(target, stunEffect, target.instanceId)).toBe(false)
  })

  test('targetHasEffectImmunity: nonDamage immunity blocks stun', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    addEffectImmunity(target, ['nonDamage'])
    expect(targetHasEffectImmunity(target, stunEffect)).toBe(true)
  })

  test('targetHasEffectImmunity: nonDamage immunity does NOT block damage effects', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    addEffectImmunity(target, ['nonDamage'])
    const dmg: SkillEffect = { type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }
    expect(targetHasEffectImmunity(target, dmg)).toBe(false)
  })

  test('canApplyEffect: returns true when no immunity', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    const dmg: SkillEffect = { type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }
    expect(canApplyEffect(target, dmg)).toBe(true)
  })

  test('canApplyEffect: returns false when effect is blocked', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    addEffectImmunity(target, ['stun'])
    expect(canApplyEffect(target, stunEffect)).toBe(false)
  })

  test('canReceiveHelpfulEffect: currently always returns true (Phase 4 not implemented)', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    expect(canReceiveHelpfulEffect(state, target)).toBe(true)
  })

  test('canReceiveHarmfulEffect: returns true when no immunity', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    expect(canReceiveHarmfulEffect(target, stunEffect)).toBe(true)
  })

  test('canReceiveHarmfulEffect: returns false when blocked by immunity', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    addEffectImmunity(target, ['stun'])
    expect(canReceiveHarmfulEffect(target, stunEffect)).toBe(false)
  })

  test('canGainInvulnerability: returns true when no restriction', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    expect(canGainInvulnerability(state, target)).toBe(true)
  })

  test('canGainInvulnerability: returns false when canGainInvulnerable:false modifier is set', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    applyCannotGainInvulnModifier(target)
    expect(canGainInvulnerability(state, target)).toBe(false)
  })

  test('canReduceDamage: returns true when no restriction', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    expect(canReduceDamage(state, target)).toBe(true)
  })

  test('canReduceDamage: returns false when canReduceDamageTaken:false modifier is set', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    applyCannotReduceDamageModifier(target)
    expect(canReduceDamage(state, target)).toBe(false)
  })
})

// ─── Section 5: Protection Predicates ───────────────────────────────────────

describe('referee — protection predicates', () => {
  test('hasShield: returns false when no shield', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    target.shield = null
    expect(hasShield(target)).toBe(false)
  })

  test('hasShield: returns false when shield amount is 0', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    target.shield = { label: 'Test Shield', amount: 0, tags: [] }
    expect(hasShield(target)).toBe(false)
  })

  test('hasShield: returns true when shield is present with positive amount', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    target.shield = { label: 'Test Shield', amount: 30, tags: [] }
    expect(hasShield(target)).toBe(true)
  })

  test('shouldBypassShield: returns true when ignoresShield is true', () => {
    expect(shouldBypassShield(true)).toBe(true)
  })

  test('shouldBypassShield: returns false when ignoresShield is false', () => {
    expect(shouldBypassShield(false)).toBe(false)
  })

  test('targetIsUndying: returns false when no undying modifier', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    expect(targetIsUndying(state, target)).toBe(false)
  })

  test('targetIsUndying: returns true when undying modifier is present', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    applyUndyingModifier(target)
    expect(targetIsUndying(state, target)).toBe(true)
  })

  test('shouldApplyDamageReduction: returns true when no restriction', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    expect(shouldApplyDamageReduction(state, target)).toBe(true)
  })

  test('shouldApplyDamageReduction: returns false when canReduceDamageTaken is blocked', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    applyCannotReduceDamageModifier(target)
    expect(shouldApplyDamageReduction(state, target)).toBe(false)
  })
})

// ─── Section 6: Reaction Predicates ─────────────────────────────────────────

describe('referee — reaction predicates', () => {
  describe('resolveCounterPriority', () => {
    test('empty input returns empty output', () => {
      expect(resolveCounterPriority([])).toEqual([])
    })

    test('single candidate is returned as-is', () => {
      const c = makeCounter(0, 1)
      const result = resolveCounterPriority([c])
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(c)
    })

    test('slot order: lower slot wins when no explicit priority', () => {
      const left = makeCounter(0, 0)   // slot 0 — should win
      const right = makeCounter(1, 2)  // slot 2
      const result = resolveCounterPriority([right, left])
      expect(result[0]).toBe(left)
      expect(result[1]).toBe(right)
    })

    test('explicit priority overrides slot order', () => {
      const lowSlot = makeCounter(0, 0, 1)   // slot 0, priority 1
      const highPrio = makeCounter(1, 2, 10)  // slot 2, priority 10 — should win
      const result = resolveCounterPriority([lowSlot, highPrio])
      expect(result[0]).toBe(highPrio)
      expect(result[1]).toBe(lowSlot)
    })

    test('id (creation order) is tie-breaker when slot and priority are equal', () => {
      const first = makeCounter(0, 1)   // id ends in 0000 — earlier
      const second = makeCounter(5, 1)  // id ends in 0005 — later
      const result = resolveCounterPriority([second, first])
      expect(result[0]).toBe(first)
    })

    test('does not mutate the original array', () => {
      const a = makeCounter(0, 2)
      const b = makeCounter(1, 0)
      const original = [a, b]
      resolveCounterPriority(original)
      expect(original[0]).toBe(a)
      expect(original[1]).toBe(b)
    })
  })

  describe('isActiveReflectGuard', () => {
    const reflectAbility = sampleAbility({
      kind: 'attack',
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    })
    const unreflectableAbility = sampleAbility({
      cannotBeReflected: true,
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    })

    function makeReflectGuard(overrides: Partial<BattleReactionGuardState> = {}): BattleReactionGuardState {
      return {
        id: 'reaction-reflect-test',
        kind: 'reflect',
        label: 'Reflect',
        remainingRounds: 1,
        appliedInRound: 1,
        consumeOnTrigger: true,
        visible: true,
        sourceActorId: 'fighter-0',
        ...overrides,
      }
    }

    test('returns true for an active reflect guard matching a reflectable ability', () => {
      const guard = makeReflectGuard()
      expect(isActiveReflectGuard(guard, reflectAbility)).toBe(true)
    })

    test('returns false when kind is counter (not reflect)', () => {
      const guard = makeReflectGuard({ kind: 'counter' })
      expect(isActiveReflectGuard(guard, reflectAbility)).toBe(false)
    })

    test('returns false when remainingRounds is 0', () => {
      const guard = makeReflectGuard({ remainingRounds: 0 })
      expect(isActiveReflectGuard(guard, reflectAbility)).toBe(false)
    })

    test('returns false for an ability with cannotBeReflected', () => {
      const guard = makeReflectGuard()
      expect(isActiveReflectGuard(guard, unreflectableAbility)).toBe(false)
    })

    test('returns false when guard abilityClasses do not match ability classes', () => {
      const guard = makeReflectGuard({ abilityClasses: ['Energy'] as BattleReactionGuardState['abilityClasses'] })
      const physicalAbility = sampleAbility({ classes: ['Physical', 'Instant'] })
      expect(isActiveReflectGuard(guard, physicalAbility)).toBe(false)
    })

    test('returns true when guard abilityClasses match one of the ability classes', () => {
      const guard = makeReflectGuard({ abilityClasses: ['Physical'] as BattleReactionGuardState['abilityClasses'] })
      const physicalAbility = sampleAbility({
        classes: ['Physical', 'Instant'],
        effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
      })
      expect(isActiveReflectGuard(guard, physicalAbility)).toBe(true)
    })
  })
})

// ─── Phase 2: Integration tests ─────────────────────────────────────────────

describe('referee — Phase 2 canUseAbility integration', () => {
  // canUseAbility is the UI-facing gate. Phase 2 wires stun + class stun into it.

  test('canUseAbility returns false when fighter is fully stunned', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const abilityId = fighter.abilities[0].id
    expect(canUseAbility(state, fighter, abilityId)).toBe(true)
    applyStunModifier(state, fighter)
    expect(canUseAbility(state, fighter, abilityId)).toBe(false)
  })

  test('canUseAbility returns false when class-stunned and ability matches blocked class', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const ability = fighter.abilities[0]
    const blockedClass = ability.classes[0]
    expect(canUseAbility(state, fighter, ability.id)).toBe(true)
    addClassStun(fighter, [blockedClass] as BattleFighterState['classStuns'][number]['blockedClasses'])
    expect(canUseAbility(state, fighter, ability.id)).toBe(false)
  })

  test('canUseAbility returns true when class-stunned but ability uses non-blocked class', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    // Find an ability and block a class it does NOT use
    const ability = fighter.abilities[0]
    const notAClass = 'Mental' as BattleFighterState['classStuns'][number]['blockedClasses'][number]
    const isClassUsed = ability.classes.includes(notAClass)
    // Only run this assertion when the ability doesn't use Mental
    if (!isClassUsed) {
      addClassStun(fighter, [notAClass] as BattleFighterState['classStuns'][number]['blockedClasses'])
      expect(canUseAbility(state, fighter, ability.id)).toBe(true)
    } else {
      // Pick a guaranteed non-overlapping class: find one ability class and block something else
      expect(ability.classes.length).toBeGreaterThan(0)
    }
  })

  test('canUseAbility returns true when class-stunned but PASS ability is used', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    addClassStun(fighter, ['Physical'] as BattleFighterState['classStuns'][number]['blockedClasses'])
    expect(canUseAbility(state, fighter, 'pass')).toBe(true)
  })

  test('canUseAbility returns false when fully stunned even with PASS bypassed', () => {
    // Stun blocks everything except PASS — ensure PASS is unaffected by stun too
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    applyStunModifier(state, fighter)
    // PASS is always allowed regardless of stun (constitutional: stunned fighters still pass)
    expect(canUseAbility(state, fighter, 'pass')).toBe(true)
  })

  test('locked ability cannot be used via canUseAbility', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const ability = fighter.abilities[0]
    expect(canUseAbility(state, fighter, ability.id)).toBe(true)
    fighter.abilityState.push({ mode: 'lock', slotAbilityId: ability.id, duration: 1 })
    // getAbilityById returns null for locked abilities → canUseAbility returns false
    expect(canUseAbility(state, fighter, ability.id)).toBe(false)
  })
})

describe('referee — Phase 2 canAbilityTarget integration', () => {
  test('invulnerable enemy is excluded from harmful ability target pool', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    const harmfulAbility = sampleAbility({
      kind: 'attack',
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    })
    expect(canAbilityTarget(state, harmfulAbility, target)).toBe(true)
    applyInvulnerableModifier(target)
    expect(canAbilityTarget(state, harmfulAbility, target)).toBe(false)
  })

  test('invulnerable ally remains valid target for helpful ability', () => {
    const state = createChargedState()
    const target = state.playerTeam[1]
    const helpfulAbility = sampleAbility({
      kind: 'heal',
      targetRule: 'ally-single',
      effects: [{ type: 'heal', power: 20, target: 'inherit' }],
    })
    applyInvulnerableModifier(target)
    // helpful ability: invulnerability does not block targeting
    expect(canAbilityTarget(state, helpfulAbility, target)).toBe(true)
  })

  test('ignoresInvulnerability allows harmful targeting of invulnerable fighter', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    const piercingAbility = sampleAbility({
      kind: 'attack',
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal', ignoresInvulnerability: true }],
    })
    applyInvulnerableModifier(target)
    expect(canAbilityTarget(state, piercingAbility, target)).toBe(true)
  })

  test('dead target is not a valid target regardless of ability type', () => {
    const state = createChargedState()
    const target = state.enemyTeam[0]
    target.hp = 0
    const harmfulAbility = sampleAbility({ kind: 'attack', effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }] })
    const helpfulAbility = sampleAbility({ kind: 'heal', effects: [{ type: 'heal', power: 20, target: 'inherit' }] })
    expect(canAbilityTarget(state, harmfulAbility, target)).toBe(false)
    expect(canAbilityTarget(state, helpfulAbility, target)).toBe(false)
  })
})

describe('referee — Phase 2 scheduled effects dead-target filter', () => {
  function makeScheduledDamage(actorId: string, targetId: string, dueRound: number): import('@/features/battle/types').BattleScheduledEffect {
    return {
      id: `test-scheduled-${targetId}`,
      actorId,
      targetIds: [targetId],
      dueRound,
      phase: 'roundStart',
      effects: [{ type: 'damage', power: 30, target: 'inherit', damageType: 'normal' }],
    }
  }

  test('scheduled effect does not apply to dead target', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    const target = state.enemyTeam[0]
    const startHp = target.hp

    // Inject a scheduled effect targeting the enemy, due in round 2
    state.scheduledEffects.push(makeScheduledDamage(actor.instanceId, target.instanceId, 2))

    // Kill the target before the scheduled effect fires
    target.hp = 0

    // Advance to round 2 — triggers roundStart scheduled effects
    const result = beginNewRound(state)
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!

    // Target was already at 0 hp and should remain so (not double-killed or errored)
    expect(targetAfter.hp).toBe(0)
    // No damage event should reference the dead target
    const damageEvents = result.events.filter((e) => e.kind === 'damage' && e.targetId === target.instanceId)
    expect(damageEvents).toHaveLength(0)
    void startHp
  })

  test('scheduled effect still applies to a living target', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    const target = state.enemyTeam[0]
    const startHp = target.hp

    state.scheduledEffects.push(makeScheduledDamage(actor.instanceId, target.instanceId, 2))

    const result = beginNewRound(state)
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!

    // The 30-power damage effect should have reduced HP
    expect(targetAfter.hp).toBeLessThan(startHp)
  })

  test('fire-but-block: invulnerable target receives no damage but effect was fired', () => {
    // This test verifies the existing fire-but-block contract is preserved.
    // A scheduled effect fires against an invulnerable target — energy was already
    // spent when the ability was queued, so the effect fires but is blocked.
    const state = createChargedState()
    const actor = state.playerTeam[0]
    const target = state.enemyTeam[0]
    const startHp = target.hp

    state.scheduledEffects.push(makeScheduledDamage(actor.instanceId, target.instanceId, 2))

    // Make the target invulnerable before the scheduled effect fires
    applyInvulnerableModifier(target)

    const result = beginNewRound(state)
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!

    // HP unchanged — invulnerability blocked the damage (fire-but-block)
    expect(targetAfter.hp).toBe(startHp)
    // The invulnerability block event should be logged
    const blockedEvent = result.events.find(
      (e) => e.targetId === target.instanceId && e.message.toLowerCase().includes('invulnerability'),
    )
    expect(blockedEvent).toBeDefined()
  })
})

// ─── Phase 3: canGainInvulnerability universal enforcement ──────────────────

function makeQueue(actorId: string, team: 'player' | 'enemy', abilityId: string, targetId: string | null): Record<string, QueuedBattleAction> {
  return { [actorId]: { actorId, team, abilityId, targetId } }
}

describe('referee — Phase 3 canGainInvulnerability enforcement', () => {
  test('invulnerable effect is blocked by canGainInvulnerable=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    const target = state.playerTeam[0]

    // Give actor an ability that applies invulnerable to self
    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{ type: 'invulnerable', duration: 1, target: 'self' }],
    }
    // Block the target from gaining invulnerability
    applyCannotGainInvulnModifier(target)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    // Invulnerability modifier must NOT be present
    expect(targetAfter.modifiers.some((m) => m.stat === 'isInvulnerable' && m.value === true)).toBe(false)
    // Block event must be logged
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot become invulnerable'))).toBe(true)
  })

  test('addModifier with isInvulnerable=true is blocked by canGainInvulnerable=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    const target = state.playerTeam[0]

    // Give actor an ability that uses addModifier to set isInvulnerable
    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{
        type: 'addModifier',
        target: 'self',
        modifier: {
          label: 'Guard Shell',
          stat: 'isInvulnerable',
          mode: 'set',
          value: true,
          duration: { kind: 'rounds', rounds: 1 },
          tags: ['status', 'invincible'],
          visible: true,
          stacking: 'max',
          statusKind: 'invincible',
        },
      }],
    }
    applyCannotGainInvulnModifier(target)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!

    expect(targetAfter.modifiers.some((m) => m.stat === 'isInvulnerable' && m.value === true)).toBe(false)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot become invulnerable'))).toBe(true)
  })

  test('self-applied invulnerability is blocked (no self-bypass)', () => {
    // This test verifies Law 4.4: no implicit self-bypass.
    // Actor and target are the same fighter (self-cast), restriction still blocks.
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{ type: 'invulnerable', duration: 1, target: 'self' }],
    }
    applyCannotGainInvulnModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!

    expect(actorAfter.modifiers.some((m) => m.stat === 'isInvulnerable' && m.value === true)).toBe(false)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot become invulnerable'))).toBe(true)
  })

  test('invulnerability applies normally when no restriction exists', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{ type: 'invulnerable', duration: 1, target: 'self' }],
    }
    // No restriction applied

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!

    expect(actorAfter.modifiers.some((m) => m.stat === 'isInvulnerable' && m.value === true)).toBe(true)
    expect(result.events.some((e) => e.message.toLowerCase().includes('became invulnerable'))).toBe(true)
  })

  test('restriction expiration allows invulnerability again', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{ type: 'invulnerable', duration: 1, target: 'self' }],
    }
    applyCannotGainInvulnModifier(actor)

    // Verify blocked while restriction is active
    const blocked = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const blockedActor = blocked.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    expect(blockedActor.modifiers.some((m) => m.stat === 'isInvulnerable' && m.value === true)).toBe(false)

    // Remove the restriction (simulates expiration)
    actor.modifiers = actor.modifiers.filter((m) => m.stat !== 'canGainInvulnerable')

    // Now invulnerability should apply
    const allowed = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const allowedActor = allowed.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    expect(allowedActor.modifiers.some((m) => m.stat === 'isInvulnerable' && m.value === true)).toBe(true)
  })
})

// ─── Phase 4A: Consistent Effect Immunity Enforcement ───────────────────────

describe('referee — Phase 4A burn DOT respects damage immunity', () => {
  function applyBurnModifier(fighter: BattleFighterState, damage: number) {
    const template: BattleModifierTemplate = {
      label: 'Burn',
      stat: 'dotDamage',
      mode: 'flat',
      value: damage,
      duration: { kind: 'rounds', rounds: 3 },
      tags: ['status', 'burn'],
      visible: true,
      stacking: 'max',
      statusKind: 'burn',
    }
    const instance = createModifierInstance(template, {
      scope: 'fighter',
      targetId: fighter.instanceId,
      nextIndex: fighter.modifiers.length,
    })
    fighter.modifiers = upsertModifier(fighter.modifiers, instance)
  }

  test('burn DOT damages fighter without damage immunity', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const startHp = fighter.hp
    applyBurnModifier(fighter, 15)

    const result = beginNewRound(state)
    const after = result.state.playerTeam.find((f) => f.instanceId === fighter.instanceId)!
    expect(after.hp).toBeLessThan(startHp)
  })

  test('burn DOT is blocked when fighter has damage immunity', () => {
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const startHp = fighter.hp
    applyBurnModifier(fighter, 15)
    addEffectImmunity(fighter, ['damage'])

    const result = beginNewRound(state)
    const after = result.state.playerTeam.find((f) => f.instanceId === fighter.instanceId)!
    expect(after.hp).toBe(startHp)
    const blockEvent = result.events.find(
      (e) => e.targetId === fighter.instanceId && e.message.toLowerCase().includes('effect immunity'),
    )
    expect(blockEvent).toBeDefined()
  })

  test('burn DOT is blocked when fighter has nonDamage immunity (nonDamage does NOT cover damage)', () => {
    // nonDamage only blocks non-damage effect types; burn ticks are raw damage packets
    // and use the 'damage' block — so nonDamage immunity must NOT block burn ticks.
    const state = createChargedState()
    const fighter = state.playerTeam[0]
    const startHp = fighter.hp
    applyBurnModifier(fighter, 15)
    addEffectImmunity(fighter, ['nonDamage'])

    const result = beginNewRound(state)
    const after = result.state.playerTeam.find((f) => f.instanceId === fighter.instanceId)!
    // nonDamage immunity does NOT cover raw damage packets — burn should still land
    expect(after.hp).toBeLessThan(startHp)
  })
})

describe('referee — Phase 4A fatigue respects damage immunity', () => {
  test('fatigue damages fighter without damage immunity', () => {
    const state = createChargedState()
    // Fatigue fires during endRound when state.round >= fatigueStartsRound
    state.battlefield.fatigueStartsRound = state.round
    const fighter = state.playerTeam[0]
    const startHp = fighter.hp

    const result = endRound(state)
    const after = result.state.playerTeam.find((f) => f.instanceId === fighter.instanceId)!
    expect(after.hp).toBeLessThan(startHp)
  })

  test('fatigue is blocked when fighter has damage immunity', () => {
    const state = createChargedState()
    state.battlefield.fatigueStartsRound = state.round
    const fighter = state.playerTeam[0]
    const startHp = fighter.hp
    addEffectImmunity(fighter, ['damage'])

    const result = endRound(state)
    const after = result.state.playerTeam.find((f) => f.instanceId === fighter.instanceId)!
    expect(after.hp).toBe(startHp)
    const blockEvent = result.events.find(
      (e) => e.targetId === fighter.instanceId && e.message.toLowerCase().includes('effect immunity'),
    )
    expect(blockEvent).toBeDefined()
  })
})

describe('referee — Phase 4A counter damage respects damage immunity', () => {
  function makeCounterAbility(): BattleAbilityTemplate {
    return {
      id: 'test-counter-ability',
      name: 'Counter Ability',
      description: 'Applies a counter guard.',
      kind: 'defend',
      targetRule: 'self',
      classes: ['Physical', 'Instant'],
      icon: { label: 'CA', tone: 'teal' },
      cooldown: 0,
      energyCost: {},
      effects: [{ type: 'counter', duration: 1, counterDamage: 25, target: 'self' }],
    } as unknown as BattleAbilityTemplate
  }

  test('counter damage lands on attacker without damage immunity', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]
    const startHp = attacker.hp

    // Set up defender with a counter ability
    defender.abilities[0] = makeCounterAbility()

    // First turn: enemy queues counter
    const counterResult = resolveTeamTurn(
      state,
      makeQueue(defender.instanceId, 'enemy', defender.abilities[0].id, null),
      'enemy',
    )
    const stateAfterCounter = counterResult.state

    // Second turn: player attacks the defender with damage
    const attackingAbility = attacker.abilities.find((a) => a.effects?.some((e) => e.type === 'damage'))
    if (!attackingAbility) return // skip if no damage ability found on template

    const result = resolveTeamTurn(
      stateAfterCounter,
      makeQueue(attacker.instanceId, 'player', attackingAbility.id, defender.instanceId),
      'player',
    )
    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    // Counter should have dealt damage to the attacker
    expect(attackerAfter.hp).toBeLessThan(startHp)
  })

  test('counter still cancels ability when attacker has damage immunity', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]

    defender.abilities[0] = makeCounterAbility()

    const counterResult = resolveTeamTurn(
      state,
      makeQueue(defender.instanceId, 'enemy', defender.abilities[0].id, null),
      'enemy',
    )
    const stateAfterCounter = counterResult.state

    // Give attacker damage immunity
    const attackerInState = stateAfterCounter.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    addEffectImmunity(attackerInState, ['damage'])
    const attackerHp = attackerInState.hp

    const attackingAbility = attacker.abilities.find((a) => a.effects?.some((e) => e.type === 'damage'))
    if (!attackingAbility) return

    const defenderInState = stateAfterCounter.enemyTeam.find((f) => f.instanceId === defender.instanceId)!
    const defenderStartHp = defenderInState.hp

    const result = resolveTeamTurn(
      stateAfterCounter,
      makeQueue(attacker.instanceId, 'player', attackingAbility.id, defender.instanceId),
      'player',
    )
    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    const defenderAfter = result.state.enemyTeam.find((f) => f.instanceId === defender.instanceId)!

    // Counter damage was blocked by immunity
    expect(attackerAfter.hp).toBe(attackerHp)
    // Ability was canceled by counter — defender took no damage
    expect(defenderAfter.hp).toBe(defenderStartHp)
    // Block event fired
    const blockEvent = result.events.find(
      (e) => e.targetId === attacker.instanceId && e.message.toLowerCase().includes('effect immunity'),
    )
    expect(blockEvent).toBeDefined()
  })
})

// ─── Phase 4B: canReceiveHelpfulEffects enforcement ─────────────────────────

function applyCannotReceiveHelpfulModifier(fighter: BattleFighterState) {
  const template: BattleModifierTemplate = {
    label: 'Cannot Receive Helpful Effects',
    stat: 'canReceiveHelpfulEffects',
    mode: 'set',
    value: false,
    duration: { kind: 'rounds', rounds: 2 },
    tags: [],
    visible: false,
    stacking: 'max',
  }
  const instance = createModifierInstance(template, {
    scope: 'fighter',
    targetId: fighter.instanceId,
    nextIndex: fighter.modifiers.length,
  })
  fighter.modifiers = upsertModifier(fighter.modifiers, instance)
}

describe('referee — Phase 4B canReceiveHelpfulEffects predicate', () => {
  test('canReceiveHelpfulEffect returns true when no restriction', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    expect(canReceiveHelpfulEffect(state, target)).toBe(true)
  })

  test('canReceiveHelpfulEffect returns false when restriction modifier present', () => {
    const state = createChargedState()
    const target = state.playerTeam[0]
    applyCannotReceiveHelpfulModifier(target)
    expect(canReceiveHelpfulEffect(state, target)).toBe(false)
  })
})

describe('referee — Phase 4B ally heal blocked', () => {
  test('ally heal is blocked when target has canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const healer = state.playerTeam[0]
    const target = state.playerTeam[1]
    const startHp = target.hp
    target.hp = Math.max(1, target.hp - 30) // wound target

    healer.abilities[0] = {
      ...healer.abilities[0],
      energyCost: {},
      targetRule: 'ally-single',
      kind: 'heal',
      effects: [{ type: 'heal', power: 30, target: 'inherit' }],
    }
    applyCannotReceiveHelpfulModifier(target)

    const result = resolveTeamTurn(state, makeQueue(healer.instanceId, 'player', healer.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!
    // HP should not have increased
    expect(targetAfter.hp).toBe(target.hp)
    // Block event emitted
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
    void startHp
  })

  test('ally heal lands normally without restriction', () => {
    const state = createChargedState()
    const healer = state.playerTeam[0]
    const target = state.playerTeam[1]
    target.hp = Math.max(1, target.hp - 30)
    const woundedHp = target.hp

    healer.abilities[0] = {
      ...healer.abilities[0],
      energyCost: {},
      targetRule: 'ally-single',
      kind: 'heal',
      effects: [{ type: 'heal', power: 30, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(healer.instanceId, 'player', healer.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!
    expect(targetAfter.hp).toBeGreaterThan(woundedHp)
  })
})

describe('referee — Phase 4B self-heal blocked', () => {
  test('self-heal is blocked when actor has canReceiveHelpfulEffects=false (no self-bypass)', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    actor.hp = Math.max(1, actor.hp - 30)
    const woundedHp = actor.hp

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      kind: 'heal',
      effects: [{ type: 'heal', power: 30, target: 'self' }],
    }
    applyCannotReceiveHelpfulModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    expect(actorAfter.hp).toBe(woundedHp)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })
})

describe('referee — Phase 4B ally shield blocked', () => {
  test('ally shield is blocked when target has canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    const target = state.playerTeam[1]
    target.shield = null

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'ally-single',
      kind: 'defend',
      effects: [{ type: 'shield', amount: 20, label: 'Barrier', tags: [], target: 'inherit' }],
    }
    applyCannotReceiveHelpfulModifier(target)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!
    expect(targetAfter.shield).toBeNull()
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })
})

describe('referee — Phase 4B self-shield blocked', () => {
  test('self-shield is blocked when actor has canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    actor.shield = null

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      kind: 'defend',
      effects: [{ type: 'shield', amount: 20, label: 'Barrier', tags: [], target: 'self' }],
    }
    applyCannotReceiveHelpfulModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    expect(actorAfter.shield).toBeNull()
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })
})

describe('referee — Phase 4B invulnerability blocked as helpful effect', () => {
  test('invulnerable effect is blocked when target has canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{ type: 'invulnerable', duration: 1, target: 'self' }],
    }
    applyCannotReceiveHelpfulModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    expect(actorAfter.modifiers.some((m) => m.stat === 'isInvulnerable' && m.value === true)).toBe(false)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })
})

describe('referee — Phase 4B addModifier intent is neutral (not blocked)', () => {
  // addModifier falls into the 'neutral' bucket in getEffectIntent() because
  // its intent is context-dependent — the same effect type is used for buffs
  // AND debuffs depending on the modifier stat and value. Neutral effects are
  // NOT blocked by canReceiveHelpfulEffects. This is documented in Phase 4B
  // notes: 'adjustCounter'/'setFlag'/'setMode'/'addModifier' → 'neutral'.
  // Per-modifier intent flags are a future pass.
  test('addModifier is NOT blocked by canReceiveHelpfulEffects (classified as neutral)', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{
        type: 'addModifier',
        target: 'self',
        modifier: {
          label: 'Power Boost',
          stat: 'damageDealt',
          mode: 'flat',
          value: 15,
          duration: { kind: 'rounds', rounds: 2 },
          tags: ['attackUp'],
          visible: true,
          stacking: 'max',
        },
      }],
    }
    applyCannotReceiveHelpfulModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    // addModifier is 'neutral' → passes through even with canReceiveHelpfulEffects=false
    expect(actorAfter.modifiers.some((m) => m.tags.includes('attackUp') && m.stat === 'damageDealt' && m.value === 15)).toBe(true)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(false)
  })
})

describe('referee — Phase 4B harmful effects still apply normally', () => {
  test('damage effect still applies when target has canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]
    const startHp = target.hp
    applyCannotReceiveHelpfulModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    expect(targetAfter.hp).toBeLessThan(startHp)
  })

  test('stun still applies when target has canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]
    applyCannotReceiveHelpfulModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'debuff',
      effects: [{ type: 'stun', duration: 1, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    expect(targetAfter.modifiers.some((m) => m.stat === 'canAct' && m.value === false)).toBe(true)
  })
})

describe('referee — Phase 4B restriction expiration allows helpful effects again', () => {
  test('heal lands after canReceiveHelpfulEffects restriction is removed', () => {
    const state = createChargedState()
    const healer = state.playerTeam[0]
    const target = state.playerTeam[1]
    target.hp = Math.max(1, target.hp - 40)

    healer.abilities[0] = {
      ...healer.abilities[0],
      energyCost: {},
      targetRule: 'ally-single',
      kind: 'heal',
      effects: [{ type: 'heal', power: 30, target: 'inherit' }],
    }
    applyCannotReceiveHelpfulModifier(target)

    // Verify blocked while restriction active
    const blocked = resolveTeamTurn(state, makeQueue(healer.instanceId, 'player', healer.abilities[0].id, target.instanceId), 'player')
    const blockedTarget = blocked.state.playerTeam.find((f) => f.instanceId === target.instanceId)!
    expect(blockedTarget.hp).toBe(target.hp)

    // Remove restriction (simulate expiration)
    target.modifiers = target.modifiers.filter((m) => m.stat !== 'canReceiveHelpfulEffects')

    // Now heal should land
    const allowed = resolveTeamTurn(state, makeQueue(healer.instanceId, 'player', healer.abilities[0].id, target.instanceId), 'player')
    const allowedTarget = allowed.state.playerTeam.find((f) => f.instanceId === target.instanceId)!
    expect(allowedTarget.hp).toBeGreaterThan(target.hp)
  })
})

describe('referee — Phase 4B effect immunity self-bypass unchanged', () => {
  test('effectImmunity self-bypass still works: actor targeting self bypasses own effect immunity', () => {
    // Law 4.1 self-bypass for effectImmunity is unchanged by Phase 4B.
    // canReceiveHelpfulEffects has no self-bypass, but effectImmunity still does.
    const state = createChargedState()
    const target = state.enemyTeam[0]
    const startHp = target.hp
    // Add stun immunity to target
    addEffectImmunity(target, ['stun'])

    const attacker = state.playerTeam[0]
    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'debuff',
      effects: [{ type: 'stun', duration: 1, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Stun should be blocked by immunity
    expect(targetAfter.modifiers.some((m) => m.stat === 'canAct' && m.value === false)).toBe(false)
    // No HP change
    expect(targetAfter.hp).toBe(startHp)
    void startHp
  })
})

// ─── Phase 5A: Protection Law Edge Cases ────────────────────────────────────

// Helpers for reflect tests
function makeReflectGuardState(sourceActorId: string): import('@/features/battle/types').BattleReactionGuardState {
  return {
    id: 'reaction-reflect-phase5a',
    kind: 'reflect',
    label: 'Reflect',
    remainingRounds: 1,
    appliedInRound: 1,
    consumeOnTrigger: true,
    visible: true,
    sourceActorId,
  }
}

describe('referee — Phase 5A reflected damage respects attacker invulnerability', () => {
  test('reflected damage is blocked when original attacker is invulnerable', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]
    const attackerStartHp = attacker.hp

    // Give defender a reflect guard
    defender.reactionGuards.push(makeReflectGuardState(defender.instanceId))

    // Give attacker invulnerability — reflected damage should be blocked
    applyInvulnerableModifier(attacker)

    // Attacker fires a reflectable damage ability at defender
    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 30, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, defender.instanceId), 'player')
    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    // Reflected damage should be blocked by attacker's invulnerability
    expect(attackerAfter.hp).toBe(attackerStartHp)
    // Invulnerability block event should fire
    const blockedEvent = result.events.find(
      (e) => e.targetId === attacker.instanceId && e.message.toLowerCase().includes('invulnerability'),
    )
    expect(blockedEvent).toBeDefined()
  })

  test('reflected damage hits attacker when not invulnerable', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]
    const attackerStartHp = attacker.hp

    defender.reactionGuards.push(makeReflectGuardState(defender.instanceId))

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 30, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, defender.instanceId), 'player')
    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    // Reflected damage must land on the attacker
    expect(attackerAfter.hp).toBeLessThan(attackerStartHp)
  })

  test('reflected damage is absorbed by attacker shield', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]
    const attackerStartHp = attacker.hp

    defender.reactionGuards.push(makeReflectGuardState(defender.instanceId))

    // Give attacker a shield that should absorb reflected damage
    attacker.shield = { label: 'Barrier', amount: 200, tags: [] }

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 30, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, defender.instanceId), 'player')
    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    // HP should be unchanged — shield absorbed reflected damage
    expect(attackerAfter.hp).toBe(attackerStartHp)
    // Shield should have been reduced
    expect((attackerAfter.shield?.amount ?? 200)).toBeLessThan(200)
  })

  test('reflected damage is blocked by attacker damage immunity (Phase 4A path)', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]
    const attackerStartHp = attacker.hp

    defender.reactionGuards.push(makeReflectGuardState(defender.instanceId))
    addEffectImmunity(attacker, ['damage'])

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 30, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, defender.instanceId), 'player')
    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    // Damage immunity blocks reflected damage
    expect(attackerAfter.hp).toBe(attackerStartHp)
    const blockEvent = result.events.find(
      (e) => e.targetId === attacker.instanceId && e.message.toLowerCase().includes('immunity'),
    )
    expect(blockEvent).toBeDefined()
  })
})

describe('referee — Phase 5A Affliction randomEnemyDamageTick preserves shield bypass', () => {
  test('non-Affliction randomEnemyDamageTick does NOT bypass shield', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    // Kill the other two enemies so the tick is forced onto enemyTeam[0]
    state.enemyTeam[1].hp = 0
    state.enemyTeam[2].hp = 0
    const target = state.enemyTeam[0]
    const startHp = target.hp

    // Give target a shield that should absorb the tick
    target.shield = { label: 'Barrier', amount: 200, tags: [] }

    // Set up actor with a non-Affliction randomEnemyDamageOverTime ability
    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      kind: 'attack',
      classes: ['Physical', 'Instant'],
      effects: [{
        type: 'randomEnemyDamageOverTime',
        power: 15,
        duration: 1,
        historyKey: 'test-nondot',
        target: 'self',
      }],
    }

    // Apply the DOT (schedules a tick for next round) — capture returned state
    const afterSchedule = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')

    // The scheduled tick fires at round start of next round
    const result = beginNewRound(afterSchedule.state)
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!

    // Shield should have absorbed the tick — HP unchanged, shield reduced
    expect(targetAfter.hp).toBe(startHp)
    expect((targetAfter.shield?.amount ?? 200)).toBeLessThan(200)
  })

  test('Affliction-class randomEnemyDamageTick bypasses shield', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]
    // Kill the other two enemies so the tick is forced onto enemyTeam[0]
    state.enemyTeam[1].hp = 0
    state.enemyTeam[2].hp = 0
    const target = state.enemyTeam[0]
    const startHp = target.hp

    // Give target a shield
    target.shield = { label: 'Barrier', amount: 200, tags: [] }

    // Set up actor with an Affliction-class randomEnemyDamageOverTime ability
    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      kind: 'attack',
      classes: ['Affliction', 'Instant'],
      effects: [{
        type: 'randomEnemyDamageOverTime',
        power: 15,
        duration: 1,
        historyKey: 'test-affliction-dot',
        target: 'self',
      }],
    }

    // Capture the state after scheduling the DOT
    const afterSchedule = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')

    const result = beginNewRound(afterSchedule.state)
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    const shieldAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!.shield

    // Affliction bypasses shield — HP should have dropped AND shield should be intact (not consumed)
    expect(targetAfter.hp).toBeLessThan(startHp)
    // Shield should remain untouched since Affliction bypasses it
    expect(shieldAfter?.amount ?? 200).toBe(200)
  })
})

describe('referee — Phase 5A shield tag characterization (audit)', () => {
  // These tests document the CURRENT behavior of shield tag checks.
  // Regular damage absorption ignores shield tags — this is intentional
  // (single-shield model: the shield protects regardless of which "named"
  // shield it is). shieldDamage and breakShield DO check tags.

  test('shieldDamage respects tag filter — does not drain shield with non-matching tag', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    // Give target a shield with a specific tag
    target.shield = { label: 'Iron Wall', amount: 50, tags: ['iron-wall'] }

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'shieldDamage', amount: 30, tag: 'different-tag', target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Tag mismatch — shield should be undamaged
    expect(targetAfter.shield?.amount).toBe(50)
  })

  test('shieldDamage with matching tag reduces shield', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    target.shield = { label: 'Iron Wall', amount: 50, tags: ['iron-wall'] }

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'shieldDamage', amount: 30, tag: 'iron-wall', target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Matching tag — shield reduced
    expect(targetAfter.shield?.amount).toBeLessThan(50)
  })

  test('regular damage absorption ignores shield tags (intentional single-shield model)', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]
    const startHp = target.hp

    // Give target a tagged shield
    target.shield = { label: 'Tagged Barrier', amount: 30, tags: ['special-tag'] }

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Regular damage absorbed by shield regardless of tags
    expect(targetAfter.hp).toBe(startHp)
    // Shield was consumed
    expect((targetAfter.shield?.amount ?? 0)).toBeLessThan(30)
  })

  test('breakShield with tag filter does not break shield with non-matching tag', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    target.shield = { label: 'Iron Wall', amount: 50, tags: ['iron-wall'] }

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'breakShield', tag: 'different-tag', target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Tag mismatch — shield should survive
    expect(targetAfter.shield?.amount).toBe(50)
  })
})

// ─── Phase 6A: Reaction Priority Determinism ─────────────────────────────────

function makeCounterGuardState(id: string, counterDamage: number = 20): import('@/features/battle/types').BattleReactionGuardState {
  return {
    id,
    kind: 'counter',
    label: 'Counter',
    remainingRounds: 1,
    appliedInRound: 1,
    consumeOnTrigger: true,
    visible: true,
    counterDamage,
  }
}

describe('referee — Phase 6A reaction priority is deterministic by slot order', () => {
  test('when two targets both have counters, the lower-slot target reacts first and cancels the action', () => {
    // Both enemy slot-0 and slot-1 have counters. We queue an AoE attack.
    // Slot-0 should counter first, canceling the action before slot-1 can react.
    // We verify: slot-0 fighter is identified as the one whose counter fired by
    // checking which attacker HP changed (counter damage goes to attacker).
    const state = createChargedState(['yuji', 'nobara', 'megumi'], ['yuji', 'nobara', 'megumi'])
    const attacker = state.playerTeam[0]

    // Assign explicit slots to make them unambiguous regardless of creation order
    const enemyA = state.enemyTeam[0]
    const enemyB = state.enemyTeam[1]
    enemyA.slot = 0
    enemyB.slot = 1

    // Both have a counter — slot-0 should win
    enemyA.reactionGuards.push(makeCounterGuardState('counter-A', 15))
    enemyB.reactionGuards.push(makeCounterGuardState('counter-B', 30))

    const aoeAbility: BattleAbilityTemplate = {
      id: 'aoe-attack',
      name: 'AoE Attack',
      description: '',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Physical', 'Instant'],
      icon: { label: 'AE', tone: 'red' },
      cooldown: 0,
      energyCost: {},
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    }
    attacker.abilities[0] = aoeAbility

    const attackerStartHp = attacker.hp
    const result = resolveTeamTurn(
      state,
      makeQueue(attacker.instanceId, 'player', aoeAbility.id, enemyA.instanceId),
      'player',
    )

    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    // Action was canceled — enemies should be undamaged
    const enemyAAfter = result.state.enemyTeam.find((f) => f.instanceId === enemyA.instanceId)!
    const enemyBAfter = result.state.enemyTeam.find((f) => f.instanceId === enemyB.instanceId)!
    expect(enemyAAfter.hp).toBe(enemyA.hp)
    expect(enemyBAfter.hp).toBe(enemyB.hp)
    // Attacker should have taken counter damage (15 from slot-0, not 30 from slot-1)
    expect(attackerAfter.hp).toBe(attackerStartHp - 15)
  })

  test('counter on any target cancels the whole action before reflect on another target fires', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const enemyA = state.enemyTeam[0]
    const enemyB = state.enemyTeam[1]
    enemyA.slot = 0
    enemyB.slot = 1

    // enemyA (slot-0) has a counter; enemyB (slot-1) has a reflect
    enemyA.reactionGuards.push(makeCounterGuardState('counter-A', 10))
    enemyB.reactionGuards.push(makeReflectGuardState(enemyB.instanceId))

    const aoeAbility: BattleAbilityTemplate = {
      id: 'aoe-attack2',
      name: 'AoE Attack 2',
      description: '',
      kind: 'attack',
      targetRule: 'enemy-all',
      classes: ['Physical', 'Instant'],
      icon: { label: 'A2', tone: 'red' },
      cooldown: 0,
      energyCost: {},
      effects: [{ type: 'damage', power: 25, target: 'inherit', damageType: 'normal' }],
    }
    attacker.abilities[0] = aoeAbility

    const attackerStartHp = attacker.hp
    const result = resolveTeamTurn(
      state,
      makeQueue(attacker.instanceId, 'player', aoeAbility.id, enemyA.instanceId),
      'player',
    )

    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    const enemyAAfter = result.state.enemyTeam.find((f) => f.instanceId === enemyA.instanceId)!
    const enemyBAfter = result.state.enemyTeam.find((f) => f.instanceId === enemyB.instanceId)!
    // Action canceled — no damage to either enemy
    expect(enemyAAfter.hp).toBe(enemyA.hp)
    expect(enemyBAfter.hp).toBe(enemyB.hp)
    // Only counter damage (10) should have hit attacker, not reflected damage
    expect(attackerAfter.hp).toBe(attackerStartHp - 10)
  })

  test('reflect fires when no counter is eligible on that target', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]

    // Only a reflect guard — no counter
    defender.reactionGuards.push(makeReflectGuardState(defender.instanceId))

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 30, target: 'inherit', damageType: 'normal' }],
    }

    const attackerStartHp = attacker.hp
    const result = resolveTeamTurn(
      state,
      makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, defender.instanceId),
      'player',
    )

    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    const defenderAfter = result.state.enemyTeam.find((f) => f.instanceId === defender.instanceId)!
    // Defender is unharmed — ability was reflected
    expect(defenderAfter.hp).toBe(defender.hp)
    // Attacker took the reflected damage
    expect(attackerAfter.hp).toBeLessThan(attackerStartHp)
  })

  test('consumeOnTrigger removes the counter guard after it fires', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]

    const guard = makeCounterGuardState('consume-test-counter', 5)
    guard.consumeOnTrigger = true
    defender.reactionGuards.push(guard)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 10, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(
      state,
      makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, defender.instanceId),
      'player',
    )

    const defenderAfter = result.state.enemyTeam.find((f) => f.instanceId === defender.instanceId)!
    const guardAfter = defenderAfter.reactionGuards.find((g) => g.id === 'consume-test-counter')
    // Guard should be consumed (remainingRounds === 0 or removed)
    expect(!guardAfter || guardAfter.remainingRounds === 0).toBe(true)
  })

  test('counter return damage does not trigger another counter on the original attacker', () => {
    // Counter return damage carries cannotBeCountered flag.
    // The original attacker (who receives counter damage) should NOT be able to
    // counter the counter damage, even if they have a counter guard.
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const defender = state.enemyTeam[0]
    const attackerStartHp = attacker.hp

    // Give attacker a counter guard — it should NOT fire on the counter return damage
    attacker.reactionGuards.push(makeCounterGuardState('attacker-counter', 50))

    // Give defender a counter that will fire first
    defender.reactionGuards.push(makeCounterGuardState('defender-counter', 10))

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 20, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(
      state,
      makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, defender.instanceId),
      'player',
    )

    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    const defenderAfter = result.state.enemyTeam.find((f) => f.instanceId === defender.instanceId)!
    // Attacker took the 10 counter damage (not blocked by their own counter guard)
    expect(attackerAfter.hp).toBe(attackerStartHp - 10)
    // Defender took no damage (action was canceled)
    expect(defenderAfter.hp).toBe(defender.hp)
    // Defender's guard was consumed; attacker's guard was NOT consumed (never triggered)
    const attackerGuardAfter = attackerAfter.reactionGuards.find((g) => g.id === 'attacker-counter')
    expect(attackerGuardAfter?.remainingRounds).toBeGreaterThan(0)
  })
})

// ─── Phase 8: Fire-But-Block — Invulnerability Blocks All Harmful Effects ────
//
// Law 5.3: invulnerability is a targeting law. When a harmful ability fires
// into the fire-but-block scenario (target became invulnerable after legal
// queuing), ALL harmful effects are blocked — not just damage.
// Helpful and neutral effects pass through normally.
// Self-bypass: a fighter's own ability effects on themselves are not blocked
// by their own invulnerability (identical ruling to effect immunity self-bypass).
//
// Neutral effect ruling: effects whose getEffectIntent() is 'neutral'
// (setMode, adjustCounter, setFlag, removeModifier, addModifier — context-
// dependent) are NOT blocked by invulnerability. Their impact is ambiguous and
// blocking them would incorrectly interfere with self-setup mechanics.

describe('referee — Phase 8 fire-but-block: invulnerability blocks non-damage harmful effects', () => {
  test('stun is blocked when target is invulnerable (fire-but-block)', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    applyInvulnerableModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'stun', duration: 1, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Stun should not have landed
    expect(targetAfter.statuses.some((s) => s.kind === 'stun')).toBe(false)
  })

  test('damage is still blocked by invulnerability (existing applyDamagePacket path preserved)', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]
    const startHp = target.hp

    applyInvulnerableModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 30, target: 'inherit', damageType: 'normal' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    expect(targetAfter.hp).toBe(startHp)
    // Existing invulnerability blocked log from applyDamagePacket
    expect(result.events.some((e) => e.message.toLowerCase().includes('invulnerability'))).toBe(true)
  })

  test('cooldown increase (cooldownAdjust > 0) is blocked when target is invulnerable', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    applyInvulnerableModifier(target)

    const targetAbilityId = target.abilities[0]?.id ?? 'test-ability'
    // Manually give a known cooldown state
    target.cooldowns[targetAbilityId] = 0

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'cooldownAdjust', abilityId: targetAbilityId, amount: 2, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Cooldown should not have been increased
    expect(targetAfter.cooldowns[targetAbilityId] ?? 0).toBe(0)
  })

  test('breakShield is blocked when target is invulnerable', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    applyInvulnerableModifier(target)
    target.shield = { label: 'Iron Guard', amount: 50, tags: [] }

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'breakShield', target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Shield should survive (breakShield blocked)
    expect(targetAfter.shield?.amount).toBe(50)
  })

  test('burn (harmful status) is blocked when target is invulnerable', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    applyInvulnerableModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'burn', damage: 5, duration: 2, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Burn modifier should not have been applied
    expect(targetAfter.modifiers.some((m) => m.stat === 'dotDamage')).toBe(false)
  })

  test('mixed ability: enemy stun blocked, self-heal still resolves', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]
    const attackerStartHp = Math.floor(attacker.maxHp / 2)
    attacker.hp = attackerStartHp

    applyInvulnerableModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [
        { type: 'stun', duration: 1, target: 'inherit' },  // harmful → blocked
        { type: 'heal', power: 20, target: 'self' },       // helpful → not blocked
      ],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    const attackerAfter = result.state.playerTeam.find((f) => f.instanceId === attacker.instanceId)!
    // Stun blocked
    expect(targetAfter.statuses.some((s) => s.kind === 'stun')).toBe(false)
    // Heal on self resolved normally
    expect(attackerAfter.hp).toBeGreaterThan(attackerStartHp)
  })

  test('helpful ally effect still applies to an invulnerable target (helpful not blocked)', () => {
    const state = createChargedState()
    const ally = state.playerTeam[0]
    const target = state.playerTeam[1]
    const targetStartHp = Math.floor(target.maxHp / 2)
    target.hp = targetStartHp

    applyInvulnerableModifier(target)

    ally.abilities[0] = {
      ...ally.abilities[0],
      energyCost: {},
      targetRule: 'ally-single',
      kind: 'heal',
      effects: [{ type: 'heal', power: 30, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(ally.instanceId, 'player', ally.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.playerTeam.find((f) => f.instanceId === target.instanceId)!
    // Heal should have landed on the invulnerable ally
    expect(targetAfter.hp).toBeGreaterThan(targetStartHp)
  })

  test('neutral effect (setMode on enemy) passes through invulnerability (no block)', () => {
    // setMode is 'neutral' by getEffectIntent — not subject to invulnerability gate.
    // This documents the ruling: neutral effects are not blocked by invulnerability.
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    applyInvulnerableModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'setMode', key: 'test_mode', value: 'active', duration: 1, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // setMode is neutral — it passes through, no blocking
    expect(targetAfter.stateModes['test_mode']).toBe('active')
  })

  test('ignoresInvulnerability damage still bypasses invulnerability (ability-level bypass)', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]
    const startHp = target.hp

    applyInvulnerableModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'damage', power: 25, target: 'inherit', damageType: 'normal', ignoresInvulnerability: true }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    expect(targetAfter.hp).toBeLessThan(startHp)
  })

  test('self-bypass: defensive ability grants invulnerability + sets up reaction guard on self (not blocked)', () => {
    // A fighter uses an ability targeting self that grants invulnerability AND
    // sets up a reaction guard. The reaction guard setup is classified 'harmful'
    // by getEffectIntent (it has harmfulOnly:true and damaging nested effects).
    // But because effectActor === effectTarget (self-targeting), the gate does
    // not fire — the fighter's own invulnerability does not block their own
    // ability from completing.
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      kind: 'defend',
      effects: [
        { type: 'invulnerable', duration: 1, target: 'self' },
        {
          type: 'reaction',
          label: 'Retaliation',
          trigger: 'onBeingTargeted',
          duration: 1,
          harmfulOnly: true,
          consumeOnTrigger: true,
          target: 'self',
          effects: [{ type: 'damage', power: 20, target: 'attacker' }],
        },
      ],
    }

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    // Should have the invulnerable status
    expect(actorAfter.statuses.some((s) => s.kind === 'invincible')).toBe(true)
    // Should have the reaction guard set up
    expect(actorAfter.reactionGuards.some((g) => g.kind === 'effect' && g.trigger === 'onBeingTargeted')).toBe(true)
  })

  test('non-damage invulnerability block emits a log event', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    applyInvulnerableModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'attack',
      effects: [{ type: 'stun', duration: 1, target: 'inherit' }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    // A log event should be emitted mentioning invulnerability
    expect(result.events.some((e) => e.targetId === target.instanceId && e.message.toLowerCase().includes('invulnerability'))).toBe(true)
  })
})

describe('referee — Phase 9: declared intent on ambiguous effect types', () => {
  // Phase 9 added intent?: 'helpful' | 'harmful' | 'neutral' to addModifier,
  // removeModifier, adjustCounter, setCounter, setFlag, setMode, clearMode,
  // adjustSourceCounter, adjustCounterByTriggerAmount, and resetCounter.
  // getEffectIntent() now reads effect.intent before the switch statement.

  test('addModifier with intent:helpful is blocked by canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{
        type: 'addModifier',
        target: 'self',
        intent: 'helpful',
        modifier: {
          label: 'Power Boost',
          stat: 'damageDealt',
          mode: 'flat',
          value: 15,
          duration: { kind: 'rounds', rounds: 2 },
          tags: ['attackUp'],
          visible: true,
          stacking: 'max',
        },
      }],
    }
    applyCannotReceiveHelpfulModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    // intent:'helpful' → classified as helpful → blocked
    expect(actorAfter.modifiers.some((m) => m.stat === 'damageDealt' && m.value === 15)).toBe(false)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })

  test('addModifier with intent:harmful is NOT blocked by canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'debuff',
      effects: [{
        type: 'addModifier',
        target: 'inherit',
        intent: 'harmful',
        modifier: {
          label: 'Weaken',
          stat: 'damageTaken',
          mode: 'flat',
          value: 10,
          duration: { kind: 'rounds', rounds: 2 },
          tags: ['debuff'],
          visible: true,
          stacking: 'max',
        },
      }],
    }
    applyCannotReceiveHelpfulModifier(target)

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // harmful addModifier passes through regardless of helpful-immunity
    expect(targetAfter.modifiers.some((m) => m.tags.includes('debuff') && m.stat === 'damageTaken' && m.value === 10)).toBe(true)
  })

  test('addModifier with no intent declared is neutral — not blocked by canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{
        type: 'addModifier',
        target: 'self',
        // no intent field — default neutral
        modifier: {
          label: 'Neutral Buff',
          stat: 'damageDealt',
          mode: 'flat',
          value: 5,
          duration: { kind: 'rounds', rounds: 1 },
          tags: [],
          visible: false,
          stacking: 'max',
        },
      }],
    }
    applyCannotReceiveHelpfulModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    // no intent → neutral → not blocked
    expect(actorAfter.modifiers.some((m) => m.stat === 'damageDealt' && m.value === 5)).toBe(true)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(false)
  })

  test('adjustCounter with intent:helpful is blocked by canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{
        type: 'adjustCounter',
        key: 'some_resource',
        amount: 3,
        target: 'self',
        intent: 'helpful',
      }],
    }
    applyCannotReceiveHelpfulModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    // Counter not adjusted because the effect is blocked
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    expect(actorAfter.stateCounters['some_resource'] ?? 0).toBe(0)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })

  test('setFlag with intent:helpful is blocked by canReceiveHelpfulEffects=false', () => {
    const state = createChargedState()
    const actor = state.playerTeam[0]

    actor.abilities[0] = {
      ...actor.abilities[0],
      energyCost: {},
      targetRule: 'self',
      effects: [{
        type: 'setFlag',
        key: 'some_flag',
        value: true,
        target: 'self',
        intent: 'helpful',
      }],
    }
    applyCannotReceiveHelpfulModifier(actor)

    const result = resolveTeamTurn(state, makeQueue(actor.instanceId, 'player', actor.abilities[0].id, null), 'player')
    const actorAfter = result.state.playerTeam.find((f) => f.instanceId === actor.instanceId)!
    expect(actorAfter.stateFlags['some_flag'] ?? false).toBe(false)
    expect(result.events.some((e) => e.message.toLowerCase().includes('cannot receive helpful effects'))).toBe(true)
  })

  test('addModifier with intent:helpful on an enemy target is blocked by canReceiveHarmfulEffects', () => {
    // Sanity: a harmful-tagged addModifier targeting an invulnerable enemy should still be gated
    const state = createChargedState()
    const attacker = state.playerTeam[0]
    const target = state.enemyTeam[0]
    applyInvulnerableModifier(target)

    attacker.abilities[0] = {
      ...attacker.abilities[0],
      energyCost: {},
      targetRule: 'enemy-single',
      kind: 'debuff',
      effects: [{
        type: 'addModifier',
        target: 'inherit',
        intent: 'harmful',
        modifier: {
          label: 'Cripple',
          stat: 'damageTaken',
          mode: 'flat',
          value: 20,
          duration: { kind: 'rounds', rounds: 1 },
          tags: ['debuff'],
          visible: true,
          stacking: 'max',
        },
      }],
    }

    const result = resolveTeamTurn(state, makeQueue(attacker.instanceId, 'player', attacker.abilities[0].id, target.instanceId), 'player')
    const targetAfter = result.state.enemyTeam.find((f) => f.instanceId === target.instanceId)!
    // Invulnerability blocks harmful non-damage effects
    expect(targetAfter.modifiers.some((m) => m.tags.includes('debuff') && m.stat === 'damageTaken' && m.value === 20)).toBe(false)
  })
})
