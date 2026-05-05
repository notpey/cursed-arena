import { Link } from 'react-router-dom'
import {
  AbilityChip,
  FighterPortrait,
  IllustratedSiteCard,
  ManualEntryCard,
  ReadoutTile,
  SiteSectionHeader,
  StylizedPortraitPlaceholder,
  battlePrepRoster,
  battlePrepRosterById,
  homeBgBase,
  siteArtBackgroundStyle,
} from '@/components/site/siteVisuals'
import { battleEnergyMeta, battleEnergyOrder } from '@/features/battle/energy'

const manualSections = [
  {
    title: 'The Basics',
    label: '01',
    body: 'Pick three fighters and defeat the opposing team. A match is built from short rounds where both sides commit techniques and resolve the exchange.',
    tone: 'teal' as const,
  },
  {
    title: 'Characters & Skills',
    label: 'CS',
    body: 'Each fighter has HP, role identity, passives, three regular techniques, and one ultimate. Read costs, cooldowns, target rules, and classes before queueing.',
    tone: 'red' as const,
  },
  {
    title: 'Cursed Energy',
    label: 'CE',
    body: 'Energy is the core resource. Technique, physical, vow, mental, and reserve pips determine what your fighters can cast this round.',
    tone: 'gold' as const,
  },
  {
    title: 'Ladders',
    label: 'LD',
    body: 'Ranked battles affect profile progress and ladder standing. Recent match history tracks rounds, teams, opponent, and XP changes.',
    tone: 'frost' as const,
  },
  {
    title: 'Missions',
    label: 'MS',
    body: 'Missions unlock fighters and reward cursed coins. They are designed as roster goals, not daily dashboard chores.',
    tone: 'teal' as const,
  },
  {
    title: 'Clans',
    label: 'CL',
    body: 'Clans group players into community houses for identity, recruitment, and future clan ladder systems.',
    tone: 'red' as const,
  },
]

export function ManualPage() {
  const exampleFighter = battlePrepRosterById.megumi ?? battlePrepRoster[0]
  const exampleAbilities = exampleFighter?.battleTemplate.abilities.slice(0, 3) ?? []

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[10px] border border-white/10 bg-[rgba(14,15,20,0.28)] p-5">
        <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-26" style={siteArtBackgroundStyle(homeBgBase)} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(13,12,17,0.94),rgba(13,12,17,0.68)),radial-gradient(circle_at_88%_18%,rgba(5,216,189,0.15),transparent_46%)]" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
          <div>
            <p className="ca-mono-label text-[0.5rem] text-ca-teal">CURSED TECHNIQUE ARCHIVE</p>
            <h1 className="ca-display mt-2 text-[3.3rem] leading-[0.9] text-ca-text sm:text-[4.6rem]">Game Manual</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-ca-text-2">
              A compact reference for Naruto-Arena-style 3v3 play: team construction, round flow, skill classes, energy costs, missions, ladders, and community systems.
            </p>
          </div>
          <Link
            to="/battle/prep"
            className="ca-display rounded-[8px] border border-ca-red/45 bg-ca-red px-4 py-3 text-center text-[1.55rem] leading-none text-white"
          >
            Start Playing
          </Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <IllustratedSiteCard>
          <div className="p-4">
            <SiteSectionHeader eyebrow="Manual Index" title="Player Reference" />
            <div className="grid gap-2 sm:grid-cols-2">
              {manualSections.map((section) => (
                <ManualEntryCard key={section.title} {...section} />
              ))}
            </div>
          </div>
        </IllustratedSiteCard>

        <IllustratedSiteCard>
          <div className="p-4">
            <SiteSectionHeader eyebrow="Energy Types" title="Cursed Energy" />
            <div className="space-y-2">
              {battleEnergyOrder.map((type) => {
                const meta = battleEnergyMeta[type]
                return (
                  <div key={type} className="flex items-center justify-between gap-3 rounded-[7px] border border-white/8 bg-white/[0.025] px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-[3px]" style={{ background: meta.color }} />
                      <span className="ca-mono-label text-[0.46rem] text-ca-text-2">{meta.label}</span>
                    </span>
                    <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{meta.short}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </IllustratedSiteCard>
      </div>

      {exampleFighter ? (
        <IllustratedSiteCard>
          <div className="grid gap-4 p-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
            <FighterPortrait entry={exampleFighter} className="aspect-[3/4]" />
            <div className="min-w-0">
              <SiteSectionHeader eyebrow="Character File Example" title={exampleFighter.name} />
              <p className="text-sm leading-6 text-ca-text-2">{exampleFighter.battleTemplate.bio}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <ReadoutTile label="HP" value={exampleFighter.battleTemplate.maxHp} />
                <ReadoutTile label="Grade" value={exampleFighter.gradeLabel} />
                <ReadoutTile label="Role" value={exampleFighter.role.split('/')[0] ?? exampleFighter.role} />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {exampleAbilities.map((ability) => (
                  <AbilityChip key={ability.id} ability={ability} />
                ))}
              </div>
            </div>
          </div>
        </IllustratedSiteCard>
      ) : (
        <StylizedPortraitPlaceholder label="CA" tone="teal" className="h-40" />
      )}
    </div>
  )
}
