import { describe, it, expect } from "vitest";

import {
  applySheetState,
  parseSheetState,
} from "@/features/characters/lib/sheet-data";
import { KEILIN_LSS_DATA } from "@/tests/fixtures/keilin";

function ac(data: ReturnType<typeof applySheetState>): number {
  return (data.vitality.ac as { value: number }).value;
}

describe("sheet-data: applySheetState", () => {
  it("writes edited scalar fields back into the LSS data", () => {
    const state = parseSheetState(KEILIN_LSS_DATA);
    const next = applySheetState(KEILIN_LSS_DATA, {
      ...state,
      characterName: "Новое Имя",
      ac: 18,
      scores: { ...state.scores, str: 18 },
    });

    expect(next.name.value).toBe("Новое Имя");
    expect(ac(next)).toBe(18);
    expect(next.stats.str.score).toBe(18);
    expect(next.stats.str.modifier).toBe(4); // floor((18-10)/2)
  });

  it("round-trips through parse → apply → parse", () => {
    const state = parseSheetState(KEILIN_LSS_DATA);
    const edited = {
      ...state,
      characterName: "Кейлин II",
      ac: 15,
      scores: { ...state.scores, dex: 20 },
    };

    const reparsed = parseSheetState(applySheetState(KEILIN_LSS_DATA, edited));

    expect(reparsed.characterName).toBe("Кейлин II");
    expect(reparsed.ac).toBe(15);
    expect(reparsed.scores.dex).toBe(20);
  });

  it("round-trips text sections and notes", () => {
    const state = parseSheetState(KEILIN_LSS_DATA);
    const notes = [...state.notes] as typeof state.notes;
    notes[0] = "Заметка номер один";

    const edited = { ...state, backstory: "Совсем новая предыстория.", notes };
    const reparsed = parseSheetState(applySheetState(KEILIN_LSS_DATA, edited));

    expect(reparsed.backstory).toBe("Совсем новая предыстория.");
    expect(reparsed.notes[0]).toBe("Заметка номер один");
  });

  it("persists save proficiency and recomputes the bonus", () => {
    const state = parseSheetState(KEILIN_LSS_DATA);
    const next = applySheetState(KEILIN_LSS_DATA, {
      ...state,
      saveProficiencies: { ...state.saveProficiencies, str: true },
    });

    expect(next.saves.str.isProf).toBe(true);
    // STR 16 → +3, proficiency 2 → bonus 5
    expect(next.saves.str.bonus).toBe(5);
  });

  it("round-trips used spell slots", () => {
    const state = parseSheetState(KEILIN_LSS_DATA);
    const spellLevels = state.spellLevels.map((level) => ({ ...level }));
    spellLevels[0] = { ...spellLevels[0], total: 4, used: 2 };

    const reparsed = parseSheetState(
      applySheetState(KEILIN_LSS_DATA, { ...state, spellLevels })
    );

    expect(reparsed.spellLevels[0]).toMatchObject({ total: 4, used: 2 });
  });

  it("does not mutate the original data", () => {
    const before = JSON.stringify(KEILIN_LSS_DATA);
    const state = parseSheetState(KEILIN_LSS_DATA);
    applySheetState(KEILIN_LSS_DATA, { ...state, characterName: "Mutated?" });
    expect(JSON.stringify(KEILIN_LSS_DATA)).toBe(before);
  });
});
