import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { listBackgrounds, type BackgroundSummary } from '../../../api/content'
import ContentCardGrid from './ContentCardGrid'

interface BackgroundStepProps {
  selected: BackgroundSummary | null
  onSelect: (background: BackgroundSummary) => void
}

function BackgroundDescription({ background }: { background: BackgroundSummary }) {
  const { t } = useTranslation()

  return (
    <>
      {background.data.skill_proficiencies && background.data.skill_proficiencies.length > 0 && (
        <span className="content-card__stats">
          {t('pages.characterNew.background.skills', {
            skills: background.data.skill_proficiencies.join(', '),
          })}
        </span>
      )}
      {background.data.feature && (
        <ul className="content-card__traits">
          <li>
            <strong>{background.data.feature.name}.</strong> {background.data.feature.description}
          </li>
        </ul>
      )}
    </>
  )
}

export default function BackgroundStep({ selected, onSelect }: BackgroundStepProps) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ['content', 'backgrounds'], queryFn: listBackgrounds })

  return (
    <section aria-labelledby="wizard-background-heading">
      <h2 id="wizard-background-heading">{t('pages.characterNew.background.heading')}</h2>
      <p className="character-wizard__hint">{t('pages.characterNew.background.optional')}</p>
      <ContentCardGrid
        name="background"
        ariaLabel={t('pages.characterNew.background.heading')}
        items={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        emptyMessage={t('pages.characterNew.background.empty')}
        selectedId={selected?.id ?? null}
        onSelect={onSelect}
        getId={(background) => background.id}
        getName={(background) => background.name}
        renderDescription={(background) => <BackgroundDescription background={background} />}
      />
    </section>
  )
}
