// Bidirectional mapping between the editable character-sheet state and the
// Long Story Short (LSS) character data structure.
//
// `parseSheetState`   : LssCharacterData → SheetState (for rendering the form)
// `applySheetState`   : (original LssCharacterData, SheetState) → LssCharacterData
//                       (write the edits back, preserving unknown fields)
//
// Pure module — safe to import from both client components and server actions.

import { createLssRichText, extractPlainText } from "@/features/lss/rich-text";
import type { LssCharacterData } from "@/features/lss/schema";

export type StatKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type AttackRow = { name: string; bonus: string; damage: string };

export type SheetState = {
  characterName: string;
  charClass: string;
  background: string;
  playerName: string;
  race: string;
  alignment: string;
  experience: string;
  level: string;
  age: string;
  height: string;
  weight: string;
  scores: Record<StatKey, number>;
  proficiency: number;
  ac: number;
  speed: number;
  hpMax: number;
  hpCurrent: number;
  hpTemp: number;
  hitDie: string;
  hitDiceTotal: number;
  hitDiceUsed: number;
  inspiration: boolean;
  deathSuccesses: number;
  deathFails: number;
  saveProficiencies: Record<StatKey, boolean>;
  skillProficiencies: Record<string, 0 | 1 | 2>;
  attacks: AttackRow[];
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;
  features: string;
  attacksText: string;
  equipment: string;
  profLanguages: string;
  backstory: string;
  allies: string;
  goals: string;
  treasures: string;
  additionalFeatures: string;
  notes: [string, string, string, string, string, string];
  casterClass: string;
  spellBaseAbility: string;
  spellSaveDc: string;
  spellAttackBonus: string;
  cantrips: string;
  spellLevels: Array<{ total: number; used: number; spells: string }>;
};

export const STATS: StatKey[] = ["str", "dex", "con", "int", "wis", "cha"];

// ── Read helpers ────────────────────────────────────────────────────────────

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function getStr(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function getNum(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function getTextSection(data: LssCharacterData, key: string): string {
  return extractPlainText(data.text[key]);
}

function vitalityNum(data: LssCharacterData, key: string): number {
  const v = data.vitality[key] as { value?: unknown } | undefined;
  return getNum(v?.value);
}

function vitalityStr(data: LssCharacterData, key: string): string {
  const v = data.vitality[key] as { value?: unknown } | undefined;
  return getStr(v?.value);
}

function namedVal(v: { value?: unknown } | null | undefined): string {
  return getStr(v?.value ?? "");
}

function readAttacks(data: LssCharacterData): AttackRow[] {
  const stored = (data as unknown as { sheetAttacks?: unknown }).sheetAttacks;
  if (Array.isArray(stored)) {
    const rows = stored
      .map((r) => {
        const row = r as Record<string, unknown>;
        return {
          name: getStr(row.name),
          bonus: getStr(row.bonus),
          damage: getStr(row.damage),
        };
      })
      .slice(0, 3);
    while (rows.length < 3) rows.push({ name: "", bonus: "", damage: "" });
    return rows;
  }
  return [
    { name: "", bonus: "", damage: "" },
    { name: "", bonus: "", damage: "" },
    { name: "", bonus: "", damage: "" },
  ];
}

export function parseSheetState(d: LssCharacterData): SheetState {
  const skillProficiencies: Record<string, 0 | 1 | 2> = {};
  for (const [key, skill] of Object.entries(d.skills)) {
    skillProficiencies[key] = (skill.isProf ?? 0) as 0 | 1 | 2;
  }

  const spellLevels = Array.from({ length: 9 }, (_, i) => {
    const k = `slots-${i + 1}`;
    const s = d.spells[k] as { value?: unknown } | undefined;
    const total = getNum(s?.value);
    const spells = getTextSection(d, `spells-level-${i + 1}`);
    return { total, used: 0, spells };
  });

  return {
    characterName: d.name.value,
    charClass: namedVal(d.info.charClass),
    background: namedVal(d.info.background),
    playerName: namedVal(d.info.playerName),
    race: namedVal(d.info.race),
    alignment: namedVal(d.info.alignment),
    experience: String(d.info.experience.value ?? 0),
    level: String(d.info.level.value ?? 1),
    age: namedVal(d.subInfo.age),
    height: namedVal(d.subInfo.height),
    weight: namedVal(d.subInfo.weight),
    scores: {
      str: d.stats.str.score,
      dex: d.stats.dex.score,
      con: d.stats.con.score,
      int: d.stats.int.score,
      wis: d.stats.wis.score,
      cha: d.stats.cha.score,
    },
    proficiency: d.proficiency,
    ac: vitalityNum(d, "ac"),
    speed: vitalityNum(d, "speed"),
    hpMax: vitalityNum(d, "hp-max"),
    hpCurrent: vitalityNum(d, "hp-current"),
    hpTemp: vitalityNum(d, "hp-temp"),
    hitDie: vitalityStr(d, "hit-die") || "d8",
    hitDiceTotal: vitalityNum(d, "hp-dice-current"),
    hitDiceUsed: 0,
    inspiration: d.inspiration,
    deathSuccesses: getNum((d.vitality as Record<string, unknown>).deathSuccesses),
    deathFails: getNum((d.vitality as Record<string, unknown>).deathFails),
    saveProficiencies: {
      str: d.saves.str.isProf,
      dex: d.saves.dex.isProf,
      con: d.saves.con.isProf,
      int: d.saves.int.isProf,
      wis: d.saves.wis.isProf,
      cha: d.saves.cha.isProf,
    },
    skillProficiencies,
    attacks: readAttacks(d),
    cp: getNum((d.coins.cp as { value?: unknown })?.value),
    sp: getNum((d.coins.sp as { value?: unknown })?.value),
    ep: getNum((d.coins.ep as { value?: unknown })?.value),
    gp: getNum((d.coins.gp as { value?: unknown })?.value),
    pp: getNum((d.coins.pp as { value?: unknown })?.value),
    personality: getTextSection(d, "personality"),
    ideals: getTextSection(d, "ideals"),
    bonds: getTextSection(d, "bonds"),
    flaws: getTextSection(d, "flaws"),
    features: getTextSection(d, "features"),
    attacksText: getTextSection(d, "traits"),
    equipment: getTextSection(d, "equipment"),
    profLanguages: getTextSection(d, "prof"),
    backstory: getTextSection(d, "background"),
    allies: getTextSection(d, "allies"),
    goals: getTextSection(d, "quests"),
    treasures: getTextSection(d, "items"),
    additionalFeatures: getTextSection(d, "additional-features"),
    notes: [
      getTextSection(d, "notes-1"),
      getTextSection(d, "notes-2"),
      getTextSection(d, "notes-3"),
      getTextSection(d, "notes-4"),
      getTextSection(d, "notes-5"),
      getTextSection(d, "notes-6"),
    ],
    casterClass: d.casterClass.value,
    spellBaseAbility: namedVal(d.spellsInfo.base as { value?: unknown }),
    spellSaveDc: namedVal(d.spellsInfo.save as { value?: unknown }),
    spellAttackBonus: namedVal(d.spellsInfo.mod as { value?: unknown }),
    cantrips: getTextSection(d, "spells-level-0"),
    spellLevels,
  };
}

// ── Write helpers ─────────────────────────────────────────────────────────────

function setText(
  text: Record<string, unknown>,
  key: string,
  content: string
): void {
  const existing = (text[key] as Record<string, unknown> | undefined) ?? {};
  text[key] = { ...existing, value: createLssRichText(content, key) };
}

function setNamed(
  obj: Record<string, unknown> | undefined,
  value: string | number
): Record<string, unknown> {
  return { ...(obj ?? {}), value };
}

function setVitality(
  vitality: Record<string, unknown>,
  key: string,
  value: number | string
): void {
  const existing = (vitality[key] as Record<string, unknown> | undefined) ?? {};
  vitality[key] = { ...existing, value };
}

/**
 * Apply the edited SheetState back onto the original LSS data, preserving any
 * fields the sheet doesn't manage (avatar, weapons, unknown passthrough keys…).
 * Returns a new object; does not mutate the input.
 */
export function applySheetState(
  original: LssCharacterData,
  s: SheetState
): LssCharacterData {
  // Deep clone so we never mutate the caller's object.
  const d = structuredClone(original) as LssCharacterData;

  d.name = { ...d.name, value: s.characterName };

  d.info = {
    ...d.info,
    charClass: setNamed(d.info.charClass, s.charClass) as typeof d.info.charClass,
    background: setNamed(d.info.background, s.background) as typeof d.info.background,
    playerName: setNamed(d.info.playerName, s.playerName) as typeof d.info.playerName,
    race: setNamed(d.info.race, s.race) as typeof d.info.race,
    alignment: setNamed(d.info.alignment, s.alignment) as typeof d.info.alignment,
    experience: setNamed(
      d.info.experience,
      numericOrString(s.experience)
    ) as typeof d.info.experience,
    level: setNamed(d.info.level, Number(s.level) || 1) as typeof d.info.level,
  };

  d.subInfo = {
    ...d.subInfo,
    age: setNamed(d.subInfo.age, s.age) as (typeof d.subInfo)[string],
    height: setNamed(d.subInfo.height, s.height) as (typeof d.subInfo)[string],
    weight: setNamed(d.subInfo.weight, s.weight) as (typeof d.subInfo)[string],
  };

  // Stats — recompute modifier from the edited score.
  d.stats = {
    str: { ...d.stats.str, score: s.scores.str, modifier: mod(s.scores.str) },
    dex: { ...d.stats.dex, score: s.scores.dex, modifier: mod(s.scores.dex) },
    con: { ...d.stats.con, score: s.scores.con, modifier: mod(s.scores.con) },
    int: { ...d.stats.int, score: s.scores.int, modifier: mod(s.scores.int) },
    wis: { ...d.stats.wis, score: s.scores.wis, modifier: mod(s.scores.wis) },
    cha: { ...d.stats.cha, score: s.scores.cha, modifier: mod(s.scores.cha) },
  };

  d.proficiency = s.proficiency;

  // Saves — recompute bonus.
  d.saves = {
    str: saveOf(d.saves.str, "str"),
    dex: saveOf(d.saves.dex, "dex"),
    con: saveOf(d.saves.con, "con"),
    int: saveOf(d.saves.int, "int"),
    wis: saveOf(d.saves.wis, "wis"),
    cha: saveOf(d.saves.cha, "cha"),
  };
  function saveOf(orig: LssCharacterData["saves"]["str"], stat: StatKey) {
    const isProf = s.saveProficiencies[stat];
    return {
      ...orig,
      isProf,
      bonus: mod(s.scores[stat]) + (isProf ? s.proficiency : 0),
    };
  }

  // Skills — proficiency level only.
  const skills = { ...d.skills };
  for (const [key, skill] of Object.entries(skills)) {
    const isProf = s.skillProficiencies[key] ?? 0;
    skills[key] = { ...skill, isProf };
  }
  d.skills = skills;

  // Vitality.
  const vitality = { ...d.vitality } as Record<string, unknown>;
  setVitality(vitality, "ac", s.ac);
  setVitality(vitality, "speed", s.speed);
  setVitality(vitality, "hp-max", s.hpMax);
  setVitality(vitality, "hp-current", s.hpCurrent);
  setVitality(vitality, "hp-temp", s.hpTemp);
  setVitality(vitality, "hit-die", s.hitDie);
  setVitality(vitality, "hp-dice-current", s.hitDiceTotal);
  vitality.deathSuccesses = s.deathSuccesses;
  vitality.deathFails = s.deathFails;
  d.vitality = vitality;

  d.inspiration = s.inspiration;

  // Coins.
  const coins = { ...d.coins } as Record<string, unknown>;
  setVitality(coins, "cp", s.cp);
  setVitality(coins, "sp", s.sp);
  setVitality(coins, "ep", s.ep);
  setVitality(coins, "gp", s.gp);
  setVitality(coins, "pp", s.pp);
  d.coins = coins;

  // Caster info.
  d.casterClass = { ...d.casterClass, value: s.casterClass };
  const spellsInfo = { ...d.spellsInfo } as Record<string, unknown>;
  spellsInfo.base = setNamed(spellsInfo.base as Record<string, unknown>, s.spellBaseAbility);
  spellsInfo.save = setNamed(spellsInfo.save as Record<string, unknown>, s.spellSaveDc);
  spellsInfo.mod = setNamed(spellsInfo.mod as Record<string, unknown>, s.spellAttackBonus);
  d.spellsInfo = spellsInfo;

  // Spell slots.
  const spells = { ...d.spells } as Record<string, unknown>;
  s.spellLevels.forEach((sl, i) => {
    const key = `slots-${i + 1}`;
    const existing = (spells[key] as Record<string, unknown> | undefined) ?? {};
    spells[key] = { ...existing, value: sl.total };
  });
  d.spells = spells;

  // Text sections.
  const text = { ...d.text } as Record<string, unknown>;
  setText(text, "personality", s.personality);
  setText(text, "ideals", s.ideals);
  setText(text, "bonds", s.bonds);
  setText(text, "flaws", s.flaws);
  setText(text, "features", s.features);
  setText(text, "traits", s.attacksText);
  setText(text, "equipment", s.equipment);
  setText(text, "prof", s.profLanguages);
  setText(text, "background", s.backstory);
  setText(text, "allies", s.allies);
  setText(text, "quests", s.goals);
  setText(text, "items", s.treasures);
  setText(text, "additional-features", s.additionalFeatures);
  s.notes.forEach((note, i) => setText(text, `notes-${i + 1}`, note));
  setText(text, "spells-level-0", s.cantrips);
  s.spellLevels.forEach((sl, i) => setText(text, `spells-level-${i + 1}`, sl.spells));
  d.text = text;

  // Attack rows — stored in a passthrough field (not part of the LSS schema).
  (d as unknown as { sheetAttacks: AttackRow[] }).sheetAttacks = s.attacks;

  return d;
}

function numericOrString(value: string): string | number {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const n = Number(trimmed);
  return Number.isFinite(n) && String(n) === trimmed ? n : value;
}
