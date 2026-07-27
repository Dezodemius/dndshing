import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCharacter,
  postLevelUp,
  type LevelUpRecord,
  type LevelUpRequest,
} from '../../../api/characters'
import { listClasses, listSpells } from '../../../api/content'
import { translateApiError } from '../../../api/errorMessages'
import HpStep from './HpStep'
import AbilityStep from './AbilityStep'
import SubclassStep from './SubclassStep'
import SpellsStep from './SpellsStep'
import ConfirmStep from './ConfirmStep'
import { INITIAL_SELECTION, type LevelUpSelection, type LevelUpStep } from './types'
import './levelUpWizard.css'

function canGoNext(step: LevelUpStep, selection: LevelUpSelection, hitDie: number): boolean {
  if (step === 'hp') {
    if (selection.hp.method === 'average') return true
    return selection.hp.rolled !== null && selection.hp.rolled >= 1 && selection.hp.rolled <= hitDie
  }
  if (step === 'ability') {
    if (selection.ability.type === 'feat') return selection.ability.feat.trim().length > 0
    return true
  }
  if (step === 'subclass') return selection.subclassId !== null
  return true
}

function buildPayload(selection: LevelUpSelection): LevelUpRequest {
  const payload: LevelUpRequest = {
    hp_method: selection.hp.method,
    spells_learned: selection.spellIds,
  }
  if (selection.hp.method === 'rolled' && selection.hp.rolled !== null) {
    payload.hp_rolled = selection.hp.rolled
  }
  if (selection.ability.type === 'asi') {
    const asi = Object.fromEntries(
      Object.entries(selection.ability.asi).filter(([, value]) => (value ?? 0) > 0),
    )
    if (Object.keys(asi).length > 0) payload.asi = asi
  }
  if (selection.ability.type === 'feat' && selection.ability.feat.trim()) {
    payload.feat = selection.ability.feat.trim()
  }
  if (selection.subclassId !== null) payload.subclass_id = selection.subclassId
  return payload
}

export default function LevelUpWizardPage() {
  const { t } = useTranslation()
  const { characterId } = useParams<{ characterId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selection, setSelection] = useState<LevelUpSelection>(INITIAL_SELECTION)
  const [stepIndex, setStepIndex] = useState(0)
  const [record, setRecord] = useState<LevelUpRecord | null>(null)

  const characterQuery = useQuery({
    queryKey: ['character', characterId],
    queryFn: () => getCharacter(characterId as string),
    enabled: Boolean(characterId),
  })

  const classesQuery = useQuery({ queryKey: ['content', 'classes'], queryFn: listClasses })

  const character = characterQuery.data
  const klass = classesQuery.data?.find((item) => item.id === character?.class_id)
  const toLevel = (character?.level ?? 0) + 1
  const classLevel = klass?.levels.find((level) => level.level === toLevel)
  const isCasterAtLevel = classLevel?.spell_slots != null

  const spellsQuery = useQuery({
    queryKey: ['content', 'spells', klass?.slug],
    queryFn: () => listSpells({ classSlug: klass?.slug }),
    enabled: Boolean(klass) && isCasterAtLevel,
  })

  const levelUpMutation = useMutation({
    mutationFn: (payload: LevelUpRequest) => postLevelUp(characterId as string, payload),
    onSuccess: (created) => {
      setRecord(created)
      queryClient.invalidateQueries({ queryKey: ['character', characterId] })
    },
  })

  if (characterQuery.isLoading || classesQuery.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (characterQuery.isError) {
    return <p role="alert">{translateApiError(t, characterQuery.error)}</p>
  }

  if (classesQuery.isError) {
    return <p role="alert">{translateApiError(t, classesQuery.error)}</p>
  }

  if (!character) return null

  if (!klass) {
    return <p role="alert">{t('pages.levelUp.classNotFound')}</p>
  }

  const fromLevel = character.level

  if (!record && !character.computed.level_up_available) {
    return (
      <section className="level-up-wizard">
        <p role="alert">{t('pages.levelUp.notAvailable')}</p>
        <Link to={`/app/characters/${characterId}`}>{t('pages.levelUp.backToSheet')}</Link>
      </section>
    )
  }

  const featuresUnlocked = classLevel?.features.items ?? []
  const unlockingSubclasses = klass.subclasses.filter((sub) => sub.unlock_level === toLevel)

  const steps: LevelUpStep[] = [
    'hp',
    'ability',
    ...(unlockingSubclasses.length > 0 ? (['subclass'] as const) : []),
    ...(isCasterAtLevel ? (['spells'] as const) : []),
    'confirm',
  ]

  if (record) {
    const subclassName = record.delta.subclass_chosen
      ? (unlockingSubclasses.find((sub) => sub.slug === record.delta.subclass_chosen)?.name ??
        record.delta.subclass_chosen)
      : null

    return (
      <section className="level-up-wizard">
        <h1 id="level-up-result-heading">
          {t('pages.levelUp.result.heading', { level: record.to_level })}
        </h1>
        <ul>
          <li>{t('pages.levelUp.result.hp', { value: record.delta.hp_gained })}</li>
          {record.delta.features_unlocked.length > 0 && (
            <li>
              {t('pages.levelUp.result.features', {
                names: record.delta.features_unlocked.join(', '),
              })}
            </li>
          )}
          {subclassName && <li>{t('pages.levelUp.result.subclass', { name: subclassName })}</li>}
          {record.delta.spells_learned.length > 0 && (
            <li>
              {t('pages.levelUp.result.spells', { names: record.delta.spells_learned.join(', ') })}
            </li>
          )}
        </ul>
        <button type="button" onClick={() => navigate(`/app/characters/${characterId}`)}>
          {t('pages.levelUp.result.backToSheet')}
        </button>
      </section>
    )
  }

  const currentStep = steps[stepIndex]
  const knownSpellIds = new Set(character.spells.map((spell) => spell.spell_id))
  const selectedSubclass = unlockingSubclasses.find((sub) => sub.id === selection.subclassId)
  const spellById = new Map((spellsQuery.data ?? []).map((spell) => [spell.id, spell]))
  const selectedSpellNames = selection.spellIds.map(
    (id) => spellById.get(id)?.name ?? String(id),
  )

  function updateSelection(patch: Partial<LevelUpSelection>) {
    setSelection((current) => ({ ...current, ...patch }))
  }

  function handleBack() {
    setStepIndex((index) => Math.max(0, index - 1))
  }

  function handleNext() {
    setStepIndex((index) => Math.min(steps.length - 1, index + 1))
  }

  return (
    <section className="level-up-wizard">
      <header>
        <h1>{t('pages.levelUp.headline', { from: fromLevel, to: toLevel })}</h1>
        <h2>{t('pages.levelUp.featuresHeading')}</h2>
        {featuresUnlocked.length === 0 ? (
          <p>{t('pages.levelUp.noFeatures')}</p>
        ) : (
          <ul className="level-up-wizard__features">
            {featuresUnlocked.map((feature) => (
              <li key={feature.name}>
                <strong>{feature.name}.</strong> {feature.description}
              </li>
            ))}
          </ul>
        )}
      </header>

      <ol className="level-up-wizard__progress" aria-label={t('pages.levelUp.title')}>
        {steps.map((step, index) => (
          <li
            key={step}
            className={`level-up-wizard__progress-item${
              index === stepIndex ? ' level-up-wizard__progress-item--current' : ''
            }`}
            aria-current={index === stepIndex ? 'step' : undefined}
          >
            {t(`pages.levelUp.steps.${step}`)}
          </li>
        ))}
      </ol>

      {currentStep === 'hp' && (
        <HpStep
          hitDie={klass.hit_die}
          selection={selection.hp}
          onChange={(hp) => updateSelection({ hp })}
        />
      )}

      {currentStep === 'ability' && (
        <AbilityStep
          selection={selection.ability}
          onChange={(ability) => updateSelection({ ability })}
        />
      )}

      {currentStep === 'subclass' && (
        <SubclassStep
          subclasses={unlockingSubclasses}
          selectedId={selection.subclassId}
          onSelect={(subclassId) => updateSelection({ subclassId })}
        />
      )}

      {currentStep === 'spells' && (
        <SpellsStep
          spells={spellsQuery.data}
          isLoading={spellsQuery.isLoading}
          isError={spellsQuery.isError}
          error={spellsQuery.error}
          knownSpellIds={knownSpellIds}
          selectedIds={selection.spellIds}
          onChange={(spellIds) => updateSelection({ spellIds })}
        />
      )}

      {currentStep === 'confirm' && (
        <ConfirmStep
          selection={selection}
          subclassName={selectedSubclass?.name ?? null}
          spellNames={selectedSpellNames}
          isSubmitting={levelUpMutation.isPending}
          error={levelUpMutation.isError ? levelUpMutation.error : null}
          onSubmit={() => levelUpMutation.mutate(buildPayload(selection))}
        />
      )}

      <div className="level-up-wizard__nav">
        {stepIndex > 0 && (
          <button type="button" onClick={handleBack}>
            {t('pages.levelUp.back')}
          </button>
        )}
        {currentStep !== 'confirm' && (
          <button
            type="button"
            disabled={!canGoNext(currentStep, selection, klass.hit_die)}
            onClick={handleNext}
          >
            {t('pages.levelUp.next')}
          </button>
        )}
      </div>
    </section>
  )
}
