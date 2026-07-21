import { API_BASE_URL } from '../api/client'

export interface OAuthProvidersResponse {
  providers: string[]
}

export function oauthAuthorizeUrl(provider: string): string {
  return `${API_BASE_URL}/auth/oauth/${provider}/authorize`
}
