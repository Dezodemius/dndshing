import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'

const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.landing' },
  { to: '/login', labelKey: 'nav.login' },
  { to: '/register', labelKey: 'nav.register' },
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
      <header>
        <strong>{t('app.title')}</strong>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {t(item.labelKey)}
            </NavLink>
          ))}
          {status === 'authenticated' && (
            <button type="button" onClick={handleLogout}>
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
