"use client";

import { useEffect, useState } from "react";
import { Type } from "lucide-react";

const KEY = "invitation-big-text";
const LARGE_SIZE = "118%";

function applyTextSize(big: boolean) {
  document.documentElement.style.fontSize = big ? LARGE_SIZE : "";
}

/**
 * 어르신 모드 (GX-3) — 큰 글씨 토글.
 * html 의 font-size 를 키워 rem 기반 텍스트를 일괄 확대. localStorage 로 기억.
 */
export default function TextSizeToggle() {
  // 첫 방문의 기본값은 큰 글씨. 서버 렌더와 첫 클라이언트 렌더도 같은 상태로 둔다.
  const [big, setBig] = useState(true);

  useEffect(() => {
    // 명시적으로 "작게"를 고른 기기만 작은 글씨를 유지한다.
    const saved = localStorage.getItem(KEY);
    const next = saved !== "0";
    // localStorage 복원 — SSR 과 초기 렌더 일치를 위해 마운트 후 반영
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBig(next);
    applyTextSize(next);

    return () => {
      // 다른 화면으로 클라이언트 이동할 때 청첩장 전용 크기가 남지 않게 한다.
      document.documentElement.style.fontSize = "";
    };
  }, []);

  const toggle = () => {
    const next = !big;
    setBig(next);
    applyTextSize(next);
    localStorage.setItem(KEY, next ? "1" : "0");
  };

  return (
    <>
      {/* localStorage 설정을 첫 paint 전에 반영해 글씨가 뒤늦게 커지는 현상을 막는다. */}
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.style.fontSize=localStorage.getItem(${JSON.stringify(
            KEY
          )})==="0"?"":${JSON.stringify(LARGE_SIZE)}}catch(_){document.documentElement.style.fontSize=${JSON.stringify(
            LARGE_SIZE
          )}}`,
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={big}
        aria-label={big ? "작은 글씨로 보기" : "큰 글씨로 보기"}
        className={`fixed top-3 right-3 z-40 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium shadow-sm backdrop-blur-sm border transition-colors ${
          big
            ? "bg-sage-700 text-white border-sage-700"
            : "bg-white/85 text-sage-700 border-wedding-gold/30"
        }`}
      >
        <Type size={12} />
        {big ? "작게" : "큰 글씨"}
      </button>
    </>
  );
}
