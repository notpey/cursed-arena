import type {
  BattleAbilityIcon,
  BattleAbilityTemplate,
  BattleBoardAccent,
  BattleFighterTemplate,
  PassiveEffect,
  SkillEffect,
} from '@/features/battle/types'

export type BattleAbilityDraft = Omit<BattleAbilityTemplate, 'icon'> & {
  icon?: Partial<BattleAbilityIcon>
}

export type BattleFighterBoardMeta = Pick<
  BattleFighterTemplate,
  'affiliationLabel' | 'battleTitle' | 'bio'
> & {
  boardPortraitFrame?: BattleFighterTemplate['boardPortraitFrame']
  boardPortraitSrc?: string
}

export type BattleFighterDraft = Omit<
  BattleFighterTemplate,
  'affiliationLabel' | 'battleTitle' | 'bio' | 'boardPortraitSrc' | 'boardPortraitFrame'
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

function resolveAbilityTone(kind: BattleAbilityTemplate['kind'], tags: BattleAbilityTemplate['tags']): BattleBoardAccent {
  if (tags.includes('ULT')) return 'gold'
  if (kind === 'heal' || tags.includes('HEAL')) return 'teal'
  if (kind === 'debuff' || tags.includes('DEBUFF')) return 'red'
  if (kind === 'buff' || kind === 'defend' || kind === 'utility' || tags.includes('UTILITY')) return 'teal'
  if (kind === 'pass') return 'frost'
  return 'red'
}

function createAbilityIcon(template: Pick<BattleAbilityTemplate, 'name' | 'kind' | 'tags'>): BattleAbilityIcon {
  return {
    label: deriveAbilityLabel(template.name),
    tone: resolveAbilityTone(template.kind, template.tags),
  }
}

function resolveInheritedTarget(rule: BattleAbilityTemplate['targetRule']): SkillEffect['target'] {
  if (rule === 'self') return 'self'
  if (rule === 'ally-all') return 'all-allies'
  if (rule === 'enemy-all') return 'all-enemies'
  return 'inherit'
}

export function definePassive(passive: PassiveEffect): PassiveEffect {
  return passive
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
    boardPortraitSrc: boardMeta.boardPortraitSrc ?? template.renderSrc,
    boardPortraitFrame: boardMeta.boardPortraitFrame ?? template.portraitFrame,
  }
}
