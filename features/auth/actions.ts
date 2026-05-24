"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getPublicEnv } from "@/shared/config/env";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function signInWithGoogleAction() {
  const supabase = await createSupabaseServerClient();
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? getPublicEnv().NEXT_PUBLIC_SITE_URL;
  const redirectTo = `${origin}/api/auth/callback?next=/dashboard`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.url) {
    throw new Error("Supabase did not return an OAuth redirect URL.");
  }

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
