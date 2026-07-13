import { createBrowserRouter } from 'react-router-dom'
import Layout from './Layout'
import LandingPage from './pages/LandingPage'
import StubPage from './pages/StubPage'
import NotFoundPage from './pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'login', element: <StubPage titleKey="pages.login.title" /> },
      { path: 'register', element: <StubPage titleKey="pages.register.title" /> },
      { path: 'verify', element: <StubPage titleKey="pages.verifyEmail.title" /> },
      { path: 'app', element: <StubPage titleKey="pages.dashboard.title" /> },
      { path: 'app/characters/new', element: <StubPage titleKey="pages.characterNew.title" /> },
      { path: 'app/characters/:characterId', element: <StubPage titleKey="pages.characterSheet.title" /> },
      { path: 'app/characters/:characterId/level-up', element: <StubPage titleKey="pages.levelUp.title" /> },
      { path: 'app/campaigns/join', element: <StubPage titleKey="pages.campaignJoin.title" /> },
      { path: 'app/campaigns/:campaignId', element: <StubPage titleKey="pages.campaign.title" /> },
      { path: 'app/merchants/:merchantId', element: <StubPage titleKey="pages.merchantEditor.title" /> },
      { path: 'shop/:shareCode', element: <StubPage titleKey="pages.shop.title" /> },
      { path: 'admin/import', element: <StubPage titleKey="pages.adminImport.title" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
