import type { AbilityScores } from '../../../api/characters'

export type LevelUpStep = 'hp' | 'ability' | 'subclass' | 'spells' | 'confirm'

export type AbilityKey = keyof AbilityScores

export interface HpSelection {
  method: 'average' | 'rolled'
  rolled: number | null
}

export type AbilityChoiceType = 'none' | 'asi' | 'feat'

export interface AbilitySelection {
  type: AbilityChoiceType
  asi: Partial<Record<AbilityKey, number>>
  feat: string
}

export interface LevelUpSelection {
  hp: HpSelection
  ability: AbilitySelection
  subclassId: number | null
  spellIds: number[]
}

export const INITIAL_SELECTION: LevelUpSelection = {
  hp: { method: 'average', rolled: null },
  ability: { type: 'none', asi: {}, feat: '' },
  subclassId: null,
  spellIds: [],
}
