import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActiveEffectPips, BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
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

function renderPortrait(fighter: BattleFighterState, options: { queuedAction?: QueuedBattleAction; delayedEffectCount?: number } = {}) {
  return renderToStaticMarkup(
    <BattlePortraitSlot
      fighter={fighter}
      accent="teal"
      queuedAction={options.queuedAction}
      delayedEffectCount={options.delayedEffectCount}
    />,
  )
}

describe('BattlePortraitSlot scan badges', () => {
  test('stunned portrait shows visible stun indicator', () => {
    const fighter = makeFighter()
    fighter.statuses = [{ kind: 'stun', duration: 1 }]

    const html = renderPortrait(fighter)

    expect(html).toContain('STN')
    expect(html).toContain('Stunned: cannot act')
  })

  test('shielded portrait shows visible shield value', () => {
    const fighter = makeFighter()
    fighter.shield = {
      amount: 18,
      label: 'Guard',
      sourceActorId: fighter.instanceId,
      sourceAbilityId: fighter.abilities[0]?.id,
      tags: ['test'],
    }

    const html = renderPortrait(fighter)

    expect(html).toContain('>18<')
    expect(html).toContain('18 shield')
  })

  test('invulnerable portrait shows visible invulnerable indicator', () => {
    const fighter = makeFighter()
    fighter.statuses = [{ kind: 'invincible', duration: 1 }]

    const html = renderPortrait(fighter)

    expect(html).toContain('INV')
    expect(html).toContain('Invulnerable')
  })

  test('counter and reflect guards show visible indicators', () => {
    const fighter = makeFighter()
    fighter.reactionGuards = [
      {
        id: 'counter-test',
        kind: 'counter',
        label: 'Counter',
        remainingRounds: 1,
        counterDamage: 10,
        consumeOnTrigger: true,
      },
      {
        id: 'reflect-test',
        kind: 'reflect',
        label: 'Reflect',
        remainingRounds: 1,
        consumeOnTrigger: true,
      },
    ]

    const html = renderPortrait(fighter)

    expect(html).toContain('CTR')
    expect(html).toContain('Counter armed')
    expect(html).toContain('RFL')
    expect(html).toContain('Reflect armed')
  })

  test('mark setup status shows visible indicator', () => {
    const fighter = makeFighter()
    fighter.statuses = [{ kind: 'mark', duration: 2, bonus: 10 }]

    const html = renderPortrait(fighter)

    expect(html).toContain('MRK')
    expect(html).toContain('Marked or setup effect active')
  })

  test('status overflow exposes hidden details in title', () => {
    const fighter = makeFighter()
    fighter.statuses = [
      { kind: 'stun', duration: 1 },
      { kind: 'invincible', duration: 1 },
      { kind: 'mark', duration: 2, bonus: 10 },
      { kind: 'burn', duration: 2, damage: 5 },
    ]
    fighter.shield = { amount: 12, label: 'Guard', tags: [] }
    fighter.classStuns = [{
      id: 'class-lock',
      label: 'Class Lock',
      blockedClasses: ['Physical'],
      remainingRounds: 1,
    }]
    fighter.intentStuns = [{
      id: 'intent-lock',
      label: 'Intent Lock',
      intent: 'harmful',
      remainingRounds: 1,
    }]
    fighter.effectImmunities = [{
      id: 'immune',
      label: 'Immunity',
      blocks: ['nonDamage'],
      remainingRounds: 1,
    }]

    const html = renderPortrait(fighter)

    expect(html).toContain('+')
    expect(html).toContain('Effect immunity active')
    expect(html).toContain('Damage over time or affliction active')
  })

  test('KO portrait remains visually distinct and suppresses other badges', () => {
    const fighter = makeFighter()
    fighter.hp = 0
    fighter.statuses = [{ kind: 'stun', duration: 1 }]
    fighter.shield = { amount: 20, label: 'Guard', tags: [] }

    const html = renderPortrait(fighter)

    expect(html).toContain('>KO<')
    expect(html).toContain('Defeated')
    expect(html).not.toContain('STN')
    expect(html).not.toContain('20 shield')
  })

  test('queued and delayed states show compact indicators', () => {
    const fighter = makeFighter()
    const ability = fighter.abilities[0]
    if (!ability) throw new Error('Expected ability')

    const html = renderPortrait(fighter, {
      delayedEffectCount: 1,
      queuedAction: {
        actorId: fighter.instanceId,
        team: fighter.team,
        abilityId: ability.id,
        targetId: null,
      },
    })

    expect(html).toContain('DLY')
    expect(html).toContain('1 delayed effect pending')
    expect(html).toContain('QUE')
    expect(html).toContain('Queued action ready')
  })

  test('active effect pips do not render category or duration text overlays', () => {
    const fighter = makeFighter()
    fighter.reactionGuards = [
      {
        id: 'counter-test',
        kind: 'counter',
        label: 'Counter',
        remainingRounds: 2,
        counterDamage: 10,
        consumeOnTrigger: true,
      },
    ]

    const html = renderToStaticMarkup(<ActiveEffectPips fighter={fighter} />)

    expect(html).toContain('h-[1.65rem]')
    expect(html).not.toContain('>CTR<')
    expect(html).not.toContain('>2<')
  })
})
