import { useTranslation } from 'react-i18next'

export default function LandingPage() {
  const { t } = useTranslation()

  return (
    <section>
      <h1>{t('pages.landing.title')}</h1>
      <p>{t('pages.landing.description')}</p>
    </section>
  )
}
