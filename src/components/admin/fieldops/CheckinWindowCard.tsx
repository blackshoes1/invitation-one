"use client";

import { useEffect, useState } from "react";
import type { Flash } from "./types";

/** 체크인 운영 시간 (§10 — 서버 전용 site_settings 키) */
export default function CheckinWindowCard({
  busy,
  setBusy,
  flash,
}: {
  busy: string | null;
  setBusy: (key: string | null) => void;
  flash: Flash;
}) {
  const [ckEnabled, setCkEnabled] = useState(false);
  const [ckOpen, setCkOpen] = useState("");
  const [ckClose, setCkClose] = useState("");
  const [ckLoaded, setCkLoaded] = useState(false);

  // 운영 시간 설정 로드 (1회)
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) return;
      const j = await res.json();
      const s = j.settings ?? {};
      setCkEnabled(s.checkin_enabled === true);
      // datetime-local 형식 (로컬 기준 YYYY-MM-DDTHH:mm)
      const toLocal = (v: unknown) => {
        if (typeof v !== "string") return "";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return "";
        const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
      };
      setCkOpen(toLocal(s.checkin_open_at));
      setCkClose(toLocal(s.checkin_close_at));
      setCkLoaded(true);
    })();
  }, []);

  const saveWindow = async () => {
    if (busy) return;
    setBusy("window");
    try {
      const put = (key: string, value: unknown) =>
        fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
      const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
      const results = await Promise.all([
        put("checkin_enabled", ckEnabled),
        put("checkin_open_at", toIso(ckOpen)),
        put("checkin_close_at", toIso(ckClose)),
      ]);
      flash(results.every((r) => r.ok) ? "운영 시간을 저장했어요" : "⚠ 일부 저장 실패");
    } finally {
      setBusy(null);
    }
  };

  if (!ckLoaded) return null;

  return (
    <div className="bg-white border border-wedding-gold/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-neutral-400">공개 체크인 운영</p>
        <button
          onClick={() => setCkEnabled((v) => !v)}
          className={`px-3 py-1 text-[11px] border rounded-full ${
            ckEnabled
              ? "bg-sage-600 text-white border-sage-600"
              : "bg-white text-neutral-400 border-wedding-gold/25"
          }`}
        >
          {ckEnabled ? "운영 중" : "닫힘"}
        </button>
      </div>
      <div className="flex gap-2 items-center text-[11px] text-neutral-400 flex-wrap">
        <label className="flex items-center gap-1">
          오픈
          <input
            type="datetime-local"
            value={ckOpen}
            onChange={(e) => setCkOpen(e.target.value)}
            className="p-1.5 border border-wedding-gold/20 rounded-md text-xs text-neutral-600"
          />
        </label>
        <label className="flex items-center gap-1">
          종료
          <input
            type="datetime-local"
            value={ckClose}
            onChange={(e) => setCkClose(e.target.value)}
            className="p-1.5 border border-wedding-gold/20 rounded-md text-xs text-neutral-600"
          />
        </label>
        <button
          onClick={saveWindow}
          disabled={busy === "window"}
          className="ml-auto px-3 py-1.5 bg-sage-700 text-white text-[11px] rounded-md disabled:opacity-60"
        >
          저장
        </button>
      </div>
      <p className="text-[10px] text-neutral-300">
        관리자 수동 체크인은 운영 시간과 무관하게 항상 가능해요.
      </p>
    </div>
  );
}
