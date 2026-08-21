"use client";

import { type TimeSlot, slotsForDate } from "@/lib/wedding";
import DeliveryCalendar from "@/components/DeliveryCalendar";
import { type Mode, SLOTS } from "./types";

/* 일정 변경 (대표만) */
export default function ReschedulePanel({
  memberCount,
  booked,
  newDate,
  setNewDate,
  newSlot,
  setNewSlot,
  busy,
  error,
  setMode,
  setError,
  doReschedule,
}: {
  memberCount: number;
  booked: Set<string>;
  newDate: string | null;
  setNewDate: (d: string | null) => void;
  newSlot: TimeSlot | null;
  setNewSlot: (s: TimeSlot | null) => void;
  busy: boolean;
  error: string | null;
  setMode: (m: Mode) => void;
  setError: (e: string | null) => void;
  doReschedule: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-neutral-700">
        새 날짜를 골라주세요 📅{" "}
        <span className="text-xs text-neutral-400 font-normal">
          {memberCount > 1
            ? `(함께 받는 분들껜 문자로 여쭤봐요 — 동의하신 분만 함께 이동해요)`
            : `(바로 변경돼요)`}
        </span>
      </p>
      <DeliveryCalendar
        selected={newDate}
        booked={booked}
        onSelect={(d) => {
          setNewDate(d);
          if (newSlot && !slotsForDate(d).includes(newSlot)) setNewSlot(null);
        }}
        selectedClass="bg-delivery text-white font-bold"
      />
      {newDate && slotsForDate(newDate).length === 1 && (
        <p className="text-[11px] text-neutral-400 text-center">
          평일은 저녁 배달만 가능해요 🌙
        </p>
      )}
      <div
        className={`grid gap-3 ${
          newDate && slotsForDate(newDate).length === 1
            ? "grid-cols-1"
            : "grid-cols-3"
        }`}
      >
        {(newDate ? slotsForDate(newDate) : SLOTS).map((s) => (
          <button
            key={s}
            onClick={() => setNewSlot(s)}
            className={`py-3 rounded-xl border-2 text-sm font-bold ${
              newSlot === s
                ? "border-delivery bg-delivery text-white"
                : "border-delivery/20 bg-white text-neutral-500"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setMode("view");
            setError(null);
          }}
          className="px-5 py-3.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 font-bold"
        >
          이전
        </button>
        <button
          onClick={doReschedule}
          disabled={busy}
          className="flex-1 py-3.5 rounded-full bg-delivery text-white font-bold disabled:opacity-60"
        >
          {busy ? "변경 중…" : "변경하기"}
        </button>
      </div>
    </div>
  );
}
