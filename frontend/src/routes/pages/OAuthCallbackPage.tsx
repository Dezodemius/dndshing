import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

export default function OAuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = params.get('access_token')

    // Drop the token from the address bar before anything can await: while it
    // sits in location.hash it is readable by any script on the page and is
    // carried into the session history entry.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)

    if (!accessToken) {
      // No token in the redirect means the provider didn't return usable
      // account info (e.g. VK without an email — see AuthService.login_via_vk_code).
      setError(t('auth.oauthPendingUnsupported'))
      return
    }

    loginWithToken(accessToken)
      .then(() => navigate('/app', { replace: true }))
      .catch(() => {
        setError(t('errors.unknown'))
      })
  }, [loginWithToken, navigate, t])

  if (error) {
    return (
      <section>
        <p role="alert">{error}</p>
        <Link to="/login">{t('auth.goToLogin')}</Link>
      </section>
    )
  }

  return <p>{t('common.loading')}</p>
}
