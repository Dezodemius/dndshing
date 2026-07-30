import { apiClient } from './client'
import type { CharacterDetail } from './characters'

export interface Campaign {
  id: number
  dm_user_id: number
  name: string
  description: string | null
  next_session_at: string | null
  next_session_place: string | null
  invite_code: string
}

export interface CampaignPlayerView {
  id: number
  dm_user_id: number
  name: string
  description: string | null
  next_session_at: string | null
  next_session_place: string | null
}

export interface CampaignParticipant {
  character_id: number
  joined_at: string
}

export interface CampaignDetail extends Campaign {
  participants: CampaignParticipant[]
}

export interface CampaignsMine {
  as_dm: Campaign[]
  as_player: CampaignPlayerView[]
}

export interface CampaignCreate {
  name: string
  description?: string | null
  next_session_at?: string | null
  next_session_place?: string | null
}

export interface CampaignPatch {
  name?: string
  description?: string | null
  next_session_at?: string | null
  next_session_place?: string | null
}

export interface CampaignJoinRequest {
  invite_code: string
  character_id: number
}

export function listCampaigns(): Promise<CampaignsMine> {
  return apiClient.get<CampaignsMine>('/campaigns')
}

export function createCampaign(payload: CampaignCreate): Promise<Campaign> {
  return apiClient.post<Campaign>('/campaigns', payload)
}

export function getCampaign(campaignId: string): Promise<CampaignDetail> {
  return apiClient.get<CampaignDetail>(`/campaigns/${campaignId}`)
}

export function patchCampaign(campaignId: string, payload: CampaignPatch): Promise<Campaign> {
  return apiClient.patch<Campaign>(`/campaigns/${campaignId}`, payload)
}

export function deleteCampaign(campaignId: string): Promise<void> {
  return apiClient.delete<void>(`/campaigns/${campaignId}`)
}

export function regenerateInviteCode(campaignId: string): Promise<Campaign> {
  return apiClient.post<Campaign>(`/campaigns/${campaignId}/regenerate-invite`)
}

export function joinCampaign(payload: CampaignJoinRequest): Promise<CampaignPlayerView> {
  return apiClient.post<CampaignPlayerView>('/campaigns/join', payload)
}

export function getCampaignCharacter(
  campaignId: string,
  characterId: number,
): Promise<CharacterDetail> {
  return apiClient.get<CharacterDetail>(`/campaigns/${campaignId}/characters/${characterId}`)
}

export function removeCampaignCharacter(
  campaignId: string,
  characterId: number,
): Promise<void> {
  return apiClient.delete<void>(`/campaigns/${campaignId}/characters/${characterId}`)
}
