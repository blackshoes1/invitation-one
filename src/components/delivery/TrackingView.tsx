"use client";

import type { DeliveryStatus } from "@/lib/supabase";

const STEPS = [
  { emoji: "📦", label: "청첩장 포장 중", status: "대기중" },
  { emoji: "🛵", label: "배송 준비 완료", status: "확정" },
  { emoji: "✅", label: "곧 출발해요", status: "완료" },
] as const;

const INDEX: Record<DeliveryStatus, number> = {
  대기중: 0,
  확정: 1,
  완료: 2,
  취소: -1,
};

export default function TrackingView({ status }: { status: DeliveryStatus }) {
  if (status === "취소") {
    return (
      <p className="text-center text-sm text-neutral-400 py-4">
        취소된 주문이에요 🗑️
      </p>
    );
  }
  const current = INDEX[status];

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const reached = i <= current;
          return (
            <div key={s.label} className="flex-1 flex flex-col items-center relative">
              {i > 0 && (
                <span
                  className={`absolute right-1/2 top-5 w-full h-0.5 -z-0 ${
                    i <= current ? "bg-delivery" : "bg-delivery/15"
                  }`}
                />
              )}
              <div
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                  reached ? "bg-delivery text-white" : "bg-delivery/10"
                }`}
              >
                {s.emoji}
              </div>
              <span
                className={`mt-1.5 text-[10px] text-center ${
                  reached ? "text-delivery font-bold" : "text-neutral-400"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
