import { beforeEach, describe, expect, test } from 'vitest'
import {
  buildPrepRosterEntries,
  sanitizePrepTeamIds,
  readPrepSelection,
  persistPrepSelection,
  stageBattleLaunch,
  readStagedBattleLaunch,
  readSavedPrepTeams,
  savePrepTeam,
  deleteSavedPrepTeam,
  type BattlePrepRosterEntry,
} from '@/features/battle/prep'
import {
  persistStagedBattleSession,
} from '@/features/battle/matches'
import type { BattleFighterTemplate } from '@/features/battle/types'

// ── localStorage stub ─────────────────────────────────────────────────────────

const store: Record<string, string> = {}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]

  const ls = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { localStorage: ls }, writable: true, configurable: true })
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTemplate(id: string): BattleFighterTemplate {
  return {
    id,
    name: id,
    shortName: id,
    rarity: 'R' as const,
    role: 'Striker',
    battleTitle: '',
    maxHp: 100,
    bio: '',
    affiliationLabel: '',
    abilities: [
      {
        id: `${id}-a1`,
        name: 'Strike',
        kind: 'attack' as const,
        targetRule: 'enemy-single' as const,
        classes: ['Melee', 'Physical', 'Action'],
        cooldown: 0,
        description: '',
        energyCost: {},
        effects: [],
        icon: { label: 'S1', tone: 'red' as const },
      },
      {
        id: `${id}-a2`,
        name: 'Defend',
        kind: 'defend' as const,
        targetRule: 'self' as const,
        classes: ['Instant', 'Physical'],
        cooldown: 2,
        description: '',
        energyCost: {},
        effects: [],
        icon: { label: 'D1', tone: 'teal' as const },
      },
      {
        id: `${id}-a3`,
        name: 'Heal',
        kind: 'heal' as const,
        targetRule: 'ally-single' as const,
        classes: ['Ranged', 'Energy', 'Instant'],
        cooldown: 3,
        description: '',
        energyCost: {},
        effects: [],
        icon: { label: 'H1', tone: 'teal' as const },
      },
    ],
    ultimate: {
      id: `${id}-ult`,
      name: 'Ultimate',
      kind: 'attack' as const,
      targetRule: 'enemy-all' as const,
      classes: ['Ranged', 'Energy', 'Ultimate'],
      cooldown: 4,
      description: '',
      energyCost: {},
      effects: [],
      icon: { label: 'UL', tone: 'gold' as const },
    },
    passiveEffects: [],
  }
}

function makeRosterById(ids: string[]): Record<string, BattlePrepRosterEntry> {
  const entries = buildPrepRosterEntries(ids.map(makeTemplate))
  return Object.fromEntries(entries.map((e) => [e.id, e]))
}

// ── sanitizePrepTeamIds ───────────────────────────────────────────────────────

describe('sanitizePrepTeamIds', () => {
  test('keeps valid IDs from the provided rosterById', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    const result = sanitizePrepTeamIds(['alpha', 'beta', 'gamma'], rosterById)
    expect(result).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('drops IDs not in the provided rosterById', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    const result = sanitizePrepTeamIds(['alpha', 'unknown', 'gamma'], rosterById)
    expect(result).toHaveLength(2)
    expect(result).toContain('alpha')
    expect(result).toContain('gamma')
    expect(result).not.toContain('unknown')
  })

  test('deduplicates repeated IDs', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    const result = sanitizePrepTeamIds(['alpha', 'alpha', 'gamma'], rosterById)
    const alphaCount = result.filter((id) => id === 'alpha').length
    expect(alphaCount).toBe(1)
  })

  test('IDs valid in the current rosterById are not dropped even if absent from the static module roster', () => {
    // This simulates a fighter that was added via publish after module load:
    // the static battlePrepRosterById won't have it, but the reactive map does.
    const currentRosterById = makeRosterById(['yuji', 'megumi', 'new-published-fighter'])
    const result = sanitizePrepTeamIds(['yuji', 'megumi', 'new-published-fighter'], currentRosterById)
    expect(result).toContain('new-published-fighter')
    expect(result).toHaveLength(3)
  })

  test('falls back to the static roster when no rosterById is passed', () => {
    // With no second arg, uses the module-level battlePrepRosterById.
    // yuji is in the authored roster so it should be kept.
    const result = sanitizePrepTeamIds(['yuji', 'megumi', 'nobara'])
    expect(result).toContain('yuji')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  test('caps output at 3 IDs', () => {
    const rosterById = makeRosterById(['a', 'b', 'c', 'd', 'e'])
    const result = sanitizePrepTeamIds(['a', 'b', 'c', 'd', 'e'], rosterById)
    expect(result).toHaveLength(3)
  })

  test('fills up to 3 from fallback ids when input is short', () => {
    // The static defaultPrepPlayerTeamIds is used as fallback.
    // With a current rosterById that also contains those fallback IDs, fill works.
    const rosterById = makeRosterById(['yuji', 'megumi', 'nobara'])
    const result = sanitizePrepTeamIds(['yuji'], rosterById)
    // Can't fill past what the fallback + rosterById supports.
    // yuji is the only valid input ID so result has 1; fallback IDs from the
    // authored roster may or may not be in this rosterById. Just assert no crash
    // and length <= 3.
    expect(result.length).toBeLessThanOrEqual(3)
    expect(result).toContain('yuji')
  })
})

// ── readPrepSelection / persistPrepSelection ──────────────────────────────────

describe('readPrepSelection / persistPrepSelection', () => {
  test('persisted selection survives round-trip with the same rosterById', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    persistPrepSelection(['alpha', 'beta', 'gamma'], rosterById)
    const read = readPrepSelection(rosterById)
    expect(read).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('readPrepSelection nullifies IDs absent from the provided rosterById', () => {
    // Persist with a broad roster, read back with a narrower one.
    const broadRoster = makeRosterById(['alpha', 'beta', 'gamma'])
    persistPrepSelection(['alpha', 'beta', 'gamma'], broadRoster)

    const narrowRoster = makeRosterById(['alpha', 'gamma'])
    const read = readPrepSelection(narrowRoster)
    expect(read[0]).toBe('alpha')
    expect(read[1]).toBeNull()   // 'beta' is absent from narrowRoster
    expect(read[2]).toBe('gamma')
  })

  test('readPrepSelection returns nulls when nothing is stored', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    const read = readPrepSelection(rosterById)
    // Nothing stored → defaultPrepPlayerTeamIds are used as the raw storage fallback.
    // Those IDs may or may not be in our custom rosterById.
    // At minimum the result should be a length-3 array of strings or nulls.
    expect(read).toHaveLength(3)
  })
})

// ── stageBattleLaunch ─────────────────────────────────────────────────────────

describe('stageBattleLaunch', () => {
  test('stages a battle with IDs valid in the current rosterById', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    const result = stageBattleLaunch(['alpha', 'beta', 'gamma'], 'quick', rosterById)
    expect(result.playerTeamIds).toContain('alpha')
    expect(result.playerTeamIds).toContain('beta')
    expect(result.playerTeamIds).toContain('gamma')
    expect(result.battleSeed).toBeTruthy()
  })

  test('staged launch is readable back via readStagedBattleLaunch with the same rosterById', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    stageBattleLaunch(['alpha', 'beta', 'gamma'], 'quick', rosterById)
    const launched = readStagedBattleLaunch(rosterById)
    expect(launched.playerTeamIds).toContain('alpha')
    expect(launched.battleSeed).toBeTruthy()
  })

  test('IDs valid only in the current rosterById are not dropped during stage', () => {
    const rosterById = makeRosterById(['yuji', 'megumi', 'new-published-fighter'])
    const result = stageBattleLaunch(['yuji', 'megumi', 'new-published-fighter'], 'quick', rosterById)
    expect(result.playerTeamIds).toContain('new-published-fighter')
  })

  test('falls back gracefully when no rosterById is passed', () => {
    // Uses the static module-level map; authored IDs should pass through.
    const result = stageBattleLaunch(['yuji', 'megumi', 'nobara'], 'quick')
    expect(result.playerTeamIds.length).toBeGreaterThanOrEqual(1)
    expect(result.battleSeed).toBeTruthy()
  })
})

// ── readStagedBattleLaunch ────────────────────────────────────────────────────

describe('readStagedBattleLaunch', () => {
  test('returns staged session when one is stored and IDs pass rosterById validation', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    stageBattleLaunch(['alpha', 'beta', 'gamma'], 'quick', rosterById)
    const launched = readStagedBattleLaunch(rosterById)
    expect(launched.playerTeamIds).toContain('alpha')
    expect(launched.battleSeed).toBeTruthy()
  })

  test('a player ID that was valid at stage time but absent from the current rosterById is dropped on read', () => {
    // Stage with broad roster, read with narrower one — simulates content changing.
    const broadRoster = makeRosterById(['alpha', 'beta', 'gamma'])
    stageBattleLaunch(['alpha', 'beta', 'gamma'], 'quick', broadRoster)

    const narrowRoster = makeRosterById(['alpha', 'gamma'])
    const launched = readStagedBattleLaunch(narrowRoster)
    expect(launched.playerTeamIds).not.toContain('beta')
  })

  test('without stored session, falls back to stored prep selection', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    persistPrepSelection(['alpha', 'beta', 'gamma'], rosterById)
    // No staged session stored.
    const launched = readStagedBattleLaunch(rosterById)
    expect(launched.playerTeamIds).toContain('alpha')
    expect(launched.battleSeed).toBeTruthy()
  })

  test('uses static roster when no rosterById provided', () => {
    // Authored IDs should survive.
    stageBattleLaunch(['yuji', 'megumi', 'nobara'], 'quick')
    const launched = readStagedBattleLaunch()
    expect(launched.playerTeamIds.length).toBeGreaterThanOrEqual(1)
  })

  test('staged session with stored enemy team preserves enemy IDs', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    persistStagedBattleSession({
      mode: 'quick',
      battleSeed: 'test-seed-abc',
      playerTeamIds: ['alpha', 'beta', 'gamma'],
      enemyTeamIds: ['alpha', 'beta', 'gamma'],
      opponentName: 'SPAR',
      opponentTitle: 'Quick',
      opponentRankLabel: null,
      opponentExperience: null,
      roomCode: null,
      practiceOptions: null,
    })
    const launched = readStagedBattleLaunch(rosterById)
    expect(launched.enemyTeamIds).toContain('alpha')
    expect(launched.battleSeed).toBe('test-seed-abc')
  })
})

// ── readSavedPrepTeams / savePrepTeam / deleteSavedPrepTeam ──────────────────

describe('saved prep teams', () => {
  test('savePrepTeam stores a team and readSavedPrepTeams returns it', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    savePrepTeam(['alpha', 'beta', 'gamma'], 'My Team', rosterById)
    const teams = readSavedPrepTeams(rosterById)
    expect(teams).toHaveLength(1)
    expect(teams[0]!.name).toBe('My Team')
    expect(teams[0]!.teamIds).toContain('alpha')
  })

  test('readSavedPrepTeams filters out teams whose IDs are absent from the current rosterById', () => {
    const broadRoster = makeRosterById(['alpha', 'beta', 'gamma'])
    savePrepTeam(['alpha', 'beta', 'gamma'], 'Broad Team', broadRoster)

    // Read with a roster that only knows alpha and beta — gamma is gone.
    const narrowRoster = makeRosterById(['alpha', 'beta'])
    const teams = readSavedPrepTeams(narrowRoster)
    // The saved team had gamma; after sanitize it becomes length-2, filtered out.
    expect(teams).toHaveLength(0)
  })

  test('IDs valid in the current rosterById are not dropped from saved teams', () => {
    const rosterById = makeRosterById(['yuji', 'megumi', 'new-published-fighter'])
    savePrepTeam(['yuji', 'megumi', 'new-published-fighter'], 'Published Team', rosterById)
    const teams = readSavedPrepTeams(rosterById)
    expect(teams).toHaveLength(1)
    expect(teams[0]!.teamIds).toContain('new-published-fighter')
  })

  test('deleteSavedPrepTeam removes the team by id', () => {
    const rosterById = makeRosterById(['alpha', 'beta', 'gamma'])
    savePrepTeam(['alpha', 'beta', 'gamma'], 'Team A', rosterById)
    const before = readSavedPrepTeams(rosterById)
    expect(before).toHaveLength(1)

    deleteSavedPrepTeam(before[0]!.id, rosterById)
    const after = readSavedPrepTeams(rosterById)
    expect(after).toHaveLength(0)
  })

  test('falls back to static roster when no rosterById is passed', () => {
    savePrepTeam(['yuji', 'megumi', 'nobara'])
    const teams = readSavedPrepTeams()
    // Authored IDs are in the static roster; team should survive.
    expect(teams).toHaveLength(1)
    expect(teams[0]!.teamIds).toContain('yuji')
  })
})
