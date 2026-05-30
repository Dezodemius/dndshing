import type {
  AbilityScores,
  GeneratedCharacter,
  InternalCharacter
} from "@/features/characters/domain";
import { createInternalCharacter } from "@/features/characters/factory";

import { deriveLssMechanics } from "./dnd-heuristics";
import { createEmptyLssCharacterData, lssStat } from "./lss-template";
import { createLssRichText, extractPlainText } from "./rich-text";
import type { LssCharacterData, LssCharacterJson } from "./schema";
import {
  LssCharacterDataSchema,
  LssCharacterJsonSchema,
  parseLssCharacterData
} from "./schema";

export function internalToLssJson(
  character: InternalCharacter,
  exportedAt = new Date().toISOString()
): LssCharacterJson {
  const mechanics = deriveLssMechanics({
    className: character.identity.class,
    race: character.identity.race,
    level: character.identity.level,
    abilityScores: character.mechanics.abilityScores
  });
  const lssData = LssCharacterDataSchema.parse(
    createEmptyLssCharacterData({
      characterName: character.identity.characterName,
      playerName: character.identity.playerName,
      race: character.identity.race,
      className: character.identity.class,
      level: character.identity.level,
      proficiencyBonus: character.mechanics.proficiencyBonus,
      createdAt: exportedAt,
      hiddenName: createHiddenName(character.identity.characterName),
      stats: mapStats(character.mechanics.abilityScores),
      avatarUrl: character.assets.avatarUrl,
      mechanics,
      text: createLssText(character)
    })
  );

  return LssCharacterJsonSchema.parse({
    tags: [],
    rooms: [],
    disabledBlocks: {
      "info-left": [],
      "info-right": [],
      "subinfo-left": [],
      "subinfo-right": [],
      "notes-left": [],
      "notes-right": [],
      _id: createMongoLikeId()
    },
    edition: "2014",
    spells: {
      mode: "text",
      prepared: [],
      book: [],
      edition: "2024"
    },
    data: JSON.stringify(lssData),
    lastWriterSessionId: createWriterSessionId(),
    jsonType: "character",
    version: "2"
  });
}

export function lssJsonToInternal(
  json: LssCharacterJson,
  rawPrompt = "Imported from longstoryshort JSON"
): InternalCharacter {
  const lssData = parseLssCharacterData(json.data);
  const generated: GeneratedCharacter = {
    characterName: normalizeText(lssData.name.value, "Imported character"),
    race: normalizeText(stringValue(lssData.info.race.value), "Unknown race"),
    class: normalizeText(stringValue(lssData.info.charClass.value), "Unknown class"),
    level: normalizeLevel(lssData.info.level.value),
    gender: null,
    shortBackstory: normalizeText(
      extractTextSection(lssData, "background"),
      "Imported from longstoryshort."
    ),
    appearance: normalizeText(
      extractTextSection(lssData, "notes-1"),
      "Appearance was not specified in the longstoryshort file."
    ),
    personality: normalizeText(
      extractTextSection(lssData, "personality"),
      "Personality was not specified in the longstoryshort file."
    ),
    fears: normalizeText(
      extractTextSection(lssData, "flaws"),
      "Fears were not specified in the longstoryshort file."
    ),
    goals: normalizeText(
      extractTextSection(lssData, "bonds"),
      "Goals were not specified in the longstoryshort file."
    ),
    abilityScores: {
      strength: lssData.stats.str.score,
      dexterity: lssData.stats.dex.score,
      constitution: lssData.stats.con.score,
      intelligence: lssData.stats.int.score,
      wisdom: lssData.stats.wis.score,
      charisma: lssData.stats.cha.score
    },
    avatarPrompt: null
  };

  return createInternalCharacter({
    generated,
    playerName: normalizeText(
      stringValue(lssData.info.playerName.value),
      "Unknown player"
    ),
    avatarUrl: normalizeAvatarUrl(lssData),
    rawPrompt,
    createdAt: normalizeDate(lssData.createdAt)
  });
}

function mapStats(scores: AbilityScores): LssCharacterData["stats"] {
  return {
    str: lssStat("str", scores.strength, "Сила"),
    dex: lssStat("dex", scores.dexterity, "Ловкость"),
    con: lssStat("con", scores.constitution, "Телосложение"),
    int: lssStat("int", scores.intelligence, "Интеллект"),
    wis: lssStat("wis", scores.wisdom, "Мудрость"),
    cha: lssStat("cha", scores.charisma, "Харизма")
  };
}

function createLssText(character: InternalCharacter): Record<string, unknown> {
  return {
    traits: {
      value: createLssRichText("Сгенерировано ДнДшинг.", "traits")
    },
    attacks: {
      value: createLssRichText("", "attacks")
    },
    "spells-level-0": {
      value: createLssRichText("")
    },
    "spells-level-1": {
      value: createLssRichText("")
    },
    "spells-level-2": {
      value: createLssRichText("")
    },
    "spells-level-3": {
      value: createLssRichText("")
    },
    "spells-level-4": {
      value: createLssRichText("")
    },
    "spells-level-5": {
      value: createLssRichText("")
    },
    equipment: {
      value: createLssRichText(""),
      isHidden: false
    },
    background: {
      value: createLssRichText(character.roleplay.shortBackstory, "background")
    },
    ideals: {
      value: createLssRichText(character.roleplay.goals, "ideals")
    },
    personality: {
      value: createLssRichText(character.roleplay.personality, "personality"),
      size: 0
    },
    flaws: {
      value: createLssRichText(character.roleplay.fears, "flaws"),
      size: 0
    },
    bonds: {
      value: createLssRichText(character.roleplay.goals, "bonds")
    },
    allies: {
      value: createLssRichText("", "allies")
    },
    quests: {
      value: {
        data: ""
      }
    },
    prof: {
      value: {
        data: ""
      }
    },
    "notes-1": {
      size: 0,
      value: createLssRichText(character.roleplay.appearance, "notes-1")
    },
    "notes-2": {
      size: 0,
      value: createLssRichText("", "notes-2")
    },
    "notes-3": {
      size: 0,
      value: createLssRichText("", "notes-3")
    },
    "notes-4": {
      size: 0,
      value: createLssRichText("", "notes-4")
    },
    "notes-5": {
      size: 0,
      value: createLssRichText("", "notes-5")
    },
    "notes-6": {
      size: 0,
      value: {
        data: ""
      }
    },
    features: {
      value: createLssRichText("", "features")
    },
    items: {
      value: {
        data: ""
      }
    }
  };
}

function extractTextSection(data: LssCharacterData, section: string): string {
  const sectionValue = data.text[section];

  return extractPlainText(sectionValue);
}

function normalizeText(value: string, fallback: string): string {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : fallback;
}

function stringValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "";
  }

  return String(value);
}

function normalizeLevel(value: string | number | boolean | null): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return clamp(value, 1, 20);
  }

  const parsed = Number(value);

  if (Number.isInteger(parsed)) {
    return clamp(parsed, 1, 20);
  }

  return 1;
}

function normalizeAvatarUrl(data: LssCharacterData): string | null {
  const avatarUrl = data.avatar.jpeg ?? data.avatar.webp;

  if (!avatarUrl) {
    return null;
  }

  try {
    return new URL(avatarUrl).toString();
  } catch {
    return null;
  }
}

function normalizeDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function createHiddenName(characterName: string): string {
  return `${characterName}_${Math.floor(Math.random() * 100000000)}`;
}

function createWriterSessionId(): string {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 12)}`;
}

function createMongoLikeId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
