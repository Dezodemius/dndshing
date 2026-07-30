import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
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

const SECTIONS: ResourceSectionConfig[] = [
  {
    path: '/characters',
    titleKey: 'pages.dashboard.characters.title',
    emptyKey: 'pages.dashboard.characters.empty',
    actionTo: '/app/characters/new',
    actionLabelKey: 'pages.dashboard.characters.create',
  },
  {
    path: '/campaigns',
    titleKey: 'pages.dashboard.campaigns.title',
    emptyKey: 'pages.dashboard.campaigns.empty',
    actionTo: '/app/campaigns/join',
    actionLabelKey: 'pages.dashboard.campaigns.join',
  },
  {
    path: '/merchants',
    titleKey: 'pages.dashboard.merchants.title',
    emptyKey: 'pages.dashboard.merchants.empty',
    actionTo: '/app/merchants/new',
    actionLabelKey: 'pages.dashboard.merchants.create',
  },
]

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
      {SECTIONS.map((section) => (
        <ResourceSection key={section.path} {...section} />
      ))}
    </section>
  )
}
