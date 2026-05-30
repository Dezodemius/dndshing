import type { Json } from "@/shared/supabase/database.types";
import { createSupabaseServiceClient } from "@/shared/supabase/server";
import { AppError } from "@/shared/utils/errors";
import { buildCharacterPrompt, buildFormIntakePrompt } from "@/features/ai/prompt-builder";
import {
  extractFormIntakeWithOpenAiCompatibleApi,
  generateCharacterWithOpenAiCompatibleApi
} from "@/features/ai/openai-compatible-client";
import { getAiSettingsForGeneration } from "@/features/ai/settings.repository";
import { createInternalCharacter } from "@/features/characters/factory";
import { createGeneratedCharacter } from "@/features/characters/repository";
import { uploadCharacterJson } from "@/features/characters/storage.repository";
import { getFolderForWebhook, setFolderGameDateIfMissing } from "@/features/folders/repository";
import { internalToLssJson } from "@/features/lss/mapper";

import type { YandexFormWebhookEnvelope } from "./yandex-form.schema";
import { YandexFormWebhookSchema } from "./yandex-form.schema";

export type WebhookGenerationResult = {
  characterId: string;
  downloadUrl: string;
  gameDate: string | null;
};

export async function generateCharacterFromYandexWebhook(
  envelope: YandexFormWebhookEnvelope
): Promise<WebhookGenerationResult> {
  const supabase = createSupabaseServiceClient();
  const folder = await getFolderForWebhook(supabase, envelope.folderId);

  if (!folder) {
    throw new AppError("Folder not found.", 404);
  }

  const userId = envelope.userId ?? folder.userId;

  if (folder.userId !== userId) {
    throw new AppError("Webhook user does not own target folder.", 403);
  }

  const aiSettings = await getAiSettingsForGeneration(supabase, userId);

  if (!aiSettings) {
    throw new AppError("AI settings are not configured for this user.", 422);
  }

  const intakePrompt = buildFormIntakePrompt(envelope);
  const intake = await extractFormIntakeWithOpenAiCompatibleApi(aiSettings, intakePrompt);
  const payload = YandexFormWebhookSchema.parse({
    folderId: envelope.folderId,
    userId,
    playerName: intake.playerName,
    gameDate: intake.gameDate,
    answers: intake.answers,
    rawAnswers: envelope.rawAnswers,
    deliveryId: envelope.deliveryId
  });

  if (payload.gameDate && !folder.gameDate) {
    await setFolderGameDateIfMissing(supabase, userId, envelope.folderId, payload.gameDate);
  }

  const rawPrompt = buildCharacterPrompt(payload);
  const generated = await generateCharacterWithOpenAiCompatibleApi(aiSettings, rawPrompt);
  const createdAt = new Date().toISOString();
  const internalCharacter = createInternalCharacter({
    generated,
    playerName: payload.playerName,
    avatarUrl: null,
    rawPrompt,
    createdAt
  });
  const lssJson = internalToLssJson(internalCharacter, createdAt);
  const characterId = crypto.randomUUID();
  const generatedJson = lssJson as unknown as Json;
  const generatedJsonPath = await uploadCharacterJson(supabase, {
    userId,
    characterId,
    json: generatedJson
  });

  await createGeneratedCharacter(supabase, {
    id: characterId,
    folderId: envelope.folderId,
    userId,
    playerName: payload.playerName,
    internalCharacter,
    generatedJson,
    generatedJsonPath
  });

  return {
    characterId,
    downloadUrl: `/api/characters/${characterId}/download`,
    gameDate: payload.gameDate
  };
}
