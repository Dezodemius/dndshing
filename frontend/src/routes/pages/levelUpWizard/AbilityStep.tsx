import { useTranslation } from 'react-i18next'
import type { AbilitySelection, AbilityKey } from './types'

interface AbilityStepProps {
  selection: AbilitySelection
  onChange: (selection: AbilitySelection) => void
}

const ABILITY_ORDER: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ASI_CAP = 2

export default function AbilityStep({ selection, onChange }: AbilityStepProps) {
  const { t } = useTranslation()
  const asiTotal = Object.values(selection.asi).reduce((sum, value) => sum + (value ?? 0), 0)

  function setType(type: AbilitySelection['type']) {
    onChange({ ...selection, type })
  }

  function adjustAbility(ability: AbilityKey, delta: number) {
    const current = selection.asi[ability] ?? 0
    const next = current + delta
    if (next < 0) return
    if (delta > 0 && asiTotal >= ASI_CAP) return
    onChange({ ...selection, asi: { ...selection.asi, [ability]: next } })
  }

  return (
    <section aria-labelledby="level-up-ability-heading">
      <h2 id="level-up-ability-heading">{t('pages.levelUp.ability.heading')}</h2>
      <p>{t('pages.levelUp.ability.hint')}</p>

      <div role="radiogroup" aria-label={t('pages.levelUp.ability.heading')}>
        <label>
          <input
            type="radio"
            name="ability-type"
            checked={selection.type === 'none'}
            onChange={() => setType('none')}
          />
          {t('pages.levelUp.ability.none')}
        </label>
        <label>
          <input
            type="radio"
            name="ability-type"
            checked={selection.type === 'asi'}
            onChange={() => setType('asi')}
          />
          {t('pages.levelUp.ability.asiOption')}
        </label>
        <label>
          <input
            type="radio"
            name="ability-type"
            checked={selection.type === 'feat'}
            onChange={() => setType('feat')}
          />
          {t('pages.levelUp.ability.featOption')}
        </label>
      </div>

      {selection.type === 'asi' && (
        <div>
          <p>{t('pages.levelUp.ability.asiHint')}</p>
          <ul>
            {ABILITY_ORDER.map((ability) => (
              <li key={ability}>
                <span>{t(`pages.characterSheet.abilities.${ability}`)}</span>
                <button
                  type="button"
                  onClick={() => adjustAbility(ability, -1)}
                  disabled={(selection.asi[ability] ?? 0) <= 0}
                  aria-label={`-1 ${t(`pages.characterSheet.abilities.${ability}`)}`}
                >
                  −
                </button>
                <output>{selection.asi[ability] ?? 0}</output>
                <button
                  type="button"
                  onClick={() => adjustAbility(ability, 1)}
                  disabled={asiTotal >= ASI_CAP}
                  aria-label={`+1 ${t(`pages.characterSheet.abilities.${ability}`)}`}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selection.type === 'feat' && (
        <div>
          <label htmlFor="level-up-feat">{t('pages.levelUp.ability.featLabel')}</label>
          <input
            id="level-up-feat"
            type="text"
            maxLength={200}
            placeholder={t('pages.levelUp.ability.featPlaceholder')}
            value={selection.feat}
            onChange={(event) => onChange({ ...selection, feat: event.target.value })}
          />
          {selection.feat.trim().length === 0 && (
            <p role="alert">{t('pages.levelUp.ability.featInvalid')}</p>
          )}
        </div>
      )}
    </section>
  )
}
