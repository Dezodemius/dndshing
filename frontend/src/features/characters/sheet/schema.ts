import { z } from 'zod'
import type { Attacks, CharacterSheet, CharacterUpdate } from '../../../api/characters'

export const SPELL_SLOT_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export type SpellSlotLevel = (typeof SPELL_SLOT_LEVELS)[number]

export type SpellSlotValues = Record<SpellSlotLevel, number>

export interface CharacterSheetFormValues {
  name: string
  alignment: string
  xp: number
  hp_max: number
  hp_current: number
  hp_temp: number
  ac_override: number | null
  speed: number
  gold: number
  silver: number
  copper: number
  player_name: string
  age: number | null
  height: string
  weight: string
  inspiration: boolean
  hit_dice_spent: number
  death_save_successes: number
  death_save_failures: number
  attacks: {
    items: Array<{ name: string; bonus: string; damage: string }>
    note: string
  }
  spell_slots_spent: SpellSlotValues
  personality_traits: string
  ideals: string
  bonds: string
  flaws: string
  goals: string
  allies: string
  feats: string
  extra_features: string
  treasures: string
  appearance: string
  backstory: string
  notes: string
}

export type CharacterSheetPatch = Pick<
  CharacterUpdate,
  | 'name'
  | 'alignment'
  | 'xp'
  | 'hp_max'
  | 'hp_current'
  | 'hp_temp'
  | 'ac_override'
  | 'speed'
  | 'gold'
  | 'silver'
  | 'copper'
  | 'player_name'
  | 'age'
  | 'height'
  | 'weight'
  | 'inspiration'
  | 'hit_dice_spent'
  | 'death_save_successes'
  | 'death_save_failures'
  | 'attacks'
  | 'spell_slots_spent'
  | 'personality_traits'
  | 'ideals'
  | 'bonds'
  | 'flaws'
  | 'goals'
  | 'allies'
  | 'feats'
  | 'extra_features'
  | 'treasures'
  | 'appearance'
  | 'backstory'
  | 'notes'
>

/** Structural equivalent of react-hook-form's dirtyFields, kept React-free. */
export type CharacterSheetDirtyFields = Partial<
  Record<keyof CharacterSheetFormValues, unknown>
>

/** Finds changed top-level PATCH fields, including changes nested in slot/attack data. */
export function getChangedCharacterSheetFields(
  values: CharacterSheetFormValues,
  original: CharacterSheetFormValues,
): CharacterSheetDirtyFields {
  return Object.fromEntries(
    (Object.keys(values) as Array<keyof CharacterSheetFormValues>)
      .filter((field) => JSON.stringify(values[field]) !== JSON.stringify(original[field]))
      .map((field) => [field, true]),
  ) as CharacterSheetDirtyFields
}

const nullableText = (maxLength: number) => z.string().max(maxLength)

const spellSlotsSchema = z.object({
  '1': z.number().int().min(0),
  '2': z.number().int().min(0),
  '3': z.number().int().min(0),
  '4': z.number().int().min(0),
  '5': z.number().int().min(0),
  '6': z.number().int().min(0),
  '7': z.number().int().min(0),
  '8': z.number().int().min(0),
  '9': z.number().int().min(0),
})

const attackSchema = z.object({
  name: z.string().min(1).max(100),
  bonus: z.string().max(30),
  damage: z.string().max(60),
})

/**
 * Server-compatible sheet field validation without per-character capacities.
 * Use createCharacterSheetSchema for a submit schema that also checks spent
 * spell slots against the server-provided computed totals.
 */
export const characterSheetSchema = z.object({
  name: z.string().min(1).max(200),
  alignment: z.string().min(1).max(50),
  xp: z.number().int().min(0),
  hp_max: z.number().int().min(1),
  hp_current: z.number().int().min(0),
  hp_temp: z.number().int().min(0),
  ac_override: z.number().int().nullable(),
  speed: z.number().int().min(0),
  gold: z.number().int().min(0),
  silver: z.number().int().min(0),
  copper: z.number().int().min(0),
  player_name: nullableText(200),
  age: z.number().int().min(0).max(100_000).nullable(),
  height: nullableText(50),
  weight: nullableText(50),
  inspiration: z.boolean(),
  hit_dice_spent: z.number().int().min(0),
  death_save_successes: z.number().int().min(0).max(3),
  death_save_failures: z.number().int().min(0).max(3),
  attacks: z.object({
    items: z.array(attackSchema).max(20),
    note: nullableText(500),
  }),
  spell_slots_spent: spellSlotsSchema,
  personality_traits: nullableText(2000),
  ideals: nullableText(2000),
  bonds: nullableText(2000),
  flaws: nullableText(2000),
  goals: nullableText(2000),
  allies: nullableText(2000),
  feats: nullableText(2000),
  extra_features: nullableText(2000),
  treasures: nullableText(2000),
  appearance: nullableText(2000),
  backstory: nullableText(2000),
  notes: nullableText(2000),
})

function slotCapacity(
  capacities: Record<string, number>,
  level: SpellSlotLevel,
): number {
  const value = capacities[level]
  return Number.isInteger(value) && value > 0 ? value : 0
}

/** Adds server-derived slot capacity checks without copying the 5e slot table. */
export function createCharacterSheetSchema(
  capacities: Record<string, number>,
  hitDiceTotal: number,
) {
  return characterSheetSchema.superRefine((values, context) => {
    for (const level of SPELL_SLOT_LEVELS) {
      const spent = values.spell_slots_spent[level]
      const total = slotCapacity(capacities, level)
      if (spent > total) {
        context.addIssue({
          code: z.ZodIssueCode.too_big,
          maximum: total,
          type: 'number',
          inclusive: true,
          path: ['spell_slots_spent', level],
          message: 'spellSlotsSpentExceedsTotal',
        })
      }
    }
    if (values.hit_dice_spent > hitDiceTotal) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: hitDiceTotal,
        type: 'number',
        inclusive: true,
        path: ['hit_dice_spent'],
        message: 'hitDiceSpentExceedsTotal',
      })
    }
  })
}

function textValue(value: string | null): string {
  return value ?? ''
}

function spellSlotValues(values: Record<string, number>): SpellSlotValues {
  return Object.fromEntries(
    SPELL_SLOT_LEVELS.map((level) => {
      const value = values[level]
      return [level, Number.isInteger(value) && value >= 0 ? value : 0]
    }),
  ) as SpellSlotValues
}

function attackValues(value: unknown): CharacterSheetFormValues['attacks'] {
  if (typeof value !== 'object' || value === null) {
    return { items: [], note: '' }
  }

  const record = value as Record<string, unknown>
  const items = Array.isArray(record.items)
    ? record.items.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return []
        const row = item as Record<string, unknown>
        if (typeof row.name !== 'string') return []
        return [
          {
            name: row.name,
            bonus: typeof row.bonus === 'string' ? row.bonus : '',
            damage: typeof row.damage === 'string' ? row.damage : '',
          },
        ]
      })
    : []

  return {
    items,
    note: typeof record.note === 'string' ? record.note : '',
  }
}

/** Produces controlled-input defaults without mutating the cached API response. */
export function getCharacterSheetFormDefaults(
  sheet: CharacterSheet,
): CharacterSheetFormValues {
  return {
    name: sheet.name,
    alignment: sheet.alignment,
    xp: sheet.xp,
    hp_max: sheet.hp_max,
    hp_current: sheet.hp_current,
    hp_temp: sheet.hp_temp,
    ac_override: sheet.ac_override,
    speed: sheet.speed,
    gold: sheet.gold,
    silver: sheet.silver,
    copper: sheet.copper,
    player_name: textValue(sheet.player_name),
    age: sheet.age,
    height: textValue(sheet.height),
    weight: textValue(sheet.weight),
    inspiration: sheet.inspiration,
    hit_dice_spent: sheet.hit_dice_spent,
    death_save_successes: sheet.death_save_successes,
    death_save_failures: sheet.death_save_failures,
    attacks: attackValues(sheet.attacks),
    spell_slots_spent: spellSlotValues(sheet.spell_slots_spent),
    personality_traits: textValue(sheet.personality_traits),
    ideals: textValue(sheet.ideals),
    bonds: textValue(sheet.bonds),
    flaws: textValue(sheet.flaws),
    goals: textValue(sheet.goals),
    allies: textValue(sheet.allies),
    feats: textValue(sheet.feats),
    extra_features: textValue(sheet.extra_features),
    treasures: textValue(sheet.treasures),
    appearance: textValue(sheet.appearance),
    backstory: textValue(sheet.backstory),
    notes: textValue(sheet.notes),
  }
}

function nullWhenEmpty(value: string): string | null {
  return value === '' ? null : value
}

/** Maps the controlled form back to the exact editable subset of CharacterUpdate. */
export function toCharacterSheetPatch(
  values: CharacterSheetFormValues,
  dirtyFields?: CharacterSheetDirtyFields,
): CharacterSheetPatch {
  const attacks: Attacks = {
    items: values.attacks.items.map((attack) => ({ ...attack })),
    note: nullWhenEmpty(values.attacks.note),
  }

  const patch: CharacterSheetPatch = {
    name: values.name,
    alignment: values.alignment,
    xp: values.xp,
    hp_max: values.hp_max,
    hp_current: values.hp_current,
    hp_temp: values.hp_temp,
    ac_override: values.ac_override,
    speed: values.speed,
    gold: values.gold,
    silver: values.silver,
    copper: values.copper,
    player_name: nullWhenEmpty(values.player_name),
    age: values.age,
    height: nullWhenEmpty(values.height),
    weight: nullWhenEmpty(values.weight),
    inspiration: values.inspiration,
    hit_dice_spent: values.hit_dice_spent,
    death_save_successes: values.death_save_successes,
    death_save_failures: values.death_save_failures,
    attacks,
    spell_slots_spent: { ...values.spell_slots_spent },
    personality_traits: nullWhenEmpty(values.personality_traits),
    ideals: nullWhenEmpty(values.ideals),
    bonds: nullWhenEmpty(values.bonds),
    flaws: nullWhenEmpty(values.flaws),
    goals: nullWhenEmpty(values.goals),
    allies: nullWhenEmpty(values.allies),
    feats: nullWhenEmpty(values.feats),
    extra_features: nullWhenEmpty(values.extra_features),
    treasures: nullWhenEmpty(values.treasures),
    appearance: nullWhenEmpty(values.appearance),
    backstory: nullWhenEmpty(values.backstory),
    notes: nullWhenEmpty(values.notes),
  }

  if (dirtyFields === undefined) {
    return patch
  }

  return Object.fromEntries(
    Object.entries(patch).filter(([field]) => dirtyFields[field as keyof CharacterSheetFormValues]),
  ) as CharacterSheetPatch
}
