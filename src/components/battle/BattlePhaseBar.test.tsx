import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BattlePhaseBar, type BattlePhaseBarProps } from '@/components/battle/BattlePhaseBar'

function render(overrides: Partial<BattlePhaseBarProps> = {}) {
  const defaults: BattlePhaseBarProps = {
    phase: 'firstPlayerCommand',
    round: 1,
    resolving: false,
    playerCanAct: true,
    isOnline: false,
    waitingForOpponent: false,
  }
  return renderToStaticMarkup(<BattlePhaseBar {...defaults} {...overrides} />)
}

describe('BattlePhaseBar phase labels', () => {
  test('player command phase shows a command label and round number', () => {
    const html = render({ phase: 'firstPlayerCommand', playerCanAct: true })

    expect(html).toContain('data-testid="battle-phase-bar"')
    expect(html).toContain('COMMAND')
    expect(html).toContain('R1')
  })

  test('second player command window labels Response Command', () => {
    const html = render({ phase: 'secondPlayerCommand', playerCanAct: true })

    expect(html).toContain('RESPONSE COMMAND')
  })

  test('resolving state shows Resolving Actions label and LOCKED indicator', () => {
    const html = render({ resolving: true, playerCanAct: false })

    expect(html).toContain('RESOLVING ACTIONS')
    expect(html).toContain('LOCKED')
  })

  test('resolving state shows queue locked sub-message', () => {
    const html = render({ resolving: true, playerCanAct: false })

    expect(html).toContain('Queue locked.')
  })

  test('waiting for opponent shows waiting label', () => {
    const html = render({
      isOnline: true,
      waitingForOpponent: true,
      playerCanAct: false,
      resolving: false,
    })

    expect(html).toContain('WAITING FOR OPPONENT')
  })

  test('waiting for opponent shows enemy command sub-message', () => {
    const html = render({
      isOnline: true,
      waitingForOpponent: true,
      playerCanAct: false,
      resolving: false,
    })

    expect(html).toContain('Enemy command in progress')
  })

  test('finished phase shows match concluded label', () => {
    const html = render({ phase: 'finished', playerCanAct: false })

    expect(html).toContain('MATCH CONCLUDED')
  })

  test('coinFlip phase shows Battle Start', () => {
    const html = render({ phase: 'coinFlip', playerCanAct: false })

    expect(html).toContain('BATTLE START')
  })

  test('roundEnd phase shows Round End', () => {
    const html = render({ phase: 'roundEnd', playerCanAct: false })

    expect(html).toContain('ROUND END')
  })

  test('round number renders correctly for round 3', () => {
    const html = render({ round: 3, phase: 'firstPlayerCommand', playerCanAct: true })

    expect(html).toContain('R3')
    expect(html).not.toContain('R1')
  })

  test('player command phase does not show LOCKED indicator', () => {
    const html = render({ phase: 'firstPlayerCommand', playerCanAct: true, resolving: false })

    expect(html).not.toContain('LOCKED')
    expect(html).not.toContain('RESOLVING')
  })

  test('resolving takes priority over waitingForOpponent', () => {
    const html = render({ resolving: true, waitingForOpponent: true, playerCanAct: false })

    expect(html).toContain('RESOLVING ACTIONS')
    expect(html).not.toContain('WAITING FOR OPPONENT')
  })
})
