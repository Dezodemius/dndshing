import type { CharacterSheet, SheetFeature } from '../../../api/characters'
import {
  getCharacterSheetFormDefaults,
  SPELL_SLOT_LEVELS,
  type CharacterSheetFormValues,
} from './schema'

export type SheetFieldValue = string | number | boolean

export interface SheetBlock {
  id: string
  page: 1 | 2 | 3 | 4
  column: 1 | 2 | 3 | 'all'
  row: number
}

export interface CharacterSheetModel {
  fields: Record<string, SheetFieldValue>
  blocks: readonly SheetBlock[]
  isCaster: boolean
}

export interface SheetModelFallbacks {
  itemName: (itemId: number) => string
  spellName: (spellId: number) => string
}

/** Named layout regions shared by screen, print, and structural tests. */
export const SHEET_BLOCKS: readonly SheetBlock[] = [
  { id: 'identity', page: 1, column: 'all', row: 1 },
  { id: 'abilities', page: 1, column: 1, row: 1 },
  { id: 'inspiration', page: 1, column: 1, row: 2 },
  { id: 'saves', page: 1, column: 1, row: 3 },
  { id: 'skills', page: 1, column: 1, row: 4 },
  { id: 'passive-perception', page: 1, column: 1, row: 5 },
  { id: 'proficiencies', page: 1, column: 1, row: 6 },
  { id: 'combat', page: 1, column: 2, row: 1 },
  { id: 'attacks', page: 1, column: 2, row: 2 },
  { id: 'currency', page: 1, column: 2, row: 3 },
  { id: 'equipment', page: 1, column: 2, row: 4 },
  { id: 'personality', page: 1, column: 3, row: 1 },
  { id: 'ideals', page: 1, column: 3, row: 2 },
  { id: 'bonds', page: 1, column: 3, row: 3 },
  { id: 'flaws', page: 1, column: 3, row: 4 },
  { id: 'features-summary', page: 1, column: 3, row: 5 },
  { id: 'identity', page: 2, column: 'all', row: 1 },
  { id: 'portrait', page: 2, column: 1, row: 1 },
  { id: 'appearance', page: 2, column: 1, row: 2 },
  { id: 'backstory', page: 2, column: 1, row: 3 },
  { id: 'goals', page: 2, column: 1, row: 4 },
  { id: 'allies', page: 2, column: 2, row: 1 },
  { id: 'feats', page: 2, column: 2, row: 2 },
  { id: 'extra_features', page: 2, column: 2, row: 3 },
  { id: 'treasures', page: 2, column: 2, row: 4 },
  { id: 'identity', page: 3, column: 'all', row: 1 },
  { id: 'features', page: 3, column: 1, row: 1 },
  { id: 'notes', page: 3, column: 2, row: 1 },
  { id: 'spells', page: 4, column: 'all', row: 1 },
]

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

const SKILLS = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const

function text(value: string | null | undefined): string {
  return value ?? ''
}

function list(values: string[]): string {
  return values.join(', ')
}

function addFeatureFields(
  fields: Record<string, SheetFieldValue>,
  source: string,
  features: SheetFeature[],
): void {
  features.forEach((feature, index) => {
    const prefix = `feature.${source}.${index}`
    fields[`${prefix}.name`] = feature.name
    fields[`${prefix}.description`] = text(feature.description)
    fields[`${prefix}.level`] = feature.level ?? ''
  })
}

const defaultFallbacks: SheetModelFallbacks = {
  itemName: (itemId) => itemId.toString(),
  spellName: (spellId) => spellId.toString(),
}

/**
 * Produces canonical values for the sole screen/print document source.
 * It deliberately only reads backend-computed rule results and never derives
 * a 5e value in the browser.
 */
export function buildSheetModel(
  sheet: CharacterSheet,
  formValues: CharacterSheetFormValues = getCharacterSheetFormDefaults(sheet),
  fallbacks: SheetModelFallbacks = defaultFallbacks,
): CharacterSheetModel {
  const fields: Record<string, SheetFieldValue> = {
    'identity.name': formValues.name,
    'identity.class': text(sheet.content.class_name),
    'identity.subclass': text(sheet.content.subclass_name),
    'identity.background': text(sheet.content.background_name),
    'identity.player_name': formValues.player_name,
    'identity.race': text(sheet.content.race_name),
    'identity.alignment': formValues.alignment,
    'identity.level': sheet.level,
    'identity.xp': formValues.xp,
    age: formValues.age ?? '',
    height: formValues.height,
    weight: formValues.weight,
    inspiration: formValues.inspiration,
    'proficiency.bonus': sheet.computed.prof_bonus,
    passive_perception: sheet.computed.passive_perception,
    'proficiencies.languages': list(sheet.content.languages),
    'proficiencies.tools': list(sheet.content.tool_proficiencies),
    'proficiencies.armor': list(sheet.content.armor_proficiencies),
    'proficiencies.weapons': list(sheet.content.weapon_proficiencies),
    'combat.ac': sheet.computed.ac,
    'combat.ac_override': formValues.ac_override ?? '',
    'combat.initiative': sheet.computed.initiative,
    'combat.speed': sheet.computed.speed_effective,
    'combat.speed_base': formValues.speed,
    'combat.hp_max': sheet.computed.hp_max_effective,
    'combat.hp_max_base': formValues.hp_max,
    'combat.hp_current': formValues.hp_current,
    'combat.hp_temp': formValues.hp_temp,
    'combat.hit_dice_spent': formValues.hit_dice_spent,
    'combat.hit_dice_total': sheet.computed.hit_dice_total,
    'combat.hit_die': sheet.content.hit_die ?? '',
    'combat.death_save_successes': formValues.death_save_successes,
    'combat.death_save_failures': formValues.death_save_failures,
    'currency.gold': formValues.gold,
    'currency.silver': formValues.silver,
    'currency.copper': formValues.copper,
    'attacks.note': formValues.attacks.note,
    personality_traits: formValues.personality_traits,
    ideals: formValues.ideals,
    bonds: formValues.bonds,
    flaws: formValues.flaws,
    appearance: formValues.appearance,
    backstory: formValues.backstory,
    goals: formValues.goals,
    allies: formValues.allies,
    feats: formValues.feats,
    extra_features: formValues.extra_features,
    treasures: formValues.treasures,
    notes: formValues.notes,
    'spellcasting.ability': sheet.computed.spellcasting_ability ?? '',
    'spellcasting.save_dc': sheet.computed.spell_save_dc ?? '',
    'spellcasting.attack_bonus': sheet.computed.spell_attack_bonus ?? '',
  }

  for (const ability of ABILITIES) {
    fields[`ability.${ability}.score`] = sheet.computed.effective_ability_scores[ability]
    fields[`ability.${ability}.modifier`] = sheet.computed.modifiers[ability]
    fields[`save.${ability}`] = sheet.computed.saving_throws[ability]
  }

  for (const skill of SKILLS) {
    fields[`skill.${skill}`] = sheet.computed.skills[skill] ?? ''
  }

  for (const level of SPELL_SLOT_LEVELS) {
    fields[`spell_slots.${level}.total`] = sheet.computed.spell_slots[level] ?? 0
    fields[`spell_slots.${level}.spent`] = formValues.spell_slots_spent[level]
  }

  formValues.attacks.items.forEach((attack, index) => {
    const prefix = `attack.${index}`
    fields[`${prefix}.name`] = attack.name
    fields[`${prefix}.bonus`] = attack.bonus
    fields[`${prefix}.damage`] = attack.damage
  })

  sheet.inventory.forEach((entry) => {
    const item = entry.item_id === null ? undefined : sheet.content.items[String(entry.item_id)]
    const prefix = `inventory.${entry.id}`
    fields[`${prefix}.name`] =
      item?.name ?? entry.custom_name ?? fallbacks.itemName(entry.item_id ?? entry.id)
    fields[`${prefix}.quantity`] = entry.quantity
    fields[`${prefix}.equipped`] = entry.equipped
    fields[`${prefix}.type`] = item?.type ?? ''
    fields[`${prefix}.weight`] = item?.weight ?? ''
  })

  sheet.spells.forEach((selection) => {
    const spell = sheet.content.spells[String(selection.spell_id)]
    const prefix = `spell.${selection.spell_id}`
    fields[`${prefix}.name`] = spell?.name ?? fallbacks.spellName(selection.spell_id)
    fields[`${prefix}.level`] = spell?.level ?? ''
    fields[`${prefix}.school`] = spell?.school ?? ''
    fields[`${prefix}.prepared`] = selection.prepared
  })

  addFeatureFields(fields, 'class', sheet.content.class_features)
  addFeatureFields(fields, 'race', sheet.content.race_traits)
  addFeatureFields(fields, 'subclass', sheet.content.subclass_features)
  if (sheet.content.background_feature !== null) {
    addFeatureFields(fields, 'background', [sheet.content.background_feature])
  }

  return {
    fields,
    blocks: SHEET_BLOCKS,
    isCaster: sheet.computed.spellcasting_ability !== null,
  }
}
