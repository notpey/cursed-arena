import { describe, expect, test } from 'vitest'
import { createEnergyAmounts, totalEnergyInPool } from '@/features/battle/energy'
import { battleRoster } from '@/features/battle/data'
import {
  beginNewRound,
  canUseAbility,
  createInitialBattleState,
  endRound,
  endRoundTimeline,
  getAbilityById,
  getTeam,
  resolveTeamTurn,
  resolveTeamTurnTimeline,
  transitionToSecondPlayer,
} from '@/features/battle/engine'
import { getActivePips } from '@/components/battle/battleDisplay'
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
    expect(updatedYuji.hp).toBe(79)
    expect(updatedMegumi.stateCounters.shikigami).toBe(2)
    expect(updatedYuji.classStuns.some((stun) => stun.blockedClasses.includes('Physical'))).toBe(true)
  })

  test('random CE allocation on queued commands is honored during spend', () => {
    const state = createChargedBattleState()
    const gojo = getFighter(state, 'player', 'gojo')
    const yuji = getFighter(state, 'enemy', 'yuji')

    gojo.abilities[0].energyCost = { random: 1 }
    state.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 2, vow: 0, mental: 0 })

    const resolved = resolveTeamTurn(
      state,
      {
        [gojo.instanceId]: {
          actorId: gojo.instanceId,
          team: 'player',
          abilityId: gojo.abilities[0].id,
          targetId: yuji.instanceId,
          randomCostAllocation: { physical: 1 },
        },
      },
      'player',
    )

    expect(resolved.state.playerEnergy.amounts.physical).toBe(0)
    expect(resolved.state.playerEnergy.amounts.technique).toBe(2)
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

  test('Hairpin applies a visible pending Cursed Nails marker', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'enemy', 'nobara')
    const gojo = getFighter(state, 'player', 'gojo')

    const result = resolveTeamTurn(
      state,
      queue('enemy', nobara.instanceId, 'nobara-hairpin', gojo.instanceId),
      'enemy',
    )

    const updatedGojo = getFighter(result.state, 'player', 'gojo')
    const pending = updatedGojo.modifiers.find((modifier) => modifier.tags.includes('nobara-cursed-nails-pending'))

    expect(pending).toBeTruthy()
    expect(pending?.duration.kind).toBe('rounds')
    if (pending?.duration.kind === 'rounds') {
      expect(pending.duration.remaining).toBe(2)
    }

    const pips = getActivePips(updatedGojo)
    expect(
      pips.some((pip) =>
        pip.lines.some((line) => line.text.includes('uses a harmful skill') && line.text.includes('Cursed Nails')),
      ),
    ).toBe(true)
  })

  test('pending Cursed Nails triggers on harmful skill use and updates the pip text', () => {
    const state = createChargedBattleState()
    const nobara = getFighter(state, 'enemy', 'nobara')
    const gojo = getFighter(state, 'player', 'gojo')

    const primed = resolveTeamTurn(
      state,
      queue('enemy', nobara.instanceId, 'nobara-hairpin', gojo.instanceId),
      'enemy',
    )

    const primedGojo = getFighter(primed.state, 'player', 'gojo')
    const primedNobara = getFighter(primed.state, 'enemy', 'nobara')
    const triggered = resolveTeamTurn(
      primed.state,
      queue('player', primedGojo.instanceId, 'gojo-red', primedNobara.instanceId),
      'player',
    )

    const updatedGojo = getFighter(triggered.state, 'player', 'gojo')
    expect(updatedGojo.modifiers.some((modifier) => modifier.tags.includes('nobara-cursed-nails-pending'))).toBe(false)
    const applied = updatedGojo.modifiers.find((modifier) => modifier.tags.includes('nobara-cursed-nails-applied'))
    expect(applied).toBeTruthy()
    expect(applied?.duration.kind).toBe('rounds')
    if (applied?.duration.kind === 'rounds') {
      expect(applied.duration.remaining).toBe(1)
    }

    const pips = getActivePips(updatedGojo)
    expect(
      pips.some((pip) =>
        pip.lines.some((line) => line.text.includes('Cursed Nails was applied to this character for 1 turn')),
      ),
    ).toBe(true)
    expect(
      pips.some((pip) =>
        pip.lines.some((line) => line.text.includes('uses a harmful skill') && line.text.includes('Cursed Nails')),
      ),
    ).toBe(false)
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

    expect(getFighter(result.state, 'enemy', 'yuji').hp).toBe(75)
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

  test('shield effects absorb damage and fire onShieldBroken passives', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'shield', amount: 18, label: 'Soul Shell', tags: ['soul-shell'], target: 'self' }]
    yuji.passiveEffects = [{
      label: 'Shield Break Counter',
      trigger: 'onShieldBroken',
      effects: [{ type: 'setFlag', key: 'shieldBroken', value: true, target: 'self' }],
    }]

    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]

    const shielded = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    const afterShield = getFighter(shielded.state, 'enemy', 'yuji')
    expect(afterShield.shield?.amount).toBe(18)

    const broken = resolveTeamTurn(
      shielded.state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )
    const updatedYuji = getFighter(broken.state, 'enemy', 'yuji')

    expect(updatedYuji.shield).toBeNull()
    expect(updatedYuji.hp).toBe(92)
    expect(updatedYuji.stateFlags.shieldBroken).toBe(true)
    expect(broken.runtimeEvents.some((event) => event.type === 'shield_broken' && event.targetId === yuji.instanceId)).toBe(true)
  })

  test('breakShield effects can shatter shields and trigger onShieldBroken passives', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'shield', amount: 18, label: 'Soul Shell', tags: ['soul-shell'], target: 'self' }]
    yuji.passiveEffects = [{
      label: 'Shield Break Counter',
      trigger: 'onShieldBroken',
      effects: [{ type: 'setFlag', key: 'shieldBrokenByShatter', value: true, target: 'self' }],
    }]

    gojo.abilities[0].kind = 'utility'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'breakShield', tag: 'soul-shell', target: 'inherit' }]

    const shielded = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    expect(getFighter(shielded.state, 'enemy', 'yuji').shield?.amount).toBe(18)

    const shattered = resolveTeamTurn(
      shielded.state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )
    const updatedYuji = getFighter(shattered.state, 'enemy', 'yuji')

    expect(updatedYuji.shield).toBeNull()
    expect(updatedYuji.stateFlags.shieldBrokenByShatter).toBe(true)
    expect(shattered.runtimeEvents.some((event) => event.type === 'shield_broken' && event.targetId === yuji.instanceId)).toBe(true)
  })

  test('piercing damage ignores normal damage reduction but respects unpierceable reduction', () => {
    const nonPiercingState = createChargedBattleState()
    const piercingState = createChargedBattleState()

    const gojoNonPiercing = getFighter(nonPiercingState, 'player', 'gojo')
    const yujiNonPiercing = getFighter(nonPiercingState, 'enemy', 'yuji')
    const gojoPiercing = getFighter(piercingState, 'player', 'gojo')
    const yujiPiercing = getFighter(piercingState, 'enemy', 'yuji')

    const defenseMods = [
      {
        id: `def-${yujiNonPiercing.instanceId}-1`,
        label: 'Guard',
        sourceActorId: yujiNonPiercing.instanceId,
        scope: 'fighter' as const,
        targetId: yujiNonPiercing.instanceId,
        stat: 'damageTaken' as const,
        mode: 'flat' as const,
        value: -20,
        duration: { kind: 'rounds' as const, remaining: 2 },
        tags: ['guard'],
        visible: true,
        stacking: 'stack' as const,
      },
      {
        id: `def-${yujiNonPiercing.instanceId}-2`,
        label: 'Unpierceable Guard',
        sourceActorId: yujiNonPiercing.instanceId,
        scope: 'fighter' as const,
        targetId: yujiNonPiercing.instanceId,
        stat: 'damageTaken' as const,
        mode: 'flat' as const,
        value: -10,
        duration: { kind: 'rounds' as const, remaining: 2 },
        tags: ['guard', 'unpierceable'],
        visible: true,
        stacking: 'stack' as const,
      },
    ]
    yujiNonPiercing.modifiers = defenseMods.map((mod) => ({ ...mod }))
    yujiPiercing.modifiers = defenseMods.map((mod) => ({
      ...mod,
      id: mod.id.replace(yujiNonPiercing.instanceId, yujiPiercing.instanceId),
      targetId: yujiPiercing.instanceId,
    }))

    gojoNonPiercing.abilities[0].kind = 'attack'
    gojoNonPiercing.abilities[0].targetRule = 'enemy-single'
    gojoNonPiercing.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojoNonPiercing.abilities[0].energyCost = {}
    gojoNonPiercing.abilities[0].effects = [{ type: 'damage', power: 50, target: 'inherit' }]

    gojoPiercing.abilities[0].kind = 'attack'
    gojoPiercing.abilities[0].targetRule = 'enemy-single'
    gojoPiercing.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojoPiercing.abilities[0].energyCost = {}
    gojoPiercing.abilities[0].effects = [{ type: 'damage', power: 50, target: 'inherit', piercing: true }]

    const nonPiercingResult = resolveTeamTurn(
      nonPiercingState,
      queue('player', gojoNonPiercing.instanceId, gojoNonPiercing.abilities[0].id, yujiNonPiercing.instanceId),
      'player',
    )
    const piercingResult = resolveTeamTurn(
      piercingState,
      queue('player', gojoPiercing.instanceId, gojoPiercing.abilities[0].id, yujiPiercing.instanceId),
      'player',
    )

    const nonPiercingDamage = yujiNonPiercing.hp - getFighter(nonPiercingResult.state, 'enemy', 'yuji').hp
    const piercingDamage = yujiPiercing.hp - getFighter(piercingResult.state, 'enemy', 'yuji').hp

    expect(nonPiercingDamage).toBe(20)
    expect(piercingDamage).toBe(40)
  })

  test('counter guard triggers before damage, damages attacker, and cancels the harmful action', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'counter', duration: 1, counterDamage: 18, target: 'self' }]

    gojo.abilities[0].kind = 'attack'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]

    const guarded = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    expect(getFighter(guarded.state, 'enemy', 'yuji').reactionGuards.some((guard) => guard.kind === 'counter')).toBe(true)

    const resolved = resolveTeamTurn(
      guarded.state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )
    const updatedGojo = getFighter(resolved.state, 'player', 'gojo')
    const updatedYuji = getFighter(resolved.state, 'enemy', 'yuji')

    expect(updatedGojo.hp).toBe(gojo.hp - 18)
    expect(updatedYuji.hp).toBe(yuji.hp)
    expect(updatedYuji.reactionGuards.some((guard) => guard.kind === 'counter')).toBe(false)
  })

  test('reflect guard redirects harmful damage back to the attacker', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'reflect', duration: 1, target: 'self' }]

    gojo.abilities[0].kind = 'attack'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]

    const guarded = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    const resolved = resolveTeamTurn(
      guarded.state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )
    const updatedGojo = getFighter(resolved.state, 'player', 'gojo')
    const updatedYuji = getFighter(resolved.state, 'enemy', 'yuji')

    expect(updatedGojo.hp).toBe(gojo.hp - 30)
    expect(updatedYuji.hp).toBe(yuji.hp)
    expect(updatedYuji.reactionGuards.some((guard) => guard.kind === 'reflect')).toBe(false)
  })

  test('reflect guard redirects harmful non-damage effects back to the attacker', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'reflect', duration: 1, target: 'self' }]

    gojo.abilities[0].kind = 'debuff'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'stun', duration: 1, target: 'inherit' }]

    const guarded = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    const resolved = resolveTeamTurn(
      guarded.state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )

    const updatedGojo = getFighter(resolved.state, 'player', 'gojo')
    const updatedYuji = getFighter(resolved.state, 'enemy', 'yuji')

    expect(getStatusDuration(updatedGojo.statuses, 'stun')).toBe(1)
    expect(getStatusDuration(updatedYuji.statuses, 'stun')).toBe(0)
    expect(updatedYuji.reactionGuards.some((guard) => guard.kind === 'reflect')).toBe(false)
  })

  test('reflect guard with consumeOnTrigger=false can reflect multiple skills in its duration window', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')
    const megumi = getFighter(state, 'player', 'megumi')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'reflect', duration: 1, consumeOnTrigger: false, target: 'self' }]

    gojo.abilities[0].kind = 'attack'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]

    megumi.abilities[0].kind = 'attack'
    megumi.abilities[0].targetRule = 'enemy-single'
    megumi.abilities[0].classes = ['Melee', 'Physical', 'Action']
    megumi.abilities[0].energyCost = {}
    megumi.abilities[0].effects = [{ type: 'damage', power: 20, target: 'inherit' }]

    const guarded = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    const resolved = resolveTeamTurn(
      guarded.state,
      {
        [gojo.instanceId]: { actorId: gojo.instanceId, team: 'player', abilityId: gojo.abilities[0].id, targetId: yuji.instanceId },
        [megumi.instanceId]: { actorId: megumi.instanceId, team: 'player', abilityId: megumi.abilities[0].id, targetId: yuji.instanceId },
      },
      'player',
      [gojo.instanceId, megumi.instanceId],
    )

    const updatedGojo = getFighter(resolved.state, 'player', 'gojo')
    const updatedMegumi = getFighter(resolved.state, 'player', 'megumi')
    const updatedYuji = getFighter(resolved.state, 'enemy', 'yuji')

    expect(updatedGojo.hp).toBe(gojo.hp - 30)
    expect(updatedMegumi.hp).toBe(megumi.hp - 20)
    expect(updatedYuji.hp).toBe(yuji.hp)
    expect(updatedYuji.reactionGuards.some((guard) => guard.kind === 'reflect')).toBe(true)
  })

  test('class-filtered reflect guard only triggers on matching harmful skill classes', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.reactionGuards = [{
      id: 'guard-reflect-physical',
      kind: 'reflect',
      label: 'Reflect',
      remainingRounds: 1,
      abilityClasses: ['Physical'],
      consumeOnTrigger: true,
      sourceActorId: yuji.instanceId,
    }]

    gojo.abilities[0].kind = 'attack'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit' }]

    const resolved = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )

    const updatedGojo = getFighter(resolved.state, 'player', 'gojo')
    const updatedYuji = getFighter(resolved.state, 'enemy', 'yuji')

    expect(updatedGojo.hp).toBe(gojo.hp)
    expect(updatedYuji.hp).toBe(yuji.hp - 30)
    expect(updatedYuji.reactionGuards.some((guard) => guard.kind === 'reflect')).toBe(true)
  })

  test('cannotBeCountered and cannotBeReflected flags bypass reaction guards', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.reactionGuards = [
      {
        id: 'guard-counter',
        kind: 'counter',
        label: 'Counter',
        remainingRounds: 1,
        counterDamage: 20,
        consumeOnTrigger: true,
        sourceActorId: yuji.instanceId,
      },
      {
        id: 'guard-reflect',
        kind: 'reflect',
        label: 'Reflect',
        remainingRounds: 1,
        consumeOnTrigger: true,
        sourceActorId: yuji.instanceId,
      },
    ]

    gojo.abilities[0].kind = 'attack'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].cannotBeCountered = true
    gojo.abilities[0].cannotBeReflected = true
    gojo.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit', cannotBeCountered: true, cannotBeReflected: true }]

    const resolved = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )
    const updatedGojo = getFighter(resolved.state, 'player', 'gojo')
    const updatedYuji = getFighter(resolved.state, 'enemy', 'yuji')

    expect(updatedGojo.hp).toBe(gojo.hp)
    expect(updatedYuji.hp).toBe(yuji.hp - 30)
    expect(updatedYuji.reactionGuards).toHaveLength(2)
  })

  test('reflected damage still interacts with attacker shield', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.reactionGuards = [{
      id: 'guard-reflect',
      kind: 'reflect',
      label: 'Reflect',
      remainingRounds: 1,
      consumeOnTrigger: true,
      sourceActorId: yuji.instanceId,
    }]
    gojo.shield = {
      amount: 20,
      label: 'Test Shield',
      tags: ['test'],
      sourceActorId: gojo.instanceId,
    }

    gojo.abilities[0].kind = 'attack'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Energy', 'Action']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'damage', power: 30, target: 'inherit', piercing: true }]

    const resolved = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, yuji.instanceId),
      'player',
    )
    const updatedGojo = getFighter(resolved.state, 'player', 'gojo')
    const updatedYuji = getFighter(resolved.state, 'enemy', 'yuji')

    expect(updatedYuji.hp).toBe(yuji.hp)
    expect(updatedGojo.shield).toBeNull()
    expect(updatedGojo.hp).toBe(gojo.hp - 10)
    expect(resolved.runtimeEvents.some((event) => event.type === 'shield_broken' && event.targetId === gojo.instanceId)).toBe(true)
  })

  test('shieldDamage chips shield and can shatter it when amount is high enough', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'shield', amount: 18, label: 'Soul Shell', tags: ['soul-shell'], target: 'self' }]
    yuji.passiveEffects = [{
      label: 'Shard Witness',
      trigger: 'onShieldBroken',
      effects: [{ type: 'setFlag', key: 'shieldBrokenByDamage', value: true, target: 'self' }],
    }]

    gojo.abilities[0].kind = 'debuff'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Energy', 'Control']
    gojo.abilities[0].cooldown = 0
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'shieldDamage', amount: 8, tag: 'soul-shell', target: 'inherit' }]

    const shielded = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    const chipped = resolveTeamTurn(
      shielded.state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, getFighter(shielded.state, 'enemy', 'yuji').instanceId),
      'player',
    )
    expect(getFighter(chipped.state, 'enemy', 'yuji').shield?.amount).toBe(10)
    expect(getFighter(chipped.state, 'enemy', 'yuji').stateFlags.shieldBrokenByDamage).toBeUndefined()

    const chippedGojo = getFighter(chipped.state, 'player', 'gojo')
    chippedGojo.abilities[0].effects = [{ type: 'shieldDamage', amount: 12, tag: 'soul-shell', target: 'inherit' }]
    const shattered = resolveTeamTurn(
      chipped.state,
      queue('player', chippedGojo.instanceId, chippedGojo.abilities[0].id, getFighter(chipped.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    const updatedYuji = getFighter(shattered.state, 'enemy', 'yuji')
    expect(updatedYuji.shield).toBeNull()
    expect(updatedYuji.stateFlags.shieldBrokenByDamage).toBe(true)
    expect(shattered.runtimeEvents.some((event) => event.type === 'shield_damaged' && event.targetId === yuji.instanceId)).toBe(true)
    expect(shattered.runtimeEvents.some((event) => event.type === 'shield_broken' && event.targetId === yuji.instanceId)).toBe(true)
  })

  test('modifyAbilityCost effects can temporarily rewrite a specific skill cost', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')

    state.enemyEnergy.amounts = createEnergyAmounts()

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{
      type: 'modifyAbilityCost',
      target: 'self',
      modifier: {
        label: 'Flash Discount',
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
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    const buffedYuji = getFighter(buffed.state, 'enemy', 'yuji')

    expect(canUseAbility(buffed.state, buffedYuji, yuji.abilities[1].id)).toBe(true)

    const used = resolveTeamTurn(
      buffed.state,
      queue('enemy', buffedYuji.instanceId, yuji.abilities[1].id, getFighter(buffed.state, 'player', 'gojo').instanceId),
      'enemy',
    )
    const usedYuji = getFighter(used.state, 'enemy', 'yuji')

    expect(usedYuji.costModifiers).toHaveLength(0)
    expect(canUseAbility(used.state, usedYuji, yuji.abilities[1].id)).toBe(false)
  })

  test('energyDrain removes typed and random energy from the target team', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    state.playerEnergy.amounts = createEnergyAmounts({ physical: 1, technique: 2, vow: 0, mental: 0 })
    state.enemyEnergy.amounts = createEnergyAmounts()

    yuji.abilities[0].kind = 'debuff'
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'energyDrain', amount: { technique: 2, random: 1 }, target: 'inherit' }]

    const drained = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, gojo.instanceId),
      'enemy',
    )

    expect(totalEnergyInPool(drained.state.playerEnergy)).toBe(0)
    const drainEvent = drained.runtimeEvents
      .find((event) =>
        event.type === 'resource_changed'
        && event.packet?.kind === 'resource'
        && event.packet.mode === 'spend'
        && event.packet.targetTeam === 'player'
      )
    expect(drainEvent?.packet?.kind).toBe('resource')
    if (drainEvent?.packet?.kind === 'resource') {
      expect(drainEvent.packet.targetTeam).toBe('player')
      expect(drainEvent.packet.amounts.reserve).toBe(-3)
    }
  })

  test('energySteal transfers drained energy to the caster team', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    state.playerEnergy.amounts = createEnergyAmounts({ physical: 2, technique: 1, vow: 0, mental: 0 })
    state.enemyEnergy.amounts = createEnergyAmounts({ physical: 0, technique: 0, vow: 0, mental: 0 })

    yuji.abilities[0].kind = 'debuff'
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'energySteal', amount: { physical: 1, random: 2 }, target: 'inherit' }]

    const stolen = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, gojo.instanceId),
      'enemy',
    )

    expect(totalEnergyInPool(stolen.state.playerEnergy)).toBe(0)
    expect(stolen.state.enemyEnergy.amounts.physical).toBe(2)
    expect(stolen.state.enemyEnergy.amounts.technique).toBe(1)
    const gainEvent = stolen.runtimeEvents.find((event) =>
      event.type === 'resource_changed'
      && event.packet?.kind === 'resource'
      && event.packet.mode === 'gain'
      && event.packet.targetTeam === 'enemy',
    )
    expect(gainEvent?.packet?.kind).toBe('resource')
    if (gainEvent?.packet?.kind === 'resource') {
      expect(gainEvent.packet.amounts.reserve).toBe(3)
    }
  })

  test('energyGain adds energy pips to the target team', () => {
    const state = createChargedBattleState()
    const gojo = getFighter(state, 'player', 'gojo')

    state.playerEnergy.amounts = createEnergyAmounts()

    gojo.abilities[0].kind = 'utility'
    gojo.abilities[0].targetRule = 'self'
    gojo.abilities[0].classes = ['Instant', 'Mental']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'energyGain', amount: { mental: 1, random: 2 }, target: 'self' }]

    const gained = resolveTeamTurn(
      state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, gojo.instanceId),
      'player',
    )

    expect(totalEnergyInPool(gained.state.playerEnergy)).toBe(3)
    expect(gained.state.playerEnergy.amounts.mental).toBeGreaterThanOrEqual(1)
    const gainEvent = gained.runtimeEvents
      .find((event) => event.type === 'resource_changed' && event.packet?.kind === 'resource' && event.packet.mode === 'gain')
    expect(gainEvent?.packet?.kind).toBe('resource')
    if (gainEvent?.packet?.kind === 'resource') {
      expect(gainEvent.packet.targetTeam).toBe('player')
      expect(gainEvent.packet.amounts.reserve).toBe(3)
    }
  })

  test('cooldownAdjust can increase ready skills and target a specific ability id', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    gojo.cooldowns['gojo-red'] = 0
    gojo.cooldowns['gojo-blue'] = 0

    yuji.abilities[0].kind = 'debuff'
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'cooldownAdjust', amount: 2, abilityId: 'gojo-red', includeReady: true, target: 'inherit' }]

    const adjusted = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, gojo.instanceId),
      'enemy',
    )
    const updatedGojo = getFighter(adjusted.state, 'player', 'gojo')

    expect(updatedGojo.cooldowns['gojo-red']).toBe(2)
    expect(updatedGojo.cooldowns['gojo-blue']).toBe(0)
  })

  test('cooldownAdjust can reduce only active cooldowns when includeReady is false', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    gojo.cooldowns['gojo-red'] = 2
    gojo.cooldowns['gojo-blue'] = 0

    yuji.abilities[0].kind = 'debuff'
    yuji.abilities[0].targetRule = 'enemy-single'
    yuji.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'cooldownAdjust', amount: -1, includeReady: false, target: 'inherit' }]

    const adjusted = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, gojo.instanceId),
      'enemy',
    )
    const updatedGojo = getFighter(adjusted.state, 'player', 'gojo')

    expect(updatedGojo.cooldowns['gojo-red']).toBe(1)
    expect(updatedGojo.cooldowns['gojo-blue']).toBe(0)
  })

  test('effect immunity blocks non-damage status effects', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    yuji.abilities[0].kind = 'utility'
    yuji.abilities[0].targetRule = 'self'
    yuji.abilities[0].classes = ['Instant', 'Mental']
    yuji.abilities[0].energyCost = {}
    yuji.abilities[0].effects = [{ type: 'effectImmunity', label: 'Ignore Effects', blocks: ['nonDamage'], duration: 2, target: 'self' }]

    gojo.abilities[0].kind = 'debuff'
    gojo.abilities[0].targetRule = 'enemy-single'
    gojo.abilities[0].classes = ['Ranged', 'Mental', 'Control']
    gojo.abilities[0].energyCost = {}
    gojo.abilities[0].effects = [{ type: 'stun', duration: 1, target: 'inherit' }]

    const immune = resolveTeamTurn(
      state,
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, yuji.instanceId),
      'enemy',
    )
    const blocked = resolveTeamTurn(
      immune.state,
      queue('player', gojo.instanceId, gojo.abilities[0].id, getFighter(immune.state, 'enemy', 'yuji').instanceId),
      'player',
    )

    expect(getStatusDuration(getFighter(blocked.state, 'enemy', 'yuji').statuses, 'stun')).toBe(0)
    expect(blocked.runtimeEvents.some((event) => event.type === 'effect_ignored')).toBe(true)
  })

  test('onDefeatEnemy passives can react to kills', () => {
    const state = createChargedBattleState()
    const yuji = getFighter(state, 'enemy', 'yuji')
    const gojo = getFighter(state, 'player', 'gojo')

    gojo.hp = 15
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
      queue('enemy', yuji.instanceId, yuji.abilities[0].id, gojo.instanceId),
      'enemy',
    )

    expect(getFighter(result.state, 'enemy', 'yuji').stateFlags.executed).toBe(true)
  })

  test('battle content validation no longer requires renderSrc', () => {
    const report = validateBattleContent([JSON.parse(JSON.stringify(battleRoster[0]))])

    expect(report.errors).toEqual([])
    expect(report.errors.some((issue) => issue.includes('renderSrc'))).toBe(false)
  })
})


