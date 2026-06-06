"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/shared/supabase/server";
import { generateCharacterFromDraft } from "@/features/webhooks/pipeline";

export async function generateCharacterAction(characterId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await generateCharacterFromDraft(characterId, user.id);

  revalidatePath(`/characters/${characterId}`);
}
