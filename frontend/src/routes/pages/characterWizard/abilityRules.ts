import type { AbilityScores } from '../../../api/characters'

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type AbilityKey = (typeof ABILITY_KEYS)[number]

export type AbilityMethod = 'point-buy' | 'standard-array' | 'roll' | 'manual'
export const ABILITY_METHODS: readonly AbilityMethod[] = [
  'point-buy',
  'standard-array',
  'roll',
  'manual',
]

// Maps the full ability words used in content-pack `data` fields (e.g.
// class saving_throws) to the short keys used by AbilityScores/rules_5e.
export const ABILITY_ALIASES: Record<string, AbilityKey> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
}

export const POINT_BUY_BUDGET = 27
export const POINT_BUY_MIN = 8
export const POINT_BUY_MAX = 15

const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
}

export function pointBuyCost(score: number): number {
  return POINT_BUY_COST[score] ?? 0
}

export function pointBuyTotalCost(scores: AbilityScores): number {
  return ABILITY_KEYS.reduce((sum, key) => sum + pointBuyCost(scores[key]), 0)
}

export const POINT_BUY_DEFAULT_SCORES: AbilityScores = {
  str: POINT_BUY_MIN,
  dex: POINT_BUY_MIN,
  con: POINT_BUY_MIN,
  int: POINT_BUY_MIN,
  wis: POINT_BUY_MIN,
  cha: POINT_BUY_MIN,
}

export const MANUAL_MIN = 1
export const MANUAL_MAX = 30

export const MANUAL_DEFAULT_SCORES: AbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
}

export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8]

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function rollAbilityScore(rng: () => number = Math.random): number {
  const dice = Array.from({ length: 4 }, () => 1 + Math.floor(rng() * 6))
  dice.sort((a, b) => a - b)
  return dice[1] + dice[2] + dice[3]
}

export function rollAbilityPool(rng: () => number = Math.random): number[] {
  return Array.from({ length: 6 }, () => rollAbilityScore(rng))
}
