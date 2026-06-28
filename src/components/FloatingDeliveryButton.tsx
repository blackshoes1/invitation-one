"use client";

import Link from "next/link";
import { motion } from "framer-motion";

/** 청첩장 화면 우하단 플로팅 버튼 → 배달 서비스로 이동 */
export default function FloatingDeliveryButton() {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1.2, type: "spring", stiffness: 200, damping: 14 }}
      className="absolute right-4 bottom-[76px] z-20"
    >
      <Link
        href="/delivery"
        className="flex items-center gap-1.5 pl-3 pr-4 py-3 rounded-full bg-delivery text-white text-xs font-bold shadow-lg active:scale-95 transition-transform"
      >
        <span className="text-base">🛵</span> 청첩장 받기
      </Link>
    </motion.div>
  );
}
