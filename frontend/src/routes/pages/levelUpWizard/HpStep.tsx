import { useTranslation } from 'react-i18next'
import type { HpSelection } from './types'

interface HpStepProps {
  hitDie: number
  selection: HpSelection
  onChange: (selection: HpSelection) => void
}

export default function HpStep({ hitDie, selection, onChange }: HpStepProps) {
  const { t } = useTranslation()
  const rolledInvalid =
    selection.method === 'rolled' &&
    selection.rolled !== null &&
    (selection.rolled < 1 || selection.rolled > hitDie)

  return (
    <section aria-labelledby="level-up-hp-heading">
      <h2 id="level-up-hp-heading">{t('pages.levelUp.hp.heading')}</h2>
      <div role="radiogroup" aria-label={t('pages.levelUp.hp.heading')}>
        <label>
          <input
            type="radio"
            name="hp-method"
            checked={selection.method === 'average'}
            onChange={() => onChange({ method: 'average', rolled: selection.rolled })}
          />
          {t('pages.levelUp.hp.average')}
        </label>
        <p>{t('pages.levelUp.hp.averageHint', { value: hitDie })}</p>

        <label>
          <input
            type="radio"
            name="hp-method"
            checked={selection.method === 'rolled'}
            onChange={() => onChange({ method: 'rolled', rolled: selection.rolled })}
          />
          {t('pages.levelUp.hp.rolled')}
        </label>
        {selection.method === 'rolled' && (
          <div>
            <label htmlFor="level-up-hp-rolled">
              {t('pages.levelUp.hp.rolledLabel', { max: hitDie })}
            </label>
            <input
              id="level-up-hp-rolled"
              type="number"
              min={1}
              max={hitDie}
              value={selection.rolled ?? ''}
              onChange={(event) =>
                onChange({
                  method: 'rolled',
                  rolled: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
            {rolledInvalid && <p role="alert">{t('pages.levelUp.hp.rolledInvalid', { max: hitDie })}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
