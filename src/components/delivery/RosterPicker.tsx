"use client";

import { useId, useState } from "react";
import { useRoster } from "@/components/delivery/useRoster";
import RosterNameList from "@/components/delivery/RosterNameList";

/**
 * 입력칸 옆에 붙는 작은 "명단에서 고르기" — **보조 수단**이다.
 *
 * 주 수단은 그룹 페이지 첫 화면의 `RosterIntroCard` 다. 거기서 한 번 고르면
 * 이 폼들에는 이미 이름이 채워져 들어온다. 이건 그걸 지나쳤거나 다른 사람
 * 이름으로 바꾸려는 사람을 위한 것이라, 눈에 덜 띄어도 된다.
 *
 * ⚠️ 이름을 골랐다는 사실은 신원 확인이 아니다 — 이름만 채우고 끝낸다.
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
  const roster = useRoster(slug);

  if (!slug) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) roster.load();
  };

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
          className="mt-2 rounded-2xl border border-delivery/20 bg-white p-3"
        >
          <RosterNameList
            roster={roster}
            onPick={(n) => {
              onPick(n);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
