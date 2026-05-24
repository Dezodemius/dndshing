import { Download } from "lucide-react";

import type { CharacterSummary } from "@/features/characters/domain";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card";

function initials(characterName: string) {
  return characterName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function CharacterCard({ character }: { character: CharacterSummary }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary bg-cover bg-center text-sm font-semibold text-secondary-foreground"
          style={
            character.avatarUrl
              ? {
                  backgroundImage: `url(${character.avatarUrl})`
                }
              : undefined
          }
        >
          {character.avatarUrl ? null : initials(character.characterName)}
        </div>
        <div className="min-w-0">
          <CardTitle className="truncate">{character.characterName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{character.playerName}</p>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Раса</dt>
            <dd className="mt-1 font-medium">{character.race}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Класс</dt>
            <dd className="mt-1 font-medium">{character.class}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full" variant="outline">
          <a href={`/api/characters/${character.id}/download`}>
            <Download className="h-4 w-4" />
            Скачать JSON
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
