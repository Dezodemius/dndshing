import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  createCampaign,
  deleteCampaign,
  getCampaign,
  getCampaignCharacter,
  patchCampaign,
  regenerateInviteCode,
  removeCampaignCharacter,
  type Campaign,
  type CampaignDetail,
  type CampaignParticipant,
  type CampaignPatch,
} from '../../api/campaigns'
import { translateApiError } from '../../api/errorMessages'
import './CampaignPage.css'

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}

const cardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  next_session_at: z.string(),
  next_session_place: z.string().max(200),
})

type CardFormValues = z.infer<typeof cardSchema>

function toCardValues(campaign: Campaign): CardFormValues {
  return {
    name: campaign.name,
    description: campaign.description ?? '',
    next_session_at: toDatetimeLocal(campaign.next_session_at),
    next_session_place: campaign.next_session_place ?? '',
  }
}

interface ParticipantRowProps {
  campaignId: string
  participant: CampaignParticipant
}

function ParticipantRow({ campaignId, participant }: ParticipantRowProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const characterQuery = useQuery({
    queryKey: ['campaign-character', campaignId, participant.character_id],
    queryFn: () => getCampaignCharacter(campaignId, participant.character_id),
  })

  const kickMutation = useMutation({
    mutationFn: () => removeCampaignCharacter(campaignId, participant.character_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] }),
  })

  function handleKick(name: string) {
    if (!window.confirm(t('pages.campaign.participants.kickConfirm', { name }))) return
    kickMutation.mutate()
  }

  if (characterQuery.isLoading) {
    return (
      <li className="campaign-page__list-item">
        <span>{t('common.loading')}</span>
      </li>
    )
  }

  if (characterQuery.isError || !characterQuery.data) {
    return (
      <li className="campaign-page__list-item">
        <span role="alert">{translateApiError(t, characterQuery.error)}</span>
      </li>
    )
  }

  const character = characterQuery.data

  return (
    <li className="campaign-page__list-item">
      <div className="campaign-page__participant-header">
        <span className="campaign-page__list-label">{character.name}</span>
        <span className="campaign-page__muted">
          {t('pages.campaign.participants.level', { level: character.level })}
        </span>
      </div>
      <div className="campaign-page__participant-stats">
        <span>
          {t('pages.campaign.participants.hp', {
            current: character.hp_current,
            max: character.hp_max,
          })}
        </span>
        <span>{t('pages.campaign.participants.ac', { value: character.computed.ac })}</span>
        <span>
          {t('pages.campaign.participants.wallet', {
            gold: character.gold,
            silver: character.silver,
            copper: character.copper,
          })}
        </span>
      </div>
      <button type="button" onClick={() => handleKick(character.name)} disabled={kickMutation.isPending}>
        {t('pages.campaign.participants.kick')}
      </button>
      {kickMutation.isError && <p role="alert">{translateApiError(t, kickMutation.error)}</p>}
    </li>
  )
}

function CreateCampaignForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: { name: '', description: '', next_session_at: '', next_session_place: '' },
  })

  const createMutation = useMutation({
    mutationFn: (values: CardFormValues) =>
      createCampaign({
        name: values.name,
        description: values.description.trim() === '' ? null : values.description,
        next_session_at: fromDatetimeLocal(values.next_session_at),
        next_session_place:
          values.next_session_place.trim() === '' ? null : values.next_session_place,
      }),
    onSuccess: (created) => navigate(`/app/campaigns/${created.id}`, { replace: true }),
  })

  return (
    <section className="campaign-page">
      <h1>{t('pages.campaign.title')}</h1>
      <form onSubmit={handleSubmit((values) => createMutation.mutate(values))} noValidate>
        <h2>{t('pages.campaign.create.heading')}</h2>
        <div className="campaign-page__field">
          <label htmlFor="campaign-create-name">{t('pages.campaign.create.nameLabel')}</label>
          <input
            id="campaign-create-name"
            type="text"
            placeholder={t('pages.campaign.create.namePlaceholder')}
            {...register('name')}
          />
          {errors.name && <p role="alert">{t('pages.campaign.create.invalidName')}</p>}
        </div>
        <div className="campaign-page__field">
          <label htmlFor="campaign-create-description">
            {t('pages.campaign.create.descriptionLabel')}
          </label>
          <textarea
            id="campaign-create-description"
            maxLength={2000}
            placeholder={t('pages.campaign.create.descriptionPlaceholder')}
            {...register('description')}
          />
        </div>
        <div className="campaign-page__field">
          <label htmlFor="campaign-create-next-session-at">
            {t('pages.campaign.create.nextSessionAtLabel')}
          </label>
          <input
            id="campaign-create-next-session-at"
            type="datetime-local"
            {...register('next_session_at')}
          />
        </div>
        <div className="campaign-page__field">
          <label htmlFor="campaign-create-next-session-place">
            {t('pages.campaign.create.nextSessionPlaceLabel')}
          </label>
          <input
            id="campaign-create-next-session-place"
            type="text"
            placeholder={t('pages.campaign.create.nextSessionPlacePlaceholder')}
            {...register('next_session_place')}
          />
        </div>
        <button type="submit" disabled={isSubmitting}>
          {t('pages.campaign.create.submit')}
        </button>
        {createMutation.isError && <p role="alert">{translateApiError(t, createMutation.error)}</p>}
      </form>
    </section>
  )
}

interface CampaignEditorProps {
  campaignId: string
}

function CampaignEditor({ campaignId }: CampaignEditorProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const savedOnce = useRef(false)

  const query = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => getCampaign(campaignId),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    values: query.data ? toCardValues(query.data) : undefined,
    resetOptions: { keepDirtyValues: true },
  })

  const patchMutation = useMutation({
    mutationFn: (payload: CampaignPatch) => patchCampaign(campaignId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['campaign', campaignId], (old: CampaignDetail | undefined) =>
        old ? { ...old, ...updated } : old,
      )
      reset(toCardValues(updated))
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateInviteCode(campaignId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['campaign', campaignId], (old: CampaignDetail | undefined) =>
        old ? { ...old, ...updated } : old,
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCampaign(campaignId),
    onSuccess: () => navigate('/app', { replace: true }),
  })

  async function onSubmitCard(values: CardFormValues) {
    const payload: CampaignPatch = {}
    if (dirtyFields.name) payload.name = values.name
    if (dirtyFields.description) {
      payload.description = values.description.trim() === '' ? null : values.description
    }
    if (dirtyFields.next_session_at) {
      payload.next_session_at = fromDatetimeLocal(values.next_session_at)
    }
    if (dirtyFields.next_session_place) {
      payload.next_session_place =
        values.next_session_place.trim() === '' ? null : values.next_session_place
    }
    if (Object.keys(payload).length === 0) return
    savedOnce.current = true
    await patchMutation.mutateAsync(payload)
  }

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function handleRegenerate() {
    if (!window.confirm(t('pages.campaign.invite.regenerateConfirm'))) return
    regenerateMutation.mutate()
  }

  function handleDelete(name: string) {
    if (!window.confirm(t('pages.campaign.delete.confirm', { name }))) return
    deleteMutation.mutate()
  }

  if (query.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (query.isError) {
    return <p role="alert">{translateApiError(t, query.error)}</p>
  }

  if (!query.data) {
    return null
  }

  const campaign = query.data

  return (
    <section className="campaign-page">
      <h1>{t('pages.campaign.title')}</h1>

      <form
        className="campaign-page__section"
        onSubmit={handleSubmit(onSubmitCard)}
        noValidate
        aria-labelledby="campaign-card-heading"
      >
        <h2 id="campaign-card-heading">{campaign.name}</h2>
        <div className="campaign-page__field">
          <label htmlFor="campaign-name">{t('pages.campaign.card.nameLabel')}</label>
          <input id="campaign-name" type="text" {...register('name')} />
          {errors.name && <p role="alert">{t('pages.campaign.card.invalidName')}</p>}
        </div>
        <div className="campaign-page__field">
          <label htmlFor="campaign-description">{t('pages.campaign.card.descriptionLabel')}</label>
          <textarea id="campaign-description" maxLength={2000} {...register('description')} />
        </div>
        <div className="campaign-page__field">
          <label htmlFor="campaign-next-session-at">
            {t('pages.campaign.card.nextSessionAtLabel')}
          </label>
          <input id="campaign-next-session-at" type="datetime-local" {...register('next_session_at')} />
        </div>
        <div className="campaign-page__field">
          <label htmlFor="campaign-next-session-place">
            {t('pages.campaign.card.nextSessionPlaceLabel')}
          </label>
          <input id="campaign-next-session-place" type="text" {...register('next_session_place')} />
        </div>
        <div className="campaign-page__save-row">
          <button type="submit" disabled={isSubmitting}>
            {t('pages.campaign.card.save')}
          </button>
          {patchMutation.isError && <p role="alert">{translateApiError(t, patchMutation.error)}</p>}
          {patchMutation.isSuccess && savedOnce.current && <p>{t('pages.campaign.card.saved')}</p>}
        </div>
      </form>

      <section className="campaign-page__section" aria-labelledby="campaign-invite-heading">
        <h2 id="campaign-invite-heading">{t('pages.campaign.invite.heading')}</h2>
        <div className="campaign-page__link-row">
          <input
            type="text"
            readOnly
            value={campaign.invite_code}
            aria-label={t('pages.campaign.invite.heading')}
          />
          <button type="button" onClick={() => handleCopyCode(campaign.invite_code)}>
            {t('pages.campaign.invite.copy')}
          </button>
        </div>
        {copied && <p>{t('pages.campaign.invite.copied')}</p>}
        <button type="button" onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
          {t('pages.campaign.invite.regenerate')}
        </button>
        {regenerateMutation.isError && (
          <p role="alert">{translateApiError(t, regenerateMutation.error)}</p>
        )}
      </section>

      <section className="campaign-page__section" aria-labelledby="campaign-participants-heading">
        <h2 id="campaign-participants-heading">{t('pages.campaign.participants.heading')}</h2>
        {campaign.participants.length === 0 ? (
          <p>{t('pages.campaign.participants.empty')}</p>
        ) : (
          <ul className="campaign-page__list">
            {campaign.participants.map((participant) => (
              <ParticipantRow
                key={participant.character_id}
                campaignId={campaignId}
                participant={participant}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="campaign-page__section campaign-page__danger">
        <button type="button" onClick={() => handleDelete(campaign.name)}>
          {t('pages.campaign.delete.button')}
        </button>
        {deleteMutation.isError && <p role="alert">{translateApiError(t, deleteMutation.error)}</p>}
      </section>
    </section>
  )
}

export default function CampaignPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  if (!campaignId) {
    return <CreateCampaignForm />
  }
  return <CampaignEditor campaignId={campaignId} />
}
