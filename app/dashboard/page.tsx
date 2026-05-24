import { redirect } from "next/navigation";

import { CreateFolderForm } from "@/features/folders/components/create-folder-form";
import { FolderList } from "@/features/folders/components/folder-list";
import { listFolders } from "@/features/folders/repository";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const folders = await listFolders(supabase, user.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Папки</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Каждая папка хранит персонажей одной игры и используется webhook-ом как
            целевая группа генерации.
          </p>
        </div>
        <FolderList folders={folders} />
      </section>
      <aside>
        <CreateFolderForm />
      </aside>
    </div>
  );
}
