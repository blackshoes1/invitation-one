"use client";

import { Check } from "lucide-react";

const LABELS = ["성함", "연락처", "장소", "날짜", "시간", "요청"];

export default function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const pct = total > 1 ? (current / (total - 1)) * 100 : 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-delivery">
          주문서 작성 중… 🧾
        </span>
        <span className="text-xs text-neutral-400">
          {current + 1} / {total}
        </span>
      </div>

      {/* 진행 바 */}
      <div className="relative h-2 bg-delivery/15 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-delivery rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 도트 + 라벨 */}
      <div className="flex justify-between mt-2">
        {LABELS.slice(0, total).map((label, i) => {
          const doneStep = i < current;
          const active = i === current;
          return (
            <div key={label} className="flex flex-col items-center gap-1 w-8">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                  doneStep
                    ? "bg-delivery-mint text-white"
                    : active
                    ? "bg-delivery text-white"
                    : "bg-delivery/15 text-delivery/50"
                }`}
              >
                {doneStep ? <Check size={11} strokeWidth={3} /> : i + 1}
              </div>
              <span
                className={`text-[9px] ${
                  active ? "text-delivery font-bold" : "text-neutral-400"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
