import { useTranslation } from 'react-i18next'
import { translateApiError } from '../../../api/errorMessages'
import type { LevelUpSelection } from './types'

interface ConfirmStepProps {
  selection: LevelUpSelection
  subclassName: string | null
  spellNames: string[]
  isSubmitting: boolean
  error: unknown
  onSubmit: () => void
}

export default function ConfirmStep({
  selection,
  subclassName,
  spellNames,
  isSubmitting,
  error,
  onSubmit,
}: ConfirmStepProps) {
  const { t } = useTranslation()

  const asiEntries = Object.entries(selection.ability.asi).filter(([, value]) => (value ?? 0) > 0)
  const asiSummary = asiEntries
    .map(([ability, value]) => t('pages.characterSheet.abilities.' + ability) + ` +${value}`)
    .join(', ')

  return (
    <section aria-labelledby="level-up-confirm-heading">
      <h2 id="level-up-confirm-heading">{t('pages.levelUp.confirm.heading')}</h2>
      <ul>
        <li>
          {selection.hp.method === 'average'
            ? t('pages.levelUp.confirm.hpMethodAverage')
            : t('pages.levelUp.confirm.hpMethodRolled', { value: selection.hp.rolled })}
        </li>
        <li>
          {selection.ability.type === 'asi' && asiEntries.length > 0
            ? t('pages.levelUp.confirm.asiSummary', { summary: asiSummary })
            : selection.ability.type === 'feat' && selection.ability.feat.trim()
              ? t('pages.levelUp.confirm.featSummary', { feat: selection.ability.feat.trim() })
              : t('pages.levelUp.confirm.abilityNone')}
        </li>
        <li>
          {subclassName
            ? t('pages.levelUp.confirm.subclassSummary', { name: subclassName })
            : t('pages.levelUp.confirm.subclassNone')}
        </li>
        <li>
          {spellNames.length > 0
            ? t('pages.levelUp.confirm.spellsSummary', { names: spellNames.join(', ') })
            : t('pages.levelUp.confirm.spellsNone')}
        </li>
      </ul>

      <button type="button" onClick={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? t('pages.levelUp.confirm.submitting') : t('pages.levelUp.confirm.submit')}
      </button>

      {error ? <p role="alert">{translateApiError(t, error)}</p> : null}
    </section>
  )
}
