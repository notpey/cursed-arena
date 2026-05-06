import { Link, useParams } from 'react-router-dom'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import { battlePrepRosterById } from '@/components/site/siteVisuals'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import { getAbilityEnergyCost, battleEnergyMeta, randomEnergyMeta } from '@/features/battle/energy'
import type { BattleAbilityTemplate } from '@/features/battle/types'

// ─── Energy pip display ───────────────────────────────────────────────────────

function EnergyCostPips({ ability }: { ability: BattleAbilityTemplate }) {
  const cost = getAbilityEnergyCost(ability)
  const pips: Array<{ color: string; key: string }> = []

  const order = ['technique', 'physical', 'vow', 'mental'] as const
  for (const type of order) {
    const count = cost[type] ?? 0
    const meta = battleEnergyMeta[type]
    for (let i = 0; i < count; i++) {
      pips.push({ color: meta.color, key: `${type}-${i}` })
    }
  }
  const random = cost.random ?? 0
  for (let i = 0; i < random; i++) {
    pips.push({ color: randomEnergyMeta.color, key: `random-${i}` })
  }

  if (pips.length === 0) return <span className="text-[0.7rem] text-ca-text-3">None</span>

  return (
    <span className="inline-flex items-center gap-0.5">
      {pips.map((pip) => (
        <span
          key={pip.key}
          className="inline-block h-3 w-3 rounded-[2px] border border-black/20"
          style={{ background: pip.color }}
        />
      ))}
    </span>
  )
}

// ─── Skill block (Naruto-Arena style) ────────────────────────────────────────

function SkillBlock({ ability, isUltimate }: { ability: BattleAbilityTemplate; isUltimate?: boolean }) {
  const iconSrc = normalizeBattleAssetSrc(ability.icon.src)

  return (
    <div className="border-t border-dotted border-white/12 pt-3">
      {/* Skill title */}
      <p className="mb-2 text-[0.78rem] font-semibold leading-none">
        <span className="text-ca-text-3 font-normal">
          {isUltimate ? 'Skill: ' : 'Skill: '}
        </span>
        <span
          className={isUltimate ? 'text-ca-gold' : 'text-ca-teal'}
          style={{ fontFamily: 'var(--font-display-alt)', fontWeight: 700 }}
        >
          {ability.name}
        </span>
      </p>

      {/* Portrait + description row */}
      <div className="flex gap-3">
        {/* Square ability image */}
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[4px] border border-white/12 bg-[rgba(10,10,16,0.8)]">
          {iconSrc ? (
            <img src={iconSrc} alt={ability.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="ca-mono-label text-[0.44rem] text-ca-text-3">{ability.icon.label}</span>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="min-w-0 flex-1 text-[0.73rem] leading-[1.55] text-ca-text-2">
          {ability.description || 'No description authored.'}
        </p>
      </div>

      {/* Cooldown + cost + classes row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-dotted border-white/8 pb-2.5">
        <span className="text-[0.7rem] text-ca-text-3">
          <span className="font-semibold text-ca-text-2">Cooldown:</span>{' '}
          {ability.cooldown === 0 ? 'None' : ability.cooldown}
        </span>
        <span className="flex items-center gap-1.5 text-[0.7rem] text-ca-text-3">
          <span className="font-semibold text-ca-text-2">Energy required:</span>{' '}
          <EnergyCostPips ability={ability} />
        </span>
        <span className="w-full text-[0.65rem] text-ca-text-3">
          Classes: {ability.classes.join(', ')}
        </span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const entry = id ? battlePrepRosterById[id] : null

  if (!entry) {
    return (
      <div className="p-4">
        <p className="text-sm text-ca-text-3">Character not found.</p>
        <Link to="/characters" className="ca-mono-label mt-3 block text-[0.44rem] text-ca-teal">
          ← BACK TO ARCHIVE
        </Link>
      </div>
    )
  }

  const fighter = entry.battleTemplate
  const allSkills = fighter.abilities.slice(0, 3)
  const ultimate = fighter.ultimate
  const allAbilities = [...allSkills, ultimate].filter(Boolean)
  const passives = fighter.passiveEffects ?? []
  const unlockLabel = fighter.affiliationLabel || (entry.rarity === 'SSR' ? 'Mission required' : 'Available by default')

  return (
    <div className="p-4 space-y-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 pb-3">
        <Link to="/characters" className="ca-mono-label text-[0.42rem] text-ca-text-3 hover:text-ca-teal">
          CHARACTERS & SKILLS
        </Link>
        <span className="ca-mono-label text-[0.42rem] text-ca-text-3">/</span>
        <span className="ca-mono-label text-[0.42rem] text-ca-text-2">{entry.name.toUpperCase()}</span>
      </div>

      {/* Character card — Naruto-Arena faithful layout */}
      <div className="rounded-[5px] border border-white/10 bg-[rgba(16,14,22,0.92)] overflow-hidden">

        {/* ── Identity header ── */}
        <div className="border-b border-dotted border-white/10 px-4 py-4">
          {/* Character name with grade star prefix */}
          <p className="mb-3 font-semibold text-[0.9rem] text-ca-text">
            <span className={[
              'mr-1',
              entry.rarity === 'SSR' ? 'text-ca-red' : entry.rarity === 'SR' ? 'text-blue-400' : 'text-ca-text-3',
            ].join(' ')}>
              {entry.rarity === 'SSR' ? '✦' : entry.rarity === 'SR' ? '★' : '·'}
            </span>
            {entry.name}
            {fighter.battleTitle ? (
              <span className="ml-2 text-[0.75rem] font-normal text-ca-text-3">({fighter.battleTitle})</span>
            ) : null}
          </p>

          {/* Portrait + bio */}
          <div className="flex gap-4">
            <div className="shrink-0">
              <CharacterFacePortrait
                characterId={entry.id}
                name={entry.name}
                src={entry.facePortrait}
                rarity={entry.rarity}
                size="lg"
                className="h-[6.5rem] w-[6.5rem]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.78rem] leading-[1.6] text-ca-text-2">
                {fighter.bio || 'No biography authored.'}
              </p>
            </div>
          </div>

          {/* Stats line */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-dotted border-white/8 pt-2.5 text-[0.72rem] text-ca-text-3">
            <span><span className="text-ca-text-2 font-medium">Max Health:</span> {fighter.maxHp}</span>
            <span><span className="text-ca-text-2 font-medium">Requirements to Unlock:</span> {unlockLabel}</span>
          </div>
        </div>

        {/* ── Passives ── */}
        {passives.length > 0 ? (
          <div className="border-b border-dotted border-white/10 px-4 py-3 space-y-2">
            {passives.map((passive, i) => (
              <div key={i}>
                <p className="text-[0.78rem] font-semibold text-ca-teal">{passive.label}</p>
                {passive.description ? (
                  <p className="mt-0.5 text-[0.72rem] leading-[1.55] text-ca-text-2">{passive.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Skills — 2-column grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {allAbilities.map((ability, i) => {
            const isUlt = ability.id === ultimate?.id
            const isRight = i % 2 === 1
            const isBottom = i >= 2
            return (
              <div
                key={ability.id}
                className={[
                  'px-4 py-3',
                  isRight ? 'sm:border-l sm:border-dotted sm:border-white/10' : '',
                  isBottom ? 'border-t border-dotted border-white/10' : '',
                ].join(' ')}
              >
                <SkillBlock ability={ability} isUltimate={isUlt} />
              </div>
            )
          })}
        </div>

      </div>

      {/* Back link */}
      <div className="pt-3">
        <Link to="/characters" className="ca-mono-label text-[0.44rem] text-ca-text-3 hover:text-ca-teal">
          ← BACK TO CHARACTER ARCHIVE
        </Link>
      </div>
    </div>
  )
}
