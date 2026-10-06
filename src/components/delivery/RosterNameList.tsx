"use client";

import { useState } from "react";
import type { Roster } from "@/components/delivery/useRoster";
import type { PickedName } from "@/lib/roster";

/**
 * 명단 이름 목록 — 고르면 `onPick({ name, usePhone })`.
 *
 * `usePhone` 은 **번호를 화면에 보여준다는 뜻이 아니다.** 제출할 때 서버가
 * 명단에서 붙여준다는 뜻이다 (번호는 마스킹본조차 브라우저로 내려오지 않는다).
 * 명단에 번호가 없거나 동명이인이면 `hasPhone:false` 라 직접 입력해야 한다.
 */
export default function RosterNameList({
  roster,
  onPick,
}: {
  roster: Roster;
  onPick: (picked: PickedName) => void;
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

  const filtered = q.trim() ? names.filter((n) => n.name.includes(q.trim())) : names;

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
            key={n.name}
            type="button"
            onClick={() => onPick({ name: n.name, usePhone: n.hasPhone })}
            className="px-3 py-1.5 rounded-full border border-delivery/30 text-sm text-neutral-700 active:scale-95 transition-transform"
          >
            {n.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-neutral-500">
            찾는 이름이 없어요. 직접 입력해주세요.
          </p>
        )}
      </div>
    </div>
  );
}
