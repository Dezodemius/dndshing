import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { CharacterAutoRefresh } from "@/features/characters/components/character-auto-refresh";
import { GenerateButton } from "@/features/characters/components/generate-button";
import {
  CHARACTER_PROCESSING_STAGE_LABELS,
  CHARACTER_PROCESSING_STAGES
} from "@/features/characters/domain";
import { getCharacterDetail } from "@/features/characters/repository";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

export const dynamic = "force-dynamic";

type CharacterPageProps = {
  params: Promise<{
    characterId: string;
  }>;
};

export default async function CharacterPage({ params }: CharacterPageProps) {
  const { characterId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const character = await getCharacterDetail(supabase, user.id, characterId);

  if (!character) {
    notFound();
  }

  const canDownloadLss = Boolean(character.generatedJsonPath);
  const canDownloadPdf = Boolean(character.pdfPath);
  const canGenerate = character.processingStatus === "received";
  const hasActiveProcessing = ["received", "processing"].includes(character.processingStatus);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <CharacterAutoRefresh enabled={hasActiveProcessing} />
      <div className="min-h-[70vh] rounded-lg border bg-muted/30 p-6">
        {character.pdfPath ? (
          <div className="flex h-full items-center justify-center rounded-md border bg-background text-sm text-muted-foreground">
            PDF preview будет подключён после реализации генератора PDF.
          </div>
        ) : (
          <div className="flex h-full min-h-[420px] items-center justify-center rounded-md border border-dashed bg-background text-sm text-muted-foreground">
            PDF ещё не сформирован.
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/folders/${character.folderId}`}>Назад к папке</Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{character.characterName}</CardTitle>
            <p className="text-sm text-muted-foreground">{character.playerName}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {canGenerate ? <GenerateButton characterId={character.id} /> : null}

            {canDownloadLss ? (
              <Button asChild className="w-full" variant="outline">
                <a href={`/api/characters/${character.id}/download`}>
                  <Download className="h-4 w-4" />
                  Скачать LSS JSON
                </a>
              </Button>
            ) : (
              <Button className="w-full" disabled variant="outline">
                <Download className="h-4 w-4" />
                Скачать LSS JSON
              </Button>
            )}

            <Button className="w-full" disabled={!canDownloadPdf} variant="outline">
              <FileText className="h-4 w-4" />
              Скачать PDF
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Статус обработки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {CHARACTER_PROCESSING_STAGES.map((stage) => {
              const step = character.processingSteps[stage];

              return (
                <div className="space-y-1 text-sm" key={stage}>
                  <div className="flex items-center justify-between gap-3">
                    <span>{CHARACTER_PROCESSING_STAGE_LABELS[stage]}</span>
                    <span className="text-xs text-muted-foreground">{step.status}</span>
                  </div>
                  {step.message ? (
                    <p className="text-xs text-muted-foreground">{step.message}</p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
