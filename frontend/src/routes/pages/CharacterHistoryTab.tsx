import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getLevelHistory,
  postLevelRollback,
  type CharacterDetail,
  type LevelUpRecord,
} from '../../api/characters'
import { listClasses, listSpells, type ClassSummary } from '../../api/content'
import { translateApiError } from '../../api/errorMessages'

function describeRecordDetails(
  record: LevelUpRecord,
  klass: ClassSummary | undefined,
  spellNameBySlug: Map<string, string>,
  t: TFunction,
): string[] {
  const lines = [t('pages.levelUp.result.hp', { value: record.delta.hp_gained })]

  const asiEntries = Object.entries(record.delta.asi ?? {})
  if (asiEntries.length > 0) {
    const summary = asiEntries
      .map(([ability, value]) => `${t(`pages.characterSheet.abilities.${ability}`)} +${value}`)
      .join(', ')
    lines.push(t('pages.levelUp.confirm.asiSummary', { summary }))
  } else if (record.delta.feat) {
    lines.push(t('pages.levelUp.confirm.featSummary', { feat: record.delta.feat }))
  }

  const featureNames = (
    klass?.levels.find((level) => level.level === record.to_level)?.features.items ?? []
  ).map((feature) => feature.name)
  if (featureNames.length > 0) {
    lines.push(t('pages.levelUp.result.features', { names: featureNames.join(', ') }))
  }

  if (record.delta.subclass_chosen) {
    const subclassName =
      klass?.subclasses.find((sub) => sub.slug === record.delta.subclass_chosen)?.name ??
      record.delta.subclass_chosen
    lines.push(t('pages.levelUp.result.subclass', { name: subclassName }))
  }

  if (record.delta.spells_learned.length > 0) {
    const names = record.delta.spells_learned
      .map((slug) => spellNameBySlug.get(slug) ?? slug)
      .join(', ')
    lines.push(t('pages.levelUp.result.spells', { names }))
  }

  return lines
}

interface CharacterHistoryTabProps {
  characterId: string
  character: CharacterDetail
}

export default function CharacterHistoryTab({ characterId, character }: CharacterHistoryTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const historyQuery = useQuery({
    queryKey: ['character', characterId, 'level-history'],
    queryFn: () => getLevelHistory(characterId),
  })

  const classesQuery = useQuery({ queryKey: ['content', 'classes'], queryFn: listClasses })
  const klass = classesQuery.data?.find((item) => item.id === character.class_id)

  const spellsQuery = useQuery({
    queryKey: ['content', 'spells', klass?.slug],
    queryFn: () => listSpells({ classSlug: klass?.slug }),
    enabled: Boolean(klass),
  })
  const spellNameBySlug = new Map(
    (spellsQuery.data ?? []).map((spell) => [spell.slug, spell.name]),
  )

  const rollbackMutation = useMutation({
    mutationFn: () => postLevelRollback(characterId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['character', characterId], updated)
      queryClient.invalidateQueries({ queryKey: ['character', characterId, 'level-history'] })
    },
  })

  if (historyQuery.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (historyQuery.isError) {
    return <p role="alert">{translateApiError(t, historyQuery.error)}</p>
  }

  const records = [...(historyQuery.data ?? [])].sort((a, b) => b.id - a.id)
  const topRecord = records[0]

  function handleRollback() {
    if (!topRecord) return
    const summary = describeRecordDetails(topRecord, klass, spellNameBySlug, t).join('; ')
    if (!window.confirm(t('pages.characterSheet.history.rollbackConfirm', { summary }))) return
    rollbackMutation.mutate()
  }

  return (
    <section className="character-sheet__section" aria-labelledby="history-heading">
      <h2 id="history-heading">{t('pages.characterSheet.tabs.history')}</h2>
      {records.length === 0 ? (
        <p>{t('pages.characterSheet.history.empty')}</p>
      ) : (
        <ul className="character-sheet__list">
          {records.map((record) => (
            <li
              className="character-sheet__list-item character-sheet__history-entry"
              key={record.id}
            >
              <h3>
                {t('pages.characterSheet.history.levelHeading', {
                  from: record.from_level,
                  to: record.to_level,
                })}
              </h3>
              <ul className="character-sheet__history-details">
                {describeRecordDetails(record, klass, spellNameBySlug, t).map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
              {record.id === topRecord?.id && (
                <button
                  type="button"
                  onClick={handleRollback}
                  disabled={rollbackMutation.isPending}
                >
                  {t('pages.characterSheet.history.rollback')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {rollbackMutation.isError && (
        <p role="alert">{translateApiError(t, rollbackMutation.error)}</p>
      )}
    </section>
  )
}
