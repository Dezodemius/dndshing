import { apiClient } from './client'

export interface ShopItem {
  id: number
  item_id: number
  name: string
  price_g: number
  price_s: number
  price_c: number
  quantity: number | null
}

export interface Shop {
  name: string
  description: string | null
  is_open: boolean
  items: ShopItem[]
}

export interface ShopBuyRequest {
  character_id: number
  merchant_item_id: number
  quantity: number
}

export interface ShopBuyResult {
  inventory_entry_id: number
  quantity_bought: number
  character_gold: number
  character_silver: number
  character_copper: number
  merchant_item_remaining_quantity: number | null
}

export interface ShopSellRequest {
  character_id: number
  inventory_entry_id: number
  quantity: number
}

export interface ShopSellResult {
  quantity_sold: number
  character_gold: number
  character_silver: number
  character_copper: number
  refund_gold: number
  refund_silver: number
  refund_copper: number
  inventory_entry_remaining_quantity: number | null
}

export function getShop(shareCode: string): Promise<Shop> {
  return apiClient.get<Shop>(`/shop/${shareCode}`)
}

export function buyFromShop(shareCode: string, payload: ShopBuyRequest): Promise<ShopBuyResult> {
  return apiClient.post<ShopBuyResult>(`/shop/${shareCode}/buy`, payload)
}

export function sellToShop(shareCode: string, payload: ShopSellRequest): Promise<ShopSellResult> {
  return apiClient.post<ShopSellResult>(`/shop/${shareCode}/sell`, payload)
}
