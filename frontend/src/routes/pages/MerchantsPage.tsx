import { useTranslation } from 'react-i18next'
import ResourceBoard from './dashboard/ResourceBoard'

export default function MerchantsPage() {
  const { t } = useTranslation()

  return (
    <>
      <h1 className="board__heading">{t('pages.dashboard.merchants.title')}</h1>
      <ResourceBoard sections={['merchants']} />
    </>
  )
}
