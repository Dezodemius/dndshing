import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import RaceStep from './RaceStep'
import ClassStep from './ClassStep'
import BackgroundStep from './BackgroundStep'
import { WIZARD_STEPS, type WizardSelection, type WizardStep } from './types'
import './characterWizard.css'

const INITIAL_SELECTION: WizardSelection = { race: null, klass: null, background: null }

function canGoNext(step: WizardStep, selection: WizardSelection): boolean {
  if (step === 'race') return selection.race !== null
  if (step === 'class') return selection.klass !== null
  return true
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

  return (
    <section className="character-wizard">
      <h1>{t('pages.characterNew.title')}</h1>

      <ol className="character-wizard__progress" aria-label={t('pages.characterNew.title')}>
        {WIZARD_STEPS.map((step, index) => (
          <li
            key={step}
            className={`character-wizard__progress-item${
              index === stepIndex ? ' character-wizard__progress-item--current' : ''
            }`}
            aria-current={index === stepIndex ? 'step' : undefined}
          >
            {t(`pages.characterNew.steps.${step}`)}
          </li>
        ))}
      </ol>

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

      {isSummary && (
        <section aria-labelledby="wizard-summary-heading">
          <h2 id="wizard-summary-heading">{t('pages.characterNew.summary.heading')}</h2>
          <ul className="character-wizard__summary-list">
            <li>{t('pages.characterNew.summary.race', { name: selection.race?.name })}</li>
            <li>{t('pages.characterNew.summary.class', { name: selection.klass?.name })}</li>
            <li>
              {selection.background
                ? t('pages.characterNew.summary.background', { name: selection.background.name })
                : t('pages.characterNew.summary.backgroundNone')}
            </li>
          </ul>
          <p>{t('pages.characterNew.summary.note')}</p>
        </section>
      )}

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
    </section>
  )
}
