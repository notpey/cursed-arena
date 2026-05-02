import { useEffect, useState } from 'react'
import { ClanLadderView } from '@/features/ladder/components/ClanLadderView'
import { LadderTabs, type LadderTab } from '@/features/ladder/components/LadderTabs'
import { SorcererLadderView } from '@/features/ladder/components/SorcererLadderView'
import { fetchClanLadder, fetchMyClanStanding, fetchMySorcererStanding, fetchSorcererLadder } from '@/features/ladder/client'
import type { ClanLadderEntry, SorcererLadderEntry } from '@/features/ladder/types'
import { useAuth } from '@/features/auth/useAuth'

export function LadderPage() {
  const { user } = useAuth()
  const userId = user?.id ?? 'local-user'
  const [tab, setTab] = useState<LadderTab>('sorcerer')
  const [sorcerers, setSorcerers] = useState<SorcererLadderEntry[]>([])
  const [clans, setClans] = useState<ClanLadderEntry[]>([])
  const [mySorcerer, setMySorcerer] = useState<SorcererLadderEntry | null>(null)
  const [myClan, setMyClan] = useState<ClanLadderEntry | null>(null)

  useEffect(() => {
    void fetchSorcererLadder(100).then(({ data }) => setSorcerers(data))
    void fetchClanLadder(100).then(({ data }) => setClans(data))
    void fetchMySorcererStanding(userId).then(({ data }) => setMySorcerer(data))
    void fetchMyClanStanding(userId).then(({ data }) => setMyClan(data))
  }, [userId])

  return (
    <section className="space-y-4 py-4 sm:py-6">
      <LadderTabs value={tab} onChange={setTab} />
      {tab === 'sorcerer' ? <SorcererLadderView entries={sorcerers} myStanding={mySorcerer} currentUserId={userId} /> : <ClanLadderView entries={clans} myStanding={myClan} />}
    </section>
  )
}
