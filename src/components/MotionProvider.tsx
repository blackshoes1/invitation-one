"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * 애니메이션 라이브러리를 쓰는 화면(배달 신청·현장 체크인)에서 OS 의
 * "동작 줄이기" 설정을 존중하게 한다.
 *
 * CSS 애니메이션은 globals.css 의 prefers-reduced-motion 규칙이 처리하지만,
 * framer-motion 은 JS 로 스타일을 직접 쓰기 때문에 CSS 규칙이 닿지 않는다.
 * reducedMotion="user" 는 위치·크기·회전 같은 움직임만 끄고 페이드는 남겨,
 * 화면이 갑자기 튀어나오는 느낌 없이 멀미 유발 요소만 제거한다.
 *
 * 청첩장(/)은 애니메이션 라이브러리를 쓰지 않으므로 이 provider 가 필요 없다.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
