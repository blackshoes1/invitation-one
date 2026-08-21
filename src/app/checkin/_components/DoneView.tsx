"use client";

import { motion } from "framer-motion";
import type { DoneInfo } from "./types";

export function DoneView({ done }: { done: DoneInfo }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-5"
    >
      <div className="text-4xl">🎉</div>
      <p className="text-base text-sage-700 font-medium">
        {done.already ? "이미 체크인되어 있어요" : "체크인이 완료되었습니다"}
      </p>
      <p className="text-sm text-neutral-500">
        {done.name && (
          <>
            <b className="text-sage-700">{done.name}</b>님
            {done.actual > 1 && ` 외 ${done.actual - 1}명`}
          </>
        )}
        {done.checkedInAt &&
          ` · ${new Date(done.checkedInAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })} 체크인`}
      </p>

      {/* 좌석 카드 — 스크린샷하기 쉽게, 테이블명을 가장 크게 (§13) */}
      <div className="border border-wedding-gold/25 rounded-xl bg-wedding-cream/50 px-4 py-6 space-y-2">
        {done.seat ? (
          <>
            {done.seat.zone && (
              <p className="text-sm text-neutral-500">{done.seat.zone}</p>
            )}
            <p className="text-3xl font-bold text-sage-700 tracking-wide">
              {done.seat.tableName}
            </p>
            {done.seat.floor && (
              <p className="text-sm text-neutral-500">{done.seat.floor}</p>
            )}
            {done.seat.locationNote && (
              <p className="text-sm text-neutral-500 leading-relaxed pt-1">
                {done.seat.locationNote}
              </p>
            )}
          </>
        ) : (
          <p className="text-base text-sage-700 leading-relaxed">
            좌석은 안내데스크에서 안내해 드릴게요.
            <br />
            <span className="text-sm text-neutral-500">
              이 화면을 직원에게 보여주세요.
            </span>
          </p>
        )}
      </div>

      <p className="text-sm text-neutral-400">와주셔서 감사합니다 💐</p>
    </motion.div>
  );
}
