import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import { describeSkillEffectForUi, getSkillEffectDuration, getTargetLabel } from '@/components/battle/battleDisplay'
import { countEnergyCost, getAbilityEnergyCost } from '@/features/battle/energy'
import { getCooldown, getQueueAbilityBlockReason, getResolvedAbilityEnergyCost, getValidTargetIds } from '@/features/battle/engine'
import type { BattleAbilityTemplate, BattleFighterState, BattleState, QueuedBattleAction } from '@/features/battle/types'

function classLabel(kind: BattleAbilityTemplate['kind']): string {
  switch (kind) {
    case 'attack': return 'ATTACK'
    case 'heal': return 'HEAL'
    case 'defend': return 'DEFENSE'
    case 'buff': return 'BUFF'
    case 'debuff': return 'DEBUFF'
    case 'utility': return 'UTILITY'
    case 'pass': return 'PASS'
    default: return 'UNKNOWN'
  }
}

function formatSkillClasses(ability: BattleAbilityTemplate): string {
  const classes = [classLabel(ability.kind), ...ability.classes]
  return classes.length > 0 ? Array.from(new Set(classes)).join(', ') : 'NONE'
}

export function BattleInfoPanel({
  state,
  queued,
  actor,
  ability,
}: {
  state: BattleState
  queued: Record<string, QueuedBattleAction>
  actor: BattleFighterState | null
  ability: BattleAbilityTemplate | null
}) {
  const description = ability?.description ?? null
  const cooldown = ability && actor ? getCooldown(actor, ability.id) : null
  const cost = ability && actor ? getResolvedAbilityEnergyCost(actor, ability).cost : ability ? getAbilityEnergyCost(ability) : null
  const totalCost = cost ? countEnergyCost(cost) : 0
  const blockReason = actor && ability ? getQueueAbilityBlockReason(state, queued, actor, ability.id) : null
  const validTargets =
    actor && ability && (ability.targetRule === 'enemy-single' || ability.targetRule === 'ally-single')
      ? getValidTargetIds(state, actor.instanceId, ability.id).length
      : null
  const effectLines = ability
    ? (ability.effects ?? [])
        .map((effect) => ({
          text: describeSkillEffectForUi(effect),
          turns: getSkillEffectDuration(effect),
        }))
        .sort((left, right) => {
          if (left.turns === null && right.turns === null) return 0
          if (left.turns === null) return 1
          if (right.turns === null) return -1
          return left.turns - right.turns
        })
    : []

  return (
    <section className="h-[13.75rem] overflow-hidden rounded-[0.2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(18,16,28,0.96),rgba(10,8,18,0.98))] text-ca-text shadow-[0_12px_22px_rgba(0,0,0,0.34)]">
      <div className="flex h-full items-stretch">
        <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center border-r border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
          {actor ? (
            <BattlePortraitSlot fighter={actor} accent="teal" compact showName />
          ) : (
            <div className="rounded-[0.15rem] border border-white/10 bg-white/5 p-4 text-[0.65rem] text-white/40">Select a unit.</div>
          )}
        </div>

        <div key={ability?.id ?? 'empty'} className="flex min-w-0 flex-1 flex-col overflow-hidden animate-ca-fade-in">
          <div className="border-b border-white/8 px-5 py-3">
            <p className="ca-display truncate text-[1.2rem] leading-none text-white/90">
              {ability ? ability.name.toUpperCase() : 'NO TECHNIQUE SELECTED'}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2.5">
            {description ? (
              <p className="text-[0.82rem] leading-relaxed text-white/65">{description}</p>
            ) : (
              <p className="ca-mono-label text-[0.58rem] uppercase tracking-[0.12em] text-white/35">
                Select a technique to inspect details.
              </p>
            )}

            {ability && effectLines.length > 0 ? (
              <div className="mt-2.5 rounded-[0.2rem] border border-white/8 bg-[rgba(0,0,0,0.2)] px-2.5 py-2">
                <p className="ca-mono-label text-[0.5rem] text-white/40">LIVE EFFECT BREAKDOWN</p>
                <ul className="mt-1 space-y-1">
                  {effectLines.map((entry, index) => (
                    <li key={`${ability.id}-fx-${index}`} className="ca-mono-label text-[0.52rem] leading-snug text-white/75">
                      {`- ${entry.text.toUpperCase()}${entry.turns !== null ? ` (${entry.turns} TURN${entry.turns === 1 ? '' : 'S'})` : ''}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-white/6 px-5 py-2.5">
            {ability ? (
              <div className="flex items-center gap-2">
                <span className="ca-mono-label text-[0.55rem] text-white/35">CLASS</span>
                <span className="ca-mono-label text-[0.62rem] text-white/75">{classLabel(ability.kind)}</span>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <span className="ca-mono-label text-[0.55rem] text-white/35">TARGET</span>
              <span className="ca-mono-label text-[0.62rem] text-white/75">
                {ability ? getTargetLabel(ability) : 'BOARD'}
                {validTargets !== null ? ` (${validTargets} VALID)` : ''}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="ca-mono-label text-[0.55rem] text-white/35">COST</span>
              {ability && totalCost > 0 ? (
                <EnergyCostRow cost={cost!} compact />
              ) : (
                <span className="ca-mono-label text-[0.62rem] text-white/75">FREE</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="ca-mono-label text-[0.55rem] text-white/35">COOLDOWN</span>
              <span className="ca-mono-label text-[0.62rem] text-white/75">{cooldown !== null ? cooldown : ability ? ability.cooldown : 'NONE'}</span>
            </div>

            {ability ? (
              <div className="flex items-center gap-2">
                <span className="ca-mono-label text-[0.55rem] text-white/35">STATUS</span>
                <span className={`ca-mono-label text-[0.62rem] ${blockReason ? 'text-ca-red' : 'text-ca-teal'}`}>
                  {blockReason ? blockReason.toUpperCase() : 'READY'}
                </span>
              </div>
            ) : null}

            {ability ? (
              <div className="flex items-center gap-2">
                <span className="ca-mono-label text-[0.55rem] text-white/35">CLASSES</span>
                <span className="ca-mono-label text-[0.62rem] text-white/75">{formatSkillClasses(ability)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
