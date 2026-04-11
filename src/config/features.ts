export type AdminAccessMode = 'public' | 'role'

export const featureFlags = {
  inventorySystem: false,
} as const

export const adminPanelConfig = {
  visibleInNav: true,
  accessMode: 'role' as AdminAccessMode,
  allowedRoles: ['admin'] as const,
} as const

export type AdminRole = (typeof adminPanelConfig.allowedRoles)[number]

export function isFeatureEnabled(feature: keyof typeof featureFlags) {
  return featureFlags[feature]
}

export function canAccessAdminPanel(role?: string | null) {
  return !!role && adminPanelConfig.allowedRoles.includes(role as AdminRole)
}
