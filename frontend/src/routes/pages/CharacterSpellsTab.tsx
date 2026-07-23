import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { updateSpells, type CharacterDetail, type CharacterSpell } from '../../api/characters'
import { listClasses, listSpells, type Spell } from '../../api/content'
import { translateApiError } from '../../api/errorMessages'
import './CharacterSpellsTab.css'

interface CharacterSpellsTabProps {
  character: CharacterDetail
  characterId: string
}

function formatSpellLevel(t: TFunction, level: number | undefined): string {
  if (level === undefined) return ''
  return level === 0
    ? t('pages.characterSheet.spells.card.cantrip')
    : t('pages.characterSheet.spells.card.level', { level })
}

function SpellCard({ spell, fallbackName }: { spell: Spell | undefined; fallbackName: string }) {
  const { t } = useTranslation()

  return (
    <details className="spell-card">
      <summary className="spell-card__summary">
        <span className="spell-card__name">{spell?.name ?? fallbackName}</span>
        <span className="spell-card__level">{formatSpellLevel(t, spell?.level)}</span>
      </summary>
      {spell && (
        <div className="spell-card__body">
          <dl className="spell-card__meta">
            <div>
              <dt>{t('pages.characterSheet.spells.card.school')}</dt>
              <dd>{spell.school}</dd>
            </div>
            <div>
              <dt>{t('pages.characterSheet.spells.card.castingTime')}</dt>
              <dd>{spell.casting_time}</dd>
            </div>
            <div>
              <dt>{t('pages.characterSheet.spells.card.range')}</dt>
              <dd>{spell.range}</dd>
            </div>
            <div>
              <dt>{t('pages.characterSheet.spells.card.components')}</dt>
              <dd>{spell.components}</dd>
            </div>
            <div>
              <dt>{t('pages.characterSheet.spells.card.duration')}</dt>
              <dd>{spell.duration}</dd>
            </div>
          </dl>
          <p className="spell-card__description">{spell.description}</p>
        </div>
      )}
    </details>
  )
}

export default function CharacterSpellsTab({ character, characterId }: CharacterSpellsTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [levelFilter, setLevelFilter] = useState<'all' | number>('all')

  const classesQuery = useQuery({
    queryKey: ['content', 'classes'],
    queryFn: listClasses,
  })

  const currentClass = classesQuery.data?.find((klass) => klass.id === character.class_id)
  const classNotFound = classesQuery.isSuccess && !currentClass
  const isCaster = currentClass?.levels.some((level) => level.spell_slots !== null) ?? false

  const spellsQuery = useQuery({
    queryKey: ['content', 'spells', currentClass?.slug],
    queryFn: () => listSpells({ classSlug: currentClass?.slug }),
    enabled: Boolean(currentClass) && isCaster,
  })

  const spellsMutation = useMutation({
    mutationFn: (spells: CharacterSpell[]) => updateSpells(characterId, spells),
    onSuccess: (updated) => {
      queryClient.setQueryData<CharacterDetail | undefined>(['character', characterId], (old) =>
        old ? { ...old, spells: updated } : old,
      )
    },
  })

  if (classesQuery.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (classesQuery.isError) {
    return <p role="alert">{translateApiError(t, classesQuery.error)}</p>
  }

  if (classNotFound) {
    return <p role="alert">{t('pages.characterSheet.spells.classNotFound')}</p>
  }

  if (!isCaster) {
    return (
      <section className="spells-tab__empty-state">
        <p>{t('pages.characterSheet.spells.emptyState.title')}</p>
        <p>{t('pages.characterSheet.spells.emptyState.body')}</p>
      </section>
    )
  }

  const spellById = new Map((spellsQuery.data ?? []).map((spell) => [spell.id, spell]))
  const knownIds = new Set(character.spells.map((selection) => selection.spell_id))
  const availableSpells = (spellsQuery.data ?? []).filter((spell) => !knownIds.has(spell.id))
  const filteredAvailable =
    levelFilter === 'all' ? availableSpells : availableSpells.filter((spell) => spell.level === levelFilter)
  const levelOptions = Array.from(new Set((spellsQuery.data ?? []).map((spell) => spell.level))).sort(
    (a, b) => a - b,
  )
  const slotEntries = Object.entries(character.computed.spell_slots)
    .map(([level, count]) => [Number(level), Number(count)] as const)
    .sort((a, b) => a[0] - b[0])

  function togglePrepared(spellId: number) {
    const next = character.spells.map((selection) =>
      selection.spell_id === spellId ? { ...selection, prepared: !selection.prepared } : selection,
    )
    spellsMutation.mutate(next)
  }

  function addSpell(spellId: number) {
    spellsMutation.mutate([...character.spells, { spell_id: spellId, prepared: false }])
  }

  function forgetSpell(spellId: number) {
    spellsMutation.mutate(character.spells.filter((selection) => selection.spell_id !== spellId))
  }

  return (
    <section className="spells-tab">
      <section className="spells-tab__section" aria-labelledby="spell-slots-heading">
        <h2 id="spell-slots-heading">{t('pages.characterSheet.spells.slots.title')}</h2>
        {slotEntries.length === 0 ? (
          <p>{t('pages.characterSheet.spells.slots.none')}</p>
        ) : (
          <div className="spells-tab__slot-grid">
            {slotEntries.map(([level, count]) => (
              <div className="spells-tab__slot" key={level}>
                <span className="spells-tab__slot-label">
                  {t('pages.characterSheet.spells.slots.level', { level })}
                </span>
                <span className="spells-tab__slot-count">{count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="spells-tab__section" aria-labelledby="spells-known-heading">
        <h2 id="spells-known-heading">{t('pages.characterSheet.spells.known.title')}</h2>
        {spellsQuery.isError && <p role="alert">{translateApiError(t, spellsQuery.error)}</p>}
        {character.spells.length === 0 ? (
          <p>{t('pages.characterSheet.spells.known.empty')}</p>
        ) : (
          <ul className="spells-tab__list">
            {character.spells.map((selection) => (
              <li className="spells-tab__list-item" key={selection.spell_id}>
                <SpellCard
                  spell={spellById.get(selection.spell_id)}
                  fallbackName={t('pages.characterSheet.spells.card.unknownSpell', {
                    id: selection.spell_id,
                  })}
                />
                <label className="spells-tab__prepared">
                  <input
                    type="checkbox"
                    checked={selection.prepared}
                    onChange={() => togglePrepared(selection.spell_id)}
                    disabled={spellsMutation.isPending}
                  />
                  {t('pages.characterSheet.spells.known.prepared')}
                </label>
                <button
                  type="button"
                  onClick={() => forgetSpell(selection.spell_id)}
                  disabled={spellsMutation.isPending}
                >
                  {t('pages.characterSheet.spells.known.forget')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="spells-tab__section" aria-labelledby="spells-add-heading">
        <h2 id="spells-add-heading">{t('pages.characterSheet.spells.add.title')}</h2>
        <button type="button" onClick={() => setShowAdd((value) => !value)}>
          {showAdd
            ? t('pages.characterSheet.spells.add.close')
            : t('pages.characterSheet.spells.add.toggle')}
        </button>
        {showAdd && (
          <div className="spells-tab__add-panel">
            <label className="spells-tab__level-filter">
              {t('pages.characterSheet.spells.add.levelFilter')}
              <select
                value={levelFilter}
                onChange={(event) =>
                  setLevelFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
                }
              >
                <option value="all">{t('pages.characterSheet.spells.add.levelAll')}</option>
                {levelOptions.map((level) => (
                  <option value={level} key={level}>
                    {formatSpellLevel(t, level)}
                  </option>
                ))}
              </select>
            </label>
            {spellsQuery.isLoading ? (
              <p>{t('common.loading')}</p>
            ) : filteredAvailable.length === 0 ? (
              <p>{t('pages.characterSheet.spells.add.empty')}</p>
            ) : (
              <ul className="spells-tab__list">
                {filteredAvailable.map((spell) => (
                  <li className="spells-tab__list-item" key={spell.id}>
                    <SpellCard spell={spell} fallbackName={spell.name} />
                    <button
                      type="button"
                      onClick={() => addSpell(spell.id)}
                      disabled={spellsMutation.isPending}
                    >
                      {t('pages.characterSheet.spells.add.action')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {spellsMutation.isError && <p role="alert">{translateApiError(t, spellsMutation.error)}</p>}
      </section>
    </section>
  )
}
