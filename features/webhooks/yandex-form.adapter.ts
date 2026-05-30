import { z } from "zod";

import {
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

const UUID_SCHEMA = z.string().uuid();

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

  const fields = flattenRawFields(body);
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
    findFieldValue(fields, FIELD_MATCHERS.playerName) ?? findFirstHumanText(fields);

  const payload = {
    folderId,
    userId,
    playerName,
    answers: {
      characterName: findFieldValue(fields, FIELD_MATCHERS.characterName),
      racePreference: findFieldValue(fields, FIELD_MATCHERS.racePreference),
      classPreference: findFieldValue(fields, FIELD_MATCHERS.classPreference),
      gender: findFieldValue(fields, FIELD_MATCHERS.gender),
      age: findFieldValue(fields, FIELD_MATCHERS.age),
      origin: findFieldValue(fields, FIELD_MATCHERS.origin),
      backstory: joinSections([
        findFieldValue(fields, FIELD_MATCHERS.backstory),
        findFieldValue(fields, FIELD_MATCHERS.extraNotes)
      ]),
      appearance: findFieldValue(fields, FIELD_MATCHERS.appearance),
      personality: findFieldValue(fields, FIELD_MATCHERS.personality),
      fears: findFieldValue(fields, FIELD_MATCHERS.fears),
      goals: findFieldValue(fields, FIELD_MATCHERS.goals),
      playstyle: findFieldValue(fields, FIELD_MATCHERS.playstyle),
      reference: findFieldValue(fields, FIELD_MATCHERS.reference),
      extraNotes: buildExtraNotes(fields)
    },
    rawAnswers,
    deliveryId: context.deliveryId ?? findFieldValue(fields, [/delivery/i, /answer.?id/i, /response.?id/i])
  };

  return YandexFormWebhookSchema.parse(payload);
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

function buildExtraNotes(fields: RawField[]): string | undefined {
  if (fields.length === 0) {
    return undefined;
  }

  return fields
    .map((field) => `${field.path}: ${field.value}`)
    .join("\n")
    .slice(0, 4000);
}
