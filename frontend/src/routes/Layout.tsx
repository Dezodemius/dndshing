import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import './Layout.css'

interface NavItem {
  to: string
  labelKey: string
  // NavLink marks a link active for every path below `to` unless `end` is set.
  // '/' and '/app' are prefixes of everything under them, so both need it —
  // without it "Обзор" lights up alongside every cabinet page added later.
  end: boolean
}

const GUEST_NAV: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.landing', end: true },
  { to: '/login', labelKey: 'nav.login', end: false },
]

const CABINET_NAV: readonly NavItem[] = [
  { to: '/app', labelKey: 'nav.overview', end: true },
  { to: '/app/characters', labelKey: 'nav.characters', end: false },
  { to: '/app/campaigns', labelKey: 'nav.campaigns', end: false },
  { to: '/app/merchants', labelKey: 'nav.merchants', end: false },
]

export default function Layout() {
  const { t } = useTranslation()
  const { status, logout } = useAuth()
  const navigate = useNavigate()

  // The shop is reachable by a link the DM hands out, and BR §4.1 forbids any
  // route from it to sheet or wallet editing. The header renders on every
  // route, so the cabinet links have to be suppressed here rather than inside
  // ShopPage. Only the cabinet is suppressed: a guest still needs "Вход",
  // since browsing a merchant link is a normal way to arrive signed out.
  const isShop = useMatch('/shop/:shareCode') !== null
  const isAuthenticated = status === 'authenticated'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const items = isAuthenticated ? (isShop ? [] : CABINET_NAV) : GUEST_NAV
  // The brand is a link too, and for a signed-in user it points at /app —
  // itself a route into the cabinet. On the shop it goes to the landing page.
  const brandTo = isAuthenticated && !isShop ? '/app' : '/'

  return (
    <>
      <header className="app-header">
        <Link className="app-header__brand" to={brandTo}>
          {t('app.title')}
        </Link>
        {/* AuthContext starts in 'loading' and leaves it only once the refresh
            call settles. Rendering either navigation before then flashes the
            wrong one on every full page load, so this reserves the row height
            and shows nothing. */}
        {status === 'loading' ? (
          <div className="app-header__nav app-header__nav--pending" aria-hidden="true" />
        ) : (
          <nav className="app-header__nav" aria-label={t('nav.primary')}>
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="app-header__link">
                {t(item.labelKey)}
              </NavLink>
            ))}
            {isAuthenticated && (
              <button type="button" className="app-header__logout" onClick={handleLogout}>
                {t('nav.logout')}
              </button>
            )}
          </nav>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
