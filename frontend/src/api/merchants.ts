import { apiClient } from './client'

export interface Merchant {
  id: number
  owner_user_id: number
  name: string
  description: string | null
  share_code: string
  is_open: boolean
}

export interface MerchantItem {
  id: number
  merchant_id: number
  item_id: number
  price_g: number | null
  price_s: number | null
  price_c: number | null
  quantity: number | null
}

export interface MerchantDetail extends Merchant {
  items: MerchantItem[]
}

export interface MerchantCreate {
  name: string
  description?: string | null
}

export interface MerchantPatch {
  name?: string
  description?: string | null
  is_open?: boolean
}

export interface MerchantItemCreate {
  item_id: number
  price_g?: number | null
  price_s?: number | null
  price_c?: number | null
  quantity?: number | null
}

export interface MerchantItemPatch {
  price_g?: number | null
  price_s?: number | null
  price_c?: number | null
  quantity?: number | null
}

export function listMerchants(): Promise<Merchant[]> {
  return apiClient.get<Merchant[]>('/merchants')
}

export function createMerchant(payload: MerchantCreate): Promise<MerchantDetail> {
  return apiClient.post<MerchantDetail>('/merchants', payload)
}

export function getMerchant(merchantId: string): Promise<MerchantDetail> {
  return apiClient.get<MerchantDetail>(`/merchants/${merchantId}`)
}

export function patchMerchant(
  merchantId: string,
  payload: MerchantPatch,
): Promise<MerchantDetail> {
  return apiClient.patch<MerchantDetail>(`/merchants/${merchantId}`, payload)
}

export function deleteMerchant(merchantId: string): Promise<void> {
  return apiClient.delete<void>(`/merchants/${merchantId}`)
}

export function addMerchantItem(
  merchantId: string,
  payload: MerchantItemCreate,
): Promise<MerchantItem> {
  return apiClient.post<MerchantItem>(`/merchants/${merchantId}/items`, payload)
}

export function updateMerchantItem(
  merchantId: string,
  itemEntryId: number,
  payload: MerchantItemPatch,
): Promise<MerchantItem> {
  return apiClient.patch<MerchantItem>(`/merchants/${merchantId}/items/${itemEntryId}`, payload)
}

export function deleteMerchantItem(merchantId: string, itemEntryId: number): Promise<void> {
  return apiClient.delete<void>(`/merchants/${merchantId}/items/${itemEntryId}`)
}
