import { z } from "zod";

export const AiSettingsSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelName: z.string().min(1)
});

export const AiSettingsFormSchema = z.object({
  apiBaseUrl: z.string().trim().url("Укажите корректный URL"),
  apiKey: z.string().trim().optional(),
  modelName: z.string().trim().min(1, "Укажите модель")
});

export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type AiSettingsFormInput = z.infer<typeof AiSettingsFormSchema>;

export type AiSettingsPreview = {
  apiBaseUrl: string;
  modelName: string;
  hasApiKey: boolean;
  updatedAt: string;
};
