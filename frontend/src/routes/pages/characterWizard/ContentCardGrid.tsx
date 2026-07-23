import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { translateApiError } from '../../../api/errorMessages'

interface ContentCardGridProps<T> {
  name: string
  ariaLabel: string
  items: T[] | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  emptyMessage: string
  selectedId: number | null
  onSelect: (item: T) => void
  getId: (item: T) => number
  getName: (item: T) => string
  renderDescription?: (item: T) => ReactNode
}

export default function ContentCardGrid<T>({
  name,
  ariaLabel,
  items,
  isLoading,
  isError,
  error,
  emptyMessage,
  selectedId,
  onSelect,
  getId,
  getName,
  renderDescription,
}: ContentCardGridProps<T>) {
  const { t } = useTranslation()

  if (isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (isError) {
    return <p role="alert">{translateApiError(t, error)}</p>
  }

  if (!items || items.length === 0) {
    return <p>{emptyMessage}</p>
  }

  return (
    <div className="content-card-grid" role="radiogroup" aria-label={ariaLabel}>
      {items.map((item) => {
        const id = getId(item)
        return (
          <label
            key={id}
            className={`content-card${selectedId === id ? ' content-card--selected' : ''}`}
          >
            <input
              type="radio"
              name={name}
              className="content-card__radio"
              checked={selectedId === id}
              onChange={() => onSelect(item)}
            />
            <span className="content-card__name">{getName(item)}</span>
            {renderDescription && (
              <span className="content-card__description">{renderDescription(item)}</span>
            )}
          </label>
        )
      })}
    </div>
  )
}
