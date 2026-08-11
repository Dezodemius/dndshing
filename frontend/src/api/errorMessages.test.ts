import type { TFunction } from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { translateApiError } from './errorMessages'

const t = vi.fn((key: string) => key) as unknown as TFunction

describe('translateApiError', () => {
  it('maps a known API error code to its translation key', () => {
    const error = new ApiError('invalid_credentials', 'Invalid credentials')
    expect(translateApiError(t, error)).toBe('errors.invalidCredentials')
  })

  it('falls back to errors.unknown for an unmapped API error code', () => {
    const error = new ApiError('some_unmapped_code', 'boom')
    expect(translateApiError(t, error)).toBe('errors.unknown')
  })

  it('falls back to errors.unknown for a non-ApiError value', () => {
    expect(translateApiError(t, new Error('network down'))).toBe('errors.unknown')
  })
})
