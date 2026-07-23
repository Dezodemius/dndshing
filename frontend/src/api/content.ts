import { apiClient } from './client'

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
