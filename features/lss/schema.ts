import { z } from "zod";

const LssValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const LssNamedValueSchema = z
  .object({
    name: z.string(),
    value: LssValueSchema,
    label: z.string().optional()
  })
  .passthrough();

export const LssStatSchema = z.object({
  name: z.string(),
  score: z.number().int(),
  modifier: z.number().int(),
  race: z.number().int(),
  label: z.string(),
  check: z.number().int()
});

export const LssSaveSchema = z.object({
  name: z.string(),
  isProf: z.boolean(),
  bonus: z.number().int()
});

export const LssSkillSchema = z.object({
  baseStat: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  name: z.string(),
  label: z.string(),
  isProf: z.number().int().min(0).max(2)
});

export const LssCharacterDataSchema = z
  .object({
    isDefault: z.boolean(),
    jsonType: z.literal("character"),
    template: z.string(),
    name: z.object({
      value: z.string()
    }),
    info: z.object({
      charClass: LssNamedValueSchema,
      charSubclass: LssNamedValueSchema,
      level: LssNamedValueSchema,
      background: LssNamedValueSchema,
      playerName: LssNamedValueSchema,
      race: LssNamedValueSchema,
      alignment: LssNamedValueSchema,
      experience: LssNamedValueSchema
    }),
    subInfo: z.record(LssNamedValueSchema),
    spellsInfo: z.record(z.unknown()),
    spells: z.record(z.unknown()),
    spellsPact: z.record(z.unknown()),
    bonuses: z.array(z.unknown()),
    proficiency: z.number().int(),
    stats: z.object({
      str: LssStatSchema,
      dex: LssStatSchema,
      con: LssStatSchema,
      int: LssStatSchema,
      wis: LssStatSchema,
      cha: LssStatSchema
    }),
    saves: z.object({
      str: LssSaveSchema,
      dex: LssSaveSchema,
      con: LssSaveSchema,
      int: LssSaveSchema,
      wis: LssSaveSchema,
      cha: LssSaveSchema
    }),
    skills: z.record(LssSkillSchema),
    vitality: z.record(z.unknown()),
    attunementsList: z.array(z.unknown()),
    weaponsList: z.array(z.unknown()),
    weapons: z.record(z.unknown()),
    text: z.record(z.unknown()),
    coins: z.record(z.unknown()),
    resources: z.record(z.unknown()),
    bonusesSkills: z.unknown().nullable(),
    bonusesStats: z.unknown().nullable(),
    conditions: z.unknown().nullable(),
    wizardStep: z.string(),
    hiddenName: z.string(),
    casterClass: z.object({
      value: z.string()
    }),
    avatar: z
      .object({
        jpeg: z.string(),
        webp: z.string()
      })
      .partial(),
    inspiration: z.boolean(),
    exhaustion: z.string(),
    createdAt: z.string(),
    proficiencyCustom: z.number().int()
  })
  .passthrough();

export const LssCharacterJsonSchema = z.object({
  tags: z.array(z.unknown()),
  rooms: z.array(z.unknown()),
  disabledBlocks: z
    .object({
      "info-left": z.array(z.unknown()),
      "info-right": z.array(z.unknown()),
      "subinfo-left": z.array(z.unknown()),
      "subinfo-right": z.array(z.unknown()),
      "notes-left": z.array(z.unknown()),
      "notes-right": z.array(z.unknown()),
      _id: z.string()
    })
    .passthrough(),
  edition: z.string(),
  spells: z
    .object({
      mode: z.string(),
      prepared: z.array(z.unknown()),
      book: z.array(z.unknown()),
      edition: z.string()
    })
    .passthrough(),
  data: z.string().min(1),
  lastWriterSessionId: z.string().min(1),
  jsonType: z.literal("character"),
  version: z.string()
});

export type LssNamedValue = z.infer<typeof LssNamedValueSchema>;
export type LssStat = z.infer<typeof LssStatSchema>;
export type LssSave = z.infer<typeof LssSaveSchema>;
export type LssSkill = z.infer<typeof LssSkillSchema>;
export type LssCharacterData = z.infer<typeof LssCharacterDataSchema>;
export type LssCharacterJson = z.infer<typeof LssCharacterJsonSchema>;

export function parseLssCharacterData(data: string): LssCharacterData {
  const parsed: unknown = JSON.parse(data);

  return LssCharacterDataSchema.parse(parsed);
}
