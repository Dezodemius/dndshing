import { apiClient } from './client'

export interface Spell {
  id: number
  slug: string
  locale: string
  name: string
  level: number
  school: string
  casting_time: string
  range: string
  components: string
  duration: string
  description: string
  data: Record<string, unknown>
}

export interface AbilityBonuses {
  str?: number
  dex?: number
  con?: number
  int?: number
  wis?: number
  cha?: number
}

export interface ContentTrait {
  name: string
  description: string
}

export interface RaceSummary {
  id: number
  slug: string
  name: string
  data: {
    speed?: number
    darkvision?: number
    ability_bonuses?: AbilityBonuses
    traits?: ContentTrait[]
    languages?: string[]
  }
}

export interface ClassFeature {
  name: string
  description: string
}

export interface ClassLevelSummary {
  id: number
  class_id: number
  level: number
  features: {
    items?: ClassFeature[]
  }
  spell_slots: Record<string, unknown> | null
}

export interface ClassSummary {
  id: number
  slug: string
  locale: string
  name: string
  hit_die: number
  primary_ability: string
  data: {
    saving_throws?: string[]
    armor_proficiencies?: string[]
    weapon_proficiencies?: string[]
  }
  levels: ClassLevelSummary[]
}

export interface BackgroundSummary {
  id: number
  slug: string
  name: string
  data: {
    skill_proficiencies?: string[]
    tool_proficiencies?: string[]
    equipment?: string[]
    feature?: ContentTrait
  }
}

export interface Item {
  id: number
  slug: string
  locale: string
  name: string
  type: string
  rarity: string
  price_g: number
  price_s: number
  price_c: number
  weight: number
  description: string
  data: Record<string, unknown>
}

export function listRaces(): Promise<RaceSummary[]> {
  return apiClient.get<RaceSummary[]>('/content/races')
}

export function listClasses(): Promise<ClassSummary[]> {
  return apiClient.get<ClassSummary[]>('/content/classes')
}

export function listBackgrounds(): Promise<BackgroundSummary[]> {
  return apiClient.get<BackgroundSummary[]>('/content/backgrounds')
}

export function listSpells(params: { classSlug?: string; level?: number } = {}): Promise<Spell[]> {
  const query = new URLSearchParams()
  if (params.classSlug) query.set('class', params.classSlug)
  if (params.level !== undefined) query.set('level', String(params.level))
  const qs = query.toString()
  return apiClient.get<Spell[]>(`/content/spells${qs ? `?${qs}` : ''}`)
}

export function listItems(type?: string): Promise<Item[]> {
  const query = type ? `?type=${encodeURIComponent(type)}` : ''
  return apiClient.get<Item[]>(`/content/items${query}`)
}
