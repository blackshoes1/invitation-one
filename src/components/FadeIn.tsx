"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  className?: string;
  /** 등장 지연 (초) */
  delay?: number;
  /** 시작 y 오프셋 (px) */
  y?: number;
}

/**
 * 스크롤 진입 시 한 번 부드럽게 떠오르는 래퍼.
 * 섹션 전반에서 동일한 모션 언어를 쓰기 위한 공용 컴포넌트.
 */
export default function FadeIn({
  children,
  className,
  delay = 0,
  y = 28,
}: FadeInProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
