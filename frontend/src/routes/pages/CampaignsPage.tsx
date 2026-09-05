import { useTranslation } from 'react-i18next'
import ResourceBoard from './dashboard/ResourceBoard'

export default function CampaignsPage() {
  const { t } = useTranslation()

  return (
    <>
      <h1 className="board__heading">{t('pages.dashboard.campaigns.title')}</h1>
      <ResourceBoard sections={['campaigns']} />
    </>
  )
}
