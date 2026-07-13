import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.landing' },
  { to: '/login', labelKey: 'nav.login' },
  { to: '/register', labelKey: 'nav.register' },
  { to: '/app', labelKey: 'nav.dashboard' },
  { to: '/admin/import', labelKey: 'nav.adminImport' },
]

export default function Layout() {
  const { t } = useTranslation()

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
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
