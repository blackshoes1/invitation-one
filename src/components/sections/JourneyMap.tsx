"use client";

import { useState } from "react";
import type { JourneyPin } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";

/** 문자열 → 안정적인 해시 (핀 위치를 매번 같게) */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 핀 좌표(%): 가장자리 여백을 두고 골고루 흩뿌림 */
function pos(pin: JourneyPin, i: number): { left: number; top: number } {
  const h = hash(pin.name + pin.date + i);
  const left = 12 + (h % 76); // 12~88%
  const top = 16 + ((h >> 7) % 64); // 16~80%
  return { left, top };
}

export default function JourneyMap({
  pins,
  highlightName,
}: {
  pins: JourneyPin[];
  highlightName?: string | null;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (pins.length === 0) {
    return (
      <div className="rounded-2xl bg-gradient-to-b from-sage-50 to-wedding-cream border border-wedding-gold/15 py-14 text-center">
        <div className="text-4xl mb-2">🗺️</div>
        <p className="text-sm text-neutral-400">
          아직 배송 여정이 시작되지 않았어요
          <br />첫 만남을 기다리고 있어요 🛵
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden border border-wedding-gold/15 bg-gradient-to-b from-sage-50 via-wedding-cream to-sage-50">
        {/* 장식용 길 */}
        <svg
          className="absolute inset-0 w-full h-full opacity-40"
          viewBox="0 0 100 125"
          preserveAspectRatio="none"
        >
          <path
            d="M8 12 C 40 30, 20 55, 55 65 S 60 100, 92 112"
            fill="none"
            stroke="#b7c4a8"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
        </svg>

        {pins.map((pin, i) => {
          const { left, top } = pos(pin, i);
          const mine = highlightName && pin.name === highlightName;
          return (
            <button
              key={`${pin.name}-${pin.date}-${i}`}
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              style={{ left: `${left}%`, top: `${top}%` }}
              className="absolute -translate-x-1/2 -translate-y-full"
            >
              <span
                className={`block leading-none transition-transform ${
                  mine ? "text-2xl drop-shadow scale-110" : "text-lg"
                }`}
              >
                {mine ? "📍" : "📌"}
              </span>
              {open === i && (
                <span className="absolute left-1/2 -translate-x-1/2 mt-1 w-max max-w-[9rem] bg-white shadow-md rounded-lg px-2.5 py-1.5 text-left z-10 border border-wedding-gold/20">
                  <span className="block text-[11px] font-bold text-sage-700">
                    {pin.name}님을 만났어요
                  </span>
                  <span className="block text-[10px] text-neutral-400">
                    {formatYmdKo(pin.date)}
                    {pin.area ? ` · ${pin.area}` : ""}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-neutral-400 text-center">
        핀을 탭하면 만난 날짜를 볼 수 있어요 · 정확한 주소는 공개하지 않아요
      </p>
    </div>
  );
}
