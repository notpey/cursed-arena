import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { router } from '@/app/router'
import { authoredBattleContent } from '@/features/battle/data'
import { initBattleContentStore, syncPublishedContentFromSupabase } from '@/features/battle/contentStore'

// Prime the store synchronously so first renders see content immediately.
initBattleContentStore(authoredBattleContent)

function ContentSync() {
  useEffect(() => {
    // Fetch the latest published content from Supabase on startup.
    // If Supabase has a newer snapshot, the reactive store broadcasts the
    // update — no page reload needed.
    void syncPublishedContentFromSupabase(authoredBattleContent)
  }, [])

  return null
}

export default function App() {
  return (
    <AuthProvider>
      <ContentSync />
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
