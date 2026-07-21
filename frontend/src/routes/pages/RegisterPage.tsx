import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiClient } from '../../api/client'
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
      <section>
        <h1>{t('pages.register.title')}</h1>
        <p>{t('auth.registerSuccessBody')}</p>
        <Link to="/login">{t('auth.goToLogin')}</Link>
      </section>
    )
  }

  return (
    <section>
      <h1>{t('pages.register.title')}</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <label htmlFor="register-email">{t('auth.email')}</label>
        <input id="register-email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p role="alert">{t('auth.errors.emailInvalid')}</p>}

        <label htmlFor="register-display-name">{t('auth.displayName')}</label>
        <input id="register-display-name" type="text" {...register('displayName')} />
        {errors.displayName && (
          <p role="alert">
            {errors.displayName.type === 'too_big'
              ? t('auth.errors.displayNameMax')
              : t('auth.errors.displayNameRequired')}
          </p>
        )}

        <label htmlFor="register-password">{t('auth.password')}</label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        {errors.password && (
          <p role="alert">
            {errors.password.type === 'too_big'
              ? t('auth.errors.passwordMax')
              : t('auth.errors.passwordMin')}
          </p>
        )}

        <label htmlFor="register-confirm-password">{t('auth.confirmPassword')}</label>
        <input
          id="register-confirm-password"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && <p role="alert">{t('auth.errors.passwordMismatch')}</p>}

        {submitError && <p role="alert">{submitError}</p>}

        <button type="submit" disabled={isSubmitting}>
          {t('auth.registerSubmit')}
        </button>
      </form>

      <OAuthButtons />

      <p>
        <Link to="/login">{t('auth.goToLogin')}</Link>
      </p>
    </section>
  )
}
