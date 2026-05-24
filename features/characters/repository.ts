import type { Json } from "@/shared/supabase/database.types";
import type { TypedSupabaseClient } from "@/shared/supabase/server";

import type { CharacterSummary, InternalCharacter } from "./domain";
import { CharacterSummarySchema } from "./domain";

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
  created_at: string;
  updated_at: string;
  user_id: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id
  });
}

export async function listCharactersByFolder(
  supabase: TypedSupabaseClient,
  userId: string,
  folderId: string
): Promise<CharacterSummary[]> {
  const { data, error } = await supabase
    .from("characters")
    .select(
      "id, folder_id, player_name, character_name, race, class, level, gender, short_backstory, appearance, personality, fears, goals, avatar_url, generated_json_path, created_at, updated_at, user_id"
    )
    .eq("user_id", userId)
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(mapCharacterSummary);
}

export async function getCharacterJsonForDownload(
  supabase: TypedSupabaseClient,
  userId: string,
  characterId: string
): Promise<{ characterName: string; generatedJson: Json } | null> {
  const { data, error } = await supabase
    .from("characters")
    .select("character_name, generated_json")
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
    characterName: data.character_name,
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
    .select(
      "id, folder_id, player_name, character_name, race, class, level, gender, short_backstory, appearance, personality, fears, goals, avatar_url, generated_json_path, created_at, updated_at, user_id"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapCharacterSummary(data);
}
