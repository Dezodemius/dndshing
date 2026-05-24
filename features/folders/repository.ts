import type { TypedSupabaseClient } from "@/shared/supabase/server";

import type { CreateFolderInput, Folder } from "./domain";
import { FolderSchema } from "./domain";

type FolderRow = {
  id: string;
  name: string;
  description: string | null;
  game_date: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
};

function mapFolder(row: FolderRow): Folder {
  return FolderSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    gameDate: row.game_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id
  });
}

export async function listFolders(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<Folder[]> {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(mapFolder);
}

export async function getFolderById(
  supabase: TypedSupabaseClient,
  userId: string,
  folderId: string
): Promise<Folder | null> {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", userId)
    .eq("id", folderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapFolder(data) : null;
}

export async function getFolderForWebhook(
  supabase: TypedSupabaseClient,
  folderId: string
): Promise<Folder | null> {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapFolder(data) : null;
}

export async function createFolder(
  supabase: TypedSupabaseClient,
  userId: string,
  input: CreateFolderInput
): Promise<Folder> {
  const { data, error } = await supabase
    .from("folders")
    .insert({
      user_id: userId,
      name: input.name,
      description: input.description || null,
      game_date: input.gameDate || null
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapFolder(data);
}

export async function deleteFolder(
  supabase: TypedSupabaseClient,
  userId: string,
  folderId: string
): Promise<void> {
  const { error } = await supabase
    .from("folders")
    .delete()
    .eq("user_id", userId)
    .eq("id", folderId);

  if (error) {
    throw new Error(error.message);
  }
}
