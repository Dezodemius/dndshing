import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './LandingPage.css'

type Good = { name: string; info: string }
type PartyMember = { name: string; cls: string; icon: 'rogue' | 'fighter' | 'wizard' }

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" />
    </svg>
  )
}

function WarriorArt({ label }: { label: string }) {
  return (
    <svg className="landing__cell-art" viewBox="0 0 96 96" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
      <g className="landing__art-accent">
        <path d="M36 32a12 12 0 0 1 24 0v6H36v-6Z" />
        <path d="M40 34h16" />
        <path d="M26 78c0-12 10-18 22-18s22 6 22 18" />
      </g>
      <g className="landing__art-muted" strokeWidth="2">
        <path d="M76 22v30" />
        <path d="M69 29h14" />
        <path d="M76 52v6" />
        <path d="M16 44l1.5 3.5L21 49l-3.5 1.5L16 54l-1.5-3.5L11 49l3.5-1.5L16 44Z" />
      </g>
    </svg>
  )
}

const CLASS_ICONS: Record<PartyMember['icon'], JSX.Element> = {
  rogue: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l3 4-3 12-3-12 3-4Z" />
      <path d="M7 9h10" />
    </svg>
  ),
  fighter: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v13" />
      <path d="M7 9h10" />
      <path d="M12 16v3" />
      <path d="M9 21h6" />
    </svg>
  ),
  wizard: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 7 15h10L12 3Z" />
      <path d="M5 15h14" />
    </svg>
  ),
}

export default function LandingPage() {
  const { t } = useTranslation()

  const creationSteps = t('pages.landing.players.creation.steps', { returnObjects: true, defaultValue: [] }) as string[]
  const levelupItems = t('pages.landing.players.levelup.items', { returnObjects: true, defaultValue: [] }) as string[]
  const heroStats = t('pages.landing.demo.hero.stats', { returnObjects: true, defaultValue: [] }) as string[]
  const heroWallet = t('pages.landing.demo.hero.wallet', { returnObjects: true, defaultValue: [] }) as string[]
  const goods = t('pages.landing.demo.goods', { returnObjects: true, defaultValue: [] }) as Good[]
  const party = t('pages.landing.demo.party', { returnObjects: true, defaultValue: [] }) as PartyMember[]
  const notVttChips = t('pages.landing.notVtt.chips', { returnObjects: true, defaultValue: [] }) as string[]

  return (
    <div className="landing">
      <section className="landing__hero" aria-labelledby="landing-hero-title">
        <div className="landing__hero-copy">
          <h1 id="landing-hero-title" className="landing__title">{t('pages.landing.hero.title')}</h1>
          <p className="landing__subtitle">{t('pages.landing.hero.subtitle')}</p>
          <div className="landing__cta-group">
            <Link className="landing__cta landing__cta--primary" to="/register">
              {t('pages.landing.hero.ctaPrimary')}
            </Link>
            <Link className="landing__cta landing__cta--secondary" to="/login">
              {t('pages.landing.hero.ctaSecondary')}
            </Link>
          </div>
        </div>
        <div className="landing__hero-demo" aria-hidden="true">
          <div className="landing__sheet">
            <div className="landing__sheet-head">
              <span className="landing__sheet-name">{t('pages.landing.demo.hero.name')}</span>
              <span className="landing__sheet-class">{t('pages.landing.demo.hero.cls')}</span>
            </div>
            <div className="landing__hp">
              <div className="landing__hp-row">
                <span>{t('pages.landing.demo.hero.hpLabel')}</span>
                <span className="landing__hp-value">{t('pages.landing.demo.hero.hp')}</span>
              </div>
              <div className="landing__hp-bar"><div className="landing__hp-fill" /></div>
            </div>
            <div className="landing__stats">
              {heroStats.map((stat) => (
                <span key={stat} className="landing__stat">{stat}</span>
              ))}
            </div>
            <div className="landing__gear">
              <div className="landing__gear-row"><span>{t('pages.landing.demo.hero.gear1Name')}</span><span>{t('pages.landing.demo.hero.gear1Value')}</span></div>
              <div className="landing__gear-row"><span>{t('pages.landing.demo.hero.gear2Name')}</span><span>{t('pages.landing.demo.hero.gear2Value')}</span></div>
            </div>
            <div className="landing__wallet">
              {heroWallet.map((coin, index) => (
                <span key={coin} className={index === 0 ? 'landing__wallet-gold' : undefined}>{coin}</span>
              ))}
            </div>
          </div>
          <div className="landing__levelup-badge">
            <SparkleIcon />
            <span>{t('pages.landing.demo.levelupBadge')}</span>
          </div>
        </div>
      </section>

      <section className="landing__section" aria-labelledby="landing-players-title">
        <div className="landing__section-head">
          <h2 id="landing-players-title" className="landing__section-title">{t('pages.landing.players.title')}</h2>
          <span className="landing__rule" aria-hidden="true" />
        </div>
        <div className="landing__bento landing__bento--players">
          <article className="landing__cell landing__cell--sheet" aria-labelledby="landing-cell-sheet">
            <h3 id="landing-cell-sheet" className="landing__cell-title">{t('pages.landing.players.sheet.title')}</h3>
            <p className="landing__cell-body">{t('pages.landing.players.sheet.body')}</p>
            <div className="landing__phone" aria-hidden="true">
              <div className="landing__sheet-head">
                <span className="landing__sheet-name landing__sheet-name--sm">{t('pages.landing.demo.hero.shortName')}</span>
                <span className="landing__sheet-class landing__sheet-class--sm">{t('pages.landing.demo.hero.cls')}</span>
              </div>
              <div className="landing__hp-bar"><div className="landing__hp-fill" /></div>
              <div className="landing__stats landing__stats--sm">
                {heroStats.slice(0, 2).map((stat) => (
                  <span key={stat} className="landing__stat">{stat}</span>
                ))}
              </div>
              <div className="landing__wallet landing__wallet--sm">
                {heroWallet.map((coin, index) => (
                  <span key={coin} className={index === 0 ? 'landing__wallet-gold' : undefined}>{coin}</span>
                ))}
              </div>
            </div>
          </article>
          <article className="landing__cell landing__cell--creation" aria-labelledby="landing-cell-creation">
            <h3 id="landing-cell-creation" className="landing__cell-title">{t('pages.landing.players.creation.title')}</h3>
            <ol className="landing__steps">
              {creationSteps.map((step) => (
                <li key={step} className="landing__step">{step}</li>
              ))}
            </ol>
            <p className="landing__cell-body">{t('pages.landing.players.creation.note')}</p>
          </article>
          <article className="landing__cell landing__cell--levelup" aria-labelledby="landing-cell-levelup">
            <h3 id="landing-cell-levelup" className="landing__cell-title">{t('pages.landing.players.levelup.title')}</h3>
            <ul className="landing__pluslist">
              {levelupItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="landing__cell-note">{t('pages.landing.players.levelup.note')}</p>
          </article>
          <article className="landing__cell landing__cell--shop landing__cell--art" aria-labelledby="landing-cell-shop">
            <WarriorArt label={t('pages.landing.players.shop.illustrationAlt')} />
            <h3 id="landing-cell-shop" className="landing__visually-hidden">{t('pages.landing.players.shop.caption')}</h3>
            <p className="landing__cell-note landing__cell-note--center" aria-hidden="true">{t('pages.landing.players.shop.caption')}</p>
            <span className="landing__shop-code">{t('pages.landing.demo.shopUrl')}</span>
          </article>
        </div>
      </section>

      <section className="landing__section" aria-labelledby="landing-masters-title">
        <div className="landing__section-head">
          <h2 id="landing-masters-title" className="landing__section-title">{t('pages.landing.masters.title')}</h2>
          <span className="landing__rule" aria-hidden="true" />
        </div>
        <div className="landing__bento landing__bento--masters">
          <article className="landing__cell landing__cell--campaign" aria-labelledby="landing-cell-campaign">
            <div className="landing__cell-copy">
              <h3 id="landing-cell-campaign" className="landing__cell-title">{t('pages.landing.masters.campaign.title')}</h3>
              <p className="landing__cell-body">{t('pages.landing.masters.campaign.body')}</p>
            </div>
            <div className="landing__invite" aria-hidden="true">
              <span className="landing__invite-name">{t('pages.landing.demo.campaign.title')}</span>
              <span className="landing__invite-when">{t('pages.landing.demo.campaign.when')}</span>
              <span className="landing__invite-code">{t('pages.landing.demo.campaign.code')}</span>
            </div>
          </article>
          <article className="landing__cell landing__cell--merchant" aria-labelledby="landing-cell-merchant">
            <h3 id="landing-cell-merchant" className="landing__cell-title">{t('pages.landing.masters.merchant.title')}</h3>
            <p className="landing__cell-body">{t('pages.landing.masters.merchant.body')}</p>
            <div className="landing__goods" aria-hidden="true">
              {goods.map((good) => (
                <div key={good.name} className="landing__goods-row">
                  <span>{good.name}</span>
                  <span className="landing__goods-info">{good.info}</span>
                </div>
              ))}
              <div className="landing__goods-row landing__goods-row--buyback">
                <span>{t('pages.landing.masters.merchant.buybackLabel')}</span>
                <span>{t('pages.landing.masters.merchant.buybackValue')}</span>
              </div>
            </div>
          </article>
          <article className="landing__cell landing__cell--sheets" aria-labelledby="landing-cell-sheets">
            <h3 id="landing-cell-sheets" className="landing__cell-title">{t('pages.landing.masters.sheets.title')}</h3>
            <ul className="landing__party">
              {party.map((member) => (
                <li key={member.name} className="landing__party-row">
                  <span className="landing__party-member">
                    <span className={`landing__class-icon landing__class-icon--${member.icon}`} aria-hidden="true">{CLASS_ICONS[member.icon]}</span>
                    <span className="landing__party-name">{member.name}</span>
                  </span>
                  <span className="landing__party-class">{member.cls}</span>
                </li>
              ))}
            </ul>
            <p className="landing__cell-note">{t('pages.landing.masters.sheets.note')}</p>
          </article>
          <article className="landing__cell landing__cell--give" aria-labelledby="landing-cell-give">
            <h3 id="landing-cell-give" className="landing__cell-title">{t('pages.landing.masters.giveItem.title')}</h3>
            <p className="landing__cell-body">{t('pages.landing.masters.giveItem.body')}</p>
            <div className="landing__chat" aria-hidden="true">
              <span className="landing__chat-say">{t('pages.landing.demo.giveItem.say')}</span>
              <span className="landing__chat-result">{t('pages.landing.demo.giveItem.result')}</span>
            </div>
          </article>
        </div>
      </section>

      <aside className="landing__not-vtt" aria-labelledby="landing-not-vtt-title">
        <span className="landing__not-vtt-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3h10v3.5L13 11l4 4.5V21H7v-5.5L11 11 7 6.5V3Z" />
          </svg>
        </span>
        <div className="landing__not-vtt-copy">
          <h2 id="landing-not-vtt-title" className="landing__not-vtt-title">{t('pages.landing.notVtt.title')}</h2>
          <p className="landing__not-vtt-body">{t('pages.landing.notVtt.body')}</p>
        </div>
        <div className="landing__timeline" aria-hidden="true">
          {notVttChips.map((chip, index) => (
            <span key={chip} className={`landing__timeline-chip${index === 1 ? ' landing__timeline-chip--active' : ''}`}>{chip}</span>
          ))}
        </div>
      </aside>
    </div>
  )
}
