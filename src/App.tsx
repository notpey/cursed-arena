import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { router } from '@/app/router'
import { authoredBattleContent } from '@/features/battle/data'
import { syncPublishedContentFromSupabase } from '@/features/battle/contentStore'

function ContentSync() {
  useEffect(() => {
    // Fetch the latest published content from Supabase on startup.
    // data.ts loaded synchronously from localStorage; if Supabase has a newer
    // snapshot we update localStorage and reload so all clients stay in sync.
    syncPublishedContentFromSupabase(authoredBattleContent).then((wasStale) => {
      if (wasStale) {
        window.location.reload()
      }
    })
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
