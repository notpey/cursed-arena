import { createBrowserRouter } from 'react-router-dom'
import { ShellLayout } from '@/app/ShellLayout'
import { HomePage } from '@/pages/HomePage'
import { BattlePage } from '@/pages/BattlePage'
import { RosterPage } from '@/pages/RosterPage'
import { CharacterDetailPage } from '@/pages/CharacterDetailPage'
import { SummonPage } from '@/pages/SummonPage'
import { StoryPage } from '@/pages/StoryPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <ShellLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'battle', element: <BattlePage /> },
      { path: 'roster', element: <RosterPage /> },
      { path: 'roster/:characterId', element: <CharacterDetailPage /> },
      { path: 'summon', element: <SummonPage /> },
      { path: 'story', element: <StoryPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
