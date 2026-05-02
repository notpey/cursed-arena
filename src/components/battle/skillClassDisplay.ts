import type { BattleAbilityTemplate, BattleSkillClass } from '@/features/battle/types'

const skillClassDisplayOrder: BattleSkillClass[] = [
  'Physical',
  'Energy',
  'Affliction',
  'Mental',
  'Melee',
  'Ranged',
  'Instant',
  'Action',
  'Control',
  'Unique',
  'Ultimate',
  'Strategic',
  'Special',
]

export function formatSkillClasses(ability: BattleAbilityTemplate): string {
  const classes = [...ability.classes].sort(
    (left, right) => skillClassDisplayOrder.indexOf(left) - skillClassDisplayOrder.indexOf(right),
  )
  return classes.length > 0 ? Array.from(new Set(classes)).join(', ') : 'NONE'
}
