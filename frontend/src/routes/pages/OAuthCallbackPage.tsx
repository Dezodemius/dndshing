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

    if (!accessToken) {
      // The VK "enter your email" intermediate flow (#oauth_pending_token=...)
      // is out of scope for this task (see DND-015 plan assumptions).
      setError(t('auth.oauthPendingUnsupported'))
      return
    }

    loginWithToken(accessToken)
      .then(() => navigate('/app', { replace: true }))
      .catch(() => setError(t('errors.unknown')))
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
