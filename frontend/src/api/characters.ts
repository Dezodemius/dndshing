import { apiClient } from './client'

export interface AbilityScores {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

export interface Proficiencies {
  skills?: string[]
  saves?: string[]
  languages?: string[]
  tools?: string[]
}

export interface ComputedBlock {
  prof_bonus: number
  modifiers: AbilityScores
  saving_throws: AbilityScores
  skills: Record<string, number>
  ac: number
  initiative: number
  passive_perception: number
  xp_to_next: number | null
  level_up_available: boolean
  spell_slots: Record<string, number>
}

export interface CharacterDetail {
  id: number
  user_id: number
  name: string
  race_id: number
  class_id: number
  subclass_id: number | null
  background_id: number | null
  alignment: string
  level: number
  xp: number
  ability_scores: AbilityScores
  hp_max: number
  hp_current: number
  hp_temp: number
  ac_override: number | null
  speed: number
  proficiencies: Proficiencies
  appearance: string | null
  backstory: string | null
  notes: string | null
  gold: number
  silver: number
  copper: number
  created_at: string
  updated_at: string
  computed: ComputedBlock
}

export interface CharacterPatch {
  hp_current?: number
  hp_temp?: number
  notes?: string
}

export function getCharacter(characterId: string): Promise<CharacterDetail> {
  return apiClient.get<CharacterDetail>(`/characters/${characterId}`)
}

export function patchCharacter(
  characterId: string,
  payload: CharacterPatch,
): Promise<CharacterDetail> {
  return apiClient.patch<CharacterDetail>(`/characters/${characterId}`, payload)
}
