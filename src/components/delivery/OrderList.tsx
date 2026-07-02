"use client";

import type { GroupOrder } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";

const STAGE_EMOJI: Record<string, string> = {
  주문접수: "📦",
  준비중: "👨‍🍳",
  배송출발: "🛵",
  배송완료: "✅",
};

/**
 * 그룹 내 주문 단위 현황 + 합류/다른 날짜 제안
 * (이름 + 날짜 + 배송 단계만 공개 / 연락처·배송지 비공개)
 */
export default function OrderList({
  orders,
  loaded,
  onJoin,
  onPropose,
}: {
  orders: GroupOrder[];
  loaded: boolean;
  onJoin: (order: GroupOrder) => void;
  onPropose: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-bold text-neutral-500">
        ─── 우리 그룹 주문 현황 ───
      </p>

      {!loaded ? (
        <p className="text-center text-sm text-neutral-400 py-4">불러오는 중…</p>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-delivery/10 p-5 text-center">
          <p className="text-sm text-neutral-400">
            아직 주문이 없어요.
            <br />첫 주문을 열어주세요! 🥇
          </p>
          <button
            type="button"
            onClick={onPropose}
            className="mt-4 w-full py-3.5 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform"
          >
            첫 주문 만들기 🛵
          </button>
        </div>
      ) : (
        <>
          {orders.map((o) => {
            const owner = o.member_names[0] ?? "";
            const extra = o.member_names.length - 1;
            const joinable = o.status !== "완료" && o.status !== "취소";
            return (
              <div
                key={o.id}
                className="bg-white rounded-2xl border border-delivery/10 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-neutral-800">
                    🛵 {formatYmdKo(o.date)} {o.time_slot}
                    <span className="font-medium text-neutral-500">
                      {" "}
                      — {owner}
                      {extra > 0 ? ` 외 ${extra}명` : ""}
                    </span>
                  </p>
                  <span className="text-[11px] whitespace-nowrap px-2 py-1 rounded-full bg-delivery/10 text-delivery font-bold">
                    {STAGE_EMOJI[o.tracking_stage] ?? "📦"} {o.tracking_stage}
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  참여: {o.member_names.join(", ")}
                </p>
                {joinable ? (
                  <button
                    type="button"
                    onClick={() => onJoin(o)}
                    className="w-full py-3 rounded-full bg-delivery text-white text-sm font-extrabold active:scale-95 transition-transform"
                  >
                    여기 합류하기 ➕
                  </button>
                ) : (
                  <p className="text-center text-[11px] text-neutral-400 py-1">
                    이 주문은 배송이 끝났어요 ✅
                  </p>
                )}
              </div>
            );
          })}

          <div className="text-center pt-1">
            <p className="text-xs text-neutral-400 mb-2">다 안 맞아요?</p>
            <button
              type="button"
              onClick={onPropose}
              className="px-5 py-2.5 rounded-full bg-white border-2 border-delivery/25 text-delivery text-sm font-bold active:scale-95 transition-transform"
            >
              다른 날짜 제안하기 📅
            </button>
          </div>
        </>
      )}
    </div>
  );
}
