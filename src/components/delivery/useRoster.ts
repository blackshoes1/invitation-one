"use client";

import { useCallback, useState } from "react";
import type { RosterName } from "@/lib/roster";

/**
 * 그룹 명단의 **이름만** 가져온다 (`/api/delivery/group/roster`).
 *
 * 눌렀을 때만 부른다 — 안 고르는 사람에게까지 명단을 내려보낼 이유가 없다.
 * 한 번 불러오면 다시 부르지 않는다.
 */
export interface Roster {
  /** null = 아직 안 불러옴 */
  names: RosterName[] | null;
  busy: boolean;
  error: string | null;
  load: () => void;
}

export function useRoster(slug?: string | null): Roster {
  const [names, setNames] = useState<RosterName[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug || busy || names !== null) return;
    setBusy(true);
    setError(null);
    fetch(`/api/delivery/group/roster?slug=${encodeURIComponent(slug)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { names?: RosterName[] }) =>
        setNames(Array.isArray(j.names) ? j.names : [])
      )
      .catch(() => setError("명단을 불러오지 못했어요. 성함을 직접 입력해주세요."))
      .finally(() => setBusy(false));
  }, [slug, busy, names]);

  return { names, busy, error, load };
}
