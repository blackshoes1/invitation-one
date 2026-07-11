"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const COLORS = ["#2AC1BC", "#FFD54A", "#FF8FA3", "#8ED081", "#7FB2FF", "#F5A623"];

/**
 * 가벼운 컨페티 (라이브러리 없이 · framer-motion). 마운트 시 1회 재생.
 * 부모는 relative 여야 함 (absolute 로 채움).
 */
export default function Confetti({ count = 26 }: { count?: number }) {
  // 클라이언트에서만 난수 생성 (SSR 하이드레이션 안전)
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      duration: 1.4 + Math.random() * 1.1,
      rotate: (Math.random() - 0.5) * 720,
      drift: (Math.random() - 0.5) * 80,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 6,
    }))
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -20, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: "115%", x: p.drift, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            background: p.color,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}
