import type {
  BattleAbilityIcon,
  BattleAbilityTemplate,
  BattleBoardAccent,
  BattleFighterTemplate,
  PassiveEffect,
  SkillEffect,
} from '@/features/battle/types.ts'

export type BattleAbilityDraft = Omit<BattleAbilityTemplate, 'icon'> & {
  icon?: Partial<BattleAbilityIcon>
}

export type BattleFighterBoardMeta = Pick<
  BattleFighterTemplate,
  'affiliationLabel' | 'battleTitle' | 'bio'
> & {
  facePortrait?: string
  boardPortraitFrame?: BattleFighterTemplate['boardPortraitFrame']
  boardPortraitSrc?: string
}

export type BattleFighterDraft = Omit<
  BattleFighterTemplate,
  'affiliationLabel' | 'battleTitle' | 'bio' | 'facePortrait' | 'boardPortraitSrc' | 'boardPortraitFrame'
>

function deriveAbilityLabel(name: string) {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

function resolveAbilityTone(kind: BattleAbilityTemplate['kind'], isUltimate = false): BattleBoardAccent {
  if (isUltimate) return 'gold'
  if (kind === 'heal') return 'teal'
  if (kind === 'debuff') return 'red'
  if (kind === 'buff' || kind === 'defend' || kind === 'utility') return 'teal'
  if (kind === 'pass') return 'frost'
  return 'red'
}

function createAbilityIcon(template: Pick<BattleAbilityTemplate, 'name' | 'kind' | 'classes'>): BattleAbilityIcon {
  return {
    label: deriveAbilityLabel(template.name),
    tone: resolveAbilityTone(template.kind, template.classes.includes('Ultimate')),
  }
}

function resolveInheritedTarget(rule: BattleAbilityTemplate['targetRule']): SkillEffect['target'] {
  if (rule === 'self') return 'self'
  if (rule === 'ally-all') return 'all-allies'
  if (rule === 'enemy-all') return 'all-enemies'
  return 'inherit'
}

export function definePassive(passive: Omit<PassiveEffect, 'id'> & { id?: string }): PassiveEffect {
  const id = passive.id ?? passive.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const icon: BattleAbilityIcon = passive.icon ?? {
    label: deriveAbilityLabel(passive.label),
    tone: 'teal',
  }
  return { ...passive, id, icon }
}

export function defineAbility(template: BattleAbilityDraft): BattleAbilityTemplate {
  const icon = createAbilityIcon(template)

  return {
    ...template,
    effects: template.effects ?? [],
    icon: {
      ...icon,
      ...template.icon,
    },
  }
}

export function damageSkill(
  template: Omit<BattleAbilityDraft, 'kind' | 'effects'> & { effects?: SkillEffect[] },
): BattleAbilityTemplate {
  return defineAbility({
    ...template,
    kind: 'attack',
    effects:
      template.effects ??
      (typeof template.power === 'number'
        ? [{ type: 'damage', power: template.power, target: resolveInheritedTarget(template.targetRule) }]
        : []),
  })
}

export function healSkill(
  template: Omit<BattleAbilityDraft, 'kind' | 'effects'> & { effects?: SkillEffect[] },
): BattleAbilityTemplate {
  return defineAbility({
    ...template,
    kind: 'heal',
    effects:
      template.effects ??
      (typeof template.healPower === 'number'
        ? [{ type: 'heal', power: template.healPower, target: resolveInheritedTarget(template.targetRule) }]
        : []),
  })
}

export function buffSkill(
  template: Omit<BattleAbilityDraft, 'kind' | 'effects'> & { amount: number; duration: number; effects?: SkillEffect[] },
): BattleAbilityTemplate {
  return defineAbility({
    ...template,
    kind: 'buff',
    attackBuffAmount: template.attackBuffAmount ?? template.amount,
    statusTurns: template.statusTurns ?? template.duration,
    effects:
      template.effects ?? [{ type: 'attackUp', amount: template.amount, duration: template.duration, target: resolveInheritedTarget(template.targetRule) }],
  })
}

export function defendSkill(
  template: Omit<BattleAbilityDraft, 'kind' | 'effects'> & { duration: number; effects?: SkillEffect[] },
): BattleAbilityTemplate {
  return defineAbility({
    ...template,
    kind: 'defend',
    effects:
      template.effects ?? [{ type: 'invulnerable', duration: template.duration, target: resolveInheritedTarget(template.targetRule) }],
  })
}

export function debuffSkill(
  template: Omit<BattleAbilityDraft, 'kind' | 'effects'> & { effects: SkillEffect[] },
): BattleAbilityTemplate {
  return defineAbility({
    ...template,
    kind: 'debuff',
    effects: template.effects,
  })
}

export function utilitySkill(
  template: Omit<BattleAbilityDraft, 'kind'>,
): BattleAbilityTemplate {
  return defineAbility({
    ...template,
    kind: 'utility',
  })
}

export function defineFighter(
  template: BattleFighterDraft,
  boardMeta: BattleFighterBoardMeta,
): BattleFighterTemplate {
  return {
    ...template,
    affiliationLabel: boardMeta.affiliationLabel,
    battleTitle: boardMeta.battleTitle,
    bio: boardMeta.bio,
    facePortrait: boardMeta.facePortrait ?? '',
    boardPortraitSrc: boardMeta.boardPortraitSrc ?? '',
    boardPortraitFrame: boardMeta.boardPortraitFrame ?? template.portraitFrame,
  }
}

