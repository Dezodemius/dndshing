import type { BackgroundSummary, ClassSummary, RaceSummary } from '../../../api/content'

export const WIZARD_STEPS = ['race', 'class', 'background'] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]

export interface WizardSelection {
  race: RaceSummary | null
  klass: ClassSummary | null
  background: BackgroundSummary | null
}
