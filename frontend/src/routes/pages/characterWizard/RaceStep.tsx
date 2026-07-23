import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { listRaces, type RaceSummary } from '../../../api/content'
import ContentCardGrid from './ContentCardGrid'

interface RaceStepProps {
  selected: RaceSummary | null
  onSelect: (race: RaceSummary) => void
}

function RaceDescription({ race }: { race: RaceSummary }) {
  const { t } = useTranslation()
  const abilityBonuses = Object.entries(race.data.ability_bonuses ?? {}) as [
    keyof NonNullable<RaceSummary['data']['ability_bonuses']>,
    number,
  ][]

  return (
    <>
      {(race.data.speed !== undefined || race.data.darkvision !== undefined) && (
        <span className="content-card__stats">
          {race.data.speed !== undefined && (
            <span>{t('pages.characterNew.race.speed', { value: race.data.speed })}</span>
          )}
          {race.data.darkvision !== undefined && (
            <span>{t('pages.characterNew.race.darkvision', { value: race.data.darkvision })}</span>
          )}
        </span>
      )}
      {abilityBonuses.length > 0 && (
        <span className="content-card__stats">
          {abilityBonuses.map(([ability, value]) => (
            <span key={ability}>
              {t('pages.characterNew.abilityBonus', { ability: t(`abilities.${ability}`), value })}
            </span>
          ))}
        </span>
      )}
      {race.data.traits && race.data.traits.length > 0 && (
        <ul className="content-card__traits">
          {race.data.traits.map((trait) => (
            <li key={trait.name}>
              <strong>{trait.name}.</strong> {trait.description}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function RaceStep({ selected, onSelect }: RaceStepProps) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ['content', 'races'], queryFn: listRaces })

  return (
    <section aria-labelledby="wizard-race-heading">
      <h2 id="wizard-race-heading">{t('pages.characterNew.race.heading')}</h2>
      <ContentCardGrid
        name="race"
        ariaLabel={t('pages.characterNew.race.heading')}
        items={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        emptyMessage={t('pages.characterNew.race.empty')}
        selectedId={selected?.id ?? null}
        onSelect={onSelect}
        getId={(race) => race.id}
        getName={(race) => race.name}
        renderDescription={(race) => <RaceDescription race={race} />}
      />
    </section>
  )
}
