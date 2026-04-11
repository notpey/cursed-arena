export const featureFlags = {
  inventorySystem: false,
} as const

export function isFeatureEnabled(feature: keyof typeof featureFlags) {
  return featureFlags[feature]
}
