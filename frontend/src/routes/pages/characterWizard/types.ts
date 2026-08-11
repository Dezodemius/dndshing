import type { BackgroundSummary, ClassSummary, RaceSummary } from '../../../api/content'
import type { AbilityScores } from '../../../api/characters'
import type { AbilityMethod } from './abilityRules'

export const WIZARD_STEPS = ['race', 'class', 'background', 'abilities', 'details'] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]

export interface WizardSelection {
  race: RaceSummary | null
  klass: ClassSummary | null
  background: BackgroundSummary | null
  abilityMethod: AbilityMethod
  abilityScores: AbilityScores | null
  name: string
  alignment: string
  appearance: string
  backstory: string
}
