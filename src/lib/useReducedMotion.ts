"use client";

import { useSyncExternalStore } from "react";

/**
 * OS 의 "동작 줄이기(prefers-reduced-motion)" 설정을 구독한다.
 *
 * CSS 로 끌 수 있는 애니메이션은 globals.css 의 미디어 쿼리가 이미 처리한다.
 * 이 훅은 CSS 로는 못 막는 것 — 자동으로 넘어가는 갤러리 슬라이드처럼
 * 타이머가 돌리는 움직임 — 을 끄기 위한 것이다.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

/** 서버에는 설정값이 없다 — 움직임이 있는 쪽으로 렌더한 뒤 클라이언트에서 교정 */
function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
