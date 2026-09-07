import { describe, expect, it } from 'vitest'
import { formatModifier } from './formatModifier'

describe('formatModifier', () => {
  it('prefixes non-negative modifiers and preserves a negative sign', () => {
    expect(formatModifier(2)).toBe('+2')
    expect(formatModifier(0)).toBe('+0')
    expect(formatModifier(-1)).toBe('-1')
  })
})
