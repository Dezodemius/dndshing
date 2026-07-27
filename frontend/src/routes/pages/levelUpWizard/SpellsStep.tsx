import { useTranslation } from 'react-i18next'
import type { Spell } from '../../../api/content'
import { translateApiError } from '../../../api/errorMessages'

interface SpellsStepProps {
  spells: Spell[] | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  knownSpellIds: Set<number>
  selectedIds: number[]
  onChange: (spellIds: number[]) => void
}

export default function SpellsStep({
  spells,
  isLoading,
  isError,
  error,
  knownSpellIds,
  selectedIds,
  onChange,
}: SpellsStepProps) {
  const { t } = useTranslation()
  const availableSpells = (spells ?? []).filter((spell) => !knownSpellIds.has(spell.id))
  const selected = new Set(selectedIds)

  function toggleSpell(spellId: number) {
    onChange(
      selected.has(spellId)
        ? selectedIds.filter((id) => id !== spellId)
        : [...selectedIds, spellId],
    )
  }

  return (
    <section aria-labelledby="level-up-spells-heading">
      <h2 id="level-up-spells-heading">{t('pages.levelUp.spells.heading')}</h2>
      <p>{t('pages.levelUp.spells.hint')}</p>

      {isLoading && <p>{t('common.loading')}</p>}
      {isError && <p role="alert">{translateApiError(t, error)}</p>}

      {!isLoading && !isError && availableSpells.length === 0 && (
        <p>{t('pages.levelUp.spells.empty')}</p>
      )}

      {availableSpells.length > 0 && (
        <ul>
          {availableSpells.map((spell) => (
            <li key={spell.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(spell.id)}
                  onChange={() => toggleSpell(spell.id)}
                />
                {spell.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
