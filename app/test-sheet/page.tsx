// Test-only page — renders CharacterSheet with fixture data, no auth required.
// Only available in development; returns 404 in production.
import { notFound } from "next/navigation";

import { CharacterSheet } from "@/features/characters/components/character-sheet";
import { KEILIN_LSS_DATA } from "@/tests/fixtures/keilin";

export default function TestSheetPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <CharacterSheet
      initialData={KEILIN_LSS_DATA}
      characterId="test-id"
      folderId="test-folder-id"
    />
  );
}
