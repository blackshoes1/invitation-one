"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { formatYmdKo, groom, bride } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";

export default function CompletePage({
  name,
  date,
  slot,
  location,
}: {
  name: string;
  date: string;
  slot: TimeSlot;
  location: string;
}) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-12 text-center">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 12 }}
        className="text-6xl mb-4"
      >
        🛵💨
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-2xl font-extrabold text-delivery"
      >
        주문 접수 완료!
      </motion.h1>
      <p className="mt-2 text-sm text-neutral-500">
        {name}님, 주문해주셔서 감사해요 🎉
      </p>

      {/* 영수증 카드 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-7 w-full max-w-xs bg-white rounded-2xl shadow-sm border border-delivery/10 overflow-hidden text-left"
      >
        <div className="bg-delivery px-5 py-3 text-white flex items-center justify-between">
          <span className="text-sm font-bold">배달 주문서</span>
          <span className="text-[11px] bg-white/25 px-2 py-0.5 rounded-full">
            배차 완료
          </span>
        </div>
        <div className="px-5 py-4 space-y-2.5 text-sm">
          <Row label="🏍️ 라이더" value={`${groom.name} · ${bride.name}`} />
          <Row label="📅 배달일" value={formatYmdKo(date)} />
          <Row label="⏰ 시간대" value={slot} />
          <Row label="📍 도착지" value={location} />
          <div className="border-t border-dashed border-neutral-200 my-2" />
          <Row label="예상 도착" value="곧 연락드릴게요!" highlight />
        </div>
      </motion.div>

      <p className="mt-6 text-xs text-neutral-400 leading-relaxed">
        신랑신부 라이더가 배차되었어요.
        <br />
        준비되는 대로 출발합니다 🛵
      </p>

      <Link
        href="/"
        className="mt-7 inline-block px-6 py-3 rounded-full bg-white border border-delivery/30 text-delivery text-sm font-bold"
      >
        💌 청첩장으로 돌아가기
      </Link>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-400">{label}</span>
      <span
        className={`text-right ${
          highlight ? "text-delivery font-bold" : "text-neutral-700 font-medium"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
