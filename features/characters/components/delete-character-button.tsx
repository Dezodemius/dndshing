"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { deleteCharacterAction } from "@/features/characters/actions";
import { Button } from "@/shared/ui/button";

export function DeleteCharacterButton({
  characterId,
  size = "default",
  label = "Удалить персонажа",
  className,
}: {
  characterId: string;
  size?: "default" | "sm";
  label?: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !window.confirm(
        "Удалить персонажа? Лист и сгенерированный JSON будут удалены безвозвратно."
      )
    ) {
      return;
    }

    startTransition(async () => {
      await deleteCharacterAction(characterId);
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size={size}
      disabled={isPending}
      onClick={handleDelete}
      className={className}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
