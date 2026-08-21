"use client";

import Q from "./Q";

export default function StepLocation({
  location,
  onLocationChange,
  onNext,
}: {
  location: string;
  onLocationChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <Q title="배송지를 입력해주세요 📍" sub="전국 어디든 직접 배달합니다 🛵 정확할수록 빨리 찾아가요">
      <input
        autoFocus
        value={location}
        onChange={(e) => onLocationChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onNext()}
        enterKeyHint="done"
        placeholder="예: 강남역 2번 출구, 회사 앞"
        className="dform-input"
      />
    </Q>
  );
}
