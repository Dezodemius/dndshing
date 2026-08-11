import { useTranslation } from 'react-i18next'

export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <section>
      <h1>{t('pages.notFound.title')}</h1>
    </section>
  )
}
