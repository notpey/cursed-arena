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
    const ritual = nobara?.abilities.find((ability) => ability.id === 'nobara-straw-doll-ritual')
    const nue = megumi?.abilities.find((ability) => ability.id === 'megumi-nue')

    const ritualHealModifier = ritual?.effects?.find(
      (effect) => effect.type === 'addModifier' && effect.modifier.stat === 'healTaken',
    )
    const nueClassStun = nue?.effects?.find((effect) => effect.type === 'classStun')

    expect(ritual?.description.toLowerCase()).toContain('stacks')
    expect(ritualHealModifier?.type === 'addModifier' ? ritualHealModifier.modifier.stacking : null).toBe('stack')
    expect(nue?.description).toContain('non-Mental')
    expect(nueClassStun?.type === 'classStun' ? nueClassStun.exemptClasses : []).toContain('Mental')
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

  test('passive tracker pips only appear when their counter is active', () => {
    const state = createInitialBattleState()
    const yuji = state.playerTeam.find((fighter) => fighter.templateId === 'yuji')
    expect(yuji).toBeDefined()

    expect(getActivePips(yuji!).some((pip) => pip.label === "Sukuna's Vessel")).toBe(false)

    yuji!.stateCounters.sukuna_bonus_hp = 10
    const pips = getActivePips(yuji!)

    const vessel = pips.find((pip) => pip.label === "Sukuna's Vessel")
    expect(vessel?.stackCount).toBe(10)
    expect(vessel?.lines.some((line) => line.text.includes('Transformation bonus: +10 HP'))).toBe(true)
    expect(vessel?.lines.some((line) => line.text === yuji!.passiveEffects?.[0]?.description)).toBe(true)
    expect(vessel?.lines.some((line) => line.text.includes('sukuna_vessel_used'))).toBe(false)
    expect(vessel?.lines.some((line) => line.text.includes('Unknown effect'))).toBe(false)
  })
})
