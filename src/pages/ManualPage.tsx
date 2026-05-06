import { Link } from 'react-router-dom'
import {
  SitePanel,
  SitePanelHeader,
} from '@/components/site/siteVisuals'

const manualSections = [
  {
    key: 'basics',
    title: 'The Basics',
    label: '01',
    desc: 'Rounds, turns, health, energy costs, targeting, cooldowns, and how 3v3 fights resolve.',
    tone: 'teal',
  },
  {
    key: 'characters',
    title: 'Characters & Skills',
    label: 'CS',
    desc: 'Read HP, role, passives, target rules, costs, cooldowns, classes, and ultimates.',
    tone: 'red',
  },
  {
    key: 'classes',
    title: 'Skill Classes',
    label: 'SC',
    desc: 'Melee, ranged, piercing, control, instant, unique, and ultimate tags shape counters.',
    tone: 'teal',
  },
  {
    key: 'ladders',
    title: 'Ladders',
    label: 'LD',
    desc: 'Ranked standings, experience, streaks, and match history.',
    tone: 'gold',
  },
  {
    key: 'missions',
    title: 'Missions',
    label: 'MS',
    desc: 'Unlock characters and earn cursed coins.',
    tone: 'red',
  },
  {
    key: 'clans',
    title: 'Clans',
    label: 'CL',
    desc: 'Join or create a clan and compete on the clan ladder.',
    tone: 'gold',
  },
]

const toneClass: Record<string, { border: string; text: string; bg: string }> = {
  teal: { border: 'border-ca-teal/28', text: 'text-ca-teal', bg: 'bg-ca-teal-wash' },
  red: { border: 'border-ca-red/28', text: 'text-ca-red', bg: 'bg-ca-red-wash' },
  gold: { border: 'border-ca-gold/28', text: 'text-ca-gold', bg: 'bg-ca-gold/10' },
}

export function ManualPage() {
  return (
    <div className="p-4 space-y-3">
      {/* Page header */}
      <div className="border-b border-dotted border-white/12 pb-3">
        <p className="ca-mono-label text-[0.44rem] text-ca-text-3 tracking-[0.1em]">MANUAL / INDEX</p>
        <h1 className="ca-display mt-1 text-[1.85rem] leading-none tracking-[0.05em] text-ca-text">
          Game Manual
        </h1>
      </div>

      {/* Manual Index */}
      <SitePanel>
        <SitePanelHeader
          eyebrow="Contents"
          title="Player Reference"
          action={
            <Link to="/battle/prep" className="ca-mono-label text-[0.44rem] text-ca-red">
              START PLAYING →
            </Link>
          }
        />
        <div className="divide-y divide-dotted divide-white/10">
          {manualSections.map((section) => {
            const tone = toneClass[section.tone] ?? toneClass.teal
            return (
              <div
                key={section.key}
                className="flex items-center gap-4 px-4 py-3 transition hover:bg-white/[0.02]"
              >
                <span
                  className={[
                    'ca-mono-label grid h-8 w-8 shrink-0 place-items-center rounded-[4px] border text-[0.46rem]',
                    tone.border,
                    tone.text,
                    tone.bg,
                  ].join(' ')}
                >
                  {section.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="ca-display text-[1.05rem] leading-none text-ca-text">{section.title}</p>
                  <p className="mt-1 text-[0.73rem] leading-[1.5] text-ca-text-3">{section.desc}</p>
                </div>
                <span className="ca-mono-label shrink-0 text-[0.42rem] text-ca-text-3">READ</span>
              </div>
            )
          })}
        </div>
      </SitePanel>
    </div>
  )
}
