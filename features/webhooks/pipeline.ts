import type { Json } from "@/shared/supabase/database.types";
import { createSupabaseServiceClient } from "@/shared/supabase/server";
import { AppError, getErrorMessage } from "@/shared/utils/errors";
import { buildLssCharacterPrompt } from "@/features/ai/prompt-builder";
import { generateLssCharacterJsonWithOpenAiCompatibleApi } from "@/features/ai/openai-compatible-client";
import { getAiSettingsForGeneration } from "@/features/ai/settings.repository";
import {
  completeCharacterWithLssJson,
  createDraftCharacter,
  updateCharacterProcessingStep
} from "@/features/characters/repository";
import { uploadCharacterJson } from "@/features/characters/storage.repository";
import { findOrCreateFolderByGameDate, getFolderForWebhook } from "@/features/folders/repository";
import { lssJsonToInternal } from "@/features/lss/mapper";

import type { YandexFormWebhookEnvelope } from "./yandex-form.schema";

export type WebhookGenerationResult = {
  characterId: string;
  downloadUrl: string;
  processingStatus: "received" | "processing" | "lss_ready" | "failed";
};

export async function generateCharacterFromYandexWebhook(
  envelope: YandexFormWebhookEnvelope
): Promise<WebhookGenerationResult> {
  const supabase = createSupabaseServiceClient();

  const userId = envelope.userId;

  if (!userId) {
    throw new AppError("User ID is required (set WEBHOOK_DEFAULT_USER_ID).", 422);
  }

  let folder;

  if (envelope.folderId) {
    folder = await getFolderForWebhook(supabase, envelope.folderId);
    if (!folder) throw new AppError("Folder not found.", 404);
    if (folder.userId !== userId) throw new AppError("Webhook user does not own target folder.", 403);
  } else if (envelope.gameDate) {
    folder = await findOrCreateFolderByGameDate(supabase, userId, envelope.gameDate);
  } else {
    throw new AppError("Either folderId or gameDate is required.", 422);
  }

  const characterId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();

  await createDraftCharacter(supabase, {
    id: characterId,
    folderId: folder.id,
    userId,
    rawWebhookBody: envelope.rawText,
    receivedAt
  });

  let activeStage: "generatingCharacter" | "formingLssJson" = "generatingCharacter";

  try {
    const aiSettings = await getAiSettingsForGeneration(supabase, userId);

    if (!aiSettings) {
      throw new AppError("AI settings are not configured for this user.", 422);
    }

    await updateCharacterProcessingStep(supabase, {
      characterId,
      userId,
      stage: "generatingCharacter",
      status: "running",
      processingStatus: "processing",
      updatedAt: new Date().toISOString()
    });

    const rawPrompt = buildLssCharacterPrompt({
      rawWebhookBody: envelope.rawBody,
      rawWebhookText: envelope.rawText,
      rawAnswers: envelope.rawAnswers
    });
    const lssJson = await generateLssCharacterJsonWithOpenAiCompatibleApi(aiSettings, rawPrompt);

    await updateCharacterProcessingStep(supabase, {
      characterId,
      userId,
      stage: "generatingCharacter",
      status: "completed",
      processingStatus: "processing",
      updatedAt: new Date().toISOString()
    });

    activeStage = "formingLssJson";

    await updateCharacterProcessingStep(supabase, {
      characterId,
      userId,
      stage: "formingLssJson",
      status: "running",
      processingStatus: "processing",
      updatedAt: new Date().toISOString()
    });

    const internalCharacter = lssJsonToInternal(lssJson, rawPrompt);
    const generatedJson = lssJson as unknown as Json;
    const generatedJsonPath = await uploadCharacterJson(supabase, {
      userId,
      characterId,
      json: generatedJson
    });

    await completeCharacterWithLssJson(supabase, {
      characterId,
      userId,
      internalCharacter,
      generatedJson,
      generatedJsonPath,
      rawPrompt,
      completedAt: new Date().toISOString()
    });

    return {
      characterId,
      downloadUrl: `/api/characters/${characterId}/download`,
      processingStatus: "lss_ready"
    };
  } catch (error) {
    await markGenerationFailed({
      characterId,
      userId,
      stage: activeStage,
      message: getErrorMessage(error)
    });

    throw error;
  }
}

async function markGenerationFailed(input: {
  characterId: string;
  userId: string;
  stage: "generatingCharacter" | "formingLssJson";
  message: string;
}): Promise<void> {
  try {
    await updateCharacterProcessingStep(createSupabaseServiceClient(), {
      characterId: input.characterId,
      userId: input.userId,
      stage: input.stage,
      status: "failed",
      processingStatus: "failed",
      message: input.message,
      updatedAt: new Date().toISOString()
    });
  } catch (dbError) {
    console.error("Failed to mark character generation as failed:", dbError);
  }
}
