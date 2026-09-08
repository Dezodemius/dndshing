import type { ReactNode } from 'react'

export type WorkspaceStepStatus = 'current' | 'complete' | 'available'

export interface WorkspaceStep {
  key: string
  label: string
  status: WorkspaceStepStatus
  disabled?: boolean
}

interface CharacterWorkspaceShellProps {
  title: string
  steps: WorkspaceStep[]
  currentStep: number
  onStepSelect: (index: number) => void
  children: ReactNode
  actions: ReactNode
}

export default function CharacterWorkspaceShell({
  title,
  steps,
  currentStep,
  onStepSelect,
  children,
  actions,
}: CharacterWorkspaceShellProps) {
  return (
    <section className="character-workspace" aria-label={title}>
      <aside className="character-workspace__rail">
        <p className="character-workspace__eyebrow">{title}</p>
        <ol className="character-workspace__steps">
          {steps.map((step, index) => (
            <li key={step.key} className={`character-workspace__step character-workspace__step--${step.status}`}>
              <button
                type="button"
                className="character-workspace__step-button"
                disabled={step.disabled}
                aria-current={index === currentStep ? 'step' : undefined}
                onClick={() => onStepSelect(index)}
              >
                <span className="character-workspace__step-number" aria-hidden="true">{index + 1}</span>
                <span className="character-workspace__step-label">{step.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
      <div className="character-workspace__main">
        <div className="character-workspace__content">{children}</div>
        <div className="character-workspace__actions">{actions}</div>
      </div>
    </section>
  )
}
