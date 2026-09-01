"use client";

import { type TimeSlot, formatYmdKo, slotsForDate } from "@/lib/wedding";
import { SLOTS } from "./types";
import Q from "./Q";

export default function StepSlot({
  date,
  slot,
  onSelect,
}: {
  date: string | null;
  slot: TimeSlot | null;
  onSelect: (s: TimeSlot) => void;
}) {
  const avail = date ? slotsForDate(date) : [];
  const visible = SLOTS.filter((s) => avail.includes(s.value));
  return (
    <Q
      title={`${date ? formatYmdKo(date) : ""} 배송 희망 시간대를 골라주세요 ⏰`}
      sub={
        visible.length === 1
          ? "평일은 저녁 배달만 가능해요 🌙"
          : visible.some((s) => s.value === "점심")
            ? "평일은 점심·저녁에 찾아뵐 수 있어요 🍚🌙"
            : undefined
      }
    >
      <div
        className={`grid gap-3 ${
          visible.length === 1
            ? "grid-cols-1"
            : visible.length === 2
              ? "grid-cols-2"
              : "grid-cols-3"
        }`}
      >
        {visible.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onSelect(s.value)}
            aria-pressed={slot === s.value}
            className={`py-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
              slot === s.value
                ? "border-delivery bg-delivery text-white scale-105"
                : "border-delivery/20 bg-white text-neutral-500"
            }`}
          >
            <span className="text-3xl">{s.emoji}</span>
            <span className="text-sm font-bold">{s.value}</span>
          </button>
        ))}
      </div>
    </Q>
  );
}
