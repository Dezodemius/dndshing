import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery } from '@tanstack/react-query'
import { listClasses, type ClassSummary } from '../../../api/content'
import ContentCardGrid from './ContentCardGrid'

interface ClassStepProps {
  selected: ClassSummary | null
  onSelect: (klass: ClassSummary) => void
}

const ABILITY_ALIASES: Record<string, string> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
}

function abilityLabel(t: TFunction, value: string): string {
  const key = ABILITY_ALIASES[value.toLowerCase()] ?? value
  return t(`abilities.${key}`, { defaultValue: value })
}

function ClassDescription({ klass }: { klass: ClassSummary }) {
  const { t } = useTranslation()
  const levelOneFeatures = klass.levels.find((level) => level.level === 1)?.features.items ?? []

  return (
    <>
      <span className="content-card__stats">
        <span>{t('pages.characterNew.class.hitDie', { value: klass.hit_die })}</span>
        <span>
          {t('pages.characterNew.class.primaryAbility', {
            ability: abilityLabel(t, klass.primary_ability),
          })}
        </span>
      </span>
      {klass.data.saving_throws && klass.data.saving_throws.length > 0 && (
        <span className="content-card__stats">
          {t('pages.characterNew.class.savingThrows', {
            abilities: klass.data.saving_throws.map((ability) => abilityLabel(t, ability)).join(', '),
          })}
        </span>
      )}
      {levelOneFeatures.length > 0 && (
        <ul className="content-card__traits">
          {levelOneFeatures.map((feature) => (
            <li key={feature.name}>
              <strong>{feature.name}.</strong> {feature.description}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function ClassStep({ selected, onSelect }: ClassStepProps) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ['content', 'classes'], queryFn: listClasses })

  return (
    <section aria-labelledby="wizard-class-heading">
      <h2 id="wizard-class-heading">{t('pages.characterNew.class.heading')}</h2>
      <ContentCardGrid
        name="class"
        ariaLabel={t('pages.characterNew.class.heading')}
        items={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        emptyMessage={t('pages.characterNew.class.empty')}
        selectedId={selected?.id ?? null}
        onSelect={onSelect}
        getId={(klass) => klass.id}
        getName={(klass) => klass.name}
        renderDescription={(klass) => <ClassDescription klass={klass} />}
      />
    </section>
  )
}
