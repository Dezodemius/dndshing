import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import RaceStep from './RaceStep'
import ClassStep from './ClassStep'
import BackgroundStep from './BackgroundStep'
import AbilityScoreStep from './AbilityScoreStep'
import DetailsStep from './DetailsStep'
import PreviewStep from './PreviewStep'
import { POINT_BUY_DEFAULT_SCORES } from './abilityRules'
import { WIZARD_STEPS, type WizardSelection, type WizardStep } from './types'
import CharacterWorkspaceShell, { type WorkspaceStep } from './CharacterWorkspaceShell'
import './characterWizard.css'

const INITIAL_SELECTION: WizardSelection = {
  race: null,
  klass: null,
  background: null,
  abilityMethod: 'point-buy',
  abilityScores: POINT_BUY_DEFAULT_SCORES,
  name: '',
  alignment: '',
  appearance: '',
  backstory: '',
}

function canGoNext(step: WizardStep, selection: WizardSelection): boolean {
  if (step === 'race') return selection.race !== null
  if (step === 'class') return selection.klass !== null
  if (step === 'background') return true
  if (step === 'abilities') return selection.abilityScores !== null
  return selection.name.trim() !== '' && selection.alignment !== ''
}

export default function CharacterWizardPage() {
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(0)
  const [selection, setSelection] = useState<WizardSelection>(INITIAL_SELECTION)

  const currentStep: WizardStep | null = WIZARD_STEPS[stepIndex] ?? null
  const isSummary = currentStep === null

  function handleBack() {
    setStepIndex((index) => Math.max(0, index - 1))
  }

  function handleNext() {
    setStepIndex((index) => Math.min(WIZARD_STEPS.length, index + 1))
  }

  function handleStepSelect(index: number) {
    if (index <= stepIndex) setStepIndex(index)
  }

  const workspaceSteps: WorkspaceStep[] = WIZARD_STEPS.map((step, index) => ({
    key: step,
    label: t(`pages.characterNew.steps.${step}`),
    status: index === stepIndex ? 'current' : index < stepIndex ? 'complete' : 'available',
    disabled: index > stepIndex,
  }))

  return (
    <CharacterWorkspaceShell
      title={t('pages.characterNew.title')}
      steps={workspaceSteps}
      currentStep={stepIndex}
      onStepSelect={handleStepSelect}
      actions={(
        <div className="character-wizard__nav">
          {stepIndex > 0 && (
            <button type="button" onClick={handleBack}>
              {t('pages.characterNew.back')}
            </button>
          )}
          {!isSummary && (
            <button
              type="button"
              disabled={currentStep !== null && !canGoNext(currentStep, selection)}
              onClick={handleNext}
            >
              {t('pages.characterNew.next')}
            </button>
          )}
        </div>
      )}
    >
      <h1 className="character-wizard__title">{t('pages.characterNew.title')}</h1>
      {currentStep === 'race' && (
        <RaceStep
          selected={selection.race}
          onSelect={(race) => setSelection((current) => ({ ...current, race }))}
        />
      )}

      {currentStep === 'class' && (
        <ClassStep
          selected={selection.klass}
          onSelect={(klass) => setSelection((current) => ({ ...current, klass }))}
        />
      )}

      {currentStep === 'background' && (
        <BackgroundStep
          selected={selection.background}
          onSelect={(background) => setSelection((current) => ({ ...current, background }))}
        />
      )}

      {currentStep === 'abilities' && (
        <AbilityScoreStep
          method={selection.abilityMethod}
          scores={selection.abilityScores}
          onChange={(abilityMethod, abilityScores) =>
            setSelection((current) => ({ ...current, abilityMethod, abilityScores }))
          }
        />
      )}

      {currentStep === 'details' && (
        <DetailsStep
          name={selection.name}
          alignment={selection.alignment}
          appearance={selection.appearance}
          backstory={selection.backstory}
          onChange={(patch) => setSelection((current) => ({ ...current, ...patch }))}
        />
      )}

      {isSummary && <PreviewStep selection={selection} />}

    </CharacterWorkspaceShell>
  )
}
