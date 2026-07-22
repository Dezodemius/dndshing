import { useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getCharacter, patchCharacter, type CharacterDetail, type CharacterPatch } from '../../api/characters'
import { translateApiError } from '../../api/errorMessages'
import './CharacterSheetPage.css'

const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

const SKILL_ORDER = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const

const sheetSchema = z.object({
  hp_current: z.coerce.number().int().min(0),
  hp_temp: z.coerce.number().int().min(0),
  notes: z.string().max(2000),
})

type SheetFormValues = z.infer<typeof sheetSchema>

function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

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
  const proficientSaves = new Set(character.proficiencies.saves ?? [])
  const proficientSkills = new Set(character.proficiencies.skills ?? [])

  return (
    <section className="character-sheet">
      <header className="character-sheet__header">
        <h1>{character.name}</h1>
        <p>{t('pages.characterSheet.levelLabel', { level: character.level })}</p>
      </header>

      {computed.level_up_available && (
        <div className="character-sheet__level-up-banner">
          <span>{t('pages.characterSheet.levelUpBanner.text')}</span>
          <Link to={`/app/characters/${characterId}/level-up`}>
            {t('pages.characterSheet.levelUpBanner.cta')}
          </Link>
        </div>
      )}

      <section className="character-sheet__section" aria-labelledby="sheet-abilities-heading">
        <h2 id="sheet-abilities-heading">{t('pages.characterSheet.sections.abilities')}</h2>
        <div className="character-sheet__ability-grid">
          {ABILITY_ORDER.map((ability) => (
            <div className="character-sheet__ability" key={ability}>
              <span className="character-sheet__ability-label">
                {t(`pages.characterSheet.abilities.${ability}`)}
              </span>
              <span className="character-sheet__ability-score">
                {character.ability_scores[ability]}
              </span>
              <span className="character-sheet__ability-modifier">
                {formatModifier(computed.modifiers[ability])}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="character-sheet__section" aria-labelledby="sheet-saves-heading">
        <h2 id="sheet-saves-heading">{t('pages.characterSheet.sections.savingThrows')}</h2>
        <ul className="character-sheet__list">
          {ABILITY_ORDER.map((ability) => (
            <li className="character-sheet__list-item" key={ability}>
              <span
                className={`character-sheet__proficiency-dot${
                  proficientSaves.has(ability) ? ' character-sheet__proficiency-dot--filled' : ''
                }`}
                aria-hidden="true"
              />
              <span className="character-sheet__list-label">
                {t(`pages.characterSheet.abilities.${ability}`)}
              </span>
              <span className="character-sheet__list-modifier">
                {formatModifier(computed.saving_throws[ability])}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="character-sheet__section" aria-labelledby="sheet-skills-heading">
        <h2 id="sheet-skills-heading">{t('pages.characterSheet.sections.skills')}</h2>
        <ul className="character-sheet__list">
          {SKILL_ORDER.map((skill) => (
            <li className="character-sheet__list-item" key={skill}>
              <span
                className={`character-sheet__proficiency-dot${
                  proficientSkills.has(skill) ? ' character-sheet__proficiency-dot--filled' : ''
                }`}
                aria-hidden="true"
              />
              <span className="character-sheet__list-label">
                {t(`pages.characterSheet.skills.${skill}`)}
              </span>
              <span className="character-sheet__list-modifier">
                {formatModifier(computed.skills[skill])}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="character-sheet__section" aria-labelledby="sheet-combat-heading">
        <h2 id="sheet-combat-heading">{t('pages.characterSheet.sections.combat')}</h2>
        <div className="character-sheet__combat-row">
          <div className="character-sheet__combat-stat">
            <span>{t('pages.characterSheet.combat.ac')}</span>
            <span className="character-sheet__combat-value">{computed.ac}</span>
          </div>
          <div className="character-sheet__combat-stat">
            <span>{t('pages.characterSheet.combat.initiative')}</span>
            <span className="character-sheet__combat-value">
              {formatModifier(computed.initiative)}
            </span>
          </div>
          <div className="character-sheet__combat-stat">
            <span>{t('pages.characterSheet.combat.speed')}</span>
            <span className="character-sheet__combat-value">{character.speed}</span>
          </div>
        </div>
      </section>

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
            <textarea id="sheet-notes" {...register('notes')} />
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
    </section>
  )
}
