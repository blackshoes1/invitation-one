"use client";

import type { ReactNode } from "react";

/**
 * 한 탭 안에서 세로 스와이프(스크롤 스냅)로 섹션을 넘기는 컨테이너.
 * 자식 섹션은 `snap-start min-h-full` 이어야 합니다.
 */
export default function SnapView({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto snap-y snap-mandatory hide-scrollbar overscroll-contain">
      {children}
    </div>
  );
}
