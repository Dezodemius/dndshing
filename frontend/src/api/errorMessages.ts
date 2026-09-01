import type { TFunction } from 'i18next'
import { ApiError } from './client'

const ERROR_KEYS: Record<string, string> = {
  oauth_provider_disabled: 'errors.oauthProviderDisabled',
  oauth_state_mismatch: 'errors.oauthStateMismatch',
  oauth_provider_error: 'errors.oauthProviderError',
  spell_not_in_class_list: 'errors.spellNotInClassList',
  inventory_payload_invalid: 'errors.inventoryPayloadInvalid',
  inventory_entry_not_found: 'errors.inventoryEntryNotFound',
  invalid_reference: 'errors.invalidReference',
  level_up_not_available: 'errors.levelUpNotAvailable',
  asi_feat_conflict: 'errors.asiFeatConflict',
  subclass_wrong_level: 'errors.subclassWrongLevel',
  invalid_hp_roll: 'errors.invalidHpRoll',
  rollback_empty: 'errors.rollbackEmpty',
  merchant_not_found: 'errors.merchantNotFound',
  merchant_item_not_found: 'errors.merchantItemNotFound',
  insufficient_funds: 'errors.insufficientFunds',
  out_of_stock: 'errors.outOfStock',
  not_your_character: 'errors.notYourCharacter',
  shop_closed: 'errors.shopClosed',
  custom_item_not_sellable: 'errors.customItemNotSellable',
  insufficient_inventory_quantity: 'errors.insufficientInventoryQuantity',
  campaign_not_found: 'errors.campaignNotFound',
  invite_code_invalid: 'errors.inviteCodeInvalid',
  already_joined: 'errors.alreadyJoined',
  campaign_character_not_found: 'errors.campaignCharacterNotFound',
}

export function translateApiError(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    const key = ERROR_KEYS[error.code]
    if (key) {
      return t(key)
    }
  }
  return t('errors.unknown')
}
