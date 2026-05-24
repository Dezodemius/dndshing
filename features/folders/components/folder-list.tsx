import Link from "next/link";
import { Trash2 } from "lucide-react";

import { deleteFolderAction } from "@/features/folders/actions";
import type { Folder } from "@/features/folders/domain";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

function formatDate(value: string | null) {
  if (!value) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

export function FolderList({ folders }: { folders: Folder[] }) {
  if (folders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">Папок пока нет.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {folders.map((folder) => (
        <Card key={folder.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="truncate">
                <Link className="hover:underline" href={`/folders/${folder.id}`}>
                  {folder.name}
                </Link>
              </CardTitle>
              <CardDescription>{formatDate(folder.gameDate)}</CardDescription>
            </div>
            <form action={deleteFolderAction}>
              <input name="folderId" type="hidden" value={folder.id} />
              <Button aria-label="Удалить папку" size="icon" type="submit" variant="ghost">
                <Trash2 className="h-4 w-4" />
              </Button>
            </form>
          </CardHeader>
          {folder.description ? (
            <CardContent>
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                {folder.description}
              </p>
            </CardContent>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
