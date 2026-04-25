import { describe, expect, test } from 'vitest'
import { createEnergyAmounts, totalEnergyInPool } from '@/features/battle/energy'
import { battleRoster } from '@/features/battle/data'
import {
  beginNewRound,
  canUseAbility,
  createInitialBattleState,
  endRound,
  endRoundTimeline,
  getTeam,
  resolveTeamTurn,
  resolveTeamTurnTimeline,
} from '@/features/battle/engine'
import { getStatusDuration } from '@/features/battle/statuses'
import type { BattleState, QueuedBattleAction } from '@/features/battle/types'
import { validateBattleContent } from '@/features/battle/validation'

function getFighter(state: BattleState, team: 'player' | 'enemy', templateId: string) {
  const fighter = getTeam(state, team).find((unit) => unit.templateId === templateId)
  if (!fighter) {
    throw new Error(`Missing fighter ${team}:${templateId}`)
  }
  return fighter
}

function queue(team: 'player' | 'enemy', actorId: string, abilityId: string, targetId: string | null): Record<string, QueuedBattleAction> {
  return {
    [actorId]: { actorId, team, abilityId, targetId },
  }
}

function createChargedBattleState(overrides?: Parameters<typeof createInitialBattleState>[0]) {
  const state = createInitialBattleState(overrides)
  const chargedPool = {
    amounts: createEnergyAmounts({ physical: 6, technique: 6, vow: 6, mental: 6 }),
  }
  state.playerEnergy = { ...chargedPool, amounts: { ...chargedPool.amounts } }
  state.enemyEnergy = { ...chargedPool, amounts: { ...chargedPool.amounts } }
  return state
}

describe('battle engine scenarios', () => {
  test('initial energy gives the opening player 1 and the second player normal distribution', () => {
    const state = createInitialBattleState({ battleSeed: 'opening-distribution' })
    const openingTotal = state.firstPlayer === 'player' ? totalEnergyInPool(state.playerEnergy) : totalEnergyInPool(state.enemyEnergy)
    const secondTotal = state.firstPlayer === 'player' ? totalEnergyInPool(state.enemyEnergy) : totalEnergyInPool(state.playerEnergy)

    expect(openingTotal).toBe(1)
    expect(secondTotal).toBe(3)
  })

  test('round initiative alternates each new round', () => {
    const state = createChargedBattleState({ battleSeed: 'initiative-alternates' })
    state.firstPlayer = 'player'
    state.activePlayer = 'player'

    const firstAdvance = beginNewRound(state)
    expect(firstAdvance.state.firstPlayer).toBe('enemy')
    expect(firstAdvance.state.activePlayer).toBe('enemy')
    expect(firstAdvance.state.phase).toBe('firstPlayerCommand')

    const secondAdvance = beginNewRound(firstAdvance.state)
    expect(secondAdvance.state.firstPlayer).toBe('player')
    expect(secondAdvance.state.activePlayer).toBe('player')
    expect(secondAdvance.state.phase).toBe('firstPlayerCommand')
  })

  test('Megumi spends Shikigami to empower Divine Dogs', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')
    megumi.stateCounters.shikigami = 4

    const result = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, 'megumi-dogs', yuji.instanceId),
      'player',
    )

    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')
    const updatedMegumi = getFighter(result.state, 'player', 'megumi')

    expect(updatedYuji.hp).toBe(80)
    expect(updatedMegumi.stateCounters.shikigami).toBe(2)
    expect(updatedYuji.classStuns.some((stun) => stun.blockedClasses.includes('Physical'))).toBe(true)
  })

  test('Megumi does not spend Shikigami below the empowerment threshold', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')
    megumi.stateCounters.shikigami = 2

    const result = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, 'megumi-dogs', yuji.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(95)
    expect(getFighter(result.state, 'player', 'megumi').stateCounters.shikigami).toBe(2)
    expect(getFighter(result.state, 'enemy', 'yuji').classStuns).toHaveLength(0)
  })

  test('classStun persists through the round it was applied in', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')
    megumi.stateCounters.shikigami = 4

    const afterTurn = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, 'megumi-dogs', yuji.instanceId),
      'player',
    )
    expect(getFighter(afterTurn.state, 'enemy', 'yuji').classStuns.some((cs) => cs.blockedClasses.includes('Physical'))).toBe(true)

    const afterRound = endRound(afterTurn.state)
    expect(getFighter(afterRound.state, 'enemy', 'yuji').classStuns.some((cs) => cs.blockedClasses.includes('Physical'))).toBe(true)
  })

  test('random energy allocation on queued commands is honored during spend', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    yuji.abilities[0].energyCost = { random: 1 }
    state.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 2, vow: 0, mental: 0 })

    const resolved = resolveTeamTurn(
      state,
      {
        [yuji.instanceId]: {
          actorId: yuji.instanceId,
          team: 'player',
          abilityId: yuji.abilities[0].id,
          targetId: enemyYuji.instanceId,
          randomCostAllocation: { physical: 1 },
        },
      },
      'player',
    )

    expect(resolved.state.playerEnergy.amounts.physical).toBe(0)
    expect(resolved.state.playerEnergy.amounts.technique).toBe(2)
  })

  test('Yuji transformation restores HP from accumulated bonus and prevents defeat for the turn', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyMegumi = getFighter(state, 'enemy', 'megumi')
    yuji.hp = 12
    yuji.stateCounters.sukuna_bonus_hp = 15

    enemyMegumi.abilities[0].energyCost = {}
    enemyMegumi.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('enemy', enemyMegumi.instanceId, enemyMegumi.abilities[0].id, yuji.instanceId),
      'enemy',
    )

    const transformedYuji = getFighter(result.state, 'player', 'yuji')
    expect(transformedYuji.hp).toBe(25)
    expect(transformedYuji.stateFlags.sukuna_vessel_used).toBe(true)
    expect(transformedYuji.modifiers.some((modifier) => modifier.stat === 'isUndying')).toBe(true)
    expect(transformedYuji.abilityState.some((delta) => delta.mode === 'replace')).toBe(true)
  })

  test('Yuji Cursed Rush tracks repeat random hits and increases transformation HP', () => {
    let state = createChargedBattleState({ battleSeed: 'rush-repeat' })
    const yuji = getFighter(state, 'player', 'yuji')
    getFighter(state, 'enemy', 'nobara').hp = 0
    getFighter(state, 'enemy', 'megumi').hp = 0

    state = resolveTeamTurn(
      state,
      queue('player', yuji.instanceId, 'yuji-cursed-rush', yuji.instanceId),
      'player',
    ).state
    state = beginNewRound(state).state
    state = beginNewRound(state).state
    state = beginNewRound(state).state

    const updatedYuji = getFighter(state, 'player', 'yuji')
    const target = getFighter(state, 'enemy', 'yuji')
    expect(target.hp).toBe(70)
    expect(updatedYuji.stateCounters.sukuna_bonus_hp).toBe(10)
  })

  test('Yuji Black Flash damages the primary target and only splashes other enemies', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const mainTarget = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', yuji.instanceId, 'yuji-black-flash', mainTarget.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(result.state, 'enemy', 'nobara').hp).toBe(95)
    expect(getFighter(result.state, 'enemy', 'megumi').hp).toBe(91)
  })

  test('Yuji gains transformation HP when Brink Control blocks damage', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const guarded = resolveTeamTurn(
      state,
      queue('player', yuji.instanceId, 'yuji-brink-control', yuji.instanceId),
      'player',
    )
    const guardedYuji = getFighter(guarded.state, 'player', 'yuji')
    const attacker = getFighter(guarded.state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}

    const hit = resolveTeamTurn(
      guarded.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, guardedYuji.instanceId),
      'enemy',
    )

    expect(getFighter(hit.state, 'player', 'yuji').hp).toBe(yuji.hp)
    expect(getFighter(hit.state, 'player', 'yuji').stateCounters.sukuna_bonus_hp).toBe(5)
    expect(getFighter(hit.state, 'enemy', 'yuji').instanceId).toBe(enemyYuji.instanceId)
  })

  test('Nobara Straw Doll Ritual opens Hairpin targeting against attackers', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const ritual = resolveTeamTurn(
      state,
      queue('player', nobara.instanceId, 'nobara-straw-doll-ritual', nobara.instanceId),
      'player',
    )
    const ritualNobara = getFighter(ritual.state, 'player', 'nobara')
    const attacker = getFighter(ritual.state, 'enemy', 'yuji')

    const attacked = resolveTeamTurn(
      ritual.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, ritualNobara.instanceId),
      'enemy',
    )

    expect(getFighter(attacked.state, 'player', 'nobara').stateFlags.straw_doll_ritual_active).toBe(true)
    expect(getFighter(attacked.state, 'enemy', 'yuji').modifiers.some((modifier) => modifier.tags.includes('nobara-hairpin-targetable'))).toBe(true)
    expect(getFighter(attacked.state, 'enemy', 'yuji').instanceId).toBe(enemyYuji.instanceId)
  })

  test('Nobara Hairpin hits all tagged enemies and ignores untagged enemies', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const enemyMegumi = getFighter(state, 'enemy', 'megumi')

    enemyYuji.modifiers.push({
      id: 'hairpin-yuji',
      label: 'Hairpin Opening',
      scope: 'fighter',
      targetId: enemyYuji.instanceId,
      stat: 'cooldownTick',
      mode: 'flat',
      value: 0,
      duration: { kind: 'rounds', remaining: 1 },
      tags: ['nobara-hairpin-targetable'],
      visible: true,
      stacking: 'replace',
    })
    enemyYuji.stateCounters.straw_doll_damage_taken = 1
    enemyMegumi.modifiers.push({
      id: 'hairpin-megumi',
      label: 'Hairpin Opening',
      scope: 'fighter',
      targetId: enemyMegumi.instanceId,
      stat: 'cooldownTick',
      mode: 'flat',
      value: 0,
      duration: { kind: 'rounds', remaining: 1 },
      tags: ['nobara-hairpin-targetable'],
      visible: true,
      stacking: 'replace',
    })

    const result = resolveTeamTurn(
      state,
      queue('player', nobara.instanceId, 'nobara-hairpin', null),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(result.state, 'enemy', 'megumi').hp).toBe(81)
    expect(getFighter(result.state, 'enemy', 'nobara').hp).toBe(100)
    expect(getFighter(result.state, 'enemy', 'yuji').stateCounters.straw_doll_damage_taken).toBe(2)
    expect(getFighter(result.state, 'enemy', 'megumi').stateCounters.straw_doll_damage_taken).toBe(1)
  })

  test('Nobara Straw Effigy punishes enemies when they use a skill', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'player', 'nobara')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const marked = resolveTeamTurn(
      state,
      queue('player', nobara.instanceId, 'nobara-hammer-and-nails', enemyYuji.instanceId),
      'player',
    )
    const markedYuji = getFighter(marked.state, 'enemy', 'yuji')
    const targetNobara = getFighter(marked.state, 'player', 'nobara')
    const beforeSkillHp = markedYuji.hp

    const punished = resolveTeamTurn(
      marked.state,
      queue('enemy', markedYuji.instanceId, markedYuji.abilities[0].id, targetNobara.instanceId),
      'enemy',
    )

    expect(beforeSkillHp).toBe(80)
    expect(getFighter(punished.state, 'enemy', 'yuji').hp).toBe(75)
  })

  test('resolveTeamTurn emits runtime events and packets for a damaging ability', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, 'megumi-dogs', yuji.instanceId),
      'player',
    )

    expect(result.runtimeEvents.some((event) => event.type === 'ability_used' && event.abilityId === 'megumi-dogs')).toBe(true)
    expect(result.runtimeEvents.some((event) => event.type === 'resource_changed' && event.abilityId === 'megumi-dogs')).toBe(true)

    const damageEvent = result.runtimeEvents.find((event) => event.type === 'damage_applied' && event.targetId === yuji.instanceId)
    expect(damageEvent?.packet?.kind).toBe('damage')
    if (damageEvent?.packet?.kind === 'damage') {
      expect(damageEvent.packet.baseAmount).toBe(5)
      expect(damageEvent.packet.amount).toBe(5)
      expect(damageEvent.packet.damageType).toBe('normal')
    }
  })

  test('resolveTeamTurnTimeline returns per-action state snapshots', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    yuji.abilities[0].energyCost = {}

    const timeline = resolveTeamTurnTimeline(
      state,
      {
        [megumi.instanceId]: { actorId: megumi.instanceId, team: 'player', abilityId: 'megumi-dogs', targetId: enemyYuji.instanceId },
        [yuji.instanceId]: { actorId: yuji.instanceId, team: 'player', abilityId: 'yuji-divergent-fist', targetId: enemyYuji.instanceId },
      },
      'player',
      [megumi.instanceId, yuji.instanceId],
    )

    expect(timeline.steps).toHaveLength(3)
    expect(timeline.steps[0]?.actorId).toBe(megumi.instanceId)
    expect(getFighter(timeline.steps[0]!.state, 'enemy', 'yuji').hp).toBeLessThan(enemyYuji.hp)
    expect(timeline.steps[1]?.actorId).toBe(yuji.instanceId)
    expect(getFighter(timeline.steps[1]!.state, 'enemy', 'yuji').hp).toBeLessThan(getFighter(timeline.steps[0]!.state, 'enemy', 'yuji').hp)
  })

  test('endRoundTimeline separates cleanup from next-round setup', () => {
    const state = createChargedBattleState()
    const timeline = endRoundTimeline(state)

    expect(timeline.steps.some((step) => step.kind === 'roundEnd')).toBe(true)
    expect(timeline.steps.some((step) => step.kind === 'roundStart')).toBe(true)
    expect(timeline.state.round).toBe(state.round + 1)
  })

  test('generic modifiers feed damage calculation and status sync', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')

    megumi.abilities[0].energyCost = {}
    megumi.abilities[0].effects = [
      {
        type: 'addModifier',
        target: 'self',
        modifier: {
          label: 'Focused Strike',
          stat: 'damageDealt',
          mode: 'flat',
          value: 9,
          duration: { kind: 'rounds', rounds: 2 },
          tags: ['custom', 'focus'],
          visible: true,
          stacking: 'max',
          statusKind: 'attackUp',
        },
      },
      { type: 'damage', power: 20, target: 'inherit' },
    ]

    const result = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, megumi.abilities[0].id, yuji.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(71)
    expect(getStatusDuration(getFighter(result.state, 'player', 'megumi').statuses, 'attackUp')).toBe(2)
    expect(result.runtimeEvents.some((event) => event.type === 'modifier_applied' && event.targetId === megumi.instanceId)).toBe(true)
  })

  test('generic removeModifier effects can strip invulnerability before damage resolves', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    enemyYuji.abilities[0].targetRule = 'self'
    enemyYuji.abilities[0].kind = 'buff'
    enemyYuji.abilities[0].classes = ['Instant', 'Mental']
    enemyYuji.abilities[0].energyCost = {}
    enemyYuji.abilities[0].effects = [{
      type: 'addModifier',
      target: 'self',
      modifier: {
        label: 'Guard Shell',
        stat: 'isInvulnerable',
        mode: 'set',
        value: true,
        duration: { kind: 'rounds', rounds: 2 },
        tags: ['custom', 'guard'],
        visible: true,
        stacking: 'max',
        statusKind: 'invincible',
      },
    }]

    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [
      { type: 'removeModifier', target: 'inherit', filter: { statusKind: 'invincible' } },
      { type: 'damage', power: 20, target: 'inherit' },
    ]

    const shielded = resolveTeamTurn(
      state,
      queue('enemy', enemyYuji.instanceId, enemyYuji.abilities[0].id, enemyYuji.instanceId),
      'enemy',
    )
    expect(getStatusDuration(getFighter(shielded.state, 'enemy', 'yuji').statuses, 'invincible')).toBe(2)

    const stripped = resolveTeamTurn(
      shielded.state,
      queue('player', getFighter(shielded.state, 'player', 'yuji').instanceId, yuji.abilities[0].id, getFighter(shielded.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    expect(getFighter(stripped.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getStatusDuration(getFighter(stripped.state, 'enemy', 'yuji').statuses, 'invincible')).toBe(0)
    expect(stripped.runtimeEvents.some((event) => event.type === 'modifier_removed' && event.targetId === enemyYuji.instanceId)).toBe(true)
  })

  test('reaction guards counter and reflect harmful actions', () => {
    const counterState = createChargedBattleState()
    const counterYuji = getFighter(counterState, 'enemy', 'yuji')
    const counterAttacker = getFighter(counterState, 'player', 'yuji')
    counterYuji.reactionGuards = [{
      id: 'guard-counter',
      kind: 'counter',
      label: 'Counter',
      remainingRounds: 1,
      counterDamage: 20,
      consumeOnTrigger: true,
      sourceActorId: counterYuji.instanceId,
    }]
    counterAttacker.abilities[0].energyCost = {}

    const countered = resolveTeamTurn(
      counterState,
      queue('player', counterAttacker.instanceId, counterAttacker.abilities[0].id, counterYuji.instanceId),
      'player',
    )
    expect(getFighter(countered.state, 'player', 'yuji').hp).toBe(80)
    expect(getFighter(countered.state, 'enemy', 'yuji').hp).toBe(100)

    const reflectState = createChargedBattleState()
    const reflectYuji = getFighter(reflectState, 'enemy', 'yuji')
    const reflectAttacker = getFighter(reflectState, 'player', 'yuji')
    reflectYuji.reactionGuards = [{
      id: 'guard-reflect',
      kind: 'reflect',
      label: 'Reflect',
      remainingRounds: 1,
      consumeOnTrigger: true,
      sourceActorId: reflectYuji.instanceId,
    }]
    reflectAttacker.abilities[0].energyCost = {}

    const reflected = resolveTeamTurn(
      reflectState,
      queue('player', reflectAttacker.instanceId, reflectAttacker.abilities[0].id, reflectYuji.instanceId),
      'player',
    )
    expect(getFighter(reflected.state, 'player', 'yuji').hp).toBe(75)
    expect(getFighter(reflected.state, 'enemy', 'yuji').hp).toBe(100)
  })

  test('modifyAbilityCost effects can temporarily rewrite a specific skill cost', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    state.playerEnergy.amounts = createEnergyAmounts()
    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{
      type: 'modifyAbilityCost',
      target: 'self',
      modifier: {
        label: 'Rush Discount',
        abilityId: yuji.abilities[1].id,
        mode: 'set',
        cost: {},
        duration: 2,
        uses: 1,
      },
    }]
    yuji.abilities[1].energyCost = { physical: 1 }

    const buffed = resolveTeamTurn(
      state,
      queue('player', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'player',
    )
    const buffedYuji = getFighter(buffed.state, 'player', 'yuji')

    expect(canUseAbility(buffed.state, buffedYuji, yuji.abilities[1].id)).toBe(true)

    const used = resolveTeamTurn(
      buffed.state,
      queue('player', buffedYuji.instanceId, yuji.abilities[1].id, enemyYuji.instanceId),
      'player',
    )
    const usedYuji = getFighter(used.state, 'player', 'yuji')

    expect(usedYuji.costModifiers).toHaveLength(0)
    expect(canUseAbility(used.state, usedYuji, yuji.abilities[1].id)).toBe(false)
  })

  test('resource effects drain, steal, and gain energy', () => {
    const drainState = createChargedBattleState()
    const drainYuji = getFighter(drainState, 'enemy', 'yuji')
    const drainTarget = getFighter(drainState, 'player', 'yuji')
    drainState.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 2, vow: 0, mental: 0 })
    drainYuji.abilities[0].kind = 'debuff'
    drainYuji.abilities[0].targetRule = 'enemy-single'
    drainYuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    drainYuji.abilities[0].energyCost = {}
    drainYuji.abilities[0].effects = [{ type: 'energyDrain', amount: { technique: 2, random: 1 }, target: 'inherit' }]

    const drained = resolveTeamTurn(
      drainState,
      queue('enemy', drainYuji.instanceId, drainYuji.abilities[0].id, drainTarget.instanceId),
      'enemy',
    )
    expect(totalEnergyInPool(drained.state.playerEnergy)).toBe(0)

    const stealState = createChargedBattleState()
    const stealYuji = getFighter(stealState, 'enemy', 'yuji')
    const stealTarget = getFighter(stealState, 'player', 'yuji')
    stealState.playerEnergy.amounts = createEnergyAmounts({ physical: 2, technique: 1, vow: 0, mental: 0 })
    stealState.enemyEnergy.amounts = createEnergyAmounts()
    stealYuji.abilities[0].kind = 'debuff'
    stealYuji.abilities[0].targetRule = 'enemy-single'
    stealYuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    stealYuji.abilities[0].energyCost = {}
    stealYuji.abilities[0].effects = [{ type: 'energySteal', amount: { physical: 1, random: 2 }, target: 'inherit' }]

    const stolen = resolveTeamTurn(
      stealState,
      queue('enemy', stealYuji.instanceId, stealYuji.abilities[0].id, stealTarget.instanceId),
      'enemy',
    )
    expect(totalEnergyInPool(stolen.state.playerEnergy)).toBe(0)
    expect(totalEnergyInPool(stolen.state.enemyEnergy)).toBe(3)

    const gainState = createChargedBattleState()
    const gainYuji = getFighter(gainState, 'player', 'yuji')
    gainState.playerEnergy.amounts = createEnergyAmounts()
    gainYuji.abilities[0].kind = 'utility'
    gainYuji.abilities[0].targetRule = 'self'
    gainYuji.abilities[0].classes = ['Instant', 'Mental']
    gainYuji.abilities[0].energyCost = {}
    gainYuji.abilities[0].effects = [{ type: 'energyGain', amount: { mental: 1, random: 2 }, target: 'self' }]

    const gained = resolveTeamTurn(
      gainState,
      queue('player', gainYuji.instanceId, gainYuji.abilities[0].id, gainYuji.instanceId),
      'player',
    )
    expect(totalEnergyInPool(gained.state.playerEnergy)).toBe(3)
  })

  test('cooldownAdjust and effect immunity work through generic effect handling', () => {
    const cooldownState = createChargedBattleState()
    const yuji = getFighter(cooldownState, 'enemy', 'yuji')
    const target = getFighter(cooldownState, 'player', 'yuji')
    target.cooldowns['yuji-divergent-fist'] = 0
    target.cooldowns['yuji-cursed-rush'] = 0
    yuji.abilities[0].kind = 'debuff'
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'cooldownAdjust', amount: 2, abilityId: 'yuji-divergent-fist', includeReady: true, target: 'inherit' }]

    const adjusted = resolveTeamTurn(
      cooldownState,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, target.instanceId),
      'enemy',
    )
    expect(getFighter(adjusted.state, 'player', 'yuji').cooldowns['yuji-divergent-fist']).toBe(2)
    expect(getFighter(adjusted.state, 'player', 'yuji').cooldowns['yuji-cursed-rush']).toBe(0)

    const immuneState = createChargedBattleState()
    const immuneYuji = getFighter(immuneState, 'enemy', 'yuji')
    const stunSource = getFighter(immuneState, 'player', 'yuji')
    immuneYuji.abilities[0].kind = 'utility'
    immuneYuji.abilities[0].targetRule = 'self'
    immuneYuji.abilities[0].classes = ['Instant', 'Mental']
    immuneYuji.abilities[0].energyCost = {}
    immuneYuji.abilities[0].effects = [{ type: 'effectImmunity', label: 'Ignore Effects', blocks: ['nonDamage'], duration: 2, target: 'self' }]
    stunSource.abilities[0].kind = 'debuff'
    stunSource.abilities[0].targetRule = 'enemy-single'
    stunSource.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    stunSource.abilities[0].energyCost = {}
    stunSource.abilities[0].effects = [{ type: 'stun', duration: 1, target: 'inherit' }]

    const immune = resolveTeamTurn(
      immuneState,
      queue('enemy', immuneYuji.instanceId, immuneYuji.abilities[0].id, immuneYuji.instanceId),
      'enemy',
    )
    const blocked = resolveTeamTurn(
      immune.state,
      queue('player', getFighter(immune.state, 'player', 'yuji').instanceId, stunSource.abilities[0].id, getFighter(immune.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    expect(getStatusDuration(getFighter(blocked.state, 'enemy', 'yuji').statuses, 'stun')).toBe(0)
    expect(blocked.runtimeEvents.some((event) => event.type === 'effect_ignored')).toBe(true)
  })

  test('onDefeatEnemy passives can react to kills', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const target = getFighter(state, 'player', 'nobara')

    target.hp = 15
    yuji.passiveEffects = [{
      label: 'Execution High',
      trigger: 'onDefeatEnemy',
      conditions: [{ type: 'abilityId', abilityId: yuji.abilities[0].id }],
      effects: [{ type: 'setFlag', key: 'executed', value: true, target: 'self' }],
    }]
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const result = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, target.instanceId),
      'enemy',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').stateFlags.executed).toBe(true)
  })

  test('reaction effects can punish a target the next time they use a skill', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['hanami', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const hanami = getFighter(state, 'player', 'hanami')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    hanami.hp = 60

    const seeded = resolveTeamTurn(
      state,
      queue('player', hanami.instanceId, 'hanami-cursed-bud-growth', enemyYuji.instanceId),
      'player',
    )

    const markedYuji = getFighter(seeded.state, 'enemy', 'yuji')
    markedYuji.abilities[0].energyCost = {}

    const triggered = resolveTeamTurn(
      seeded.state,
      queue('enemy', markedYuji.instanceId, markedYuji.abilities[0].id, getFighter(seeded.state, 'player', 'hanami').instanceId),
      'enemy',
    )

    expect(getFighter(triggered.state, 'enemy', 'yuji').hp).toBe(65)
    expect(getFighter(triggered.state, 'player', 'hanami').hp).toBe(50)
  })

  test('reaction effects can respond to shield breaks and target the attacker', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['yaga', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const yaga = getFighter(state, 'player', 'yaga')
    const allyYuji = getFighter(state, 'player', 'yuji')

    const guarded = resolveTeamTurn(
      state,
      queue('player', yaga.instanceId, 'yaga-cursed-corpse-substitute', allyYuji.instanceId),
      'player',
    )

    const attacker = getFighter(guarded.state, 'enemy', 'yuji')
    attacker.abilities[0].energyCost = {}
    attacker.abilities[0].effects = [{ type: 'damage', power: 50, target: 'inherit' }]

    const broken = resolveTeamTurn(
      guarded.state,
      queue('enemy', attacker.instanceId, attacker.abilities[0].id, getFighter(guarded.state, 'player', 'yuji').instanceId),
      'enemy',
    )

    expect(getFighter(broken.state, 'enemy', 'yuji').hp).toBe(80)
    expect(getFighter(broken.state, 'player', 'yuji').shield).toBeNull()
  })

  test('reaction effects can add damage the next time a target takes damage', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['momo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const momo = getFighter(state, 'player', 'momo')
    const allyYuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const marked = resolveTeamTurn(
      state,
      queue('player', momo.instanceId, 'momo-coordinated-assault', enemyYuji.instanceId),
      'player',
    )
    expect(getFighter(marked.state, 'enemy', 'yuji').hp).toBe(100)

    const attacker = getFighter(marked.state, 'player', 'yuji')
    attacker.abilities[0].energyCost = {}

    const triggered = resolveTeamTurn(
      marked.state,
      queue('player', attacker.instanceId, allyYuji.abilities[0].id, getFighter(marked.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    expect(getFighter(triggered.state, 'enemy', 'yuji').hp).toBe(60)
  })

  test('conditional effects can branch on actor counters and spend capped ammo', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['mai', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mai = getFighter(state, 'player', 'mai')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    expect(mai.stateCounters.cursed_bullet).toBe(2)

    const fired = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-cursed-bullet', enemyYuji.instanceId),
      'player',
    )

    expect(getFighter(fired.state, 'enemy', 'yuji').hp).toBe(70)
    expect(getFighter(fired.state, 'player', 'mai').stateCounters.cursed_bullet).toBe(1)
  })

  test('counter clamps prevent ammo from exceeding authored maximums', () => {
    let state = createChargedBattleState({
      playerTeamIds: ['mai', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    let mai = getFighter(state, 'player', 'mai')
    mai.stateCounters.cursed_bullet = 3

    state = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-steady-aim', mai.instanceId),
      'player',
    ).state

    expect(getFighter(state, 'player', 'mai').stateCounters.cursed_bullet).toBe(3)
  })

  test('conditional else effects can fire when counters are empty', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['mai', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const mai = getFighter(state, 'player', 'mai')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    mai.stateCounters.cursed_bullet = 0

    const result = resolveTeamTurn(
      state,
      queue('player', mai.instanceId, 'mai-suppressing-fire', enemyYuji.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(75)
    expect(getStatusDuration(getFighter(result.state, 'enemy', 'yuji').statuses, 'stun')).toBe(1)
  })

  test('counter conditions can upgrade Gojo Hollow Purple', () => {
    let state = createChargedBattleState({
      playerTeamIds: ['gojo', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const gojo = getFighter(state, 'player', 'gojo')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    gojo.abilities.forEach((ability) => {
      ability.energyCost = {}
    })

    state = resolveTeamTurn(state, queue('player', gojo.instanceId, 'gojo-lapse-blue', enemyYuji.instanceId), 'player').state
    state = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'gojo').instanceId, 'gojo-reversal-red', getFighter(state, 'enemy', 'yuji').instanceId), 'player').state
    expect(getFighter(state, 'player', 'gojo').abilityHistory.map((entry) => entry.abilityId)).toEqual(['gojo-lapse-blue', 'gojo-reversal-red'])
    expect(getFighter(state, 'player', 'gojo').stateCounters.limitless_blue).toBe(1)
    expect(getFighter(state, 'player', 'gojo').stateCounters.limitless_red).toBe(1)
    expect(getFighter(state, 'player', 'gojo').abilities.find((ability) => ability.id === 'gojo-hollow-purple')?.effects?.[1]?.type).toBe('damageScaledByCounter')
    state = resolveTeamTurn(state, queue('player', getFighter(state, 'player', 'gojo').instanceId, 'gojo-hollow-purple', null), 'player').state

    expect(getFighter(state, 'enemy', 'yuji').hp).toBe(1)
    expect(getFighter(state, 'enemy', 'nobara').hp).toBe(55)
    expect(getFighter(state, 'enemy', 'megumi').hp).toBe(51)
  })

  test('fighter modes can drive Panda Gorilla Mode branches', () => {
    const state = createChargedBattleState({
      playerTeamIds: ['panda', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const panda = getFighter(state, 'player', 'panda')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    panda.stateModes.form = 'gorilla'

    const result = resolveTeamTurn(
      state,
      queue('player', panda.instanceId, 'panda-punch', enemyYuji.instanceId),
      'player',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(60)
  })

  test('battle content validation no longer requires renderSrc', () => {
    const report = validateBattleContent([JSON.parse(JSON.stringify(battleRoster[0]))])

    expect(report.errors).toEqual([])
    expect(report.errors.some((issue) => issue.includes('renderSrc'))).toBe(false)
  })

  test('setMode with duration expires the mode after N rounds, skipping the round it was applied', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')

    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].kind = 'buff'
    yuji.abilities[0].effects = [{ type: 'setMode', key: 'form', value: 'powered', duration: 2, target: 'self' }]

    const activated = resolveTeamTurn(state, queue('player', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId), 'player')
    const afterActivation = getFighter(activated.state, 'player', 'yuji')
    expect(afterActivation.stateModes.form).toBe('powered')
    expect(afterActivation.stateModeDurations.form?.remainingRounds).toBe(2)

    // end-of-round tick in the same round should not decrement (skip rule)
    const afterRound1 = endRound(activated.state)
    const r1Fighter = getFighter(afterRound1.state, 'player', 'yuji')
    expect(r1Fighter.stateModes.form).toBe('powered')
    expect(r1Fighter.stateModeDurations.form?.remainingRounds).toBe(2)

    // next end-of-round should decrement
    const afterRound2 = endRound(afterRound1.state)
    const r2Fighter = getFighter(afterRound2.state, 'player', 'yuji')
    expect(r2Fighter.stateModes.form).toBe('powered')
    expect(r2Fighter.stateModeDurations.form?.remainingRounds).toBe(1)

    // last tick expires the mode
    const afterRound3 = endRound(afterRound2.state)
    const r3Fighter = getFighter(afterRound3.state, 'player', 'yuji')
    expect(r3Fighter.stateModes.form).toBeUndefined()
    expect(r3Fighter.stateModeDurations.form).toBeUndefined()
  })

  test('firstAbilityOnTarget is true the first time an ability targets a specific enemy', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const enemyNobara = getFighter(state, 'enemy', 'nobara')

    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].cooldown = 0
    yuji.abilities[0].effects = [
      {
        type: 'conditional',
        conditions: [{ type: 'firstAbilityOnTarget' }],
        effects: [{ type: 'adjustCounter', key: 'first_hit_bonus', amount: 1, target: 'self' }],
        target: 'inherit',
      },
      { type: 'damage', power: 5, target: 'inherit' },
    ]

    // First hit on enemyYuji: condition fires
    const firstHit = resolveTeamTurn(state, queue('player', yuji.instanceId, yuji.abilities[0].id, enemyYuji.instanceId), 'player')
    expect(getFighter(firstHit.state, 'player', 'yuji').stateCounters.first_hit_bonus).toBe(1)

    // Second hit on same target: condition does NOT fire
    const yujiAfterFirst = getFighter(firstHit.state, 'player', 'yuji')
    const secondHit = resolveTeamTurn(firstHit.state, queue('player', yujiAfterFirst.instanceId, yuji.abilities[0].id, enemyYuji.instanceId), 'player')
    expect(getFighter(secondHit.state, 'player', 'yuji').stateCounters.first_hit_bonus).toBe(1)

    // First hit on different target (enemyNobara): condition fires again
    const yujiAfterSecond = getFighter(secondHit.state, 'player', 'yuji')
    const thirdHit = resolveTeamTurn(secondHit.state, queue('player', yujiAfterSecond.instanceId, yuji.abilities[0].id, enemyNobara.instanceId), 'player')
    expect(getFighter(thirdHit.state, 'player', 'yuji').stateCounters.first_hit_bonus).toBe(2)
  })

  test('excludedDamageClass skips damageTaken modifier for matching damage class', () => {
    // A modifier with excludedDamageClass: 'Energy' should apply to Physical abilities
    // but be skipped for Energy abilities.
    const makeModifier = (targetId: string) => ({
      id: 'mod-nonenergy-dr',
      label: 'Non-Energy Guard',
      scope: 'fighter' as const,
      targetId,
      stat: 'damageTaken' as const,
      mode: 'percentAdd' as const,
      value: -0.5,
      duration: { kind: 'permanent' as const },
      tags: [] as string[],
      visible: false,
      stacking: 'max' as const,
      excludedDamageClass: 'Energy' as const,
    })

    // Physical hit: modifier applies → 20 * 0.5 = 10 damage, 100 - 10 = 90 HP
    const physicalState = createChargedBattleState()
    const physicalAttacker = getFighter(physicalState, 'player', 'megumi')
    const physicalTarget = getFighter(physicalState, 'enemy', 'yuji')
    physicalTarget.modifiers.push(makeModifier(physicalTarget.instanceId))
    physicalAttacker.abilities[0].energyCost = {}
    physicalAttacker.abilities[0].classes = ['Melee', 'Physical', 'Action']
    physicalAttacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]
    const physicalHit = resolveTeamTurn(physicalState, queue('player', physicalAttacker.instanceId, physicalAttacker.abilities[0].id, physicalTarget.instanceId), 'player')
    expect(getFighter(physicalHit.state, 'enemy', 'yuji').hp).toBe(90)

    // Energy hit: modifier is excluded → full 20 damage, 100 - 20 = 80 HP
    const energyState = createChargedBattleState()
    const energyAttacker = getFighter(energyState, 'player', 'megumi')
    const energyTarget = getFighter(energyState, 'enemy', 'yuji')
    energyTarget.modifiers.push(makeModifier(energyTarget.instanceId))
    energyAttacker.abilities[0].energyCost = {}
    energyAttacker.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    energyAttacker.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]
    const energyHit = resolveTeamTurn(energyState, queue('player', energyAttacker.instanceId, energyAttacker.abilities[0].id, energyTarget.instanceId), 'player')
    expect(getFighter(energyHit.state, 'enemy', 'yuji').hp).toBe(80)
  })
})
