"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import {
  groom,
  bride,
  venue,
  formatFullDate,
  formatTime,
} from "@/lib/wedding";

export default function Hero() {
  return (
    <section className="relative w-full min-h-[90vh] flex flex-col justify-between py-16 px-6 overflow-hidden bg-sage-50">
      <Image
        src="/pic/wedding_main.jpg"
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
        <div className="font-serif text-2xl font-light tracking-[0.15em] flex items-center justify-center gap-3 drop-shadow">
          <span>{groom.name}</span>
          <span className="text-sm text-wedding-gold/90">&</span>
          <span>{bride.name}</span>
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
