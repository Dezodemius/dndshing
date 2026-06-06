import type { Json } from "@/shared/supabase/database.types";
import type { TypedSupabaseClient } from "@/shared/supabase/server";

import type {
  CharacterProcessingStage,
  CharacterProcessingStepStatus,
  CharacterProcessingSteps,
  CharacterProcessingStatus,
  CharacterSummary,
  InternalCharacter
} from "./domain";
import {
  CharacterProcessingStepsSchema,
  CharacterSummarySchema,
  createInitialProcessingSteps
} from "./domain";

type CharacterRow = {
  id: string;
  folder_id: string;
  player_name: string;
  character_name: string;
  race: string;
  class: string;
  level: number;
  gender: string | null;
  short_backstory: string;
  appearance: string;
  personality: string;
  fears: string;
  goals: string;
  avatar_url: string | null;
  generated_json_path: string | null;
  pdf_path: string | null;
  processing_status: string;
  processing_steps: Json;
  created_at: string;
  updated_at: string;
  user_id: string;
};

type CharacterDetail = CharacterSummary & {
  generatedJson: Json;
};

function mapCharacterSummary(row: CharacterRow): CharacterSummary {
  return CharacterSummarySchema.parse({
    id: row.id,
    folderId: row.folder_id,
    playerName: row.player_name,
    characterName: row.character_name,
    race: row.race,
    class: row.class,
    level: row.level,
    gender: row.gender,
    shortBackstory: row.short_backstory,
    appearance: row.appearance,
    personality: row.personality,
    fears: row.fears,
    goals: row.goals,
    avatarUrl: row.avatar_url,
    generatedJsonPath: row.generated_json_path,
    pdfPath: row.pdf_path,
    processingStatus: row.processing_status,
    processingSteps: row.processing_steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id
  });
}

const CHARACTER_SUMMARY_SELECT =
  "id, folder_id, player_name, character_name, race, class, level, gender, short_backstory, appearance, personality, fears, goals, avatar_url, generated_json_path, pdf_path, processing_status, processing_steps, created_at, updated_at, user_id";

export async function listCharactersByFolder(
  supabase: TypedSupabaseClient,
  userId: string,
  folderId: string
): Promise<CharacterSummary[]> {
  const { data, error } = await supabase
    .from("characters")
    .select(CHARACTER_SUMMARY_SELECT)
    .eq("user_id", userId)
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(mapCharacterSummary);
}

export async function getCharacterForGeneration(
  supabase: TypedSupabaseClient,
  userId: string,
  characterId: string
): Promise<{ rawPrompt: string; folderId: string } | null> {
  const { data, error } = await supabase
    .from("characters")
    .select("raw_prompt, folder_id")
    .eq("user_id", userId)
    .eq("id", characterId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return { rawPrompt: data.raw_prompt, folderId: data.folder_id };
}

export async function getCharacterJsonForDownload(
  supabase: TypedSupabaseClient,
  userId: string,
  characterId: string
): Promise<{ characterName: string; generatedJson: Json } | null> {
  const { data, error } = await supabase
    .from("characters")
    .select("character_name, generated_json, generated_json_path")
    .eq("user_id", userId)
    .eq("id", characterId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.generated_json_path) {
    return null;
  }

  return {
    characterName: data.character_name,
    generatedJson: data.generated_json
  };
}

export async function getCharacterDetail(
  supabase: TypedSupabaseClient,
  userId: string,
  characterId: string
): Promise<CharacterDetail | null> {
  const { data, error } = await supabase
    .from("characters")
    .select(`${CHARACTER_SUMMARY_SELECT}, generated_json`)
    .eq("user_id", userId)
    .eq("id", characterId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    ...mapCharacterSummary(data),
    generatedJson: data.generated_json
  };
}

export async function createGeneratedCharacter(
  supabase: TypedSupabaseClient,
  input: {
    id: string;
    folderId: string;
    userId: string;
    playerName: string;
    internalCharacter: InternalCharacter;
    generatedJson: Json;
    generatedJsonPath: string | null;
  }
): Promise<CharacterSummary> {
  const { identity, roleplay, assets, metadata } = input.internalCharacter;
  const { data, error } = await supabase
    .from("characters")
    .insert({
      id: input.id,
      folder_id: input.folderId,
      user_id: input.userId,
      player_name: input.playerName,
      character_name: identity.characterName,
      race: identity.race,
      class: identity.class,
      level: identity.level,
      gender: identity.gender,
      short_backstory: roleplay.shortBackstory,
      appearance: roleplay.appearance,
      personality: roleplay.personality,
      fears: roleplay.fears,
      goals: roleplay.goals,
      avatar_url: assets.avatarUrl,
      raw_prompt: metadata.rawPrompt,
      internal_json: input.internalCharacter as unknown as Json,
      generated_json: input.generatedJson,
      generated_json_path: input.generatedJsonPath
    })
    .select(CHARACTER_SUMMARY_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapCharacterSummary(data);
}

export async function createDraftCharacter(
  supabase: TypedSupabaseClient,
  input: {
    id: string;
    folderId: string;
    userId: string;
    rawWebhookBody: string;
    receivedAt: string;
  }
): Promise<CharacterSummary> {
  const processingSteps = createInitialProcessingSteps(input.receivedAt);
  const { data, error } = await supabase
    .from("characters")
    .insert({
      id: input.id,
      folder_id: input.folderId,
      user_id: input.userId,
      player_name: "Неизвестный игрок",
      character_name: "Черновик персонажа",
      race: "Не определено",
      class: "Не определено",
      level: 1,
      gender: null,
      short_backstory: "Персонаж ожидает генерации.",
      appearance: "Портрет ещё не сформирован.",
      personality: "Характер ещё не сформирован.",
      fears: "Страхи ещё не сформированы.",
      goals: "Цели ещё не сформированы.",
      avatar_url: null,
      raw_prompt: input.rawWebhookBody,
      internal_json: {
        schemaVersion: "internal.character.draft.v1",
        source: "webhook",
        receivedAt: input.receivedAt
      },
      generated_json: {},
      generated_json_path: null,
      pdf_path: null,
      processing_status: "received",
      processing_steps: processingSteps as unknown as Json
    })
    .select(CHARACTER_SUMMARY_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapCharacterSummary(data);
}

export async function updateCharacterProcessingStep(
  supabase: TypedSupabaseClient,
  input: {
    characterId: string;
    userId: string;
    stage: CharacterProcessingStage;
    status: CharacterProcessingStepStatus;
    processingStatus: CharacterProcessingStatus;
    message?: string | null;
    updatedAt: string;
  }
): Promise<void> {
  const steps = await getCharacterProcessingSteps(supabase, input.userId, input.characterId);

  const nextSteps = CharacterProcessingStepsSchema.parse({
    ...steps,
    [input.stage]: {
      status: input.status,
      message: input.message ?? null,
      updatedAt: input.updatedAt
    }
  });

  const { error } = await supabase
    .from("characters")
    .update({
      processing_status: input.processingStatus,
      processing_steps: nextSteps as unknown as Json
    })
    .eq("user_id", input.userId)
    .eq("id", input.characterId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function completeCharacterWithLssJson(
  supabase: TypedSupabaseClient,
  input: {
    characterId: string;
    userId: string;
    internalCharacter: InternalCharacter;
    generatedJson: Json;
    generatedJsonPath: string;
    rawPrompt: string;
    completedAt: string;
  }
): Promise<void> {
  const { identity, roleplay, assets } = input.internalCharacter;
  const steps = await getCharacterProcessingSteps(supabase, input.userId, input.characterId);
  const nextSteps = CharacterProcessingStepsSchema.parse({
    ...steps,
    formingLssJson: {
      status: "completed",
      message: null,
      updatedAt: input.completedAt
    },
    formingPdf: {
      status: "failed",
      message: "PDF generator is not implemented yet.",
      updatedAt: input.completedAt
    }
  });

  const { error } = await supabase
    .from("characters")
    .update({
      player_name: identity.playerName,
      character_name: identity.characterName,
      race: identity.race,
      class: identity.class,
      level: identity.level,
      gender: identity.gender,
      short_backstory: roleplay.shortBackstory,
      appearance: roleplay.appearance,
      personality: roleplay.personality,
      fears: roleplay.fears,
      goals: roleplay.goals,
      avatar_url: assets.avatarUrl,
      raw_prompt: input.rawPrompt,
      internal_json: input.internalCharacter as unknown as Json,
      generated_json: input.generatedJson,
      generated_json_path: input.generatedJsonPath,
      processing_status: "lss_ready",
      processing_steps: nextSteps as unknown as Json
    })
    .eq("user_id", input.userId)
    .eq("id", input.characterId);

  if (error) {
    throw new Error(error.message);
  }
}

async function getCharacterProcessingSteps(
  supabase: TypedSupabaseClient,
  userId: string,
  characterId: string
): Promise<CharacterProcessingSteps> {
  const { data, error } = await supabase
    .from("characters")
    .select("processing_steps")
    .eq("user_id", userId)
    .eq("id", characterId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return CharacterProcessingStepsSchema.parse(data.processing_steps);
}
