import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import { listCampaigns } from '../../api/campaigns'
import { translateApiError } from '../../api/errorMessages'

interface ResourceSummary {
  id: number | string
  name: string
}

interface ResourceSectionConfig {
  path: string
  titleKey: string
  emptyKey: string
  actionTo?: string
  actionLabelKey?: string
}

const CHARACTERS_SECTION: ResourceSectionConfig = {
  path: '/characters',
  titleKey: 'pages.dashboard.characters.title',
  emptyKey: 'pages.dashboard.characters.empty',
  actionTo: '/app/characters/new',
  actionLabelKey: 'pages.dashboard.characters.create',
}

const MERCHANTS_SECTION: ResourceSectionConfig = {
  path: '/merchants',
  titleKey: 'pages.dashboard.merchants.title',
  emptyKey: 'pages.dashboard.merchants.empty',
  actionTo: '/app/merchants/new',
  actionLabelKey: 'pages.dashboard.merchants.create',
}

function CampaignsSection() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['dashboard', '/campaigns'],
    queryFn: () => listCampaigns(),
    retry: false,
  })

  return (
    <section>
      <h2>{t('pages.dashboard.campaigns.title')}</h2>
      {query.isLoading && <p>{t('common.loading')}</p>}
      {query.isError && <p role="alert">{translateApiError(t, query.error)}</p>}
      {query.isSuccess && query.data.as_dm.length === 0 && query.data.as_player.length === 0 && (
        <p>
          {t('pages.dashboard.campaigns.empty')}{' '}
          <Link to="/app/campaigns/new">{t('pages.dashboard.campaigns.create')}</Link>{' '}
          <Link to="/app/campaigns/join">{t('pages.dashboard.campaigns.join')}</Link>
        </p>
      )}
      {query.isSuccess && (query.data.as_dm.length > 0 || query.data.as_player.length > 0) && (
        <>
          <h3>{t('pages.dashboard.campaigns.asDm')}</h3>
          {query.data.as_dm.length === 0 ? (
            <p>
              <Link to="/app/campaigns/new">{t('pages.dashboard.campaigns.create')}</Link>
            </p>
          ) : (
            <ul>
              {query.data.as_dm.map((campaign) => (
                <li key={campaign.id}>
                  <Link to={`/app/campaigns/${campaign.id}`}>{campaign.name}</Link>
                </li>
              ))}
            </ul>
          )}
          <h3>{t('pages.dashboard.campaigns.asPlayer')}</h3>
          {query.data.as_player.length === 0 ? (
            <p>
              <Link to="/app/campaigns/join">{t('pages.dashboard.campaigns.join')}</Link>
            </p>
          ) : (
            <ul>
              {query.data.as_player.map((campaign) => (
                <li key={campaign.id}>{campaign.name}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function ResourceSection({ path, titleKey, emptyKey, actionTo, actionLabelKey }: ResourceSectionConfig) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['dashboard', path],
    queryFn: () => apiClient.get<ResourceSummary[]>(path),
    retry: false,
  })

  return (
    <section>
      <h2>{t(titleKey)}</h2>
      {query.isLoading && <p>{t('common.loading')}</p>}
      {query.isError && <p role="alert">{translateApiError(t, query.error)}</p>}
      {query.isSuccess && query.data.length === 0 && (
        <p>
          {t(emptyKey)}
          {actionTo && actionLabelKey && <Link to={actionTo}> {t(actionLabelKey)}</Link>}
        </p>
      )}
      {query.isSuccess && query.data.length > 0 && (
        <ul>
          {query.data.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function DashboardPage() {
  const { t } = useTranslation()

  return (
    <section>
      <h1>{t('pages.dashboard.title')}</h1>
      <ResourceSection {...CHARACTERS_SECTION} />
      <CampaignsSection />
      <ResourceSection {...MERCHANTS_SECTION} />
    </section>
  )
}
