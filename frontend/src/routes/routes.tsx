import { createBrowserRouter } from 'react-router-dom'
import Layout from './Layout'
import RequireAuth from './RequireAuth'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import OAuthCallbackPage from './pages/OAuthCallbackPage'
import DashboardPage from './pages/DashboardPage'
import CharacterSheetPage from './pages/CharacterSheetPage'
import CharacterWizardPage from './pages/characterWizard/CharacterWizardPage'
import StubPage from './pages/StubPage'
import NotFoundPage from './pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'verify', element: <VerifyEmailPage /> },
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
            element: <StubPage titleKey="pages.levelUp.title" />,
          },
          { path: 'campaigns/join', element: <StubPage titleKey="pages.campaignJoin.title" /> },
          { path: 'campaigns/:campaignId', element: <StubPage titleKey="pages.campaign.title" /> },
          { path: 'merchants/:merchantId', element: <StubPage titleKey="pages.merchantEditor.title" /> },
        ],
      },
      { path: 'shop/:shareCode', element: <StubPage titleKey="pages.shop.title" /> },
      { path: 'admin/import', element: <StubPage titleKey="pages.adminImport.title" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
