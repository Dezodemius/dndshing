import { Navigate, createBrowserRouter } from 'react-router-dom'
import Layout from './Layout'
import RequireAuth from './RequireAuth'
import RedirectIfAuthenticated from './RedirectIfAuthenticated'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import OAuthCallbackPage from './pages/OAuthCallbackPage'
import DashboardPage from './pages/DashboardPage'
import CharacterSheetPage from './pages/CharacterSheetPage'
import CharacterWizardPage from './pages/characterWizard/CharacterWizardPage'
import LevelUpWizardPage from './pages/levelUpWizard/LevelUpWizardPage'
import MerchantEditorPage from './pages/MerchantEditorPage'
import ShopPage from './pages/ShopPage'
import CampaignPage from './pages/CampaignPage'
import CampaignCharacterSheetPage from './pages/CampaignCharacterSheetPage'
import CampaignJoinPage from './pages/CampaignJoinPage'
import NotFoundPage from './pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <LandingPage /> },
      // Pathless wrapper: /login bounces an already signed-in user to /app.
      { element: <RedirectIfAuthenticated />, children: [{ path: 'login', element: <LoginPage /> }] },
      // Registration is OAuth-only (see LoginPage): both old routes just
      // point here so existing links/bookmarks still land somewhere useful.
      // Left outside the wrapper — they redirect to /login, which applies it.
      { path: 'register', element: <Navigate to="/login" replace /> },
      { path: 'verify', element: <Navigate to="/login" replace /> },
      // Also outside: the callback signs the user in and then navigates to
      // /app itself. Wrapping it would race that with a redirect of our own.
      { path: 'oauth/callback', element: <OAuthCallbackPage /> },
      {
        path: 'app',
        element: <RequireAuth />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'characters/new', element: <CharacterWizardPage /> },
          { path: 'characters/:characterId', element: <CharacterSheetPage /> },
          {
            path: 'characters/:characterId/level-up',
            element: <LevelUpWizardPage />,
          },
          { path: 'campaigns/new', element: <CampaignPage /> },
          { path: 'campaigns/join', element: <CampaignJoinPage /> },
          { path: 'campaigns/:campaignId', element: <CampaignPage /> },
          {
            path: 'campaigns/:campaignId/characters/:characterId',
            element: <CampaignCharacterSheetPage />,
          },
          { path: 'merchants/new', element: <MerchantEditorPage /> },
          { path: 'merchants/:merchantId', element: <MerchantEditorPage /> },
        ],
      },
      { path: 'shop/:shareCode', element: <ShopPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
