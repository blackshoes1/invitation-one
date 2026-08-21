"use client";

import { useEffect, useState } from "react";
import type { TimeSlot } from "@/lib/wedding";
import { DRAFT_KEY, type Draft, type Rider } from "./types";

/** 입력값 보존 — 새로고침/이탈 후 재진입 시 이어서 (날짜·시간·기사·메시지만) */
export function useDeliveryDraft(done: boolean) {
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [rider, setRider] = useState<Rider | null>(null);
  const [message, setMessage] = useState("");

  // 입력값 보존 — 새로고침/이탈 후 재진입 시 이어서
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        // P2-3: 개인정보(이름·연락처·배송지)는 초안에 저장하지 않는다 — 날짜·시간·기사·메시지만 복원
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDate(d.date ?? null);
        setSlot(d.slot ?? null);
        setRider(d.rider ?? null);
        setMessage(d.message ?? "");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (done) return;
    const d: Draft = { date, slot, rider, message };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [date, slot, rider, message, done]);

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
