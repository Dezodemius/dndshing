import { apiClient } from './client'

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
  level: number
  features: {
    items?: ClassFeature[]
  }
}

export interface ClassSummary {
  id: number
  slug: string
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

export function listRaces(): Promise<RaceSummary[]> {
  return apiClient.get<RaceSummary[]>('/content/races')
}

export function listClasses(): Promise<ClassSummary[]> {
  return apiClient.get<ClassSummary[]>('/content/classes')
}

export function listBackgrounds(): Promise<BackgroundSummary[]> {
  return apiClient.get<BackgroundSummary[]>('/content/backgrounds')
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

export function listItems(type?: string): Promise<Item[]> {
  const query = type ? `?type=${encodeURIComponent(type)}` : ''
  return apiClient.get<Item[]>(`/content/items${query}`)
}
