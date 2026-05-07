import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  CONTENT_SCHEMA_VERSION,
  mergePublishedAssetFieldsIntoAuthoredContent,
  readPublishedBattleContentWithAssetMigration,
  savePublishedBattleContent,
  notifyBattleContentChanged,
  type BattleContentSnapshot,
} from '@/features/battle/contentSnapshot'
import {
  getCurrentBattleContent,
  saveAndBroadcastPublishedBattleContent,
} from '@/features/battle/contentStore'

// ── localStorage + window stub ────────────────────────────────────────────────

const store: Record<string, string> = {}

const localStorageStub = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
}

const dispatchedEvents: string[] = []

const windowStub = {
  localStorage: localStorageStub,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: (event: Event) => {
    dispatchedEvents.push(event.type)
    return true
  },
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]
  dispatchedEvents.length = 0

  Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: windowStub, writable: true, configurable: true })
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFighter(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    shortName: id,
    rarity: 'R' as const,
    role: 'Striker',
    maxHp: 100,
    bio: '',
    affiliationLabel: '',
    facePortrait: undefined as string | undefined,
    boardPortraitSrc: undefined as string | undefined,
    abilities: [
      {
        id: `${id}-ability-1`,
        name: 'Ability 1',
        kind: 'attack' as const,
        targetRule: 'enemy-single' as const,
        classes: ['Melee', 'Physical', 'Action'],
        cooldown: 0,
        description: 'desc',
        energyCost: {},
        effects: [],
        icon: { src: undefined as string | undefined, label: 'A1', tone: 'red' as const },
      },
    ],
    ultimate: {
      id: `${id}-ultimate`,
      name: 'Ultimate',
      kind: 'attack' as const,
      targetRule: 'enemy-all' as const,
      classes: ['Ranged', 'Energy', 'Ultimate'],
      cooldown: 4,
      description: 'ultimate desc',
      energyCost: {},
      effects: [],
      icon: { src: undefined as string | undefined, label: 'UL', tone: 'gold' as const },
    },
    passiveEffects: [
      {
        id: `${id}-passive`,
        label: 'Passive',
        description: 'passive desc',
        effects: [],
        conditions: [],
        icon: { src: undefined as string | undefined, label: 'PA', tone: 'teal' as const },
      },
    ],
    ...overrides,
  }
}

function makeSnapshot(fighters: ReturnType<typeof makeFighter>[], schemaVersion = CONTENT_SCHEMA_VERSION): BattleContentSnapshot {
  return {
    roster: fighters as unknown as BattleContentSnapshot['roster'],
    defaultSetup: { playerTeamIds: [], enemyTeamIds: [] },
    updatedAt: 1000,
    schemaVersion,
  }
}

// ── mergePublishedAssetFieldsIntoAuthoredContent ──────────────────────────────

describe('mergePublishedAssetFieldsIntoAuthoredContent', () => {
  test('merges facePortrait from stale snapshot by fighter id', () => {
    const authored = makeSnapshot([makeFighter('yuji')])
    const stale = makeSnapshot([makeFighter('yuji', { facePortrait: 'https://cdn.example.com/yuji-face.webp' })], 5)

    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, stale)
    expect(merged.roster[0]!.facePortrait).toBe('https://cdn.example.com/yuji-face.webp')
  })

  test('merges boardPortraitSrc from stale snapshot', () => {
    const authored = makeSnapshot([makeFighter('megumi')])
    const stale = makeSnapshot([makeFighter('megumi', { boardPortraitSrc: 'https://cdn.example.com/megumi-board.webp' })], 5)

    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, stale)
    expect(merged.roster[0]!.boardPortraitSrc).toBe('https://cdn.example.com/megumi-board.webp')
  })

  test('merges ability icon.src by ability id', () => {
    const authoredFighter = makeFighter('nobara')
    const staleFighter = makeFighter('nobara')
    staleFighter.abilities[0]!.icon.src = 'https://cdn.example.com/nobara-straw.webp'

    const authored = makeSnapshot([authoredFighter])
    const stale = makeSnapshot([staleFighter], 5)

    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, stale)
    expect(merged.roster[0]!.abilities[0]!.icon.src).toBe('https://cdn.example.com/nobara-straw.webp')
  })

  test('merges ultimate icon.src when ids match', () => {
    const authoredFighter = makeFighter('gojo')
    const staleFighter = makeFighter('gojo')
    staleFighter.ultimate.icon.src = 'https://cdn.example.com/gojo-infinity.webp'

    const authored = makeSnapshot([authoredFighter])
    const stale = makeSnapshot([staleFighter], 5)

    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, stale)
    expect(merged.roster[0]!.ultimate.icon.src).toBe('https://cdn.example.com/gojo-infinity.webp')
  })

  test('merges passive icon.src by passive id', () => {
    const authoredFighter = makeFighter('sukuna')
    const staleFighter = makeFighter('sukuna')
    staleFighter.passiveEffects[0]!.icon.src = 'https://cdn.example.com/sukuna-passive.webp'

    const authored = makeSnapshot([authoredFighter])
    const stale = makeSnapshot([staleFighter], 5)

    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, stale)
    const mergedPassive = merged.roster[0]!.passiveEffects?.[0]
    expect(mergedPassive).toBeDefined()
    expect(mergedPassive!.icon?.src).toBe('https://cdn.example.com/sukuna-passive.webp')
  })

  test('does NOT override authored gameplay fields from stale snapshot', () => {
    const authoredFighter = makeFighter('todo', { maxHp: 120 })
    const staleFighter = { ...makeFighter('todo', { maxHp: 80 }) }
    staleFighter.abilities[0] = {
      ...staleFighter.abilities[0]!,
      cooldown: 99,
      description: 'STALE DESCRIPTION',
      effects: [{ type: 'damage', amount: 999 } as unknown as typeof staleFighter.abilities[0]['effects'][number]],
    }

    const authored = makeSnapshot([authoredFighter])
    const stale = makeSnapshot([staleFighter], 5)

    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, stale)
    const mergedFighter = merged.roster[0]!
    expect((mergedFighter as unknown as { maxHp: number }).maxHp).toBe(120)
    expect(mergedFighter.abilities[0]!.cooldown).toBe(0)
    expect(mergedFighter.abilities[0]!.description).toBe('desc')
    expect(mergedFighter.abilities[0]!.effects).toHaveLength(0)
  })

  test('skips fighter when id not found in stale snapshot', () => {
    const authored = makeSnapshot([makeFighter('nanami')])
    const stale = makeSnapshot([makeFighter('yuji', { facePortrait: 'https://cdn.example.com/yuji-face.webp' })], 5)

    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, stale)
    expect(merged.roster[0]!.facePortrait).toBeUndefined()
  })

  test('returns clone of authored when stale is null', () => {
    const authored = makeSnapshot([makeFighter('miwa')])
    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, null)
    expect(merged.roster).toHaveLength(1)
    expect(merged.roster[0]!.id).toBe('miwa')
  })

  test('rejects data: scheme URLs in stale asset fields', () => {
    const staleFighter = makeFighter('maki', { facePortrait: 'data:image/png;base64,ABC123' })
    const authored = makeSnapshot([makeFighter('maki')])
    const stale = makeSnapshot([staleFighter], 5)

    const merged = mergePublishedAssetFieldsIntoAuthoredContent(authored, stale)
    expect(merged.roster[0]!.facePortrait).toBeUndefined()
  })
})

// ── readPublishedBattleContentWithAssetMigration ──────────────────────────────

describe('readPublishedBattleContentWithAssetMigration', () => {
  test('returns authored fallback when nothing stored', () => {
    const authored = makeSnapshot([makeFighter('yuji')])
    const result = readPublishedBattleContentWithAssetMigration(authored)
    expect(result.roster[0]!.id).toBe('yuji')
  })

  test('returns stored snapshot as-is when schema version matches', () => {
    const authored = makeSnapshot([makeFighter('yuji')])
    const stored = makeSnapshot([makeFighter('yuji', { facePortrait: 'https://cdn.example.com/yuji.webp' })], CONTENT_SCHEMA_VERSION)
    savePublishedBattleContent(stored)

    const result = readPublishedBattleContentWithAssetMigration(authored)
    expect(result.roster[0]!.facePortrait).toBe('https://cdn.example.com/yuji.webp')
  })

  test('merges asset fields from stale snapshot instead of discarding', () => {
    const authored = makeSnapshot([makeFighter('megumi')])
    const stale = makeSnapshot([makeFighter('megumi', { facePortrait: 'https://cdn.example.com/megumi.webp' })], CONTENT_SCHEMA_VERSION - 1)
    savePublishedBattleContent(stale)

    const result = readPublishedBattleContentWithAssetMigration(authored)
    expect(result.roster[0]!.facePortrait).toBe('https://cdn.example.com/megumi.webp')
  })
})

// ── notifyBattleContentChanged ────────────────────────────────────────────────

describe('notifyBattleContentChanged', () => {
  test('dispatches the battle-content-changed event on window', () => {
    notifyBattleContentChanged()
    expect(dispatchedEvents).toContain('battle-content-changed')
  })
})

// ── saveAndBroadcastPublishedBattleContent ────────────────────────────────────

describe('saveAndBroadcastPublishedBattleContent', () => {
  test('getCurrentBattleContent returns updated content after broadcast', () => {
    const snapshot = makeSnapshot([makeFighter('yuji', { facePortrait: 'https://cdn.example.com/yuji.webp' })])
    saveAndBroadcastPublishedBattleContent(snapshot)

    const current = getCurrentBattleContent()
    expect(current).not.toBeNull()
    expect(current!.roster[0]!.facePortrait).toBe('https://cdn.example.com/yuji.webp')
  })

  test('dispatches battle-content-changed event on publish', () => {
    const snapshot = makeSnapshot([makeFighter('nobara')])
    saveAndBroadcastPublishedBattleContent(snapshot)
    expect(dispatchedEvents).toContain('battle-content-changed')
  })

  test('persists to localStorage on publish', () => {
    const snapshot = makeSnapshot([makeFighter('gojo', { facePortrait: 'https://cdn.example.com/gojo.webp' })])
    saveAndBroadcastPublishedBattleContent(snapshot)

    const stored = localStorageStub.getItem(`ca-battle-content-published-v${CONTENT_SCHEMA_VERSION}`)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!) as BattleContentSnapshot
    expect(parsed.roster[0]!.facePortrait).toBe('https://cdn.example.com/gojo.webp')
  })
})

// ── initBattleContentStore ────────────────────────────────────────────────────

describe('initBattleContentStore', () => {
  test('after saveAndBroadcast, getCurrentBattleContent reflects new content', () => {
    // saveAndBroadcast is the write path that init also uses internally;
    // we verify the read path (getCurrentBattleContent) stays consistent.
    const first = makeSnapshot([makeFighter('yuji', { facePortrait: 'https://cdn.example.com/yuji.webp' })])
    saveAndBroadcastPublishedBattleContent(first)
    expect(getCurrentBattleContent()!.roster[0]!.facePortrait).toBe('https://cdn.example.com/yuji.webp')

    const second = makeSnapshot([makeFighter('yuji', { facePortrait: 'https://cdn.example.com/yuji-v2.webp' })])
    saveAndBroadcastPublishedBattleContent(second)
    expect(getCurrentBattleContent()!.roster[0]!.facePortrait).toBe('https://cdn.example.com/yuji-v2.webp')
  })
})
