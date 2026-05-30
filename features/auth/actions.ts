"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getPublicEnv } from "@/shared/config/env";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type RequestHeaders = Awaited<ReturnType<typeof headers>>;

function getFirstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || undefined;
}

function isLocalHost(host: string) {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function getRequestOrigin(requestHeaders: RequestHeaders) {
  const explicitOrigin = requestHeaders.get("origin");

  if (explicitOrigin) {
    return explicitOrigin;
  }

  const forwardedHost = getFirstHeaderValue(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  );

  if (!forwardedHost) {
    return getPublicEnv().NEXT_PUBLIC_SITE_URL;
  }

  const forwardedProto =
    getFirstHeaderValue(requestHeaders.get("x-forwarded-proto")) ??
    (isLocalHost(forwardedHost) ? "http" : "https");

  return `${forwardedProto}://${forwardedHost}`;
}

export async function signInWithGoogleAction() {
  const supabase = await createSupabaseServerClient();
  const requestHeaders = await headers();
  const origin = getRequestOrigin(requestHeaders);
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
