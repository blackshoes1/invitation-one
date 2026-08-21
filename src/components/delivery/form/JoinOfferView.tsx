"use client";

import { formatYmdKo } from "@/lib/wedding";
import type { DateOrder } from "./types";

/** 합석 제안 — 같은 날 먼저 신청한 분이 있을 때 */
export default function JoinOfferView({
  date,
  orders,
  sending,
  error,
  onAccept,
  onDecline,
  onBack,
}: {
  date: string;
  orders: DateOrder[];
  sending: boolean;
  error: string | null;
  onAccept: (order: DateOrder) => void;
  /** 따로 받기 → 시간대 선택으로 진행 */
  onDecline: () => void;
  /** ← 날짜 다시 고르기 */
  onBack: () => void;
}) {
  return (
    <div className="max-w-md mx-auto px-5 pt-6 pb-10 space-y-5">
      <div className="text-center space-y-2">
        <div className="text-4xl">🤝</div>
        <h2 className="text-xl font-extrabold text-neutral-800 leading-snug">
          {formatYmdKo(date)}에
          <br />
          먼저 신청하신 분이 있어요!
        </h2>
        <p className="text-sm text-neutral-400">
          같은 자리에서 함께 받으시면 좋아요. 합석하시겠어요?
        </p>
      </div>

      <div className="space-y-3">
        {orders.map((o) => (
          <div
            key={o.id}
            className="bg-white rounded-2xl border border-delivery/10 p-4 space-y-2.5"
          >
            <p className="text-sm font-bold text-neutral-700">
              🛵 {o.owner_masked ?? "먼저 신청하신 분"}님
              {o.member_count > 1 ? ` 외 ${o.member_count - 1}명` : ""} ·{" "}
              {o.time_slot}
            </p>
            <button
              type="button"
              onClick={() => onAccept(o)}
              disabled={sending}
              className="w-full py-3 rounded-full bg-delivery text-white text-sm font-extrabold active:scale-95 transition-transform disabled:opacity-60"
            >
              {sending ? "합석 중… 🛵" : "네, 합석할게요 🤝"}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-delivery-dark font-medium text-center">{error}</p>
      )}

      <button
        type="button"
        onClick={onDecline}
        className="w-full py-3.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-sm font-bold"
      >
        아니요, 따로 받을게요
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-xs text-neutral-400 underline underline-offset-2"
      >
        ← 날짜 다시 고르기
      </button>
    </div>
  );
}
