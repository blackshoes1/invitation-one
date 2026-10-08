"use client";

import { useMemo, useState } from "react";
import type { Celebration } from "@/lib/supabase";
import { KOREA_PATHS } from "@/lib/koreaGeo";
import {
  LABEL_FONT,
  OTHER_KEY,
  VIEW,
  bubbleRadius,
  cardStats,
  groupByRegion,
  journeyKeys,
  layoutBubbles,
  nameList,
  placeLabel,
  topKeys,
  type Filter,
  type RegionGroup,
} from "@/lib/journeyInfographic";

const { w: VB_W, h: VB_H } = VIEW;

/** 상위 3개 지역 / 그 외 버블 색 (사이트 금색·세이지 톤) */
const GOLD = "#b89b6e";
const GREEN = "#5f7f56";
/** 내 지역 강조 링 — 금색 버블 위에서도 보이도록 한 단계 진한 금색 */
const MINE_RING = "#8a6a2f";

/** 지도 위에 올릴 버블 하나(겹침 해소 후 좌표) */
interface Bubble {
  group: RegionGroup;
  x: number;
  y: number;
  r: number;
  top: boolean;
}

/**
 * 마음이 도착한 곳 — 정적 인포그래픽
 * - 카드 1: 직접 만난 분 / 마음 보낸 분 / 닿은 지역 (앞의 둘은 필터 버튼)
 * - 카드 2: 시/도 단위 버블 지도 + 직접 만난 여정 점선
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

  const stats = useMemo(() => cardStats(celebrations), [celebrations]);

  const { bubbles, route } = useMemo(() => {
    const groups = groupByRegion(celebrations, filter);
    const max = groups.reduce((m, g) => Math.max(m, g.total), 0);
    const tops = new Set(topKeys(groups));
    const placed = layoutBubbles(
      groups.map((g) => ({ key: g.key, x: g.x, y: g.y, r: bubbleRadius(g.total, max) })),
    );
    const bubbles: Bubble[] = groups.map((group, i) => ({
      group,
      x: placed[i].x,
      y: placed[i].y,
      r: placed[i].r,
      top: tops.has(group.key),
    }));
    // 마음배송만 볼 때는 직접 만난 여정을 숨긴다
    const byKey = new Map(bubbles.map((b) => [b.group.key, b]));
    const route =
      filter === "마음배송"
        ? []
        : journeyKeys(celebrations).flatMap((k) => {
            const b = byKey.get(k);
            return b ? [{ x: b.x, y: b.y }] : [];
          });
    return { bubbles, route };
  }, [celebrations, filter]);

  if (celebrations.length === 0) {
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

  const toggleFilter = (f: Exclude<Filter, "all">) => {
    setFilter(filter === f ? "all" : f);
    // 필터로 가려진 버블의 말풍선이 나중에 되살아나지 않게 닫는다
    setOpen(null);
  };
  // 작은 버블이 위로 오도록 큰 것부터 그린다
  const drawOrder = [...bubbles].sort((a, b) => b.r - a.r);
  const items = bubbles.map((b) => ({ key: b.group.key, x: b.x, y: b.y, r: b.r }));
  const routeD = route.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  return (
    <div className="space-y-3">
      {/* 카드 1 — 마음이 도착한 곳 */}
      <section className="rounded-2xl border border-wedding-gold/15 bg-white/70 p-4">
        <h3 className="text-base font-bold text-neutral-800">마음이 도착한 곳</h3>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          카드를 누르면 지도에서 골라 볼 수 있어요
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatCard
            tone="gold"
            value={stats.directCount}
            unit="명"
            label="🛵 직접 만난 분"
            pressed={filter === "직접배달"}
            onClick={() => toggleFilter("직접배달")}
          />
          <StatCard
            tone="rose"
            value={stats.heartCount}
            unit="명"
            label="💌 마음 보낸 분"
            pressed={filter === "마음배송"}
            onClick={() => toggleFilter("마음배송")}
          />
          <StatCard tone="sage" value={stats.areaCount} unit="곳" label="📍 닿은 지역" />
        </div>
      </section>

      {/* 카드 2 — 전국으로 번진 마음 지도 */}
      <section className="rounded-2xl border border-wedding-gold/15 bg-white/70 p-4">
        <h3 className="text-base font-bold text-neutral-800">전국으로 번진 마음 지도</h3>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          원이 클수록 많은 분이 계신 지역이에요
        </p>

        {/* 바깥 래퍼는 클리핑 없음 — 말풍선이 지도 밖으로 나가도 안 잘리게 */}
        <div
          role="group"
          aria-label="전국 지역별 마음 지도. 원의 숫자는 그 지역에서 마음을 보낸 인원이에요"
          className="relative mx-auto mt-3 w-full max-w-[26rem]"
          style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
          onClick={() => setOpen(null)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(null)}
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
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

            {/* 직접 만난 여정 — 버블 중심을 날짜순으로 잇는 점선 */}
            {route.length >= 2 && (
              <path
                d={routeD}
                fill="none"
                stroke={GOLD}
                strokeWidth="0.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="1.5 1.4"
              />
            )}

            {drawOrder.map((b) => {
              const mine =
                highlightId != null &&
                [...b.group.direct, ...b.group.heart].some((e) => e.id === highlightId);
              return (
                <g key={b.group.key}>
                  {mine && (
                    <circle
                      cx={b.x}
                      cy={b.y}
                      r={b.r + 0.9}
                      fill="none"
                      stroke={MINE_RING}
                      strokeWidth="1.1"
                    />
                  )}
                  <circle
                    cx={b.x}
                    cy={b.y}
                    r={b.r}
                    fill={b.top ? GOLD : GREEN}
                    fillOpacity="0.88"
                    stroke="#ffffff"
                    strokeWidth="0.4"
                  />
                  <text
                    x={b.x}
                    y={b.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.min(5.2, Math.max(3.6, b.r * 1.1))}
                    fontWeight="700"
                    fill={b.top ? "#2f2418" : "#ffffff"}
                  >
                    {b.group.total}
                  </text>
                </g>
              );
            })}

            {/* 지역명 라벨 — 상위 3개·열린 버블·(지도 위에 자리가 없는) 해외·기타만 */}
            {drawOrder
              .filter((b) => b.top || b.group.key === open || b.group.key === OTHER_KEY)
              .map((b) => {
                const p = placeLabel({ key: b.group.key, x: b.x, y: b.y, r: b.r }, items, b.group.key);
                return (
                  <text
                    key={b.group.key}
                    x={p.x}
                    y={p.y}
                    textAnchor={p.anchor}
                    fontSize={LABEL_FONT}
                    fontWeight="700"
                    fill="#3b2d22"
                    stroke="#ffffff"
                    strokeWidth="0.9"
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {b.group.key}
                  </text>
                );
              })}
          </svg>

          {/* 누를 수 있는 버블 — 보이는 그림은 SVG, 여기는 키보드·터치용 투명 버튼 */}
          {bubbles.map((b) => {
            const left = (b.x / VB_W) * 100;
            const top = (b.y / VB_H) * 100;
            const isOpen = open === b.group.key;
            const { direct, heart, total, key } = b.group;
            const below = top < 58;
            const alignX =
              left < 26 ? "left-0" : left > 74 ? "right-0" : "left-1/2 -translate-x-1/2";
            const parts = [
              direct.length > 0 ? `🛵 직접 ${direct.length}명` : null,
              heart.length > 0 ? `💌 마음 ${heart.length}명` : null,
            ].filter(Boolean);
            const names = nameList([...direct, ...heart]);
            return (
              <div
                key={key}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${isOpen ? "z-20" : "z-10"}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${((b.r * 2) / VB_W) * 100}%`,
                  aspectRatio: "1",
                }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${key} ${total}명, ${[
                    direct.length > 0 ? `직접 ${direct.length}명` : null,
                    heart.length > 0 ? `마음 ${heart.length}명` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(isOpen ? null : key);
                  }}
                  // 작은 버블도 손가락으로 누르기 쉽게 터치 영역을 사방 8px 넓힌다
                  className="absolute inset-0 rounded-full before:absolute before:-inset-2 before:content-['']"
                />
                {isOpen && (
                  <span
                    className={`pointer-events-none absolute ${
                      below ? "top-full mt-1.5" : "bottom-full mb-1.5"
                    } ${alignX} w-max max-w-[12rem] rounded-lg border border-wedding-gold/20 bg-white px-2.5 py-1.5 text-left shadow-md`}
                  >
                    <span className="block text-[11px] font-bold text-sage-700">
                      {key} · {parts.join(" · ")}
                    </span>
                    {names.lines.map((line, i) => (
                      <span key={i} className="block text-[10px] text-neutral-500">
                        {line}
                      </span>
                    ))}
                    {names.more > 0 && (
                      <span className="block text-[10px] text-neutral-400">외 {names.more}명</span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
          <li className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GOLD }} />
            상위 3개 지역
          </li>
          <li className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} />
            그 외 지역
          </li>
          <li className="flex items-center gap-1">
            <svg width="18" height="4" aria-hidden="true">
              <line
                x1="1"
                y1="2"
                x2="17"
                y2="2"
                stroke={GOLD}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray="4 3"
              />
            </svg>
            직접 만난 여정
          </li>
        </ul>
        <p className="mt-1.5 text-center text-[11px] text-neutral-500">
          버블을 탭해보세요 · 정확한 주소는 공개하지 않아요
        </p>
      </section>
    </div>
  );
}

const TONES = {
  gold: { box: "bg-wedding-gold/10 border-wedding-gold/20", num: "text-[#8a6a2f]", on: "border-wedding-gold bg-wedding-gold/25 shadow-sm" },
  rose: { box: "bg-rose-50 border-rose-100", num: "text-rose-700", on: "border-rose-400 bg-rose-100 shadow-sm" },
  sage: { box: "bg-sage-50 border-sage-100", num: "text-sage-700", on: "" },
} as const;

/** 수치 카드 — onClick 이 있으면 필터 버튼(aria-pressed) 으로 동작 */
function StatCard({
  tone,
  value,
  unit,
  label,
  pressed,
  onClick,
}: {
  tone: keyof typeof TONES;
  value: number;
  unit: string;
  label: string;
  pressed?: boolean;
  onClick?: () => void;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <span className={`block text-[22px] font-bold leading-none tabular-nums ${t.num}`}>
        {value}
        <span className="text-sm">{unit}</span>
      </span>
      <span className="mt-1.5 block text-[11px] text-neutral-600">{label}</span>
    </>
  );
  // 눌렸을 때 테두리만 바뀌어 카드 크기가 흔들리지 않게 항상 2px
  const base = "rounded-xl border-2 px-1 py-3 text-center";
  if (!onClick) return <div className={`${base} ${t.box}`}>{body}</div>;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${base} ${pressed ? t.on : t.box}`}
    >
      {body}
    </button>
  );
}
