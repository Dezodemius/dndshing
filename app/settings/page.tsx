import { redirect } from "next/navigation";

import { saveAiSettingsAction } from "@/features/ai/settings.actions";
import { getAiSettingsPreview } from "@/features/ai/settings.repository";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const settings = await getAiSettingsPreview(supabase, user.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Настройки AI</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Используется OpenAI-compatible chat completions API. Ключ сохраняется в
          Supabase и не показывается повторно.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Провайдер</CardTitle>
          <CardDescription>
            Подойдёт OpenAI, OpenRouter или локальный endpoint с совместимым API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveAiSettingsAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="apiBaseUrl">API base URL</Label>
              <Input
                defaultValue={settings?.apiBaseUrl ?? ""}
                id="apiBaseUrl"
                name="apiBaseUrl"
                placeholder="https://api.openai.com/v1"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="modelName">Model</Label>
              <Input
                defaultValue={settings?.modelName ?? ""}
                id="modelName"
                name="modelName"
                placeholder="gpt-4o-mini"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API key</Label>
              <Input
                id="apiKey"
                name="apiKey"
                placeholder={settings?.hasApiKey ? "Ключ уже сохранён" : "sk-..."}
                type="password"
              />
            </div>
            <Button className="justify-self-start" type="submit">
              Сохранить
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
