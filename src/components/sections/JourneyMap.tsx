"use client";

import { useMemo, useState } from "react";
import type { Celebration } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";
import { SIDO_POS, sidoOf } from "@/lib/regions";

/** 문자열 → 안정적인 해시 (핀 위치를 매번 같게) */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** viewBox 세로 (Korea 실루엣 / 핀 좌표 공통) */
const VB_H = 125;

/**
 * 핀 좌표(%): 지역(시/도)의 실제 위치 + 소량 지터(같은 지역 겹침 방지).
 * 매칭 안 되면 지도 중앙 부근에 흩뿌림.
 */
function pinPos(area: string | null, seed: string): { left: number; top: number } {
  const sido = sidoOf(area);
  const base = sido ? SIDO_POS[sido] : { x: 45, y: 55 };
  const h = hash(seed + (area ?? ""));
  const jx = (h % 11) - 5; // -5 ~ +5 (x: 0~100)
  const jy = ((h >> 4) % 11) - 5; // -5 ~ +5 (y: 0~125)
  const x = Math.max(4, Math.min(96, base.x + jx));
  const y = Math.max(4, Math.min(VB_H - 4, base.y + jy));
  return { left: x, top: (y / VB_H) * 100 };
}

type Filter = "all" | "직접배달" | "마음배송";

interface Pin {
  key: string;
  kind: "직접배달" | "마음배송";
  area: string | null;
  /** 직접배달: 1명 / 마음배송: 같은 지역 묶음 */
  entries: Celebration[];
}

/**
 * 배송 여정 지도 — 🛵(직접 배달 완료) / 💌(마음 배송) 이원 핀
 * - 범례 겸 필터, 같은 지역 💌는 묶어서 "💌 N" 배지
 * - 본인 확인된 참여자의 핀은 강조
 */
export default function JourneyMap({
  celebrations,
  highlightId,
}: {
  celebrations: Celebration[];
  highlightId?: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const { pins, deliveryCount, heartCount } = useMemo(() => {
    const deliveries = celebrations.filter((c) => c.kind === "직접배달");
    const hearts = celebrations.filter((c) => c.kind === "마음배송");

    const pins: Pin[] = deliveries.map((c) => ({
      key: `d-${c.id}`,
      kind: "직접배달",
      area: c.area,
      entries: [c],
    }));

    // 같은 지역 마음배송은 핀 하나로 묶음
    const byArea = new Map<string, Celebration[]>();
    for (const h of hearts) {
      const a = h.area ?? "어딘가";
      byArea.set(a, [...(byArea.get(a) ?? []), h]);
    }
    for (const [area, entries] of byArea) {
      pins.push({ key: `h-${area}`, kind: "마음배송", area, entries });
    }

    return { pins, deliveryCount: deliveries.length, heartCount: hearts.length };
  }, [celebrations]);

  const visible = pins.filter((p) => filter === "all" || p.kind === filter);

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
      {/* 범례 + 필터 */}
      <div className="flex justify-center gap-2 mb-2">
        <LegendBtn
          active={filter === "직접배달"}
          onClick={() => setFilter(filter === "직접배달" ? "all" : "직접배달")}
        >
          🛵 직접 만난 분 {deliveryCount}
        </LegendBtn>
        <LegendBtn
          active={filter === "마음배송"}
          onClick={() => setFilter(filter === "마음배송" ? "all" : "마음배송")}
        >
          💌 마음 보낸 분 {heartCount}
        </LegendBtn>
      </div>

      <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden border border-wedding-gold/15 bg-gradient-to-b from-sky-50 via-wedding-cream/40 to-sky-50">
        {/* 대한민국 실루엣 지도 (본토 + 제주) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 125"
          preserveAspectRatio="none"
        >
          <path
            d="M28 16 C34 12, 46 11, 56 13 C62 14, 66 18, 70 20
               C76 24, 80 30, 80 38 C80 44, 85 50, 86 57
               C87 63, 82 70, 78 74 C73 79, 64 80, 56 82
               C48 84, 40 88, 32 88 C25 88, 20 84, 20 78
               C20 72, 24 68, 22 62 C20 56, 16 52, 20 46
               C22 41, 17 36, 21 30 C23 24, 22 19, 28 16 Z"
            fill="#eef2e9"
            stroke="#cdd8bf"
            strokeWidth="0.7"
          />
          <ellipse
            cx="24"
            cy="115"
            rx="8"
            ry="4.5"
            fill="#eef2e9"
            stroke="#cdd8bf"
            strokeWidth="0.7"
          />
        </svg>

        {visible.map((pin) => {
          const { left, top } = pinPos(pin.area, pin.key);
          const mine =
            highlightId != null && pin.entries.some((e) => e.id === highlightId);
          const isHeart = pin.kind === "마음배송";
          const count = pin.entries.length;
          const isOpen = open === pin.key;
          return (
            <button
              key={pin.key}
              type="button"
              onClick={() => setOpen(isOpen ? null : pin.key)}
              style={{ left: `${left}%`, top: `${top}%` }}
              className="absolute -translate-x-1/2 -translate-y-full"
            >
              <span className="relative block">
                <span
                  className={`block leading-none transition-transform ${
                    mine ? "text-2xl drop-shadow scale-110" : "text-lg"
                  }`}
                >
                  {isHeart ? "💌" : "🛵"}
                </span>
                {isHeart && count > 1 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-wedding-gold text-white text-[9px] font-bold flex items-center justify-center">
                    {count}
                  </span>
                )}
              </span>
              {isOpen && (
                <span className="absolute left-1/2 -translate-x-1/2 mt-1 w-max max-w-[11rem] bg-white shadow-md rounded-lg px-2.5 py-1.5 text-left z-10 border border-wedding-gold/20">
                  {isHeart ? (
                    <>
                      <span className="block text-[11px] font-bold text-sage-700">
                        {pin.area}에서 도착한 마음 💌
                      </span>
                      {pin.entries.map((e) => (
                        <span key={e.id} className="block text-[10px] text-neutral-400">
                          {e.stamp ?? "💌"} {e.name}님
                        </span>
                      ))}
                    </>
                  ) : (
                    <>
                      <span className="block text-[11px] font-bold text-sage-700">
                        {pin.entries[0].name}님을 만났어요 🛵
                      </span>
                      <span className="block text-[10px] text-neutral-400">
                        {pin.entries[0].date ? formatYmdKo(pin.entries[0].date) : ""}
                        {pin.area ? ` · ${pin.area}` : ""}
                      </span>
                    </>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-neutral-400 text-center">
        핀을 탭해보세요 · 정확한 주소는 공개하지 않아요
      </p>
    </div>
  );
}

function LegendBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[11px] rounded-full border transition-colors ${
        active
          ? "bg-sage-600 text-white border-sage-600 font-bold"
          : "bg-white text-neutral-500 border-wedding-gold/20"
      }`}
    >
      {children}
    </button>
  );
}
