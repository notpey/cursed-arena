import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { STALE_MATCH_CUTOFF_MS } from '@/features/multiplayer/client'
import type { MatchRow } from '@/features/multiplayer/types'
import { getAllUnlockMissionProgress, UNLOCK_MISSION_DEFS } from '@/features/missions/unlocks'
import { getMissionsWithProgress } from '@/features/missions/store'

// ── Types ─────────────────────────────────────────────────────────────────────

type LiveOpsTab = 'users' | 'matches' | 'missions' | 'unlocks'

type ProfileRow = {
  id: string
  display_name: string | null
  role: string | null
  lp: number | null
  wins: number | null
  losses: number | null
  win_streak: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function db() {
  return getSupabaseClient()
}

function fmtTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime()
  const min = Math.floor(delta / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function isStale(match: MatchRow) {
  return Date.now() - new Date(match.last_activity_at).getTime() > STALE_MATCH_CUTOFF_MS
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function Pill({ label, tone }: { label: string; tone: 'teal' | 'red' | 'gold' | 'frost' | 'muted' }) {
  const cls =
    tone === 'teal' ? 'border-ca-teal/22 bg-ca-teal-wash text-ca-teal' :
    tone === 'red' ? 'border-ca-red/18 bg-ca-red-wash text-ca-red' :
    tone === 'gold' ? 'border-amber-400/22 bg-amber-400/10 text-amber-300' :
    tone === 'frost' ? 'border-sky-400/22 bg-sky-400/10 text-sky-300' :
    'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-3'
  return (
    <span className={`ca-mono-label rounded-md border px-2 py-0.5 text-[0.38rem] ${cls}`}>{label}</span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-ca-text-3">
      {message}
    </div>
  )
}

function SectionHeading({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-4">
      <p className="ca-display text-2xl text-ca-text">{label}</p>
      {sub ? <p className="mt-1 text-sm text-ca-text-3">{sub}</p> : null}
    </div>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [lpEdit, setLpEdit] = useState('')
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 2000)
    return () => window.clearTimeout(t)
  }, [flash])

  async function handleSearch() {
    const client = db()
    if (!client) { setError('Supabase not configured'); return }
    setLoading(true)
    setError(null)
    const { data, error: err } = await client
      .from('profiles')
      .select('id, display_name, role, lp, wins, losses, win_streak')
      .ilike('display_name', `%${query.trim()}%`)
      .limit(20)
    setLoading(false)
    if (err) { setError(err.message); return }
    setResults((data ?? []) as ProfileRow[])
  }

  async function handleSaveLp(userId: string) {
    const client = db()
    if (!client) return
    const lp = parseInt(lpEdit, 10)
    if (!Number.isFinite(lp) || lp < 0) { setFlash('INVALID LP'); return }
    const { error: err } = await client.from('profiles').update({ lp }).eq('id', userId)
    if (err) { setFlash('SAVE FAILED'); return }
    setResults((prev) => prev.map((r) => r.id === userId ? { ...r, lp } : r))
    setEditingId(null)
    setFlash('LP UPDATED')
  }

  return (
    <div className="space-y-4">
      <SectionHeading label="Users" sub="Search by display name. Edit LP and view stats." />
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          placeholder="Search display name…"
          className="flex-1 rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={loading}
          className="ca-mono-label rounded-lg border border-ca-teal/22 bg-ca-teal-wash px-3 py-2 text-[0.42rem] text-ca-teal disabled:opacity-50"
        >
          {loading ? 'SEARCHING…' : 'SEARCH'}
        </button>
      </div>
      {error ? <p className="text-sm text-ca-red">{error}</p> : null}
      {flash ? <Pill label={flash} tone="frost" /> : null}
      {results.length === 0 && !loading ? (
        <EmptyState message="Search for a user to view their profile." />
      ) : (
        <div className="space-y-2">
          {results.map((row) => (
            <div key={row.id} className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="ca-display text-[1rem] text-ca-text">{row.display_name ?? '(unnamed)'}</p>
                  <p className="mt-0.5 ca-mono-label text-[0.38rem] text-ca-text-3">{row.id}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill label={`${row.role ?? 'player'}`} tone="muted" />
                    <Pill label={`${row.lp ?? 0} LP`} tone="teal" />
                    <Pill label={`${row.wins ?? 0}W / ${row.losses ?? 0}L`} tone="muted" />
                    <Pill label={`${row.win_streak ?? 0} streak`} tone="muted" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setEditingId(row.id); setLpEdit(String(row.lp ?? 0)) }}
                  className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.38rem] text-ca-text-2"
                >
                  Edit LP
                </button>
              </div>
              {editingId === row.id ? (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    value={lpEdit}
                    onChange={(e) => setLpEdit(e.target.value)}
                    className="w-28 rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-2 py-1.5 text-sm text-ca-text outline-none focus:border-ca-teal/35"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveLp(row.id)}
                    className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-2.5 py-1.5 text-[0.38rem] text-ca-teal"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="ca-mono-label rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.38rem] text-ca-text-3"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Matches tab ───────────────────────────────────────────────────────────────

type MatchFilter = 'in_progress' | 'finished' | 'abandoned' | 'all'

function MatchesTab() {
  const [filter, setFilter] = useState<MatchFilter>('in_progress')
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 2000)
    return () => window.clearTimeout(t)
  }, [flash])

  useEffect(() => {
    void loadMatches()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  async function loadMatches() {
    const client = db()
    if (!client) { setError('Supabase not configured'); return }
    setLoading(true)
    setError(null)
    let q = client
      .from('matches')
      .select('id,mode,status,player_a_display_name,player_b_display_name,current_round,winner,last_activity_at,created_at,room_code,player_a_id,player_b_id,player_a_team,player_b_team,seed,battle_state,current_phase,active_player,match_revision,resolution_id,resolution_steps,last_submission_id,last_submission_player_id,updated_at')
      .order('last_activity_at', { ascending: false })
      .limit(40)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data, error: err } = await q
    setLoading(false)
    if (err) { setError(err.message); return }
    setMatches((data ?? []) as MatchRow[])
  }

  async function handleAbandon(matchId: string) {
    const client = db()
    if (!client) return
    const { error: err } = await client
      .from('matches')
      .update({ status: 'abandoned', last_activity_at: new Date().toISOString() })
      .eq('id', matchId)
      .eq('status', 'in_progress')
    if (err) { setFlash('ABANDON FAILED'); return }
    setFlash('MATCH ABANDONED')
    void loadMatches()
  }

  async function handleAbandonAllStale() {
    const client = db()
    if (!client) return
    const cutoff = new Date(Date.now() - STALE_MATCH_CUTOFF_MS).toISOString()
    const { error: err } = await client
      .from('matches')
      .update({ status: 'abandoned', last_activity_at: new Date().toISOString() })
      .eq('status', 'in_progress')
      .lt('last_activity_at', cutoff)
    if (err) { setFlash('CLEANUP FAILED'); return }
    setFlash('STALE MATCHES CLEANED')
    void loadMatches()
  }

  const filterOpts: Array<{ id: MatchFilter; label: string }> = [
    { id: 'in_progress', label: 'In Progress' },
    { id: 'finished', label: 'Finished' },
    { id: 'abandoned', label: 'Abandoned' },
    { id: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading label="Matches" sub="View, abandon, or expire matches by status." />
        <button
          type="button"
          onClick={() => void handleAbandonAllStale()}
          className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-3 py-1.5 text-[0.42rem] text-ca-red"
        >
          Abandon All Stale
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterOpts.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFilter(opt.id)}
            className={[
              'ca-mono-label rounded-lg border px-3 py-1.5 text-[0.42rem] transition',
              filter === opt.id
                ? 'border-ca-teal/28 bg-ca-teal-wash text-ca-teal'
                : 'border-white/10 bg-[rgba(255,255,255,0.03)] text-ca-text-3',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void loadMatches()}
          className="ca-mono-label rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-[0.42rem] text-ca-text-3"
        >
          Refresh
        </button>
      </div>

      {flash ? <Pill label={flash} tone="frost" /> : null}
      {error ? <p className="text-sm text-ca-red">{error}</p> : null}
      {loading ? <p className="text-sm text-ca-text-3">Loading…</p> : null}

      {!loading && matches.length === 0 ? (
        <EmptyState message="No matches found for this filter." />
      ) : (
        <div className="space-y-2">
          {matches.map((match) => {
            const stale = match.status === 'in_progress' && isStale(match)
            return (
              <div key={match.id} className="rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill
                        label={match.status.replace('_', ' ').toUpperCase()}
                        tone={match.status === 'in_progress' ? 'teal' : match.status === 'finished' ? 'muted' : 'red'}
                      />
                      <Pill label={match.mode.toUpperCase()} tone="muted" />
                      {stale ? <Pill label="STALE" tone="gold" /> : null}
                      {match.winner ? <Pill label={`WINNER: ${match.winner.toUpperCase()}`} tone="frost" /> : null}
                    </div>
                    <p className="mt-1.5 ca-display text-[0.95rem] text-ca-text">
                      {match.player_a_display_name} vs {match.player_b_display_name || '(waiting)'}
                    </p>
                    <p className="mt-0.5 ca-mono-label text-[0.38rem] text-ca-text-3">
                      Round {match.current_round} · {fmtTime(match.last_activity_at)} · {match.id}
                    </p>
                  </div>
                  {match.status === 'in_progress' ? (
                    <button
                      type="button"
                      onClick={() => void handleAbandon(match.id)}
                      className="ca-mono-label shrink-0 rounded-md border border-ca-red/18 bg-ca-red-wash px-2.5 py-1.5 text-[0.38rem] text-ca-red"
                    >
                      Abandon
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Missions tab ──────────────────────────────────────────────────────────────

function MissionsTab() {
  const missions = getMissionsWithProgress()
  const unlockProgress = getAllUnlockMissionProgress()

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading label="Daily / Weekly Quests" sub="Current state of quest missions (local client view)." />
        <div className="space-y-2">
          {missions.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-2.5">
              <div>
                <p className="text-sm text-ca-text">{m.label}</p>
                <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{m.type.toUpperCase()} · +{m.reward} CC</p>
              </div>
              <div className="flex items-center gap-2">
                <Pill label={m.progressLabel} tone="muted" />
                {m.complete ? <Pill label={m.claimed ? 'CLAIMED' : 'COMPLETE'} tone={m.claimed ? 'teal' : 'gold'} /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading label="Unlock Missions" sub="Permanent progression gates for locked fighters." />
        <div className="space-y-2">
          {UNLOCK_MISSION_DEFS.map((def) => {
            const prog = unlockProgress[def.id] ?? { progress: 0, completed: false }
            return (
              <div key={def.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-2.5">
                <div>
                  <p className="text-sm text-ca-text">{def.name}</p>
                  <p className="ca-mono-label text-[0.38rem] text-ca-text-3">{def.section} · unlocks {def.reward.fighterId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill label={`${prog.progress}`} tone="muted" />
                  {prog.completed ? <Pill label="UNLOCKED" tone="teal" /> : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Unlocks tab ───────────────────────────────────────────────────────────────

function UnlocksTab() {
  const [userId, setUserId] = useState('')
  const [missionId, setMissionId] = useState(UNLOCK_MISSION_DEFS[0]?.id ?? '')
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 2000)
    return () => window.clearTimeout(t)
  }, [flash])

  async function handleGrant() {
    const client = db()
    if (!client) { setError('Supabase not configured'); return }
    if (!userId.trim()) { setError('Enter a user ID'); return }
    // Unlock missions live in localStorage on each client — the admin tool
    // records the grant in a player_unlock_overrides table for future sync.
    // For now, we write a flag row that the client will read on next load.
    const { error: err } = await client
      .from('player_unlock_overrides')
      .upsert(
        { player_id: userId.trim(), mission_id: missionId, granted: true, updated_at: new Date().toISOString() },
        { onConflict: 'player_id,mission_id' },
      )
    if (err) { setError(err.message); return }
    setFlash('UNLOCK GRANTED')
    setError(null)
  }

  async function handleRevoke() {
    const client = db()
    if (!client) { setError('Supabase not configured'); return }
    if (!userId.trim()) { setError('Enter a user ID'); return }
    const { error: err } = await client
      .from('player_unlock_overrides')
      .upsert(
        { player_id: userId.trim(), mission_id: missionId, granted: false, updated_at: new Date().toISOString() },
        { onConflict: 'player_id,mission_id' },
      )
    if (err) { setError(err.message); return }
    setFlash('UNLOCK REVOKED')
    setError(null)
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        label="Unlock Overrides"
        sub="Manually grant or revoke a fighter unlock for a specific user. Requires player_unlock_overrides table."
      />

      <div className="space-y-3 rounded-[10px] border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-4">
        <div>
          <label className="ca-mono-label block text-[0.42rem] text-ca-text-3 mb-1">USER ID (UUID)</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35"
          />
        </div>

        <div>
          <label className="ca-mono-label block text-[0.42rem] text-ca-text-3 mb-1">MISSION</label>
          <select
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[rgba(14,15,20,0.9)] px-3 py-2 text-sm text-ca-text outline-none focus:border-ca-teal/35"
          >
            {UNLOCK_MISSION_DEFS.map((def) => (
              <option key={def.id} value={def.id}>
                {def.name} — {def.reward.fighterId}
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="text-sm text-ca-red">{error}</p> : null}
        {flash ? <Pill label={flash} tone="frost" /> : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleGrant()}
            className="ca-mono-label rounded-md border border-ca-teal/22 bg-ca-teal-wash px-3 py-1.5 text-[0.42rem] text-ca-teal"
          >
            Grant Unlock
          </button>
          <button
            type="button"
            onClick={() => void handleRevoke()}
            className="ca-mono-label rounded-md border border-ca-red/18 bg-ca-red-wash px-3 py-1.5 text-[0.42rem] text-ca-red"
          >
            Revoke Unlock
          </button>
        </div>
      </div>

      <div>
        <p className="ca-mono-label text-[0.42rem] text-ca-text-3 mb-2">ALL UNLOCK MISSIONS</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {UNLOCK_MISSION_DEFS.map((def) => (
            <button
              key={def.id}
              type="button"
              onClick={() => setMissionId(def.id)}
              className={[
                'rounded-[8px] border px-3 py-2 text-left transition',
                missionId === def.id
                  ? 'border-ca-teal/28 bg-ca-teal-wash'
                  : 'border-white/8 bg-[rgba(255,255,255,0.02)] hover:border-white/15',
              ].join(' ')}
            >
              <p className="text-sm text-ca-text">{def.name}</p>
              <p className="ca-mono-label text-[0.36rem] text-ca-text-3">{def.reward.fighterId} · {def.section}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── LiveOpsPanel ──────────────────────────────────────────────────────────────

const liveOpsTabs: Array<{ id: LiveOpsTab; label: string; hint: string }> = [
  { id: 'users', label: 'Users', hint: 'Search profiles, edit LP and stats.' },
  { id: 'matches', label: 'Matches', hint: 'View, abandon, and expire matches.' },
  { id: 'missions', label: 'Missions', hint: 'Inspect daily/weekly and unlock mission state.' },
  { id: 'unlocks', label: 'Unlocks', hint: 'Grant or revoke character unlocks per user.' },
]

export function LiveOpsPanel() {
  const [tab, setTab] = useState<LiveOpsTab>('users')
  const isConfigured = Boolean(getSupabaseClient())

  return (
    <div className="space-y-4">
      {!isConfigured ? (
        <div className="rounded-[10px] border border-amber-400/22 bg-amber-400/10 px-4 py-3">
          <p className="ca-mono-label text-[0.44rem] text-amber-300">SUPABASE NOT CONFIGURED</p>
          <p className="mt-1 text-sm text-ca-text-2">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Live Ops tools. Mission and unlock inspection still work from local state.</p>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {liveOpsTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'rounded-lg border px-3 py-2 text-left transition',
              tab === t.id
                ? 'border-ca-teal/28 bg-ca-teal-wash'
                : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:border-white/15',
            ].join(' ')}
          >
            <p className="ca-display text-[0.95rem] text-ca-text">{t.label}</p>
            <p className="mt-1 text-[0.68rem] leading-5 text-ca-text-3">{t.hint}</p>
          </button>
        ))}
      </div>

      <section className="ca-card border-white/8 bg-[rgba(14,15,20,0.16)] p-4 sm:p-5">
        {tab === 'users' && <UsersTab />}
        {tab === 'matches' && <MatchesTab />}
        {tab === 'missions' && <MissionsTab />}
        {tab === 'unlocks' && <UnlocksTab />}
      </section>
    </div>
  )
}
