"use client";

import { useState } from "react";
import type { Roster } from "@/components/delivery/useRoster";

/**
 * 명단 이름 목록 — 고르면 `onPick(name)`.
 *
 * 이름을 골랐다는 사실은 **신원 확인이 아니다.** 링크를 가진 누구나 아무 이름이나
 * 고를 수 있으므로 이름 하나만 채우고 끝낸다 (연락처는 본인이 입력한다).
 */
export default function RosterNameList({
  roster,
  onPick,
}: {
  roster: Roster;
  onPick: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const { names, busy, error } = roster;

  if (busy) return <p className="text-xs text-neutral-500">불러오는 중…</p>;
  if (error) return <p className="text-xs text-delivery-dark">{error}</p>;
  if (names === null) return null;
  if (names.length === 0)
    return (
      <p className="text-xs text-neutral-500">
        등록된 명단이 없어요. 성함을 직접 입력해주세요.
      </p>
    );

  const filtered = q.trim() ? names.filter((n) => n.includes(q.trim())) : names;

  return (
    <div className="space-y-2">
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
        {filtered.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className="px-3 py-1.5 rounded-full border border-delivery/30 text-sm text-neutral-700 active:scale-95 transition-transform"
          >
            {n}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-neutral-500">
            찾는 이름이 없어요. 직접 입력해주세요.
          </p>
        )}
      </div>
      <p className="text-[11px] text-neutral-400">
        이름만 채워집니다. 연락처는 직접 입력해주세요.
      </p>
    </div>
  );
}
