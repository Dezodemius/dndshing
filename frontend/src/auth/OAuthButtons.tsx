import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { oauthAuthorizeUrl, type OAuthProvidersResponse } from './oauthProviders'

export default function OAuthButtons() {
  const { t } = useTranslation()
  const providersQuery = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: () => apiClient.get<OAuthProvidersResponse>('/auth/oauth/providers'),
  })

  const providers = providersQuery.data?.providers ?? []
  if (providers.length === 0) {
    return null
  }

  return (
    <div className="oauth-buttons">
      <p>{t('auth.oauthDivider')}</p>
      {providers.map((provider) => (
        <a key={provider} className="oauth-button" href={oauthAuthorizeUrl(provider)}>
          {t(`auth.oauthProviders.${provider}`)}
        </a>
      ))}
    </div>
  )
}
