import type { Json } from "@/shared/supabase/database.types";
import type { TypedSupabaseClient } from "@/shared/supabase/server";

export const CHARACTER_JSON_BUCKET = "character-json";

export async function uploadCharacterJson(
  supabase: TypedSupabaseClient,
  input: {
    userId: string;
    characterId: string;
    json: Json;
  }
): Promise<string> {
  const path = `${input.userId}/${input.characterId}.json`;
  const file = new Blob([JSON.stringify(input.json, null, 2)], {
    type: "application/json"
  });

  const { error } = await supabase.storage
    .from(CHARACTER_JSON_BUCKET)
    .upload(path, file, {
      contentType: "application/json",
      upsert: true
    });

  if (error) {
    throw new Error(error.message);
  }

  return path;
}

export async function deleteCharacterJson(
  supabase: TypedSupabaseClient,
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from(CHARACTER_JSON_BUCKET).remove([path]);

  // A missing object is not a hard error — the row deletion is what matters.
  if (error && !/not.*found/i.test(error.message)) {
    throw new Error(error.message);
  }
}
