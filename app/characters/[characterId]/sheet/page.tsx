import { notFound, redirect } from "next/navigation";

import { CharacterSheet } from "@/features/characters/components/character-sheet";
import { getCharacterDetail } from "@/features/characters/repository";
import { LssCharacterJsonSchema, parseLssCharacterData } from "@/features/lss/schema";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ characterId: string }>;
};

export default async function CharacterSheetPage({ params }: Props) {
  const { characterId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const character = await getCharacterDetail(supabase, user.id, characterId);
  if (!character) notFound();

  if (!character.generatedJsonPath) {
    redirect(`/characters/${characterId}`);
  }

  let lssData;
  try {
    const lssJson = LssCharacterJsonSchema.parse(character.generatedJson);
    lssData = parseLssCharacterData(lssJson.data);
  } catch {
    redirect(`/characters/${characterId}`);
  }

  return (
    <CharacterSheet
      initialData={lssData}
      characterId={characterId}
      folderId={character.folderId}
    />
  );
}
