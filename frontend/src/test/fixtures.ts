import type { CharacterSummary } from '../api/characters'
import type { Campaign, CampaignPlayerView } from '../api/campaigns'
import type { Merchant } from '../api/merchants'

// Factories rather than literals. Every field the API adds would otherwise
// break each hand-written fixture at once (tsc -b runs in CI), and the fix
// would be the same edit repeated across files.

export function makeCharacterSummary(
  overrides: Partial<CharacterSummary> = {},
): CharacterSummary {
  return {
    id: 1,
    name: 'Ари',
    race_id: 1,
    class_id: 1,
    subclass_id: null,
    race_name: 'Полурослик',
    class_name: 'Плут',
    level: 3,
    xp: 900,
    hp_max: 24,
    hp_current: 24,
    hp_temp: 0,
    ac: 14,
    gold: 100,
    silver: 0,
    copper: 0,
    level_up_available: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    dm_user_id: 1,
    name: 'Проклятие Страда',
    description: null,
    next_session_at: null,
    next_session_place: null,
    invite_code: 'ABC123',
    ...overrides,
  }
}

export function makeCampaignPlayerView(
  overrides: Partial<CampaignPlayerView> = {},
): CampaignPlayerView {
  return {
    id: 2,
    dm_user_id: 9,
    name: 'Гробница Аннигиляции',
    description: null,
    next_session_at: null,
    next_session_place: null,
    ...overrides,
  }
}

export function makeMerchant(overrides: Partial<Merchant> = {}): Merchant {
  return {
    id: 1,
    owner_user_id: 1,
    name: 'Лавка Борга',
    description: null,
    share_code: 'shop123',
    is_open: true,
    ...overrides,
  }
}
