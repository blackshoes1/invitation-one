"use client";

import { useEffect, useMemo, useState } from "react";
import type { Celebration } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";
import { sidoOf } from "@/lib/regions";
import { KOREA_VIEW, KOREA_PATHS, SIDO_POS, REGION_POS } from "@/lib/koreaGeo";

/** 문자열 → 안정적인 해시 (핀 위치를 매번 같게) */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const { w: VB_W, h: VB_H } = KOREA_VIEW;
/** 해외/미매칭 마음배송 — 지도 왼쪽 바다에 모아 표시 */
const OVERSEAS_POS = { x: 12, y: VB_H - 18 };

/**
 * 시/군/구 단독명 → 좌표. 전국에서 이름이 유일한 것만 수록 ("동구"처럼
 * 여러 시/도에 있는 이름은 제외). "경주시" → "경주" 축약형도 등록해
 * 자유입력 배송지("경주")의 토큰 매칭에 사용.
 */
const SUB_POS: Record<string, { x: number; y: number }> = (() => {
  const cand: Record<string, { x: number; y: number }[]> = {};
  const put = (name: string, pos: { x: number; y: number }) =>
    (cand[name] ??= []).push(pos);
  for (const [full, pos] of Object.entries(REGION_POS)) {
    const sub = full.split(/\s+/)[1];
    if (!sub) continue;
    put(sub, pos);
    const short = sub.replace(/(시|군|구)$/, "");
    // 축약형이 시/도명과 겹치면 제외 (예: "광주시"→"광주"는 광역시와 충돌)
    if (short && short !== sub && !(short in SIDO_POS)) put(short, pos);
  }
  const out: Record<string, { x: number; y: number }> = {};
  for (const [k, v] of Object.entries(cand)) if (v.length === 1) out[k] = v[0];
  return out;
})();

/** 자유입력 지역/배송지 문자열에서 좌표 탐색 — 토큰별로 시/도 → 유일 시/군/구 순 */
function lookupLoose(key: string): { x: number; y: number } | null {
  for (const tok of key.split(/\s+/)) {
    // "서울시"·"부산광역시" 류 접미사 정규화
    const t = tok.replace(/(특별시|광역시|특별자치시|특별자치도|도|시)$/, "");
    if (SIDO_POS[tok]) return SIDO_POS[tok];
    if (t && SIDO_POS[t]) return SIDO_POS[t];
    if (SUB_POS[tok]) return SUB_POS[tok];
    if (t && SUB_POS[t]) return SUB_POS[t];
  }
  return null;
}

/**
 * 핀 좌표(viewBox 단위): 지역(시/도)의 실제 지도 위치 + 소량 지터(같은 지역 겹침 방지).
 */
function pinXY(area: string | null, seed: string): { x: number; y: number } {
  // 전체 지역명(예: "서울 강동구", "충남 서산시")이 있으면 정확 좌표 우선,
  // 다음 시/도 중심, 마지막으로 자유입력 배송지("경주")의 토큰 탐색으로 폴백
  const key = area?.trim() ?? "";
  const exact = REGION_POS[key];
  const sido = sidoOf(area);
  const base = exact ?? (sido ? SIDO_POS[sido] : lookupLoose(key) ?? OVERSEAS_POS);
  // 정확한 좌표가 있으면 지터 최소(겹침만 분산), 시/도 폴백이면 살짝 더
  const spread = exact ? 0.25 : 0.5;
  const h = hash(seed + (area ?? ""));
  const jx = ((h % 7) - 3) * spread;
  const jy = (((h >> 3) % 7) - 3) * spread;
  const x = Math.max(3, Math.min(VB_W - 3, base.x + jx));
  const y = Math.max(3, Math.min(VB_H - 3, base.y + jy));
  return { x, y };
}

/** 핀 좌표(%) — pinXY 를 컨테이너 백분율로 변환 */
function pinPos(area: string | null, seed: string): { left: number; top: number } {
  const { x, y } = pinXY(area, seed);
  return { left: (x / VB_W) * 100, top: (y / VB_H) * 100 };
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
  /** 여정 애니메이션 재생 트리거 (키가 바뀌면 리마운트되어 다시 재생) */
  const [playKey, setPlayKey] = useState(0);

  // 직접배달 완료 지점을 날짜순으로 이어 스쿠터 여정 경로 구성 (MP-3)
  const route = useMemo(() => {
    const deliveries = celebrations
      .filter((c) => c.kind === "직접배달")
      .sort((a, b) => {
        const da = a.date ?? "";
        const db = b.date ?? "";
        if (da !== db) return da < db ? -1 : 1;
        return a.created_at < b.created_at ? -1 : 1;
      });
    return deliveries.map((c) => pinXY(c.area, `d-${c.id}`));
  }, [celebrations]);

  const showJourney = route.length >= 2 && filter !== "마음배송";

  // 데이터가 준비되면 최초 1회 자동 재생
  useEffect(() => {
    // 데이터가 준비된 시점에 1회만 자동재생 시작 (외부 데이터 → 상태 동기화)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (route.length >= 2) setPlayKey((k) => (k === 0 ? 1 : k));
  }, [route.length]);

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
        <p className="text-sm text-neutral-500">
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

      {route.length >= 2 && (
        <div className="flex justify-center mb-2">
          <button
            type="button"
            onClick={() => {
              if (filter === "마음배송") setFilter("all");
              setPlayKey((k) => k + 1);
            }}
            className="px-3 py-1.5 text-[11px] rounded-full border border-delivery/25 bg-white text-delivery font-bold hover:bg-delivery/5 transition-colors"
          >
            🛵 여정 따라가기
          </button>
        </div>
      )}

      {/* 바깥 래퍼는 클리핑 없음 — 핀 말풍선이 지도 밖으로 나가도 안 잘리게 */}
      <div className="relative w-full" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
        {/* 지도 자체만 둥근 모서리로 클리핑 */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden border border-wedding-gold/15 bg-gradient-to-b from-sky-50 via-wedding-cream/30 to-sky-50">
          {/* 정밀 대한민국 지도 (실제 지리 데이터 · 시/도 경계 포함) */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {KOREA_PATHS.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="#eef2e9"
                stroke="#c3d0b4"
                strokeWidth="0.35"
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {/* 여정 애니메이션 (MP-3) — 스쿠터가 배송 지점을 잇는다 */}
          {showJourney && playKey > 0 && (
            <JourneyAnimation key={playKey} points={route} />
          )}
        </div>

        {visible.map((pin) => {
          const { left, top } = pinPos(pin.area, pin.key);
          const mine =
            highlightId != null && pin.entries.some((e) => e.id === highlightId);
          const isHeart = pin.kind === "마음배송";
          const count = pin.entries.length;
          const isOpen = open === pin.key;
          // 말풍선 방향: 아래쪽 핀은 위로, 좌/우 가장자리 핀은 안쪽으로 정렬해 짤림 방지
          const below = top < 58;
          const alignX =
            left < 26
              ? "left-0"
              : left > 74
              ? "right-0"
              : "left-1/2 -translate-x-1/2";
          return (
            <button
              key={pin.key}
              type="button"
              onClick={() => setOpen(isOpen ? null : pin.key)}
              style={{ left: `${left}%`, top: `${top}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
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
                <span
                  className={`absolute ${
                    below ? "top-full mt-1" : "bottom-full mb-1"
                  } ${alignX} w-max max-w-[11rem] bg-white shadow-md rounded-lg px-2.5 py-1.5 text-left z-20 border border-wedding-gold/20`}
                >
                  {isHeart ? (
                    <>
                      <span className="block text-[11px] font-bold text-sage-700">
                        {pin.area}에서 도착한 마음 💌
                      </span>
                      {pin.entries.map((e) => (
                        <span key={e.id} className="block text-[10px] text-neutral-500">
                          {e.stamp ?? "💌"} {e.name}님
                        </span>
                      ))}
                    </>
                  ) : (
                    <>
                      <span className="block text-[11px] font-bold text-sage-700">
                        {pin.entries[0].name}님을 만났어요 🛵
                      </span>
                      <span className="block text-[10px] text-neutral-500">
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
      <p className="mt-2 text-[11px] text-neutral-500 text-center">
        핀을 탭해보세요 · 정확한 주소는 공개하지 않아요
      </p>
    </div>
  );
}

/**
 * 스쿠터 여정 애니메이션 (MP-3)
 * - 배송 지점을 잇는 선이 그려지고, 🛵 가 그 선을 따라 달림.
 * - 선(stroke-dashoffset) 과 스쿠터(animateMotion) 모두 등속 → 스쿠터 끝이 그려지는 선의 앞머리.
 */
function JourneyAnimation({ points }: { points: { x: number; y: number }[] }) {
  const d = points
    .map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const len = useMemo(() => {
    let l = 0;
    for (let i = 1; i < points.length; i++) {
      l += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return l;
  }, [points]);
  const dur = Math.min(9, 2.5 + points.length * 0.7);
  const last = points[points.length - 1];

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <style>{`@keyframes mp3draw{to{stroke-dashoffset:0}}`}</style>
      {/* 여정 선 */}
      <path
        d={d}
        fill="none"
        stroke="#c8a96a"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len}
        style={{ animation: `mp3draw ${dur}s linear forwards` }}
      />
      {/* 출발점 */}
      <circle cx={points[0].x} cy={points[0].y} r="1.1" fill="#8aa06e" />
      {/* 도착점 (선이 다 그려진 뒤 표시) */}
      <circle cx={last.x} cy={last.y} r="1.1" fill="#c8a96a" opacity="0">
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          begin={`${dur - 0.4}s`}
          dur="0.4s"
          fill="freeze"
        />
      </circle>
      {/* 스쿠터 */}
      <text fontSize="6" textAnchor="middle" dominantBaseline="central">
        🛵
        <animateMotion dur={`${dur}s`} path={d} rotate="0" fill="freeze" />
      </text>
    </svg>
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
