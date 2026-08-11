import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getCharacter, patchCharacter, type CharacterDetail, type CharacterPatch } from '../../api/characters'
import { translateApiError } from '../../api/errorMessages'
import CharacterSpellsTab from './CharacterSpellsTab'
import CharacterInventoryTab from './CharacterInventoryTab'
import CharacterWalletTab from './CharacterWalletTab'
import CharacterHistoryTab from './CharacterHistoryTab'
import CharacterStatsSections from './CharacterStatsSections'
import './CharacterSheetPage.css'

const TAB_ORDER = ['sheet', 'spells', 'inventory', 'wallet', 'history'] as const
type SheetTab = (typeof TAB_ORDER)[number]

const sheetSchema = z.object({
  hp_current: z.coerce.number().int().min(0),
  hp_temp: z.coerce.number().int().min(0),
  notes: z.string().max(2000),
})

type SheetFormValues = z.infer<typeof sheetSchema>

function toFormValues(character: CharacterDetail): SheetFormValues {
  return {
    hp_current: character.hp_current,
    hp_temp: character.hp_temp,
    notes: character.notes ?? '',
  }
}

export default function CharacterSheetPage() {
  const { t } = useTranslation()
  const { characterId } = useParams<{ characterId: string }>()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<SheetTab>('sheet')

  const query = useQuery({
    queryKey: ['character', characterId],
    queryFn: () => getCharacter(characterId as string),
    enabled: Boolean(characterId),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<SheetFormValues>({
    resolver: zodResolver(sheetSchema),
    values: query.data ? toFormValues(query.data) : undefined,
    // A background refetch (e.g. refetchOnWindowFocus) must not silently
    // wipe fields the player is mid-edit on — only resync untouched ones.
    resetOptions: { keepDirtyValues: true },
  })

  const patchMutation = useMutation({
    mutationFn: (payload: CharacterPatch) => patchCharacter(characterId as string, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['character', characterId], updated)
      reset(toFormValues(updated))
    },
  })

  const submittedOnce = useRef(false)
  const tabRefs = useRef<Record<SheetTab, HTMLButtonElement | null>>({
    sheet: null,
    spells: null,
    inventory: null,
    wallet: null,
    history: null,
  })

  async function onSubmit(values: SheetFormValues) {
    const payload: CharacterPatch = {}
    if (dirtyFields.hp_current) payload.hp_current = values.hp_current
    if (dirtyFields.hp_temp) payload.hp_temp = values.hp_temp
    if (dirtyFields.notes) payload.notes = values.notes
    if (Object.keys(payload).length === 0) return
    submittedOnce.current = true
    await patchMutation.mutateAsync(payload)
  }

  useEffect(() => {
    submittedOnce.current = false
  }, [characterId])

  if (query.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (query.isError) {
    return <p role="alert">{translateApiError(t, query.error)}</p>
  }

  if (!query.data) {
    return null
  }

  const character = query.data
  const { computed } = character

  return (
    <section className="character-sheet">
      <header className="character-sheet__header">
        <h1>{character.name}</h1>
        <p>{t('pages.characterSheet.levelLabel', { level: character.level })}</p>
      </header>

      <div
        className="character-sheet__tabs"
        role="tablist"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const currentIndex = TAB_ORDER.indexOf(activeTab)
          const delta = event.key === 'ArrowRight' ? 1 : -1
          const next = TAB_ORDER[(currentIndex + delta + TAB_ORDER.length) % TAB_ORDER.length]
          setActiveTab(next)
          tabRefs.current[next]?.focus()
        }}
      >
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`character-sheet-tab-${tab}`}
            ref={(el) => {
              tabRefs.current[tab] = el
            }}
            aria-controls={`character-sheet-panel-${tab}`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            className={`character-sheet__tab${activeTab === tab ? ' character-sheet__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`pages.characterSheet.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'spells' && (
        <div role="tabpanel" id="character-sheet-panel-spells" aria-labelledby="character-sheet-tab-spells">
          <CharacterSpellsTab character={character} characterId={characterId as string} />
        </div>
      )}

      {activeTab === 'sheet' && (
        <div role="tabpanel" id="character-sheet-panel-sheet" aria-labelledby="character-sheet-tab-sheet">
          {computed.level_up_available && (
            <div className="character-sheet__level-up-banner">
              <span>{t('pages.characterSheet.levelUpBanner.text')}</span>
              <Link to={`/app/characters/${characterId}/level-up`}>
                {t('pages.characterSheet.levelUpBanner.cta')}
              </Link>
            </div>
          )}

          <CharacterStatsSections character={character} />

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <section className="character-sheet__section" aria-labelledby="sheet-hp-heading">
              <h2 id="sheet-hp-heading">{t('pages.characterSheet.sections.hp')}</h2>
              <div className="character-sheet__hp-row">
                <div className="character-sheet__field">
                  <label htmlFor="sheet-hp-current">{t('pages.characterSheet.hp.current')}</label>
                  <input id="sheet-hp-current" type="number" min={0} {...register('hp_current')} />
                  {errors.hp_current && <p role="alert">{t('pages.characterSheet.hp.invalid')}</p>}
                </div>
                <div className="character-sheet__field">
                  <label htmlFor="sheet-hp-temp">{t('pages.characterSheet.hp.temp')}</label>
                  <input id="sheet-hp-temp" type="number" min={0} {...register('hp_temp')} />
                  {errors.hp_temp && <p role="alert">{t('pages.characterSheet.hp.invalid')}</p>}
                </div>
                <div className="character-sheet__field">
                  <span>{t('pages.characterSheet.hp.max')}</span>
                  <output>{character.hp_max}</output>
                </div>
              </div>
            </section>

            <section className="character-sheet__section" aria-labelledby="sheet-notes-heading">
              <h2 id="sheet-notes-heading">{t('pages.characterSheet.sections.notes')}</h2>
              <div className="character-sheet__field">
                <label htmlFor="sheet-notes">{t('pages.characterSheet.notesLabel')}</label>
                <textarea id="sheet-notes" maxLength={2000} {...register('notes')} />
                {errors.notes && <p role="alert">{t('pages.characterSheet.notesInvalid')}</p>}
              </div>
            </section>

            <div className="character-sheet__save-row">
              <button type="submit" disabled={isSubmitting}>
                {t('pages.characterSheet.save')}
              </button>
              {patchMutation.isError && (
                <p role="alert">{translateApiError(t, patchMutation.error)}</p>
              )}
              {patchMutation.isSuccess && submittedOnce.current && (
                <p>{t('pages.characterSheet.saved')}</p>
              )}
            </div>
          </form>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div role="tabpanel" id="character-sheet-panel-inventory" aria-labelledby="character-sheet-tab-inventory">
          <CharacterInventoryTab characterId={characterId as string} character={character} />
        </div>
      )}

      {activeTab === 'wallet' && (
        <div role="tabpanel" id="character-sheet-panel-wallet" aria-labelledby="character-sheet-tab-wallet">
          <CharacterWalletTab characterId={characterId as string} character={character} />
        </div>
      )}

      {activeTab === 'history' && (
        <div role="tabpanel" id="character-sheet-panel-history" aria-labelledby="character-sheet-tab-history">
          <CharacterHistoryTab characterId={characterId as string} character={character} />
        </div>
      )}
    </section>
  )
}
