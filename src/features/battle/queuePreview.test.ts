import { describe, expect, test } from 'vitest'
import { createEnergyAmounts } from '@/features/battle/energy'
import {
  createInitialBattleState,
  getTeam,
  resolveTeamTurn,
} from '@/features/battle/engine'
import { buildQueuePreview } from '@/features/battle/queuePreview'
import type { BattleState, QueuedBattleAction } from '@/features/battle/types'

// ── Test helpers ──────────────────────────────────────────────────────────────

function getFighter(state: BattleState, team: 'player' | 'enemy', templateId: string) {
  const fighter = getTeam(state, team).find((u) => u.templateId === templateId)
  if (!fighter) throw new Error(`Missing fighter ${team}:${templateId}`)
  return fighter
}

function queue(
  team: 'player' | 'enemy',
  actorId: string,
  abilityId: string,
  targetId: string | null,
): Record<string, QueuedBattleAction> {
  return { [actorId]: { actorId, team, abilityId, targetId } }
}

function createChargedState(
  overrides?: Parameters<typeof createInitialBattleState>[0],
): BattleState {
  const state = createInitialBattleState(overrides)
  const full = { amounts: createEnergyAmounts({ physical: 6, technique: 6, vow: 6, mental: 6 }) }
  state.playerEnergy = { ...full }
  state.enemyEnergy = { ...full }
  return state
}

// ── Command entry tests ───────────────────────────────────────────────────────

describe('buildQueuePreview — command entries', () => {
  test('queued command produces a command entry with correct sourceActorId', () => {
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const queued = queue('player', yuji.instanceId, 'yuji-divergent-fist', enemyYuji.instanceId)
    const entries = buildQueuePreview(state, queued)

    const entry = entries.find((e) => e.kind === 'command')
    expect(entry).toBeDefined()
    expect(entry!.sourceActorId).toBe(yuji.instanceId)
  })

  test('queued command carries correct sourceAbilityId', () => {
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const queued = queue('player', yuji.instanceId, 'yuji-divergent-fist', enemyYuji.instanceId)
    const entries = buildQueuePreview(state, queued)

    const entry = entries.find((e) => e.kind === 'command')
    expect(entry!.sourceAbilityId).toBe('yuji-divergent-fist')
  })

  test('command entry targetIds match the queued action targetId', () => {
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const queued = queue('player', yuji.instanceId, 'yuji-divergent-fist', enemyYuji.instanceId)
    const entries = buildQueuePreview(state, queued)

    const entry = entries.find((e) => e.kind === 'command')
    expect(entry!.targetIds).toEqual([enemyYuji.instanceId])
  })

  test('command entry with no target produces empty targetIds', () => {
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const yuji = getFighter(state, 'player', 'yuji')

    const queued = queue('player', yuji.instanceId, 'yuji-divergent-fist', null)
    const entries = buildQueuePreview(state, queued)

    const entry = entries.find((e) => e.kind === 'command')
    expect(entry!.targetIds).toEqual([])
  })

  test('command entry has correct timing, triggerType, and draggable flags', () => {
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const yuji = getFighter(state, 'player', 'yuji')
    const enemyYuji = getFighter(state, 'enemy', 'yuji')

    const queued = queue('player', yuji.instanceId, 'yuji-divergent-fist', enemyYuji.instanceId)
    const entries = buildQueuePreview(state, queued)

    const entry = entries.find((e) => e.kind === 'command')!
    expect(entry.timing).toBe('onAction')
    expect(entry.triggerType).toBe('guaranteed')
    expect(entry.draggable).toBe(true)
    expect(entry.locked).toBe(false)
    expect(entry.commandActorId).toBe(yuji.instanceId)
  })

  test('PASS ability is excluded from command entries', () => {
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const yuji = getFighter(state, 'player', 'yuji')

    const queued = queue('player', yuji.instanceId, '__pass__', null)
    const entries = buildQueuePreview(state, queued)

    expect(entries.filter((e) => e.kind === 'command')).toHaveLength(0)
  })

  test('enemy commands are excluded from player queue preview', () => {
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const enemyYuji = getFighter(state, 'enemy', 'yuji')
    const playerYuji = getFighter(state, 'player', 'yuji')

    const queued = queue('enemy', enemyYuji.instanceId, 'yuji-divergent-fist', playerYuji.instanceId)
    const entries = buildQueuePreview(state, queued)

    expect(entries.filter((e) => e.kind === 'command')).toHaveLength(0)
  })
})

// ── Scheduled effect entry tests ──────────────────────────────────────────────

describe('buildQueuePreview — scheduled effect entries', () => {
  // Helper: schedule effects in round N, advance state.round to N+1 so they are due.
  // The modal is shown to the player at the start of the round where effects fire,
  // so we mirror that by advancing the round counter to equal the dueRound.
  function buildStateWithDueScheduledEffect() {
    const base = createChargedState({
      playerTeamIds: ['maki', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const maki = getFighter(base, 'player', 'maki')
    const yuji = getFighter(base, 'enemy', 'yuji')

    const afterMaki = resolveTeamTurn(
      base,
      queue('player', maki.instanceId, 'maki-close-quarters-combo', yuji.instanceId),
      'player',
    )

    // Effects are created with dueRound = state.round + delay (delay=1).
    // Advance the round counter so dueRound === state.round (effect is now due).
    const dueEffect = afterMaki.state.scheduledEffects.find((e) => e.phase === 'roundStart')
    if (!dueEffect) throw new Error('Expected a scheduled roundStart effect')
    const stateAtDueRound = { ...afterMaki.state, round: dueEffect.dueRound }
    return { state: stateAtDueRound, dueEffect, maki, yuji }
  }

  test('due roundStart scheduled effect produces a scheduled entry', () => {
    const { state } = buildStateWithDueScheduledEffect()
    const entries = buildQueuePreview(state, {})
    const scheduled = entries.filter((e) => e.kind === 'scheduled')
    expect(scheduled.length).toBeGreaterThan(0)
  })

  test('scheduled entry carries scheduledEffectId matching the source BattleScheduledEffect', () => {
    const { state, dueEffect } = buildStateWithDueScheduledEffect()
    const entries = buildQueuePreview(state, {})
    const scheduledEntry = entries.find((e) => e.kind === 'scheduled')
    expect(scheduledEntry).toBeDefined()
    expect(scheduledEntry!.scheduledEffectId).toBe(dueEffect.id)
  })

  test('scheduled entry has correct sourceActorId from the scheduling actor', () => {
    const { state, maki } = buildStateWithDueScheduledEffect()
    const entries = buildQueuePreview(state, {})
    const scheduledEntry = entries.find((e) => e.kind === 'scheduled')
    expect(scheduledEntry!.sourceActorId).toBe(maki.instanceId)
  })

  test('scheduled entry has preTurn timing and guaranteed triggerType', () => {
    const { state } = buildStateWithDueScheduledEffect()
    const entries = buildQueuePreview(state, {})
    const scheduledEntry = entries.find((e) => e.kind === 'scheduled')!
    expect(scheduledEntry.timing).toBe('preTurn')
    expect(scheduledEntry.triggerType).toBe('guaranteed')
    expect(scheduledEntry.draggable).toBe(true)
    expect(scheduledEntry.locked).toBe(false)
  })

  test('scheduled entry targetIds match the BattleScheduledEffect targetIds', () => {
    const { state, dueEffect } = buildStateWithDueScheduledEffect()
    const entries = buildQueuePreview(state, {})
    const scheduledEntry = entries.find((e) => e.scheduledEffectId === dueEffect.id)!
    expect(scheduledEntry.targetIds).toEqual(dueEffect.targetIds)
  })

  test('roundEnd scheduled effects are excluded (not due in preTurn)', () => {
    const base = createChargedState({
      playerTeamIds: ['mechamaru', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const mechamaru = getFighter(base, 'player', 'mechamaru')
    const yuji = getFighter(base, 'enemy', 'yuji')

    // Mechamaru's Overload Cannon schedules a roundEnd effect
    const afterMech = resolveTeamTurn(
      base,
      queue('player', mechamaru.instanceId, 'mechamaru-overload-cannon', yuji.instanceId),
      'player',
    )

    // Advance to due round so any roundStart effects would appear, but roundEnd should not
    const roundEndEffect = afterMech.state.scheduledEffects.find((e) => e.phase === 'roundEnd')
    const advancedState = roundEndEffect
      ? { ...afterMech.state, round: roundEndEffect.dueRound }
      : afterMech.state

    const entries = buildQueuePreview(advancedState, {})
    // No roundEnd entries should appear in the preTurn queue preview
    const roundEndEntries = entries.filter(
      (e) =>
        e.scheduledEffectId !== undefined &&
        advancedState.scheduledEffects.find(
          (s) => s.id === e.scheduledEffectId && s.phase === 'roundEnd',
        ) !== undefined,
    )
    expect(roundEndEntries).toHaveLength(0)
  })
})

// ── Source attribution invariant tests ───────────────────────────────────────

describe('buildQueuePreview — source attribution invariants', () => {
  // Helper: two scheduled effects + two command entries with round advanced to due round.
  function buildMixedQueueState() {
    const base = createChargedState({
      playerTeamIds: ['maki', 'eso'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const maki = getFighter(base, 'player', 'maki')
    const eso = getFighter(base, 'player', 'eso')
    const yuji = getFighter(base, 'enemy', 'yuji')
    const nobara = getFighter(base, 'enemy', 'nobara')

    const afterMaki = resolveTeamTurn(
      base,
      queue('player', maki.instanceId, 'maki-close-quarters-combo', yuji.instanceId),
      'player',
    )
    const afterEso = resolveTeamTurn(
      afterMaki.state,
      queue('player', eso.instanceId, 'eso-hostage-situation', nobara.instanceId),
      'player',
    )

    // Advance to the round where scheduled effects are due
    const dueEffect = afterEso.state.scheduledEffects.find((e) => e.phase === 'roundStart')
    const stateAtDueRound = dueEffect
      ? { ...afterEso.state, round: dueEffect.dueRound }
      : afterEso.state

    const playerQueued: Record<string, QueuedBattleAction> = {
      [maki.instanceId]: { actorId: maki.instanceId, team: 'player', abilityId: 'maki-close-quarters-combo', targetId: yuji.instanceId },
      [eso.instanceId]: { actorId: eso.instanceId, team: 'player', abilityId: 'eso-hostage-situation', targetId: nobara.instanceId },
    }

    return { state: stateAtDueRound, playerQueued }
  }

  test('every returned entry has a non-empty sourceActorId', () => {
    const { state, playerQueued } = buildMixedQueueState()
    const entries = buildQueuePreview(state, playerQueued)
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.sourceActorId).toBeTruthy()
      expect(typeof entry.sourceActorId).toBe('string')
      expect(entry.sourceActorId.length).toBeGreaterThan(0)
    }
  })

  test('every returned entry has a source icon with a non-empty label', () => {
    const { state, playerQueued } = buildMixedQueueState()
    const entries = buildQueuePreview(state, playerQueued)
    for (const entry of entries) {
      expect(entry.sourceIcon).toBeDefined()
      expect(entry.sourceIcon.label).toBeTruthy()
      expect(entry.sourceIcon.label.length).toBeGreaterThan(0)
    }
  })

  test('no entry is produced when state has no queued actions, no scheduled effects, and no onRoundStart passives', () => {
    // yuji has no passives; megumi's only passive is onTakeDamage; todo's are onAbilityResolve/onBeingTargeted
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'todo'],
    })
    const entries = buildQueuePreview(state, {})
    expect(entries).toHaveLength(0)
  })

  test('scheduled effect with no matching actor in state is excluded', () => {
    const state = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })

    // Inject a scheduled effect with a non-existent actorId
    const stateWithOrphan: typeof state = {
      ...state,
      scheduledEffects: [
        {
          id: 'orphan-effect',
          actorId: 'nonexistent-actor-id',
          targetIds: [],
          abilityId: undefined,
          dueRound: state.round,
          phase: 'roundStart',
          effects: [{ type: 'damage', power: 10, target: 'inherit' }],
        },
      ],
    }

    const entries = buildQueuePreview(stateWithOrphan, {})
    expect(entries.filter((e) => e.scheduledEffectId === 'orphan-effect')).toHaveLength(0)
  })
})

// ── Passive entry tests ───────────────────────────────────────────────────────

describe('buildQueuePreview — passive entries', () => {
  test('real onRoundStart passive produces a passive entry with kind: passive', () => {
    const state = createChargedState({
      playerTeamIds: ['hanami', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const entries = buildQueuePreview(state, {})
    const passive = entries.find((e) => e.kind === 'passive')
    expect(passive).toBeDefined()
    expect(passive!.kind).toBe('passive')
  })

  test('passive entry has non-empty sourceActorId matching the fighter', () => {
    const state = createChargedState({
      playerTeamIds: ['hanami', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const hanami = getFighter(state, 'player', 'hanami')
    const entries = buildQueuePreview(state, {})
    const passive = entries.find((e) => e.kind === 'passive')
    expect(passive!.sourceActorId).toBe(hanami.instanceId)
  })

  test('passive entry has sourcePassiveId matching the passive id', () => {
    const state = createChargedState({
      playerTeamIds: ['hanami', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const entries = buildQueuePreview(state, {})
    const passive = entries.find((e) => e.kind === 'passive')
    expect(passive!.sourcePassiveId).toBe('hanami-natural-body')
  })

  test('passive entry is locked and not draggable', () => {
    const state = createChargedState({
      playerTeamIds: ['hanami', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const entries = buildQueuePreview(state, {})
    const passive = entries.find((e) => e.kind === 'passive')!
    expect(passive.locked).toBe(true)
    expect(passive.draggable).toBe(false)
  })

  test('passive entry has preTurn timing and guaranteed triggerType', () => {
    const state = createChargedState({
      playerTeamIds: ['hanami', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const entries = buildQueuePreview(state, {})
    const passive = entries.find((e) => e.kind === 'passive')!
    expect(passive.timing).toBe('preTurn')
    expect(passive.triggerType).toBe('guaranteed')
  })

  test('display-only passive using __never_* condition key is excluded', () => {
    // Mai has an onRoundStart passive guarded by __never_mai_display_only (never satisfiable)
    const state = createChargedState({
      playerTeamIds: ['mai', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const mai = getFighter(state, 'player', 'mai')
    const entries = buildQueuePreview(state, {})
    const maiPassives = entries.filter(
      (e) => e.kind === 'passive' && e.sourceActorId === mai.instanceId,
    )
    expect(maiPassives).toHaveLength(0)
  })

  test('passive entries from multiple fighters all appear', () => {
    // Hanami and Mechamaru both have real onRoundStart passives
    const state = createChargedState({
      playerTeamIds: ['hanami', 'mechamaru'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const entries = buildQueuePreview(state, {})
    const passives = entries.filter((e) => e.kind === 'passive')
    expect(passives.length).toBeGreaterThanOrEqual(2)
  })

  test('no passive entry has empty sourceActorId', () => {
    const state = createChargedState({
      playerTeamIds: ['hanami', 'mechamaru'],
      enemyTeamIds: ['jogo', 'nobara'],
    })
    const entries = buildQueuePreview(state, {})
    for (const entry of entries.filter((e) => e.kind === 'passive')) {
      expect(entry.sourceActorId).toBeTruthy()
      expect(entry.sourceActorId.length).toBeGreaterThan(0)
    }
  })

  test('dead fighter passive is excluded', () => {
    const base = createChargedState({
      playerTeamIds: ['hanami', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const hanami = getFighter(base, 'player', 'hanami')
    // Kill hanami by setting hp to 0
    const deadState: BattleState = {
      ...base,
      playerTeam: base.playerTeam.map((f) =>
        f.instanceId === hanami.instanceId ? { ...f, hp: 0 } : f,
      ),
    }
    const entries = buildQueuePreview(deadState, {})
    const hanamPassives = entries.filter(
      (e) => e.kind === 'passive' && e.sourceActorId === hanami.instanceId,
    )
    expect(hanamPassives).toHaveLength(0)
  })
})

// ── Reaction entry tests ──────────────────────────────────────────────────────

describe('buildQueuePreview — reaction entries', () => {
  // Helper: use Hanami's ultimate (hanami-natures-resilience) which creates a
  // 'reaction' kind guard on Hanami (trigger: onBeingTargeted, duration: 1).
  function buildStateWithHanamiReactionGuard() {
    const base = createChargedState({
      playerTeamIds: ['hanami', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const hanami = getFighter(base, 'player', 'hanami')
    const result = resolveTeamTurn(
      base,
      { [hanami.instanceId]: { actorId: hanami.instanceId, team: 'player', abilityId: 'hanami-natures-resilience', targetId: hanami.instanceId } },
      'player',
    )
    return { state: result.state, hanami }
  }

  test('active reaction guard produces a reaction entry with kind: reaction', () => {
    const { state } = buildStateWithHanamiReactionGuard()
    const entries = buildQueuePreview(state, {})
    const reaction = entries.find((e) => e.kind === 'reaction')
    expect(reaction).toBeDefined()
    expect(reaction!.kind).toBe('reaction')
  })

  test('reaction entry has sourceActorId matching the fighter who created the guard', () => {
    const { state, hanami } = buildStateWithHanamiReactionGuard()
    const entries = buildQueuePreview(state, {})
    const reaction = entries.find((e) => e.kind === 'reaction')
    expect(reaction!.sourceActorId).toBe(hanami.instanceId)
  })

  test('reaction entry has sourceAbilityId matching the ability that created the guard', () => {
    const { state } = buildStateWithHanamiReactionGuard()
    const entries = buildQueuePreview(state, {})
    const reaction = entries.find((e) => e.kind === 'reaction')
    expect(reaction!.sourceAbilityId).toBe('hanami-natures-resilience')
  })

  test('reaction entry is locked and not draggable', () => {
    const { state } = buildStateWithHanamiReactionGuard()
    const entries = buildQueuePreview(state, {})
    const reaction = entries.find((e) => e.kind === 'reaction')!
    expect(reaction.locked).toBe(true)
    expect(reaction.draggable).toBe(false)
  })

  test('reaction entry has onReaction timing and reactive triggerType', () => {
    const { state } = buildStateWithHanamiReactionGuard()
    const entries = buildQueuePreview(state, {})
    const reaction = entries.find((e) => e.kind === 'reaction')!
    expect(reaction.timing).toBe('onReaction')
    expect(reaction.triggerType).toBe('reactive')
  })

  test('reaction entry lockReason is set', () => {
    const { state } = buildStateWithHanamiReactionGuard()
    const entries = buildQueuePreview(state, {})
    const reaction = entries.find((e) => e.kind === 'reaction')!
    expect(reaction.lockReason).toBeTruthy()
  })

  test('effect reaction guard with visible: false is excluded', () => {
    // Eso's Corrosive Blood reaction has visible: false — inject it directly
    const base = createChargedState({
      playerTeamIds: ['eso', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const eso = getFighter(base, 'player', 'eso')

    const stateWithHiddenGuard: BattleState = {
      ...base,
      playerTeam: base.playerTeam.map((f) =>
        f.instanceId === eso.instanceId
          ? {
              ...f,
              reactionGuards: [
                {
                  id: 'reaction-effect-hidden-test',
                  kind: 'effect' as const,
                  label: 'Hidden Reaction',
                  remainingRounds: 1,
                  consumeOnTrigger: true,
                  visible: false,
                  sourceActorId: eso.instanceId,
                  sourceAbilityId: 'eso-corrosive-blood',
                },
              ],
            }
          : f,
      ),
    }

    const entries = buildQueuePreview(stateWithHiddenGuard, {})
    const hiddenReactions = entries.filter(
      (e) => e.kind === 'reaction' && e.sourceActorId === eso.instanceId,
    )
    expect(hiddenReactions).toHaveLength(0)
  })

  test('reaction guard with no sourceActorId is excluded', () => {
    const base = createChargedState({
      playerTeamIds: ['yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara'],
    })
    const yuji = getFighter(base, 'player', 'yuji')

    const stateWithOrphan: BattleState = {
      ...base,
      playerTeam: base.playerTeam.map((f) =>
        f.instanceId === yuji.instanceId
          ? {
              ...f,
              reactionGuards: [
                {
                  id: 'reaction-orphan-test',
                  kind: 'counter' as const,
                  label: 'Orphan Counter',
                  remainingRounds: 1,
                  consumeOnTrigger: true,
                  sourceActorId: undefined,
                  sourceAbilityId: undefined,
                },
              ],
            }
          : f,
      ),
    }

    const entries = buildQueuePreview(stateWithOrphan, {})
    expect(entries.filter((e) => e.kind === 'reaction')).toHaveLength(0)
  })

  test('no reaction entry has empty sourceActorId', () => {
    const { state } = buildStateWithHanamiReactionGuard()
    const entries = buildQueuePreview(state, {})
    for (const entry of entries.filter((e) => e.kind === 'reaction')) {
      expect(entry.sourceActorId).toBeTruthy()
      expect(entry.sourceActorId.length).toBeGreaterThan(0)
    }
  })
})
