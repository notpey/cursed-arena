export function normalizeBattleAssetSrc(value: unknown) {
  if (typeof value !== 'string') return undefined

  const src = value.trim()
  if (!src) return undefined

  return src.replace('/storage/v1/object/game-assets/', '/storage/v1/object/public/game-assets/')
}
