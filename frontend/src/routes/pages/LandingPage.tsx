import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './LandingPage.css'

export default function LandingPage() {
  const { t } = useTranslation()

  const playerItems = t('pages.landing.players.items', { returnObjects: true }) as string[]
  const masterItems = t('pages.landing.masters.items', { returnObjects: true }) as string[]

  return (
    <div className="landing">
      <section className="landing__hero">
        <h1 className="landing__title">{t('pages.landing.hero.title')}</h1>
        <p className="landing__subtitle">{t('pages.landing.hero.subtitle')}</p>
        <div className="landing__cta-group">
          <Link className="landing__cta landing__cta--primary" to="/register">
            {t('pages.landing.hero.ctaPrimary')}
          </Link>
          <Link className="landing__cta landing__cta--secondary" to="/login">
            {t('pages.landing.hero.ctaSecondary')}
          </Link>
        </div>
      </section>

      <div className="landing__audiences">
        <section className="landing__card" aria-labelledby="landing-players-title">
          <h2 id="landing-players-title" className="landing__card-title">
            {t('pages.landing.players.title')}
          </h2>
          <ul className="landing__list">
            {playerItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="landing__card" aria-labelledby="landing-masters-title">
          <h2 id="landing-masters-title" className="landing__card-title">
            {t('pages.landing.masters.title')}
          </h2>
          <ul className="landing__list">
            {masterItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
