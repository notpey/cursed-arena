import { defineAbility } from '@/features/battle/content.ts'
import { createContentSnapshot, readPublishedBattleContent } from '@/features/battle/contentSnapshot.ts'
import { assertValidBattleContent, validateBattleContent } from '@/features/battle/validation.ts'
import type {
  BattlefieldEffect,
  BattleFighterTemplate,
  BattleUserProfile,
} from '@/features/battle/types.ts'

import { yuji } from './content/fighters/yuji.ts'
import { megumi } from './content/fighters/megumi.ts'
import { nobara } from './content/fighters/nobara.ts'
import { junpei } from './content/fighters/junpei.ts'
import { maki } from './content/fighters/maki.ts'
import { panda } from './content/fighters/panda.ts'
import { toge } from './content/fighters/toge.ts'
import { todo } from './content/fighters/todo.ts'
import { miwa } from './content/fighters/miwa.ts'
import { mai } from './content/fighters/mai.ts'
import { momo } from './content/fighters/momo.ts'
import { noritoshi } from './content/fighters/noritoshi.ts'
import { nanami } from './content/fighters/nanami.ts'
import { gojo } from './content/fighters/gojo.ts'
import { yaga } from './content/fighters/yaga.ts'
import { shoko } from './content/fighters/shoko.ts'
import { ijichi } from './content/fighters/ijichi.ts'
import { sukuna } from './content/fighters/sukuna.ts'
import { mahito } from './content/fighters/mahito.ts'
import { jogo } from './content/fighters/jogo.ts'
import { hanami } from './content/fighters/hanami.ts'
import { mechamaru } from './content/fighters/mechamaru.ts'

export const PASS_ABILITY_ID = 'pass'

export const battleBoardProfiles: Record<'player' | 'enemy', BattleUserProfile> = {
  player: {
    username: 'JEREMY',
    title: 'Tokyo Student',
    initials: 'JE',
    accent: 'teal',
  },
  enemy: {
    username: 'APAAP',
    title: 'Academy Student',
    initials: 'AA',
    accent: 'red',
  },
}

export const battlePassAbility = defineAbility({
  id: PASS_ABILITY_ID,
  name: 'Hold Position',
  description: 'Spend this slot to conserve cursed energy and wait for a cleaner opening.',
  kind: 'pass',
  targetRule: 'none',
  classes: ['Instant', 'Unique'],
  icon: { label: 'PA', tone: 'frost' },
  cooldown: 0,
})

export const battlefieldEffect: BattlefieldEffect = {
  id: 'domain-temple',
  name: 'Domain Expansion',
  label: 'Temple Barrier',
  description:
    'Ultimate techniques surge with the barrier. Once the fight drags on, the arena starts crushing both teams with fatigue damage.',
  potency: 67,
  ultimateDamageBoost: 0.12,
  fatigueStartsRound: 7,
}

export const authoredBattleRoster: BattleFighterTemplate[] = [
  yuji,
  megumi,
  nobara,
  junpei,
  maki,
  panda,
  toge,
  todo,
  miwa,
  mai,
  momo,
  noritoshi,
  nanami,
  gojo,
  yaga,
  shoko,
  ijichi,
  sukuna,
  mahito,
  jogo,
  hanami,
  mechamaru,
]

export const authoredDefaultBattleSetup = {
  playerTeamIds: ['yuji', 'nobara', 'megumi'],
  enemyTeamIds: ['yuji', 'nobara', 'megumi'],
}

assertValidBattleContent(authoredBattleRoster, authoredDefaultBattleSetup)

export const authoredBattleContent: ReturnType<typeof createContentSnapshot> = {
  ...createContentSnapshot(authoredBattleRoster, authoredDefaultBattleSetup),
  updatedAt: 0,
}

const publishedBattleContent = readPublishedBattleContent(authoredBattleContent)
const publishedBattleValidation = validateBattleContent(
  publishedBattleContent.roster,
  publishedBattleContent.defaultSetup,
)

if (publishedBattleValidation.errors.length > 0 && typeof console !== 'undefined') {
  console.warn('Ignoring invalid published battle content.', publishedBattleValidation.errors)
}

const runtimeBattleContent =
  publishedBattleValidation.errors.length === 0 ? publishedBattleContent : authoredBattleContent

export const battleRoster: BattleFighterTemplate[] = runtimeBattleContent.roster

export const battleRosterById = Object.fromEntries(
  battleRoster.map((fighterData) => [fighterData.id, fighterData]),
) as Record<string, BattleFighterTemplate>

export const defaultBattleSetup = {
  battlefield: battlefieldEffect,
  playerTeamIds: runtimeBattleContent.defaultSetup.playerTeamIds,
  enemyTeamIds: runtimeBattleContent.defaultSetup.enemyTeamIds,
}
