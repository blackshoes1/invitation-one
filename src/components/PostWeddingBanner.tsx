"use client";

import { useEffect, useState } from "react";
import { daysUntil } from "@/lib/wedding";

/**
 * 예식 후 감사장 전환 (LC-1, 라이트) — 예식일이 지나면 상단에 감사 배너.
 * 클라이언트에서만 판정(하이드레이션 안전).
 */
export default function PostWeddingBanner() {
  const [past, setPast] = useState(false);
  useEffect(() => {
    // 날짜 판정은 클라이언트 시각 기준 (서버 TZ와의 하이드레이션 mismatch 방지)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPast(daysUntil() < 0);
  }, []);

  if (!past) return null;
  return (
    <div className="bg-sage-700 text-white text-center px-6 py-3">
      <p className="text-sm font-medium tracking-wide">
        와주셔서 진심으로 감사합니다 💐
      </p>
      <p className="text-[11px] text-white/80 mt-0.5">
        따뜻하게 축하해주신 마음, 오래 간직하겠습니다
      </p>
    </div>
  );
}
