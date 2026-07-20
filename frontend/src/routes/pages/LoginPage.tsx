import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../../auth/AuthContext'
import OAuthButtons from '../../auth/OAuthButtons'
import { translateApiError } from '../../api/errorMessages'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setSubmitError(null)
    try {
      await login(values.email, values.password)
      navigate('/app', { replace: true })
    } catch (error) {
      setSubmitError(translateApiError(t, error))
    }
  }

  return (
    <section>
      <h1>{t('pages.login.title')}</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <label htmlFor="login-email">{t('auth.email')}</label>
        <input id="login-email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p role="alert">{t('auth.errors.emailInvalid')}</p>}

        <label htmlFor="login-password">{t('auth.password')}</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p role="alert">{t('auth.errors.passwordRequired')}</p>}

        {submitError && <p role="alert">{submitError}</p>}

        <button type="submit" disabled={isSubmitting}>
          {t('auth.loginSubmit')}
        </button>
      </form>

      <OAuthButtons />

      <p>
        <Link to="/register">{t('auth.goToRegister')}</Link>
      </p>
    </section>
  )
}
