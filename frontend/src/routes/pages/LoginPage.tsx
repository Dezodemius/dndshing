import { useTranslation } from 'react-i18next'
import AuthShell from '../../auth/AuthShell'
import OAuthButtons from '../../auth/OAuthButtons'

// Registration is OAuth-only: signing in and creating an account are the same
// action (the backend links-or-creates a user on the first OAuth callback),
// so there is no separate /register form — just this one page.
export default function LoginPage() {
  const { t } = useTranslation()

  return (
    <AuthShell title={t('pages.login.title')} subtitle={t('pages.login.subtitle')}>
      <OAuthButtons />
    </AuthShell>
  )
}
