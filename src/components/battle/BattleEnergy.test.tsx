import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EnergyPip } from '@/components/battle/BattleEnergy'
import { battleEnergyMeta, randomEnergyMeta } from '@/features/battle/energy'

describe('battle energy presentation', () => {
  test('uses confirmed player-facing resource labels and colors', () => {
    expect(battleEnergyMeta.physical).toMatchObject({
      label: 'Physical',
      short: 'PHY',
      color: '#4ade80',
    })
    expect(battleEnergyMeta.technique).toMatchObject({
      label: 'Technique',
      short: 'CT',
      color: '#fa2742',
    })
    expect(battleEnergyMeta.vow).toMatchObject({
      label: 'Special',
      short: 'SPC',
      color: '#3b82f6',
    })
    expect(battleEnergyMeta.mental).toMatchObject({
      label: 'Spirit',
      short: 'SPI',
      color: '#f7f7fb',
    })
    expect(randomEnergyMeta).toMatchObject({
      label: 'Random',
      short: 'RND',
      color: '#050509',
    })
  })

  test('renders typed and random energy pips as square pips', () => {
    const typed = renderToStaticMarkup(<EnergyPip type="physical" />)
    const random = renderToStaticMarkup(<EnergyPip type="random" />)

    expect(typed).toContain('rounded-[0.15rem]')
    expect(random).toContain('rounded-[0.15rem]')
    expect(typed).not.toContain('rounded-full')
    expect(random).not.toContain('rounded-full')
  })
})
