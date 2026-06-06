"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { generateCharacterAction } from "@/features/characters/actions";

export function GenerateButton({ characterId }: { characterId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    try {
      await generateCharacterAction(characterId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка генерации");
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" disabled={pending} onClick={handleClick}>
        <Wand2 className="h-4 w-4" />
        {pending ? "Генерация..." : "Сгенерировать персонажа"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
