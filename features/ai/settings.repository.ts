import { getServerEnv } from "@/shared/config/env";
import type { TypedSupabaseClient } from "@/shared/supabase/server";

import type { AiSettings, AiSettingsFormInput, AiSettingsPreview } from "./domain";
import { AiSettingsSchema } from "./domain";

export async function getAiSettingsForGeneration(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<AiSettings | null> {
  const { data, error } = await supabase
    .from("user_ai_settings")
    .select("api_base_url, api_key, model_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return AiSettingsSchema.parse({
      apiBaseUrl: data.api_base_url,
      apiKey: data.api_key,
      modelName: data.model_name
    });
  }

  const env = getServerEnv();

  if (env.AI_API_BASE_URL && env.AI_API_KEY && env.AI_MODEL_NAME) {
    return AiSettingsSchema.parse({
      apiBaseUrl: env.AI_API_BASE_URL,
      apiKey: env.AI_API_KEY,
      modelName: env.AI_MODEL_NAME
    });
  }

  return null;
}

export async function getAiSettingsPreview(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<AiSettingsPreview | null> {
  const { data, error } = await supabase
    .from("user_ai_settings")
    .select("api_base_url, api_key, model_name, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    apiBaseUrl: data.api_base_url,
    modelName: data.model_name,
    hasApiKey: data.api_key.length > 0,
    updatedAt: data.updated_at
  };
}

export async function upsertAiSettings(
  supabase: TypedSupabaseClient,
  userId: string,
  input: AiSettingsFormInput
): Promise<void> {
  const current = await getAiSettingsForGeneration(supabase, userId);
  const apiKey = input.apiKey || current?.apiKey;

  if (!apiKey) {
    throw new Error("API key is required for the first AI settings save.");
  }

  const { error } = await supabase.from("user_ai_settings").upsert({
    user_id: userId,
    api_base_url: input.apiBaseUrl,
    api_key: apiKey,
    model_name: input.modelName
  });

  if (error) {
    throw new Error(error.message);
  }
}
