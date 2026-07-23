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

export interface ClassLevelSummary {
  id: number
  class_id: number
  level: number
  features: Record<string, unknown>
  spell_slots: Record<string, unknown> | null
}

export interface ClassSummary {
  id: number
  slug: string
  locale: string
  name: string
  hit_die: number
  primary_ability: string
  data: Record<string, unknown>
  levels: ClassLevelSummary[]
}

export function listClasses(): Promise<ClassSummary[]> {
  return apiClient.get<ClassSummary[]>('/content/classes')
}

export function listSpells(params: { classSlug?: string; level?: number } = {}): Promise<Spell[]> {
  const query = new URLSearchParams()
  if (params.classSlug) query.set('class', params.classSlug)
  if (params.level !== undefined) query.set('level', String(params.level))
  const qs = query.toString()
  return apiClient.get<Spell[]>(`/content/spells${qs ? `?${qs}` : ''}`)
}
