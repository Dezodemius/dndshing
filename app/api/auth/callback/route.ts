import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/shared/config/env";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";
  const siteUrl = getPublicEnv().NEXT_PUBLIC_SITE_URL;

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${error.message}`, siteUrl));
    }
  }

  return NextResponse.redirect(new URL(next, siteUrl));
}
