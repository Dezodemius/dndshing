import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import './Layout.css'

const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.landing' },
  { to: '/login', labelKey: 'nav.login' },
  { to: '/app', labelKey: 'nav.dashboard' },
  { to: '/admin/import', labelKey: 'nav.adminImport' },
]

export default function Layout() {
  const { t } = useTranslation()
  const { status, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <>
      <header className="app-header">
        <strong className="app-header__brand">{t('app.title')}</strong>
        <nav className="app-header__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="app-header__link"
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
          {status === 'authenticated' && (
            <button type="button" className="app-header__logout" onClick={handleLogout}>
              {t('nav.logout')}
            </button>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
