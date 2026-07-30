import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getCampaignCharacter } from '../../api/campaigns'
import { translateApiError } from '../../api/errorMessages'
import { listClasses, listItems, listSpells } from '../../api/content'
import type { CharacterDetail, InventoryEntry } from '../../api/characters'
import CharacterStatsSections from './CharacterStatsSections'
import './CharacterSheetPage.css'

function ReadOnlyInventorySection({ character }: { character: CharacterDetail }) {
  const { t } = useTranslation()

  const itemsQuery = useQuery({
    queryKey: ['content', 'items'],
    queryFn: () => listItems(),
    staleTime: 5 * 60 * 1000,
    enabled: character.inventory.some((entry) => entry.item_id !== null),
  })

  const itemsById = useMemo(() => {
    const map = new Map<number, string>()
    for (const item of itemsQuery.data ?? []) map.set(item.id, item.name)
    return map
  }, [itemsQuery.data])

  function entryName(entry: InventoryEntry): string {
    if (entry.item_id !== null) return itemsById.get(entry.item_id) ?? entry.item_id.toString()
    return entry.custom_name ?? ''
  }

  return (
    <section className="character-sheet__section" aria-labelledby="sheet-inventory-heading">
      <h2 id="sheet-inventory-heading">{t('pages.characterSheet.tabs.inventory')}</h2>
      {character.inventory.length === 0 ? (
        <p>{t('pages.characterSheet.inventory.empty')}</p>
      ) : (
        <ul className="character-sheet__list">
          {character.inventory.map((entry) => (
            <li className="character-sheet__list-item" key={entry.id}>
              <span className="character-sheet__list-label">
                {entryName(entry)} × {entry.quantity}
              </span>
              {entry.equipped && <span>{t('pages.characterSheet.inventory.equipped')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ReadOnlySpellsSection({ character }: { character: CharacterDetail }) {
  const { t } = useTranslation()

  const classesQuery = useQuery({
    queryKey: ['content', 'classes'],
    queryFn: listClasses,
  })
  const currentClass = classesQuery.data?.find((klass) => klass.id === character.class_id)

  const spellsQuery = useQuery({
    queryKey: ['content', 'spells', currentClass?.slug],
    queryFn: () => listSpells({ classSlug: currentClass?.slug }),
    enabled: Boolean(currentClass),
  })
  const spellById = useMemo(
    () => new Map((spellsQuery.data ?? []).map((spell) => [spell.id, spell.name])),
    [spellsQuery.data],
  )

  return (
    <section className="character-sheet__section" aria-labelledby="sheet-spells-heading">
      <h2 id="sheet-spells-heading">{t('pages.characterSheet.tabs.spells')}</h2>
      {character.spells.length === 0 ? (
        <p>{t('pages.characterSheet.spells.known.empty')}</p>
      ) : (
        <ul className="character-sheet__list">
          {character.spells.map((selection) => (
            <li className="character-sheet__list-item" key={selection.spell_id}>
              <span className="character-sheet__list-label">
                {spellById.get(selection.spell_id) ??
                  t('pages.characterSheet.spells.card.unknownSpell', { id: selection.spell_id })}
              </span>
              {selection.prepared && <span>{t('pages.characterSheet.spells.known.prepared')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

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

      <ReadOnlyInventorySection character={character} />
      <ReadOnlySpellsSection character={character} />

      {character.notes && (
        <section className="character-sheet__section" aria-labelledby="sheet-notes-heading">
          <h2 id="sheet-notes-heading">{t('pages.characterSheet.sections.notes')}</h2>
          <p>{character.notes}</p>
        </section>
      )}
    </section>
  )
}
