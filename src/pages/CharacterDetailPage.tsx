import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EnergyCostRow } from '@/components/battle/BattleEnergy'
import { getCharacterProfileById } from '@/data/characters'
import type {
  CharacterDetailProfile,
  CharacterPassive,
  CharacterRarity,
  CharacterSkill
} from '@/types/characters'

type DetailTab = 'OVERVIEW' | 'SKILLS' | 'LORE'

const detailTabs: DetailTab[] = ['OVERVIEW', 'SKILLS', 'LORE']

const rarityTheme: Record<
  CharacterRarity,
  {
    glow: string
    glowSoft: string
    chipBorder: string
    chipBg: string
    chipText: string
    wallpaperOpacity: number
  }
> = {
  SSR: {
    glow: 'rgba(250,39,66,0.28)',
    glowSoft: 'rgba(250,39,66,0.12)',
    chipBorder: 'rgba(245,166,35,0.28)',
    chipBg: 'rgba(245,166,35,0.12)',
    chipText: 'var(--warning)',
    wallpaperOpacity: 0.11,
  },
  SR: {
    glow: 'rgba(59,130,246,0.24)',
    glowSoft: 'rgba(59,130,246,0.1)',
    chipBorder: 'rgba(59,130,246,0.25)',
    chipBg: 'rgba(59,130,246,0.1)',
    chipText: 'var(--rarity-rare)',
    wallpaperOpacity: 0.11,
  },
  R: {
    glow: 'rgba(107,107,128,0.12)',
    glowSoft: 'rgba(107,107,128,0.06)',
    chipBorder: 'rgba(107,107,128,0.22)',
    chipBg: 'rgba(107,107,128,0.08)',
    chipText: 'var(--text-secondary)',
    wallpaperOpacity: 0.1,
  },
}

export function CharacterDetailPage() {
  const { characterId } = useParams()
  const [activeTab, setActiveTab] = useState<DetailTab>('OVERVIEW')
  const [openVoiceLineId, setOpenVoiceLineId] = useState<string | null>(null)

  const profile = characterId ? getCharacterProfileById(characterId) : null

  if (!profile) {
    return (
      <section className="grid min-h-[calc(100vh-8rem)] place-items-center py-6">
        <div className="ca-card w-full max-w-xl p-8 text-center">
          <p className="ca-mono-label text-[0.58rem] text-ca-text-3">Character Detail</p>
          <h1 className="ca-display mt-3 text-5xl text-ca-text">Profile Not Found</h1>
          <p className="mt-3 text-sm text-ca-text-2">
            This character profile is not available in the current mock roster data.
          </p>
          <Link
            to="/battle/prep"
            className="ca-mono-label mt-6 inline-flex rounded-md border border-white/10 px-3 py-2 text-[0.55rem] text-ca-text-2 hover:border-ca-teal/35 hover:text-ca-teal"
          >
            {'<-'} ARENA
          </Link>
        </div>
      </section>
    )
  }

  const theme = rarityTheme[profile.rarity]

  return (
    <section className="h-full min-h-0 py-4 sm:py-6">
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] xl:gap-5">
        <div className="min-h-0 rounded-[12px] border border-white/8 bg-[rgba(14,14,20,0.26)] backdrop-blur-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-white/6 px-4 py-4 sm:px-5">
              <Link
                to="/battle/prep"
                className="ca-mono-label inline-flex items-center gap-2 text-[0.55rem] text-ca-text-3 hover:text-ca-text-2"
              >
                {'<-'} ARENA
              </Link>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-white/6 pb-3">
                {detailTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={[
                      'ca-mono-label relative pb-2 text-[0.55rem] transition',
                      activeTab === tab ? 'text-ca-text' : 'text-ca-text-3 hover:text-ca-text-2',
                    ].join(' ')}
                  >
                    {tab}
                    {activeTab === tab ? <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-ca-red" /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {activeTab === 'OVERVIEW' ? <OverviewTab profile={profile} /> : null}
              {activeTab === 'SKILLS' ? <SkillsTab profile={profile} /> : null}
              {activeTab === 'LORE' ? (
                <LoreTab
                  profile={profile}
                  openVoiceLineId={openVoiceLineId}
                  onToggleVoiceLine={(id) => setOpenVoiceLineId((current) => (current === id ? null : id))}
                />
              ) : null}
            </div>
          </div>
        </div>

        <CharacterDisplayPanel profile={profile} theme={theme} />
      </div>
    </section>
  )
}

function OverviewTab({ profile }: { profile: CharacterDetailProfile }) {
  return (
    <div className="space-y-5">
      <section className="rounded-[10px] border border-white/8 bg-[rgba(18,18,24,0.22)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ca-display text-3xl text-ca-text sm:text-[2.2rem]">{profile.name}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <RarityBadge profile={profile} />
              {profile.role ? (
                <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.48rem] text-ca-text-2">
                  {profile.role}
                </span>
              ) : null}
              {profile.archetypes.map((tag) => (
                <span
                  key={tag}
                  className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2 py-1 text-[0.48rem] text-ca-teal"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-ca-text-2">{profile.passive.description}</p>
      </section>

      <section className="grid gap-3 rounded-[10px] border border-white/8 bg-[rgba(18,18,24,0.2)] p-4 sm:grid-cols-2">
        <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">BATTLE HP</p>
          <p className="ca-display mt-2 text-3xl text-ca-text">{profile.hp}</p>
        </div>
        <div className="rounded-[8px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
          <p className="ca-mono-label text-[0.42rem] text-ca-text-3">FIGHT STYLE</p>
          <p className="ca-display mt-2 text-3xl text-ca-text">{profile.role ?? 'SORCERER'}</p>
        </div>
      </section>

      <section className="rounded-[10px] border border-white/8 bg-[rgba(18,18,24,0.2)] p-4">
        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">TACTICAL SUMMARY</p>
        <div className="mt-3 space-y-3 text-sm leading-6 text-ca-text-2">
          <p>This profile is intentionally battle-first. Costs, cooldowns, targets, classes, and passive behavior live in the skill sheet rather than secondary stat systems.</p>
          <p>Use this page to read the fighter's role, passive identity, and full technique kit before building a trio in the arena lobby.</p>
        </div>
      </section>
    </div>
  )
}

function SkillsTab({ profile }: { profile: CharacterDetailProfile }) {
  return (
    <div className="space-y-3">
      <PassiveCard passive={profile.passive} />
      {profile.skills.map((skill) => (
        <SkillCard key={skill.id} skill={skill} />
      ))}
      <UltimateCard skill={profile.ultimate} />
    </div>
  )
}

function LoreTab({
  profile,
  openVoiceLineId,
  onToggleVoiceLine,
}: {
  profile: CharacterDetailProfile
  openVoiceLineId: string | null
  onToggleVoiceLine: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-[10px] border border-white/8 bg-[rgba(18,18,24,0.2)] p-4">
        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">BACKSTORY</p>
        <div className="mt-3 space-y-3 text-sm leading-6 text-ca-text-2">
          {profile.lore.backstory.map((paragraph, index) => (
            <p key={`${profile.id}-lore-${index}`}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="rounded-[10px] border border-white/8 bg-[rgba(18,18,24,0.2)] p-4">
        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">VOICE LINES</p>
        <div className="mt-3 space-y-2">
          {profile.lore.voiceLines.map((line) => {
            const isOpen = openVoiceLineId === line.id
            return (
              <div key={line.id} className="rounded-[10px] border border-white/8 bg-[rgba(17,17,23,0.14)]">
                <button
                  type="button"
                  onClick={() => onToggleVoiceLine(line.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-[rgba(255,255,255,0.02)] text-[0.65rem] text-ca-text-2">
                      {'>'}
                    </span>
                    <span className="ca-mono-label text-[0.5rem] text-ca-text-2">{line.title}</span>
                  </span>
                  <span className="ca-mono-label text-[0.45rem] text-ca-text-3">{isOpen ? 'HIDE' : 'SHOW'}</span>
                </button>
                {isOpen ? <p className="px-3 pb-3 text-sm text-ca-text-2">{line.text}</p> : null}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function CharacterDisplayPanel({
  profile,
  theme,
}: {
  profile: CharacterDetailProfile
  theme: (typeof rarityTheme)[CharacterRarity]
}) {
  const frame = profile.detailRenderFrame ?? {}
  const maxWidth = frame.maxWidth ?? '36rem'
  const renderScale = (frame.scale ?? 1) * 1.14
  const renderX = frame.x ?? '0%'
  const renderY = frame.y ?? '4%'
  const wallpaperX = frame.nameOffsetX ?? '4%'
  const wallpaperY = frame.nameOffsetY ?? '-44%'

  return (
    <aside className="relative min-h-[30rem] overflow-hidden rounded-[12px] border border-white/8 bg-[rgba(15,15,20,0.24)] backdrop-blur-sm xl:min-h-0">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,15,0.08),rgba(10,10,15,0.45))]" />

      <div
        className="absolute h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          left: '62%',
          top: '38%',
          background: `radial-gradient(circle, ${theme.glow} 0%, ${theme.glowSoft} 38%, transparent 72%)`,
        }}
      />
      <div
        className="absolute h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{
          left: '59%',
          top: '30%',
          background:
            profile.rarity === 'SSR'
              ? 'radial-gradient(circle, rgba(228,230,239,0.16), transparent 72%)'
              : profile.rarity === 'SR'
                ? 'radial-gradient(circle, rgba(228,230,239,0.1), transparent 72%)'
                : 'radial-gradient(circle, rgba(228,230,239,0.06), transparent 72%)',
        }}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_65%_at_78%_22%,rgba(228,230,239,0.08),transparent_62%),radial-gradient(50%_50%_at_82%_26%,rgba(5,216,189,0.04),transparent_68%)]" />

      <div className="pointer-events-none absolute left-1/2 top-[42%] z-[1] -translate-x-1/2 -translate-y-1/2">
        <p
          className="ca-display leading-none tracking-[0.08em] text-white [mask-image:linear-gradient(90deg,transparent_0%,black_10%,black_90%,transparent_100%)]"
          style={{
            opacity: theme.wallpaperOpacity,
            fontSize: 'clamp(5.5rem, 9vw, 10rem)',
            transform: `translate(${wallpaperX}, ${wallpaperY})`,
          }}
        >
          {profile.name.toUpperCase()}
        </p>
      </div>

      <div className="absolute inset-0 z-[2] overflow-hidden">
        <div
          className="absolute left-1/2 top-[4%]"
          style={{
            width: maxWidth,
            maxWidth: '92%',
            transform: `translate(-50%, 0) translate(${renderX}, ${renderY}) scale(${renderScale})`,
            transformOrigin: 'top center',
          }}
        >
          <img
            src={profile.renderSrc}
            alt={profile.name}
            className="block h-auto w-full object-contain object-top select-none"
            draggable={false}
            style={{
              filter:
                'drop-shadow(0 24px 28px rgba(0,0,0,0.28)) drop-shadow(0 -4px 20px rgba(228,230,239,0.12)) drop-shadow(0 0 24px rgba(228,230,239,0.07))',
            }}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-[42%] bg-[linear-gradient(180deg,rgba(9,10,14,0)_0%,rgba(9,10,14,0.08)_16%,rgba(9,10,14,0.36)_42%,rgba(9,10,14,0.72)_74%,rgba(9,10,14,0.92)_100%)]" />
    </aside>
  )
}

function RarityBadge({ profile }: { profile: CharacterDetailProfile }) {
  const theme = rarityTheme[profile.rarity]
  return (
    <span
      className="ca-mono-label rounded-md border px-2 py-1 text-[0.5rem]"
      style={{ borderColor: theme.chipBorder, background: theme.chipBg, color: theme.chipText }}
    >
      {profile.gradeLabel}
    </span>
  )
}

function SkillCard({ skill }: { skill: CharacterSkill }) {
  const typeColor =
    skill.type === 'ATK'
      ? 'rgba(250,39,66,0.18)'
      : skill.type === 'DEF'
        ? 'rgba(5,216,189,0.14)'
        : skill.type === 'STN'
          ? 'rgba(245,166,35,0.14)'
          : 'rgba(155,109,255,0.14)'

  return (
    <section className="rounded-[10px] border border-white/8 bg-[rgba(18,18,24,0.2)] p-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-white/10" style={{ background: typeColor }}>
          <span className="ca-mono-label text-[0.45rem] text-ca-text-2">{skill.type}</span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-[var(--font-display-alt)] text-[0.9rem] font-bold text-ca-text">{skill.name}</p>
            {skill.energyCost ? <EnergyCostRow cost={skill.energyCost} compact /> : <span className="ca-mono-label text-[0.48rem] text-ca-teal">{skill.ceCost} CE</span>}
            {typeof skill.basePower === 'number' ? <MetaTag>{`BASE ${skill.basePower}`}</MetaTag> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-ca-text-2">{skill.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {skill.targetLabel ? <MetaTag>{skill.targetLabel}</MetaTag> : null}
            {skill.classes?.map((entry) => (
              <MetaTag key={`${skill.id}-${entry}`}>{entry}</MetaTag>
            ))}
          </div>
        </div>
        <span className="ca-mono-label text-[0.45rem] text-ca-text-3">{skill.cooldown ? `CD ${skill.cooldown}` : '-'}</span>
      </div>
    </section>
  )
}

function UltimateCard({ skill }: { skill: CharacterDetailProfile['ultimate'] }) {
  return (
    <section className="rounded-[10px] border border-amber-400/25 bg-[linear-gradient(90deg,rgba(245,166,35,0.08),rgba(18,18,24,0.24))] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="ca-mono-label rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[0.45rem] text-amber-300">ULTIMATE</span>
        {skill.energyCost ? <EnergyCostRow cost={skill.energyCost} compact /> : <span className="ca-mono-label text-[0.48rem] text-ca-text-3">{skill.ceCost} CE</span>}
        {typeof skill.basePower === 'number' ? <MetaTag>{`BASE ${skill.basePower}`}</MetaTag> : null}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-amber-400/20 bg-amber-400/10">
          <span className="ca-mono-label text-[0.45rem] text-amber-300">{skill.type}</span>
        </div>
        <div className="min-w-0">
          <p className="font-[var(--font-display-alt)] text-[0.92rem] font-bold text-ca-text">{skill.name}</p>
          <p className="mt-1 text-xs leading-5 text-ca-text-2">{skill.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {skill.targetLabel ? <MetaTag>{skill.targetLabel}</MetaTag> : null}
            {skill.classes?.map((entry) => (
              <MetaTag key={`${skill.id}-${entry}`}>{entry}</MetaTag>
            ))}
          </div>
        </div>
        <span className="ca-mono-label text-[0.45rem] text-ca-text-3">{skill.cooldown ? `CD ${skill.cooldown}` : '-'}</span>
      </div>
    </section>
  )
}

function PassiveCard({ passive }: { passive: CharacterPassive }) {
  return (
    <section className="rounded-[10px] border border-ca-teal/18 bg-[linear-gradient(90deg,rgba(5,216,189,0.08),rgba(18,18,24,0.22))] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="ca-mono-label rounded-md border border-ca-teal/20 bg-ca-teal-wash px-2 py-1 text-[0.45rem] text-ca-teal">PASSIVE</span>
        {passive.triggerLabel ? <span className="ca-mono-label text-[0.45rem] text-ca-text-3">{passive.triggerLabel}</span> : null}
      </div>
      <p className="font-[var(--font-display-alt)] text-[0.92rem] font-bold text-ca-text">{passive.label}</p>
      <p className="mt-2 text-xs leading-5 text-ca-text-2">{passive.description}</p>
    </section>
  )
}

function MetaTag({ children }: { children: string }) {
  return <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.4rem] text-ca-text-3">{children}</span>
}

