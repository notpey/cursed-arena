import { CharacterCard } from '@/components/ui/CharacterCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { TOTAL_CHARACTER_CAP, ownedRosterCharacters } from '@/data/characters'

type MatchResult = 'WIN' | 'LOSS'

type MatchHistoryEntry = {
  id: string
  result: MatchResult
  opponentName: string
  yourTeam: string[]
  theirTeam: string[]
  timestampLabel: string
}

const profileStats = {
  playerName: 'PLAYER_NAME',
  title: 'DOMAIN MASTER',
  playerId: '#7742',
  rank: 'PLATINUM II',
  season: 'SEASON 3',
  peakRank: 'DIAMOND I',
  lpCurrent: 1480,
  lpToNext: 1800,
  wins: 47,
  losses: 31,
  matchesPlayed: 78,
  currentStreak: 4,
  bestStreak: 11,
}

const statBento = [
  { label: 'Total Wins', value: `${profileStats.wins}` },
  { label: 'Total Losses', value: `${profileStats.losses}` },
  {
    label: 'Win Rate',
    value: `${Math.round((profileStats.wins / Math.max(1, profileStats.matchesPlayed)) * 100)}%`,
  },
  { label: 'Matches Played', value: `${profileStats.matchesPlayed}` },
  { label: 'Current Streak', value: `${profileStats.currentStreak}` },
  { label: 'Best Streak', value: `${profileStats.bestStreak}` },
]

const activeRoster = ['gojo', 'yuji', 'yuta']

const recentMatches: MatchHistoryEntry[] = [
  {
    id: 'm1',
    result: 'WIN',
    opponentName: 'HEX_KING',
    yourTeam: ['gojo', 'yuji', 'yuta'],
    theirTeam: ['todo', 'nanami', 'choso'],
    timestampLabel: '2 HOURS AGO',
  },
  {
    id: 'm2',
    result: 'LOSS',
    opponentName: 'DOMAINFRAME',
    yourTeam: ['gojo', 'yuji', 'todo'],
    theirTeam: ['yuta', 'maki', 'nanami'],
    timestampLabel: '5 HOURS AGO',
  },
  {
    id: 'm3',
    result: 'WIN',
    opponentName: 'VESSEL_17',
    yourTeam: ['yuji', 'yuta', 'maki'],
    theirTeam: ['panda', 'choso', 'todo'],
    timestampLabel: '9 HOURS AGO',
  },
  {
    id: 'm4',
    result: 'WIN',
    opponentName: 'SEALBREAKER',
    yourTeam: ['gojo', 'nanami', 'inumaki'],
    theirTeam: ['mai', 'miwa', 'kamo'],
    timestampLabel: '1 DAY AGO',
  },
  {
    id: 'm5',
    result: 'LOSS',
    opponentName: 'MALVOLENT',
    yourTeam: ['yuji', 'todo', 'choso'],
    theirTeam: ['gojo', 'yuta', 'nanami'],
    timestampLabel: '1 DAY AGO',
  },
  {
    id: 'm6',
    result: 'WIN',
    opponentName: 'TOKYO_CURSE',
    yourTeam: ['gojo', 'maki', 'yuta'],
    theirTeam: ['panda', 'todo', 'inumaki'],
    timestampLabel: '2 DAYS AGO',
  },
]

const rosterById = Object.fromEntries(ownedRosterCharacters.map((character) => [character.id, character]))
const collectionPct = Math.round((ownedRosterCharacters.length / TOTAL_CHARACTER_CAP) * 100)
const lpPct = Math.round((profileStats.lpCurrent / profileStats.lpToNext) * 100)

export function ProfilePage() {
  return (
    <section className="py-4 sm:py-6">
      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:gap-5">
        <div className="min-w-0 space-y-4">
          <ProfileHeaderCard />
          <RankCard />
          <StatsBento />
          <CollectionProgressCard />
        </div>

        <div className="min-w-0 space-y-4">
          <FeaturedTeamCard />
          <MatchHistoryCard />
        </div>
      </div>
    </section>
  )
}

function ProfileHeaderCard() {
  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-sky-300/30 bg-[linear-gradient(145deg,rgba(96,165,250,0.12),rgba(20,20,28,0.3))]">
          <span className="ca-display text-2xl text-ca-text">PN</span>
        </div>

        <div className="min-w-0">
          <h1 className="ca-display text-4xl text-ca-text sm:text-[2.6rem]">{profileStats.playerName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ca-mono-label rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[0.46rem] text-amber-300">
              {profileStats.title}
            </span>
            <span className="ca-mono-label text-[0.48rem] text-ca-text-disabled">
              {profileStats.playerId}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function RankCard() {
  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="grid h-16 w-16 place-items-center rounded-full border border-sky-300/30 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.14),transparent_46%),linear-gradient(145deg,rgba(96,165,250,0.14),rgba(31,41,55,0.3))] shadow-[0_0_20px_rgba(96,165,250,0.14)]">
          <span className="ca-display text-2xl text-sky-200">P2</span>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ca-display text-3xl text-ca-text">{profileStats.rank}</p>
              <p className="ca-mono-label mt-1 text-[0.5rem] text-ca-text-disabled">
                {profileStats.season}
              </p>
            </div>
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">
              PEAK: {profileStats.peakRank}
            </p>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="ca-mono-label text-[0.48rem] text-ca-text-3">LP PROGRESS</span>
              <span className="ca-mono-label text-[0.52rem] text-ca-text-2">
                {profileStats.lpCurrent} / {profileStats.lpToNext}
              </span>
            </div>
            <ProgressBar value={lpPct} tone="teal" className="h-2 bg-ca-highlight/55" />
          </div>
        </div>
      </div>
    </section>
  )
}

function StatsBento() {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {statBento.map((item) => (
        <div
          key={item.label}
          className="ca-card border-white/8 bg-[rgba(14,15,20,0.14)] p-4 shadow-[0_8px_18px_rgba(0,0,0,0.12)]"
        >
          <p className="ca-display text-3xl text-ca-text sm:text-[2.1rem]">{item.value}</p>
          <p className="ca-mono-label mt-2 text-[0.42rem] text-ca-text-disabled">{item.label}</p>
        </div>
      ))}
    </section>
  )
}

function CollectionProgressCard() {
  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ca-display text-2xl text-ca-text sm:text-3xl">Collection Progress</p>
          <p className="ca-mono-label mt-2 text-[0.48rem] text-ca-text-3">
            CHARACTERS: {ownedRosterCharacters.length}/{TOTAL_CHARACTER_CAP}
          </p>
        </div>
        <p className="ca-mono-label text-[0.55rem] text-ca-teal">ROSTER COMPLETION: {collectionPct}%</p>
      </div>
      <ProgressBar value={collectionPct} tone="teal" className="mt-4 h-2 bg-ca-highlight/55" />
    </section>
  )
}

function FeaturedTeamCard() {
  const team = activeRoster
    .map((characterId) => rosterById[characterId])
    .filter((character) => Boolean(character))

  return (
    <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Active Roster</p>
          <p className="ca-display mt-2 text-3xl text-ca-text">Featured Team</p>
        </div>
        <span className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2 py-1 text-[0.46rem] text-ca-teal">
          MOST USED
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {team.map((character) => (
          <div key={character.id} className="min-w-0">
            <CharacterCard character={character} />
          </div>
        ))}
      </div>
    </section>
  )
}

function MatchHistoryCard() {
  return (
    <section className="ca-card min-h-0 border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
      <div className="mb-4">
        <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Recent Matches</p>
        <p className="ca-display mt-2 text-3xl text-ca-text">Match History</p>
      </div>

      <div className="space-y-2.5">
        {recentMatches.map((match) => (
          <MatchHistoryRow key={match.id} match={match} />
        ))}
      </div>
    </section>
  )
}

function MatchHistoryRow({ match }: { match: MatchHistoryEntry }) {
  const win = match.result === 'WIN'

  return (
    <div
      className="rounded-[10px] border border-white/7 bg-[rgba(16,17,22,0.16)] p-3"
      style={{
        boxShadow: `inset 2px 0 0 ${win ? 'rgba(34,197,94,0.28)' : 'rgba(250,39,66,0.22)'}`,
      }}
    >
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: win ? 'rgb(34 197 94)' : 'rgb(250 39 66)',
              boxShadow: win
                ? '0 0 10px rgba(34,197,94,0.24)'
                : '0 0 10px rgba(250,39,66,0.22)',
            }}
          />
          <span className={`ca-mono-label text-[0.5rem] ${win ? 'text-emerald-300' : 'text-ca-red'}`}>
            {match.result}
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ca-mono-label text-[0.48rem] text-ca-text-2">VS {match.opponentName}</span>
            <span className="ca-mono-label text-[0.44rem] text-ca-text-3">{match.timestampLabel}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TinyTeamRow ids={match.yourTeam} label="YOU" />
            <span className="ca-mono-label text-[0.42rem] text-ca-text-3">VS</span>
            <TinyTeamRow ids={match.theirTeam} label="THEM" />
          </div>
        </div>

        <span className="ca-mono-label text-[0.45rem] text-ca-text-3">{match.timestampLabel}</span>
      </div>
    </div>
  )
}

function TinyTeamRow({ ids, label }: { ids: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="ca-mono-label text-[0.38rem] text-ca-text-3">{label}</span>
      <div className="flex items-center gap-1">
        {ids.map((id) => (
          <TinyPortrait key={`${label}-${id}`} characterId={id} />
        ))}
      </div>
    </div>
  )
}

function TinyPortrait({ characterId }: { characterId: string }) {
  const character = rosterById[characterId]
  if (!character?.renderSrc) {
    return (
      <div className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-[rgba(255,255,255,0.03)]">
        <span className="ca-mono-label text-[0.32rem] text-ca-text-3">?</span>
      </div>
    )
  }

  const frame = character.portraitFrame ?? {}
  const scale = (frame.scale ?? 1.6) * 0.92
  const x = frame.x ?? '0%'
  const y = frame.y ?? '10%'

  return (
    <div className="relative h-6 w-6 overflow-hidden rounded-full border border-white/10 bg-[rgba(255,255,255,0.03)]">
      <div
        className="absolute left-1/2 top-[6%] w-[96%]"
        style={{
          transform: `translate(-50%, 0) translate(${x}, ${y}) scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        <img
          src={character.renderSrc}
          alt={character.name}
          className="block h-auto w-full select-none"
          draggable={false}
        />
      </div>
    </div>
  )
}

