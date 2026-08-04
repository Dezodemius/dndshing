import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiClient } from '../../api/client'
import AuthShell from '../../auth/AuthShell'
import OAuthButtons from '../../auth/OAuthButtons'
import { translateApiError } from '../../api/errorMessages'

const schema = z
  .object({
    email: z.string().email(),
    displayName: z.string().min(1).max(100),
    password: z.string().min(8).max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export default function RegisterPage() {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setSubmitError(null)
    try {
      await apiClient.post('/auth/register', {
        email: values.email,
        password: values.password,
        display_name: values.displayName,
      })
      setRegistered(true)
    } catch (error) {
      setSubmitError(translateApiError(t, error))
    }
  }

  if (registered) {
    return (
      <AuthShell title={t('pages.register.title')}>
        <p className="auth__note">{t('auth.registerSuccessBody')}</p>
        <p className="auth__footer">
          <Link to="/login">{t('auth.goToLogin')}</Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('pages.register.title')} subtitle={t('pages.register.subtitle')}>
      <form className="auth__form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="auth__field">
          <label className="auth__label" htmlFor="register-email">
            {t('auth.email')}
          </label>
          <input
            className="auth__input"
            id="register-email"
            type="email"
            autoComplete="email"
            {...register('email')}
          />
          {errors.email && (
            <p className="auth__error" role="alert">
              {t('auth.errors.emailInvalid')}
            </p>
          )}
        </div>

        <div className="auth__field">
          <label className="auth__label" htmlFor="register-display-name">
            {t('auth.displayName')}
          </label>
          <input
            className="auth__input"
            id="register-display-name"
            type="text"
            {...register('displayName')}
          />
          {errors.displayName && (
            <p className="auth__error" role="alert">
              {errors.displayName.type === 'too_big'
                ? t('auth.errors.displayNameMax')
                : t('auth.errors.displayNameRequired')}
            </p>
          )}
        </div>

        <div className="auth__field">
          <label className="auth__label" htmlFor="register-password">
            {t('auth.password')}
          </label>
          <input
            className="auth__input"
            id="register-password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password && (
            <p className="auth__error" role="alert">
              {errors.password.type === 'too_big'
                ? t('auth.errors.passwordMax')
                : t('auth.errors.passwordMin')}
            </p>
          )}
        </div>

        <div className="auth__field">
          <label className="auth__label" htmlFor="register-confirm-password">
            {t('auth.confirmPassword')}
          </label>
          <input
            className="auth__input"
            id="register-confirm-password"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className="auth__error" role="alert">
              {t('auth.errors.passwordMismatch')}
            </p>
          )}
        </div>

        {submitError && (
          <p className="auth__error auth__error--form" role="alert">
            {submitError}
          </p>
        )}

        <button className="auth__submit" type="submit" disabled={isSubmitting}>
          {t('auth.registerSubmit')}
        </button>
      </form>

      <OAuthButtons />

      <p className="auth__footer">
        <Link to="/login">{t('auth.goToLogin')}</Link>
      </p>
    </AuthShell>
  )
}
