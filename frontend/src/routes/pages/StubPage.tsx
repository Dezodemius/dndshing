import { useTranslation } from 'react-i18next'

interface StubPageProps {
  titleKey: string
}

export default function StubPage({ titleKey }: StubPageProps) {
  const { t } = useTranslation()

  return (
    <section>
      <h1>{t(titleKey)}</h1>
      <p>{t('common.comingSoon')}</p>
    </section>
  )
}
