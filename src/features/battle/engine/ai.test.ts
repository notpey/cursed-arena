/**
 * ai.test.ts — Unit tests for AI command building and pacing helpers.
 *
 * Tests cover:
 * - calcAiTurnDelay: deterministic pacing helper
 * - buildEnemyCommands: target selection sanity (lethal, invulnerable avoidance,
 *   required-tag payoffs, heal priority, helpful-immunity respect)
 */

import { describe, expect, test } from 'vitest'
import { createEnergyAmounts } from '@/features/battle/energy'
import { createInitialBattleState } from '@/features/battle/engine'
import { upsertModifier, createModifierInstance } from '@/features/battle/modifiers'
import type {
  BattleFighterState,
  BattleModifierTemplate,
  BattleState,
} from '@/features/battle/types'
import { buildEnemyCommands, calcAiTurnDelay } from '@/features/battle/engine/ai'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createChargedState(
  playerTeamIds = ['yuji', 'nobara', 'megumi'],
  enemyTeamIds = ['nanami', 'maki', 'shoko'],
): BattleState {
  const state = createInitialBattleState({ playerTeamIds, enemyTeamIds })
  const full = { amounts: createEnergyAmounts({ physical: 6, technique: 6, vow: 6, mental: 6 }) }
  state.playerEnergy = { ...full, amounts: { ...full.amounts } }
  state.enemyEnergy = { ...full, amounts: { ...full.amounts } }
  return state
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

function applyHelpfulImmunityModifier(fighter: BattleFighterState) {
  const template: BattleModifierTemplate = {
    label: 'Cannot Receive Helpful Effects',
    stat: 'canReceiveHelpfulEffects',
    mode: 'set',
    value: false,
    duration: { kind: 'rounds', rounds: 1 },
    tags: ['status', 'lock'],
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

// ─── calcAiTurnDelay ─────────────────────────────────────────────────────────

describe('calcAiTurnDelay', () => {
  test('returns base delay for zero actions', () => {
    const delay = calcAiTurnDelay(0)
    expect(delay).toBeGreaterThan(0)
    expect(delay).toBeLessThanOrEqual(1800)
  })

  test('increases with more non-pass actions', () => {
    const d0 = calcAiTurnDelay(0)
    const d1 = calcAiTurnDelay(1)
    const d3 = calcAiTurnDelay(3)
    expect(d1).toBeGreaterThan(d0)
    expect(d3).toBeGreaterThan(d1)
  })

  test('is capped at 1800ms regardless of action count', () => {
    expect(calcAiTurnDelay(100)).toBe(1800)
  })

  test('is deterministic — same input always returns same value', () => {
    expect(calcAiTurnDelay(2)).toBe(calcAiTurnDelay(2))
  })
})

// ─── buildEnemyCommands — target selection ───────────────────────────────────

describe('buildEnemyCommands target selection', () => {
  test('prefers lethal target when a player fighter can be finished off', () => {
    const state = createChargedState(['yuji', 'nobara', 'megumi'], ['nanami', 'maki', 'shoko'])

    // Set yuji (player slot 0) to 1 HP — a lethal target for any attack
    const yuji = state.playerTeam[0]!
    yuji.hp = 1

    const commands = buildEnemyCommands(state)

    // At least one enemy attacker should target the near-dead yuji
    const attackTargets = Object.values(commands)
      .filter((cmd) => cmd.targetId !== null)
      .map((cmd) => cmd.targetId)

    expect(attackTargets).toContain(yuji.instanceId)
  })

  test('avoids invulnerable player target for harmful abilities when another target exists', () => {
    const state = createChargedState(['yuji', 'nobara', 'megumi'], ['nanami', 'maki', 'shoko'])

    // Make yuji (slot 0) invulnerable
    const yuji = state.playerTeam[0]!
    applyInvulnerableModifier(yuji)

    // Reduce nobara (slot 1) HP so she is clearly more appealing
    const nobara = state.playerTeam[1]!
    nobara.hp = Math.floor(nobara.maxHp * 0.3)

    const commands = buildEnemyCommands(state)

    // No enemy harmful command should target the invulnerable yuji
    // (unless the ability explicitly bypasses invulnerability, which the
    // standard fighters do not)
    const harmfulTargetsInvul = Object.values(commands).filter(
      (cmd) => cmd.targetId === yuji.instanceId,
    )
    expect(harmfulTargetsInvul).toHaveLength(0)
  })

  test('prefers lower-HP target over full-health target', () => {
    const state = createChargedState(['yuji', 'nobara'], ['nanami', 'maki', 'shoko'])

    const yuji = state.playerTeam[0]!
    const nobara = state.playerTeam[1]!

    // yuji full HP, nobara at 20%
    nobara.hp = Math.floor(nobara.maxHp * 0.2)

    const commands = buildEnemyCommands(state)

    const enemySingleTargets = Object.values(commands)
      .filter((cmd) => cmd.targetId !== null && cmd.team === 'enemy')
      .map((cmd) => cmd.targetId)

    // At least one attacker should prefer the weakened nobara
    expect(enemySingleTargets).toContain(nobara.instanceId)

    // No attacker should prefer full-health yuji when nobara is at 20%
    // (this checks that the low-HP heuristic drives targeting)
    const yujiTargets = enemySingleTargets.filter((id) => id === yuji.instanceId)
    const nobaraTargets = enemySingleTargets.filter((id) => id === nobara.instanceId)
    expect(nobaraTargets.length).toBeGreaterThanOrEqual(yujiTargets.length)
  })

  test('does not heal a full-health ally when a damaged ally exists', () => {
    // Use shoko (healer) on the enemy team
    const state = createChargedState(['yuji', 'nobara', 'megumi'], ['shoko', 'maki', 'nanami'])

    const shoko = state.enemyTeam.find((f) => f.templateId === 'shoko')!
    const maki = state.enemyTeam.find((f) => f.templateId === 'maki')!
    const nanami = state.enemyTeam.find((f) => f.templateId === 'nanami')!

    // maki is full HP, nanami is at 30%
    maki.hp = maki.maxHp
    nanami.hp = Math.floor(nanami.maxHp * 0.3)

    const commands = buildEnemyCommands(state)

    const shokaCommand = commands[shoko.instanceId]
    // If shoko queued a heal-type action, it should target the damaged nanami, not full maki
    if (shokaCommand && shokaCommand.targetId !== null) {
      // The heal target should not be the full-health maki
      expect(shokaCommand.targetId).not.toBe(maki.instanceId)
    }
  })

  test('does not use payoff skill when required target tag is absent', () => {
    // Nobara's Soul Resonance requires 'straw-doll' tag on target.
    // If no player fighter carries that tag, the AI should not choose Soul Resonance.
    const state = createChargedState(['yuji', 'megumi', 'maki'], ['nobara', 'nanami', 'shoko'])

    const nobara = state.enemyTeam.find((f) => f.templateId === 'nobara')!
    // Ensure no player team fighter has the straw-doll marker
    state.playerTeam.forEach((f) => {
      f.modifiers = f.modifiers.filter((m) => !m.tags.includes('straw-doll'))
    })

    const commands = buildEnemyCommands(state)
    const nobaraCommand = commands[nobara.instanceId]

    // Soul Resonance ability id in nobara.ts is 'nobara-soul-resonance'
    expect(nobaraCommand?.abilityId).not.toBe('nobara-soul-resonance')
  })

  test('does not target ally blocked from helpful effects', () => {
    // Use shoko (healer) on enemy team; block one ally from receiving helpful effects
    const state = createChargedState(['yuji', 'nobara', 'megumi'], ['shoko', 'maki', 'nanami'])

    const shoko = state.enemyTeam.find((f) => f.templateId === 'shoko')!
    const maki = state.enemyTeam.find((f) => f.templateId === 'maki')!
    const nanami = state.enemyTeam.find((f) => f.templateId === 'nanami')!

    // Damage both maki and nanami so they both need healing
    maki.hp = Math.floor(maki.maxHp * 0.4)
    nanami.hp = Math.floor(nanami.maxHp * 0.4)

    // Block maki from receiving helpful effects
    applyHelpfulImmunityModifier(maki)

    const commands = buildEnemyCommands(state)
    const shokoCommand = commands[shoko.instanceId]

    // If shoko chose a heal, it must not target the blocked maki
    if (shokoCommand?.targetId !== null) {
      expect(shokoCommand?.targetId).not.toBe(maki.instanceId)
    }
  })
})
