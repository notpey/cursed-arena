import type {
  BattleEvent,
  BattleEventTone,
  BattleFighterState,
  BattleModifierInstance,
  BattleResourcePacket,
  BattleRuntimeEvent,
  BattleRuntimeEventType,
  BattleStatusKind,
  BattleTeamId,
  ResolutionContext,
} from '@/features/battle/types.ts'

export function makeEvent(
  ctx: ResolutionContext,
  round: number,
  kind: BattleEvent['kind'],
  tone: BattleEventTone,
  message: string,
  actorId?: string,
  targetId?: string,
  amount?: number,
  abilityId?: string,
) {
  ctx.events.push({
    id: `battle-${round}-${ctx.events.length}`,
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

export function makeRuntimeEvent(
  ctx: ResolutionContext,
  round: number,
  type: BattleRuntimeEventType,
  payload: Omit<BattleRuntimeEvent, 'id' | 'round' | 'type'> = {},
) {
  ctx.runtimeEvents.push({
    id: `runtime-${round}-${ctx.runtimeEvents.length}`,
    round,
    type,
    ...payload,
  })
}

function getResourcePacketAmount(amounts: Partial<Record<string, number>>) {
  if (typeof amounts.reserve === 'number') return amounts.reserve
  return Object.values(amounts).reduce<number>((total, amount) => total + (amount ?? 0), 0)
}

export function emitResourceChange(
  ctx: ResolutionContext,
  round: number,
  packet: BattleResourcePacket,
) {
  makeRuntimeEvent(ctx, round, 'resource_changed', {
    actorId: packet.sourceActorId,
    team: packet.targetTeam,
    abilityId: packet.abilityId,
    amount: getResourcePacketAmount(packet.amounts),
    tags: packet.tags,
    packet,
  })
}

export function emitShieldEvent(
  ctx: ResolutionContext,
  round: number,
  type: Extract<BattleRuntimeEventType, 'shield_applied' | 'shield_damaged' | 'shield_broken'>,
  target: BattleFighterState,
  payload: {
    actorId?: string
    abilityId?: string
    amount: number
    label?: string
    tags?: string[]
  },
) {
  makeRuntimeEvent(ctx, round, type, {
    actorId: payload.actorId,
    targetId: target.instanceId,
    team: target.team,
    abilityId: payload.abilityId,
    amount: payload.amount,
    tags: payload.tags,
    meta: {
      label: payload.label ?? null,
    },
  })
}

export function emitFlagChange(
  ctx: ResolutionContext,
  round: number,
  fighter: BattleFighterState,
  key: string,
  value: boolean,
  actorId?: string,
  abilityId?: string,
) {
  makeRuntimeEvent(ctx, round, 'fighter_flag_changed', {
    actorId,
    targetId: fighter.instanceId,
    team: fighter.team,
    abilityId,
    meta: {
      key,
      value,
    },
  })
}

export function emitCounterChange(
  ctx: ResolutionContext,
  round: number,
  fighter: BattleFighterState,
  key: string,
  value: number,
  actorId?: string,
  abilityId?: string,
) {
  makeRuntimeEvent(ctx, round, 'counter_changed', {
    actorId,
    targetId: fighter.instanceId,
    team: fighter.team,
    abilityId,
    amount: value,
    meta: {
      key,
      value,
    },
  })
}

export function emitModifierApplied(
  ctx: ResolutionContext,
  round: number,
  target: BattleFighterState,
  modifier: BattleModifierInstance,
  actorId?: string,
  abilityId?: string,
) {
  makeRuntimeEvent(ctx, round, 'modifier_applied', {
    actorId,
    targetId: target.instanceId,
    team: target.team,
    abilityId,
    amount: typeof modifier.value === 'number' ? modifier.value : undefined,
    tags: modifier.tags,
    meta: {
      label: modifier.label,
      stat: modifier.stat,
      mode: modifier.mode,
      scope: modifier.scope,
      status: modifier.statusKind ?? null,
    },
  })
}

export function emitRemovedStatusEvents(
  ctx: ResolutionContext,
  round: number,
  target: BattleFighterState,
  beforeKinds: BattleStatusKind[],
  actorId?: string,
  abilityId?: string,
) {
  const beforeUnique = Array.from(new Set(beforeKinds))
  const afterKinds = new Set(target.statuses.map((status) => status.kind))

  target.statuses.forEach((status) => {
    if (beforeUnique.includes(status.kind)) return
    makeRuntimeEvent(ctx, round, 'status_applied', {
      actorId,
      targetId: target.instanceId,
      team: target.team,
      abilityId,
      amount:
        status.kind === 'mark'
          ? status.bonus
          : status.kind === 'burn'
            ? status.damage
            : status.kind === 'attackUp'
              ? status.amount
              : undefined,
      tags: ['status', status.kind],
      meta: {
        status: status.kind,
        duration: status.duration,
      },
    })
  })

  beforeUnique.forEach((kind) => {
    if (afterKinds.has(kind)) return
    makeRuntimeEvent(ctx, round, 'status_removed', {
      actorId,
      targetId: target.instanceId,
      team: target.team,
      abilityId,
      tags: ['status', kind],
      meta: { status: kind },
    })
  })
}

export function emitModifierRemoved(
  ctx: ResolutionContext,
  round: number,
  modifier: BattleModifierInstance,
  payload: { actorId?: string; targetId?: string; team?: BattleTeamId; abilityId?: string } = {},
) {
  makeRuntimeEvent(ctx, round, 'modifier_removed', {
    actorId: payload.actorId,
    targetId: payload.targetId,
    team: payload.team,
    abilityId: payload.abilityId,
    amount: typeof modifier.value === 'number' ? modifier.value : undefined,
    tags: modifier.tags,
    meta: {
      label: modifier.label,
      stat: modifier.stat,
      mode: modifier.mode,
      scope: modifier.scope,
      status: modifier.statusKind ?? null,
    },
  })
}
