import { describe, expect, test } from 'vitest'
import { getActivePips } from '@/components/battle/battleDisplay'
import { createInitialBattleState } from '@/features/battle/engine'
import type { BattleFighterState, BattleModifierInstance, PassiveEffect } from '@/features/battle/types'

function createPlayerFighter(): BattleFighterState {
  const state = createInitialBattleState({ battleSeed: 'pip-tests' })
  const fighter = state.playerTeam[0]
  if (!fighter) throw new Error('Expected a player fighter for pip tests')
  return fighter
}

describe('battleDisplay active pips', () => {
  test('groups stack counters under the originating ability pip', () => {
    const fighter = createPlayerFighter()
    const sourceAbilityId = fighter.ultimate.id

    const roundOneModifier: BattleModifierInstance = {
      id: 'mod-round-1',
      label: 'Round One Bonus',
      sourceActorId: fighter.instanceId,
      sourceAbilityId,
      scope: 'fighter',
      stat: 'damageDealt',
      mode: 'flat',
      value: 10,
      duration: { kind: 'rounds', remaining: 1 },
      tags: ['test'],
      visible: true,
      stacking: 'replace',
    }

    const roundThreeModifier: BattleModifierInstance = {
      id: 'mod-round-3',
      label: 'Round Three Bonus',
      sourceActorId: fighter.instanceId,
      sourceAbilityId,
      scope: 'fighter',
      stat: 'damageTaken',
      mode: 'flat',
      value: -8,
      duration: { kind: 'rounds', remaining: 3 },
      tags: ['test'],
      visible: true,
      stacking: 'replace',
    }

    fighter.modifiers = [...fighter.modifiers, roundThreeModifier, roundOneModifier]
    fighter.stateCounters = {
      ...fighter.stateCounters,
      [`${sourceAbilityId}-stacks`]: 2,
    }

    const pips = getActivePips(fighter)
    const sourcePip = pips.find((pip) => pip.key === `pip-${sourceAbilityId}`)

    expect(sourcePip).toBeTruthy()
    expect(sourcePip?.stackCount).toBe(2)
    expect(sourcePip?.lines[0]?.turnsLeft).toBe(1)
    expect(sourcePip?.lines[1]?.turnsLeft).toBe(3)
  })

  test('shows only baseline passives and lists concrete effect lines with durations first', () => {
    const fighter = createPlayerFighter()

    const baselinePassive: PassiveEffect = {
      id: 'vessel-body',
      label: 'Vessel Body',
      description: 'Not used when effects are present.',
      trigger: 'whileAlive',
      effects: [
        { type: 'attackUp', amount: 12, duration: 2, target: 'self' },
        { type: 'damageBoost', amount: 0.2, target: 'self' },
      ],
      icon: { label: 'VO', tone: 'teal' },
    }

    const nonBaselinePassive: PassiveEffect = {
      id: 'round-start-passive',
      label: 'Round Start Burst',
      description: 'Should not show as an opening passive pip.',
      trigger: 'onRoundStart',
      effects: [{ type: 'heal', power: 10, target: 'self' }],
      icon: { label: 'RS', tone: 'red' },
    }

    fighter.modifiers = []
    fighter.abilityState = []
    fighter.classStuns = []
    fighter.effectImmunities = []
    fighter.reactionGuards = []
    fighter.shield = null
    fighter.stateCounters = {}
    fighter.passiveEffects = [baselinePassive, nonBaselinePassive]

    const pips = getActivePips(fighter)
    const passivePip = pips.find((pip) => pip.key === 'passive-vessel-body')

    expect(passivePip).toBeTruthy()
    expect(pips.some((pip) => pip.label.includes('Round Start Burst'))).toBe(false)
    expect(passivePip?.lines[0]?.turnsLeft).toBe(2)
    expect(passivePip?.lines[0]?.text).toContain('While alive')
    expect(passivePip?.lines[0]?.text).toContain('Gain +12 damage')
    expect(passivePip?.lines[1]?.turnsLeft).toBeNull()
    expect(passivePip?.lines[1]?.text).toContain('Gain 20% bonus damage')
    expect(passivePip?.lines.some((line) => line.text.toLowerCase().includes('this is a passive'))).toBe(false)
  })

  test('renders legacy pass-kind abilities as passive pips for compatibility', () => {
    const fighter = createPlayerFighter()
    const passAbility = {
      ...fighter.abilities[0],
      id: `${fighter.templateId}-legacy-passive`,
      name: 'Legacy Passive',
      kind: 'pass' as const,
      targetRule: 'none' as const,
      effects: [{ type: 'damageBoost', amount: 0.15, target: 'self' }] as typeof fighter.abilities[0]['effects'],
    }

    fighter.abilities = [passAbility, ...fighter.abilities.slice(1)]
    fighter.passiveEffects = []
    fighter.modifiers = []
    fighter.stateCounters = {}

    const pips = getActivePips(fighter)
    const legacyPip = pips.find((pip) => pip.key === `pass-ability-${passAbility.id}`)

    expect(legacyPip).toBeTruthy()
    expect(legacyPip?.label).toBe('Legacy Passive')
    expect(legacyPip?.lines[0]?.text).toContain('Gain 15% bonus damage')
  })
})
