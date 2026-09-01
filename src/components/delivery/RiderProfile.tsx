"use client";

import { motion } from "framer-motion";
import { groom, bride } from "@/lib/wedding";
import BikeIcon from "@/components/delivery/BikeIcon";

/**
 * 라이더 프로필 (DL-2) — 배민 프로필식 위트.
 * 신랑·신부를 "청첩장 전문 라이더"로 소개하는 재미 카드.
 * deliveredCount = 지금까지 직접배달 신청 "인원" (남은 자리와 같은 기준).
 *   ※ 주문 건수가 아니다 — 한 주문에 여러 명이 합류하면 인원이 더 많다.
 */
export default function RiderProfile({
  deliveredCount,
}: {
  /** 미정(로딩 중)이면 숫자 대신 '…' — 0명 이 먼저 보였다가 바뀌지 않도록 */
  deliveredCount?: number;
}) {
  // 위트용 지표 — 실제 신청 수(deliveredCount)만 데이터 기반, 나머지는 연출
  const rating = "4.99";
  const stats: { label: string; value: string }[] = [
    // 값이 인원수이므로 단위도 '명' (건으로 쓰면 주문 건수로 오해 — 남은 자리와 같은 기준)
    {
      label: "누적 배달",
      value: deliveredCount == null ? "…" : `${deliveredCount}명`,
    },
    { label: "재주문률", value: "💯%" },
    { label: "친절 배달", value: "100%" },
  ];
  const tags = ["🕒 정시 도착", "😊 친절왕", "🎁 정성 포장", "🛵 안전 운전"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-md mx-auto px-5 pb-4"
    >
      <div className="rounded-2xl border border-delivery/10 bg-white overflow-hidden shadow-sm">
        {/* 헤더 */}
        <div className="flex items-center gap-3 p-4">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-full bg-delivery/10 flex items-center justify-center">
              <BikeIcon className="w-8 h-8 text-delivery" />
            </div>
            <span className="absolute -bottom-1 -right-1 text-[10px] bg-delivery-yellow text-delivery-dark font-bold px-1.5 py-0.5 rounded-full border border-white">
              LV.∞
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-neutral-800 flex items-center gap-1.5">
              {groom.name} · {bride.name}
              <span className="text-[10px] bg-delivery/10 text-delivery font-bold px-1.5 py-0.5 rounded-full">
                청첩장 라이더
              </span>
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              <span className="text-amber-400">⭐ {rating}</span>
              <span className="text-neutral-300"> · </span>
              평생 단 한 번의 배달을 준비했어요
            </p>
          </div>
        </div>

        {/* 지표 */}
        <div className="grid grid-cols-3 divide-x divide-delivery/5 border-t border-delivery/5 bg-delivery/[0.02]">
          {stats.map((s) => (
            <div key={s.label} className="py-3 text-center">
              <p className="text-sm font-bold text-delivery">{s.value}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 태그 */}
        <div className="flex flex-wrap gap-1.5 p-3 border-t border-delivery/5">
          {tags.map((t) => (
            <span
              key={t}
              className="text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-100 px-2 py-1 rounded-full"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
