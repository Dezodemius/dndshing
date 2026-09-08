import fs from 'node:fs'
import path from 'node:path'
import type { AbilityScores, CharacterSheet } from '../../src/api/characters'
import { getFilledSheet } from './fixtures'

interface LssRichText {
  value?: {
    data?: {
      content?: Array<{ content?: Array<{ text?: string }> }>
    }
  }
}

interface LssValue<T> {
  value?: T
}

type LssRecord = Record<string, unknown>
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

function record(value: unknown): LssRecord {
  return typeof value === 'object' && value !== null ? (value as LssRecord) : {}
}

function richText(value: unknown): string {
  const field = value as LssRichText | undefined
  return (field?.value?.data?.content ?? [])
    .map((paragraph) => (paragraph.content ?? []).map((node) => node.text ?? '').join(''))
    .join('\n')
}

function fieldValue<T>(value: unknown, fallback: T): T {
  return ((value as LssValue<T> | undefined)?.value ?? fallback) as T
}

function parseSource(): LssRecord {
  const sourcePath = path.resolve(process.cwd(), 'tests/references/zlatobrad/source.json')
  const outer = record(JSON.parse(fs.readFileSync(sourcePath, 'utf8')))
  return record(JSON.parse(String(outer.data ?? '{}')))
}

/**
 * Converts the owner-provided LSS export into the application's existing
 * CharacterSheet contract. This adapter is test-only: LSS is not a production
 * dependency or an accepted API payload.
 */
export function getZlatobradSheet(): CharacterSheet {
  const source = parseSource()
  const info = record(source.info)
  const subInfo = record(source.subInfo)
  const vitality = record(source.vitality)
  const stats = record(source.stats)
  const saves = record(source.saves)
  const skills = record(source.skills)
  const text = record(source.text)
  const coins = record(source.coins)
  const proficiency = Number(source.proficiency ?? 0)

  const statNumber = (ability: keyof AbilityScores, key: 'score' | 'modifier', fallback: number) =>
    Number(record(stats[ability])[key] ?? fallback)
  const scores: AbilityScores = {
    str: statNumber('str', 'score', 10),
    dex: statNumber('dex', 'score', 10),
    con: statNumber('con', 'score', 10),
    int: statNumber('int', 'score', 10),
    wis: statNumber('wis', 'score', 10),
    cha: statNumber('cha', 'score', 10),
  }
  const modifiers: AbilityScores = {
    str: statNumber('str', 'modifier', 0),
    dex: statNumber('dex', 'modifier', 0),
    con: statNumber('con', 'modifier', 0),
    int: statNumber('int', 'modifier', 0),
    wis: statNumber('wis', 'modifier', 0),
    cha: statNumber('cha', 'modifier', 0),
  }

  const saveValue = (ability: keyof AbilityScores) => {
    const save = record(saves[ability])
    const proficiencyBonus = save.isProf === true ? proficiency : 0
    return modifiers[ability] + proficiencyBonus + Number(save.bonus ?? 0)
  }
  const savingThrows: AbilityScores = {
    str: saveValue('str'),
    dex: saveValue('dex'),
    con: saveValue('con'),
    int: saveValue('int'),
    wis: saveValue('wis'),
    cha: saveValue('cha'),
  }
  const skillValues = Object.fromEntries(
    Object.entries(skills).map(([name, rawSkill]) => {
      const skill = record(rawSkill)
      const normalized = name.replaceAll(' ', '-')
      const baseAbility = String(skill.baseStat ?? '')
      const baseModifier = ABILITY_KEYS.includes(baseAbility as keyof AbilityScores)
        ? modifiers[baseAbility as keyof AbilityScores]
        : 0
      return [normalized, baseModifier + Number(skill.isProf ?? 0) * proficiency]
    }),
  )

  const weapons = Array.isArray(source.weaponsList) ? source.weaponsList : []
  const attacks = weapons.map((rawWeapon) => {
    const weapon = record(rawWeapon)
    return {
      name: fieldValue(record(weapon.name), ''),
      bonus: '5',
      damage: fieldValue(record(weapon.dmg), ''),
    }
  })

  const spells = Array.from({ length: 10 }, (_, level) => ({
    spell_id: 10_000 + level,
    prepared: level === 1,
  }))
  const spellContent = Object.fromEntries(
    spells.map((selection, level) => [
      String(selection.spell_id),
      {
        id: selection.spell_id,
        name: richText(text[`spells-level-${level}`]),
        level,
        school: '',
      },
    ]),
  )

  const sheet = getFilledSheet()
  return {
    ...sheet,
    name: fieldValue(record(source.name), 'Златобрад'),
    level: fieldValue(record(info.level), 4),
    xp: fieldValue(record(info.experience), 2700),
    alignment: fieldValue(record(info.alignment), ''),
    ability_scores: scores,
    hp_max: fieldValue(record(vitality['hp-max']), 34),
    hp_current: fieldValue(record(vitality['hp-current']), 34),
    hp_temp: fieldValue(record(vitality['hp-temp']), 0),
    speed: fieldValue(record(vitality.speed), 30),
    ac_override: fieldValue<number | null>(record(vitality.ac), null),
    player_name: fieldValue(record(info.playerName), ''),
    age: fieldValue<number | null>(record(subInfo.age), null),
    height: String(fieldValue(record(subInfo.height), '')),
    weight: String(fieldValue(record(subInfo.weight), '')),
    inspiration: source.inspiration === true,
    hit_dice_spent: 0,
    death_save_successes: Number(vitality.deathSuccesses ?? 0),
    death_save_failures: Number(vitality.deathFails ?? 0),
    attacks: { items: attacks, note: richText(text.attacks) },
    spell_slots_spent: {},
    personality_traits: richText(text.personality),
    ideals: richText(text.ideals),
    bonds: richText(text.bonds),
    flaws: richText(text.flaws),
    goals: richText(text.quests),
    allies: richText(text.allies),
    feats: richText(text.feats),
    extra_features: richText(text.features),
    treasures: richText(text.items),
    appearance: richText(text['notes-4']),
    backstory: richText(text.background),
    notes: richText(text['notes-1']),
    gold: fieldValue(record(coins.gp), 0),
    silver: fieldValue(record(coins.sp), 0),
    copper: fieldValue(record(coins.cp), 0),
    portrait_url: '/__fixtures/zlatobrad-portrait.png',
    computed: {
      ...sheet.computed,
      prof_bonus: proficiency,
      modifiers,
      saving_throws: savingThrows,
      skills: skillValues,
      ac: fieldValue(record(vitality.ac), 16),
      initiative: modifiers.dex,
      passive_perception: 10 + Number(skillValues.perception ?? 0),
      xp_to_next: 3800,
      xp_level_floor: 2700,
      xp_next_threshold: 6500,
      level_up_available: false,
      hit_dice_total: fieldValue(record(vitality['hp-dice-current']), 4),
      spell_slots: {},
      base_ability_scores: scores,
      effective_ability_scores: scores,
      base_modifiers: modifiers,
      speed_effective: fieldValue(record(vitality.speed), 30),
      hp_max_effective: fieldValue(record(vitality['hp-max']), 34),
      spellcasting_ability: 'int',
      spell_save_dc: 9,
      spell_attack_bonus: 1,
    },
    inventory: [
      {
        id: 20_001,
        character_id: sheet.id,
        item_id: null,
        custom_name: richText(text.equipment),
        quantity: 1,
        equipped: false,
      },
    ],
    spells,
    content: {
      ...sheet.content,
      race_name: fieldValue(record(info.race), ''),
      class_name: fieldValue(record(info.charClass), ''),
      subclass_name: fieldValue(record(info.charSubclass), '') || null,
      background_name: fieldValue(record(info.background), ''),
      hit_die: Number(String(fieldValue(record(vitality['hit-die']), 'd10')).replace('d', '')),
      class_features: [],
      race_traits: [],
      subclass_features: [],
      background_feature: null,
      languages: [richText(text.prof)],
      tool_proficiencies: [],
      armor_proficiencies: [],
      weapon_proficiencies: [],
      items: {},
      spells: spellContent,
    },
  }
}
