"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CharacterAutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [enabled, router]);

  return null;
}
