"use client";

import { useEffect, useState } from "react";
import type { WaitingEntry } from "@/lib/supabase";
import type { TabCtx } from "@/app/admin/shared";

/** 대기자 탭 — 목록·빈자리 안내 SMS·삭제. 데이터는 마운트 시 자체 로드. */
export default function WaitingTab({ api, setError, setNotice }: TabCtx) {
  const [waiting, setWaiting] = useState<WaitingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api("/api/admin/waiting");
        const j = await res.json();
        if (alive) setWaiting(res.ok ? j.waiting ?? [] : []);
      } catch {
        if (alive) setError("대기자 목록을 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // 마운트 시 1회 로드 (탭 전환 시 컴포넌트가 다시 마운트됨)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteWaiting = async (id: string) => {
    if (!confirm("이 대기자를 삭제할까요? (되돌릴 수 없어요)")) return;
    try {
      const res = await api(`/api/admin/waiting/${id}`, { method: "DELETE" });
      if (res.ok) setWaiting((w) => w.filter((x) => x.id !== id));
      else if (res.status !== 401) setError("대기자 삭제에 실패했습니다.");
    } catch {
      setError("대기자 삭제 요청이 실패했습니다.");
    }
  };

  const notifyWaiting = async (id?: string) => {
    setNotice(null);
    setError(null);
    const who = id ? "선택한 대기자" : `대기자 ${waiting.length}명`;
    if (!confirm(`${who}에게 빈자리 안내 SMS를 보낼까요?`)) return;
    try {
      const res = await api("/api/admin/waiting/notify", {
        method: "POST",
        body: JSON.stringify(id ? { id } : {}),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? "알림 발송 실패");
      setNotice(
        j.skipped
          ? `${j.count}명 대상 — SMS는 솔라피 키 미설정으로 미발송(로그만).`
          : `${j.sent}/${j.count}명에게 빈자리 안내 SMS 발송 완료.`
      );
    } catch {
      setError("알림 발송 요청이 실패했습니다. 네트워크를 확인해주세요.");
    }
  };

  return (
    <>
      {loading && (
        <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
      )}
      {!loading && waiting.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-10">
          대기자가 없습니다.
        </p>
      )}
      {waiting.length > 0 && (
        <button
          onClick={() => notifyWaiting()}
          className="w-full py-2.5 text-xs tracking-wider bg-delivery text-white rounded-sm"
        >
          📣 대기자 전체에게 빈자리 안내 SMS
        </button>
      )}
      <div className="space-y-2">
        {waiting.map((w, i) => (
          <div
            key={w.id}
            className="bg-white border border-wedding-gold/15 p-3 flex items-center gap-3 text-sm"
          >
            <span className="text-xs text-neutral-400 w-6 text-center">
              {i + 1}
            </span>
            <span className="font-medium text-sage-700">{w.name}</span>
            <span className="text-xs text-neutral-400 ml-auto">
              {w.phone}
            </span>
            <button
              onClick={() => notifyWaiting(w.id)}
              className="text-xs text-delivery"
            >
              알림
            </button>
            <button
              onClick={() => deleteWaiting(w.id)}
              className="text-xs text-red-400"
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
