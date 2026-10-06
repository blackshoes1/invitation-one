"use client";

import { useEffect } from "react";

/** Re-read server state when returning from an admin/chat tab or browser history. */
export function useRefreshOnReturn(refresh: () => Promise<void>) {
  useEffect(() => {
    let running = false;
    const update = () => {
      if (document.visibilityState === "hidden" || running) return;
      running = true;
      void refresh().catch(() => {}).finally(() => { running = false; });
    };
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
}
