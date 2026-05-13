import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BattleInfoPanel } from '@/components/battle/BattleInfoPanel'
import { createInitialBattleState } from '@/features/battle/engine'

describe('BattleInfoPanel enemy inspection', () => {
  test('shows authored base cooldown but not enemy live cooldown', () => {
    const state = createInitialBattleState({
      playerTeamIds: ['yuji', 'nobara', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const enemy = state.enemyTeam[0]
    const ability = enemy?.abilities[0]
    if (!enemy || !ability) throw new Error('Expected enemy Yuji with a visible ability')

    ability.cooldown = 2
    enemy.cooldowns[ability.id] = 9

    const html = renderToStaticMarkup(
      <BattleInfoPanel
        state={state}
        queued={{}}
        actor={enemy}
        ability={ability}
        isEnemyInspect
        inspectedEnemyFighter={enemy}
        inspectedEnemyAbilityId={ability.id}
      />,
    )

    expect(html).toContain('COOLDOWN')
    expect(html).toContain('>2<')
    expect(html).not.toContain('>9<')
    expect(html).not.toContain('Cooldown 9')
  })
})
