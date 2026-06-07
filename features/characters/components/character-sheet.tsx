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
  str: "Сила",
  dex: "Ловкость",
  con: "Телосложение",
  int: "Интеллект",
  wis: "Мудрость",
  cha: "Харизма",
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
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

// ── Micro-components ──────────────────────────────────────────────────────────

// Header field: input with a small label underneath (LSS char-sheet__info-box).
function Field({
  v,
  set,
  label,
  number,
  big,
  cls,
}: {
  v: string;
  set: (s: string) => void;
  label: string;
  number?: boolean;
  big?: boolean;
  cls?: string;
}) {
  return (
    <div className={`cs-field ${cls ?? ""}`}>
      <input
        type={number ? "number" : "text"}
        value={v}
        onChange={(e) => set(e.target.value)}
        className={`cs-field__input ${big ? "cs-field__input--big" : ""}`}
      />
      <span className="cs-field__label">{label}</span>
    </div>
  );
}

// Number input used inside boxes (AC, speed, HP, coins…).
function NumInput({
  v,
  set,
  cls,
  ariaLabel,
}: {
  v: number;
  set: (n: number) => void;
  cls?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      value={v === 0 ? "" : v}
      onChange={(e) => set(Number(e.target.value) || 0)}
      className={`cs-numinput ${cls ?? ""}`}
      aria-label={ariaLabel}
    />
  );
}

// Lined-paper text block with font-size controls and a bottom label (LSS).
function TextBlock({
  v,
  set,
  label,
  grow,
  minHeight,
}: {
  v: string;
  set: (s: string) => void;
  label: string;
  grow?: boolean;
  minHeight?: number;
}) {
  const [fs, setFs] = useState(8);
  const lh = Math.round(fs * 1.6);
  return (
    <div className={`cs-textblock ${grow ? "cs-textblock--grow" : ""}`}>
      <div className="cs-textblock__area-wrap" style={minHeight ? { minHeight } : undefined}>
        <textarea
          value={v}
          onChange={(e) => set(e.target.value)}
          className="cs-textblock__area"
          style={{
            fontSize: `${fs}px`,
            lineHeight: `${lh}px`,
            backgroundImage: `repeating-linear-gradient(#fff 0, #fff ${lh - 1}px, #dadada ${lh - 1}px, #dadada ${lh}px)`,
          }}
        />
      </div>
      <div className="cs-textblock__controls no-print">
        <span className="cs-textblock__fs">{fs}</span>
        <button type="button" onClick={() => setFs((f) => Math.min(f + 1, 16))}>+</button>
        <button type="button" onClick={() => setFs((f) => Math.max(f - 1, 6))}>−</button>
      </div>
      <div className="cs-label cs-textblock__label">{label}</div>
    </div>
  );
}

function CheckDot({ v, set }: { v: boolean; set: (b: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => set(!v)}
      className={`cs-checkdot ${v ? "cs-checkdot--on" : ""}`}
      aria-pressed={v}
    />
  );
}

function ProfDot({
  level,
  set,
}: {
  level: 0 | 1 | 2;
  set: (v: 0 | 1 | 2) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => set(((level + 1) % 3) as 0 | 1 | 2)}
      className={`cs-checkdot ${level === 1 ? "cs-checkdot--on" : ""} ${level === 2 ? "cs-checkdot--exp" : ""}`}
      title={["нет", "владение", "компетентность"][level]}
    />
  );
}

function DeathRow({
  label,
  count,
  set,
}: {
  label: string;
  count: number;
  set: (n: number) => void;
}) {
  return (
    <div className="cs-death__row">
      <span className="cs-death__label">{label}</span>
      <div className="cs-death__dots">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => set(count === i + 1 ? i : i + 1)}
            className={`cs-checkdot cs-checkdot--sm ${i < count ? "cs-checkdot--on" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

function StatBlock({
  stat,
  score,
  set,
}: {
  stat: StatKey;
  score: number;
  set: (n: number) => void;
}) {
  return (
    <div className="cs-stat">
      <span className="cs-stat__label">{STAT_LABELS[stat]}</span>
      <span className="cs-stat__mod">{fmtMod(mod(score))}</span>
      <span className="cs-stat__score">
        <NumInput v={score} set={set} cls="cs-stat__score-input" />
      </span>
    </div>
  );
}

function Footer({ text }: { text: string }) {
  return (
    <p className="cs-undertext">
      {text}{" "}
      <a
        className="cs-undertext__link"
        href="https://longstoryshort.app/"
        target="_blank"
        rel="nofollow noopener noreferrer"
      >
        Long Story Short
      </a>{" "}
      <span className="cs-undertext__url">(https://longstoryshort.app/)</span>
    </p>
  );
}

function NameHeader({
  s,
  upd,
}: {
  s: SheetState;
  upd: (patch: Partial<SheetState>) => void;
}) {
  return (
    <h1 className="cs-name">
      <input
        name="name"
        type="text"
        className="cs-name__input"
        value={s.characterName}
        onChange={(e) => upd({ characterName: e.target.value })}
      />
      <span className="cs-field__label">Имя персонажа</span>
    </h1>
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
    <>
      {/* Header */}
      <header className="cs-header">
        <NameHeader s={s} upd={upd} />
        <div className="cs-info">
          <div className="cs-info__row">
            <Field v={s.charClass} set={(v) => upd({ charClass: v })} label="класс" />
            <Field v={s.background} set={(v) => upd({ background: v })} label="предыстория" />
            <Field v={s.playerName} set={(v) => upd({ playerName: v })} label="имя игрока" />
          </div>
          <div className="cs-info__row">
            <Field v={s.race} set={(v) => upd({ race: v })} label="раса" />
            <Field v={s.alignment} set={(v) => upd({ alignment: v })} label="мировоззрение" />
            <Field v={s.experience} set={(v) => upd({ experience: v })} label="опыт" />
            <Field v={s.level} set={(v) => upd({ level: v })} label="уровень" cls="cs-field--xs" />
          </div>
        </div>
      </header>

      {/* Body */}
      <section className="cs-body">
        {/* ── Column 1: stats + skills ── */}
        <div className="cs-col">
          <div className="cs-stats-skills">
            <div className="cs-stats">
              {STATS.map((stat) => (
                <StatBlock
                  key={stat}
                  stat={stat}
                  score={s.scores[stat]}
                  set={(n) => upd({ scores: { ...s.scores, [stat]: n } })}
                />
              ))}
            </div>

            <div className="cs-skills">
              <div className="cs-modblock">
                <span className="cs-modblock__marker cs-modblock__marker--square">
                  <CheckDot v={s.inspiration} set={(v) => upd({ inspiration: v })} />
                </span>
                <span className="cs-modblock__label">вдохновение</span>
              </div>

              <div className="cs-modblock">
                <button
                  type="button"
                  className="cs-modblock__btn no-print"
                  onClick={() => upd({ proficiency: s.proficiency + 1 })}
                >
                  +
                </button>
                <span className="cs-modblock__marker cs-modblock__marker--round">
                  {fmtMod(s.proficiency)}
                </span>
                <button
                  type="button"
                  className="cs-modblock__btn no-print"
                  onClick={() => upd({ proficiency: Math.max(s.proficiency - 1, 0) })}
                >
                  −
                </button>
                <span className="cs-modblock__label">Бонус владения</span>
              </div>

              {/* Saving throws */}
              <div className="cs-saves">
                {STATS.map((stat) => (
                  <div key={stat} className="cs-skill">
                    <CheckDot
                      v={s.saveProficiencies[stat]}
                      set={(v) =>
                        upd({ saveProficiencies: { ...s.saveProficiencies, [stat]: v } })
                      }
                    />
                    <span className="cs-skill__mod">{fmtMod(saveBonus(stat))}</span>
                    <span className="cs-skill__label">{STAT_LABELS[stat]}</span>
                  </div>
                ))}
                <span className="cs-label cs-label--centered">Спасброски</span>
              </div>

              {/* Skills */}
              <div className="cs-saves">
                {SKILLS_LIST.map(({ key, stat, label }) => (
                  <div key={key} className="cs-skill cs-skill--sm">
                    <ProfDot
                      level={s.skillProficiencies[key] ?? 0}
                      set={(v) =>
                        upd({ skillProficiencies: { ...s.skillProficiencies, [key]: v } })
                      }
                    />
                    <span className="cs-skill__mod">{fmtMod(skillBonus(key, stat))}</span>
                    <span className="cs-skill__label">
                      {label} <span className="cs-skill__base">({STAT_SHORT[stat]})</span>
                    </span>
                  </div>
                ))}
                <span className="cs-label cs-label--centered">Навыки</span>
              </div>
            </div>
          </div>

          <div className="cs-modblock cs-modblock--passive" aria-label="Пассивная мудрость">
            <span className="cs-modblock__marker cs-modblock__marker--ellipsis">{passiveWis}</span>
            <span className="cs-modblock__label">пассивная мудрость (Восприятие)</span>
          </div>

          <TextBlock
            v={s.profLanguages}
            set={(v) => upd({ profLanguages: v })}
            label="Прочие владения и языки"
            grow
          />
        </div>

        {/* ── Column 2: vitality + attacks + equipment ── */}
        <div className="cs-col">
          <div className="cs-vitality">
            <div className="cs-vit-box cs-vit-box--shield">
              <svg className="cs-shield" viewBox="0 0 48 60" fill="none" aria-hidden="true">
                <path
                  d="M23.8494 0.802124L1.86096 12.5092V36.2236L9.39125 50.3321L23.8494 59.0374L38.0063 50.3321L46.139 36.2236V12.5092L23.8494 0.802124Z"
                  fill="#fff"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              </svg>
              <span className="cs-label cs-shield__kz">КЗ</span>
              <NumInput v={s.ac} set={(v) => upd({ ac: v })} cls="cs-shield__input" />
            </div>
            <div className="cs-vit-box">
              <span className="cs-vit-box__value">{fmtMod(mod(s.scores.dex))}</span>
              <span className="cs-label cs-vit-box__label">Инициатива</span>
            </div>
            <div className="cs-vit-box">
              <NumInput v={s.speed} set={(v) => upd({ speed: v })} cls="cs-vit-box__value" />
              <span className="cs-label cs-vit-box__label">Скорость</span>
            </div>

            <div className="cs-vit-hp">
              <label className="cs-vit-hp__max">
                Максимум хитов
                <NumInput v={s.hpMax} set={(v) => upd({ hpMax: v })} cls="cs-vit-hp__max-input" />
              </label>
              <NumInput v={s.hpCurrent} set={(v) => upd({ hpCurrent: v })} cls="cs-vit-hp__cur" />
              <span className="cs-label cs-vit-hp__label">Текущие хиты</span>
            </div>

            <div className="cs-vit-hp cs-vit-hp--temp">
              <NumInput v={s.hpTemp} set={(v) => upd({ hpTemp: v })} cls="cs-vit-hp__cur" />
              <span className="cs-label cs-vit-hp__label">Временные хиты</span>
            </div>

            <div className="cs-vit-medium">
              <label className="cs-vit-hp__max">
                Всего
                <input
                  type="text"
                  value={s.hitDiceTotal}
                  onChange={(e) => upd({ hitDiceTotal: Number(e.target.value) || 0 })}
                  className="cs-vit-hp__max-input"
                />
              </label>
              <input
                type="text"
                value={s.hitDie}
                onChange={(e) => upd({ hitDie: e.target.value })}
                className="cs-vit-die"
              />
              <span className="cs-label cs-vit-box__label">Кость хитов</span>
            </div>

            <div className="cs-vit-medium">
              <div className="cs-death">
                <DeathRow label="Успехи" count={s.deathSuccesses} set={(v) => upd({ deathSuccesses: v })} />
                <DeathRow label="Провалы" count={s.deathFails} set={(v) => upd({ deathFails: v })} />
              </div>
              <span className="cs-label cs-vit-box__label">Спасброски от смерти</span>
            </div>
          </div>

          {/* Attacks */}
          <div className="cs-attacks">
            <div className="cs-weapons">
              <div className="cs-weapons__row cs-weapons__row--head">
                <span>название</span>
                <span>Бонус атаки</span>
                <span>урон / вид</span>
              </div>
              {s.attacks.map((atk, i) => (
                <div key={i} className="cs-weapons__row">
                  <input
                    className="cs-weapons__cell"
                    value={atk.name}
                    onChange={(e) => {
                      const attacks = [...s.attacks];
                      attacks[i] = { ...atk, name: e.target.value };
                      upd({ attacks });
                    }}
                  />
                  <input
                    className="cs-weapons__cell cs-weapons__cell--c"
                    value={atk.bonus}
                    onChange={(e) => {
                      const attacks = [...s.attacks];
                      attacks[i] = { ...atk, bonus: e.target.value };
                      upd({ attacks });
                    }}
                  />
                  <input
                    className="cs-weapons__cell cs-weapons__cell--c"
                    value={atk.damage}
                    onChange={(e) => {
                      const attacks = [...s.attacks];
                      attacks[i] = { ...atk, damage: e.target.value };
                      upd({ attacks });
                    }}
                  />
                </div>
              ))}
            </div>
            <TextBlock
              v={s.attacksText}
              set={(v) => upd({ attacksText: v })}
              label="Атаки и заклинания"
              minHeight={48}
            />
          </div>

          {/* Coins + equipment */}
          <div className="cs-coins">
            {(
              [
                ["cp", "мм"],
                ["sp", "см"],
                ["gp", "зм"],
                ["ep", "эм"],
                ["pp", "пм"],
              ] as const
            ).map(([coin, label]) => (
              <div key={coin} className="cs-coin">
                <span className="cs-coin__label">{label}</span>
                <NumInput v={s[coin]} set={(v) => upd({ [coin]: v })} cls="cs-coin__input" />
              </div>
            ))}
          </div>
          <TextBlock v={s.equipment} set={(v) => upd({ equipment: v })} label="Снаряжение" grow />
        </div>

        {/* ── Column 3: personality ── */}
        <div className="cs-col">
          <TextBlock v={s.personality} set={(v) => upd({ personality: v })} label="Черты характера" minHeight={72} />
          <TextBlock v={s.ideals} set={(v) => upd({ ideals: v })} label="Идеалы" minHeight={56} />
          <TextBlock v={s.bonds} set={(v) => upd({ bonds: v })} label="Привязанности" minHeight={56} />
          <TextBlock v={s.flaws} set={(v) => upd({ flaws: v })} label="Слабости" minHeight={56} />
          <TextBlock v={s.features} set={(v) => upd({ features: v })} label="Умения и способности" grow />
        </div>
      </section>

      <Footer text="Удачных приключений!" />
    </>
  );
}

// ── Page 2 ────────────────────────────────────────────────────────────────────

function Page2({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  return (
    <>
      <header className="cs-header">
        <NameHeader s={s} upd={upd} />
        <div className="cs-info">
          <div className="cs-info__row">
            <Field v={s.age} set={(v) => upd({ age: v })} label="возраст" />
            <Field v={s.height} set={(v) => upd({ height: v })} label="рост" />
            <Field v={s.weight} set={(v) => upd({ weight: v })} label="вес" />
          </div>
        </div>
      </header>

      <section className="cs-body">
        <div className="cs-col">
          <div className="cs-avatar" aria-label="Портрет персонажа" />
          <TextBlock v={s.backstory} set={(v) => upd({ backstory: v })} label="Предыстория персонажа" grow />
          <TextBlock v={s.goals} set={(v) => upd({ goals: v })} label="Цели и задачи" grow />
        </div>
        <div className="cs-col cs-col--wide">
          <TextBlock v={s.allies} set={(v) => upd({ allies: v })} label="Союзники и организации" grow />
          <TextBlock
            v={s.additionalFeatures}
            set={(v) => upd({ additionalFeatures: v })}
            label="Дополнительные способности и умения"
            grow
          />
          <TextBlock v={s.treasures} set={(v) => upd({ treasures: v })} label="Сокровища" grow />
        </div>
      </section>

      <Footer text="С тобой моя к10. И моя к8. И моя к12!" />
    </>
  );
}

// ── Page 3 ────────────────────────────────────────────────────────────────────

function Page3({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  return (
    <>
      <header className="cs-header cs-header--notes">
        <NameHeader s={s} upd={upd} />
      </header>

      <section className="cs-body cs-body--notes">
        {s.notes.map((note, i) => (
          <TextBlock
            key={i}
            v={note}
            set={(v) => {
              const notes = [...s.notes] as SheetState["notes"];
              notes[i] = v;
              upd({ notes });
            }}
            label="Заметки"
            grow
          />
        ))}
      </section>

      <Footer text="Записывай, не то забудешь!" />
    </>
  );
}

// ── Page 4 ────────────────────────────────────────────────────────────────────

function SpellSection({
  levelIdx,
  sl,
  onChange,
}: {
  levelIdx: number;
  sl: SheetState["spellLevels"][number];
  onChange: (updated: SheetState["spellLevels"][number]) => void;
}) {
  const level = levelIdx + 1;
  const spellRows = level >= 6 ? 8 : 13;
  const visibleSlots = Math.min(Math.max(sl.total, 0), 20);

  function setTotal(value: number) {
    const total = Math.min(Math.max(value, 0), 20);
    onChange({ ...sl, total, used: Math.min(sl.used, total) });
  }

  return (
    <div className="cs-spell-section cs-spell-section--grow">
      <div className="cs-spell-section__head">
        <span className="cs-spell-section__num">{level}</span>
        <span className="cs-spell-section__slots" aria-label={`Ячейки ${level} уровня`}>
          <NumInput
            v={sl.total}
            set={setTotal}
            cls="cs-spell-section__slots-input"
            ariaLabel={`Количество ячеек ${level} уровня`}
          />
          <span className="cs-spell-section__slot-dots">
            {Array.from({ length: visibleSlots }).map((_, slotIdx) => (
              <button
                key={slotIdx}
                type="button"
                className={`cs-checkdot cs-checkdot--sm ${slotIdx < sl.used ? "cs-checkdot--on" : ""}`}
                aria-label={`Ячейка ${slotIdx + 1} из ${visibleSlots}, ${level} уровень`}
                aria-pressed={slotIdx < sl.used}
                onClick={() =>
                  onChange({
                    ...sl,
                    used: sl.used === slotIdx + 1 ? slotIdx : slotIdx + 1,
                  })
                }
              />
            ))}
          </span>
        </span>
      </div>
      <div className="cs-spell-section__body">
        <span className="cs-spell-section__prepared" aria-hidden="true">
          {Array.from({ length: spellRows }).map((_, row) => (
            <i key={row} />
          ))}
        </span>
        <TextBlock
          v={sl.spells}
          set={(v) => onChange({ ...sl, spells: v })}
          label=""
        />
      </div>
    </div>
  );
}

function Page4({ s, upd }: { s: SheetState; upd: (patch: Partial<SheetState>) => void }) {
  function updLevel(i: number, updated: SheetState["spellLevels"][number]) {
    const spellLevels = [...s.spellLevels];
    spellLevels[i] = updated;
    upd({ spellLevels });
  }

  return (
    <>
      <header className="cs-header cs-header--spells">
        <Field v={s.casterClass} set={(v) => upd({ casterClass: v })} label="Класс заклинателя" cls="cs-field--grow" />
        <Field v={s.spellBaseAbility} set={(v) => upd({ spellBaseAbility: v })} label="Базовая характеристика" />
        <Field v={s.spellSaveDc} set={(v) => upd({ spellSaveDc: v })} label="СЛ спасброска" />
        <Field v={s.spellAttackBonus} set={(v) => upd({ spellAttackBonus: v })} label="Бонус атаки заклинаний" />
      </header>

      {/* 3-column WotC-style spell layout */}
      <section className="cs-body cs-body--spells">
        {/* Column 1: Cantrips + levels 1–2 */}
        <div className="cs-spell-col">
          <div className="cs-spell-section cs-spell-section--grow cs-spell-section--cantrips">
            <div className="cs-spell-section__head">
              <span className="cs-spell-section__num">0</span>
              <span className="cs-spell-section__title">Заговоры</span>
            </div>
            <TextBlock v={s.cantrips} set={(v) => upd({ cantrips: v })} label="" />
          </div>
          {s.spellLevels.slice(0, 2).map((sl, i) => (
            <SpellSection key={i} levelIdx={i} sl={sl} onChange={(u) => updLevel(i, u)} />
          ))}
        </div>

        {/* Column 2: levels 3–5 */}
        <div className="cs-spell-col">
          {s.spellLevels.slice(2, 5).map((sl, i) => (
            <SpellSection key={i + 2} levelIdx={i + 2} sl={sl} onChange={(u) => updLevel(i + 2, u)} />
          ))}
        </div>

        {/* Column 3: levels 6–9 */}
        <div className="cs-spell-col">
          {s.spellLevels.slice(5, 9).map((sl, i) => (
            <SpellSection key={i + 5} levelIdx={i + 5} sl={sl} onChange={(u) => updLevel(i + 5, u)} />
          ))}
        </div>
      </section>

      <Footer text="Магия — это просто математика с блёстками." />
    </>
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
      <style>{SHEET_CSS}</style>

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

      {/* Pages */}
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

// ── Styles (mirrors the longstoryshort.app character sheet) ─────────────────────

const SHEET_CSS = `
.sheet-page {
  width: 794px;
  height: 1122px;
  padding: 39px 47px 53px;
  background: #fff;
  color: #1a1a1a;
  font-family: "PT Sans", Arial, Helvetica, sans-serif;
  font-size: 10px;
  line-height: 1.25;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet-page * { box-sizing: border-box; }
.sheet-page input,
.sheet-page textarea { color: inherit; font-family: inherit; }
.sheet-page input:focus,
.sheet-page textarea:focus { outline: none; }
.sheet-page input[type=number]::-webkit-inner-spin-button,
.sheet-page input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.sheet-page input[type=number] { -moz-appearance: textfield; appearance: textfield; }
.cs-numinput { border: none; background: transparent; padding: 0; }

/* ── Header ── */
.cs-header { display: flex; gap: 10px; align-items: flex-end; padding-bottom: 2px; margin-bottom: 21px; }
.cs-header--notes { }
.cs-header--spells { display: grid; grid-template-columns: 1.75fr repeat(3, 1fr); gap: 28px; align-items: start; border: none; border-radius: 0; padding: 0; }
.cs-name { margin: 0 0 2px; flex: 0 0 auto; width: 226px; position: relative; }
.cs-name__input { width: 100%; border: none; border-bottom: 2px solid #1a1a1a; background: transparent; font-family: Georgia, "Times New Roman", serif; font-size: 20px; font-weight: 700; line-height: 1.1; padding: 0 0 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-info { flex: 1; display: flex; flex-direction: column; gap: 7px; border: 1.5px solid #1a1a1a; border-radius: 8px; padding: 8px 16px 6px; }
.cs-info__row { display: flex; gap: 22px; }
.cs-field { flex: 1; position: relative; display: flex; flex-direction: column; }
.cs-field--xs { flex: 0 0 50px; }
.cs-field--grow { flex: 1; }
.cs-field__input { width: 100%; border: none; border-bottom: 1px solid #b5b5b5; background: transparent; font-size: 15px; padding: 0 2px 1px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-field__input--big { font-size: 16px; font-weight: 700; }
.cs-field__label, .cs-name .cs-field__label { font-size: 7px; letter-spacing: .06em; text-transform: uppercase; color: #777; text-align: left; margin-top: 2px; }
.cs-header--spells .cs-field__input { height: 29px; border: 1.5px solid #1a1a1a; border-radius: 3px; text-align: center; }
.cs-header--spells .cs-field--grow .cs-field__input { border: none; border-bottom: 1.5px solid #1a1a1a; border-radius: 0; text-align: left; }
.cs-header--spells .cs-field__label { text-align: center; }
.cs-header--spells .cs-field--grow .cs-field__label { text-align: left; }

/* ── Body grid ── */
.cs-body { flex: 1; min-height: 0; display: flex; gap: 8px; }
.cs-col { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.cs-col--wide { flex: 1.25; }
.sheet-page[data-page="1"] .cs-info { min-height: 90px; }
.sheet-page[data-page="1"] .cs-name { align-self: center; transform: translateY(10px); }
.sheet-page[data-page="1"] .cs-stats-skills { flex: 0 0 575px; min-height: 0; }
.sheet-page[data-page="1"] .cs-stat { flex: none; }
.sheet-page[data-page="1"] .cs-skills > .cs-saves { flex: 1; display: flex; flex-direction: column; }
.sheet-page[data-page="1"] .cs-skills > .cs-saves:last-child { flex: 2.4; }
.sheet-page[data-page="1"] .cs-saves .cs-skill { flex: 1; }
.sheet-page[data-page="1"] .cs-vitality { flex: 0 0 316px; }
.sheet-page[data-page="1"] .cs-attacks { flex: 0 0 250px; }
.sheet-page[data-page="1"] .cs-attacks .cs-textblock { flex: 1; min-height: 0; }
.sheet-page[data-page="2"] { padding-top: 48px; }
.sheet-page[data-page="2"] .cs-header { margin-bottom: 28px; }
.sheet-page[data-page="2"] .cs-info { min-height: 72px; justify-content: center; }
.sheet-page[data-page="2"] .cs-col--wide { flex: 2; }
.sheet-page[data-page="2"] .cs-avatar { flex: 1; min-height: 0; }
.sheet-page[data-page="3"] { padding-top: 76px; }
.sheet-page[data-page="3"] .cs-header { margin-bottom: 24px; }

/* ── Stats + skills ── */
.cs-stats-skills { display: flex; gap: 6px; }
.cs-stats { display: flex; flex-direction: column; align-self: flex-start; gap: 6px; flex: 0 0 auto; background: #ededed; border-radius: 26px; padding: 8px 5px; }
.cs-stat { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 54px; aspect-ratio: 3 / 4; border: 1px solid #8a8a8a; border-radius: 7px; background: #fff; padding: 3px 0; }
.cs-stat__label { font-size: 6px; font-weight: 700; text-transform: uppercase; line-height: 1; text-align: center; }
.cs-stat__mod { font-size: 19px; font-weight: 700; line-height: 1.1; }
.cs-stat__score { width: 26px; height: 26px; border: 1px solid #8a8a8a; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; margin-top: 1px; overflow: hidden; }
.cs-stat__score-input { width: 100%; font-size: 11px; font-weight: 600; text-align: center; }

.cs-skills { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.cs-modblock { display: flex; align-items: center; gap: 5px; border: 1px solid #8a8a8a; border-radius: 5px; padding: 2px 6px; }
.cs-modblock--passive { margin-top: 2px; }
.cs-modblock__marker { display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex: 0 0 auto; }
.cs-modblock__marker--square { width: 22px; height: 22px; border: 1px solid #8a8a8a; border-radius: 3px; display: grid; place-items: center; line-height: 0; }
.cs-modblock__marker--square .cs-checkdot { width: 13px; height: 13px; margin: 0; }
.cs-modblock__marker--round { width: 22px; height: 22px; border: 1px solid #8a8a8a; border-radius: 50%; }
.cs-modblock__marker--ellipsis { min-width: 18px; font-size: 13px; }
.cs-modblock__label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; line-height: 1.1; flex: 1; }
.cs-modblock__btn { width: 12px; height: 14px; border: none; background: transparent; cursor: pointer; font-size: 11px; line-height: 1; color: #888; padding: 0; }

.cs-saves { border: 1px solid #8a8a8a; border-radius: 5px; padding: 3px 5px 2px; position: relative; }
.cs-skill { display: flex; align-items: center; gap: 4px; padding: 0.5px 0; }
.cs-skill__mod { width: 18px; text-align: center; font-size: 9px; flex: 0 0 auto; }
.cs-skill__label { font-size: 9px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs-skill--sm .cs-skill__label { font-size: 8.5px; }
.cs-skill__base { color: #999; }

.cs-checkdot { width: 11px; height: 11px; border: 1.3px solid #555; border-radius: 50%; background: #fff; cursor: pointer; flex: 0 0 auto; padding: 0; position: relative; }
.cs-checkdot--on { background: #333; }
.cs-checkdot--exp { background: #333; box-shadow: inset 0 0 0 2px #fff; }
.cs-checkdot--sm { width: 9px; height: 9px; }

.cs-label { font-size: 6.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #444; }
.cs-label--centered { display: block; text-align: center; margin-top: 2px; }

/* ── Lined text block ── */
.cs-textblock { display: flex; flex-direction: column; border: 1px solid #8a8a8a; border-radius: 5px; overflow: hidden; }
.cs-textblock--grow { flex: 1; min-height: 0; }
.cs-textblock__area-wrap { flex: 1; min-height: 0; padding: 2px 4px; display: flex; }
.cs-textblock__area { width: 100%; height: 100%; resize: none; border: none; background-color: transparent; padding: 0; overflow: hidden; display: block; }
.cs-textblock__controls { display: flex; align-items: center; justify-content: flex-end; gap: 3px; padding: 0 4px; }
.cs-textblock__controls button { width: 12px; height: 12px; border: none; background: transparent; cursor: pointer; color: #999; font-size: 11px; line-height: 1; padding: 0; }
.cs-textblock__fs { font-size: 7px; color: #aaa; margin-right: 2px; }
.cs-textblock__label { text-align: center; border-top: 1px solid #d8d8d8; padding: 1px 0; }

/* ── Vitality ── */
.cs-vitality { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; background: #ededed; border-radius: 12px; padding: 8px; }
.cs-vit-box { grid-column: span 2; border: 1px solid #8a8a8a; border-radius: 6px; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px 2px 3px; position: relative; min-height: 50px; }
.cs-vit-box__value { font-size: 19px; font-weight: 700; text-align: center; border: none; background: transparent; width: 100%; }
.cs-vit-box__label { margin-top: auto; text-align: center; }
.cs-vit-box--shield { border: none; background: transparent; justify-content: flex-start; }
.cs-shield { position: absolute; inset: 0; width: 100%; height: 100%; color: #1a1a1a; }
.cs-shield__kz { position: relative; z-index: 1; margin-top: 7px; font-size: 7px; }
.cs-shield__input { position: relative; z-index: 1; width: 100%; font-size: 17px; font-weight: 700; text-align: center; }

.cs-vit-hp { grid-column: 1 / -1; border: 1px solid #8a8a8a; border-radius: 6px; background: #fff; padding: 3px 8px 2px; display: flex; flex-direction: column; }
.cs-vit-hp--temp { }
.cs-vit-hp__max { font-size: 8px; color: #666; display: flex; align-items: center; gap: 6px; }
.cs-vit-hp__max-input { width: 46px; border: none; border-bottom: 1px solid #bbb; background: transparent; text-align: center; font-size: 11px; font-weight: 600; }
.cs-vit-hp__cur { font-size: 22px; font-weight: 700; text-align: center; border: none; background: transparent; width: 100%; }
.cs-vit-hp__label { text-align: center; border-top: 1px solid #d8d8d8; padding-top: 1px; margin-top: 1px; }

.cs-vitality .cs-vit-medium { grid-column: span 3; border: 1px solid #8a8a8a; border-radius: 6px; background: #fff; padding: 3px 6px 2px; display: flex; flex-direction: column; }
.cs-vit-die { width: 100%; text-align: center; font-size: 17px; font-weight: 700; border: none; background: transparent; }

.cs-death { display: flex; flex-direction: column; gap: 3px; padding: 2px 0; }
.cs-death__row { display: flex; align-items: center; gap: 6px; }
.cs-death__label { font-size: 8px; width: 42px; }
.cs-death__dots { display: flex; gap: 3px; }

/* ── Attacks / weapons ── */
.cs-attacks { display: flex; flex-direction: column; gap: 3px; }
.cs-weapons { border: 1px solid #8a8a8a; border-radius: 5px; padding: 2px 4px; }
.cs-weapons__row { display: grid; grid-template-columns: 1fr 50px 52px; gap: 2px; align-items: center; }
.cs-weapons__row--head { font-size: 6.5px; font-weight: 700; text-transform: uppercase; color: #777; border-bottom: 1px solid #ccc; padding-bottom: 1px; text-align: center; }
.cs-weapons__row--head span:first-child { text-align: left; }
.cs-weapons__cell { border: none; border-bottom: 1px solid #e3e3e3; background: transparent; font-size: 9px; padding: 1px 2px; }
.cs-weapons__cell--c { text-align: center; }

/* ── Coins ── */
.cs-coins { display: flex; gap: 4px; }
.cs-coin { flex: 1; border: 1px solid #8a8a8a; border-radius: 5px; display: flex; flex-direction: column; align-items: center; padding: 2px 0; }
.cs-coin__label { font-size: 6.5px; font-weight: 700; text-transform: uppercase; }
.cs-coin__input { font-size: 11px; font-weight: 700; text-align: center; border: none; background: transparent; width: 100%; }

/* ── Page 2 ── */
.cs-avatar { border: 1px solid #8a8a8a; border-radius: 5px; min-height: 150px; }

/* ── Page 3 notes ── */
.cs-body--notes { display: grid; grid-template-columns: 2fr 1fr; grid-template-rows: repeat(3, 1fr); gap: 8px; }

/* ── Page 4 spells — 3-column WotC layout ── */
.cs-body--spells { gap: 8px; }
.cs-spell-col { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 5px; }
.cs-spell-section { display: flex; flex-direction: column; min-height: 0; overflow: visible; }
.cs-spell-section--grow { flex: 1; }
.cs-spell-section--cantrips { flex: .72; }
.cs-spell-section__head { height: 25px; display: flex; align-items: center; padding: 0; border: 1.5px solid #1a1a1a; border-radius: 3px; background: #fff; flex-shrink: 0; overflow: visible; }
.cs-spell-section__num { width: 27px; height: 27px; margin: -2px 0 -2px -1.5px; border: 1.5px solid #1a1a1a; border-radius: 50%; background: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 17px; line-height: 1; }
.cs-spell-section__title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; text-align: center; flex: 1; }
.cs-spell-section__slots { min-width: 76px; height: 25px; margin: -1.5px 0 -1.5px -1px; border: 1.5px solid #1a1a1a; border-left: none; border-radius: 0 18px 18px 0; display: flex; align-items: center; overflow: hidden; }
.cs-spell-section__slots-input { width: 34px; height: 21px; flex: 0 0 34px; font-size: 11px; font-weight: 700; text-align: center; border: none; background: transparent; }
.cs-spell-section__slot-dots { min-width: 0; display: flex; flex: 1; align-items: center; gap: 3px; padding: 0 6px 0 2px; white-space: nowrap; overflow: hidden; }
.cs-spell-section__slot-dots .cs-checkdot { flex: 0 0 auto; }
.cs-spell-section__body { flex: 1; min-height: 0; display: flex; margin-top: 4px; }
.cs-spell-section__prepared { width: 14px; flex: 0 0 14px; display: flex; flex-direction: column; align-items: center; justify-content: space-around; padding: 2px 0; }
.cs-spell-section__prepared i { width: 7px; height: 7px; border: 1px solid #555; border-radius: 50%; background: #fff; }
.cs-spell-section__body .cs-textblock { flex: 1; min-height: 0; border: none; border-radius: 0; }
.cs-spell-section--cantrips > .cs-textblock { flex: 1; min-height: 0; border: none; border-radius: 0; margin-top: 4px; }
.cs-spell-section .cs-textblock__label { display: none; }

/* ── Footer ── */
.cs-undertext { text-align: center; font-size: 8px; color: #777; margin: 2px 0 0; }
.cs-undertext__link { color: #555; }
.cs-undertext__url { color: #aaa; }

@media print {
  @page { size: A4; margin: 0; }
  .no-print { display: none !important; }
  .print-wrapper { background: #fff !important; padding: 0 !important; margin: 0 !important; }
  .print-wrapper > * { margin: 0 !important; }
  .sheet-page {
    width: 210mm; height: 297mm; padding: 10.3mm 12.4mm 14mm;
    break-after: page; page-break-after: always; box-shadow: none !important;
    margin: 0 !important;
  }
  .sheet-page:last-child { break-after: avoid; page-break-after: avoid; }
}
`;
