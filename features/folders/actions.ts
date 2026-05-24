"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/shared/supabase/server";

import {
  CreateFolderInputSchema,
  DeleteFolderInputSchema
} from "./domain";
import { createFolder, deleteFolder } from "./repository";

async function requireUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, userId: user.id };
}

export async function createFolderAction(formData: FormData) {
  const { supabase, userId } = await requireUserId();
  const input = CreateFolderInputSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    gameDate: formData.get("gameDate") || undefined
  });

  await createFolder(supabase, userId, input);
  revalidatePath("/dashboard");
}

export async function deleteFolderAction(formData: FormData) {
  const { supabase, userId } = await requireUserId();
  const input = DeleteFolderInputSchema.parse({
    folderId: formData.get("folderId")
  });

  await deleteFolder(supabase, userId, input.folderId);
  revalidatePath("/dashboard");
}
