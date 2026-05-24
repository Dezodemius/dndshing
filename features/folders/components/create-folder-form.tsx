import { CalendarPlus, FolderPlus } from "lucide-react";

import { createFolderAction } from "@/features/folders/actions";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

export function CreateFolderForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Новая папка</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={createFolderAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" name="name" placeholder="Кампания: Северные земли" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Короткий контекст игры, партии или one-shot"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gameDate">Дата игры</Label>
            <div className="relative">
              <CalendarPlus className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" id="gameDate" name="gameDate" type="date" />
            </div>
          </div>
          <Button className="justify-self-start" type="submit">
            <FolderPlus className="h-4 w-4" />
            Создать
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
