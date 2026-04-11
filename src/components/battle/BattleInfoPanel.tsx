import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { BattlePortraitSlot } from '@/components/battle/BattlePortraitSlot'
import { getTargetLabel } from '@/components/battle/battleDisplay'
import { countEnergyCost, getAbilityEnergyCost } from '@/features/battle/energy'
import { getCooldown } from '@/features/battle/engine'
import type { BattleAbilityTemplate, BattleFighterState } from '@/features/battle/types'

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

function classesFromTags(tags: BattleAbilityTemplate['tags']): string {
  return tags.length > 0 ? tags.join(', ') : 'NONE'
}

export function BattleInfoPanel({
  actor,
  ability,
  battlefieldName,
}: {
  actor: BattleFighterState | null
  ability: BattleAbilityTemplate | null
  battlefieldName: string
}) {
  const description = ability ? ability.description : battlefieldName
  const cooldown = ability && actor ? getCooldown(actor, ability.id) : null
  const cost = ability ? getAbilityEnergyCost(ability) : null
  const totalCost = cost ? countEnergyCost(cost) : 0

  return (
    <section className="overflow-hidden rounded-[0.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,12,26,0.96),rgba(10,8,18,0.98))] text-ca-text shadow-[0_12px_22px_rgba(0,0,0,0.3)]">
      <div className="flex items-stretch">
        <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center border-r border-white/8 bg-[rgba(255,255,255,0.03)] p-3">
          {actor ? (
            <BattlePortraitSlot fighter={actor} accent="teal" showName />
          ) : (
            <div className="rounded-[0.15rem] border border-white/10 bg-white/5 p-4 text-[0.65rem] text-white/40">Select a unit.</div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-white/8 px-5 py-3">
            <p className="ca-display truncate text-[1.2rem] leading-none text-white/90">
              {ability ? ability.name.toUpperCase() : 'NO TECHNIQUE SELECTED'}
            </p>
          </div>

          <div className="flex-1 px-5 py-3">
            <p className="text-[0.82rem] leading-relaxed text-white/65">{description}</p>
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
              <span className="ca-mono-label text-[0.62rem] text-white/75">{ability ? getTargetLabel(ability) : 'BOARD'}</span>
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
                <span className="ca-mono-label text-[0.55rem] text-white/35">CLASSES</span>
                <span className="ca-mono-label text-[0.62rem] text-white/75">{classesFromTags(ability.tags)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
