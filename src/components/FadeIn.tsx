"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

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
 *
 * 구현: CSS transition + IntersectionObserver.
 * 청첩장(/)에서 이 한 컴포넌트가 거의 모든 섹션을 감싸고 있어, 여기서 애니메이션
 * 라이브러리를 걷어내는 것만으로 첫 화면 JS 가 크게 줄어든다. 모션 최소화 설정은
 * globals.css 의 prefers-reduced-motion 규칙이 transition 을 사실상 0 으로 만들어
 * 자동으로 존중된다(별도 분기 불필요).
 */

/**
 * 관찰자는 요소마다 만들지 않고 하나를 공유한다 — 섹션이 20개든 30개든
 * IntersectionObserver 인스턴스는 하나. (SSR 에서는 만들지 않는다)
 */
let observer: IntersectionObserver | null = null;

function reveal(el: Element) {
  el.classList.add("is-in");
  observer?.unobserve(el);
}

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
    },
    // 요소가 화면 안으로 80px 들어왔을 때 시작 — 등장이 화면 경계에서 잘리지 않게
    { rootMargin: "-80px" }
  );
  return observer;
}

export default function FadeIn({
  children,
  className,
  delay = 0,
  y = 28,
}: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = getObserver();
    // IntersectionObserver 미지원 브라우저에서는 감추지 않고 바로 보여준다
    if (!io) {
      el.classList.add("is-in");
      return;
    }
    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  return (
    <div
      ref={ref}
      className={className ? `reveal ${className}` : "reveal"}
      style={
        {
          "--reveal-y": `${y}px`,
          "--reveal-delay": `${delay}s`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
