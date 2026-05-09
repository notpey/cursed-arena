import { describe, expect, test } from 'vitest'
import { getActivePips } from '@/components/battle/battleDisplay'
import { formatSkillClasses } from '@/components/battle/skillClassDisplay'
import { battleRoster, defaultBattleSetup } from '@/features/battle/data'
import { getAbilityEnergyCost } from '@/features/battle/energy'
import { createInitialBattleState } from '@/features/battle/engine'
import { validateBattleContent } from '@/features/battle/validation'
import {
  CONTENT_SCHEMA_VERSION,
  createContentSnapshot,
  clearPublishedBattleContent,
  isSnapshotCurrent,
  readPublishedBattleContent,
  savePublishedBattleContent,
} from '@/features/battle/contentSnapshot'
import type { BattleFighterTemplate } from '@/features/battle/types'

describe('battle content validation', () => {
  test('current battle roster passes schema validation', () => {
    const report = validateBattleContent(battleRoster, defaultBattleSetup)
    expect(report.errors).toEqual([])
  })

  test('manual energy costs override automatic cost rules', () => {
    const ability = {
      ...battleRoster[0].abilities[0],
      kind: 'attack' as const,
      targetRule: 'enemy-single' as const,
      classes: ['Melee', 'Physical'] as BattleFighterTemplate['abilities'][number]['classes'],
      energyCost: { mental: 2, technique: 1 },
    }

    expect(getAbilityEnergyCost(ability)).toEqual({ mental: 2, technique: 1 })
  })

  test('manual costs can exceed automatic reserve guidance without failing validation', () => {
    const expensiveAbility = {
      ...battleRoster[0].abilities[0],
      energyCost: { physical: 2, technique: 2, mental: 1 },
    }

    const report = validateBattleContent([
      {
        ...battleRoster[0],
        abilities: [expensiveAbility, ...battleRoster[0].abilities.slice(1)],
      },
      battleRoster[1],
      battleRoster[2],
    ], defaultBattleSetup)

    expect(report.errors.some((error) => error.includes('energy cost exceeds a single-round reserve budget'))).toBe(false)
  })

  test('skill class display keeps Cursed-Arena order', () => {
    const ability = {
      ...battleRoster[0].abilities[0],
      classes: ['Strategic', 'Instant', 'Ranged', 'Energy', 'Ultimate'] as BattleFighterTemplate['abilities'][number]['classes'],
    }

    expect(formatSkillClasses(ability)).toBe('Energy, Ranged, Instant, Ultimate, Strategic')
  })

  test('targeted content lint catches fixed kit semantics', () => {
    const nobara = battleRoster.find((fighter) => fighter.id === 'nobara')
    const megumi = battleRoster.find((fighter) => fighter.id === 'megumi')
    const resonance = nobara?.abilities.find((ability) => ability.id === 'nobara-soul-resonance')
    const hammer = nobara?.abilities.find((ability) => ability.id === 'nobara-hammer-and-nails')
    const nue = megumi?.abilities.find((ability) => ability.id === 'megumi-nue')

    const hammerStack = hammer?.effects?.find(
      (effect) => effect.type === 'adjustCounter' && effect.key === 'straw_doll_ritual_stacks',
    )
    const resonancePayoff = resonance?.effects?.find((effect) => effect.type === 'damageScaledByCounter')

    expect(hammerStack?.type === 'adjustCounter' ? hammerStack.amount : null).toBe(1)
    expect(resonance?.requiredTargetTags).toContain('straw-doll-ritual')
    expect(resonancePayoff?.type === 'damageScaledByCounter' ? resonancePayoff.powerPerStack : null).toBe(5)
    expect(nue?.description).toContain('25 piercing damage')
    expect(nue?.effects?.some((effect) => effect.type === 'adjustCounter' && effect.key === 'shikigami')).toBe(true)
  })

  test('Eso and Kechizu are authored as playable Rot fighters', () => {
    const eso = battleRoster.find((fighter) => fighter.id === 'eso')
    const kechizu = battleRoster.find((fighter) => fighter.id === 'kechizu')

    expect(eso?.maxHp).toBe(100)
    expect(kechizu?.maxHp).toBe(100)
    expect(eso?.passiveEffects?.some((passive) => passive.counterKey === 'rot')).toBe(true)
    expect(kechizu?.passiveEffects?.some((passive) => passive.counterKey === 'rot')).toBe(true)
    expect(eso!.abilities[0].classes).toEqual(['Piercing', 'Ranged', 'Instant'])
    expect(eso!.abilities[2].classes).toEqual(['Special', 'Ranged', 'Instant', 'Action'])
    expect(kechizu!.abilities[0].classes).toEqual(['Affliction', 'Ranged', 'Instant'])
    expect(eso!.ultimate.intent).toBe('helpful')
    expect(kechizu!.abilities[1].intent).toBe('mixed')
    expect(kechizu!.ultimate.intent).toBe('helpful')
  })

  test('validator catches duplicate ids and malformed abilities', () => {
    const brokenRoster: BattleFighterTemplate[] = [
      {
        ...battleRoster[0],
        id: battleRoster[1].id,
        abilities: battleRoster[0].abilities.map((ability, index) =>
          index === 0
            ? {
                ...ability,
                id: battleRoster[0].ultimate.id,
                effects: [],
              }
            : ability,
        ),
      },
      battleRoster[1],
    ]

    const report = validateBattleContent(brokenRoster, {
      playerTeamIds: [battleRoster[0].id, battleRoster[0].id, 'missing-id'],
      enemyTeamIds: [battleRoster[1].id],
    })

    expect(report.errors.some((error) => error.includes('fighter ids must be unique'))).toBe(true)
    expect(report.errors.some((error) => error.includes('ultimate id must not duplicate'))).toBe(true)
    expect(report.errors.some((error) => error.includes('ability requires at least one effect'))).toBe(true)
    expect(report.errors.some((error) => error.includes('default setup contains duplicate fighter ids'))).toBe(true)
    expect(report.errors.some((error) => error.includes('unknown fighter id'))).toBe(true)
    expect(report.errors.some((error) => error.includes('must contain exactly 3 fighters'))).toBe(true)
  })

  test('published content storage preserves schema version across normalization', () => {
    const fallback = createContentSnapshot(battleRoster, defaultBattleSetup)
    clearPublishedBattleContent()

    const saved = savePublishedBattleContent(fallback)
    const read = readPublishedBattleContent(fallback)

    expect(saved.schemaVersion).toBe(CONTENT_SCHEMA_VERSION)
    expect(read.schemaVersion).toBe(CONTENT_SCHEMA_VERSION)
    expect(read.updatedAt).toBe(saved.updatedAt)

    clearPublishedBattleContent()
  })

  test('published content normalizes legacy Supabase game asset URLs', () => {
    const fallback = createContentSnapshot(battleRoster, defaultBattleSetup)
    const brokenAssetUrl = 'https://example.supabase.co/storage/v1/object/game-assets/portraits/eso.png'
    const fixedAssetUrl = 'https://example.supabase.co/storage/v1/object/public/game-assets/portraits/eso.png'
    const snapshot = {
      ...fallback,
      roster: fallback.roster.map((fighter, fighterIndex) =>
        fighterIndex === 0
          ? {
              ...fighter,
              boardPortraitSrc: brokenAssetUrl,
              abilities: fighter.abilities.map((ability, abilityIndex) =>
                abilityIndex === 0
                  ? {
                      ...ability,
                      icon: { ...ability.icon, src: brokenAssetUrl },
                    }
                  : ability,
              ),
            }
          : fighter,
      ),
    }

    clearPublishedBattleContent()
    const saved = savePublishedBattleContent(snapshot)

    expect(saved.roster[0].boardPortraitSrc).toBe(fixedAssetUrl)
    expect(saved.roster[0].abilities[0].icon.src).toBe(fixedAssetUrl)

    clearPublishedBattleContent()
  })

  test('stale published content falls back to authored roster after schema changes', () => {
    const fallback = createContentSnapshot(battleRoster, defaultBattleSetup)
    const stale = {
      ...fallback,
      roster: fallback.roster.filter((fighter) => fighter.id !== 'eso' && fighter.id !== 'kechizu'),
      schemaVersion: CONTENT_SCHEMA_VERSION - 1,
    }

    expect(isSnapshotCurrent(stale)).toBe(false)
    expect(fallback.roster.some((fighter) => fighter.id === 'eso')).toBe(true)
    expect(fallback.roster.some((fighter) => fighter.id === 'kechizu')).toBe(true)
  })

  test('Black Flash Bonus counter gets its own pip, not attached to Sukuna\'s Vessel', () => {
    const state = createInitialBattleState()
    const yuji = state.playerTeam.find((fighter) => fighter.templateId === 'yuji')
    expect(yuji).toBeDefined()

    // No counter: neither pip appears
    expect(getActivePips(yuji!).some((pip) => pip.label === "Sukuna's Vessel")).toBe(false)
    expect(getActivePips(yuji!).some((pip) => pip.label === 'Black Flash Bonus')).toBe(false)

    yuji!.stateCounters.yuji_black_flash_bonus = 10
    const pips = getActivePips(yuji!)

    // Counter gets its own dedicated pip, not attached to Sukuna's Vessel
    const bfPip = pips.find((pip) => pip.label === 'Black Flash Bonus')
    expect(bfPip).toBeDefined()
    expect(bfPip?.stackCount).toBe(10)
    expect(bfPip?.lines.some((line) => line.text.includes('+10 damage'))).toBe(true)

    // Sukuna's Vessel is not present (passive only shows when its own modifier is on the fighter)
    expect(pips.some((pip) => pip.label === "Sukuna's Vessel")).toBe(false)
  })

  test('percentAdd modifier pips display decimal values as percentages', () => {
    const state = createInitialBattleState()
    const yuji = state.playerTeam.find((fighter) => fighter.templateId === 'yuji')
    expect(yuji).toBeDefined()

    yuji!.modifiers.push({
      id: 'test-percent-guard',
      label: 'Percent Guard',
      scope: 'fighter',
      targetId: yuji!.instanceId,
      stat: 'damageTaken',
      mode: 'percentAdd',
      value: -0.25,
      duration: { kind: 'permanent' },
      tags: ['test-percent-guard'],
      visible: true,
      stacking: 'replace',
    })

    const lines = getActivePips(yuji!).flatMap((pip) => pip.lines.map((line) => line.text))
    expect(lines.some((line) => line.includes('-25%'))).toBe(true)
    expect(lines.some((line) => line.includes('-0.25%'))).toBe(false)
  })

  test('Straw Doll counters display as one consolidated visible stack pip', () => {
    const state = createInitialBattleState()
    const target = state.enemyTeam.find((fighter) => fighter.templateId === 'yuji')
    expect(target).toBeDefined()

    target!.stateCounters.straw_doll_ritual_stacks = 3
    target!.modifiers.push({
      id: 'test-straw-doll-marker',
      label: 'Straw Doll Ritual',
      scope: 'fighter',
      targetId: target!.instanceId,
      stat: 'cooldownTick',
      mode: 'flat',
      value: 0,
      duration: { kind: 'permanent' },
      tags: ['straw-doll-ritual'],
      visible: true,
      stacking: 'replace',
    })

    const pips = getActivePips(target!)
    const strawDollPips = pips.filter((pip) => pip.label === 'Straw Doll Ritual')
    expect(strawDollPips).toHaveLength(1)
    expect(strawDollPips[0]?.stackCount).toBe(3)

    const text = strawDollPips[0]?.lines.map((line) => line.text).join(' ') ?? ''
    expect(text).toContain('3 Straw Doll stacks.')
    expect(text).toContain('6 piercing damage at round start')
    expect(text).toContain('15 piercing damage')
    expect(text).toContain('Hairpin can target this fighter.')
  })

  test('vocal_strain_damage counter gets its own pip with self-damage description', () => {
    const state = createInitialBattleState({
      playerTeamIds: ['toge', 'yuji', 'megumi'],
      enemyTeamIds: ['yuji', 'nobara', 'megumi'],
    })
    const toge = state.playerTeam.find((fighter) => fighter.templateId === 'toge')
    expect(toge).toBeDefined()

    // Counter starts at 5 from initialStateCounters
    expect(toge!.stateCounters.vocal_strain_damage).toBe(5)
    const pips = getActivePips(toge!)
    const strainPip = pips.find((pip) => pip.label === 'Vocal Strain')
    expect(strainPip).toBeDefined()
    expect(strainPip?.stackCount).toBe(5)
    expect(strainPip?.lines.some((line) => line.text.includes('5 affliction damage'))).toBe(true)
  })

  test('blast_away_bonus counter gets its own pip on the enemy target', () => {
    const state = createInitialBattleState()
    const target = state.enemyTeam.find((fighter) => fighter.templateId === 'yuji')
    expect(target).toBeDefined()

    target!.stateCounters.blast_away_bonus = 10
    const pips = getActivePips(target!)
    const baPip = pips.find((pip) => pip.label === 'Blast Away Bonus')
    expect(baPip).toBeDefined()
    expect(baPip?.stackCount).toBe(10)
    expect(baPip?.lines.some((line) => line.text.includes('+10 damage'))).toBe(true)
  })
})
