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

export interface CharacterSpell {
  spell_id: number
  prepared: boolean
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

export interface InventoryEntry {
  id: number
  character_id: number
  item_id: number | null
  custom_name: string | null
  quantity: number
  equipped: boolean
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
  spells: CharacterSpell[]
  inventory: InventoryEntry[]
}

export interface CharacterCreate {
  name: string
  race_id: number
  class_id: number
  subclass_id?: number | null
  background_id?: number | null
  alignment: string
  ability_scores: AbilityScores
  hp_max: number
  hp_current?: number
  hp_temp?: number
  ac_override?: number | null
  speed: number
  proficiencies?: Proficiencies
  appearance?: string | null
  backstory?: string | null
  notes?: string | null
  gold?: number
  silver?: number
  copper?: number
}

export interface CharacterPatch {
  hp_current?: number
  hp_temp?: number
  notes?: string
  gold?: number
  silver?: number
  copper?: number
}

export interface InventoryEntryCreate {
  item_id?: number
  custom_name?: string
  quantity?: number
  equipped?: boolean
}

export interface InventoryEntryUpdate {
  quantity?: number
  equipped?: boolean
}

export interface LevelUpRequest {
  hp_method: 'average' | 'rolled'
  hp_rolled?: number
  asi?: Partial<AbilityScores>
  feat?: string
  subclass_id?: number
  spells_learned: number[]
}

export interface LevelUpRecord {
  id: number
  character_id: number
  from_level: number
  to_level: number
  delta: {
    hp_gained: number
    hp_method: 'average' | 'rolled'
    asi: Partial<AbilityScores> | null
    feat: string | null
    subclass_chosen: string | null
    features_unlocked: string[]
    spells_learned: string[]
    spells_forgotten: string[]
  }
  created_at: string
}

export interface CharacterSummary {
  id: number
  name: string
  level: number
  gold: number
  silver: number
  copper: number
}

export function listCharacters(): Promise<CharacterSummary[]> {
  return apiClient.get<CharacterSummary[]>('/characters')
}

export function createCharacter(payload: CharacterCreate): Promise<CharacterDetail> {
  return apiClient.post<CharacterDetail>('/characters', payload)
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

export function updateSpells(
  characterId: string,
  spells: CharacterSpell[],
): Promise<CharacterSpell[]> {
  return apiClient.put<CharacterSpell[]>(`/characters/${characterId}/spells`, { spells })
}

export function addInventoryItem(
  characterId: string,
  payload: InventoryEntryCreate,
): Promise<InventoryEntry> {
  return apiClient.post<InventoryEntry>(`/characters/${characterId}/inventory`, payload)
}

export function updateInventoryItem(
  characterId: string,
  entryId: number,
  payload: InventoryEntryUpdate,
): Promise<InventoryEntry> {
  return apiClient.patch<InventoryEntry>(
    `/characters/${characterId}/inventory/${entryId}`,
    payload,
  )
}

export function deleteInventoryItem(characterId: string, entryId: number): Promise<void> {
  return apiClient.delete<void>(`/characters/${characterId}/inventory/${entryId}`)
}

export function postLevelUp(
  characterId: string,
  payload: LevelUpRequest,
): Promise<LevelUpRecord> {
  return apiClient.post<LevelUpRecord>(`/characters/${characterId}/level-up`, payload)
}

export function getLevelHistory(characterId: string): Promise<LevelUpRecord[]> {
  return apiClient.get<LevelUpRecord[]>(`/characters/${characterId}/level-history`)
}

export function postLevelRollback(characterId: string): Promise<CharacterDetail> {
  return apiClient.post<CharacterDetail>(`/characters/${characterId}/level-rollback`)
}
