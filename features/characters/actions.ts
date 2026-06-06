"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/shared/supabase/server";
import { generateCharacterFromDraft } from "@/features/webhooks/pipeline";
import {
  LssCharacterJsonSchema,
  parseLssCharacterData
} from "@/features/lss/schema";
import type { Json } from "@/shared/supabase/database.types";

import {
  deleteCharacter,
  getCharacterDetail,
  updateCharacterGeneratedJson
} from "./repository";
import { deleteCharacterJson, uploadCharacterJson } from "./storage.repository";
import { applySheetState, type SheetState } from "./lib/sheet-data";

export async function generateCharacterAction(characterId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await generateCharacterFromDraft(characterId, user.id);

  revalidatePath(`/characters/${characterId}`);
}

export async function saveCharacterSheetAction(
  characterId: string,
  state: SheetState
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const character = await getCharacterDetail(supabase, user.id, characterId);

  if (!character || !character.generatedJsonPath) {
    throw new Error("У персонажа ещё нет LSS JSON — нечего сохранять.");
  }

  const lssJson = LssCharacterJsonSchema.parse(character.generatedJson);
  const original = parseLssCharacterData(lssJson.data);
  const updated = applySheetState(original, state);

  const nextJson = { ...lssJson, data: JSON.stringify(updated) } as unknown as Json;

  // Keep the downloadable storage object in sync with the DB copy.
  await uploadCharacterJson(supabase, {
    userId: user.id,
    characterId,
    json: nextJson
  });

  await updateCharacterGeneratedJson(supabase, {
    characterId,
    userId: user.id,
    generatedJson: nextJson,
    characterName: state.characterName,
    playerName: state.playerName,
    race: state.race,
    charClass: state.charClass,
    level: Number(state.level) || 1
  });

  revalidatePath(`/characters/${characterId}`);
  revalidatePath(`/characters/${characterId}/sheet`);
  revalidatePath(`/folders/${character.folderId}`);
}

export async function deleteCharacterAction(characterId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const result = await deleteCharacter(supabase, { characterId, userId: user.id });

  if (!result) {
    redirect("/folders");
  }

  if (result.generatedJsonPath) {
    await deleteCharacterJson(supabase, result.generatedJsonPath);
  }

  revalidatePath(`/folders/${result.folderId}`);
  redirect(`/folders/${result.folderId}`);
}
