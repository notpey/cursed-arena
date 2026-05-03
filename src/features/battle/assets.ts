import { normalizeImageUrl } from '@/features/images/imageUrl'

export function normalizeBattleAssetSrc(value: unknown): string | undefined {
  return normalizeImageUrl(value)
}
