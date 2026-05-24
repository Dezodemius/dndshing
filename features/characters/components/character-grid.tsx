import type { CharacterSummary } from "@/features/characters/domain";

import { CharacterCard } from "./character-card";

export function CharacterGrid({ characters }: { characters: CharacterSummary[] }) {
  if (characters.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">
          В этой папке пока нет персонажей. Новые карточки появятся после успешного webhook.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {characters.map((character) => (
        <CharacterCard character={character} key={character.id} />
      ))}
    </div>
  );
}
