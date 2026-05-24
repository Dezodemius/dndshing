import { z } from "zod";

export const YandexFormAnswersSchema = z.object({
  characterName: z.string().trim().min(1).max(120).optional(),
  racePreference: z.string().trim().min(1).max(120).optional(),
  classPreference: z.string().trim().min(1).max(120).optional(),
  gender: z.string().trim().min(1).max(80).optional(),
  backstory: z.string().trim().min(1).max(4000).optional(),
  appearance: z.string().trim().min(1).max(2000).optional(),
  personality: z.string().trim().min(1).max(2000).optional(),
  fears: z.string().trim().min(1).max(1000).optional(),
  goals: z.string().trim().min(1).max(1000).optional()
});

export const YandexFormWebhookSchema = z.object({
  folderId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  playerName: z.string().trim().min(1).max(120),
  answers: YandexFormAnswersSchema
});

export type YandexFormWebhookPayload = z.infer<typeof YandexFormWebhookSchema>;
