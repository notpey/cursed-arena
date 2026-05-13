import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import { describeSkillEffectForUi, getSkillEffectDuration, getTargetLabel } from '@/components/battle/battleDisplay'
import { formatSkillClasses } from '@/components/battle/skillClassDisplay'
import { countEnergyCost, getAbilityEnergyCost } from '@/features/battle/energy'
import { getCooldown, getQueueAbilityBlockReason, getResolvedAbilityEnergyCost, getValidTargetIds } from '@/features/battle/engine'
import { getVisibleAbilities } from '@/features/battle/engine/selectors'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
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

function EnemySkillIcon({
  ability,
  selected,
  onSelect,
  onHover,
  onLeave,
}: {
  ability: BattleAbilityTemplate
  selected: boolean
  onSelect: () => void
  onHover: () => void
  onLeave: () => void
}) {
  const iconSrc = normalizeBattleAssetSrc(ability.icon.src)
  return (
    <button
      type="button"
      title={ability.name}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={[
        'relative h-[2.4rem] w-[2.4rem] shrink-0 overflow-hidden rounded-[0.12rem] border-2 transition duration-150',
        selected
          ? 'border-ca-red/70 shadow-[0_0_0_1px_rgba(252,43,71,0.3),0_0_12px_rgba(252,43,71,0.22)] -translate-y-[2px]'
          : 'border-ca-red/25 hover:border-ca-red/50 hover:-translate-y-[1px]',
      ].join(' ')}
    >
      {iconSrc ? (
        <img src={iconSrc} alt={ability.name} className="h-full w-full object-cover opacity-85" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[rgba(24,8,13,0.95)] text-[0.85rem] font-black text-ca-red/40">?</div>
      )}
    </button>
  )
}

export function BattleInfoPanel({
  state,
  queued,
  actor,
  ability,
  isEnemyInspect = false,
  inspectedEnemyFighter = null,
  inspectedEnemyAbilityId = null,
  onSelectEnemyAbility,
}: {
  state: BattleState
  queued: Record<string, QueuedBattleAction>
  actor: BattleFighterState | null
  ability: BattleAbilityTemplate | null
  isEnemyInspect?: boolean
  inspectedEnemyFighter?: BattleFighterState | null
  inspectedEnemyAbilityId?: string | null
  onSelectEnemyAbility?: (abilityId: string) => void
}) {
  const description = ability?.description ?? null
  const cooldown = ability && actor && !isEnemyInspect ? getCooldown(actor, ability.id) : null
  const cost = ability && actor ? getResolvedAbilityEnergyCost(actor, ability).cost : ability ? getAbilityEnergyCost(ability) : null
  const totalCost = cost ? countEnergyCost(cost) : 0
  const blockReason = !isEnemyInspect && actor && ability ? getQueueAbilityBlockReason(state, queued, actor, ability.id) : null
  const validTargets =
    !isEnemyInspect && actor && ability && (ability.targetRule === 'enemy-single' || ability.targetRule === 'ally-single')
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

  const enemyAbilities = inspectedEnemyFighter ? getVisibleAbilities(inspectedEnemyFighter) : []

  return (
    <section className="h-[13.75rem] overflow-hidden rounded-[0.2rem] border border-white/13 bg-[linear-gradient(180deg,rgba(20,18,30,0.97),rgba(6,6,11,0.97))] text-ca-text shadow-[0_14px_26px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex h-full items-stretch">
        <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center border-r border-white/9 bg-[rgba(255,255,255,0.035)] p-3">
          {actor ? (
            <BattlePortraitSlot fighter={actor} accent={isEnemyInspect ? 'red' : 'teal'} compact showName />
          ) : (
            <div className="rounded-[0.15rem] border border-white/10 bg-white/5 p-4 text-[0.65rem] text-white/40">Select a unit.</div>
          )}
        </div>

        <div key={ability?.id ?? (isEnemyInspect ? 'enemy-empty' : 'empty')} className="flex min-w-0 flex-1 flex-col overflow-hidden animate-ca-fade-in">
          <div className="border-b border-white/10 px-5 py-3">
            <p className="ca-display truncate text-[1.2rem] leading-none text-ca-text">
              {ability ? ability.name.toUpperCase() : isEnemyInspect ? 'ENEMY FIGHTER' : 'NO TECHNIQUE SELECTED'}
            </p>
            {isEnemyInspect ? (
              <span className="mt-1 inline-block rounded-[0.1rem] border border-ca-red/30 bg-ca-red/10 px-1.5 py-0.5 ca-mono-label text-[0.44rem] text-ca-red">
                ENEMY — READ ONLY
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2.5">
            {description ? (
              <p className="text-[0.82rem] leading-relaxed text-ca-text-2">{description}</p>
            ) : (
              <p className="ca-mono-label text-[0.58rem] uppercase tracking-[0.12em] text-ca-text-3">
                {isEnemyInspect ? 'Select an enemy technique to inspect.' : 'Select a technique to inspect details.'}
              </p>
            )}

            {ability && effectLines.length > 0 ? (
              <div className="mt-2.5 rounded-[0.2rem] border border-white/8 bg-[rgba(0,0,0,0.2)] px-2.5 py-2">
                <p className="ca-mono-label text-[0.5rem] text-ca-text-3">LIVE EFFECT BREAKDOWN</p>
                <ul className="mt-1 space-y-1">
                  {effectLines.map((entry, index) => (
                    <li key={`${ability.id}-fx-${index}`} className="ca-mono-label text-[0.52rem] leading-snug text-ca-text-2">
                      {`- ${entry.text.toUpperCase()}${entry.turns !== null ? ` (${entry.turns} TURN${entry.turns === 1 ? '' : 'S'})` : ''}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Footer: stats row + enemy skill icon row */}
          <div className="border-t border-white/10">
            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2">
              {ability ? (
                <div className="flex items-center gap-2">
                  <span className="ca-mono-label text-[0.55rem] text-ca-text-3">CLASS</span>
                  <span className="ca-mono-label text-[0.62rem] text-ca-text-2">{classLabel(ability.kind)}</span>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <span className="ca-mono-label text-[0.55rem] text-ca-text-3">TARGET</span>
                <span className="ca-mono-label text-[0.62rem] text-ca-text-2">
                  {ability ? getTargetLabel(ability) : 'BOARD'}
                  {validTargets !== null ? ` (${validTargets} VALID)` : ''}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="ca-mono-label text-[0.55rem] text-ca-text-3">COST</span>
                {ability && totalCost > 0 ? (
                  <EnergyCostRow cost={cost!} compact />
                ) : (
                  <span className="ca-mono-label text-[0.62rem] text-ca-text-2">FREE</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="ca-mono-label text-[0.55rem] text-ca-text-3">COOLDOWN</span>
                <span className="ca-mono-label text-[0.62rem] text-ca-text-2">{ability ? (isEnemyInspect ? ability.cooldown : cooldown !== null && cooldown > 0 ? cooldown : ability.cooldown) : 'NONE'}</span>
              </div>

              {ability && !isEnemyInspect ? (
                <div className="flex items-center gap-2">
                  <span className="ca-mono-label text-[0.55rem] text-ca-text-3">STATUS</span>
                  <span className={`ca-mono-label text-[0.62rem] ${blockReason ? 'text-ca-red' : 'text-ca-teal'}`}>
                    {blockReason ? blockReason.toUpperCase() : 'READY'}
                  </span>
                </div>
              ) : null}

              {ability ? (
                <div className="flex items-center gap-2">
                  <span className="ca-mono-label text-[0.55rem] text-ca-text-3">CLASSES</span>
                  <span className="ca-mono-label text-[0.62rem] text-ca-text-2">{formatSkillClasses(ability)}</span>
                </div>
              ) : null}
            </div>

            {/* Enemy skill icon row — only when inspecting an enemy */}
            {isEnemyInspect && enemyAbilities.length > 0 ? (
              <div className="flex items-center gap-1.5 border-t border-ca-red/12 bg-[rgba(24,8,13,0.45)] px-4 py-1.5">
                <span className="ca-mono-label shrink-0 text-[0.44rem] text-ca-red/60">SKILLS</span>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {enemyAbilities.map((ab) => (
                    <EnemySkillIcon
                      key={ab.id}
                      ability={ab}
                      selected={ab.id === inspectedEnemyAbilityId}
                      onSelect={() => onSelectEnemyAbility?.(ab.id)}
                      onHover={() => onSelectEnemyAbility?.(ab.id)}
                      onLeave={() => {}}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
