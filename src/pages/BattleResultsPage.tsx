import { Link } from 'react-router-dom'
import { battleRosterById } from '@/features/battle/data'
import {
  type LastBattleResult,
  formatMatchTimestamp,
  getModeLabel,
  readLastBattleResult,
  readRecentMatchHistory,
} from '@/features/battle/matches'
import { MISSION_DEFS } from '@/features/missions/store'
import { UNLOCK_MISSION_DEFS } from '@/features/missions/unlocks'

function TeamPillRow({ ids, label }: { ids: string[]; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <span
            key={`${label}-${id}`}
            className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.42rem] text-ca-text-2"
          >
            {battleRosterById[id]?.shortName ?? id.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

function UnlockBanner({ missionIds }: { missionIds: string[] }) {
  if (missionIds.length === 0) return null
  const fighters = missionIds.flatMap((id) => {
    const def = UNLOCK_MISSION_DEFS.find((d) => d.id === id)
    if (!def) return []
    const fighter = battleRosterById[def.reward.fighterId]
    return fighter ? [fighter] : []
  })
  if (fighters.length === 0) return null

  return (
    <div className="mt-4 space-y-2">
      {fighters.map((fighter) => (
        <div key={fighter.id} className="flex items-center gap-3 rounded-[10px] border border-ca-teal/35 bg-[rgba(5,216,189,0.07)] px-4 py-3 shadow-[0_0_18px_rgba(5,216,189,0.1)]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0 text-ca-teal">
            <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="ca-mono-label text-[0.44rem] text-ca-teal">FIGHTER UNLOCKED</p>
            <p className="ca-display mt-0.5 text-xl text-white">{fighter.name}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Receipt row atoms ─────────────────────────────────────────────────────────

function ReceiptRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'positive' | 'negative' | 'neutral' | 'muted' }) {
  const valueClass =
    tone === 'positive' ? 'text-ca-teal' :
    tone === 'negative' ? 'text-ca-red' :
    tone === 'muted' ? 'text-ca-text-3' :
    'text-ca-text-2'

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="ca-mono-label text-[0.42rem] text-ca-text-3 shrink-0">{label}</span>
      <span className={`ca-mono-label text-[0.46rem] text-right ${valueClass}`}>{value}</span>
    </div>
  )
}

function ProgressReceipt({ result }: { result: LastBattleResult }) {
  const won = result.result === 'WIN'
  const draw = result.result === 'DRAW'
  const streakAfter = result.profileSnapshot.currentStreak
  const streakBefore = result.streakBefore ?? 0

  // LP row
  const lpRow = result.mode === 'ranked'
    ? { label: 'LP CHANGE', value: result.lpDelta >= 0 ? `+${result.lpDelta} LP` : `${result.lpDelta} LP`, tone: (result.lpDelta >= 0 ? 'positive' : 'negative') as 'positive' | 'negative' }
    : { label: 'LP CHANGE', value: 'No ranked LP at stake', tone: 'muted' as const }

  // Streak row
  let streakValue: string
  let streakTone: 'positive' | 'negative' | 'neutral' | 'muted'
  if (draw) {
    streakValue = `${streakBefore} (unchanged)`
    streakTone = 'neutral'
  } else if (won) {
    streakValue = streakAfter === 1 ? `${streakAfter} win streak started` : `${streakAfter} win streak (+1)`
    streakTone = 'positive'
  } else if (streakBefore > 0) {
    streakValue = `${streakBefore}-win streak broken`
    streakTone = 'negative'
  } else {
    streakValue = 'No streak to break'
    streakTone = 'muted'
  }

  // Quest rows
  const questRows = result.newlyCompletedQuestIds?.map((qid) => {
    const def = MISSION_DEFS.find((d) => d.id === qid)
    if (!def) return null
    return { label: `QUEST COMPLETED — ${def.type.toUpperCase()}`, value: `${def.label}  +${def.reward} CC` }
  }).filter(Boolean) as { label: string; value: string }[] | undefined

  // Unlock rows
  const unlockRows = (result.newlyUnlockedMissionIds ?? []).map((mid) => {
    const def = UNLOCK_MISSION_DEFS.find((d) => d.id === mid)
    if (!def) return null
    const fighter = battleRosterById[def.reward.fighterId]
    return { name: fighter?.name ?? def.reward.fighterId }
  }).filter(Boolean) as { name: string }[]

  return (
    <div className="mt-4 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-3">
      <p className="ca-mono-label text-[0.44rem] text-ca-text-3 mb-2">PROGRESS EARNED</p>

      <ReceiptRow label={lpRow.label} value={lpRow.value} tone={lpRow.tone} />
      <ReceiptRow
        label="RESULT"
        value={draw ? 'Draw' : won ? 'Win' : 'Loss'}
        tone={draw ? 'neutral' : won ? 'positive' : 'negative'}
      />
      <ReceiptRow label="MATCHES PLAYED" value={`+1  →  ${result.profileSnapshot.matchesPlayed}`} tone="neutral" />
      <ReceiptRow label="STREAK" value={streakValue} tone={streakTone} />

      {questRows && questRows.map((q, i) => (
        <ReceiptRow key={i} label={q.label} value={q.value} tone="positive" />
      ))}

      {unlockRows.length > 0 && unlockRows.map((u, i) => (
        <ReceiptRow key={i} label="FIGHTER UNLOCKED" value={u.name} tone="positive" />
      ))}

      <ReceiptRow label="MATCH HISTORY" value="Match added to history" tone="muted" />
    </div>
  )
}

function RankShiftBanner({ shift, rankBefore, rankAfter }: { shift: 'promoted' | 'demoted' | 'steady'; rankBefore: string; rankAfter: string }) {
  const tone = shift === 'promoted' ? 'text-ca-teal border-ca-teal/22 bg-ca-teal-wash' : shift === 'demoted' ? 'text-ca-red border-ca-red/22 bg-ca-red-wash' : 'text-ca-text-2 border-white/10 bg-[rgba(255,255,255,0.03)]'
  const label = shift === 'promoted' ? 'PROMOTION' : shift === 'demoted' ? 'DEMOTION' : 'RANK HELD'

  return (
    <div className={`mt-4 rounded-[10px] border px-3 py-3 ${tone}`}>
      <p className="ca-mono-label text-[0.42rem]">{label}</p>
      <p className="ca-display mt-2 text-[1.5rem]">{rankBefore} / {rankAfter}</p>
    </div>
  )
}

export function BattleResultsPage() {
  const result = readLastBattleResult()
  const recentHistory = readRecentMatchHistory().slice(0, 5)

  if (!result) {
    return (
      <section className="grid min-h-[calc(100vh-8rem)] place-items-center py-6">
        <div className="ca-card w-full max-w-2xl p-8 text-center">
          <p className="ca-mono-label text-[0.58rem] text-ca-text-3">Battle Results</p>
          <h1 className="ca-display mt-3 text-5xl text-ca-text">No Match Recorded</h1>
          <p className="mt-3 text-sm text-ca-text-2">Finish a battle to generate a results summary and match history entry.</p>
          <Link
            to="/battle/prep"
            className="ca-display mt-6 inline-flex rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] px-4 py-2 text-xl text-white transition duration-150 hover:brightness-110 active:scale-[0.98]"
          >
            Return To Lobby
          </Link>
        </div>
      </section>
    )
  }

  const won = result.result === 'WIN'
  const draw = result.result === 'DRAW'

  return (
    <section className="py-4 sm:py-6">
      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] xl:gap-5">
        <div className="space-y-4">
          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-5 animate-ca-stagger-in" style={{ animationDelay: '0ms' }}>
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Battle Results</p>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className={`ca-display text-5xl ${draw ? 'text-ca-gold' : won ? 'text-ca-teal' : 'text-ca-red'}`}>{draw ? 'Draw' : won ? 'Victory' : 'Defeat'}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.46rem] text-ca-text-2">
                    {getModeLabel(result.mode)}
                  </span>
                  <span className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[0.46rem] text-ca-text-2">
                    VS {result.opponentName}
                  </span>
                  <span className="ca-mono-label text-[0.46rem] text-ca-text-3">{formatMatchTimestamp(result.timestamp)}</span>
                </div>
                <p className="mt-3 text-sm text-ca-text-2">
                  {result.opponentTitle}
                  {result.opponentRankLabel ? ` � ${result.opponentRankLabel}` : ''}
                  {result.roomCode ? ` � ${result.roomCode}` : ''}
                </p>
              </div>

              <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-right">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">ROUNDS</p>
                <p className="ca-display mt-2 text-3xl text-ca-text">{result.rounds}</p>
                <p className={`ca-mono-label mt-2 text-[0.5rem] ${result.lpDelta >= 0 ? 'text-ca-teal' : 'text-ca-red'}`}>
                  {result.mode === 'ranked' ? `LP ${result.lpDelta >= 0 ? `+${result.lpDelta}` : result.lpDelta}` : 'UNRANKED'}
                </p>
              </div>
            </div>

            <RankShiftBanner shift={result.rankShift} rankBefore={result.rankBefore} rankAfter={result.rankAfter} />
            <UnlockBanner missionIds={result.newlyUnlockedMissionIds ?? []} />
            <ProgressReceipt result={result} />
          </section>

          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-5 animate-ca-stagger-in" style={{ animationDelay: '80ms' }}>
            <p className="ca-display text-3xl text-ca-text">Rank Readout</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">LP BEFORE</p>
                <p className="ca-display mt-2 text-3xl text-ca-text">{result.lpBefore}</p>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">LP DELTA</p>
                <p className={`ca-display mt-2 text-3xl ${result.lpDelta >= 0 ? 'text-ca-teal' : 'text-ca-red'}`}>
                  {result.lpDelta >= 0 ? `+${result.lpDelta}` : result.lpDelta}
                </p>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">LP AFTER</p>
                <p className="ca-display mt-2 text-3xl text-ca-text">{result.lpAfter}</p>
              </div>
            </div>
          </section>

          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-5 animate-ca-stagger-in" style={{ animationDelay: '160ms' }}>
            <p className="ca-display text-3xl text-ca-text">Lineups</p>
            <div className="mt-4 space-y-3">
              <TeamPillRow ids={result.yourTeam} label="YOU" />
              <TeamPillRow ids={result.theirTeam} label="THEM" />
            </div>
          </section>

          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-5 animate-ca-stagger-in" style={{ animationDelay: '240ms' }}>
            <p className="ca-display text-3xl text-ca-text">Recent History</p>
            <div className="mt-4 space-y-2.5">
              {recentHistory.map((match) => {
                const matchWon = match.result === 'WIN'
                const matchDraw = match.result === 'DRAW'
                return (
                  <div key={match.id} className="rounded-[10px] border border-white/7 bg-[rgba(16,17,22,0.16)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`ca-mono-label text-[0.46rem] ${matchDraw ? 'text-ca-gold' : matchWon ? 'text-ca-teal' : 'text-ca-red'}`}>{match.result}</span>
                        <span className="ca-mono-label text-[0.44rem] text-ca-text-2">{getModeLabel(match.mode)}</span>
                        <span className="ca-mono-label text-[0.44rem] text-ca-text-3">VS {match.opponentName}</span>
                        <span className="ca-mono-label text-[0.44rem] text-ca-text-3">{match.rounds} ROUNDS</span>
                        {match.mode === 'ranked' ? (
                          <span className={`ca-mono-label text-[0.44rem] ${match.lpDelta >= 0 ? 'text-ca-teal' : 'text-ca-red'}`}>
                            {match.lpDelta >= 0 ? `+${match.lpDelta} LP` : `${match.lpDelta} LP`}
                          </span>
                        ) : null}
                      </div>
                      <span className="ca-mono-label text-[0.42rem] text-ca-text-3">{formatMatchTimestamp(match.timestamp)}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ca-text-2">
                      {match.rankBefore} / {match.rankAfter}
                      {match.roomCode ? ` / ${match.roomCode}` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-5 animate-ca-stagger-in" style={{ animationDelay: '100ms' }}>
            <p className="ca-mono-label text-[0.5rem] text-ca-text-3">Updated Profile</p>
            <h2 className="ca-display mt-2 text-4xl text-ca-text">{result.profileSnapshot.rank}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">WINS</p>
                <p className="ca-display mt-2 text-3xl text-ca-text">{result.profileSnapshot.wins}</p>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">LOSSES</p>
                <p className="ca-display mt-2 text-3xl text-ca-text">{result.profileSnapshot.losses}</p>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">CURRENT STREAK</p>
                <p className="ca-display mt-2 text-3xl text-ca-text">{result.profileSnapshot.currentStreak}</p>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
                <p className="ca-mono-label text-[0.42rem] text-ca-text-3">BEST STREAK</p>
                <p className="ca-display mt-2 text-3xl text-ca-text">{result.profileSnapshot.bestStreak}</p>
              </div>
            </div>
            <div className="mt-4 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
              <p className="ca-mono-label text-[0.42rem] text-ca-text-3">MATCHES PLAYED</p>
              <p className="ca-display mt-2 text-3xl text-ca-text">{result.profileSnapshot.matchesPlayed}</p>
              <p className="mt-2 text-sm text-ca-text-3">Peak Rank: {result.profileSnapshot.peakRank}</p>
            </div>
          </section>

          <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.18)] p-5 animate-ca-stagger-in" style={{ animationDelay: '200ms' }}>
            <div className="flex flex-col gap-3">
              <Link
                to="/battle/prep"
                className="ca-display rounded-lg border border-ca-red/35 bg-[linear-gradient(180deg,rgba(250,39,66,0.9),rgba(190,19,43,0.92))] px-4 py-2.5 text-center text-[1.2rem] text-white transition duration-150 hover:brightness-110 active:scale-[0.98]"
              >
                Back To Lobby
              </Link>
              <Link
                to="/profile"
                className="ca-display rounded-lg border border-white/12 bg-[rgba(28,28,36,0.72)] px-4 py-2.5 text-center text-[1rem] text-ca-text transition duration-150 hover:brightness-105 active:scale-[0.98]"
              >
                Open Profile
              </Link>
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}
