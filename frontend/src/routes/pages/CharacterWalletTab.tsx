import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { patchCharacter, type CharacterDetail, type CharacterPatch } from '../../api/characters'
import { translateApiError } from '../../api/errorMessages'

const walletSchema = z.object({
  gold: z.coerce.number().int().min(0),
  silver: z.coerce.number().int().min(0),
  copper: z.coerce.number().int().min(0),
})

type WalletFormValues = z.infer<typeof walletSchema>

function toFormValues(character: CharacterDetail): WalletFormValues {
  return {
    gold: character.gold,
    silver: character.silver,
    copper: character.copper,
  }
}

interface CharacterWalletTabProps {
  characterId: string
  character: CharacterDetail
}

export default function CharacterWalletTab({ characterId, character }: CharacterWalletTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<WalletFormValues>({
    resolver: zodResolver(walletSchema),
    values: toFormValues(character),
    resetOptions: { keepDirtyValues: true },
  })

  const patchMutation = useMutation({
    mutationFn: (payload: CharacterPatch) => patchCharacter(characterId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['character', characterId], updated)
      reset(toFormValues(updated))
    },
  })

  const submittedOnce = useRef(false)

  async function onSubmit(values: WalletFormValues) {
    const payload: CharacterPatch = {}
    if (dirtyFields.gold) payload.gold = values.gold
    if (dirtyFields.silver) payload.silver = values.silver
    if (dirtyFields.copper) payload.copper = values.copper
    if (Object.keys(payload).length === 0) return
    submittedOnce.current = true
    await patchMutation.mutateAsync(payload)
  }

  return (
    <form
      className="character-sheet__wallet"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label={t('pages.characterSheet.tabs.wallet')}
    >
      <div className="character-sheet__wallet-row">
        <div className="character-sheet__field">
          <label htmlFor="wallet-gold">{t('pages.characterSheet.wallet.gold')}</label>
          <input id="wallet-gold" type="number" min={0} {...register('gold')} />
          {errors.gold && <p role="alert">{t('pages.characterSheet.wallet.invalid')}</p>}
        </div>
        <div className="character-sheet__field">
          <label htmlFor="wallet-silver">{t('pages.characterSheet.wallet.silver')}</label>
          <input id="wallet-silver" type="number" min={0} {...register('silver')} />
          {errors.silver && <p role="alert">{t('pages.characterSheet.wallet.invalid')}</p>}
        </div>
        <div className="character-sheet__field">
          <label htmlFor="wallet-copper">{t('pages.characterSheet.wallet.copper')}</label>
          <input id="wallet-copper" type="number" min={0} {...register('copper')} />
          {errors.copper && <p role="alert">{t('pages.characterSheet.wallet.invalid')}</p>}
        </div>
      </div>

      <div className="character-sheet__save-row">
        <button type="submit" disabled={isSubmitting}>
          {t('pages.characterSheet.save')}
        </button>
        {patchMutation.isError && <p role="alert">{translateApiError(t, patchMutation.error)}</p>}
        {patchMutation.isSuccess && submittedOnce.current && (
          <p>{t('pages.characterSheet.saved')}</p>
        )}
      </div>
    </form>
  )
}
