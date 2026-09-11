"use client";

import { useEffect, useState } from "react";
import type { GuestPhotoAdmin } from "@/lib/supabase";
import type { TabCtx } from "@/app/admin/shared";

/** 하객 스냅 탭 — 모더레이션(숨김/삭제) + QR/라이브월 바로가기. 마운트 시 자체 로드. */
export default function SnapTab({ api, setError, setNotice: _setNotice }: TabCtx) {
  void _setNotice; // TabCtx 시그니처 유지용 (이 탭은 notice 미사용)
  const [snaps, setSnaps] = useState<GuestPhotoAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  /** P2-1 전체 공개 스위치 — false 면 공개 갤러리 일시중지 (파일 보존, 관리자는 계속 봄) */
  const [snapPublic, setSnapPublic] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, settingsRes] = await Promise.all([
          api("/api/admin/guest-photos"),
          api("/api/admin/settings"),
        ]);
        const j = await res.json();
        if (alive) setSnaps(res.ok ? j.photos ?? [] : []);
        if (settingsRes.ok) {
          const s = (await settingsRes.json()).settings ?? {};
          // 명시적 false 만 중지 상태 (미설정 = 공개, DB RPC 와 동일 규칙)
          if (alive) setSnapPublic(!(s.guest_snap_public === false || s.guest_snap_public === "false"));
        }
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

  const togglePublic = async () => {
    if (snapPublic === null || switching) return;
    const next = !snapPublic;
    if (
      !next &&
      !confirm(
        "하객 스냅 공개를 일시중지할까요?\n청첩장·라이브 월에서 사진이 모두 숨겨집니다.\n(파일은 삭제되지 않으며 관리자는 계속 볼 수 있어요)"
      )
    )
      return;
    setSwitching(true);
    try {
      const res = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ key: "guest_snap_public", value: next }),
      });
      if (res.ok) setSnapPublic(next);
      else setError("공개 설정 변경에 실패했습니다.");
    } catch {
      setError("공개 설정 변경 요청이 실패했습니다.");
    } finally {
      setSwitching(false);
    }
  };

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
      {/* P2-1 긴급 모더레이션 — 전체 공개 일시중지 */}
      {snapPublic !== null && (
        <div
          className={`flex items-center justify-between gap-2 border p-3 ${
            snapPublic ? "bg-white border-wedding-gold/20" : "bg-red-50 border-red-200"
          }`}
        >
          <p className="text-xs text-neutral-600">
            {snapPublic ? (
              <>🟢 하객 스냅 공개 중 — 문제가 생기면 즉시 전체 숨김 가능</>
            ) : (
              <b className="text-red-600">
                ⛔ 전체 공개 일시중지됨 — 청첩장·라이브 월에서 숨겨져 있어요
              </b>
            )}
          </p>
          <button
            onClick={togglePublic}
            disabled={switching}
            className={`shrink-0 px-3 py-1.5 text-xs rounded-full disabled:opacity-60 ${
              snapPublic
                ? "border border-red-300 text-red-500 bg-white"
                : "bg-sage-600 text-white"
            }`}
          >
            {switching ? "변경 중…" : snapPublic ? "전체 공개 중지" : "공개 재개"}
          </button>
        </div>
      )}
      <p className="text-[11px] text-neutral-400 text-center">
        하객이 올린 사진입니다. 부적절한 사진은 숨기거나 삭제하세요.
        NAS 보관은 별도 연결이 필요합니다. 삭제 전 NAS에 저장됐는지 확인해주세요.
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
