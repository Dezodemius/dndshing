"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/shared/supabase/server";

import { AiSettingsFormSchema } from "./domain";
import { upsertAiSettings } from "./settings.repository";

export async function saveAiSettingsAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const input = AiSettingsFormSchema.parse({
    apiBaseUrl: formData.get("apiBaseUrl"),
    apiKey: formData.get("apiKey") || undefined,
    modelName: formData.get("modelName")
  });

  await upsertAiSettings(supabase, user.id, input);
  revalidatePath("/settings");
}
