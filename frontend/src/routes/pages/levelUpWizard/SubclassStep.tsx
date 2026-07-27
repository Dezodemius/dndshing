import { useTranslation } from 'react-i18next'
import type { SubclassSummary } from '../../../api/content'

interface SubclassStepProps {
  subclasses: SubclassSummary[]
  selectedId: number | null
  onSelect: (subclassId: number) => void
}

export default function SubclassStep({ subclasses, selectedId, onSelect }: SubclassStepProps) {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="level-up-subclass-heading">
      <h2 id="level-up-subclass-heading">{t('pages.levelUp.subclass.heading')}</h2>
      {subclasses.length === 0 ? (
        <p>{t('pages.levelUp.subclass.empty')}</p>
      ) : (
        <div role="radiogroup" aria-label={t('pages.levelUp.subclass.heading')}>
          {subclasses.map((subclass) => (
            <label key={subclass.id}>
              <input
                type="radio"
                name="subclass"
                checked={selectedId === subclass.id}
                onChange={() => onSelect(subclass.id)}
              />
              {subclass.name}
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
