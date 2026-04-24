import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { BattleContentSnapshot } from '@/features/battle/contentSnapshot.ts'

const mockedGetSupabaseClient = vi.hoisted(() => vi.fn())
const mockedSavePublishedBattleContent = vi.hoisted(() => vi.fn((snapshot: BattleContentSnapshot) => snapshot))
const mockedReadPublishedBattleContent = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase.ts', () => ({
  getSupabaseClient: mockedGetSupabaseClient,
}))

vi.mock('@/features/battle/contentSnapshot.ts', () => ({
  createContentSnapshot: vi.fn(),
  clearDraftBattleContent: vi.fn(),
  clearPublishedBattleContent: vi.fn(),
  readDraftBattleContent: vi.fn(),
  readPublishedBattleContent: mockedReadPublishedBattleContent,
  saveDraftBattleContent: vi.fn(),
  savePublishedBattleContent: mockedSavePublishedBattleContent,
}))

function createSnapshot(updatedAt = 1): BattleContentSnapshot {
  return {
    roster: [],
    defaultSetup: {
      playerTeamIds: ['yuji', 'megumi', 'nobara'],
      enemyTeamIds: ['gojo', 'jogo', 'mahito'],
    },
    updatedAt,
  }
}

describe('contentStore publish smoke', () => {
  beforeEach(() => {
    vi.resetModules()
    mockedGetSupabaseClient.mockReset()
    mockedSavePublishedBattleContent.mockClear()
    mockedReadPublishedBattleContent.mockReset()
  })

  test('falls back to local mode when Supabase is unavailable', async () => {
    mockedGetSupabaseClient.mockReturnValue(null)
    const { publishBattleContent } = await import('@/features/battle/contentStore')

    const result = await publishBattleContent(createSnapshot())

    expect(result.mode).toBe('local')
    expect(mockedSavePublishedBattleContent).toHaveBeenCalledTimes(1)
    expect(mockedSavePublishedBattleContent).toHaveBeenCalledWith(expect.objectContaining({
      defaultSetup: expect.objectContaining({
        playerTeamIds: ['yuji', 'megumi', 'nobara'],
      }),
    }))
  })

  test('publishes in remote mode when Supabase confirms the write', async () => {
    const confirmedSnapshot = createSnapshot(999)
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { content: confirmedSnapshot }, error: null })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ upsert, select })
    mockedGetSupabaseClient.mockReturnValue({ from })

    const { publishBattleContent } = await import('@/features/battle/contentStore')
    const result = await publishBattleContent(createSnapshot())

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledWith('content')
    expect(result.mode).toBe('remote')
    expect(result.snapshot).toEqual(confirmedSnapshot)
    expect(mockedSavePublishedBattleContent).toHaveBeenCalledWith(confirmedSnapshot)
  })
})
