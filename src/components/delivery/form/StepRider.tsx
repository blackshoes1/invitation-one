"use client";

import { RIDERS, type Rider } from "./types";
import Q from "./Q";

export default function StepRider({
  rider,
  onSelect,
}: {
  rider: Rider | null;
  onSelect: (r: Rider) => void;
}) {
  return (
    <Q
      title="배송기사를 선택해주세요 🛵"
      sub="기사님 일정에 따라 조정될 수 있어요 😊"
    >
      <div className="grid grid-cols-3 gap-3">
        {RIDERS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onSelect(r.value)}
            aria-pressed={rider === r.value}
            className={`py-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
              rider === r.value
                ? "border-delivery bg-delivery text-white scale-105"
                : "border-delivery/20 bg-white text-neutral-500"
            }`}
          >
            <span className="text-3xl">{r.emoji}</span>
            <span className="text-sm font-bold">{r.value}</span>
            <span
              className={`text-[11px] ${
                rider === r.value ? "text-white/80" : "text-neutral-500"
              }`}
            >
              {r.desc}
            </span>
          </button>
        ))}
      </div>
    </Q>
  );
}
