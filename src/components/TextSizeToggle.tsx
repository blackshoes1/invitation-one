"use client";

import { useEffect, useState } from "react";
import { Type } from "lucide-react";

const KEY = "invitation-big-text";

/**
 * 어르신 모드 (GX-3) — 큰 글씨 토글.
 * html 의 font-size 를 키워 rem 기반 텍스트를 일괄 확대. localStorage 로 기억.
 */
export default function TextSizeToggle() {
  const [big, setBig] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY) === "1";
    setBig(saved);
    document.documentElement.style.fontSize = saved ? "118%" : "";
  }, []);

  const toggle = () => {
    const next = !big;
    setBig(next);
    document.documentElement.style.fontSize = next ? "118%" : "";
    localStorage.setItem(KEY, next ? "1" : "0");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={big}
      aria-label="큰 글씨 보기"
      className={`fixed top-3 right-3 z-40 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium shadow-sm backdrop-blur-sm border transition-colors ${
        big
          ? "bg-sage-700 text-white border-sage-700"
          : "bg-white/85 text-sage-700 border-wedding-gold/30"
      }`}
    >
      <Type size={12} />
      {big ? "작게" : "큰 글씨"}
    </button>
  );
}
