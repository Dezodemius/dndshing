// Test-only page — renders CharacterSheet with fixture data, no auth required.
// Used by Playwright e2e tests.
import { CharacterSheet } from "@/features/characters/components/character-sheet";
import { KEILIN_LSS_DATA } from "@/tests/fixtures/keilin";

export default function TestSheetPage() {
  return (
    <CharacterSheet
      initialData={KEILIN_LSS_DATA}
      characterId="test-id"
      folderId="test-folder-id"
    />
  );
}
