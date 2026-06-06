import { NextResponse, type NextRequest } from "next/server";

import { getCharacterJsonForDownload } from "@/features/characters/repository";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type RouteContext = {
  params: Promise<{
    characterId: string;
  }>;
};

function toFileName(characterName: string) {
  return `${characterName
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "character"}-lss.json`;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { characterId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const character = await getCharacterJsonForDownload(supabase, user.id, characterId);

  if (!character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fileName = toFileName(character.characterName);

  return new NextResponse(JSON.stringify(character.generatedJson, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="character-lss.json"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
