import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CharacterAutoRefresh } from "@/features/characters/components/character-auto-refresh";
import { CharacterGrid } from "@/features/characters/components/character-grid";
import { listCharactersByFolder } from "@/features/characters/repository";
import { getFolderById } from "@/features/folders/repository";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { Button } from "@/shared/ui/button";

export const dynamic = "force-dynamic";

type FolderPageProps = {
  params: Promise<{
    folderId: string;
  }>;
};

export default async function FolderPage({ params }: FolderPageProps) {
  const { folderId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [folder, characters] = await Promise.all([
    getFolderById(supabase, user.id, folderId),
    listCharactersByFolder(supabase, user.id, folderId)
  ]);

  if (!folder) {
    notFound();
  }

  const hasActiveProcessing = characters.some((character) =>
    ["received", "processing"].includes(character.processingStatus)
  );

  return (
    <div className="space-y-6">
      <CharacterAutoRefresh enabled={hasActiveProcessing} />
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Button asChild className="-ml-3 mb-3" size="sm" variant="ghost">
            <Link href="/dashboard">Назад</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-normal">{folder.name}</h1>
          {folder.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {folder.description}
            </p>
          ) : null}
        </div>
        <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
          Webhook folderId: <span className="font-mono text-foreground">{folder.id}</span>
        </div>
      </div>
      <CharacterGrid characters={characters} />
    </div>
  );
}
