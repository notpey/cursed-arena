import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreateClanForm } from '@/features/clans/components/CreateClanForm'
import { createClan, fetchMyClan } from '@/features/clans/client'
import type { ClanDetail, CreateClanInput } from '@/features/clans/types'
import { useAuth } from '@/features/auth/useAuth'
import { usePlayerState } from '@/features/player/store'

export function CreateClanPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile } = usePlayerState()
  const userId = user?.id ?? 'local-user'
  const [myClan, setMyClan] = useState<ClanDetail | null>(null)

  useEffect(() => {
    void fetchMyClan(userId).then(({ data }) => setMyClan(data))
  }, [userId])

  async function submit(input: CreateClanInput) {
    const result = await createClan(input)
    if (result.error) return result.error
    navigate('/clan-panel')
    return null
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4 py-4 sm:py-6">
      <header className="ca-card p-5">
        <p className="ca-mono-label text-[0.5rem] text-ca-teal">Clan Register</p>
        <h1 className="ca-display mt-2 text-5xl text-ca-text">Clan Register</h1>
        <p className="mt-3 text-sm text-ca-text-2">Create a clan of your own and begin recruiting sorcerers.</p>
      </header>
      {myClan ? <section className="ca-card p-5 text-ca-red">You are already in a clan. Leave your current clan before creating a new one.</section> : <CreateClanForm leaderId={userId} leaderDisplayName={profile.displayName} onSubmit={submit} />}
    </section>
  )
}
