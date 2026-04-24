import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { BattleAbilityStrip } from '@/components/battle/BattleAbilityStrip'
import { BattleInfoPanel } from '@/components/battle/BattleInfoPanel'
import { createInitialBattleState } from '@/features/battle/engine'

function getTestIdClassName(html: string, testId: string): string {
  const escaped = testId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const classFirst = new RegExp(`class="([^"]*)"[^>]*data-testid="${escaped}"`, 'i').exec(html)?.[1]
  if (classFirst) return classFirst
  const testIdFirst = new RegExp(`data-testid="${escaped}"[^>]*class="([^"]*)"`, 'i').exec(html)?.[1]
  return testIdFirst ?? ''
}

describe('battle layout guards', () => {
  test('skill strip keeps a fixed 5-slot grid without scroll containers', () => {
    const state = createInitialBattleState({ battleSeed: 'layout-guard-strip' })
    const fighter = state.playerTeam[0]
    expect(fighter).toBeTruthy()
    if (!fighter) return

    const html = renderToStaticMarkup(
      <BattleAbilityStrip fighter={fighter} pendingAbilityId={fighter.abilities[0]?.id ?? fighter.ultimate.id} />,
    )

    const gridClass = getTestIdClassName(html, 'ability-strip-skill-grid')

    expect(gridClass).toContain('grid-cols-5')
    expect(gridClass).toContain('overflow-hidden')
    expect(gridClass).not.toContain('overflow-x-auto')
    expect(gridClass).not.toContain('overflow-y-auto')
  })

  test('battle info panel remains fixed-height regardless of description length', () => {
    const state = createInitialBattleState({ battleSeed: 'layout-guard-info' })
    const actor = state.playerTeam[0]
    expect(actor).toBeTruthy()
    if (!actor) return

    const shortAbility = actor.abilities[0] ?? actor.ultimate
    const longAbility = {
      ...shortAbility,
      description: `${shortAbility.description} ${'LONG DESCRIPTION '.repeat(80)}`.trim(),
    }

    const shortHtml = renderToStaticMarkup(
      <BattleInfoPanel state={state} queued={{}} actor={actor} ability={shortAbility} />,
    )
    const longHtml = renderToStaticMarkup(
      <BattleInfoPanel state={state} queued={{}} actor={actor} ability={longAbility} />,
    )

    const shortPanelClass = getTestIdClassName(shortHtml, 'battle-info-panel')
    const longPanelClass = getTestIdClassName(longHtml, 'battle-info-panel')
    const longBodyClass = getTestIdClassName(longHtml, 'battle-info-panel-body')

    expect(shortPanelClass).toContain('h-[13.75rem]')
    expect(shortPanelClass).toContain('overflow-hidden')
    expect(longPanelClass).toBe(shortPanelClass)
    expect(longBodyClass).toContain('overflow-y-auto')
    expect(longBodyClass).toContain('min-h-0')
  })
})
