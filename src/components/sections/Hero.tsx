"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  groom,
  bride,
  venue,
  formatFullDate,
  formatTime,
} from "@/lib/wedding";
import { getSiteSettings } from "@/lib/settings";

export default function Hero({ heroUrl }: { heroUrl?: string | null }) {
  // Admin 업로드 메인 사진 — 서버(page.tsx)가 미리 조회해 내려주면 그 값으로
  // 즉시 렌더 (정적 폴백 → 교체로 인한 이중 다운로드/플래시 방지).
  // prop 이 없을 때만 클라이언트 조회로 폴백.
  const [heroSrc, setHeroSrc] = useState(heroUrl ?? "/pic/wedding_main.jpg");
  useEffect(() => {
    if (heroUrl) return;
    getSiteSettings().then((s) => {
      if (s.hero_image) setHeroSrc(s.hero_image);
    });
  }, [heroUrl]);

  return (
    <section className="relative w-full min-h-[90vh] flex flex-col justify-between py-16 px-6 overflow-hidden bg-sage-50">
      <Image
        src={heroSrc}
        alt={`${groom.name} & ${bride.name} 웨딩 사진`}
        fill
        priority
        unoptimized
        className="object-cover z-0"
      />
      {/* 상·하단 스크림 — 흰 드레스 위 흰 글씨 대비 확보 */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/30 via-black/5 to-black/55" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="relative z-10 text-center text-white"
      >
        <p className="font-serif text-base font-light tracking-[0.25em] drop-shadow-sm">
          소중한 분들을 초대합니다
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.4 }}
        className="relative z-10 text-center text-white space-y-4"
      >
        {/* 마지막 글자 뒤 letter-spacing 끝여백을 음수 마진으로 제거해 광학적 가운데 정렬 */}
        <div className="font-serif text-2xl font-light tracking-[0.15em] flex items-center justify-center gap-3 drop-shadow">
          <span>{groom.name}</span>
          <span className="text-sm text-wedding-gold/90">&</span>
          <span className="-mr-[0.15em]">{bride.name}</span>
        </div>
        <div className="text-[12px] tracking-widest font-light space-y-1 drop-shadow">
          <p>
            {formatFullDate()} {formatTime()}
          </p>
          <p>{`서울 ${venue.name}`}</p>
        </div>
      </motion.div>
    </section>
  );
}
