"use client";

import { useEffect, useState } from "react";
import type { TimeSlot } from "@/lib/wedding";
import { DRAFT_KEY, type Draft, type Rider } from "./types";

/** 입력값 보존 — 새로고침/이탈 후 재진입 시 이어서 (날짜·시간·기사·메시지만) */
export function useDeliveryDraft(done: boolean, scope: string) {
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [scopeHash, setScopeHash] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [rider, setRider] = useState<Rider | null>(null);
  const [message, setMessage] = useState("");

  // 입력값 보존 — 새로고침/이탈 후 재진입 시 이어서
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let hash: string | null = null;
      let draft: Partial<Draft> = {};
      try {
        // 원본 초대·관리 토큰은 저장하지 않는다. 예전 소유자 없는 초안도 복원하지 않는다.
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
        hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
        if (cancelled) return;
        const raw = sessionStorage.getItem(DRAFT_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved?.scope === hash) draft = saved.draft ?? {};
        else sessionStorage.removeItem(DRAFT_KEY);
      } catch { /* storage unavailable: continue with an empty, unsaved form */ }
      if (cancelled) return;
      setDate(draft.date ?? null);
      setSlot(draft.slot ?? null);
      setRider(draft.rider ?? null);
      setMessage(draft.message ?? "");
      setScopeHash(hash);
      setLoadedScope(scope);
    })();
    return () => { cancelled = true; };
  }, [scope]);

  useEffect(() => {
    if (done || loadedScope !== scope || !scopeHash) return;
    const d: Draft = { date, slot, rider, message };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ scope: scopeHash, draft: d }));
    } catch {
      /* ignore */
    }
  }, [date, slot, rider, message, done, loadedScope, scope, scopeHash]);

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  };

  return {
    date,
    setDate,
    slot,
    setSlot,
    rider,
    setRider,
    message,
    setMessage,
    clearDraft,
  };
}
