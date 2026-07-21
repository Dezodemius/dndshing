import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import { translateApiError } from '../../api/errorMessages'

const resendSchema = z.object({ email: z.string().email() })
type ResendFormValues = z.infer<typeof resendSchema>

function ResendVerificationForm() {
  const { t } = useTranslation()
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendFormValues>({ resolver: zodResolver(resendSchema) })

  async function onSubmit(values: ResendFormValues) {
    await apiClient.post('/auth/verify-email/resend', values)
    setSent(true)
  }

  if (sent) {
    return <p>{t('auth.resendSent')}</p>
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <p>{t('auth.resendTitle')}</p>
      <label htmlFor="resend-email">{t('auth.email')}</label>
      <input id="resend-email" type="email" autoComplete="email" {...register('email')} />
      {errors.email && <p role="alert">{t('auth.errors.emailInvalid')}</p>}
      <button type="submit" disabled={isSubmitting}>
        {t('auth.resendSubmit')}
      </button>
    </form>
  )
}

export default function VerifyEmailPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const verifyQuery = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => apiClient.get(`/auth/verify-email?token=${encodeURIComponent(token as string)}`),
    enabled: Boolean(token),
    retry: false,
  })

  return (
    <section>
      <h1>{t('pages.verifyEmail.title')}</h1>

      {!token && <ResendVerificationForm />}

      {token && verifyQuery.isLoading && <p>{t('common.loading')}</p>}
      {token && verifyQuery.isError && <p role="alert">{translateApiError(t, verifyQuery.error)}</p>}
      {token && verifyQuery.isSuccess && (
        <>
          <p>{t('auth.verifySuccess')}</p>
          <Link to="/login">{t('auth.goToLogin')}</Link>
        </>
      )}
    </section>
  )
}
