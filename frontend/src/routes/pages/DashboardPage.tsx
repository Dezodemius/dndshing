import { useTranslation } from 'react-i18next'
import ResourceBoard from './dashboard/ResourceBoard'

export default function DashboardPage() {
  const { t } = useTranslation()

  return (
    <>
      <h1 className="board__heading">{t('pages.dashboard.title')}</h1>
      <ResourceBoard sections={['characters', 'campaigns', 'merchants']} preview />
    </>
  )
}
