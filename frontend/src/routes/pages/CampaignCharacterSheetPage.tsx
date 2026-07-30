import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getCampaignCharacter } from '../../api/campaigns'
import { translateApiError } from '../../api/errorMessages'
import CharacterStatsSections from './CharacterStatsSections'
import './CharacterSheetPage.css'

export default function CampaignCharacterSheetPage() {
  const { t } = useTranslation()
  const { campaignId, characterId } = useParams<{ campaignId: string; characterId: string }>()

  const query = useQuery({
    queryKey: ['campaign-character', campaignId, characterId],
    queryFn: () => getCampaignCharacter(campaignId as string, Number(characterId)),
    enabled: Boolean(campaignId) && Boolean(characterId),
  })

  if (query.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (query.isError) {
    return <p role="alert">{translateApiError(t, query.error)}</p>
  }

  if (!query.data) {
    return null
  }

  const character = query.data

  return (
    <section className="character-sheet">
      <header className="character-sheet__header">
        <h1>{character.name}</h1>
        <p>{t('pages.characterSheet.levelLabel', { level: character.level })}</p>
        <Link to={`/app/campaigns/${campaignId}`}>
          {t('pages.campaignCharacterSheet.back')}
        </Link>
      </header>

      <CharacterStatsSections character={character} />

      <section className="character-sheet__section" aria-labelledby="sheet-hp-heading">
        <h2 id="sheet-hp-heading">{t('pages.characterSheet.sections.hp')}</h2>
        <div className="character-sheet__hp-row">
          <div className="character-sheet__field">
            <span>{t('pages.characterSheet.hp.current')}</span>
            <output>{character.hp_current}</output>
          </div>
          <div className="character-sheet__field">
            <span>{t('pages.characterSheet.hp.temp')}</span>
            <output>{character.hp_temp}</output>
          </div>
          <div className="character-sheet__field">
            <span>{t('pages.characterSheet.hp.max')}</span>
            <output>{character.hp_max}</output>
          </div>
        </div>
      </section>

      {character.notes && (
        <section className="character-sheet__section" aria-labelledby="sheet-notes-heading">
          <h2 id="sheet-notes-heading">{t('pages.characterSheet.sections.notes')}</h2>
          <p>{character.notes}</p>
        </section>
      )}
    </section>
  )
}
