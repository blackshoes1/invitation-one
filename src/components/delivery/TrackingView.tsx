"use client";

import type { TrackingStage } from "@/lib/supabase";

const STEPS = [
  { emoji: "📦", label: "주문 접수", stage: "주문접수" },
  { emoji: "👨‍🍳", label: "준비 중", stage: "준비중" },
  { emoji: "🛵", label: "배송 출발", stage: "배송출발" },
  { emoji: "✅", label: "배송 완료", stage: "배송완료" },
] as const;

const INDEX: Record<TrackingStage, number> = {
  주문접수: 0,
  준비중: 1,
  배송출발: 2,
  배송완료: 3,
};

/** 배송 출발 단계에서 띄우는 두근거림 문구 */
const HINT: Partial<Record<TrackingStage, string>> = {
  준비중: "청첩장을 곱게 챙기고 있어요 🎁",
  배송출발: "🛵 신랑이 출발했어요! 곧 도착합니다",
  배송완료: "직접 전해드렸어요. 만나서 반가웠어요! 🎉",
};

export default function TrackingView({
  stage,
  canceled = false,
}: {
  stage: TrackingStage;
  canceled?: boolean;
}) {
  if (canceled) {
    return (
      <p className="text-center text-sm text-neutral-400 py-4">
        취소된 주문이에요 🗑️
      </p>
    );
  }
  const current = INDEX[stage];
  const hint = HINT[stage];

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="flex items-start">
        {STEPS.map((s, i) => {
          const reached = i <= current;
          const active = i === current;
          return (
            <div
              key={s.label}
              className="flex-1 flex flex-col items-center relative"
            >
              {i > 0 && (
                <span
                  className={`absolute right-1/2 top-5 w-full h-0.5 -z-0 ${
                    i <= current ? "bg-delivery" : "bg-delivery/15"
                  }`}
                />
              )}
              <div
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-transform ${
                  reached ? "bg-delivery text-white" : "bg-delivery/10"
                } ${active ? "ring-4 ring-delivery/20 scale-110" : ""}`}
              >
                {s.emoji}
              </div>
              <span
                className={`mt-1.5 text-[10px] text-center leading-tight ${
                  reached ? "text-delivery font-bold" : "text-neutral-400"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      {hint && (
        <p className="mt-3 text-center text-xs text-delivery font-medium">
          {hint}
        </p>
      )}
    </div>
  );
}
