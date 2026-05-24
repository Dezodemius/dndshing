import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";

import "./globals.css";
import { signOutAction } from "@/features/auth/actions";
import { Button } from "@/shared/ui/button";

export const metadata: Metadata = {
  title: "D&D Character Generator",
  description: "MVP генерации D&D 5e персонажей для longstoryshort"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <div className="min-h-screen">
          <header className="border-b bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
              <Link className="text-sm font-semibold tracking-normal" href="/dashboard">
                D&D Generator
              </Link>
              <nav className="flex items-center gap-1">
                <Button asChild size="sm" variant="ghost">
                  <Link href="/dashboard">Папки</Link>
                </Button>
                <Button asChild size="icon" variant="ghost">
                  <Link aria-label="Настройки" href="/settings">
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
                <form action={signOutAction}>
                  <Button size="sm" type="submit" variant="outline">
                    Выйти
                  </Button>
                </form>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
