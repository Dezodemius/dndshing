import { z } from "zod";

import {
  type YandexFormAnswers,
  type YandexFormWebhookPayload,
  YandexFormWebhookSchema
} from "./yandex-form.schema";

type NormalizeContext = {
  folderId?: string | null;
  userId?: string | null;
  deliveryId?: string | null;
};

type RawField = {
  path: string;
  value: string;
};

type YandexAnswerField = RawField & {
  index: number;
  sourceKey: string;
  questionId?: string;
  questionSlug?: string;
  answerTypeSlug?: string;
};

type AnswerKey = keyof YandexFormAnswers;
type SemanticField = AnswerKey | "playerName" | "ignore";

type MappedYandexAnswers = {
  playerName?: string;
  answers: Partial<YandexFormAnswers>;
};

const UUID_SCHEMA = z.string().uuid();

const YANDEX_CHOICE_VALUE_SCHEMA = z
  .object({
    key: z.string().optional(),
    slug: z.string().optional(),
    text: z.string().optional()
  })
  .passthrough();

const YANDEX_ANSWER_ENTRY_SCHEMA = z
  .object({
    value: z.unknown().optional(),
    question: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        slug: z.string().optional(),
        answer_type: z
          .object({
            slug: z.string().optional()
          })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const YANDEX_FORM_BODY_SCHEMA = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    answer: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        data: z.record(YANDEX_ANSWER_ENTRY_SCHEMA).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const YANDEX_FIELD_BY_QUESTION_ID = {
  "109901008": "playerName",
  "109901639": "ignore",
  "109907784": "age",
  "109907806": "ignore",
  "109901268": "characterName",
  "109901844": "gender",
  "109903155": "origin",
  "109903413": "backstory",
  "109904069": "fears",
  "109904294": "goals",
  "109904678": "extraNotes",
  "109905123": "backstory",
  "109905491": "reference",
  "109905918": "playstyle",
  "109902568": "personality"
} satisfies Record<string, SemanticField>;

const YANDEX_ORDERED_FIELDS = [
  "playerName",
  "ignore",
  "age",
  "ignore",
  "characterName",
  "gender",
  "origin",
  "backstory",
  "fears",
  "goals",
  "extraNotes",
  "backstory",
  "reference",
  "playstyle",
  "personality"
] as const satisfies readonly SemanticField[];

const FIELD_MATCHERS = {
  playerName: [/^имя$/i, /имя игрока/i, /ваше имя/i, /как вас зовут/i],
  characterName: [/имя персонажа/i, /прозвище/i, /как зовут персонажа/i],
  racePreference: [/раса/i],
  classPreference: [/класс/i],
  gender: [/пол персонажа/i, /гендер персонажа/i, /^пол$/i, /^гендер$/i],
  age: [/возраст/i],
  origin: [/откуда/i, /родин/i, /деревн/i, /город/i, /место/i],
  fears: [/страх/i, /боится/i, /опаса/i],
  goals: [/цель/i, /мечта/i, /хочет/i, /мотивац/i, /не подвести/i],
  appearance: [/внеш/i, /выгляд/i, /образ/i, /описание/i],
  personality: [/характер/i, /личност/i, /поведен/i, /какой он/i],
  reference: [/референс/i, /пример/i, /персонаж похож/i, /похож/i],
  playstyle: [/отыгрыш/i, /играть/i, /стиль игры/i, /ожидан/i],
  backstory: [/истори/i, /прошл/i, /биограф/i, /случай/i, /событи/i],
  extraNotes: [/секрет/i, /особен/i, /памят/i, /помнит/i, /факт/i, /детал/i]
} satisfies Record<string, RegExp[]>;

export function normalizeYandexFormWebhookPayload(
  body: unknown,
  context: NormalizeContext
): YandexFormWebhookPayload {
  const direct = YandexFormWebhookSchema.safeParse(body);

  if (direct.success) {
    return direct.data;
  }

  const yandexFields = extractYandexAnswerFields(body);
  const fields = yandexFields.length > 0 ? yandexFields : flattenRawFields(body);
  const mappedYandex = mapYandexAnswerFields(yandexFields);
  const rawAnswers = Object.fromEntries(fields.map((field) => [field.path, field.value]));
  const folderId = resolveUuid([
    context.folderId,
    findFieldValue(fields, [/^folderId$/i, /folder id/i, /id папки/i, /папка/i])
  ]);
  const userId = resolveUuid([
    context.userId,
    findFieldValue(fields, [/^userId$/i, /user id/i, /id пользователя/i])
  ]);
  const playerName =
    mappedYandex.playerName ??
    findFieldValue(fields, FIELD_MATCHERS.playerName) ??
    findFirstHumanText(fields);

  const payload = {
    folderId,
    userId,
    playerName,
    answers: {
      characterName:
        mappedYandex.answers.characterName ??
        findFieldValue(fields, FIELD_MATCHERS.characterName),
      racePreference:
        mappedYandex.answers.racePreference ??
        findFieldValue(fields, FIELD_MATCHERS.racePreference),
      classPreference:
        mappedYandex.answers.classPreference ??
        findFieldValue(fields, FIELD_MATCHERS.classPreference),
      gender: mappedYandex.answers.gender ?? findFieldValue(fields, FIELD_MATCHERS.gender),
      age: mappedYandex.answers.age ?? findFieldValue(fields, FIELD_MATCHERS.age),
      origin: mappedYandex.answers.origin ?? findFieldValue(fields, FIELD_MATCHERS.origin),
      backstory: joinSections([
        mappedYandex.answers.backstory,
        findFieldValue(fields, FIELD_MATCHERS.backstory),
        yandexFields.length === 0 ? findFieldValue(fields, FIELD_MATCHERS.extraNotes) : undefined
      ]),
      appearance:
        mappedYandex.answers.appearance ?? findFieldValue(fields, FIELD_MATCHERS.appearance),
      personality:
        mappedYandex.answers.personality ?? findFieldValue(fields, FIELD_MATCHERS.personality),
      fears: mappedYandex.answers.fears ?? findFieldValue(fields, FIELD_MATCHERS.fears),
      goals: mappedYandex.answers.goals ?? findFieldValue(fields, FIELD_MATCHERS.goals),
      playstyle:
        mappedYandex.answers.playstyle ?? findFieldValue(fields, FIELD_MATCHERS.playstyle),
      reference:
        mappedYandex.answers.reference ?? findFieldValue(fields, FIELD_MATCHERS.reference),
      extraNotes: mappedYandex.answers.extraNotes ?? buildExtraNotes(fields)
    },
    rawAnswers,
    deliveryId:
      context.deliveryId ?? findFieldValue(fields, [/delivery/i, /answer.?id/i, /response.?id/i])
  };

  return YandexFormWebhookSchema.parse(payload);
}

function extractYandexAnswerFields(body: unknown): YandexAnswerField[] {
  const parsed = YANDEX_FORM_BODY_SCHEMA.safeParse(body);
  const data = parsed.success ? parsed.data.answer?.data : undefined;

  if (!data) {
    return [];
  }

  return Object.entries(data).flatMap(([sourceKey, entry], index) => {
    const value = stringifyYandexValue(entry.value);

    if (!value) {
      return [];
    }

    const questionId = entry.question?.id === undefined ? undefined : String(entry.question.id);
    const questionSlug = entry.question?.slug ?? sourceKey;
    const answerTypeSlug = entry.question?.answer_type?.slug;
    const questionPath = questionId ? `question-${questionId}` : questionSlug;

    return [
      {
        path: `answer.data.${questionPath}.${sourceKey}`,
        value,
        index,
        sourceKey,
        questionId,
        questionSlug,
        answerTypeSlug
      }
    ];
  });
}

function stringifyYandexValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return toNonEmptyString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return joinSections(value.map((item) => stringifyYandexValue(item)));
  }

  if (typeof value === "object") {
    const choice = YANDEX_CHOICE_VALUE_SCHEMA.safeParse(value);

    if (choice.success) {
      return firstNonEmpty([choice.data.text, choice.data.slug, choice.data.key]);
    }
  }

  return undefined;
}

function mapYandexAnswerFields(fields: YandexAnswerField[]): MappedYandexAnswers {
  const answers: Partial<YandexFormAnswers> = {};
  let playerName: string | undefined;

  for (const field of fields) {
    const semanticField = resolveYandexSemanticField(field);

    if (!semanticField || semanticField === "ignore") {
      continue;
    }

    if (semanticField === "playerName") {
      playerName = field.value;
      continue;
    }

    appendAnswerValue(answers, semanticField, field.value);
  }

  return { playerName, answers };
}

function resolveYandexSemanticField(field: YandexAnswerField): SemanticField | undefined {
  if (field.questionId) {
    const semanticField =
      YANDEX_FIELD_BY_QUESTION_ID[
        field.questionId as keyof typeof YANDEX_FIELD_BY_QUESTION_ID
      ];

    if (semanticField) {
      return semanticField;
    }
  }

  return YANDEX_ORDERED_FIELDS[field.index];
}

function appendAnswerValue(
  answers: Partial<YandexFormAnswers>,
  key: AnswerKey,
  value: string
) {
  answers[key] = joinSections([answers[key], value]);
}

function flattenRawFields(value: unknown, path = ""): RawField[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? [{ path, value: trimmed }] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [{ path, value: String(value) }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenRawFields(item, appendPath(path, String(index))));
  }

  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, nestedValue]) =>
      flattenRawFields(nestedValue, appendPath(path, key))
    );
  }

  return [];
}

function appendPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function findFieldValue(fields: RawField[], patterns: RegExp[]): string | undefined {
  return fields.find((field) => patterns.some((pattern) => pattern.test(field.path)))?.value;
}

function findFirstHumanText(fields: RawField[]): string | undefined {
  return fields.find((field) => {
    const path = field.path.toLowerCase();

    return (
      field.value.length > 0 &&
      field.value.length <= 120 &&
      !path.includes("date") &&
      !path.includes("time") &&
      !path.includes("id") &&
      !/^\d+$/.test(field.value)
    );
  })?.value;
}

function resolveUuid(values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => UUID_SCHEMA.safeParse(value).success);
}

function joinSections(values: Array<string | undefined>): string | undefined {
  const joined = values.filter((value): value is string => Boolean(value)).join("\n\n");

  return joined || undefined;
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.map((value) => toNonEmptyString(value)).find(Boolean);
}

function toNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function buildExtraNotes(fields: RawField[]): string | undefined {
  if (fields.length === 0) {
    return undefined;
  }

  return fields
    .map((field) => `${field.path}: ${field.value}`)
    .join("\n")
    .slice(0, 4000);
}
