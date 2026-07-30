import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { joinCampaign, type CampaignPlayerView } from '../../api/campaigns'
import { listCharacters } from '../../api/characters'
import { translateApiError } from '../../api/errorMessages'
import './CampaignJoinPage.css'

const joinSchema = z.object({
  invite_code: z.string().min(1),
  character_id: z.coerce.number().int().positive(),
})

type JoinFormValues = z.infer<typeof joinSchema>

export default function CampaignJoinPage() {
  const { t } = useTranslation()
  const [joined, setJoined] = useState<{ character: string; campaign: CampaignPlayerView } | null>(
    null,
  )

  const charactersQuery = useQuery({
    queryKey: ['characters'],
    queryFn: () => listCharacters(),
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JoinFormValues>({
    resolver: zodResolver(joinSchema),
    defaultValues: { invite_code: '' },
  })

  const joinMutation = useMutation({
    mutationFn: (values: JoinFormValues) =>
      joinCampaign({ invite_code: values.invite_code, character_id: values.character_id }),
  })

  async function onSubmit(values: JoinFormValues) {
    try {
      const campaign = await joinMutation.mutateAsync(values)
      const character = charactersQuery.data?.find((item) => item.id === values.character_id)
      setJoined({ character: character?.name ?? '', campaign })
    } catch {
      // surfaced via joinMutation.isError below
    }
  }

  if (joined) {
    return (
      <section className="campaign-join">
        <h1>{t('pages.campaignJoin.title')}</h1>
        <p>
          {t('pages.campaignJoin.success', {
            character: joined.character,
            campaign: joined.campaign.name,
          })}
        </p>
        <Link to="/app">{t('pages.campaignJoin.backToDashboard')}</Link>
      </section>
    )
  }

  return (
    <section className="campaign-join">
      <h1>{t('pages.campaignJoin.title')}</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="campaign-join__field">
          <label htmlFor="join-invite-code">{t('pages.campaignJoin.codeLabel')}</label>
          <input
            id="join-invite-code"
            type="text"
            placeholder={t('pages.campaignJoin.codePlaceholder')}
            {...register('invite_code')}
          />
        </div>

        {charactersQuery.isLoading && <p>{t('common.loading')}</p>}
        {charactersQuery.isError && (
          <p role="alert">{translateApiError(t, charactersQuery.error)}</p>
        )}
        {charactersQuery.isSuccess && charactersQuery.data.length === 0 && (
          <p>{t('pages.campaignJoin.noCharacters')}</p>
        )}
        {charactersQuery.isSuccess && charactersQuery.data.length > 0 && (
          <div className="campaign-join__field">
            <label htmlFor="join-character">{t('pages.campaignJoin.characterLabel')}</label>
            <select id="join-character" defaultValue="" {...register('character_id')}>
              <option value="" disabled>
                {t('pages.campaignJoin.characterPlaceholder')}
              </option>
              {charactersQuery.data.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
            {errors.character_id && (
              <p role="alert">{t('pages.campaignJoin.characterPlaceholder')}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !charactersQuery.data || charactersQuery.data.length === 0}
        >
          {t('pages.campaignJoin.submit')}
        </button>
        {joinMutation.isError && <p role="alert">{translateApiError(t, joinMutation.error)}</p>}
      </form>
    </section>
  )
}
