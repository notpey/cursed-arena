import { describe, expect, test } from 'vitest'
import { createEnergyAmounts, totalEnergyInPool } from '@/features/battle/energy'
import { battleRoster } from '@/features/battle/data'
import {
  beginNewRound,
  createInitialBattleState,
  endRound,
  endRoundTimeline,
  getAbilityById,
  getTeam,
  resolveTeamTurn,
  resolveTeamTurnTimeline,
  transitionToSecondPlayer,
} from '@/features/battle/engine'
import { getBurnDamage, getStatusDuration } from '@/features/battle/statuses'
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
    focus: null,
  }
  state.playerEnergy = { ...chargedPool, amounts: { ...chargedPool.amounts } }
  state.enemyEnergy = { ...chargedPool, amounts: { ...chargedPool.amounts } }
  return state
}

describe('battle engine scenarios', () => {
  test('initial chakra gives the opening player 1 and the second player normal distribution', () => {
    const state = createInitialBattleState({ battleSeed: 'opening-distribution' })
    const openingTotal = state.firstPlayer === 'player' ? totalEnergyInPool(state.playerEnergy) : totalEnergyInPool(state.enemyEnergy)
    const secondTotal = state.firstPlayer === 'player' ? totalEnergyInPool(state.enemyEnergy) : totalEnergyInPool(state.playerEnergy)

    expect(openingTotal).toBe(1)
    expect(secondTotal).toBe(3)
  })

  test('Gojo passive reduces cooldowns by an extra turn at round end', () => {
    const state = createChargedBattleState()
    const gojo = getFighter(state, 'player', 'gojo')

    gojo.cooldowns['gojo-red'] = 2

    const result = endRound(state)
    const updatedGojo = getFighter(result.state, 'player', 'gojo')

    expect(updatedGojo.cooldowns['gojo-red']).toBe(0)
  })

  test('Megumi passive damage boost applies to standard attacks', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', megumi.instanceId, 'megumi-dogs', yuji.instanceId),
      'player',
    )

    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')
    expect(updatedYuji.hp).toBe(54)
  })

  test('Nanami execute passive applies only below threshold', () => {
    const aboveThreshold = createChargedBattleState()
    const belowThreshold = createChargedBattleState()

    const gojoAbove = getFighter(aboveThreshold, 'player', 'gojo')
    const gojoBelow = getFighter(belowThreshold, 'player', 'gojo')
    const nanamiAbove = getFighter(aboveThreshold, 'enemy', 'nanami')
    const nanamiBelow = getFighter(belowThreshold, 'enemy', 'nanami')

    gojoAbove.hp = 60
    gojoBelow.hp = 50

    const aboveResult = resolveTeamTurn(
      aboveThreshold,
      queue('enemy', nanamiAbove.instanceId, 'nanami-collapse', gojoAbove.instanceId),
      'enemy',
    )
    const belowResult = resolveTeamTurn(
      belowThreshold,
      queue('enemy', nanamiBelow.instanceId, 'nanami-collapse', gojoBelow.instanceId),
      'enemy',
    )

    expect(getFighter(aboveResult.state, 'player', 'gojo').hp).toBe(3)
    expect(getFighter(belowResult.state, 'player', 'gojo').hp).toBe(0)
  })

  test('Jogo passive applies burn on hit', () => {
    const state = createChargedBattleState()
    const jogo = getFighter(state, 'player', 'jogo')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const result = resolveTeamTurn(
      state,
      queue('player', jogo.instanceId, 'jogo-embers', yuji.instanceId),
      'player',
    )

    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')
    expect(getStatusDuration(updatedYuji.statuses, 'burn')).toBe(2)
    expect(getBurnDamage(updatedYuji.statuses)).toBe(7)
  })

  test('Yuji passive heals at round start', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    yuji.hp = 80

    const result = beginNewRound(state)
    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')

    expect(updatedYuji.hp).toBe(86)
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
      expect(damageEvent.packet.baseAmount).toBe(46)
      expect(damageEvent.packet.amount).toBe(50)
      expect(damageEvent.packet.damageType).toBe('normal')
    }
  })

  test('beginNewRound emits round-start and healing runtime events', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    yuji.hp = 80

    const result = beginNewRound(state)

    expect(result.runtimeEvents.some((event) => event.type === 'round_started')).toBe(true)
    const healEvent = result.runtimeEvents.find((event) => event.type === 'heal_applied' && event.targetId === yuji.instanceId)
    expect(healEvent?.packet?.kind).toBe('heal')
    if (healEvent?.packet?.kind === 'heal') {
      expect(healEvent.packet.amount).toBe(6)
    }
  })

  test('resolveTeamTurnTimeline returns per-action state snapshots', () => {
    const state = createChargedBattleState()
    const megumi = getFighter(state, 'player', 'megumi')
    const gojo = getFighter(state, 'player', 'gojo')
    const yuji = getFighter(state, 'enemy', 'yuji')

    const timeline = resolveTeamTurnTimeline(
      state,
      {
        [megumi.instanceId]: { actorId: megumi.instanceId, team: 'player', abilityId: 'megumi-dogs', targetId: yuji.instanceId },
        [gojo.instanceId]: { actorId: gojo.instanceId, team: 'player', abilityId: 'gojo-red', targetId: yuji.instanceId },
      },
      'player',
      [megumi.instanceId, gojo.instanceId],
    )

    expect(timeline.steps).toHaveLength(3)
    expect(timeline.steps[0]?.actorId).toBe(megumi.instanceId)
    expect(getFighter(timeline.steps[0]!.state, 'enemy', 'yuji').hp).toBeLessThan(yuji.hp)
    expect(timeline.steps[1]?.actorId).toBe(gojo.instanceId)
    expect(getFighter(timeline.steps[1]!.state, 'enemy', 'yuji').hp).toBeLessThan(getFighter(timeline.steps[0]!.state, 'enemy', 'yuji').hp)
  })

  test('endRoundTimeline separates cleanup from next-round setup', () => {
    const state = createChargedBattleState()

    const timeline = endRoundTimeline(state)

    expect(timeline.steps.some((step) => step.kind === 'roundEnd')).toBe(true)
    expect(timeline.steps.some((step) => step.kind === 'roundStart')).toBe(true)
    expect(timeline.state.round).toBe(state.round + 1)
  })

  test('generic addModifier effects feed the runtime damage calculation and status sync', () => {
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

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(73)
    expect(getStatusDuration(getFighter(result.state, 'player', 'megumi').statuses, 'attackUp')).toBe(2)
    expect(result.runtimeEvents.some((event) => event.type === 'modifier_applied' && event.targetId === megumi.instanceId)).toBe(true)
  })

  test('generic removeModifier effects can strip invulnerability before damage resolves', () => {
    const state = createChargedBattleState()
    const gojo = getFighter(state, 'player', 'gojo')
    const yuji = getFighter(state, 'enemy', 'yuji')

    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].kind = 'buff'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{
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

    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [
      { type: 'removeModifier', target: 'inherit', filter: { statusKind: 'invincible' } },
      { type: 'damage', power: 20, target: 'inherit' },
    ]

    const shielded = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    expect(getStatusDuration(getFighter(shielded.state, 'enemy', 'yuji').statuses, 'invincible')).toBe(2)

    const stripped = resolveTeamTurn(
      shielded.state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )

    expect(getFighter(stripped.state, 'enemy', 'yuji').hp).toBe(84)
    expect(getStatusDuration(getFighter(stripped.state, 'enemy', 'yuji').statuses, 'invincible')).toBe(0)
    expect(stripped.runtimeEvents.some((event) => event.type === 'modifier_removed' && event.targetId === yuji.instanceId)).toBe(true)
  })

  test('team-scoped modifiers amplify allied actions', () => {
    const control = createChargedBattleState()
    const buffed = createChargedBattleState()

    const gojo = getFighter(buffed, 'player', 'gojo')
    const buffedMegumi = getFighter(buffed, 'player', 'megumi')
    const buffedYuji = getFighter(buffed, 'enemy', 'yuji')
    const controlMegumi = getFighter(control, 'player', 'megumi')
    const controlYuji = getFighter(control, 'enemy', 'yuji')

    gojo.abilities[0].kind = 'buff'
    gojo.abilities[0].targetRule = 'self'
    gojo.abilities[0].classes = ['Instant', 'Mental']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{
      type: 'addModifier',
      target: 'self',
      modifier: {
        label: 'Team Focus',
        scope: 'team',
        stat: 'damageDealt',
        mode: 'flat',
        value: 7,
        duration: { kind: 'rounds', rounds: 1 },
        tags: ['custom', 'team-focus'],
        visible: false,
        stacking: 'max',
      },
    }]

    const controlResult = resolveTeamTurn(
      control,
      queue('player', controlMegumi.instanceId, controlMegumi.abilities[0].id, controlYuji.instanceId),
      'player',
    )
    const buffedResult = resolveTeamTurn(
      buffed,
      {
        [gojo.instanceId]: { actorId: gojo.instanceId, team: 'player', abilityId: gojo.abilities[0].id, targetId: gojo.instanceId },
        [buffedMegumi.instanceId]: { actorId: buffedMegumi.instanceId, team: 'player', abilityId: buffedMegumi.abilities[0].id, targetId: buffedYuji.instanceId },
      },
      'player',
    )

    expect(getFighter(controlResult.state, 'enemy', 'yuji').hp - getFighter(buffedResult.state, 'enemy', 'yuji').hp).toBe(7)
    expect(buffedResult.state.playerTeamModifiers).toHaveLength(1)
  })

  test('battlefield-scoped modifiers affect both teams through the shared pool', () => {
    const control = createChargedBattleState()
    const modified = createChargedBattleState()

    const gojo = getFighter(modified, 'player', 'gojo')
    const modifiedMegumi = getFighter(modified, 'player', 'megumi')
    const modifiedYuji = getFighter(modified, 'enemy', 'yuji')
    const controlMegumi = getFighter(control, 'player', 'megumi')
    const controlYuji = getFighter(control, 'enemy', 'yuji')

    gojo.abilities[0].kind = 'utility'
    gojo.abilities[0].targetRule = 'self'
    gojo.abilities[0].classes = ['Instant', 'Unique']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{
      type: 'addModifier',
      target: 'self',
      modifier: {
        label: 'Open Domain',
        scope: 'battlefield',
        stat: 'damageTaken',
        mode: 'flat',
        value: 6,
        duration: { kind: 'rounds', rounds: 1 },
        tags: ['custom', 'domain'],
        visible: false,
        stacking: 'max',
      },
    }]

    const controlResult = resolveTeamTurn(
      control,
      queue('player', controlMegumi.instanceId, controlMegumi.abilities[0].id, controlYuji.instanceId),
      'player',
    )
    const modifiedResult = resolveTeamTurn(
      modified,
      {
        [gojo.instanceId]: { actorId: gojo.instanceId, team: 'player', abilityId: gojo.abilities[0].id, targetId: gojo.instanceId },
        [modifiedMegumi.instanceId]: { actorId: modifiedMegumi.instanceId, team: 'player', abilityId: modifiedMegumi.abilities[0].id, targetId: modifiedYuji.instanceId },
      },
      'player',
    )

    expect(getFighter(controlResult.state, 'enemy', 'yuji').hp - getFighter(modifiedResult.state, 'enemy', 'yuji').hp).toBe(6)
    expect(modifiedResult.state.battlefieldModifiers).toHaveLength(1)
  })

  test('battlefield bonus increases ultimate damage', () => {
    const state = createChargedBattleState()
    const gojo = getFighter(state, 'player', 'gojo')

    const result = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, 'gojo-hollow-purple', null),
      'player',
    )

    const updatedYuji = getFighter(result.state, 'enemy', 'yuji')
    expect(updatedYuji.hp).toBe(19)
  })

  test('dead fighters do not act on the second turn after first-turn resolution', () => {
    const state = createChargedBattleState()
    state.firstPlayer = 'player'
    state.activePlayer = 'player'
    state.phase = 'firstPlayerCommand'

    const gojo = getFighter(state, 'player', 'gojo')
    const yuji = getFighter(state, 'enemy', 'yuji')
    yuji.hp = 40

    const firstTurn = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, 'gojo-red', yuji.instanceId),
      'player',
    )
    const secondPhase = transitionToSecondPlayer(firstTurn.state)
    const secondTurn = resolveTeamTurn(
      secondPhase,
      queue('enemy', yuji.instanceId, 'yuji-kick', gojo.instanceId),
      'enemy',
    )

    expect(getFighter(secondTurn.state, 'enemy', 'yuji').hp).toBe(0)
    expect(secondTurn.events.some((event) => event.actorId === yuji.instanceId && event.kind === 'action')).toBe(false)
  })

  test('battle seed locks initiative deterministically', () => {
    const first = createChargedBattleState({ battleSeed: 'alpha-seed' })
    const second = createChargedBattleState({ battleSeed: 'alpha-seed' })
    const alternate = createChargedBattleState({ battleSeed: 'beta-seed' })

    expect(first.firstPlayer).toBe(second.firstPlayer)
    expect([first.firstPlayer, 'player', 'enemy']).toContain(alternate.firstPlayer)
  })

  test('scheduled effects resolve on the configured future round start', () => {
    const state = createChargedBattleState()
    const gojo = getFighter(state, 'player', 'gojo')
    const yuji = getFighter(state, 'enemy', 'yuji')

    gojo.abilities[0].effects = [{
      type: 'schedule',
      delay: 1,
      phase: 'roundStart',
      target: 'inherit',
      effects: [{ type: 'damage', power: 11, target: 'inherit' }],
    }]

    const acted = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, 'gojo-infinity', yuji.instanceId),
      'player',
    )

    expect(getFighter(acted.state, 'enemy', 'yuji').hp).toBe(104)

    const nextRound = beginNewRound(acted.state)
    expect(getFighter(nextRound.state, 'enemy', 'yuji').hp).toBe(99)
  })

  test('ability replacement effects swap the visible skill slot temporarily', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')

    yuji.abilities[2].effects = [{
      type: 'replaceAbility',
      target: 'self',
      slotAbilityId: 'yuji-kick',
      duration: 2,
      ability: {
        id: 'yuji-sukuna-cleave',
        name: 'Sukuna Cleave',
        description: 'A temporary replacement strike.',
        kind: 'attack',
        targetRule: 'enemy-single',
        classes: ['Melee', 'Physical', 'Action'],
        icon: { label: 'SC', tone: 'red' },
        cooldown: 1,
        effects: [{ type: 'damage', power: 70, target: 'inherit' }],
      },
    }]

    const acted = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, 'yuji-adrenaline', yuji.instanceId),
      'enemy',
    )
    const updatedYuji = getFighter(acted.state, 'enemy', 'yuji')

    expect(getAbilityById(updatedYuji, 'yuji-sukuna-cleave')?.name).toBe('Sukuna Cleave')
    expect(getAbilityById(updatedYuji, 'yuji-kick')).toBeNull()

    const afterRound = endRound(acted.state)
    expect(getAbilityById(getFighter(afterRound.state, 'enemy', 'yuji'), 'yuji-sukuna-cleave')?.name).toBe('Sukuna Cleave')

    const afterSecondRound = endRound(afterRound.state)
    expect(getAbilityById(getFighter(afterSecondRound.state, 'enemy', 'yuji'), 'yuji-sukuna-cleave')).toBeNull()
  })

  test('modifyAbilityState grant adds a temporary visible ability', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{
      type: 'modifyAbilityState',
      target: 'self',
      delta: {
        mode: 'grant',
        duration: 1,
        grantedAbility: {
          id: 'yuji-feint',
          name: 'Feint',
          description: 'A temporary granted technique.',
          kind: 'attack',
          targetRule: 'enemy-single',
          classes: ['Melee', 'Physical', 'Instant'],
          icon: { label: 'FE', tone: 'red' },
          cooldown: 1,
          effects: [{ type: 'damage', power: 10, target: 'inherit' }],
        },
      },
    }]

    const acted = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    expect(getAbilityById(getFighter(acted.state, 'enemy', 'yuji'), 'yuji-feint')?.name).toBe('Feint')

    const afterRound = endRound(acted.state)
    expect(getAbilityById(getFighter(afterRound.state, 'enemy', 'yuji'), 'yuji-feint')).toBeNull()
  })

  test('battle content validation no longer requires renderSrc', () => {
    const report = validateBattleContent([JSON.parse(JSON.stringify(battleRoster[0]))])

    expect(report.errors).toEqual([])
    expect(report.errors.some((issue) => issue.includes('renderSrc'))).toBe(false)
  })
})


