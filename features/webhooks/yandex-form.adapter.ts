import { z } from "zod";

import {
  GameDateSchema,
  type YandexFormWebhookEnvelope,
  YandexFormWebhookEnvelopeSchema
} from "./yandex-form.schema";

type NormalizeContext = {
  folderId?: string | null;
  gameDate?: string | null;
  userId?: string | null;
  deliveryId?: string | null;
  rawText: string;
};

type RawField = {
  path: string;
  value: string;
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

export function createYandexFormWebhookEnvelope(
  body: unknown,
  context: NormalizeContext
): YandexFormWebhookEnvelope {
  const yandexFields = extractYandexAnswerFields(body);
  const fields = yandexFields.length > 0 ? yandexFields : flattenRawFields(body);
  const rawAnswers = Object.fromEntries(fields.map((field) => [field.path, field.value]));
  const folderId = resolveUuid([
    context.folderId,
    findFieldValue(fields, [/^folderId$/i, /folder id/i, /id папки/i, /папка/i])
  ]);
  const userId = resolveUuid([
    context.userId,
    findFieldValue(fields, [/^userId$/i, /user id/i, /id пользователя/i])
  ]);
  const gameDate = resolveGameDate([
    context.gameDate,
    findFieldValue(fields, [/gameDate/i, /game.?date/i, /дата.*(игр)/i, /игр.*дата/i])
  ]);

  return YandexFormWebhookEnvelopeSchema.parse({
    folderId,
    gameDate,
    userId,
    rawText: context.rawText,
    rawBody: body,
    rawAnswers,
    deliveryId:
      context.deliveryId ?? findFieldValue(fields, [/delivery/i, /answer.?id/i, /response.?id/i])
  });
}

function extractYandexAnswerFields(body: unknown): RawField[] {
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
        path: [
          `answer.data.${questionPath}`,
          `index-${index}`,
          `type-${answerTypeSlug ?? "unknown"}`,
          sourceKey
        ].join("."),
        value
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

function resolveUuid(values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => UUID_SCHEMA.safeParse(value).success);
}

function resolveGameDate(values: Array<string | null | undefined>): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && GameDateSchema.safeParse(value).success
  );
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
