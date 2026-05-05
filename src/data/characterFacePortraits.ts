// Face portraits are square/headshot assets for site/manual/profile UI.
// Do not map full-body renders here.
//
// TODO: When real face portraits are available, import them here:
// import yujiFace from '@/assets/portraits/faces/yuji.webp'
// export const characterFacePortraits = { yuji: yujiFace }
export const characterFacePortraits: Partial<Record<string, string>> = {}

export function getCharacterFacePortrait(characterId: string): string | undefined {
  return characterFacePortraits[characterId]
}
