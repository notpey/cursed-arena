import { Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { normalizeBattleAssetSrc } from '@/features/battle/assets'
import { getAbilityEnergyCost } from '@/features/battle/energy'
import type { BattleAbilityTemplate } from '@/features/battle/types'
import type { BattlePrepRosterEntry } from '@/features/battle/prep'
import type { MissionWithProgress } from '@/features/missions/store'
import type { MatchHistoryEntry } from '@/features/battle/matches'
import { formatMatchTimestamp, getModeLabel } from '@/features/battle/matches'
import homeBgBase from '@/assets/backgrounds/home-bg-base.webp'
import yujiRender from '@/assets/renders/Yuji_Itadori_Cursed_Clash.webp'
import megumiRender from '@/assets/renders/Megumi_Fushiguro_Cursed_Clash.webp'
import nobaraRender from '@/assets/renders/Nobara_Kugisaki_Cursed_Clash.webp'
import gojoRender from '@/assets/renders/Satoru_Gojo_Cursed_Clash.webp'
import todoRender from '@/assets/renders/Aoi_Todo_Cursed_Clash.webp'
import nanamiRender from '@/assets/renders/Kento_Nanami_Cursed_Clash.webp'
import makiRender from '@/assets/renders/Maki_Zenin_Cursed_Clash.webp'
import pandaRender from '@/assets/renders/Panda_29.webp'
import togeRender from '@/assets/renders/Toge_Inumaki_Cursed_Clash.webp'
import mahitoRender from '@/assets/renders/Mahito_Cursed_Clash.webp'
import jogoRender from '@/assets/renders/Jogo_Cursed_Clash.webp'
import hanamiRender from '@/assets/renders/Hanami_Cursed_Clash.webp'
import miwaRender from '@/assets/renders/Kasumi_Miwa_Cursed_Clash.webp'
import maiRender from '@/assets/renders/Mai_Zenin_Cursed_Clash.webp'
import noritoshiRender from '@/assets/renders/Noritoshi_Kamo_Cursed_Clash.webp'
import mechamaruRender from '@/assets/renders/Mechamaru_Ultimate_29.webp'

export { homeBgBase }
export { battlePrepRoster, battlePrepRosterById } from '@/features/battle/prep'

const fighterRenderMap: Record<string, string> = {
  yuji: yujiRender,
  megumi: megumiRender,
  nobara: nobaraRender,
  gojo: gojoRender,
  todo: todoRender,
  nanami: nanamiRender,
  maki: makiRender,
  panda: pandaRender,
  toge: togeRender,
  mahito: mahitoRender,
  jogo: jogoRender,
  hanami: hanamiRender,
  miwa: miwaRender,
  mai: maiRender,
  noritoshi: noritoshiRender,
  mechamaru: mechamaruRender,
}

const rarityTone: Record<string, { border: string; wash: string; text: string }> = {
  SSR: { border: 'rgba(250,39,66,0.42)', wash: 'rgba(250,39,66,0.12)', text: 'var(--red-primary)' },
  SR: { border: 'rgba(59,130,246,0.34)', wash: 'rgba(59,130,246,0.1)', text: 'var(--rarity-rare)' },
  R: { border: 'rgba(107,107,128,0.28)', wash: 'rgba(107,107,128,0.1)', text: 'var(--text-secondary)' },
  UR: { border: 'rgba(245,166,35,0.42)', wash: 'rgba(245,166,35,0.12)', text: 'var(--warning)' },
}

export function getFighterRenderSrc(entry: BattlePrepRosterEntry | { id: string; battleTemplate?: { boardPortraitSrc?: string } }) {
  return fighterRenderMap[entry.id] ?? normalizeBattleAssetSrc(entry.battleTemplate?.boardPortraitSrc)
}

export function SiteSectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-dotted border-white/12 pb-2">
      <div>
        <p className="ca-mono-label text-[0.48rem] text-ca-text-3">{eyebrow}</p>
        <h2 className="ca-display mt-1 text-[1.55rem] leading-none tracking-[0.05em] text-ca-text">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function IllustratedSiteCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`relative overflow-hidden rounded-[7px] border border-white/10 bg-[rgba(30,28,36,0.58)] shadow-[0_10px_24px_rgba(0,0,0,0.14)] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_8%_12%,rgba(250,39,66,0.045),transparent_58%),radial-gradient(72%_90%_at_96%_6%,rgba(5,216,189,0.045),transparent_60%)]" />
      <div className="relative">{children}</div>
    </section>
  )
}

export function StylizedPortraitPlaceholder({
  label,
  tone = 'teal',
  className = '',
}: {
  label: string
  tone?: 'red' | 'teal' | 'gold' | 'frost'
  className?: string
}) {
  const toneClass =
    tone === 'red'
      ? 'border-ca-red/28 text-ca-red'
      : tone === 'gold'
        ? 'border-ca-gold/28 text-ca-gold'
        : tone === 'frost'
          ? 'border-white/16 text-ca-text-2'
          : 'border-ca-teal/28 text-ca-teal'

  return (
    <div className={`relative grid place-items-center overflow-hidden rounded-[8px] border bg-[linear-gradient(180deg,rgba(31,29,40,0.88),rgba(10,10,16,0.96))] ${toneClass} ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,currentColor,transparent_58%)] opacity-[0.08]" />
      <div className="absolute inset-x-3 top-3 h-px bg-current opacity-20" />
      <div className="absolute inset-x-5 bottom-4 h-px bg-current opacity-20" />
      <span className="ca-display relative text-[1.45rem] leading-none opacity-80">{label.slice(0, 2).toUpperCase()}</span>
    </div>
  )
}

export function FighterPortrait({
  entry,
  className = '',
  imgClassName = '',
}: {
  entry: BattlePrepRosterEntry
  className?: string
  imgClassName?: string
}) {
  const src = getFighterRenderSrc(entry)
  const frame = entry.portraitFrame ?? entry.battleTemplate.boardPortraitFrame ?? entry.battleTemplate.portraitFrame ?? {}
  const tone = rarityTone[entry.rarity] ?? rarityTone.R

  return (
    <div
      className={`relative overflow-hidden rounded-[8px] border bg-[linear-gradient(180deg,rgba(22,20,30,0.95),rgba(8,8,13,0.98))] ${className}`}
      style={{ borderColor: tone.border }}
    >
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 24%, ${tone.wash}, transparent 66%)` }} />
      {src ? (
        <img
          src={src}
          alt={entry.name}
          className={`absolute left-1/2 top-[-2%] h-auto w-[132%] max-w-none select-none object-contain ${imgClassName}`}
          style={{
            opacity: frame.opacity ?? 1,
            transform: `translate(-50%, 0) translate(${frame.x ?? '0%'}, calc(${frame.y ?? '0%'} - 7%)) scale(${(frame.scale ?? 1) * 1.18})`,
            transformOrigin: 'top center',
          }}
          draggable={false}
        />
      ) : (
        <StylizedPortraitPlaceholder label={entry.battleTemplate.shortName} tone={entry.rarity === 'SSR' ? 'red' : 'teal'} className="absolute inset-0 rounded-none border-0" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.38))]" />
    </div>
  )
}

export function FeaturedFighterCard({ entry, compact = false }: { entry: BattlePrepRosterEntry; compact?: boolean }) {
  const tone = rarityTone[entry.rarity] ?? rarityTone.R
  const firstAbility = entry.battleTemplate.abilities[0]

  return (
    <Link
      to="/characters"
      className="group block overflow-hidden rounded-[7px] border bg-[rgba(14,15,20,0.42)] transition duration-200 hover:-translate-y-0.5 hover:bg-[rgba(20,20,28,0.55)]"
      style={{ borderColor: tone.border }}
    >
      <div className={compact ? 'grid grid-cols-[4rem_minmax(0,1fr)]' : 'grid grid-cols-[4.25rem_minmax(0,1fr)]'}>
        <CharacterFacePortrait
          characterId={entry.id}
          name={entry.name}
          src={entry.facePortrait}
          rarity={entry.rarity}
          size={compact ? 'md' : 'md'}
          className="h-full min-h-[4rem] w-full rounded-none border-0"
        />
        <div className="min-w-0 p-2.5">
          <div className="flex items-center gap-2">
            <span className="ca-mono-label rounded-[4px] border px-1.5 py-1 text-[0.38rem]" style={{ borderColor: tone.border, background: tone.wash, color: tone.text }}>
              {entry.gradeLabel}
            </span>
            <span className="ca-mono-label truncate text-[0.4rem] text-ca-text-3">{entry.role}</span>
          </div>
          <p className="ca-display mt-2 truncate text-[1.15rem] leading-none text-ca-text group-hover:text-ca-teal">{entry.name}</p>
          {firstAbility ? <p className="mt-1 truncate text-xs text-ca-text-3">{firstAbility.name}</p> : null}
        </div>
      </div>
    </Link>
  )
}

export function FighterStrip({ entries }: { entries: BattlePrepRosterEntry[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <FeaturedFighterCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

export function AbilityChip({ ability }: { ability: BattleAbilityTemplate }) {
  const cost = getAbilityEnergyCost(ability)
  const totalCost = Object.values(cost).reduce((sum, value) => sum + (value ?? 0), 0)
  const tone = ability.icon.tone

  return (
    <div className="rounded-[7px] border border-white/8 bg-white/[0.025] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className={['ca-mono-label rounded-[4px] border px-1.5 py-1 text-[0.38rem]', tone === 'red' ? 'border-ca-red/24 bg-ca-red-wash text-ca-red' : tone === 'gold' ? 'border-ca-gold/24 bg-ca-gold/10 text-ca-gold' : 'border-ca-teal/24 bg-ca-teal-wash text-ca-teal'].join(' ')}>
          {ability.icon.label}
        </span>
        <span className="ca-mono-label text-[0.4rem] text-ca-text-3">CE {totalCost}</span>
      </div>
      <p className="mt-2 truncate font-[var(--font-display-alt)] text-[0.82rem] font-bold text-ca-text">{ability.name}</p>
      <p className="mt-1 ca-mono-label text-[0.38rem] text-ca-text-3">
        CD {ability.cooldown} / {ability.classes.slice(0, 2).join(', ')}
      </p>
    </div>
  )
}

export function ManualEntryCard({
  title,
  label,
  body,
  tone = 'teal',
}: {
  title: string
  label: string
  body: string
  tone?: 'red' | 'teal' | 'gold' | 'frost'
}) {
  return (
    <Link to="/manual" className="group grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[7px] border border-white/8 bg-white/[0.025] p-2.5 transition duration-150 hover:-translate-y-0.5 hover:border-white/16">
      <StylizedPortraitPlaceholder label={label} tone={tone} className="h-11 w-11 rounded-[6px]" />
      <div className="min-w-0">
        <p className="ca-display text-[1.08rem] leading-none text-ca-text group-hover:text-ca-teal">{title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-ca-text-3">{body}</p>
      </div>
      <span className="ca-mono-label hidden text-[0.38rem] text-ca-teal sm:block">READ</span>
    </Link>
  )
}

export function MissionSpotlightCard({
  mission,
  rewardEntry,
  completed,
  total,
}: {
  mission: MissionWithProgress | null
  rewardEntry?: BattlePrepRosterEntry
  completed: number
  total: number
}) {
  const progress = mission ? Math.round((mission.progress / Math.max(1, mission.goal)) * 100) : 0

  return (
    <IllustratedSiteCard>
      <div className="grid gap-3 p-3 sm:grid-cols-[4.75rem_minmax(0,1fr)]">
        {rewardEntry ? (
          <CharacterFacePortrait
            characterId={rewardEntry.id}
            name={rewardEntry.name}
            src={rewardEntry.facePortrait}
            rarity={rewardEntry.rarity}
            size="lg"
            className="h-full min-h-[4.75rem] w-full"
          />
        ) : (
          <StylizedPortraitPlaceholder label="MS" tone="gold" className="aspect-square" />
        )}
        <div className="min-w-0">
          <SiteSectionHeader
            eyebrow="Unlock Mission"
            title={mission?.label ?? 'Mission Board'}
            action={<span className="ca-mono-label text-[0.45rem] text-ca-teal">{completed}/{total}</span>}
          />
          <p className="text-sm leading-6 text-ca-text-2">
            {mission ? `${mission.progressLabel}. Reward: ${mission.reward} cursed coins.` : 'Complete mission goals to unlock fighters and build a deeper roster.'}
          </p>
          <ProgressBar value={progress} tone={mission?.complete ? 'teal' : 'gold'} className="mt-3" />
          <Link to="/missions" className="ca-display mt-4 inline-flex rounded-[7px] border border-ca-teal/22 bg-ca-teal-wash px-3 py-2 text-[1rem] text-ca-teal">
            Open Missions
          </Link>
        </div>
      </div>
    </IllustratedSiteCard>
  )
}

export function LadderSnapshotCard({
  level,
  rankTitle,
  wins,
  losses,
  winRate,
  entries,
}: {
  level: number
  rankTitle: string
  wins: number
  losses: number
  winRate: number
  entries: BattlePrepRosterEntry[]
}) {
  return (
    <IllustratedSiteCard>
      <div className="p-3">
        <SiteSectionHeader eyebrow="Ladder Snapshot" title={`Lv ${level} / ${rankTitle}`} />
        <div className="grid grid-cols-3 gap-2">
          <ReadoutTile label="Record" value={`${wins}W/${losses}L`} />
          <ReadoutTile label="Win Rate" value={`${winRate}%`} />
          <ReadoutTile label="Queue" value="Ranked" />
        </div>
        <div className="mt-3 flex -space-x-2">
          {entries.slice(0, 4).map((entry) => (
            <CharacterFacePortrait
              key={entry.id}
              characterId={entry.id}
              name={entry.name}
              src={entry.facePortrait}
              rarity={entry.rarity}
              size="sm"
              className="rounded-full"
            />
          ))}
        </div>
        <Link to="/ladders" className="ca-display mt-4 inline-flex rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[1rem] text-ca-text-2">
          View Ladders
        </Link>
      </div>
    </IllustratedSiteCard>
  )
}

export function RecentBattleRow({
  match,
  entries,
}: {
  match: MatchHistoryEntry
  entries: BattlePrepRosterEntry[]
}) {
  return (
    <Link to="/battle/results" className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] border border-white/8 bg-white/[0.025] px-3 py-2 transition duration-150 hover:border-white/16">
      <div className="flex -space-x-1.5">
        {entries.slice(0, 3).map((entry) => (
          <CharacterFacePortrait
            key={entry.id}
            characterId={entry.id}
            name={entry.name}
            src={entry.facePortrait}
            rarity={entry.rarity}
            size="xs"
            className="rounded-full"
          />
        ))}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={['ca-mono-label text-[0.46rem]', match.result === 'WIN' ? 'text-ca-teal' : match.result === 'DRAW' ? 'text-ca-gold' : 'text-ca-red'].join(' ')}>
            {match.result}
          </span>
          <span className="ca-mono-label truncate text-[0.44rem] text-ca-text-2">{getModeLabel(match.mode)} vs {match.opponentName}</span>
        </div>
        <p className="mt-1 ca-mono-label text-[0.38rem] text-ca-text-3">
          {match.rounds} rounds / {match.mode === 'ranked' ? `${match.experienceDelta >= 0 ? '+' : ''}${match.experienceDelta} XP` : 'unranked'}
        </p>
      </div>
      <span className="ca-mono-label hidden text-[0.38rem] text-ca-text-3 sm:block">{formatMatchTimestamp(match.timestamp)}</span>
    </Link>
  )
}

export function ReadoutTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[7px] border border-white/8 bg-white/[0.025] px-2.5 py-2">
      <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</p>
      <p className="ca-display mt-1 truncate text-[1.25rem] leading-none text-ca-text">{value}</p>
    </div>
  )
}

export function siteArtBackgroundStyle(image = homeBgBase): CSSProperties {
  return { backgroundImage: `url(${image})` }
}
