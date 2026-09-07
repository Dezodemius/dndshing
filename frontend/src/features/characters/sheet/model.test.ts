import { describe, expect, it } from 'vitest'
import type { CharacterSheet } from '../../../api/characters'
import { buildSheetModel } from './model'
import {
  createCharacterSheetSchema,
  getChangedCharacterSheetFields,
  getCharacterSheetFormDefaults,
  toCharacterSheetPatch,
} from './schema'

function makeSheet(): CharacterSheet {
  return {
    id: 42,
    user_id: 7,
    name: 'Магнар',
    race_id: 1,
    class_id: 2,
    subclass_id: null,
    background_id: 3,
    alignment: 'хаотично-нейтральный',
    level: 3,
    xp: 900,
    ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 15, cha: 8 },
    hp_max: 30,
    hp_current: 25,
    hp_temp: 4,
    ac_override: null,
    speed: 25,
    proficiencies: { skills: ['athletics'], saves: ['str', 'con'] },
    appearance: null,
    backstory: null,
    notes: null,
    gold: 11,
    silver: 2,
    copper: 3,
    player_name: null,
    age: null,
    height: null,
    weight: null,
    inspiration: false,
    hit_dice_spent: 1,
    death_save_successes: 2,
    death_save_failures: 1,
    attacks: { items: [{ name: 'Секира', bonus: '+5', damage: '1d12 рубящий' }], note: null },
    spell_slots_spent: { '1': 1 },
    personality_traits: null,
    ideals: null,
    bonds: null,
    flaws: null,
    goals: null,
    allies: null,
    feats: null,
    extra_features: null,
    treasures: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    computed: {
      prof_bonus: 2,
      modifiers: { str: 3, dex: 2, con: 1, int: 0, wis: 2, cha: -1 },
      saving_throws: { str: 5, dex: 2, con: 3, int: 0, wis: 2, cha: -1 },
      skills: { athletics: 5, perception: 2 },
      ac: 16,
      initiative: 2,
      passive_perception: 12,
      xp_to_next: 1800,
      xp_level_floor: 900,
      xp_next_threshold: 2700,
      level_up_available: false,
      hit_dice_total: 3,
      spell_slots: { '1': 2 },
      base_ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 15, cha: 8 },
      effective_ability_scores: { str: 19, dex: 14, con: 12, int: 10, wis: 15, cha: 8 },
      base_modifiers: { str: 3, dex: 2, con: 1, int: 0, wis: 2, cha: -1 },
      speed_effective: 30,
      hp_max_effective: 35,
      advantage: {},
      damage_modifiers: {},
      active_effects: [],
      effect_sources: {},
      spellcasting_ability: 'cha',
      spell_save_dc: 12,
      spell_attack_bonus: 4,
    },
    spells: [{ spell_id: 12, prepared: true }],
    inventory: [
      {
        id: 99,
        character_id: 42,
        item_id: 5,
        custom_name: null,
        quantity: 2,
        equipped: true,
      },
      {
        id: 100,
        character_id: 42,
        item_id: null,
        custom_name: 'Памятный камень',
        quantity: 1,
        equipped: false,
      },
    ],
    content: {
      race_name: 'Полуорк',
      class_name: 'Паладин',
      subclass_name: null,
      background_name: 'Солдат',
      hit_die: 10,
      class_features: [{ name: 'Божественное чутьё', description: null, level: 1 }],
      race_traits: [],
      subclass_features: [],
      background_feature: null,
      languages: ['Общий'],
      tool_proficiencies: [],
      armor_proficiencies: ['Тяжёлые доспехи'],
      weapon_proficiencies: ['Простое оружие'],
      items: {
        '5': { id: 5, name: 'Длинный меч', type: 'weapon', weight: '1.5' },
      },
      spells: {
        '12': { id: 12, name: 'Кара', level: 1, school: 'Воплощение' },
      },
    },
  }
}

describe('buildSheetModel', () => {
  it('uses server-computed effective combat and ability values without 5e arithmetic', () => {
    const model = buildSheetModel(makeSheet())

    expect(model.fields['ability.str.score']).toBe(19)
    expect(model.fields['ability.str.modifier']).toBe(3)
    expect(model.fields['combat.speed']).toBe(30)
    expect(model.fields['combat.hp_max']).toBe(35)
    expect(model.fields['combat.hit_dice_total']).toBe(3)
    expect(model.fields['spellcasting.save_dc']).toBe(12)
  })

  it('normalizes empty stored text and exposes stable IDs for inventory and spells', () => {
    const model = buildSheetModel(makeSheet())

    expect(model.fields['identity.player_name']).toBe('')
    expect(model.fields.backstory).toBe('')
    expect(model.fields['inventory.99.name']).toBe('Длинный меч')
    expect(model.fields['inventory.100.name']).toBe('Памятный камень')
    expect(model.fields['inventory.99.equipped']).toBe(true)
    expect(model.fields['spell.12.name']).toBe('Кара')
    expect(model.fields['spell.12.prepared']).toBe(true)
    expect(model.fields.age).toBe('')
    expect(model.fields.height).toBe('')
    expect(model.fields.weight).toBe('')
  })

  it('uses dirty editable form values while retaining server-computed effective values', () => {
    const sheet = makeSheet()
    const values = getCharacterSheetFormDefaults(sheet)
    values.name = 'Новый Магнар'
    values.hp_max = 40
    values.speed = 20
    values.hp_current = 18
    values.gold = 99

    const model = buildSheetModel(sheet, values)

    expect(model.fields['identity.name']).toBe('Новый Магнар')
    expect(model.fields['combat.hp_current']).toBe(18)
    expect(model.fields['currency.gold']).toBe(99)
    expect(model.fields['combat.hp_max_base']).toBe(40)
    expect(model.fields['combat.speed_base']).toBe(20)
    expect(model.fields['combat.hp_max']).toBe(35)
    expect(model.fields['combat.speed']).toBe(30)
  })

  it('keeps page four present for a non-caster and represents it as non-casting', () => {
    const sheet = makeSheet()
    sheet.computed.spellcasting_ability = null
    sheet.computed.spell_save_dc = null
    sheet.computed.spell_attack_bonus = null
    sheet.computed.spell_slots = {}

    const model = buildSheetModel(sheet)

    expect(model.isCaster).toBe(false)
    expect(model.blocks).toContainEqual({ id: 'spells', page: 4, column: 'all', row: 1 })
    expect(model.fields['spell_slots.1.total']).toBe(0)
  })
})

describe('character sheet form helpers', () => {
  it('validates spent slots against server-provided capacities', () => {
    const values = getCharacterSheetFormDefaults(makeSheet())
    values.spell_slots_spent['1'] = 3

    const result = createCharacterSheetSchema({ '1': 2 }, 3).safeParse(values)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['spell_slots_spent', '1'])
    }
  })

  it('recovers from legacy attacks JSON without crashing the form defaults', () => {
    const sheet = makeSheet()
    sheet.attacks = {} as CharacterSheet['attacks']

    expect(getCharacterSheetFormDefaults(sheet).attacks).toEqual({ items: [], note: '' })
  })

  it('uses injected translated fallbacks for unresolved content cards', () => {
    const sheet = makeSheet()
    sheet.content.items = {}
    sheet.inventory[0]!.custom_name = null
    sheet.content.spells = {}

    const model = buildSheetModel(sheet, undefined, {
      itemName: (id) => `Предмет #${id}`,
      spellName: (id) => `Заклинание #${id}`,
    })

    expect(model.fields['inventory.99.name']).toBe('Предмет #5')
    expect(model.fields['spell.12.name']).toBe('Заклинание #12')
  })

  it('converts controlled empty text back to nullable backend fields', () => {
    const patch = toCharacterSheetPatch(getCharacterSheetFormDefaults(makeSheet()))

    expect(patch.player_name).toBeNull()
    expect(patch.attacks).toEqual({
      items: [{ name: 'Секира', bonus: '+5', damage: '1d12 рубящий' }],
      note: null,
    })
  })

  it('includes only dirty top-level values when preparing a PATCH', () => {
    const values = getCharacterSheetFormDefaults(makeSheet())
    values.hp_current = 12

    const patch = toCharacterSheetPatch(values, { hp_current: true })

    expect(patch).toEqual({ hp_current: 12 })
  })

  it('detects nested spell-slot changes as one top-level PATCH field', () => {
    const original = getCharacterSheetFormDefaults(makeSheet())
    const values = { ...original, spell_slots_spent: { ...original.spell_slots_spent, '1': 2 } }

    expect(getChangedCharacterSheetFields(values, original)).toEqual({ spell_slots_spent: true })
  })
})
