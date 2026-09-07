import type { Page } from '@playwright/test'
import type { CharacterSheet } from '../../src/api/characters'

const timestamp = '2026-09-06T12:00:00Z'

const player = {
  id: 42,
  email: 'player@example.test',
  display_name: 'Тестовый игрок',
  is_admin: false,
  email_verified: true,
  locale: 'ru',
  created_at: timestamp,
}

const filledSheet: CharacterSheet = {
  id: 101,
  user_id: player.id,
  name: 'Кейлин',
  race_id: 1,
  class_id: 2,
  subclass_id: 3,
  background_id: 4,
  alignment: 'Нейтральный добрый',
  level: 3,
  xp: 900,
  ability_scores: { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 8 },
  hp_max: 28,
  hp_current: 21,
  hp_temp: 2,
  ac_override: null,
  speed: 30,
  proficiencies: {},
  appearance: 'Высокий человек в потёртом дорожном плаще.',
  backstory: 'Кейлин родился в большом городе и отправился искать древние руины.',
  notes: 'Вернуть долг библиотекарю.',
  gold: 17,
  silver: 8,
  copper: 4,
  player_name: 'Игрок',
  age: 29,
  height: '1,82 м',
  weight: '78 кг',
  inspiration: true,
  hit_dice_spent: 1,
  death_save_successes: 2,
  death_save_failures: 1,
  attacks: {
    items: [
      { name: 'Длинный меч', bonus: '+5', damage: '1к8 + 3 рубящий' },
      { name: 'Лёгкий арбалет', bonus: '+3', damage: '1к8 + 1 колющий' },
    ],
    note: 'Атака двумя руками наносит 1к10 + 3.',
  },
  spell_slots_spent: { '1': 1, '2': 0 },
  personality_traits: 'Всегда говорю прямо.',
  ideals: 'Знание должно быть доступно всем.',
  bonds: 'Не брошу сестру в беде.',
  flaws: 'Не умею вовремя остановиться.',
  goals: 'Найти карту затерянного храма.',
  allies: 'Старая гильдия картографов.',
  feats: 'Бдительность.',
  extra_features: 'Второе дыхание.',
  treasures: 'Серебряный медальон.',
  created_at: timestamp,
  updated_at: timestamp,
  computed: {
    prof_bonus: 2,
    modifiers: { str: 3, dex: 1, con: 2, int: 0, wis: 1, cha: -1 },
    saving_throws: { str: 5, dex: 1, con: 4, int: 0, wis: 1, cha: -1 },
    skills: {
      acrobatics: 1,
      'animal-handling': 1,
      arcana: 0,
      athletics: 5,
      deception: -1,
      history: 0,
      insight: 1,
      intimidation: -1,
      investigation: 0,
      medicine: 1,
      nature: 0,
      perception: 3,
      performance: -1,
      persuasion: -1,
      religion: 0,
      'sleight-of-hand': 1,
      stealth: 1,
      survival: 1,
    },
    ac: 16,
    initiative: 1,
    passive_perception: 13,
    xp_to_next: 1800,
    xp_level_floor: 900,
    xp_next_threshold: 2700,
    level_up_available: false,
    hit_dice_total: 3,
    spell_slots: { '1': 3, '2': 2 },
    base_ability_scores: { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 8 },
    effective_ability_scores: { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 8 },
    base_modifiers: { str: 3, dex: 1, con: 2, int: 0, wis: 1, cha: -1 },
    speed_effective: 30,
    hp_max_effective: 28,
    advantage: {},
    damage_modifiers: {},
    active_effects: [],
    effect_sources: {},
    spellcasting_ability: 'wis',
    spell_save_dc: 11,
    spell_attack_bonus: 3,
  },
  inventory: [
    { id: 900, character_id: 101, item_id: 5, custom_name: null, quantity: 1, equipped: true },
    { id: 901, character_id: 101, item_id: null, custom_name: 'Старый ключ', quantity: 2, equipped: false },
  ],
  spells: [
    { spell_id: 7, prepared: true },
    { spell_id: 8, prepared: false },
  ],
  content: {
    race_name: 'Человек',
    class_name: 'Следопыт',
    subclass_name: 'Охотник',
    background_name: 'Археолог',
    hit_die: 10,
    class_features: [{ name: 'Избранный враг', description: 'Вы знаете своего врага.', level: 1 }],
    race_traits: [{ name: 'Разносторонность', description: null, level: null }],
    subclass_features: [{ name: 'Добыча охотника', description: null, level: null }],
    background_feature: { name: 'Историческое знание', description: null, level: null },
    languages: ['Общий', 'Эльфийский'],
    tool_proficiencies: ['Инструменты картографа'],
    armor_proficiencies: ['Лёгкие доспехи', 'Средние доспехи'],
    weapon_proficiencies: ['Простое оружие', 'Воинское оружие'],
    items: { '5': { id: 5, name: 'Кольчужная рубаха', type: 'Доспех', weight: '20 фунтов' } },
    spells: { '7': { id: 7, name: 'Лечение ран', level: 1, school: 'Воплощение' } },
  },
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getFilledSheet(): CharacterSheet {
  return deepClone(filledSheet)
}

export function getEmptySheet(): CharacterSheet {
  const sheet = getFilledSheet()
  sheet.name = 'Пустой лист'
  sheet.subclass_id = null
  sheet.background_id = null
  sheet.alignment = ''
  sheet.xp = 0
  sheet.hp_current = 1
  sheet.hp_temp = 0
  sheet.appearance = null
  sheet.backstory = null
  sheet.notes = null
  sheet.gold = 0
  sheet.silver = 0
  sheet.copper = 0
  sheet.player_name = null
  sheet.age = null
  sheet.height = null
  sheet.weight = null
  sheet.inspiration = false
  sheet.hit_dice_spent = 0
  sheet.death_save_successes = 0
  sheet.death_save_failures = 0
  sheet.attacks = { items: [], note: null }
  sheet.spell_slots_spent = {}
  sheet.personality_traits = null
  sheet.ideals = null
  sheet.bonds = null
  sheet.flaws = null
  sheet.goals = null
  sheet.allies = null
  sheet.feats = null
  sheet.extra_features = null
  sheet.treasures = null
  sheet.inventory = []
  sheet.spells = []
  sheet.content = {
    ...sheet.content,
    subclass_name: null,
    background_name: null,
    class_features: [],
    race_traits: [],
    subclass_features: [],
    background_feature: null,
    languages: [],
    tool_proficiencies: [],
    armor_proficiencies: [],
    weapon_proficiencies: [],
    items: {},
    spells: {},
  }
  sheet.computed = {
    ...sheet.computed,
    spell_slots: {},
    spellcasting_ability: null,
    spell_save_dc: null,
    spell_attack_bonus: null,
  }
  return sheet
}

export async function mockAuthenticatedSheet(page: Page, sheet: CharacterSheet): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/v1/auth/refresh') {
      await route.fulfill({ json: { access_token: 'e2e-access-token', token_type: 'bearer' } })
      return
    }
    if (pathname === '/api/v1/me') {
      await route.fulfill({ json: player })
      return
    }
    if (pathname === '/api/v1/characters/101/sheet') {
      await route.fulfill({ json: sheet })
      return
    }
    if (pathname === '/api/v1/characters/101' && route.request().method() === 'PATCH') {
      const { content: _content, ...detail } = sheet
      const payload = route.request().postDataJSON() as Partial<CharacterSheet>
      await route.fulfill({ json: { ...detail, ...payload } })
      return
    }
    await route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'Not found' } } })
  })
}

export async function openSheet(page: Page, sheet: CharacterSheet): Promise<void> {
  await mockAuthenticatedSheet(page, sheet)
  await page.goto('/app/characters/101/sheet')
}
