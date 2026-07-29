import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AbilityScores } from '../../../api/characters'
import {
  ABILITY_KEYS,
  ABILITY_METHODS,
  MANUAL_DEFAULT_SCORES,
  MANUAL_MAX,
  MANUAL_MIN,
  POINT_BUY_BUDGET,
  POINT_BUY_DEFAULT_SCORES,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
  pointBuyCost,
  pointBuyTotalCost,
  rollAbilityPool,
  type AbilityKey,
  type AbilityMethod,
} from './abilityRules'

interface AbilityScoreStepProps {
  method: AbilityMethod
  scores: AbilityScores | null
  onChange: (method: AbilityMethod, scores: AbilityScores | null) => void
}

// Pool-assignment slots track a *pool index*, not the score value itself —
// standard array values are unique so it does not matter, but rolled totals
// can repeat (two different 4d6 rolls can sum to the same number) and each
// slot must still be assignable independently.
type PoolAssignment = Partial<Record<AbilityKey, number>>

function scoresFromPool(pool: readonly number[], assignment: PoolAssignment): AbilityScores | null {
  const result = {} as AbilityScores
  for (const key of ABILITY_KEYS) {
    const index = assignment[key]
    if (index === undefined) return null
    result[key] = pool[index]
  }
  return result
}

function PointBuyFields({
  scores,
  onChange,
}: {
  scores: AbilityScores
  onChange: (scores: AbilityScores) => void
}) {
  const { t } = useTranslation()
  const spent = pointBuyTotalCost(scores)
  const remaining = POINT_BUY_BUDGET - spent

  function adjust(key: AbilityKey, delta: number) {
    const nextValue = scores[key] + delta
    if (nextValue < POINT_BUY_MIN || nextValue > POINT_BUY_MAX) return
    const nextCost = pointBuyCost(nextValue) - pointBuyCost(scores[key])
    if (spent + nextCost > POINT_BUY_BUDGET) return
    onChange({ ...scores, [key]: nextValue })
  }

  return (
    <div className="character-wizard__ability-fields">
      <p className="character-wizard__hint">
        {t('pages.characterNew.abilities.pointBuy.budget', {
          value: remaining,
          max: POINT_BUY_BUDGET,
        })}
      </p>
      {ABILITY_KEYS.map((key) => (
        <div key={key} className="character-wizard__ability-row">
          <span className="character-wizard__ability-name">{t(`abilities.${key}`)}</span>
          <button
            type="button"
            onClick={() => adjust(key, -1)}
            disabled={scores[key] <= POINT_BUY_MIN}
            aria-label={t('pages.characterNew.abilities.pointBuy.decrease', {
              ability: t(`abilities.${key}`),
            })}
          >
            −
          </button>
          <span className="character-wizard__ability-value">{scores[key]}</span>
          <button
            type="button"
            onClick={() => adjust(key, 1)}
            disabled={
              scores[key] >= POINT_BUY_MAX ||
              spent + (pointBuyCost(scores[key] + 1) - pointBuyCost(scores[key])) > POINT_BUY_BUDGET
            }
            aria-label={t('pages.characterNew.abilities.pointBuy.increase', {
              ability: t(`abilities.${key}`),
            })}
          >
            +
          </button>
        </div>
      ))}
    </div>
  )
}

function PoolAssignFields({
  pool,
  assignment,
  onChange,
  reroll,
}: {
  pool: readonly number[]
  assignment: PoolAssignment
  onChange: (assignment: PoolAssignment) => void
  reroll?: () => void
}) {
  const { t } = useTranslation()
  const usedIndices = new Set(Object.values(assignment))

  return (
    <div className="character-wizard__ability-fields">
      {reroll && (
        <button type="button" onClick={reroll}>
          {t('pages.characterNew.abilities.assign.reroll')}
        </button>
      )}
      {ABILITY_KEYS.map((key) => {
        const currentIndex = assignment[key]
        const options = pool
          .map((value, index) => ({ value, index }))
          .filter(({ index }) => index === currentIndex || !usedIndices.has(index))
        return (
          <div key={key} className="character-wizard__ability-row">
            <label htmlFor={`wizard-ability-${key}`} className="character-wizard__ability-name">
              {t(`abilities.${key}`)}
            </label>
            <select
              id={`wizard-ability-${key}`}
              value={currentIndex ?? ''}
              onChange={(event) => {
                const nextAssignment = { ...assignment }
                if (event.target.value === '') {
                  delete nextAssignment[key]
                } else {
                  nextAssignment[key] = Number(event.target.value)
                }
                onChange(nextAssignment)
              }}
            >
              <option value="">{t('pages.characterNew.abilities.assign.placeholder')}</option>
              {options.map(({ value, index }) => (
                <option key={index} value={index}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}

function ManualFields({
  scores,
  onChange,
}: {
  scores: AbilityScores
  onChange: (scores: AbilityScores) => void
}) {
  const { t } = useTranslation()
  // Local text mirrors the raw input so the field can be freely cleared/typed
  // into; clamping to [1, 30] only snaps the displayed value back on blur.
  const [text, setText] = useState<Record<AbilityKey, string>>(
    () => Object.fromEntries(ABILITY_KEYS.map((key) => [key, String(scores[key])])) as Record<AbilityKey, string>,
  )

  function handleChange(key: AbilityKey, raw: string) {
    setText((current) => ({ ...current, [key]: raw }))
    const parsed = Number(raw)
    if (raw.trim() === '' || Number.isNaN(parsed)) return
    const clamped = Math.min(MANUAL_MAX, Math.max(MANUAL_MIN, Math.trunc(parsed)))
    onChange({ ...scores, [key]: clamped })
  }

  function handleBlur(key: AbilityKey) {
    setText((current) => ({ ...current, [key]: String(scores[key]) }))
  }

  return (
    <div className="character-wizard__ability-fields">
      <p className="character-wizard__hint">{t('pages.characterNew.abilities.manual.hint')}</p>
      {ABILITY_KEYS.map((key) => (
        <div key={key} className="character-wizard__ability-row">
          <label htmlFor={`wizard-ability-${key}`} className="character-wizard__ability-name">
            {t(`abilities.${key}`)}
          </label>
          <input
            id={`wizard-ability-${key}`}
            type="number"
            min={MANUAL_MIN}
            max={MANUAL_MAX}
            value={text[key]}
            onChange={(event) => handleChange(key, event.target.value)}
            onBlur={() => handleBlur(key)}
          />
        </div>
      ))}
    </div>
  )
}

// Reconstructs which pool slot each ability was assigned when the step is
// remounted with scores already set (e.g. the user went back then forward
// again) — otherwise a fully valid selection would redraw as unassigned.
function initialAssignment(pool: readonly number[], scores: AbilityScores | null): PoolAssignment {
  if (!scores) return {}
  const used = new Set<number>()
  const assignment: PoolAssignment = {}
  for (const key of ABILITY_KEYS) {
    const index = pool.findIndex((value, idx) => value === scores[key] && !used.has(idx))
    if (index === -1) return {}
    used.add(index)
    assignment[key] = index
  }
  return assignment
}

export default function AbilityScoreStep({ method, scores, onChange }: AbilityScoreStepProps) {
  const { t } = useTranslation()
  const [rolledPool, setRolledPool] = useState<number[]>(() =>
    method === 'roll' && scores ? ABILITY_KEYS.map((key) => scores[key]) : rollAbilityPool(),
  )
  const [poolAssignment, setPoolAssignment] = useState<PoolAssignment>(() => {
    if (method === 'standard-array') return initialAssignment(STANDARD_ARRAY, scores)
    if (method === 'roll') return initialAssignment(rolledPool, scores)
    return {}
  })

  function selectMethod(next: AbilityMethod) {
    if (next === method) return
    setPoolAssignment({})
    if (next === 'point-buy') {
      onChange(next, POINT_BUY_DEFAULT_SCORES)
    } else if (next === 'manual') {
      onChange(next, MANUAL_DEFAULT_SCORES)
    } else if (next === 'roll') {
      setRolledPool(rollAbilityPool())
      onChange(next, null)
    } else {
      onChange(next, null)
    }
  }

  function reroll() {
    setRolledPool(rollAbilityPool())
    setPoolAssignment({})
    onChange('roll', null)
  }

  return (
    <section aria-labelledby="wizard-abilities-heading">
      <h2 id="wizard-abilities-heading">{t('pages.characterNew.abilities.heading')}</h2>
      <div role="radiogroup" aria-label={t('pages.characterNew.abilities.heading')}>
        {ABILITY_METHODS.map((methodOption) => (
          <label key={methodOption} className="character-wizard__method-option">
            <input
              type="radio"
              name="ability-method"
              checked={method === methodOption}
              onChange={() => selectMethod(methodOption)}
            />
            {t(`pages.characterNew.abilities.methods.${toCamel(methodOption)}`)}
          </label>
        ))}
      </div>

      {method === 'point-buy' && (
        <PointBuyFields
          scores={scores ?? POINT_BUY_DEFAULT_SCORES}
          onChange={(next) => onChange(method, next)}
        />
      )}

      {method === 'standard-array' && (
        <PoolAssignFields
          pool={STANDARD_ARRAY}
          assignment={poolAssignment}
          onChange={(nextAssignment) => {
            setPoolAssignment(nextAssignment)
            onChange(method, scoresFromPool(STANDARD_ARRAY, nextAssignment))
          }}
        />
      )}

      {method === 'roll' && (
        <PoolAssignFields
          pool={rolledPool}
          assignment={poolAssignment}
          reroll={reroll}
          onChange={(nextAssignment) => {
            setPoolAssignment(nextAssignment)
            onChange(method, scoresFromPool(rolledPool, nextAssignment))
          }}
        />
      )}

      {method === 'manual' && (
        <ManualFields
          scores={scores ?? MANUAL_DEFAULT_SCORES}
          onChange={(next) => onChange(method, next)}
        />
      )}
    </section>
  )
}

function toCamel(method: AbilityMethod): string {
  return method.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}
