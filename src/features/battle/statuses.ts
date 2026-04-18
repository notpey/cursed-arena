import type { BattleStatus, BattleStatusKind, BattleStatuses } from '@/features/battle/types.ts'

export function createStatuses(): BattleStatuses {
  return []
}

export function cloneStatuses(statuses: BattleStatuses): BattleStatuses {
  return statuses.map((status) => ({ ...status }))
}

export function getStatus(statuses: BattleStatuses, kind: BattleStatusKind): BattleStatus | null {
  return statuses.find((status) => status.kind === kind) ?? null
}

export function getStatusDuration(statuses: BattleStatuses, kind: BattleStatusKind) {
  return getStatus(statuses, kind)?.duration ?? 0
}

export function hasStatus(statuses: BattleStatuses, kind: BattleStatusKind) {
  return getStatusDuration(statuses, kind) > 0
}

export function getMarkBonus(statuses: BattleStatuses) {
  const status = getStatus(statuses, 'mark')
  return status?.kind === 'mark' ? status.bonus : 0
}

export function getBurnDamage(statuses: BattleStatuses) {
  const status = getStatus(statuses, 'burn')
  return status?.kind === 'burn' ? status.damage : 0
}

export function getAttackUpAmount(statuses: BattleStatuses) {
  const status = getStatus(statuses, 'attackUp')
  return status?.kind === 'attackUp' ? status.amount : 0
}

export function upsertStatus(statuses: BattleStatuses, next: BattleStatus): BattleStatuses {
  const current = getStatus(statuses, next.kind)
  const remaining = statuses.filter((status) => status.kind !== next.kind)

  if (!current) return [...remaining, next]

  if (next.kind === 'stun' || next.kind === 'invincible') {
    return [...remaining, { kind: next.kind, duration: Math.max(current.duration, next.duration) }]
  }

  if (next.kind === 'mark') {
    return [
      ...remaining,
      {
        kind: 'mark',
        duration: Math.max(current.kind === 'mark' ? current.duration : 0, next.duration),
        bonus: Math.max(current.kind === 'mark' ? current.bonus : 0, next.bonus),
      },
    ]
  }

  if (next.kind === 'burn') {
    return [
      ...remaining,
      {
        kind: 'burn',
        duration: Math.max(current.kind === 'burn' ? current.duration : 0, next.duration),
        damage: Math.max(current.kind === 'burn' ? current.damage : 0, next.damage),
      },
    ]
  }

  return [
    ...remaining,
    {
      kind: 'attackUp',
      duration: Math.max(current.kind === 'attackUp' ? current.duration : 0, next.duration),
      amount: Math.max(current.kind === 'attackUp' ? current.amount : 0, next.amount),
    },
  ]
}

export function tickStatuses(statuses: BattleStatuses): BattleStatuses {
  return statuses
    .map((status) => ({ ...status, duration: Math.max(0, status.duration - 1) }))
    .filter((status) => status.duration > 0)
}
