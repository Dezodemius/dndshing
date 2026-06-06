import { describe, it, expect } from "vitest";
import {
  abilityModifier,
  formatModifier,
  skillBonus,
  saveBonus,
  passivePerception,
} from "@/features/characters/lib/sheet-utils";

describe("abilityModifier", () => {
  it("score 10 → +0", () => expect(abilityModifier(10)).toBe(0));
  it("score 11 → +0", () => expect(abilityModifier(11)).toBe(0));
  it("score 12 → +1", () => expect(abilityModifier(12)).toBe(1));
  it("score 16 → +3", () => expect(abilityModifier(16)).toBe(3));
  it("score 8  → −1", () => expect(abilityModifier(8)).toBe(-1));
  it("score 20 → +5", () => expect(abilityModifier(20)).toBe(5));
  it("score 1  → −5", () => expect(abilityModifier(1)).toBe(-5));
});

describe("formatModifier", () => {
  it("positive → '+3'", () => expect(formatModifier(3)).toBe("+3"));
  it("zero     → '+0'", () => expect(formatModifier(0)).toBe("+0"));
  it("negative → '−1'", () => expect(formatModifier(-1)).toBe("-1"));
});

describe("skillBonus", () => {
  it("no proficiency: returns stat mod only", () =>
    expect(skillBonus(0, 3, 2)).toBe(3));
  it("proficiency: stat mod + proficiency bonus", () =>
    expect(skillBonus(1, 3, 2)).toBe(5));
  it("expertise: stat mod + 2× proficiency", () =>
    expect(skillBonus(2, 3, 2)).toBe(7));
  it("negative stat mod without proficiency", () =>
    expect(skillBonus(0, -1, 2)).toBe(-1));
  it("negative stat mod with proficiency", () =>
    expect(skillBonus(1, -1, 2)).toBe(1));
});

describe("saveBonus", () => {
  it("not proficient: returns stat mod only", () =>
    expect(saveBonus(false, 3, 2)).toBe(3));
  it("proficient: stat mod + proficiency bonus", () =>
    expect(saveBonus(true, 3, 2)).toBe(5));
  it("negative stat, proficient", () =>
    expect(saveBonus(true, -1, 2)).toBe(1));
});

describe("passivePerception", () => {
  // 10 + WIS mod (+1) + 0 prof = 11 (matches the reference sheet)
  it("Кейлин: WIS +1, no perception prof → 11", () =>
    expect(passivePerception(1, 0, 2)).toBe(11));
  it("WIS +2, proficient → 10 + 2 + 2 = 14", () =>
    expect(passivePerception(2, 1, 2)).toBe(14));
  it("WIS +0, expertise → 10 + 0 + 4 = 14", () =>
    expect(passivePerception(0, 2, 2)).toBe(14));
});

// ── Кейлин Даркхэвен reference values ─────────────────────────────────────────

describe("Кейлин Даркхэвен — ability modifiers (reference)", () => {
  const scores = { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 8 };

  it("STR 16 → +3", () => expect(abilityModifier(scores.str)).toBe(3));
  it("DEX 12 → +1", () => expect(abilityModifier(scores.dex)).toBe(1));
  it("CON 14 → +2", () => expect(abilityModifier(scores.con)).toBe(2));
  it("INT 10 → +0", () => expect(abilityModifier(scores.int)).toBe(0));
  it("WIS 13 → +1", () => expect(abilityModifier(scores.wis)).toBe(1));
  it("CHA  8 → −1", () => expect(abilityModifier(scores.cha)).toBe(-1));
});

describe("Кейлин — saving throws (reference)", () => {
  const proficiency = 2;
  const mods = { str: 3, dex: 1, con: 2, int: 0, wis: 1, cha: -1 };

  it("STR save (not prof) = +3", () =>
    expect(saveBonus(false, mods.str, proficiency)).toBe(3));
  it("WIS save (proficient) = +3",  () =>
    expect(saveBonus(true, mods.wis, proficiency)).toBe(3));
  it("CHA save (proficient) = +1", () =>
    expect(saveBonus(true, mods.cha, proficiency)).toBe(1));
});

describe("Кейлин — skill bonuses (reference)", () => {
  const proficiency = 2;
  const mods = { str: 3, dex: 1, con: 2, int: 0, wis: 1, cha: -1 };

  it("Акробатика DEX not prof = +1", () =>
    expect(skillBonus(0, mods.dex, proficiency)).toBe(1));
  it("Атлетика   STR not prof = +3", () =>
    expect(skillBonus(0, mods.str, proficiency)).toBe(3));
  it("Выступление CHA not prof = −1", () =>
    expect(skillBonus(0, mods.cha, proficiency)).toBe(-1));
  it("Passive wisdom (WIS+1, no prof) = 11", () =>
    expect(passivePerception(mods.wis, 0, proficiency)).toBe(11));
});
