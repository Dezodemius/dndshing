import type { LssCharacterData } from "@/features/lss/schema";
import { extractPlainText } from "@/features/lss/rich-text";

export type StatKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

// ── Core D&D calculations ──────────────────────────────────────────────────────

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export function skillBonus(
  isProf: 0 | 1 | 2,
  statModifier: number,
  proficiencyBonus: number
): number {
  return statModifier + isProf * proficiencyBonus;
}

export function saveBonus(
  isProf: boolean,
  statModifier: number,
  proficiencyBonus: number
): number {
  return statModifier + (isProf ? proficiencyBonus : 0);
}

export function passivePerception(
  wisModifier: number,
  perceptionProfLevel: 0 | 1 | 2,
  proficiencyBonus: number
): number {
  return 10 + skillBonus(perceptionProfLevel, wisModifier, proficiencyBonus);
}

// ── LSS data extraction ────────────────────────────────────────────────────────

export function getTextSection(data: LssCharacterData, key: string): string {
  return extractPlainText(data.text[key]);
}

export function vitalityNum(data: LssCharacterData, key: string): number {
  const v = data.vitality[key] as { value?: unknown } | undefined;
  const n = Number(v?.value);
  return isNaN(n) ? 0 : n;
}

export function vitalityStr(data: LssCharacterData, key: string): string {
  const v = data.vitality[key] as { value?: unknown } | undefined;
  const val = v?.value;
  if (val == null) return "";
  return String(val);
}

export function namedVal(v: { value?: unknown } | null | undefined): string {
  if (v?.value == null) return "";
  return String(v.value);
}

// ── Skills list (canonical order matching the PDF) ─────────────────────────────

export const SKILLS_LIST: Array<{ key: string; stat: StatKey; label: string }> = [
  { key: "acrobatics", stat: "dex", label: "Акробатика" },
  { key: "investigation", stat: "int", label: "Анализ" },
  { key: "athletics", stat: "str", label: "Атлетика" },
  { key: "perception", stat: "wis", label: "Восприятие" },
  { key: "survival", stat: "wis", label: "Выживание" },
  { key: "performance", stat: "cha", label: "Выступление" },
  { key: "intimidation", stat: "cha", label: "Запугивание" },
  { key: "history", stat: "int", label: "История" },
  { key: "sleight of hand", stat: "dex", label: "Ловкость рук" },
  { key: "arcana", stat: "int", label: "Магия" },
  { key: "medicine", stat: "wis", label: "Медицина" },
  { key: "deception", stat: "cha", label: "Обман" },
  { key: "nature", stat: "int", label: "Природа" },
  { key: "insight", stat: "wis", label: "Проницательность" },
  { key: "religion", stat: "int", label: "Религия" },
  { key: "stealth", stat: "dex", label: "Скрытность" },
  { key: "persuasion", stat: "cha", label: "Убеждение" },
  { key: "animal handling", stat: "wis", label: "Уход за животными" },
];

export const STATS: StatKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export const STAT_LABELS: Record<StatKey, string> = {
  str: "СИЛА",
  dex: "ЛОВКОСТЬ",
  con: "ТЕЛОСЛОЖЕНИЕ",
  int: "ИНТЕЛЛЕКТ",
  wis: "МУДРОСТЬ",
  cha: "ХАРИЗМА",
};

export const STAT_SHORT: Record<StatKey, string> = {
  str: "Сил",
  dex: "Лов",
  con: "Тел",
  int: "Инт",
  wis: "Муд",
  cha: "Хар",
};
