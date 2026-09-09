"use client";

import { useId, useState } from "react";

/**
 * "명단에서 내 이름 찾기" — 그룹 링크로 들어온 하객의 **타이핑을 줄이는** 장치.
 *
 * 개인 초대 링크(`?i=`)는 서버가 사람을 특정하므로 이름·연락처가 자동으로 채워진다.
 * 하지만 단톡방에 뿌리는 그룹 링크는 여러 명이 같이 쓰는 한 개의 주소라 누가
 * 눌렀는지 알 수 없다. 그래서 **직접 고르게** 한다.
 *
 * ⚠️ 이건 신원 확인이 **아니다.** 링크를 가진 누구나 아무 이름이나 고를 수 있으므로
 *    이름 하나만 채우고 끝낸다 — 연락처는 본인이 입력해야 한다. 이름을 골랐다고
 *    연락처까지 채워주면 그룹 링크가 곧 남의 정보 조회 수단이 된다.
 *
 * 목록은 눌렀을 때만 불러온다. 안 누른 사람에게까지 명단을 내려보낼 이유가 없다.
 */
export default function RosterPicker({
  slug,
  onPick,
}: {
  /** 그룹 슬러그 — 없으면(개인 주문 페이지) 아무것도 그리지 않는다 */
  slug?: string | null;
  onPick: (name: string) => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  if (!slug) return null;

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/delivery/group/roster?slug=${encodeURIComponent(slug)}`,
        { cache: "no-store" }
      );
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { names?: string[] };
      setNames(Array.isArray(j.names) ? j.names : []);
    } catch {
      setError("명단을 불러오지 못했어요. 성함을 직접 입력해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && names === null && !busy) load();
  };

  const filtered =
    names && q.trim() ? names.filter((n) => n.includes(q.trim())) : names;

  return (
    <div className="text-left">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="text-xs text-delivery font-bold underline underline-offset-2"
      >
        {open ? "닫기" : "명단에서 내 이름 찾기 👤"}
      </button>

      {open && (
        <div
          id={panelId}
          className="mt-2 rounded-2xl border border-delivery/20 bg-white p-3 space-y-2"
        >
          {busy && <p className="text-xs text-neutral-500">불러오는 중…</p>}
          {error && <p className="text-xs text-delivery-dark">{error}</p>}

          {names !== null && names.length === 0 && !error && (
            <p className="text-xs text-neutral-500">
              등록된 명단이 없어요. 성함을 직접 입력해주세요.
            </p>
          )}

          {names !== null && names.length > 0 && (
            <>
              {names.length > 12 && (
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="이름 검색"
                  aria-label="이름 검색"
                  className="w-full rounded-full border border-neutral-200 px-3 py-2 text-sm"
                />
              )}
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {filtered?.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      onPick(n);
                      setOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-full border border-delivery/30 text-sm text-neutral-700 active:scale-95 transition-transform"
                  >
                    {n}
                  </button>
                ))}
                {filtered?.length === 0 && (
                  <p className="text-xs text-neutral-500">
                    찾는 이름이 없어요. 직접 입력해주세요.
                  </p>
                )}
              </div>
              <p className="text-[11px] text-neutral-400">
                이름만 채워집니다. 연락처는 직접 입력해주세요.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
