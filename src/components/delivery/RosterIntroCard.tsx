"use client";

import { useState } from "react";
import { useRoster } from "@/components/delivery/useRoster";
import RosterNameList from "@/components/delivery/RosterNameList";

/**
 * 그룹 페이지 **첫 화면**의 "명단에서 본인 고르기".
 *
 * 개인 초대 링크(`?i=`)는 서버가 사람을 특정하므로 이름·연락처가 자동으로
 * 채워진다. 단톡방에 뿌리는 그룹 링크는 한 개의 주소를 여러 명이 같이 쓰므로
 * 누가 눌렀는지 알 수 없다 — 그래서 **직접 고르게** 한다.
 *
 * 처음에는 이걸 이름 입력칸 옆 작은 링크로만 뒀는데, 메뉴를 누르고 들어가야
 * 나오는 자리라 **있는 줄도 모르고 지나쳤다** (2026-09-09). 고를 기회는 폼에
 * 들어가기 전, 페이지를 열자마자 와야 한다. 여기서 한 번 고르면 아래 신청서
 * (직접배달·합류·제안 수락·마음배송)에 이름이 채워진 채로 들어간다.
 *
 * ⚠️ 이름을 골랐다는 사실은 **신원 확인이 아니다.** 링크를 가진 누구나 아무
 *    이름이나 고를 수 있으므로 이름만 채우고 끝낸다 — 연락처는 본인이 입력한다.
 *    (연락처까지 채워주면 그룹 링크가 곧 남의 정보 조회 수단이 된다.)
 */
export default function RosterIntroCard({
  slug,
  picked,
  onPick,
}: {
  slug: string;
  /** 이미 고른 이름 — 있으면 확인 상태로 보여준다 */
  picked: string | null;
  onPick: (name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const roster = useRoster(slug);

  // 명단이 비어 있다고 확인된 그룹에서는 카드를 접는다 (열어봤자 할 게 없다)
  if (roster.names !== null && roster.names.length === 0 && !picked) return null;

  if (picked) {
    return (
      <section className="max-w-md mx-auto px-5 pb-4" aria-label="명단에서 고른 이름">
        <div className="rounded-2xl border border-delivery/30 bg-delivery/5 p-4 flex items-center gap-3">
          <span className="text-xl">👋</span>
          <p className="flex-1 text-sm text-neutral-700">
            <b className="text-neutral-900">{picked}</b>님으로 채워둘게요.
          </p>
          <button
            type="button"
            onClick={() => {
              onPick(null);
              setOpen(true);
              roster.load();
            }}
            className="shrink-0 text-xs text-delivery font-bold underline underline-offset-2"
          >
            다시 고르기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-md mx-auto px-5 pb-4" aria-label="명단에서 본인 고르기">
      <div className="rounded-2xl border border-delivery/20 bg-white p-4 space-y-3">
        <div>
          <h2 className="font-bold text-neutral-800 text-sm">
            이 모임 명단에 계신가요? 👤
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            이름을 고르면 아래 신청서에 미리 채워둘게요.
          </p>
        </div>

        {!open ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              roster.load();
            }}
            className="w-full rounded-full bg-delivery text-white text-sm font-bold py-3 active:scale-95 transition-transform"
          >
            명단에서 내 이름 고르기
          </button>
        ) : (
          <RosterNameList roster={roster} onPick={(n) => onPick(n)} />
        )}
      </div>
    </section>
  );
}
