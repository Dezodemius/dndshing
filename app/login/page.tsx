import { redirect } from "next/navigation";

import { signInWithGoogleAction } from "@/features/auth/actions";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вход</CardTitle>
          <CardDescription>
            Авторизация нужна, чтобы привязать папки и персонажей к мастеру игры.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signInWithGoogleAction}>
            <Button className="w-full" type="submit">
              Войти через Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
