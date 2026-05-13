import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BattleAbilityStrip } from '@/components/battle/BattleAbilityStrip'
import { createInitialBattleState } from '@/features/battle/engine'
import type { BattleFighterState, QueuedBattleAction } from '@/features/battle/types'

function makeFighter() {
  const state = createInitialBattleState({
    playerTeamIds: ['yuji', 'nobara', 'megumi'],
    enemyTeamIds: ['yuji', 'nobara', 'megumi'],
  })
  const fighter = state.playerTeam[0]
  if (!fighter) throw new Error('Expected fighter')
  return fighter
}

function firstAbility(fighter: BattleFighterState) {
  const ability = fighter.abilities[0]
  if (!ability) throw new Error('Expected fighter ability')
  return ability
}

function renderStrip(
  fighter: BattleFighterState,
  options: {
    validAbility?: (abilityId: string) => boolean
    abilityBlockReason?: (abilityId: string) => string | null
    queuedAction?: QueuedBattleAction
    queuedOrder?: number | null
    pendingAbilityId?: string | null
  } = {},
) {
  return renderToStaticMarkup(
    <BattleAbilityStrip
      fighter={fighter}
      selected
      pendingAbilityId={options.pendingAbilityId ?? null}
      queuedAction={options.queuedAction}
      queuedOrder={options.queuedOrder}
      validAbility={options.validAbility}
      abilityBlockReason={options.abilityBlockReason}
    />,
  )
}

function renderBlockedReason(reason: string, setup?: (fighter: BattleFighterState, abilityId: string) => void) {
  const fighter = makeFighter()
  const ability = firstAbility(fighter)
  setup?.(fighter, ability.id)

  return renderStrip(fighter, {
    validAbility: (abilityId) => abilityId !== ability.id,
    abilityBlockReason: (abilityId) => (abilityId === ability.id ? reason : null),
  })
}

describe('BattleAbilityStrip tile scan states', () => {
  test('cooldown tile shows cooldown number without an extra text badge', () => {
    const html = renderBlockedReason('Cooldown 2 turns', (fighter, abilityId) => {
      fighter.cooldowns[abilityId] = 2
    })

    expect(html).toContain('>2<')
    expect(html).toContain('Cooldown 2 turns')
    expect(html).not.toContain('CD 2')
  })

  test('stunned actor skill exposes reason through hover/title without an in-tile label', () => {
    const html = renderBlockedReason('Stunned this turn')

    expect(html).toContain('Stunned this turn')
    expect(html).toContain('opacity-42')
    expect(html).not.toContain('>STN<')
  })

  test('class-locked skill exposes reason through hover/title without an in-tile label', () => {
    const html = renderBlockedReason('Technique class sealed')

    expect(html).toContain('Technique class sealed')
    expect(html).not.toContain('>CLS<')
  })

  test('intent-locked skill exposes reason through hover/title without an in-tile label', () => {
    const html = renderBlockedReason('Skill intent sealed')

    expect(html).toContain('Skill intent sealed')
    expect(html).not.toContain('>INT<')
  })

  test('insufficient resource exposes reason through hover/title without an in-tile label', () => {
    const html = renderBlockedReason('Insufficient resource')

    expect(html).toContain('Insufficient resource')
    expect(html).not.toContain('>COST<')
  })

  test('no valid targets exposes reason through hover/title without an in-tile label', () => {
    const html = renderBlockedReason('No valid targets')

    expect(html).toContain('No valid targets')
    expect(html).not.toContain('>TGT<')
  })

  test('missing condition or setup exposes reason through hover/title without an in-tile label', () => {
    const html = renderBlockedReason('Missing setup condition')

    expect(html).toContain('Missing setup condition')
    expect(html).not.toContain('>REQ<')
  })

  test('KO actor skill exposes reason through hover/title without an in-tile label', () => {
    const html = renderBlockedReason('Fighter is KO')

    expect(html).toContain('Fighter is KO')
    expect(html).not.toContain('>KO<')
  })

  test('queued skill shows visible QUE order state', () => {
    const fighter = makeFighter()
    const ability = firstAbility(fighter)
    const html = renderStrip(fighter, {
      queuedOrder: 2,
      queuedAction: {
        actorId: fighter.instanceId,
        team: fighter.team,
        abilityId: ability.id,
        targetId: null,
      },
    })

    expect(html).toContain('QUE 2')
  })

  test('queued random-cost skill with missing allocation exposes hover/title reason without an in-tile label', () => {
    const fighter = makeFighter()
    const ability = firstAbility(fighter)
    ability.energyCost = { random: 1 }

    const html = renderStrip(fighter, {
      queuedAction: {
        actorId: fighter.instanceId,
        team: fighter.team,
        abilityId: ability.id,
        targetId: null,
      },
    })

    expect(html).toContain('Random Energy allocation required at confirmation')
    expect(html).not.toContain('>RND<')
  })
})
