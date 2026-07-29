"use client";

import { useEffect, useState } from "react";
import type { GuestPhotoAdmin } from "@/lib/supabase";
import type { TabCtx } from "@/app/admin/shared";

/** 하객 스냅 탭 — 모더레이션(숨김/삭제) + QR/라이브월 바로가기. 마운트 시 자체 로드. */
export default function SnapTab({ api, setError, setNotice: _setNotice }: TabCtx) {
  void _setNotice; // TabCtx 시그니처 유지용 (이 탭은 notice 미사용)
  const [snaps, setSnaps] = useState<GuestPhotoAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api("/api/admin/guest-photos");
        const j = await res.json();
        if (alive) setSnaps(res.ok ? j.photos ?? [] : []);
      } catch {
        if (alive) setError("하객 스냅을 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSnap = async (id: string, approved: boolean) => {
    try {
      const res = await api("/api/admin/guest-photos", {
        method: "PATCH",
        body: JSON.stringify({ id, approved }),
      });
      if (res.ok)
        setSnaps((s) => s.map((p) => (p.id === id ? { ...p, approved } : p)));
      else if (res.status !== 401) setError("사진 상태 변경에 실패했습니다.");
    } catch {
      setError("사진 상태 변경 요청이 실패했습니다.");
    }
  };

  const deleteSnap = async (id: string) => {
    if (!confirm("이 사진을 삭제할까요? (되돌릴 수 없어요)")) return;
    try {
      const res = await api(`/api/admin/guest-photos?id=${id}`, { method: "DELETE" });
      if (res.ok) setSnaps((s) => s.filter((p) => p.id !== id));
      else if (res.status !== 401) setError("사진 삭제에 실패했습니다.");
    } catch {
      setError("사진 삭제 요청이 실패했습니다.");
    }
  };

  return (
    <>
      <div className="flex justify-center gap-2">
        <a
          href="/table-qr"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-xs border border-sage-300 text-sage-600 bg-white"
        >
          🖨️ 테이블 QR 카드 인쇄
        </a>
        <a
          href="/live"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-xs border border-sage-300 text-sage-600 bg-white"
        >
          📺 라이브 월 열기 (스크린용)
        </a>
      </div>
      <p className="text-[11px] text-neutral-400 text-center">
        하객이 올린 사진입니다. 부적절한 사진은 숨기거나 삭제하세요. 원본은
        NAS(Cloud Sync)에 자동 보관돼요.
      </p>
      {loading && (
        <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
      )}
      {!loading && snaps.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-10">
          아직 올라온 사진이 없습니다.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {snaps.map((p) => (
          <div
            key={p.id}
            className="bg-white border border-wedding-gold/15 overflow-hidden"
          >
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.name ?? "하객 스냅"}
                className={`w-full aspect-square object-cover ${
                  p.approved ? "" : "opacity-40"
                }`}
              />
            </a>
            <div className="p-2 space-y-1">
              <p className="text-[11px] text-neutral-500 truncate">
                {p.name ?? "익명"} ·{" "}
                {new Date(p.created_at).toLocaleDateString("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => toggleSnap(p.id, !p.approved)}
                  className={`flex-1 py-1 text-[11px] border ${
                    p.approved
                      ? "border-neutral-300 text-neutral-500"
                      : "border-sage-400 text-sage-600 bg-sage-50"
                  }`}
                >
                  {p.approved ? "숨기기" : "공개하기"}
                </button>
                <button
                  onClick={() => deleteSnap(p.id)}
                  className="px-2.5 py-1 text-[11px] border border-red-200 text-red-400"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
