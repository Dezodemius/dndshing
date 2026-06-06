"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useState } from "react";

import type { LssCharacterData } from "@/features/lss/schema";
import { extractPlainText } from "@/features/lss/rich-text";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

type AttackRow = { name: string; bonus: string; damage: string };

type SheetState = {
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

// ── Constants ─────────────────────────────────────────────────────────────────

const STAT_LABELS: Record<StatKey, string> = {
  str: "СИЛА",
  dex: "ЛОВКОСТЬ",
  con: "ТЕЛОСЛОЖЕНИЕ",
  int: "ИНТЕЛЛЕКТ",
  wis: "МУДРОСТЬ",
  cha: "ХАРИЗМА",
};

const STAT_SHORT: Record<StatKey, string> = {
  str: "Сил",
  dex: "Лов",
  con: "Тел",
  int: "Инт",
  wis: "Муд",
  cha: "Хар",
};

const STATS: StatKey[] = ["str", "dex", "con", "int", "wis", "cha"];

const SKILLS_LIST: Array<{ key: string; stat: StatKey; label: string }> = [
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
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

function parseInitialData(d: LssCharacterData): SheetState {
  const skillProficiencies: Record<string, 0 | 1 | 2> = {};
  for (const [key, skill] of Object.entries(d.skills)) {
    skillProficiencies[key] = ((skill.isProf ?? 0) as 0 | 1 | 2);
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
    attacks: [
      { name: "", bonus: "", damage: "" },
      { name: "", bonus: "", damage: "" },
      { name: "", bonus: "", damage: "" },
    ],
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
    goals: getTextSection(d, "ideals"),
    treasures: getTextSection(d, "items"),
    additionalFeatures: getTextSection(d, "features"),
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

// ── Micro-components ──────────────────────────────────────────────────────────

function FI({
  v,
  set,
  center,
  bold,
  size,
  placeholder,
  cls,
}: {
  v: string;
  set: (s: string) => void;
  center?: boolean;
  bold?: boolean;
  size?: string;
  placeholder?: string;
  cls?: string;
}) {
  return (
    <input
      type="text"
      value={v}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      className={[
        "bg-transparent border-0 border-b border-gray-400 focus:outline-none focus:border-gray-700 w-full",
        center ? "text-center" : "",
        bold ? "font-bold" : "",
        size ?? "text-[10px]",
        cls ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

function NI({
  v,
  set,
  cls,
}: {
  v: number;
  set: (n: number) => void;
  cls?: string;
}) {
  return (
    <input
      type="number"
      value={v}
      onChange={(e) => set(Number(e.target.value) || 0)}
      className={[
        "bg-transparent border-0 focus:outline-none text-center w-full",
        cls ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

function TA({
  v,
  set,
  rows,
  cls,
}: {
  v: string;
  set: (s: string) => void;
  rows: number;
  cls?: string;
}) {
  return (
    <textarea
      value={v}
      onChange={(e) => set(e.target.value)}
      rows={rows}
      className={[
        "bg-transparent border-0 focus:outline-none resize-none w-full leading-snug text-[9px]",
        cls ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

function SectionBox({
  label,
  children,
  cls,
}: {
  label: string;
  children: React.ReactNode;
  cls?: string;
}) {
  return (
    <div className={`border border-gray-400 rounded flex flex-col ${cls ?? ""}`}>
      <div className="flex-1 p-1 min-h-0">{children}</div>
      <div className="text-[6px] font-bold tracking-wider text-center border-t border-gray-300 py-0.5 uppercase">
        {label}
      </div>
    </div>
  );
}

function ProfDot({
  level,
  set,
}: {
  level: 0 | 1 | 2;
  set: (v: 0 | 1 | 2) => void;
}) {
  const icons = ["○", "●", "◉"];
  return (
    <button
      type="button"
      onClick={() => set(((level + 1) % 3) as 0 | 1 | 2)}
      className="text-[9px] leading-none select-none cursor-pointer shrink-0 w-3 text-center"
    >
      {icons[level]}
    </button>
  );
}

function CheckDot({ v, set }: { v: boolean; set: (b: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => set(!v)}
      className="text-[9px] leading-none select-none cursor-pointer shrink-0 w-3 text-center"
    >
      {v ? "●" : "○"}
    </button>
  );
}

function DeathCircles({
  count,
  set,
  max = 3,
}: {
  count: number;
  set: (n: number) => void;
  max?: number;
}) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => set(count === i + 1 ? i : i + 1)}
          className="text-[9px] leading-none select-none cursor-pointer"
        >
          {i < count ? "●" : "○"}
        </button>
      ))}
    </div>
  );
}

// ── Page 1 ────────────────────────────────────────────────────────────────────

function Page1({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  function skillBonus(key: string, stat: StatKey): number {
    return mod(s.scores[stat]) + (s.skillProficiencies[key] ?? 0) * s.proficiency;
  }
  function saveBonus(stat: StatKey): number {
    return mod(s.scores[stat]) + (s.saveProficiencies[stat] ? s.proficiency : 0);
  }
  const passiveWis =
    10 + skillBonus("perception", "wis");

  return (
    <div className="sheet-page flex flex-col gap-2">
      {/* ── Header ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "200px 1fr" }}>
        <div>
          <input
            type="text"
            value={s.characterName}
            onChange={(e) => upd({ characterName: e.target.value })}
            className="w-full bg-transparent border-0 border-b-2 border-gray-500 focus:outline-none font-bold text-2xl leading-tight"
          />
          <div className="text-[7px] text-gray-500 tracking-widest uppercase mt-0.5">
            Имя персонажа
          </div>
        </div>
        <div className="grid gap-x-4 gap-y-0" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {/* Row 1 */}
          <div>
            <FI v={s.charClass} set={(v) => upd({ charClass: v })} />
            <div className="text-[6px] text-gray-500 tracking-widest uppercase">Класс</div>
          </div>
          <div>
            <FI v={s.background} set={(v) => upd({ background: v })} />
            <div className="text-[6px] text-gray-500 tracking-widest uppercase">Предыстория</div>
          </div>
          <div>
            <FI v={s.playerName} set={(v) => upd({ playerName: v })} />
            <div className="text-[6px] text-gray-500 tracking-widest uppercase">Имя игрока</div>
          </div>
          {/* Row 2 */}
          <div>
            <FI v={s.race} set={(v) => upd({ race: v })} />
            <div className="text-[6px] text-gray-500 tracking-widest uppercase">Раса</div>
          </div>
          <div>
            <FI v={s.alignment} set={(v) => upd({ alignment: v })} />
            <div className="text-[6px] text-gray-500 tracking-widest uppercase">Мировоззрение</div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <FI v={s.experience} set={(v) => upd({ experience: v })} center />
              <div className="text-[6px] text-gray-500 tracking-widest uppercase text-center">Опыт</div>
            </div>
            <div className="w-10">
              <FI v={s.level} set={(v) => upd({ level: v })} center bold />
              <div className="text-[6px] text-gray-500 tracking-widest uppercase text-center">Уровень</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* ── Left column ── */}
        <div style={{ width: 195 }} className="flex gap-1.5 shrink-0">
          {/* Ability score pills */}
          <div className="flex flex-col gap-1.5">
            {STATS.map((stat) => (
              <div
                key={stat}
                className="flex flex-col items-center rounded-lg border border-gray-400 bg-gray-50"
                style={{ width: 54, paddingTop: 3, paddingBottom: 2 }}
              >
                <div className="text-[6px] font-bold tracking-wider text-center leading-none">
                  {STAT_LABELS[stat]}
                </div>
                <div className="text-xl font-bold leading-none mt-0.5">
                  {fmtMod(mod(s.scores[stat]))}
                </div>
                <div
                  className="border border-gray-400 rounded-full flex items-center justify-center mt-0.5"
                  style={{ width: 28, height: 28 }}
                >
                  <NI
                    v={s.scores[stat]}
                    set={(n) => upd({ scores: { ...s.scores, [stat]: n } })}
                    cls="text-[10px] font-semibold"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Saves / Skills / Passive / Languages */}
          <div className="flex-1 flex flex-col gap-1.5">
            {/* Inspiration */}
            <div className="flex items-center gap-1 border border-gray-400 rounded px-1.5 py-1">
              <CheckDot v={s.inspiration} set={(v) => upd({ inspiration: v })} />
              <div className="text-[7px] font-bold tracking-wider flex-1 text-center uppercase">
                Вдохновение
              </div>
            </div>

            {/* Proficiency */}
            <div className="flex items-center gap-1 border border-gray-400 rounded px-1.5 py-1">
              <div className="text-[11px] font-bold">{fmtMod(s.proficiency)}</div>
              <div className="text-[7px] font-bold tracking-wider flex-1 uppercase leading-tight">
                Бонус владения
              </div>
            </div>

            {/* Saving throws */}
            <SectionBox label="Спасброски" cls="flex-none">
              {STATS.map((stat) => (
                <div key={stat} className="flex items-center gap-1 py-0.5">
                  <CheckDot
                    v={s.saveProficiencies[stat]}
                    set={(v) =>
                      upd({ saveProficiencies: { ...s.saveProficiencies, [stat]: v } })
                    }
                  />
                  <span className="text-[9px] w-6 text-right shrink-0">
                    {fmtMod(saveBonus(stat))}
                  </span>
                  <span className="text-[9px] leading-none">{STAT_LABELS[stat].charAt(0) + STAT_LABELS[stat].slice(1).toLowerCase()}</span>
                </div>
              ))}
            </SectionBox>

            {/* Skills */}
            <SectionBox label="Навыки" cls="flex-1">
              {SKILLS_LIST.map(({ key, stat, label }) => (
                <div key={key} className="flex items-center gap-1 py-px">
                  <ProfDot
                    level={s.skillProficiencies[key] ?? 0}
                    set={(v) =>
                      upd({ skillProficiencies: { ...s.skillProficiencies, [key]: v } })
                    }
                  />
                  <span className="text-[9px] w-6 text-right shrink-0">
                    {fmtMod(skillBonus(key, stat))}
                  </span>
                  <span className="text-[9px] leading-none truncate">
                    {label}{" "}
                    <span className="text-gray-400">({STAT_SHORT[stat]})</span>
                  </span>
                </div>
              ))}
            </SectionBox>

            {/* Passive wisdom */}
            <div className="flex items-center gap-1.5 border border-gray-400 rounded px-1.5 py-1">
              <div className="text-[12px] font-bold shrink-0">{passiveWis}</div>
              <div className="text-[7px] font-bold tracking-wider uppercase leading-tight">
                Пассивная мудрость (Восприятие)
              </div>
            </div>

            {/* Languages */}
            <SectionBox label="Прочие владения и языки" cls="flex-1">
              <TA v={s.profLanguages} set={(v) => upd({ profLanguages: v })} rows={5} />
            </SectionBox>
          </div>
        </div>

        {/* ── Middle column ── */}
        <div className="flex flex-col gap-1.5" style={{ width: 220 }}>
          {/* AC / Initiative / Speed */}
          <div className="flex gap-1.5">
            <div className="flex flex-col items-center border border-gray-400 rounded" style={{ width: 58 }}>
              <div className="text-[6px] font-bold tracking-wider uppercase text-center mt-1">КЗ</div>
              <NI v={s.ac} set={(v) => upd({ ac: v })} cls="text-xl font-bold" />
            </div>
            <div className="flex flex-col items-center border border-gray-400 rounded flex-1">
              <div className="text-[6px] font-bold tracking-wider uppercase text-center mt-1">Инициатива</div>
              <div className="text-xl font-bold text-center">{fmtMod(mod(s.scores.dex))}</div>
            </div>
            <div className="flex flex-col items-center border border-gray-400 rounded flex-1">
              <div className="text-[6px] font-bold tracking-wider uppercase text-center mt-1">Скорость</div>
              <NI v={s.speed} set={(v) => upd({ speed: v })} cls="text-xl font-bold" />
            </div>
          </div>

          {/* HP max */}
          <div className="border border-gray-400 rounded px-2 py-1">
            <div className="flex items-center gap-1">
              <div className="text-[8px] text-gray-500">Максимум хитов</div>
              <NI v={s.hpMax} set={(v) => upd({ hpMax: v })} cls="text-[10px] font-semibold w-12" />
            </div>
            <NI v={s.hpCurrent} set={(v) => upd({ hpCurrent: v })} cls="text-2xl font-bold w-full" />
            <div className="text-[6px] font-bold tracking-wider uppercase text-center border-t border-gray-300 mt-1 pt-0.5">
              Текущие хиты
            </div>
          </div>

          {/* Temp HP */}
          <SectionBox label="Временные хиты">
            <NI v={s.hpTemp} set={(v) => upd({ hpTemp: v })} cls="text-xl font-bold w-full" />
          </SectionBox>

          {/* Hit dice + Death saves */}
          <div className="flex gap-1.5">
            <SectionBox label="Кость хитов" cls="flex-1">
              <div className="text-[8px] text-gray-500">
                Всего: {s.hitDiceTotal}
              </div>
              <div className="text-center">
                <input
                  type="text"
                  value={s.hitDie}
                  onChange={(e) => upd({ hitDie: e.target.value })}
                  className="bg-transparent border-0 focus:outline-none text-center font-bold text-xl w-full"
                />
              </div>
            </SectionBox>
            <SectionBox label="Спасброски от смерти" cls="flex-1">
              <div className="flex flex-col gap-1 p-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="text-[8px] w-12">Успехи</div>
                  <DeathCircles
                    count={s.deathSuccesses}
                    set={(v) => upd({ deathSuccesses: v })}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="text-[8px] w-12">Провалы</div>
                  <DeathCircles
                    count={s.deathFails}
                    set={(v) => upd({ deathFails: v })}
                  />
                </div>
              </div>
            </SectionBox>
          </div>

          {/* Attacks */}
          <SectionBox label="Атаки и заклинания" cls="flex-none">
            <div className="grid text-[7px] font-bold text-gray-500 pb-0.5 border-b border-gray-300"
              style={{ gridTemplateColumns: "1fr 54px 54px" }}>
              <div>Название</div>
              <div className="text-center">Бонус</div>
              <div className="text-center">Урон/Вид</div>
            </div>
            {s.attacks.map((atk, i) => (
              <div key={i} className="grid py-0.5 border-b border-gray-200"
                style={{ gridTemplateColumns: "1fr 54px 54px" }}>
                <FI
                  v={atk.name}
                  set={(v) => {
                    const attacks = [...s.attacks];
                    attacks[i] = { ...atk, name: v };
                    upd({ attacks });
                  }}
                  cls="border-0 border-b-0"
                />
                <FI
                  v={atk.bonus}
                  set={(v) => {
                    const attacks = [...s.attacks];
                    attacks[i] = { ...atk, bonus: v };
                    upd({ attacks });
                  }}
                  center
                  cls="border-0 border-b-0"
                />
                <FI
                  v={atk.damage}
                  set={(v) => {
                    const attacks = [...s.attacks];
                    attacks[i] = { ...atk, damage: v };
                    upd({ attacks });
                  }}
                  center
                  cls="border-0 border-b-0"
                />
              </div>
            ))}
            <TA v={s.attacksText} set={(v) => upd({ attacksText: v })} rows={3} cls="mt-1" />
          </SectionBox>

          {/* Coins */}
          <div className="flex gap-1">
            {(["cp", "sp", "ep", "gp", "pp"] as const).map((coin, i) => (
              <div key={coin} className="flex-1 flex flex-col items-center border border-gray-400 rounded py-1">
                <NI
                  v={s[coin]}
                  set={(v) => upd({ [coin]: v })}
                  cls="text-[10px] font-bold w-full"
                />
                <div className="text-[6px] font-bold uppercase tracking-wide">
                  {["ММ", "СМ", "ЭМ", "ЗМ", "ПМ"][i]}
                </div>
              </div>
            ))}
          </div>

          {/* Equipment */}
          <SectionBox label="Снаряжение" cls="flex-1">
            <TA v={s.equipment} set={(v) => upd({ equipment: v })} rows={8} />
          </SectionBox>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-1.5 flex-1">
          <SectionBox label="Черты характера" cls="flex-none">
            <TA v={s.personality} set={(v) => upd({ personality: v })} rows={4} />
          </SectionBox>
          <SectionBox label="Идеалы" cls="flex-none">
            <TA v={s.ideals} set={(v) => upd({ ideals: v })} rows={3} />
          </SectionBox>
          <SectionBox label="Привязанности" cls="flex-none">
            <TA v={s.bonds} set={(v) => upd({ bonds: v })} rows={3} />
          </SectionBox>
          <SectionBox label="Слабости" cls="flex-none">
            <TA v={s.flaws} set={(v) => upd({ flaws: v })} rows={3} />
          </SectionBox>
          <SectionBox label="Умения и способности" cls="flex-1">
            <TA v={s.features} set={(v) => upd({ features: v })} rows={12} />
          </SectionBox>
        </div>
      </div>
    </div>
  );
}

// ── Page 2 ────────────────────────────────────────────────────────────────────

function Page2({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  return (
    <div className="sheet-page flex flex-col gap-2">
      {/* Header */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "200px 1fr" }}>
        <div>
          <input
            type="text"
            value={s.characterName}
            onChange={(e) => upd({ characterName: e.target.value })}
            className="w-full bg-transparent border-0 border-b-2 border-gray-500 focus:outline-none font-bold text-2xl leading-tight"
          />
          <div className="text-[7px] text-gray-500 tracking-widest uppercase mt-0.5">
            Имя персонажа
          </div>
        </div>
        <div className="flex gap-6 items-end">
          <div className="flex-1">
            <FI v={s.age} set={(v) => upd({ age: v })} center />
            <div className="text-[6px] text-gray-500 tracking-widest uppercase text-center">Возраст</div>
          </div>
          <div className="flex-1">
            <FI v={s.height} set={(v) => upd({ height: v })} center />
            <div className="text-[6px] text-gray-500 tracking-widest uppercase text-center">Рост</div>
          </div>
          <div className="flex-1">
            <FI v={s.weight} set={(v) => upd({ weight: v })} center />
            <div className="text-[6px] text-gray-500 tracking-widest uppercase text-center">Вес</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex flex-col gap-2" style={{ width: 220 }}>
          <SectionBox label="Портрет персонажа" cls="flex-1">
            <div className="h-full min-h-[200px] flex items-center justify-center text-[9px] text-gray-300">
              Место для портрета
            </div>
          </SectionBox>
          <SectionBox label="Предыстория персонажа" cls="flex-1">
            <TA v={s.backstory} set={(v) => upd({ backstory: v })} rows={10} />
          </SectionBox>
          <SectionBox label="Цели и задачи" cls="flex-1">
            <TA v={s.goals} set={(v) => upd({ goals: v })} rows={8} />
          </SectionBox>
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <SectionBox label="Союзники и организации" cls="flex-1">
            <TA v={s.allies} set={(v) => upd({ allies: v })} rows={12} />
          </SectionBox>
          <SectionBox label="Дополнительные способности и умения" cls="flex-1">
            <TA v={s.additionalFeatures} set={(v) => upd({ additionalFeatures: v })} rows={12} />
          </SectionBox>
          <SectionBox label="Сокровища" cls="flex-1">
            <TA v={s.treasures} set={(v) => upd({ treasures: v })} rows={8} />
          </SectionBox>
        </div>
      </div>
    </div>
  );
}

// ── Page 3 ────────────────────────────────────────────────────────────────────

function Page3({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  return (
    <div className="sheet-page flex flex-col gap-2">
      {/* Header */}
      <div>
        <input
          type="text"
          value={s.characterName}
          onChange={(e) => upd({ characterName: e.target.value })}
          className="w-full max-w-[200px] bg-transparent border-0 border-b-2 border-gray-500 focus:outline-none font-bold text-2xl leading-tight"
        />
        <div className="text-[7px] text-gray-500 tracking-widest uppercase mt-0.5">
          Имя персонажа
        </div>
      </div>

      <div className="grid gap-2 flex-1" style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr 1fr" }}>
        {s.notes.map((note, i) => (
          <SectionBox key={i} label="Заметки" cls="flex-1">
            <TA v={note} set={(v) => {
              const notes = [...s.notes] as SheetState["notes"];
              notes[i] = v;
              upd({ notes });
            }} rows={10} />
          </SectionBox>
        ))}
      </div>
    </div>
  );
}

// ── Page 4 ────────────────────────────────────────────────────────────────────


function Page4({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  return (
    <div className="sheet-page flex flex-col gap-2">
      {/* Header */}
      <div className="flex gap-4 border-b border-gray-400 pb-2">
        <div className="flex-1">
          <FI v={s.casterClass} set={(v) => upd({ casterClass: v })} />
          <div className="text-[6px] text-gray-500 tracking-widest uppercase">Класс заклинателя</div>
        </div>
        <div className="w-28">
          <FI v={s.spellBaseAbility} set={(v) => upd({ spellBaseAbility: v })} center />
          <div className="text-[6px] text-gray-500 tracking-widest uppercase text-center">Базовая характеристика</div>
        </div>
        <div className="w-20">
          <FI v={s.spellSaveDc} set={(v) => upd({ spellSaveDc: v })} center />
          <div className="text-[6px] text-gray-500 tracking-widest uppercase text-center">СЛ спасброска</div>
        </div>
        <div className="w-20">
          <FI v={s.spellAttackBonus} set={(v) => upd({ spellAttackBonus: v })} center />
          <div className="text-[6px] text-gray-500 tracking-widest uppercase text-center">Бонус атаки</div>
        </div>
      </div>

      {/* Spell grid: cantrips left, levels 1-9 in 3 columns */}
      <div className="flex gap-3 flex-1">
        {/* Cantrips */}
        <div className="flex flex-col gap-1" style={{ width: 160 }}>
          <SectionBox label="0 — Заговоры" cls="flex-none">
            <TA v={s.cantrips} set={(v) => upd({ cantrips: v })} rows={14} />
          </SectionBox>
        </div>

        {/* Levels 1-9 */}
        <div className="grid gap-2 flex-1" style={{ gridTemplateColumns: "1fr 1fr", gridAutoRows: "min-content" }}>
          {s.spellLevels.map((sl, i) => {
            const level = i + 1;
            return (
              <div key={i} className="border border-gray-400 rounded flex flex-col">
                {/* Slot header */}
                <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-300">
                  <div className="text-sm font-bold w-4">{level}</div>
                  <div className="flex-1 flex items-center gap-1 text-[8px] text-gray-500">
                    Ячеек:
                    <NI
                      v={sl.total}
                      set={(v) => {
                        const spellLevels = [...s.spellLevels];
                        spellLevels[i] = { ...sl, total: v };
                        upd({ spellLevels });
                      }}
                      cls="w-8 text-[10px] font-bold"
                    />
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: Math.max(sl.total, 0) }).map((_, j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => {
                          const spellLevels = [...s.spellLevels];
                          spellLevels[i] = {
                            ...sl,
                            used: sl.used === j + 1 ? j : j + 1,
                          };
                          upd({ spellLevels });
                        }}
                        className="text-[9px] leading-none cursor-pointer"
                      >
                        {j < sl.used ? "●" : "○"}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Spell list */}
                <div className="flex-1 p-1">
                  <TA
                    v={sl.spells}
                    set={(v) => {
                      const spellLevels = [...s.spellLevels];
                      spellLevels[i] = { ...sl, spells: v };
                      upd({ spellLevels });
                    }}
                    rows={5}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CharacterSheet({
  initialData,
  characterId,
}: {
  initialData: LssCharacterData;
  characterId: string;
  folderId: string;
}) {
  const [s, setS] = useState<SheetState>(() => parseInitialData(initialData));

  function upd(patch: Partial<SheetState>) {
    setS((prev) => ({ ...prev, ...patch }));
  }

  return (
    <>
      <style>{`
        .sheet-page {
          width: 794px;
          min-height: 1122px;
          padding: 32px 36px;
          background: white;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          line-height: 1.3;
          box-sizing: border-box;
        }
        @media print {
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .print-wrapper {
            background: white !important;
            padding: 0 !important;
          }
          .sheet-page {
            width: 210mm;
            min-height: 297mm;
            padding: 10mm 12mm;
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print -mx-4 -mt-8 mb-6 flex items-center gap-3 bg-gray-100 border-b px-6 py-3 sticky top-0 z-10">
        <Link
          href={`/characters/${characterId}`}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <div className="text-sm font-semibold flex-1">{s.characterName}</div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          <Printer className="h-4 w-4" />
          Печать / Скачать PDF
        </button>
      </div>

      {/* Pages */}
      <div className="print-wrapper -mx-4 bg-gray-200 px-4 pb-8 space-y-8">
        <div className="sheet-page shadow-lg mx-auto">
          <Page1 s={s} upd={upd} />
        </div>
        <div className="sheet-page shadow-lg mx-auto">
          <Page2 s={s} upd={upd} />
        </div>
        <div className="sheet-page shadow-lg mx-auto">
          <Page3 s={s} upd={upd} />
        </div>
        <div className="sheet-page shadow-lg mx-auto">
          <Page4 s={s} upd={upd} />
        </div>
      </div>
    </>
  );
}
