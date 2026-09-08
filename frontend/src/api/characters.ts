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
  xp_level_floor: number
  xp_next_threshold: number | null
  level_up_available: boolean
  spell_slots: Record<string, number>
  /** Present on the complete sheet response. Kept optional here so existing
   * detail fixtures remain valid while they are migrated. */
  hit_dice_total?: number
  base_ability_scores?: AbilityScores
  effective_ability_scores?: AbilityScores
  base_modifiers?: AbilityScores
  speed_effective?: number
  hp_max_effective?: number
  advantage?: Record<string, string>
  damage_modifiers?: Record<string, string>
  active_effects?: ActiveEffect[]
  effect_sources?: Record<string, EffectSource[]>
  spellcasting_ability?: string | null
  spell_save_dc?: number | null
  spell_attack_bonus?: number | null
}

export interface ResolvedModifier {
  target: string
  op: string
  value: number | null
  applied: boolean
  ignored_reason: string | null
}

export interface ActiveEffect {
  source_kind: 'item' | 'effect'
  source_id: number
  name: string
  modifiers: ResolvedModifier[]
}

export interface EffectSource {
  source_kind: 'item' | 'effect'
  source_id: number
  name: string
  op: string
  value: number | null
  applied: boolean
  ignored_reason: string | null
}

/** Complete computed block returned by GET /characters/:id/sheet. */
export interface CharacterSheetComputedBlock extends ComputedBlock {
  hit_dice_total: number
  base_ability_scores: AbilityScores
  effective_ability_scores: AbilityScores
  base_modifiers: AbilityScores
  speed_effective: number
  hp_max_effective: number
  advantage: Record<string, string>
  damage_modifiers: Record<string, string>
  active_effects: ActiveEffect[]
  effect_sources: Record<string, EffectSource[]>
  spellcasting_ability: string | null
  spell_save_dc: number | null
  spell_attack_bonus: number | null
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

export interface AttackRow {
  name: string
  bonus: string
  damage: string
}

export interface Attacks {
  items: AttackRow[]
  note: string | null
}

export interface CharacterSheetFields {
  player_name: string | null
  age: number | null
  height: string | null
  weight: string | null
  inspiration: boolean
  hit_dice_spent: number
  death_save_successes: number
  death_save_failures: number
  attacks: Attacks
  spell_slots_spent: Record<string, number>
  personality_traits: string | null
  ideals: string | null
  bonds: string | null
  flaws: string | null
  goals: string | null
  allies: string | null
  feats: string | null
  extra_features: string | null
  treasures: string | null
}

/** Mirrors the backend CharacterRead schema, including stored sheet fields. */
export interface CharacterRead extends CharacterSheetFields {
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
}

export interface SheetFeature {
  name: string
  description: string | null
  level: number | null
}

export interface SheetItem {
  id: number
  name: string
  type: string
  weight: string | null
}

export interface SheetSpell {
  id: number
  name: string
  level: number
  school: string
}

export interface SheetContent {
  race_name: string | null
  class_name: string | null
  subclass_name: string | null
  background_name: string | null
  hit_die: number | null
  class_features: SheetFeature[]
  race_traits: SheetFeature[]
  subclass_features: SheetFeature[]
  background_feature: SheetFeature | null
  languages: string[]
  tool_proficiencies: string[]
  armor_proficiencies: string[]
  weapon_proficiencies: string[]
  items: Record<string, SheetItem>
  spells: Record<string, SheetSpell>
}

/** Complete, owner-only response from GET /characters/:id/sheet. */
export interface CharacterSheet extends CharacterRead {
  computed: CharacterSheetComputedBlock
  spells: CharacterSpell[]
  inventory: InventoryEntry[]
  content: SheetContent
  /** Optional image URL used by the printable sheet. The portrait upload API
   * will make this field unconditional in DND-106; keeping it optional lets
   * older API deployments remain compatible. */
  portrait_url?: string | null
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

export interface CharacterUpdate {
  name?: string | null
  race_id?: number | null
  class_id?: number | null
  subclass_id?: number | null
  background_id?: number | null
  alignment?: string | null
  level?: number | null
  xp?: number
  ability_scores?: AbilityScores | null
  hp_max?: number
  hp_current?: number
  hp_temp?: number
  ac_override?: number | null
  speed?: number
  proficiencies?: Proficiencies | null
  appearance?: string | null
  backstory?: string | null
  notes?: string | null
  gold?: number
  silver?: number
  copper?: number
  player_name?: string | null
  age?: number | null
  height?: string | null
  weight?: string | null
  inspiration?: boolean | null
  hit_dice_spent?: number | null
  death_save_successes?: number | null
  death_save_failures?: number | null
  attacks?: Attacks | null
  spell_slots_spent?: Record<string, number> | null
  personality_traits?: string | null
  ideals?: string | null
  bonds?: string | null
  flaws?: string | null
  goals?: string | null
  allies?: string | null
  feats?: string | null
  extra_features?: string | null
  treasures?: string | null
}

/** Backwards-compatible name used by existing detail screens. */
export type CharacterPatch = CharacterUpdate

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

/** One row of GET /characters — mirrors the backend's CharacterListRead.
 * `race_name`/`class_name` are nullable: a character references a content row
 * by id regardless of locale, so a reference can stop resolving without ever
 * becoming invalid, and the tile then renders a blank label. */
export interface CharacterSummary {
  id: number
  name: string
  race_id: number
  class_id: number
  subclass_id: number | null
  race_name: string | null
  class_name: string | null
  level: number
  xp: number
  hp_max: number
  hp_current: number
  hp_temp: number
  ac: number
  gold: number
  silver: number
  copper: number
  level_up_available: boolean
  created_at: string
  updated_at: string
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

export function getCharacterSheet(characterId: string): Promise<CharacterSheet> {
  return apiClient.get<CharacterSheet>(`/characters/${characterId}/sheet`)
}

export function patchCharacter(
  characterId: string,
  payload: CharacterUpdate,
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
