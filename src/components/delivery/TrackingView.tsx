"use client";

import { motion } from "framer-motion";
import type { TrackingStage } from "@/lib/supabase";
import Confetti from "@/components/Confetti";

const STEPS = [
  { emoji: "📦", label: "주문 접수", stage: "주문접수" },
  { emoji: "👨‍🍳", label: "준비 중", stage: "준비중" },
  { emoji: "🛵", label: "배송 출발", stage: "배송출발" },
  { emoji: "✅", label: "배송 완료", stage: "배송완료" },
] as const;

const INDEX: Record<TrackingStage, number> = {
  주문접수: 0,
  준비중: 1,
  배송출발: 2,
  배송완료: 3,
};

/** 배송 출발 단계에서 띄우는 두근거림 문구 */
const HINT: Partial<Record<TrackingStage, string>> = {
  준비중: "청첩장을 곱게 챙기고 있어요 🎁",
  // 배송기사가 신부/커플인 주문도 있으므로 라이더로 중립 표기
  배송출발: "🛵 라이더가 출발했어요! 곧 도착합니다",
  배송완료: "직접 전해드렸어요. 만나서 반가웠어요! 🎉",
};

export default function TrackingView({
  stage,
  canceled = false,
}: {
  stage: TrackingStage;
  canceled?: boolean;
}) {
  if (canceled) {
    return (
      <p className="text-center text-sm text-neutral-400 py-4">
        취소된 주문이에요 🗑️
      </p>
    );
  }
  const current = INDEX[stage];
  const hint = HINT[stage];

  return (
    <div className="relative w-full max-w-xs mx-auto">
      {stage === "배송완료" && <Confetti />}
      <div className="flex items-start">
        {STEPS.map((s, i) => {
          const reached = i <= current;
          const active = i === current;
          return (
            <div
              key={s.label}
              className="flex-1 flex flex-col items-center relative"
            >
              {i > 0 && (
                <span
                  className={`absolute right-1/2 top-5 w-full h-0.5 -z-0 ${
                    i <= current ? "bg-delivery" : "bg-delivery/15"
                  }`}
                />
              )}
              <div
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-transform ${
                  reached ? "bg-delivery text-white" : "bg-delivery/10"
                } ${active ? "ring-4 ring-delivery/20 scale-110" : ""}`}
              >
                {s.emoji}
              </div>
              <span
                className={`mt-1.5 text-[10px] text-center leading-tight ${
                  reached ? "text-delivery font-bold" : "text-neutral-400"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      {stage === "배송출발" && <ScooterEnRoute />}

      {hint && (
        <p className="mt-3 text-center text-xs text-delivery font-medium">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * 실시간 스쿠터 추적 연출 (DL-4)
 * 배송 출발 단계에서 🛵 가 목적지(🏡)를 향해 부지런히 달려가는 모습.
 * 도로(점선)가 왼쪽으로 흘러 '이동 중' 느낌 + 스쿠터 진동 + 매연 퍼프.
 */
function ScooterEnRoute() {
  return (
    <div className="relative mt-4 h-16 overflow-hidden rounded-xl bg-delivery/5">
      {/* 흐르는 도로 점선 (treadmill) */}
      <motion.div
        className="absolute bottom-4 left-0 h-0.5 w-[200%]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0 10px, transparent 10px 22px)",
        }}
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      />

      {/* 목적지 */}
      <motion.div
        className="absolute bottom-3 right-2 text-xl"
        animate={{ scale: [1, 1.12, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        🏡
      </motion.div>

      {/* 스쿠터 — 목적지로 점점 다가감(반복) */}
      <motion.div
        className="absolute bottom-3"
        initial={{ left: "-8%" }}
        animate={{ left: ["-8%", "76%"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* 매연 퍼프 */}
        <motion.span
          className="absolute -left-3 bottom-1 text-xs opacity-60"
          animate={{ opacity: [0, 0.6, 0], x: [-2, -8, -14] }}
          transition={{ duration: 0.7, repeat: Infinity, ease: "easeOut" }}
        >
          💨
        </motion.span>
        {/* 노면 진동 */}
        <motion.span
          className="inline-block text-2xl"
          animate={{ y: [0, -2, 0], rotate: [-2, 1, -2] }}
          transition={{ duration: 0.32, repeat: Infinity, ease: "easeInOut" }}
        >
          🛵
        </motion.span>
      </motion.div>
    </div>
  );
}
