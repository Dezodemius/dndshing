import type {
  LssCharacterData,
  LssNamedValue,
  LssSave,
  LssSkill,
  LssStat
} from "./schema";
import { abilityModifier } from "./dnd-heuristics";

type StatKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

const SKILLS: Array<{
  key: string;
  baseStat: StatKey;
  label: string;
}> = [
  { key: "acrobatics", baseStat: "dex", label: "Акробатика" },
  { key: "investigation", baseStat: "int", label: "Анализ" },
  { key: "athletics", baseStat: "str", label: "Атлетика" },
  { key: "perception", baseStat: "wis", label: "Восприятие" },
  { key: "survival", baseStat: "wis", label: "Выживание" },
  { key: "performance", baseStat: "cha", label: "Выступление" },
  { key: "intimidation", baseStat: "cha", label: "Запугивание" },
  { key: "history", baseStat: "int", label: "История" },
  { key: "sleight of hand", baseStat: "dex", label: "Ловкость рук" },
  { key: "arcana", baseStat: "int", label: "Магия" },
  { key: "medicine", baseStat: "wis", label: "Медицина" },
  { key: "deception", baseStat: "cha", label: "Обман" },
  { key: "nature", baseStat: "int", label: "Природа" },
  { key: "insight", baseStat: "wis", label: "Проницательность" },
  { key: "religion", baseStat: "int", label: "Религия" },
  { key: "stealth", baseStat: "dex", label: "Скрытность" },
  { key: "persuasion", baseStat: "cha", label: "Убеждение" },
  { key: "animal handling", baseStat: "wis", label: "Уход за животными" }
];

export function lssField(
  name: string,
  value: string | number | boolean | null,
  label = ""
): LssNamedValue {
  return {
    name,
    value,
    label
  };
}

export function lssStat(
  name: StatKey,
  score: number,
  label: string
): LssStat {
  return {
    name,
    score,
    modifier: abilityModifier(score),
    race: 0,
    label,
    check: 0
  };
}

export function createDefaultLssSaves(): Record<StatKey, LssSave> {
  return createLssSaves([]);
}

export function createLssSaves(proficientStats: StatKey[]): Record<StatKey, LssSave> {
  return {
    str: lssSave("str", proficientStats.includes("str")),
    dex: lssSave("dex", proficientStats.includes("dex")),
    con: lssSave("con", proficientStats.includes("con")),
    int: lssSave("int", proficientStats.includes("int")),
    wis: lssSave("wis", proficientStats.includes("wis")),
    cha: lssSave("cha", proficientStats.includes("cha"))
  };
}

export function createDefaultLssSkills(): Record<string, LssSkill> {
  return Object.fromEntries(
    SKILLS.map((skill) => [
      skill.key,
      {
        baseStat: skill.baseStat,
        name: skill.key,
        label: skill.label,
        isProf: 0
      }
    ])
  );
}

export function createEmptyLssCharacterData(input: {
  characterName: string;
  playerName: string;
  race: string;
  className: string;
  level: number;
  proficiencyBonus: number;
  createdAt: string;
  hiddenName: string;
  stats: LssCharacterData["stats"];
  avatarUrl: string | null;
  mechanics: {
    armorClass: number;
    hitDie: string;
    hitPoints: number;
    saveProficiencies: StatKey[];
    speed: number;
  };
  text: Record<string, unknown>;
}): LssCharacterData {
  return {
    isDefault: true,
    jsonType: "character",
    template: "default",
    name: {
      value: input.characterName
    },
    info: {
      charClass: lssField("charClass", input.className, "класс и уровень"),
      charSubclass: lssField("charSubclass", ""),
      level: lssField("level", input.level, "уровень"),
      background: lssField("background", "", "предыстория"),
      playerName: lssField("playerName", input.playerName, "имя игрока"),
      race: lssField("race", input.race, "раса"),
      alignment: lssField("alignment", "", "мировоззрение"),
      experience: lssField("experience", 0, "опыт")
    },
    subInfo: {
      age: lssField("age", "", "возраст"),
      height: lssField("height", "", "рост"),
      weight: lssField("weight", "", "вес"),
      eyes: lssField("", "", ""),
      skin: lssField("", "", ""),
      hair: lssField("", "", "")
    },
    spellsInfo: {
      base: {
        name: "base",
        value: "",
        label: "Базовая характеристика заклинаний",
        code: ""
      },
      save: {
        name: "save",
        value: "",
        label: "Сложность спасброска",
        customModifier: "0"
      },
      mod: {
        name: "mod",
        value: "",
        label: "Бонус атаки заклинанием",
        customModifier: "0"
      }
    },
    spells: {
      "slots-1": { value: 0 },
      "slots-2": { value: 0 },
      "slots-3": { value: 0 },
      "slots-4": { value: 0 }
    },
    spellsPact: {},
    bonuses: [],
    proficiency: input.proficiencyBonus,
    stats: input.stats,
    saves: createLssSaves(input.mechanics.saveProficiencies),
    skills: createDefaultLssSkills(),
    vitality: {
      "hp-dice-current": { value: input.level },
      "hp-dice-multi": {},
      "hp-max-con-bonus": { value: 0 },
      darkvision: { value: 0 },
      "hp-max": { value: input.mechanics.hitPoints },
      "hp-current": { value: input.mechanics.hitPoints },
      "hp-temp": { value: 0 },
      isDying: false,
      deathFails: 0,
      deathSuccesses: 0,
      ac: { value: input.mechanics.armorClass },
      speed: { value: input.mechanics.speed },
      "hit-die": { value: input.mechanics.hitDie },
      "hp-max-bonus": { value: 0 }
    },
    attunementsList: [
      {
        id: `attunement-${Date.now()}`,
        checked: false,
        value: ""
      }
    ],
    weaponsList: [],
    weapons: {},
    text: input.text,
    coins: {
      gp: { value: 0 },
      total: { value: 0 },
      sp: { value: 0 },
      cp: { value: 0 },
      pp: { value: 0 },
      ep: { value: 0 }
    },
    resources: {},
    bonusesSkills: null,
    bonusesStats: null,
    conditions: null,
    wizardStep: "initial",
    hiddenName: input.hiddenName,
    casterClass: {
      value: ""
    },
    avatar: input.avatarUrl
      ? {
          jpeg: input.avatarUrl,
          webp: input.avatarUrl
        }
      : {},
    inspiration: false,
    exhaustion: "",
    createdAt: input.createdAt,
    proficiencyCustom: 0
  };
}

function lssSave(name: StatKey, isProf: boolean): LssSave {
  return {
    name,
    isProf,
    bonus: 0
  };
}
