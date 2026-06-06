"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, Printer, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import type { LssCharacterData } from "@/features/lss/schema";
import {
  parseSheetState,
  STATS,
  type SheetState,
  type StatKey,
} from "@/features/characters/lib/sheet-data";
import {
  deleteCharacterAction,
  saveCharacterSheetAction,
} from "@/features/characters/actions";

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
        "bg-transparent border-0 border-b border-gray-400 focus:outline-none focus:border-gray-700 w-full overflow-hidden text-ellipsis whitespace-nowrap",
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
        "bg-transparent border-0 focus:outline-none text-center w-full p-0 leading-none",
        cls ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

// A textarea that always fills its container and never scrolls — overflow is
// clipped so the printed sheet matches the screen exactly (WYSIWYG).
function TA({
  v,
  set,
  cls,
}: {
  v: string;
  set: (s: string) => void;
  cls?: string;
}) {
  return (
    <textarea
      value={v}
      onChange={(e) => set(e.target.value)}
      className={[
        "bg-transparent border-0 focus:outline-none resize-none block w-full h-full flex-1 min-h-0 leading-snug text-[9px] overflow-hidden",
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
    <div
      className={`border border-gray-400 rounded flex flex-col min-h-0 overflow-hidden ${cls ?? ""}`}
    >
      <div className="flex-1 min-h-0 p-1 flex flex-col">{children}</div>
      <div className="text-[6px] font-bold tracking-wider text-center border-t border-gray-300 py-0.5 uppercase shrink-0">
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

function NameHeader({
  s,
  upd,
  maxWidth,
}: {
  s: SheetState;
  upd: (patch: Partial<SheetState>) => void;
  maxWidth?: number;
}) {
  return (
    <div style={maxWidth ? { maxWidth } : undefined}>
      <input
        type="text"
        value={s.characterName}
        onChange={(e) => upd({ characterName: e.target.value })}
        className="w-full bg-transparent border-0 border-b-2 border-gray-500 focus:outline-none font-bold text-2xl leading-tight overflow-hidden text-ellipsis whitespace-nowrap"
      />
      <div className="text-[7px] text-gray-500 tracking-widest uppercase mt-0.5">
        Имя персонажа
      </div>
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
  const passiveWis = 10 + skillBonus("perception", "wis");

  return (
    <div className="h-full flex flex-col gap-2">
      {/* ── Header ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(200px, 260px) 1fr" }}>
        <NameHeader s={s} upd={upd} />
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
        <div style={{ width: 195 }} className="flex gap-1.5 shrink-0 min-h-0">
          {/* Ability score pills */}
          <div className="flex flex-col gap-1.5 shrink-0">
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
                  className="border border-gray-400 rounded-full flex items-center justify-center mt-0.5 bg-white"
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
          <div className="flex-1 flex flex-col gap-1.5 min-h-0 min-w-0">
            {/* Inspiration */}
            <div className="flex items-center gap-1 border border-gray-400 rounded px-1.5 py-1 shrink-0">
              <CheckDot v={s.inspiration} set={(v) => upd({ inspiration: v })} />
              <div className="text-[7px] font-bold tracking-wider flex-1 text-center uppercase">
                Вдохновение
              </div>
            </div>

            {/* Proficiency */}
            <div className="flex items-center gap-1 border border-gray-400 rounded px-1.5 py-1 shrink-0">
              <div className="text-[11px] font-bold">{fmtMod(s.proficiency)}</div>
              <div className="text-[7px] font-bold tracking-wider flex-1 uppercase leading-tight">
                Бонус владения
              </div>
            </div>

            {/* Saving throws */}
            <SectionBox label="Спасброски" cls="shrink-0">
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
                  <span className="text-[9px] leading-none">
                    {STAT_LABELS[stat].charAt(0) + STAT_LABELS[stat].slice(1).toLowerCase()}
                  </span>
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
                    {label} <span className="text-gray-400">({STAT_SHORT[stat]})</span>
                  </span>
                </div>
              ))}
            </SectionBox>

            {/* Passive wisdom */}
            <div className="flex items-center gap-1.5 border border-gray-400 rounded px-1.5 py-1 shrink-0">
              <div className="text-[12px] font-bold shrink-0">{passiveWis}</div>
              <div className="text-[7px] font-bold tracking-wider uppercase leading-tight">
                Пассивная мудрость (Восприятие)
              </div>
            </div>

            {/* Languages */}
            <SectionBox label="Прочие владения и языки" cls="shrink-0 h-24">
              <TA v={s.profLanguages} set={(v) => upd({ profLanguages: v })} />
            </SectionBox>
          </div>
        </div>

        {/* ── Middle column ── */}
        <div className="flex flex-col gap-1.5 min-h-0" style={{ width: 220 }}>
          {/* AC / Initiative / Speed */}
          <div className="flex gap-1.5 shrink-0">
            <div className="flex flex-col items-center border border-gray-400 rounded pb-1" style={{ width: 58 }}>
              <div className="text-[6px] font-bold tracking-wider uppercase text-center mt-1">КЗ</div>
              <NI v={s.ac} set={(v) => upd({ ac: v })} cls="text-xl font-bold" />
            </div>
            <div className="flex flex-col items-center border border-gray-400 rounded flex-1 pb-1">
              <div className="text-[6px] font-bold tracking-wider uppercase text-center mt-1">Инициатива</div>
              <div className="text-xl font-bold text-center">{fmtMod(mod(s.scores.dex))}</div>
            </div>
            <div className="flex flex-col items-center border border-gray-400 rounded flex-1 pb-1">
              <div className="text-[6px] font-bold tracking-wider uppercase text-center mt-1">Скорость</div>
              <NI v={s.speed} set={(v) => upd({ speed: v })} cls="text-xl font-bold" />
            </div>
          </div>

          {/* HP max */}
          <div className="border border-gray-400 rounded px-2 py-1 shrink-0">
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
          <SectionBox label="Временные хиты" cls="shrink-0">
            <NI v={s.hpTemp} set={(v) => upd({ hpTemp: v })} cls="text-xl font-bold w-full" />
          </SectionBox>

          {/* Hit dice + Death saves */}
          <div className="flex gap-1.5 shrink-0">
            <SectionBox label="Кость хитов" cls="flex-1">
              <div className="text-[8px] text-gray-500">Всего: {s.hitDiceTotal}</div>
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
                  <DeathCircles count={s.deathFails} set={(v) => upd({ deathFails: v })} />
                </div>
              </div>
            </SectionBox>
          </div>

          {/* Attacks */}
          <SectionBox label="Атаки и заклинания" cls="shrink-0 h-28">
            <div
              className="grid text-[7px] font-bold text-gray-500 pb-0.5 border-b border-gray-300 shrink-0"
              style={{ gridTemplateColumns: "1fr 54px 54px" }}
            >
              <div>Название</div>
              <div className="text-center">Бонус</div>
              <div className="text-center">Урон/Вид</div>
            </div>
            {s.attacks.map((atk, i) => (
              <div
                key={i}
                className="grid py-0.5 border-b border-gray-200 shrink-0"
                style={{ gridTemplateColumns: "1fr 54px 54px" }}
              >
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
            <TA v={s.attacksText} set={(v) => upd({ attacksText: v })} cls="mt-1" />
          </SectionBox>

          {/* Coins */}
          <div className="flex gap-1 shrink-0">
            {(["cp", "sp", "ep", "gp", "pp"] as const).map((coin, i) => (
              <div key={coin} className="flex-1 flex flex-col items-center border border-gray-400 rounded py-1">
                <NI v={s[coin]} set={(v) => upd({ [coin]: v })} cls="text-[10px] font-bold w-full" />
                <div className="text-[6px] font-bold uppercase tracking-wide">
                  {["ММ", "СМ", "ЭМ", "ЗМ", "ПМ"][i]}
                </div>
              </div>
            ))}
          </div>

          {/* Equipment */}
          <SectionBox label="Снаряжение" cls="flex-1">
            <TA v={s.equipment} set={(v) => upd({ equipment: v })} />
          </SectionBox>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-1.5 flex-1 min-h-0 min-w-0">
          <SectionBox label="Черты характера" cls="shrink-0 h-20">
            <TA v={s.personality} set={(v) => upd({ personality: v })} />
          </SectionBox>
          <SectionBox label="Идеалы" cls="shrink-0 h-16">
            <TA v={s.ideals} set={(v) => upd({ ideals: v })} />
          </SectionBox>
          <SectionBox label="Привязанности" cls="shrink-0 h-16">
            <TA v={s.bonds} set={(v) => upd({ bonds: v })} />
          </SectionBox>
          <SectionBox label="Слабости" cls="shrink-0 h-16">
            <TA v={s.flaws} set={(v) => upd({ flaws: v })} />
          </SectionBox>
          <SectionBox label="Умения и способности" cls="flex-1">
            <TA v={s.features} set={(v) => upd({ features: v })} />
          </SectionBox>
        </div>
      </div>
    </div>
  );
}

// ── Page 2 ────────────────────────────────────────────────────────────────────

function Page2({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(200px, 260px) 1fr" }}>
        <NameHeader s={s} upd={upd} />
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
        <div className="flex flex-col gap-2 min-h-0" style={{ width: 220 }}>
          <SectionBox label="Портрет персонажа" cls="flex-1">
            <div className="h-full flex items-center justify-center text-[9px] text-gray-300">
              Место для портрета
            </div>
          </SectionBox>
          <SectionBox label="Предыстория персонажа" cls="flex-1">
            <TA v={s.backstory} set={(v) => upd({ backstory: v })} />
          </SectionBox>
          <SectionBox label="Цели и задачи" cls="flex-1">
            <TA v={s.goals} set={(v) => upd({ goals: v })} />
          </SectionBox>
        </div>
        <div className="flex flex-col gap-2 flex-1 min-h-0 min-w-0">
          <SectionBox label="Союзники и организации" cls="flex-1">
            <TA v={s.allies} set={(v) => upd({ allies: v })} />
          </SectionBox>
          <SectionBox label="Дополнительные способности и умения" cls="flex-1">
            <TA v={s.additionalFeatures} set={(v) => upd({ additionalFeatures: v })} />
          </SectionBox>
          <SectionBox label="Сокровища" cls="flex-1">
            <TA v={s.treasures} set={(v) => upd({ treasures: v })} />
          </SectionBox>
        </div>
      </div>
    </div>
  );
}

// ── Page 3 ────────────────────────────────────────────────────────────────────

function Page3({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header */}
      <NameHeader s={s} upd={upd} maxWidth={200} />

      <div
        className="grid gap-2 flex-1 min-h-0"
        style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr 1fr" }}
      >
        {s.notes.map((note, i) => (
          <SectionBox key={i} label="Заметки" cls="h-full">
            <TA
              v={note}
              set={(v) => {
                const notes = [...s.notes] as SheetState["notes"];
                notes[i] = v;
                upd({ notes });
              }}
            />
          </SectionBox>
        ))}
      </div>
    </div>
  );
}

// ── Page 4 ────────────────────────────────────────────────────────────────────

function Page4({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header */}
      <div className="flex gap-4 border-b border-gray-400 pb-2 shrink-0">
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

      {/* Spell grid: cantrips left, levels 1-9 in 2 columns */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Cantrips */}
        <div className="flex flex-col gap-1 shrink-0" style={{ width: 160 }}>
          <SectionBox label="0 — Заговоры" cls="flex-1">
            <TA v={s.cantrips} set={(v) => upd({ cantrips: v })} />
          </SectionBox>
        </div>

        {/* Levels 1-9 */}
        <div
          className="grid gap-2 flex-1 min-h-0 min-w-0"
          style={{ gridTemplateColumns: "1fr 1fr", gridAutoRows: "1fr" }}
        >
          {s.spellLevels.map((sl, i) => {
            const level = i + 1;
            return (
              <div key={i} className="border border-gray-400 rounded flex flex-col min-h-0 overflow-hidden">
                {/* Slot header */}
                <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-300 shrink-0">
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
                  <div className="flex gap-0.5 flex-wrap">
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
                <div className="flex-1 min-h-0 p-1 flex flex-col">
                  <TA
                    v={sl.spells}
                    set={(v) => {
                      const spellLevels = [...s.spellLevels];
                      spellLevels[i] = { ...sl, spells: v };
                      upd({ spellLevels });
                    }}
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
  const [s, setS] = useState<SheetState>(() => parseSheetState(initialData));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  function upd(patch: Partial<SheetState>) {
    setSavedAt(null);
    setS((prev) => ({ ...prev, ...patch }));
  }

  function handleSave() {
    setError(null);
    startSave(async () => {
      try {
        await saveCharacterSheetAction(characterId, s);
        setSavedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось сохранить");
      }
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        "Удалить персонажа? Лист и сгенерированный JSON будут удалены безвозвратно."
      )
    ) {
      return;
    }
    setError(null);
    startDelete(async () => {
      try {
        await deleteCharacterAction(characterId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось удалить");
      }
    });
  }

  return (
    <>
      <style>{`
        .sheet-page {
          width: 794px;
          height: 1122px;
          padding: 28px 32px;
          background: white;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          line-height: 1.3;
          box-sizing: border-box;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        /* Centre ability scores and other numeric fields — hide spin buttons */
        .sheet-page input[type=number]::-webkit-inner-spin-button,
        .sheet-page input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .sheet-page input[type=number] {
          -moz-appearance: textfield;
          appearance: textfield;
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
            height: 297mm;
            padding: 10mm 12mm;
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
            overflow: hidden;
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
        <div className="text-sm font-semibold flex-1 truncate">{s.characterName}</div>

        {error ? <span className="text-xs text-red-600">{error}</span> : null}
        {savedAt && !isSaving ? (
          <span className="text-xs text-emerald-600">Сохранено</span>
        ) : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isDeleting}
          className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" />
          Печать / PDF
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isSaving || isDeleting}
          className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Удалить
        </button>
      </div>

      {/* Pages — each .sheet-page is exactly A4; inner Page components fill via h-full */}
      <div className="print-wrapper -mx-4 bg-gray-200 px-4 pb-8 space-y-8">
        <div className="sheet-page shadow-lg mx-auto" data-page="1">
          <Page1 s={s} upd={upd} />
        </div>
        <div className="sheet-page shadow-lg mx-auto" data-page="2">
          <Page2 s={s} upd={upd} />
        </div>
        <div className="sheet-page shadow-lg mx-auto" data-page="3">
          <Page3 s={s} upd={upd} />
        </div>
        <div className="sheet-page shadow-lg mx-auto" data-page="4">
          <Page4 s={s} upd={upd} />
        </div>
      </div>
    </>
  );
}
