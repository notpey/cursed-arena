import { Link } from 'react-router-dom'
import { CharacterFacePortrait } from '@/components/characters/CharacterFacePortrait'
import {
  AbilityChip,
  IllustratedSiteCard,
  ManualEntryCard,
  ReadoutTile,
  SiteSectionHeader,
  battlePrepRoster,
  battlePrepRosterById,
} from '@/components/site/siteVisuals'
import { battleEnergyMeta, battleEnergyOrder } from '@/features/battle/energy'

const manualSections = [
  {
    title: 'The Basics',
    label: '01',
    body: 'Pick three fighters and defeat the opposing team through short simultaneous rounds.',
    tone: 'teal' as const,
  },
  {
    title: 'Characters & Skills',
    label: 'CS',
    body: 'Read HP, role, passives, target rules, costs, cooldowns, classes, and ultimates.',
    tone: 'red' as const,
  },
  {
    title: 'Cursed Energy',
    label: 'CE',
    body: 'Technique, physical, vow, mental, and reserve pips pay for actions each round.',
    tone: 'gold' as const,
  },
  {
    title: 'Skill Classes',
    label: 'SC',
    body: 'Melee, ranged, piercing, control, instant, unique, and ultimate tags shape counters.',
    tone: 'frost' as const,
  },
  {
    title: 'Ladders',
    label: 'LD',
    body: 'Ranked battles affect profile progress, standing, streaks, and match history.',
    tone: 'teal' as const,
  },
  {
    title: 'Missions',
    label: 'MS',
    body: 'Complete roster goals to unlock fighters and earn cursed coins.',
    tone: 'red' as const,
  },
  {
    title: 'Clans',
    label: 'CL',
    body: 'Community houses support identity, recruitment, and future clan ladder systems.',
    tone: 'gold' as const,
  },
  {
    title: 'FAQ',
    label: '??',
    body: 'A compact reference for common battle, account, and progression questions.',
    tone: 'frost' as const,
  },
]

export function ManualPage() {
  const exampleFighter = battlePrepRosterById.megumi ?? battlePrepRoster[0]
  const exampleAbilities = exampleFighter?.battleTemplate.abilities.slice(0, 3) ?? []

  return (
    <div className="space-y-3">
      <PageIntro />

      <IllustratedSiteCard>
        <div className="p-3">
          <SiteSectionHeader
            eyebrow="Manual Index"
            title="Player Reference"
            action={<Link to="/battle/prep" className="ca-mono-label text-[0.44rem] text-ca-red">START PLAYING</Link>}
          />
          <div className="grid gap-2 md:grid-cols-2">
            {manualSections.map((section) => (
              <ManualEntryCard key={section.title} {...section} />
            ))}
          </div>
        </div>
      </IllustratedSiteCard>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        {exampleFighter ? (
          <IllustratedSiteCard>
            <div className="p-3">
              <SiteSectionHeader eyebrow="Character File Example" title={exampleFighter.name} />
              <div className="grid gap-3 md:grid-cols-[5rem_minmax(0,1fr)]">
                <CharacterFacePortrait
                  characterId={exampleFighter.id}
                  name={exampleFighter.name}
                  src={exampleFighter.facePortrait}
                  rarity={exampleFighter.rarity}
                  size="lg"
                  className="h-20 w-20"
                />
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-ca-text-2">{exampleFighter.battleTemplate.bio}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <ReadoutTile label="HP" value={exampleFighter.battleTemplate.maxHp} />
                    <ReadoutTile label="Grade" value={exampleFighter.gradeLabel} />
                    <ReadoutTile label="Role" value={exampleFighter.role.split('/')[0] ?? exampleFighter.role} />
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {exampleAbilities.map((ability) => (
                  <AbilityChip key={ability.id} ability={ability} />
                ))}
              </div>
            </div>
          </IllustratedSiteCard>
        ) : null}

        <IllustratedSiteCard>
          <div className="p-3">
            <SiteSectionHeader eyebrow="Energy Types" title="Cursed Energy" />
            <div className="divide-y divide-dotted divide-white/12 rounded-[6px] border border-white/8 bg-white/[0.02]">
              {battleEnergyOrder.map((type) => {
                const meta = battleEnergyMeta[type]
                return (
                  <div key={type} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: meta.color }} />
                      <span className="ca-mono-label truncate text-[0.44rem] text-ca-text-2">{meta.label}</span>
                    </span>
                    <span className="ca-mono-label text-[0.4rem] text-ca-text-3">{meta.short}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </IllustratedSiteCard>
      </div>
    </div>
  )
}

function PageIntro() {
  return (
    <section className="rounded-[7px] border border-white/10 bg-[rgba(30,28,36,0.58)] px-4 py-3">
      <p className="ca-mono-label text-[0.46rem] text-ca-teal">MANUAL / INDEX</p>
      <h1 className="ca-display mt-1 text-[2.25rem] leading-none tracking-[0.06em] text-ca-text">Game Manual</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ca-text-2">
        A compact guide to Cursed-Arena’s Naruto-Arena-style 3v3 flow: fighter files, skill classes, energy costs, missions, ladders, and community systems.
      </p>
    </section>
  )
}
