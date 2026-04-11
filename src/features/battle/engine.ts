import {
  PASS_ABILITY_ID,
  battlePassAbility,
  battleRosterById,
  defaultBattleSetup,
} from '@/features/battle/data'
import {
  battleEnergyOrder,
  canPayEnergy,
  createRoundEnergyPool,
  getAbilityEnergyCost,
  refreshRoundEnergy,
  setEnergyFocus,
  spendEnergy,
  type BattleEnergyType,
} from '@/features/battle/energy'
import { createSeededRandom } from '@/features/battle/random'
import type {
  BattleAbilityTemplate,
  BattleEvent,
  BattleEventTone,
  BattleFighterState,
  BattleState,
  BattleStatuses,
  BattleTeamId,
  PassiveEffect,
  QueuedBattleAction,
  SkillEffect,
} from '@/features/battle/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStatuses(): BattleStatuses {
  return {
    stun: 0,
    invincible: 0,
    markTurns: 0,
    markBonus: 0,
    burnTurns: 0,
    burnDamage: 0,
    attackUpTurns: 0,
    attackUpAmount: 0,
  }
}

function cloneFighter(fighter: BattleFighterState): BattleFighterState {
  return {
    ...fighter,
    abilities: fighter.abilities.map((ability) => ({ ...ability })),
    ultimate: { ...fighter.ultimate },
    cooldowns: { ...fighter.cooldowns },
    statuses: { ...fighter.statuses },
  }
}

function cloneState(state: BattleState): BattleState {
  return {
    ...state,
    battlefield: { ...state.battlefield },
    playerEnergy: { ...state.playerEnergy },
    enemyEnergy: { ...state.enemyEnergy },
    playerTeam: state.playerTeam.map(cloneFighter),
    enemyTeam: state.enemyTeam.map(cloneFighter),
  }
}

function instantiateTeam(team: BattleTeamId, templateIds: string[]) {
  return templateIds
    .map((templateId, slot) => {
      const template = battleRosterById[templateId]
      if (!template) return null

      return {
        instanceId: `${team}-${template.id}-${slot}`,
        templateId: template.id,
        team,
        slot,
        name: template.name,
        shortName: template.shortName,
        rarity: template.rarity,
        role: template.role,
        affiliationLabel: template.affiliationLabel,
        battleTitle: template.battleTitle,
        bio: template.bio,
        renderSrc: template.renderSrc,
        boardPortraitSrc: template.boardPortraitSrc,
        portraitFrame: template.portraitFrame,
        boardPortraitFrame: template.boardPortraitFrame,
        maxHp: template.maxHp,
        hp: template.maxHp,
        passiveEffects: template.passiveEffects,
        abilities: template.abilities.map((ability) => ({ ...ability })),
        ultimate: { ...template.ultimate },
        cooldowns: Object.fromEntries(
          template.abilities.concat(template.ultimate).map((ability) => [ability.id, 0]),
        ),
        statuses: createStatuses(),
      }
    })
    .filter(Boolean) as BattleFighterState[]
}

// ---------------------------------------------------------------------------
// Coin flip
// ---------------------------------------------------------------------------

export function coinFlip(seed = 'default-battle-seed'): BattleTeamId {
  return createSeededRandom(seed)() < 0.5 ? 'player' : 'enemy'
}

function getSecondPlayer(first: BattleTeamId): BattleTeamId {
  return first === 'player' ? 'enemy' : 'player'
}

// ---------------------------------------------------------------------------
// State creation
// ---------------------------------------------------------------------------

type BattleStateSetup = Partial<typeof defaultBattleSetup> & {
  battleSeed?: string
}

export function createInitialBattleState(setupOverrides?: BattleStateSetup): BattleState {
  const setup = {
    battlefield: { ...defaultBattleSetup.battlefield, ...(setupOverrides?.battlefield ?? {}) },
    playerTeamIds: setupOverrides?.playerTeamIds ?? defaultBattleSetup.playerTeamIds,
    enemyTeamIds: setupOverrides?.enemyTeamIds ?? defaultBattleSetup.enemyTeamIds,
    battleSeed: setupOverrides?.battleSeed ?? 'default-battle-seed',
  }
  const playerTeam = instantiateTeam('player', setup.playerTeamIds)
  const enemyTeam = instantiateTeam('enemy', setup.enemyTeamIds)
  const first = coinFlip(`${setup.battleSeed}:initiative`)

  return {
    round: 1,
    phase: 'firstPlayerCommand',
    firstPlayer: first,
    activePlayer: first,
    battlefield: setup.battlefield,
    playerEnergy: createRoundEnergyPool(playerTeam.filter(isAlive).length, pickPreferredFocusType(playerTeam)),
    enemyEnergy: createRoundEnergyPool(enemyTeam.filter(isAlive).length, pickPreferredFocusType(enemyTeam)),
    playerTeam,
    enemyTeam,
    winner: null,
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function getTeam(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.playerTeam : state.enemyTeam
}

export function getOpposingTeam(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.enemyTeam : state.playerTeam
}

export function getFighterById(state: BattleState, fighterId: string) {
  return state.playerTeam.concat(state.enemyTeam).find((fighter) => fighter.instanceId === fighterId) ?? null
}

export function getAbilityById(fighter: BattleFighterState, abilityId: string) {
  if (abilityId === PASS_ABILITY_ID) return battlePassAbility
  return fighter.abilities.concat(fighter.ultimate).find((ability) => ability.id === abilityId) ?? null
}

export function getCooldown(fighter: BattleFighterState, abilityId: string) {
  return fighter.cooldowns[abilityId] ?? 0
}

export function isAlive(fighter: BattleFighterState) {
  return fighter.hp > 0
}

function getEnergyPool(state: BattleState, team: BattleTeamId) {
  return team === 'player' ? state.playerEnergy : state.enemyEnergy
}

function pickPreferredFocusType(team: BattleFighterState[]): BattleEnergyType {
  const scores = Object.fromEntries(
    battleEnergyOrder.map((type) => [type, type === 'technique' ? 0.25 : 0]),
  ) as Record<BattleEnergyType, number>

  team
    .filter(isAlive)
    .forEach((fighter) => {
      fighter.abilities
        .concat(fighter.ultimate)
        .forEach((ability) => {
          if (getCooldown(fighter, ability.id) > 0) return
          const weight = ability.tags.includes('ULT') ? 2.6 : ability.kind === 'utility' ? 1.6 : 1
          const cost = getAbilityEnergyCost(ability)
          battleEnergyOrder.forEach((type) => {
            scores[type] += (cost[type] ?? 0) * weight
          })
        })
    })

  return battleEnergyOrder.reduce((best, type) => (scores[type] > scores[best] ? type : best), 'technique')
}

function formatFocus(type: BattleEnergyType | null) {
  if (!type) return 'unfocused'
  return `${type} focus`
}

function getCommandEnergyCost(state: BattleState, command: QueuedBattleAction) {
  const actor = getFighterById(state, command.actorId)
  if (!actor) return {}

  const ability = getAbilityById(actor, command.abilityId)
  return ability ? getAbilityEnergyCost(ability) : {}
}

export function getProjectedTeamEnergy(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
  team: BattleTeamId,
  ignoreActorId?: string,
) {
  let projected = { ...getEnergyPool(state, team) }

  Object.values(queued).forEach((command) => {
    if (command.team !== team) return
    if (ignoreActorId && command.actorId === ignoreActorId) return
    projected = spendEnergy(projected, getCommandEnergyCost(state, command))
  })

  return projected
}

export function canUseAbility(state: BattleState, fighter: BattleFighterState, abilityId: string) {
  const ability = getAbilityById(fighter, abilityId)
  if (!ability) return false
  if (!isAlive(fighter)) return false
  if (abilityId === PASS_ABILITY_ID) return true
  if (!canPayEnergy(getEnergyPool(state, fighter.team), getAbilityEnergyCost(ability))) return false
  return getCooldown(fighter, abilityId) <= 0
}

export function canQueueAbility(
  state: BattleState,
  queued: Record<string, QueuedBattleAction>,
  fighter: BattleFighterState,
  abilityId: string,
) {
  const ability = getAbilityById(fighter, abilityId)
  if (!ability) return false
  if (!isAlive(fighter)) return false
  if (abilityId === PASS_ABILITY_ID) return true
  if (getCooldown(fighter, abilityId) > 0) return false

  const projectedPool = getProjectedTeamEnergy(state, queued, fighter.team, fighter.instanceId)
  return canPayEnergy(projectedPool, getAbilityEnergyCost(ability))
}

export function getValidTargetIds(
  state: BattleState,
  actorId: string,
  abilityId: string,
) {
  const actor = getFighterById(state, actorId)
  if (!actor) return []
  const ability = getAbilityById(actor, abilityId)
  if (!ability) return []

  const allies = getTeam(state, actor.team).filter(isAlive)
  const enemies = getOpposingTeam(state, actor.team).filter(isAlive)

  switch (ability.targetRule) {
    case 'self':
      return [actor.instanceId]
    case 'enemy-single':
      return enemies.map((fighter) => fighter.instanceId)
    case 'ally-single':
      return allies.map((fighter) => fighter.instanceId)
    default:
      return []
  }
}

export function getCommandablePlayerUnits(state: BattleState) {
  return state.playerTeam.filter(isAlive)
}

export function createAutoCommands(state: BattleState) {
  return Object.fromEntries(
    getCommandablePlayerUnits(state)
      .filter((fighter) => fighter.statuses.stun > 0)
      .map((fighter) => [
        fighter.instanceId,
        {
          actorId: fighter.instanceId,
          team: 'player',
          abilityId: PASS_ABILITY_ID,
          targetId: null,
        } satisfies QueuedBattleAction,
      ]),
  )
}

/**
 * Check if it's currently the player's turn to give commands.
 */
export function isPlayerCommandPhase(state: BattleState): boolean {
  if (state.phase === 'firstPlayerCommand' && state.firstPlayer === 'player') return true
  if (state.phase === 'secondPlayerCommand' && state.firstPlayer === 'enemy') return true
  return false
}

/**
 * Check if the battle is waiting for the enemy's turn.
 */
export function isEnemyCommandPhase(state: BattleState): boolean {
  if (state.phase === 'firstPlayerCommand' && state.firstPlayer === 'enemy') return true
  if (state.phase === 'secondPlayerCommand' && state.firstPlayer === 'player') return true
  return false
}

// ---------------------------------------------------------------------------
// Event logging
// ---------------------------------------------------------------------------

function makeEvent(
  events: BattleEvent[],
  round: number,
  kind: BattleEvent['kind'],
  tone: BattleEventTone,
  message: string,
  actorId?: string,
  targetId?: string,
  amount?: number,
  abilityId?: string,
) {
  events.push({
    id: `battle-${round}-${events.length}`,
    round,
    kind,
    tone,
    message,
    actorId,
    targetId,
    amount,
    abilityId,
  })
}

// ---------------------------------------------------------------------------
// Effect resolver (data-driven)
// ---------------------------------------------------------------------------

function resolveEffects(
  state: BattleState,
  events: BattleEvent[],
  actor: BattleFighterState,
  target: BattleFighterState | null,
  effects: SkillEffect[],
  abilityId?: string,
  abilityTags?: string[],
) {
  const allies = getTeam(state, actor.team).filter(isAlive)
  const enemies = getOpposingTeam(state, actor.team).filter(isAlive)
  const isUlt = abilityTags?.includes('ULT') ?? false

  for (const effect of effects) {
    const targets = resolveEffectTargets(effect.target, actor, target, allies, enemies)

    for (const t of targets) {
      switch (effect.type) {
        case 'damage': {
          const dmg = calculateDamage(state, actor, t, effect.power, isUlt)
          applyDamage(events, state.round, actor, t, dmg, abilityId)
          firePassives(state, events, actor, t, 'onDealDamage')
          break
        }

        case 'heal':
          applyHeal(events, state.round, actor, t, effect.power, abilityId)
          break

        case 'stun':
          t.statuses.stun = Math.max(t.statuses.stun, effect.duration)
          makeEvent(events, state.round, 'status', 'gold', `${t.shortName} is stunned for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, effect.duration, abilityId)
          break

        case 'invulnerable':
          t.statuses.invincible = Math.max(t.statuses.invincible, effect.duration)
          makeEvent(events, state.round, 'status', 'teal', `${t.shortName} became untouchable for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, undefined, abilityId)
          break

        case 'attackUp':
          t.statuses.attackUpTurns = Math.max(t.statuses.attackUpTurns, effect.duration)
          t.statuses.attackUpAmount = Math.max(t.statuses.attackUpAmount, effect.amount)
          makeEvent(events, state.round, 'status', 'teal', `${t.shortName} gained +${effect.amount} ATK for ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, effect.amount, abilityId)
          break

        case 'mark':
          t.statuses.markTurns = Math.max(t.statuses.markTurns, effect.duration)
          t.statuses.markBonus = Math.max(t.statuses.markBonus, effect.bonus)
          makeEvent(events, state.round, 'status', 'red', `${t.shortName} was marked for +${effect.bonus} damage.`, actor.instanceId, t.instanceId, effect.bonus, abilityId)
          break

        case 'burn':
          t.statuses.burnTurns = Math.max(t.statuses.burnTurns, effect.duration)
          t.statuses.burnDamage = Math.max(t.statuses.burnDamage, effect.damage)
          makeEvent(events, state.round, 'status', 'red', `${t.shortName} will burn for ${effect.damage} over ${effect.duration} turn${effect.duration === 1 ? '' : 's'}.`, actor.instanceId, t.instanceId, effect.damage, abilityId)
          break


        case 'cooldownReduction':
        case 'damageBoost':
          // These are passive modifiers read by calculateDamage/tickRoundEnd, not direct effects
          break
      }
    }
  }
}

function resolveEffectTargets(
  targetMode: SkillEffect['target'],
  actor: BattleFighterState,
  selectedTarget: BattleFighterState | null,
  allies: BattleFighterState[],
  enemies: BattleFighterState[],
): BattleFighterState[] {
  switch (targetMode) {
    case 'self':
      return [actor]
    case 'inherit':
      return selectedTarget && isAlive(selectedTarget) ? [selectedTarget] : []
    case 'all-allies':
      return allies
    case 'all-enemies':
      return enemies
    default:
      return selectedTarget && isAlive(selectedTarget) ? [selectedTarget] : []
  }
}

// ---------------------------------------------------------------------------
// Passive trigger system
// ---------------------------------------------------------------------------

function firePassives(
  state: BattleState,
  events: BattleEvent[],
  actor: BattleFighterState,
  target: BattleFighterState | null,
  trigger: PassiveEffect['trigger'],
) {
  const passives = actor.passiveEffects
  if (!passives) return

  for (const passive of passives) {
    if (passive.trigger !== trigger) continue

    // Threshold check for onTargetBelow
    if (trigger === 'onTargetBelow' && target && passive.threshold != null) {
      if (target.hp / target.maxHp > passive.threshold) continue
    }

    resolveEffects(state, events, actor, target, passive.effects)
  }
}

// ---------------------------------------------------------------------------
// Core damage/heal
// ---------------------------------------------------------------------------

function applyDamage(
  events: BattleEvent[],
  round: number,
  actor: BattleFighterState,
  target: BattleFighterState,
  amount: number,
  abilityId?: string,
) {
  if (!isAlive(target)) return 0
  if (target.statuses.invincible > 0) {
    makeEvent(events, round, 'system', 'teal', `${target.shortName} nullified ${actor.shortName}'s attack.`, actor.instanceId, target.instanceId, 0, abilityId)
    return 0
  }

  target.hp = Math.max(0, target.hp - amount)
  makeEvent(events, round, 'damage', 'red', `${actor.shortName} hit ${target.shortName} for ${amount}.`, actor.instanceId, target.instanceId, amount, abilityId)

  if (target.hp <= 0) {
    makeEvent(events, round, 'defeat', 'gold', `${target.shortName} was exorcised.`, actor.instanceId, target.instanceId, undefined, abilityId)
  }

  return amount
}

function applyHeal(
  events: BattleEvent[],
  round: number,
  actor: BattleFighterState,
  target: BattleFighterState,
  amount: number,
  abilityId?: string,
) {
  if (!isAlive(target)) return 0
  const before = target.hp
  target.hp = Math.min(target.maxHp, target.hp + amount)
  const healed = target.hp - before
  if (healed > 0) {
    makeEvent(events, round, 'heal', 'teal', `${actor.shortName} restored ${healed} HP to ${target.shortName}.`, actor.instanceId, target.instanceId, healed, abilityId)
  }
  return healed
}

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

function setCooldown(fighter: BattleFighterState, ability: BattleAbilityTemplate) {
  fighter.cooldowns[ability.id] = ability.cooldown
}

/**
 * Calculate final damage for an attack, applying all passive modifiers.
 * Shared damage path for all ability resolution.
 */
function calculateDamage(
  state: BattleState,
  actor: BattleFighterState,
  target: BattleFighterState,
  basePower: number,
  isUltimate: boolean,
) {
  let amount = basePower

  if (actor.statuses.attackUpTurns > 0) {
    amount += actor.statuses.attackUpAmount
  }

  // whileAlive damageBoost passives (e.g., Megumi's Ten Shadows)
  if (actor.passiveEffects) {
    for (const passive of actor.passiveEffects) {
      if (passive.trigger !== 'whileAlive') continue
      for (const eff of passive.effects) {
        if (eff.type === 'damageBoost') {
          amount = Math.round(amount * (1 + eff.amount))
        }
      }
    }
  }

  // onTargetBelow damageBoost passives (e.g., Nanami's execute)
  if (actor.passiveEffects) {
    for (const passive of actor.passiveEffects) {
      if (passive.trigger !== 'onTargetBelow') continue
      if (passive.threshold != null && target.hp / target.maxHp > passive.threshold) continue
      for (const eff of passive.effects) {
        if (eff.type === 'damageBoost') {
          amount = Math.round(amount * (1 + eff.amount))
        }
      }
    }
  }

  if (isUltimate) {
    amount = Math.round(amount * (1 + state.battlefield.ultimateDamageBoost))
  }

  if (target.statuses.markTurns > 0) {
    amount += target.statuses.markBonus
  }

  return amount
}

// ---------------------------------------------------------------------------
// Action resolution (single action)
// ---------------------------------------------------------------------------

function resolveAction(
  state: BattleState,
  events: BattleEvent[],
  command: QueuedBattleAction,
) {
  const actor = getFighterById(state, command.actorId)
  if (!actor || !isAlive(actor)) return

  const ability = getAbilityById(actor, command.abilityId)
  if (!ability) return

  if (actor.statuses.stun > 0) {
    actor.statuses.stun -= 1
    makeEvent(events, state.round, 'status', 'gold', `${actor.shortName} is stunned and passed the turn.`, actor.instanceId)
    return
  }

  if (!canUseAbility(state, actor, ability.id)) {
    makeEvent(events, state.round, 'system', 'frost', `${actor.shortName} couldn't activate ${ability.name}.`, actor.instanceId, undefined, undefined, ability.id)
    return
  }

  if (ability.id !== PASS_ABILITY_ID) {
    const nextPool = spendEnergy(getEnergyPool(state, actor.team), getAbilityEnergyCost(ability))
    if (actor.team === 'player') {
      state.playerEnergy = nextPool
    } else {
      state.enemyEnergy = nextPool
    }
    setCooldown(actor, ability)
  }

  makeEvent(events, state.round, 'action', 'frost', `${actor.shortName} activated ${ability.name}.`, actor.instanceId, command.targetId ?? undefined, undefined, ability.id)

  // Resolve the selected target
  const allies = getTeam(state, actor.team)
  const enemies = getOpposingTeam(state, actor.team)
  const explicitTarget = command.targetId ? getFighterById(state, command.targetId) : null
  const singleTarget: BattleFighterState | null =
    (explicitTarget && isAlive(explicitTarget) ? explicitTarget : null) ??
    (ability.targetRule === 'enemy-single'
      ? enemies.find(isAlive) ?? null
      : ability.targetRule === 'ally-single'
        ? allies.find(isAlive) ?? null
        : null)

  resolveEffects(state, events, actor, singleTarget, ability.effects ?? [], ability.id, ability.tags)
}

// ---------------------------------------------------------------------------
// Round phases
// ---------------------------------------------------------------------------

function applyRoundStartEffects(state: BattleState, events: BattleEvent[]) {
  const allUnits = state.playerTeam.concat(state.enemyTeam)
  allUnits.forEach((fighter) => {
    if (!isAlive(fighter)) return

    if (fighter.statuses.burnTurns > 0 && fighter.statuses.burnDamage > 0) {
      fighter.hp = Math.max(0, fighter.hp - fighter.statuses.burnDamage)
      makeEvent(events, state.round, 'damage', 'red', `${fighter.shortName} burned for ${fighter.statuses.burnDamage}.`, undefined, fighter.instanceId, fighter.statuses.burnDamage)

      if (fighter.hp <= 0) {
        makeEvent(events, state.round, 'defeat', 'gold', `${fighter.shortName} fell to burn damage.`, undefined, fighter.instanceId)
      }
    }

    // Fire data-driven onRoundStart passives (includes regen via Yuji's passiveEffects)
    if (isAlive(fighter)) {
      firePassives(state, events, fighter, null, 'onRoundStart')
    }
  })
}

function applyRoundEnergyGeneration(state: BattleState, events: BattleEvent[]) {
  const playerAliveCount = state.playerTeam.filter(isAlive).length
  const enemyAliveCount = state.enemyTeam.filter(isAlive).length

  if (playerAliveCount > 0) {
    state.playerEnergy = refreshRoundEnergy(state.playerEnergy, playerAliveCount)
    makeEvent(events, state.round, 'system', 'teal', `Reserve +${playerAliveCount} cursed energy. ${formatFocus(state.playerEnergy.focus)} refreshed.`)
  }

  if (enemyAliveCount > 0) {
    const enemyFocus = pickPreferredFocusType(state.enemyTeam)
    state.enemyEnergy = refreshRoundEnergy(state.enemyEnergy, enemyAliveCount, enemyFocus)
    makeEvent(events, state.round, 'system', 'red', `Enemy reserve +${enemyAliveCount} cursed energy. ${formatFocus(state.enemyEnergy.focus)} refreshed.`)
  }
}

function applyFatigue(state: BattleState, events: BattleEvent[]) {
  if (state.round < state.battlefield.fatigueStartsRound) return
  const damage = 6 + (state.round - state.battlefield.fatigueStartsRound) * 2
  state.playerTeam.concat(state.enemyTeam).forEach((fighter) => {
    if (!isAlive(fighter)) return
    fighter.hp = Math.max(0, fighter.hp - damage)
    makeEvent(events, state.round, 'system', 'red', `Domain pressure dealt ${damage} to ${fighter.shortName}.`, undefined, fighter.instanceId, damage)
    if (fighter.hp <= 0) {
      makeEvent(events, state.round, 'defeat', 'gold', `${fighter.shortName} was crushed by domain pressure.`, undefined, fighter.instanceId)
    }
  })
}

function tickRoundEnd(state: BattleState) {
  state.playerTeam.concat(state.enemyTeam).forEach((fighter) => {
    if (!isAlive(fighter)) return

    let cooldownTick = 1
    if (fighter.passiveEffects) {
      for (const passive of fighter.passiveEffects) {
        if (passive.trigger !== 'whileAlive') continue
        for (const eff of passive.effects) {
          if (eff.type === 'cooldownReduction') cooldownTick += eff.amount
        }
      }
    }

    Object.keys(fighter.cooldowns).forEach((abilityId) => {
      fighter.cooldowns[abilityId] = Math.max(0, (fighter.cooldowns[abilityId] ?? 0) - cooldownTick)
    })

    fighter.statuses.invincible = Math.max(0, fighter.statuses.invincible - 1)
    fighter.statuses.markTurns = Math.max(0, fighter.statuses.markTurns - 1)
    if (fighter.statuses.markTurns === 0) fighter.statuses.markBonus = 0

    fighter.statuses.burnTurns = Math.max(0, fighter.statuses.burnTurns - 1)
    if (fighter.statuses.burnTurns === 0) fighter.statuses.burnDamage = 0

    fighter.statuses.attackUpTurns = Math.max(0, fighter.statuses.attackUpTurns - 1)
    if (fighter.statuses.attackUpTurns === 0) fighter.statuses.attackUpAmount = 0
  })
}

function getWinner(state: BattleState): BattleTeamId | null {
  const playerAlive = state.playerTeam.some(isAlive)
  const enemyAlive = state.enemyTeam.some(isAlive)
  if (playerAlive && enemyAlive) return null
  if (playerAlive) return 'player'
  if (enemyAlive) return 'enemy'
  return 'enemy' // double KO counts as a loss
}


// ---------------------------------------------------------------------------
// Enemy AI
// ---------------------------------------------------------------------------

export function buildEnemyCommands(state: BattleState): Record<string, QueuedBattleAction> {
  const commands: Record<string, QueuedBattleAction> = {}
  state.enemyEnergy = setEnergyFocus(state.enemyEnergy, pickPreferredFocusType(state.enemyTeam))
  let plannedPool = { ...state.enemyEnergy }

  const fighters = state.enemyTeam
    .filter(isAlive)
    .sort((left, right) => left.slot - right.slot)

  fighters.forEach((fighter) => {
    const lowHpAlly = state.enemyTeam
      .filter(isAlive)
      .sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp)[0]

    const enemyFront = state.playerTeam
      .filter(isAlive)
      .sort((left, right) => left.hp - right.hp)[0]

    const availableAbilities = fighter.abilities
      .concat(fighter.ultimate)
      .filter((ability) => getCooldown(fighter, ability.id) <= 0)
      .filter((ability) => canPayEnergy(plannedPool, getAbilityEnergyCost(ability)))

    const sorted = availableAbilities
      .map((ability) => {
        let score = ability.power ?? ability.healPower ?? ability.attackBuffAmount ?? 0
        if (ability.tags.includes('ULT') && state.round >= 3) score += 28
        if (ability.kind === 'heal' && lowHpAlly && lowHpAlly.hp / lowHpAlly.maxHp < 0.5) score += 40
        if (ability.kind === 'defend' && fighter.hp / fighter.maxHp < 0.35) score += 26
        if (ability.kind === 'buff' && fighter.hp / fighter.maxHp > 0.35) score += 14
        if (ability.kind === 'debuff') score += 18
        return { ability, score }
      })
      .sort((left, right) => right.score - left.score)

    const ability = sorted[0]?.ability ?? battlePassAbility
    let targetId: string | null = null

    if (ability.targetRule === 'enemy-single') {
      targetId = enemyFront?.instanceId ?? null
    } else if (ability.targetRule === 'ally-single') {
      targetId = lowHpAlly?.instanceId ?? fighter.instanceId
    } else if (ability.targetRule === 'self') {
      targetId = fighter.instanceId
    }

    commands[fighter.instanceId] = {
      actorId: fighter.instanceId,
      team: 'enemy',
      abilityId: ability.id,
      targetId,
    }

    if (ability.id !== PASS_ABILITY_ID) {
      plannedPool = spendEnergy(plannedPool, getAbilityEnergyCost(ability))
    }
  })

  return commands
}

// ---------------------------------------------------------------------------
// Sequential turn resolution
// ---------------------------------------------------------------------------

/**
 * Resolve one team's turn: all of that team's queued actions execute and
 * the game state is mutated. Returns events produced.
 */
export function resolveTeamTurn(
  previousState: BattleState,
  commands: Record<string, QueuedBattleAction>,
  team: BattleTeamId,
): { state: BattleState; events: BattleEvent[] } {
  const state = cloneState(previousState)
  const events: BattleEvent[] = []

  const teamFighters = getTeam(state, team)
    .filter(isAlive)
    .sort((a, b) => a.slot - b.slot)

  teamFighters.forEach((fighter) => {
    const command = commands[fighter.instanceId]
    if (!command) {
      resolveAction(state, events, {
        actorId: fighter.instanceId,
        team,
        abilityId: PASS_ABILITY_ID,
        targetId: null,
      })
      return
    }
    resolveAction(state, events, command)
  })

  // Check for winner after this team's turn
  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(events, state.round, 'victory', winner === 'player' ? 'teal' : 'red',
      winner === 'player'
        ? 'Your squad controls the battlefield.'
        : 'The enemy team overwhelmed your formation.',
    )
  }

  return { state, events }
}

/**
 * Begin a new round: apply upkeep (DoT, regen, energy) and set up the
 * first player's command phase.
 */
export function beginNewRound(previousState: BattleState): { state: BattleState; events: BattleEvent[] } {
  const state = cloneState(previousState)
  const events: BattleEvent[] = []

  state.round += 1
  makeEvent(events, state.round, 'phase', 'frost', `Round ${state.round} opened inside ${state.battlefield.name}.`)

  applyRoundStartEffects(state, events)

  // Check if DoT killed anyone
  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(events, state.round, 'victory', winner === 'player' ? 'teal' : 'red',
      winner === 'player'
        ? 'Your squad controls the battlefield.'
        : 'The enemy team overwhelmed your formation.',
    )
    return { state, events }
  }

  applyRoundEnergyGeneration(state, events)

  state.activePlayer = state.firstPlayer
  state.phase = 'firstPlayerCommand'

  return { state, events }
}

/**
 * Transition from first player's resolved turn to second player's command phase.
 */
export function transitionToSecondPlayer(previousState: BattleState): BattleState {
  const state = cloneState(previousState)
  state.activePlayer = getSecondPlayer(state.firstPlayer)
  state.phase = 'secondPlayerCommand'
  return state
}

/**
 * End the round after the second player's turn: apply fatigue, tick cooldowns,
 * check for winner. If the game continues, automatically begins the next round.
 */
export function endRound(previousState: BattleState): { state: BattleState; events: BattleEvent[] } {
  const state = cloneState(previousState)
  const events: BattleEvent[] = []

  applyFatigue(state, events)
  tickRoundEnd(state)

  const winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(events, state.round, 'victory', winner === 'player' ? 'teal' : 'red',
      winner === 'player'
        ? 'Your squad controls the battlefield.'
        : 'The enemy team overwhelmed your formation.',
    )
    return { state, events }
  }

  // Automatically start next round
  const nextRound = beginNewRound(state)
  return {
    state: nextRound.state,
    events: [...events, ...nextRound.events],
  }
}

// ---------------------------------------------------------------------------
// Legacy resolveRound (kept for compatibility during migration)
// ---------------------------------------------------------------------------

export function resolveRound(
  previousState: BattleState,
  playerCommands: Record<string, QueuedBattleAction>,
) {
  const state = cloneState(previousState)
  const events: BattleEvent[] = []

  makeEvent(events, state.round, 'phase', 'frost', `Round ${state.round} began inside ${state.battlefield.name}.`)

  applyRoundStartEffects(state, events)

  const enemyCommands = buildEnemyCommands(state)

  // Sequential: first player acts, then second player acts
  const firstTeam = state.firstPlayer
  const secondTeam = getSecondPlayer(firstTeam)
  const firstCommands = firstTeam === 'player' ? playerCommands : enemyCommands
  const secondCommands = secondTeam === 'player' ? playerCommands : enemyCommands

  // Resolve first player's turn
  const firstFighters = getTeam(state, firstTeam)
    .filter(isAlive)
    .sort((a, b) => a.slot - b.slot)

  firstFighters.forEach((fighter) => {
    const command = firstCommands[fighter.instanceId]
    if (!command) {
      resolveAction(state, events, { actorId: fighter.instanceId, team: firstTeam, abilityId: PASS_ABILITY_ID, targetId: null })
      return
    }
    resolveAction(state, events, command)
  })

  // Check for winner after first player's turn
  let winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(events, state.round, 'victory', winner === 'player' ? 'teal' : 'red',
      winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.')
    return { state, events }
  }

  // Resolve second player's turn
  const secondFighters = getTeam(state, secondTeam)
    .filter(isAlive)
    .sort((a, b) => a.slot - b.slot)

  secondFighters.forEach((fighter) => {
    const command = secondCommands[fighter.instanceId]
    if (!command) {
      resolveAction(state, events, { actorId: fighter.instanceId, team: secondTeam, abilityId: PASS_ABILITY_ID, targetId: null })
      return
    }
    resolveAction(state, events, command)
  })

  applyFatigue(state, events)
  tickRoundEnd(state)

  winner = getWinner(state)
  if (winner) {
    state.phase = 'finished'
    state.winner = winner
    makeEvent(events, state.round, 'victory', winner === 'player' ? 'teal' : 'red',
      winner === 'player' ? 'Your squad controls the battlefield.' : 'The enemy team overwhelmed your formation.')
  } else {
    state.round += 1
    applyRoundEnergyGeneration(state, events)
    makeEvent(events, state.round, 'phase', 'frost', `Round ${state.round} command window opened.`)
  }

  return { state, events }
}

