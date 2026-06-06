import { z } from "zod";

function optionalText(maxLength: number) {
  return z.preprocess(
    (value) => (value === null ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional()
  );
}

export const YandexFormAnswersSchema = z.object({
  characterName: optionalText(120),
  racePreference: optionalText(120),
  classPreference: optionalText(120),
  gender: optionalText(80),
  age: optionalText(80),
  origin: optionalText(1000),
  backstory: optionalText(4000),
  appearance: optionalText(2000),
  personality: optionalText(2000),
  fears: optionalText(1000),
  goals: optionalText(1000),
  playstyle: optionalText(1000),
  reference: optionalText(1000),
  extraNotes: optionalText(4000)
});

export const GameDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isIsoCalendarDate)
  .nullable();

export const FormIntakeSchema = z.object({
  playerName: z.string().trim().min(1).max(120),
  gameDate: GameDateSchema.default(null),
  answers: YandexFormAnswersSchema.default({})
});

export const YandexFormWebhookSchema = z.object({
  folderId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  playerName: z.string().trim().min(1).max(120),
  gameDate: GameDateSchema.default(null),
  answers: YandexFormAnswersSchema,
  rawAnswers: z.record(z.string()).optional(),
  deliveryId: z.string().trim().min(1).max(200).optional()
});

export const YandexFormWebhookEnvelopeSchema = z.object({
  folderId: z.string().uuid().optional(),
  gameDate: GameDateSchema.optional(),
  userId: z.string().uuid().optional(),
  rawText: z.string().min(1),
  rawBody: z.unknown(),
  rawAnswers: z.record(z.string()).optional(),
  deliveryId: z.string().trim().min(1).max(200).optional()
});

export type YandexFormAnswers = z.infer<typeof YandexFormAnswersSchema>;
export type FormIntake = z.infer<typeof FormIntakeSchema>;
export type YandexFormWebhookPayload = z.infer<typeof YandexFormWebhookSchema>;
export type YandexFormWebhookEnvelope = z.infer<typeof YandexFormWebhookEnvelopeSchema>;

function isIsoCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
